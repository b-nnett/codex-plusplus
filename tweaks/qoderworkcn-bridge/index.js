const PROVIDER_ID = "qoderworkcn-bridge";
const BRIDGE_MODEL = "qoderworkcn-codex";
const QODER_MODEL = "qmodel";
const DEFAULT_PORT = 38441;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 7200000;
const DEFAULT_REASONING_EFFORT = "low";
const DEFAULT_PROFILE_DIRNAME = "codex-home";

const DEFAULT_MODEL_START = "# BEGIN CODEX++ MANAGED QODERWORKCN DEFAULT MODEL";
const DEFAULT_MODEL_END = "# END CODEX++ MANAGED QODERWORKCN DEFAULT MODEL";
const PROVIDER_START = "# BEGIN CODEX++ MANAGED QODERWORKCN RESPONSES BRIDGE";
const PROVIDER_END = "# END CODEX++ MANAGED QODERWORKCN RESPONSES BRIDGE";
const ROOT_MODEL_KEYS = [
  "model",
  "model_provider",
  "model_reasoning_effort",
  "model_catalog_json",
];

let bridgeServer = null;
let bridgeStatus = { state: "stopped" };
let startToken = 0;
let settingsHandle = null;
let healthTimer = null;

module.exports = {
  start(api) {
    if (api.process === "main") {
      startMain(api);
      return;
    }
    startRenderer(api);
  },
  stop() {
    startToken += 1;
    stopBridge();
    if (settingsHandle) {
      settingsHandle.unregister();
      settingsHandle = null;
    }
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  },
  __private: {
    buildManagedCodexConfig,
    buildProfileConfig,
    resolveBridgePort,
    resolveCodexHome,
    stripManagedBlock,
    stripTopLevelKeys,
    stripTable,
  },
};

function startMain(api) {
  const { pathToFileURL } = require("node:url");
  const token = ++startToken;
  const paths = bridgePaths();
  const env = bridgeEnv(api);

  bridgeStatus = {
    state: "starting",
    endpoint: endpointFromEnv(env),
    model: BRIDGE_MODEL,
    qoderModel: env.QODER_MODEL,
    catalogPath: paths.catalogPath,
  };

  void import(`${pathToFileURL(paths.serverPath).href}?reload=${Date.now()}`)
    .then(async (mod) => {
      if (token !== startToken) return;

      const config = mod.loadConfig(env);
      const configResult = ensureCodexConfig(config, paths.catalogPath, api);
      const server = mod.createServer({ config });

      try {
        await listen(server, config.host, config.port);
      } catch (error) {
        if (error && error.code === "EADDRINUSE") {
          const health = await fetchHealth(config.host, config.port);
          if (health && health.bridge === "qoderworkcn-responses-bridge") {
            bridgeStatus = statusFromConfig("running-external", config, paths, configResult, health);
            api.log.info(
              `QoderWork CN bridge already listening at ${bridgeStatus.endpoint}; using existing server.`,
            );
            return;
          }
        }
        throw error;
      }

      if (token !== startToken) {
        server.close();
        return;
      }

      bridgeServer = server;
      bridgeStatus = statusFromConfig("running", config, paths, configResult);
      api.log.info(
        `QoderWork CN bridge listening at ${bridgeStatus.endpoint} with ${config.qoderModel}.`,
      );
      if (configResult.changed) {
        api.log.info(`Updated Codex config at ${configResult.configPath}.`);
      }
    })
    .catch((error) => {
      bridgeStatus = {
        ...bridgeStatus,
        state: "failed",
        error: error && error.message ? error.message : String(error),
      };
      api.log.error("QoderWork CN bridge failed to start:", error);
    });
}

function startRenderer(api) {
  if (!api.settings) return;

  settingsHandle = api.settings.registerPage({
    id: "main",
    title: "QoderWork CN Bridge",
    description: "Local Responses bridge status.",
    render(root) {
      root.innerHTML = "";

      const page = document.createElement("div");
      page.className = "flex max-w-3xl flex-col gap-4";

      const header = document.createElement("div");
      header.className = "flex h-toolbar items-center justify-between gap-3";

      const titleWrap = document.createElement("div");
      titleWrap.className = "flex min-w-0 flex-col gap-1";
      const title = document.createElement("div");
      title.className = "text-base font-medium text-token-text-primary";
      title.textContent = "QoderWork CN";
      const subtitle = document.createElement("div");
      subtitle.className = "text-sm text-token-text-secondary";
      subtitle.textContent = "qmodel / Qwen3.7-Max";
      titleWrap.append(title, subtitle);

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className =
        "border-token-border bg-token-foreground/5 hover:bg-token-foreground/10 " +
        "h-token-button-composer rounded-md border px-3 text-sm text-token-text-primary cursor-interaction";
      refresh.textContent = "Refresh";

      header.append(titleWrap, refresh);

      const card = document.createElement("div");
      card.className =
        "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
      card.style.backgroundColor = "var(--color-background-panel, var(--color-token-bg-fog))";

      const statusValue = textValue("Checking");
      const cliValue = textValue("Checking");
      const rendererPort = resolveBridgePort(api);
      const endpointValue = textValue(`http://${DEFAULT_HOST}:${rendererPort}/v1`);
      const modelValue = textValue(BRIDGE_MODEL);
      const laneValue = textValue(QODER_MODEL);
      const timeoutValue = textValue(formatDuration(DEFAULT_TIMEOUT_MS));
      const toolsValue = textValue("Checking");
      const profileValue = textValue("Codex++ isolated profile");

      card.append(
        settingRow("Bridge", "Local HTTP health", statusValue),
        settingRow("Endpoint", "OpenAI Responses-compatible base URL", endpointValue),
        settingRow("Codex model", "Model id used by Codex", modelValue),
        settingRow("Qoder lane", "QoderWork CN internal model selector", laneValue),
        settingRow("Timeout", "Maximum time for one Qoder CLI request", timeoutValue),
        settingRow("Tool bridge", "Structured Responses tool-call passthrough", toolsValue),
        settingRow("Profile", "Managed Codex home for this bridge", profileValue),
        settingRow("Qoder CLI", "Detected by the bridge process", cliValue),
      );

      const usageCard = document.createElement("div");
      usageCard.className =
        "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
      usageCard.style.backgroundColor = "var(--color-background-panel, var(--color-token-bg-fog))";

      const todayTokensValue = textValue("0 tokens");
      const monthTokensValue = textValue("0 tokens");
      const requestValue = textValue("0 requests");
      const costValue = textValue("Pricing unset");
      const ledgerValue = textValue("Checking");
      const usageVisual = createUsageVisual();

      usageCard.append(
        usageVisual.root,
        settingRow("CodexBar today", "QoderWork bridge usage recorded today", todayTokensValue),
        settingRow("CodexBar 30d", "CodexBar-style rolling usage summary", monthTokensValue),
        settingRow("Requests", "Completed Responses calls in the usage ledger", requestValue),
        settingRow("Estimated cost", "Only shown when QODERWORKCN_*_USD_PER_1M is set", costValue),
        settingRow("Ledger", "JSONL source for downstream CodexBar-style tools", ledgerValue),
      );

      page.append(header, card, usageCard);
      root.append(page);

      const updateHealth = async () => {
        refresh.disabled = true;
        statusValue.textContent = "Checking";
        try {
          const response = await fetch(`http://${DEFAULT_HOST}:${rendererPort}/health`, {
            cache: "no-store",
          });
          const body = await response.json();
          if (!response.ok || !body.ok) {
            throw new Error(body && body.error ? body.error.message : "Health check failed");
          }
          statusValue.textContent = "Ready";
          cliValue.textContent = body.qoderCliExists ? "Found" : "Missing";
          modelValue.textContent = body.model || BRIDGE_MODEL;
          laneValue.textContent = body.qoderModel || QODER_MODEL;
          timeoutValue.textContent = formatDuration(body.timeoutMs ?? DEFAULT_TIMEOUT_MS);
          toolsValue.textContent = body.toolBridge
            ? `${body.toolBridge}${body.supportsParallelToolCalls ? " / parallel" : ""}`
            : "Unavailable";
          profileValue.textContent = body.codexHome || "Codex++ isolated profile";
          ledgerValue.textContent = body.usageLedgerPath || "Usage ledger pending";

          const usageResponse = await fetch(`http://${DEFAULT_HOST}:${rendererPort}/usage?days=30`, {
            cache: "no-store",
          });
          const usage = await usageResponse.json();
          if (!usageResponse.ok) {
            throw new Error(usage && usage.error ? usage.error.message : "Usage check failed");
          }
          todayTokensValue.textContent = formatTokens(usage.sessionTokens || 0);
          monthTokensValue.textContent = formatTokens(usage.last30DaysTokens || 0);
          requestValue.textContent = `${usage.totals && usage.totals.requestCount ? usage.totals.requestCount : 0} requests`;
          costValue.textContent = usage.pricingConfigured
            ? formatUSD(usage.last30DaysCostUSD)
            : "Pricing unset";
          ledgerValue.title = usage.ledgerPath || "";
          renderUsageVisual(usageVisual, usage);
        } catch (error) {
          statusValue.textContent = "Unavailable";
          cliValue.textContent = "Unknown";
          toolsValue.textContent = "Unavailable";
          todayTokensValue.textContent = "Unavailable";
          monthTokensValue.textContent = "Unavailable";
          requestValue.textContent = "Unavailable";
          costValue.textContent = "Unavailable";
          renderUsageUnavailable(usageVisual);
        } finally {
          refresh.disabled = false;
        }
      };

      refresh.addEventListener("click", updateHealth);
      void updateHealth();
      if (healthTimer) clearInterval(healthTimer);
      healthTimer = setInterval(updateHealth, 10000);

      return () => {
        refresh.removeEventListener("click", updateHealth);
        if (healthTimer) {
          clearInterval(healthTimer);
          healthTimer = null;
        }
      };
    },
  });
}

function textValue(text) {
  const value = document.createElement("div");
  value.className = "max-w-md truncate text-right text-sm text-token-text-primary";
  value.textContent = text;
  return value;
}

function createUsageVisual() {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-3 p-3";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-3";

  const title = document.createElement("div");
  title.className = "text-sm font-medium text-token-text-primary";
  title.textContent = "Usage visualization";

  const updated = document.createElement("div");
  updated.className = "truncate text-right text-xs text-token-text-secondary";
  updated.textContent = "Waiting for bridge";

  header.append(title, updated);

  const metrics = document.createElement("div");
  metrics.className = "grid grid-cols-2 gap-3 md:grid-cols-4";

  const today = metricCell("Today", "0", "tokens");
  const last30 = metricCell("30 days", "0", "tokens");
  const requests = metricCell("Requests", "0", "completed");
  const cost = metricCell("Cost", "—", "estimate");
  metrics.append(today.root, last30.root, requests.root, cost.root);

  const chart = document.createElement("div");
  chart.className = "flex min-h-[92px] flex-col gap-2";

  const empty = document.createElement("div");
  empty.className = "py-6 text-sm text-token-text-secondary";
  empty.textContent = "No usage records yet.";
  chart.append(empty);

  root.append(header, metrics, chart);
  return { root, updated, today, last30, requests, cost, chart };
}

function metricCell(label, value, detail) {
  const root = document.createElement("div");
  root.className = "flex min-w-0 flex-col gap-1";

  const labelEl = document.createElement("div");
  labelEl.className = "truncate text-xs text-token-text-secondary";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "truncate text-lg font-medium text-token-text-primary";
  valueEl.textContent = value;

  const detailEl = document.createElement("div");
  detailEl.className = "truncate text-xs text-token-text-secondary";
  detailEl.textContent = detail;

  root.append(labelEl, valueEl, detailEl);
  return { root, value: valueEl, detail: detailEl };
}

function renderUsageVisual(view, usage) {
  const totals = usage && usage.totals ? usage.totals : {};
  const daily = Array.isArray(usage && usage.daily) ? usage.daily : [];
  const recent = daily.slice(-30);
  const maxTokens = Math.max(1, ...recent.map((item) => Number(item.totalTokens || 0)));

  view.updated.textContent = usage && usage.updatedAt
    ? `Updated ${formatDateTime(usage.updatedAt)}`
    : "Ledger has no completed requests";
  view.today.value.textContent = compactNumber(usage && usage.sessionTokens);
  view.last30.value.textContent = compactNumber(usage && usage.last30DaysTokens);
  view.requests.value.textContent = compactNumber(totals.requestCount);
  view.cost.value.textContent = usage && usage.pricingConfigured
    ? formatUSD(usage.last30DaysCostUSD)
    : "—";
  view.cost.detail.textContent = usage && usage.pricingConfigured ? "USD estimate" : "pricing unset";

  view.chart.innerHTML = "";
  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "py-6 text-sm text-token-text-secondary";
    empty.textContent = "No usage records yet.";
    view.chart.append(empty);
    return;
  }

  for (const item of recent) {
    const row = document.createElement("div");
    row.className = "grid items-center gap-2";
    row.style.gridTemplateColumns = "4.5rem minmax(0, 1fr) 6rem";

    const date = document.createElement("div");
    date.className = "truncate text-xs text-token-text-secondary";
    date.textContent = shortDate(item.date);

    const track = document.createElement("div");
    track.className = "h-2 overflow-hidden rounded-sm";
    track.style.backgroundColor = "color-mix(in srgb, var(--color-token-text-secondary) 16%, transparent)";

    const bar = document.createElement("div");
    bar.className = "h-full rounded-sm";
    bar.style.width = `${Math.max(2, Math.round((Number(item.totalTokens || 0) / maxTokens) * 100))}%`;
    bar.style.backgroundColor = "var(--color-token-text-primary)";
    track.append(bar);

    const value = document.createElement("div");
    value.className = "truncate text-right text-xs text-token-text-secondary";
    value.textContent = `${compactNumber(item.totalTokens)} tok`;

    row.append(date, track, value);
    view.chart.append(row);
  }
}

function renderUsageUnavailable(view) {
  view.updated.textContent = "Bridge unavailable";
  view.today.value.textContent = "—";
  view.last30.value.textContent = "—";
  view.requests.value.textContent = "—";
  view.cost.value.textContent = "—";
  view.cost.detail.textContent = "unavailable";
  view.chart.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "py-6 text-sm text-token-text-secondary";
  empty.textContent = "Start the isolated QoderWork bridge to view usage.";
  view.chart.append(empty);
}

function formatTokens(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count)) return "0 tokens";
  return `${count.toLocaleString()} tokens`;
}

function compactNumber(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count)) return "0";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function formatUSD(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(value >= 1 ? 2 : 6)}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return String(value || "");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value < 0) return "Unknown";
  if (value === 0) return "No bridge timeout";
  const minutes = Math.round(value / 60000);
  if (minutes >= 60) {
    const hours = value / 3600000;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  }
  return minutes >= 1 ? `${minutes} min` : `${Math.round(value / 1000)} sec`;
}

function settingRow(labelText, descriptionText, control) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";

  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";

  const label = document.createElement("div");
  label.className = "min-w-0 text-sm text-token-text-primary";
  label.textContent = labelText;

  const description = document.createElement("div");
  description.className = "text-token-text-secondary min-w-0 text-sm";
  description.textContent = descriptionText;

  left.append(label, description);
  row.append(left, control);
  return row;
}

function bridgePaths() {
  const path = require("node:path");
  const bridgeDir = path.join(__dirname, "bridge");
  return {
    bridgeDir,
    serverPath: path.join(bridgeDir, "src", "server.mjs"),
    catalogPath: path.join(bridgeDir, "models_catalog.json"),
  };
}

function bridgeEnv(api) {
  const port = resolveBridgePort(api);
  safeStorageSet(api, "port", String(port));
  const codexHome = resolveCodexHome(api);
  return {
    ...process.env,
    QODER_BRIDGE_HOST: process.env.QODER_BRIDGE_HOST || DEFAULT_HOST,
    QODER_BRIDGE_PORT: String(port),
    QODERWORKCN_BRIDGE_PORT: String(port),
    QODER_BRIDGE_TIMEOUT_MS: resolveBridgeTimeoutMs(),
    QODER_BRIDGE_MODEL: process.env.QODER_BRIDGE_MODEL || BRIDGE_MODEL,
    QODER_MODEL: process.env.QODER_MODEL || QODER_MODEL,
    QODERWORKCN_CODEX_HOME: codexHome,
  };
}

function resolveBridgePort(api) {
  const stored =
    api && api.storage && typeof api.storage.get === "function"
      ? api.storage.get("port", "")
      : "";
  return normalizePort(
    envValue("QODERWORKCN_BRIDGE_PORT") ||
      envValue("QODER_BRIDGE_PORT") ||
      stored ||
      DEFAULT_PORT,
  );
}

function envValue(name) {
  if (typeof process === "undefined" || !process || !process.env) return "";
  return process.env[name] || "";
}

function resolveBridgeTimeoutMs() {
  const raw = envValue("QODER_BRIDGE_TIMEOUT_MS");
  if (!raw) return String(DEFAULT_TIMEOUT_MS);
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return String(DEFAULT_TIMEOUT_MS);
  if (parsed === 0) return "0";
  return String(Math.max(parsed, DEFAULT_TIMEOUT_MS));
}

function safeStorageSet(api, key, value) {
  try {
    if (api && api.storage && typeof api.storage.set === "function") {
      api.storage.set(key, value);
    }
  } catch {}
}

function normalizePort(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT;
  return parsed;
}

function endpointFromEnv(env) {
  return `http://${env.QODER_BRIDGE_HOST || DEFAULT_HOST}:${normalizePort(env.QODER_BRIDGE_PORT)}/v1`;
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function stopBridge() {
  const server = bridgeServer;
  bridgeServer = null;
  bridgeStatus = { ...bridgeStatus, state: "stopped" };
  if (server) {
    try {
      server.close();
    } catch {}
  }
}

function statusFromConfig(state, config, paths, configResult, health) {
  const fs = require("node:fs");
  return {
    state,
    endpoint: `http://${config.host}:${config.port}/v1`,
    health: `http://${config.host}:${config.port}/health`,
    model: config.bridgeModel,
    qoderModel: config.qoderModel,
    qoderCli: config.qoderCli,
    qoderCliExists: health ? health.qoderCliExists : fs.existsSync(config.qoderCli),
    catalogPath: paths.catalogPath,
    codexConfigPath: configResult.configPath,
    codexProfilePath: configResult.profilePath,
  };
}

function fetchHealth(host, port) {
  const http = require("node:http");
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: host,
        port,
        path: "/health",
        timeout: 1500,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function ensureCodexConfig(config, catalogPath, api) {
  const fs = require("node:fs");
  const path = require("node:path");
  const codexHome = resolveCodexHome(api);
  fs.mkdirSync(codexHome, { recursive: true });

  const configPath = path.join(codexHome, "config.toml");
  const profilePath = path.join(codexHome, "qoderworkcn.config.toml");
  const options = {
    providerId: PROVIDER_ID,
    providerName: "QoderWork CN Bridge",
    bridgeModel: config.bridgeModel,
    baseUrl: `http://${config.host}:${config.port}/v1`,
    catalogPath,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
  };

  const existing = readIfExists(configPath);
  maybeBackupConfig(configPath, existing, api);

  const nextConfig = buildManagedCodexConfig(existing, options);
  const configChanged = writeIfChanged(configPath, nextConfig);

  const nextProfile = buildProfileConfig(options);
  const profileChanged = writeIfChanged(profilePath, nextProfile);

  return {
    configPath,
    profilePath,
    changed: configChanged || profileChanged,
  };
}

function resolveCodexHome(api) {
  const path = require("node:path");
  const explicit = process.env.QODERWORKCN_CODEX_HOME || process.env.CODEX_HOME;
  if (explicit && String(explicit).trim()) return path.resolve(String(explicit));

  const dataDir = api && api.fs && api.fs.dataDir ? String(api.fs.dataDir) : "";
  if (dataDir && !dataDir.startsWith("<remote>")) {
    return path.join(dataDir, DEFAULT_PROFILE_DIRNAME);
  }

  const os = require("node:os");
  return path.join(os.homedir(), ".codex-qoderworkcn");
}

function maybeBackupConfig(configPath, existing, api) {
  const fs = require("node:fs");
  if (!existing.trim()) return;
  if (existing.includes(DEFAULT_MODEL_START) || existing.includes(PROVIDER_START)) return;
  if (api.storage.get("configBackupPath", "")) return;

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const backupPath = `${configPath}.backup-codexpp-qoderworkcn-${stamp}`;
  try {
    fs.copyFileSync(configPath, backupPath);
    api.storage.set("configBackupPath", backupPath);
  } catch (error) {
    api.log.warn("Could not back up Codex config before QoderWork CN update:", error);
  }
}

function buildManagedCodexConfig(existing, options) {
  let body = stripManagedBlock(existing, DEFAULT_MODEL_START, DEFAULT_MODEL_END);
  body = stripManagedBlock(body, PROVIDER_START, PROVIDER_END);
  body = stripTable(body, `model_providers.${options.providerId}`);
  body = stripTopLevelKeys(body, ROOT_MODEL_KEYS).trim();

  const parts = [buildDefaultModelBlock(options)];
  if (body) parts.push(body);
  parts.push(buildProviderBlock(options));
  return `${parts.join("\n\n")}\n`;
}

function buildProfileConfig(options) {
  return `${buildDefaultModelBlock(options)}\n\n${buildProviderBlock(options)}\n`;
}

function buildDefaultModelBlock(options) {
  return [
    DEFAULT_MODEL_START,
    `model = ${tomlString(options.bridgeModel)}`,
    `model_provider = ${tomlString(options.providerId)}`,
    `model_reasoning_effort = ${tomlString(options.reasoningEffort)}`,
    `model_catalog_json = ${tomlString(options.catalogPath)}`,
    DEFAULT_MODEL_END,
  ].join("\n");
}

function buildProviderBlock(options) {
  return [
    PROVIDER_START,
    `[model_providers.${options.providerId}]`,
    `name = ${tomlString(options.providerName)}`,
    `base_url = ${tomlString(options.baseUrl)}`,
    'wire_api = "responses"',
    "request_max_retries = 0",
    "stream_max_retries = 0",
    "supports_websockets = false",
    PROVIDER_END,
  ].join("\n");
}

function stripManagedBlock(text, start, end) {
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\s*`, "g");
  return String(text || "").replace(pattern, "");
}

function stripTopLevelKeys(toml, keys) {
  const keySet = new Set(keys);
  let inTopLevel = true;
  const output = [];

  for (const line of String(toml || "").split(/\r?\n/)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      inTopLevel = false;
    }
    if (inTopLevel) {
      const match = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line);
      if (match && keySet.has(match[1])) continue;
    }
    output.push(line);
  }

  return output.join("\n").replace(/^\n+/, "");
}

function stripTable(toml, tableName) {
  const output = [];
  let skipping = false;
  const tablePattern = new RegExp(`^\\s*\\[${escapeRegExp(tableName)}\\]\\s*$`);

  for (const line of String(toml || "").split(/\r?\n/)) {
    if (tablePattern.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[[^\]]+\]\s*$/.test(line)) {
      skipping = false;
    }
    if (!skipping) output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

function readIfExists(file) {
  const fs = require("node:fs");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function writeIfChanged(file, contents) {
  const fs = require("node:fs");
  if (readIfExists(file) === contents) return false;
  fs.writeFileSync(file, contents, "utf8");
  return true;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
