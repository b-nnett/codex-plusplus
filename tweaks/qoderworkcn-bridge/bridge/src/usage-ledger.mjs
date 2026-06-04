import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_LEDGER_FILE = 'codexbar-qoderworkcn-usage.jsonl';
const USD_PER_1M_KEYS = {
  input: 'QODERWORKCN_INPUT_USD_PER_1M',
  output: 'QODERWORKCN_OUTPUT_USD_PER_1M',
  cachedInput: 'QODERWORKCN_CACHED_INPUT_USD_PER_1M',
};

export function usageLedgerPath(config = {}) {
  if (config.usageLedgerPath) return path.resolve(String(config.usageLedgerPath));
  const explicit = config.usageLedger || config.env?.QODERWORKCN_USAGE_LEDGER || process.env.QODERWORKCN_USAGE_LEDGER;
  if (explicit) return path.resolve(String(explicit));

  const codexHome = config.codexHome || process.env.QODERWORKCN_CODEX_HOME || process.env.CODEX_HOME;
  if (codexHome) return path.join(path.resolve(String(codexHome)), DEFAULT_LEDGER_FILE);

  return path.join(process.cwd(), DEFAULT_LEDGER_FILE);
}

export function usagePricing(config = {}) {
  const env = config.env || process.env;
  const inputPer1M = numberFrom(config.inputUsdPer1M ?? env[USD_PER_1M_KEYS.input]);
  const outputPer1M = numberFrom(config.outputUsdPer1M ?? env[USD_PER_1M_KEYS.output]);
  const cachedInputPer1M = numberFrom(config.cachedInputUsdPer1M ?? env[USD_PER_1M_KEYS.cachedInput]);
  const configured = inputPer1M > 0 || outputPer1M > 0 || cachedInputPer1M > 0;
  return { inputPer1M, outputPer1M, cachedInputPer1M, configured };
}

export function recordUsage(config, response, meta = {}) {
  if (!response || !response.usage) return null;

  const ledgerPath = usageLedgerPath(config);
  mkdirSync(path.dirname(ledgerPath), { recursive: true });

  const usage = normalizeUsage(response.usage);
  const pricing = usagePricing(config);
  const costUSD = estimateCostUSD(usage, pricing);
  const timestamp = new Date((response.created_at || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const record = {
    schema: 'codexbar.qoderworkcn.usage.v1',
    provider: 'qoderworkcn',
    source: 'qoderworkcn-responses-bridge',
    timestamp,
    responseId: response.id || null,
    codexModel: response.model || config.bridgeModel || null,
    qoderModel: meta.qoderModel || config.qoderModel || null,
    usage,
    costUSD,
    pricing: pricing.configured ? {
      inputPer1M: pricing.inputPer1M,
      outputPer1M: pricing.outputPer1M,
      cachedInputPer1M: pricing.cachedInputPer1M,
      currency: 'USD',
    } : null,
  };

  appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function usageSummary(config = {}, options = {}) {
  const ledgerPath = usageLedgerPath(config);
  const days = clampDays(options.days ?? 30);
  const now = options.now instanceof Date ? options.now : new Date();
  const sinceMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const todayKey = dayKey(now);
  const pricing = usagePricing(config);
  const records = readLedgerRecords(ledgerPath)
    .filter((record) => {
      const time = Date.parse(record.timestamp || '');
      return Number.isFinite(time) && time >= sinceMs && time <= now.getTime() + 1000;
    });

  const daily = new Map();
  const totals = emptyTotals();
  let latestAt = null;

  for (const record of records) {
    const usage = normalizeUsage(record.usage || {});
    const key = dayKey(new Date(record.timestamp));
    const costUSD = typeof record.costUSD === 'number'
      ? record.costUSD
      : estimateCostUSD(usage, pricing);
    const bucket = daily.get(key) || {
      date: key,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
      totalCost: null,
      requestCount: 0,
      modelsUsed: [],
      modelBreakdowns: new Map(),
    };

    addUsage(bucket, usage, costUSD, record.codexModel || 'unknown');
    addUsage(totals, usage, costUSD, record.codexModel || 'unknown');
    daily.set(key, bucket);
    if (!latestAt || record.timestamp > latestAt) latestAt = record.timestamp;
  }

  const dailyRows = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(finalizeBucket);
  const today = dailyRows.find((row) => row.date === todayKey) || emptyDaily(todayKey);
  const finalizedTotals = finalizeBucket(totals);

  return {
    provider: 'qoderworkcn',
    source: 'qoderworkcn-responses-bridge',
    updatedAt: latestAt,
    ledgerPath,
    ledgerExists: existsSync(ledgerPath),
    ledgerBytes: fileSize(ledgerPath),
    pricingConfigured: pricing.configured,
    sessionTokens: today.totalTokens,
    sessionCostUSD: today.totalCost,
    last30DaysTokens: finalizedTotals.totalTokens,
    last30DaysCostUSD: finalizedTotals.totalCost,
    daily: dailyRows,
    totals: finalizedTotals,
  };
}

function readLedgerRecords(ledgerPath) {
  if (!existsSync(ledgerPath)) return [];
  const text = readFileSync(ledgerPath, 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Keep the endpoint resilient if a previous process was interrupted mid-write.
    }
  }
  return rows;
}

function addUsage(bucket, usage, costUSD, model) {
  bucket.inputTokens += usage.input_tokens;
  bucket.outputTokens += usage.output_tokens;
  bucket.cacheReadTokens += usage.input_tokens_details.cached_tokens;
  bucket.cacheCreationTokens += 0;
  bucket.totalTokens += usage.total_tokens;
  bucket.requestCount += 1;
  if (typeof costUSD === 'number') {
    bucket.totalCost = (bucket.totalCost || 0) + costUSD;
  }
  if (!bucket.modelsUsed.includes(model)) bucket.modelsUsed.push(model);
  const breakdown = bucket.modelBreakdowns.get(model) || {
    modelName: model,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: null,
    requestCount: 0,
  };
  breakdown.inputTokens += usage.input_tokens;
  breakdown.outputTokens += usage.output_tokens;
  breakdown.cacheReadTokens += usage.input_tokens_details.cached_tokens;
  breakdown.totalTokens += usage.total_tokens;
  breakdown.requestCount += 1;
  if (typeof costUSD === 'number') {
    breakdown.cost = (breakdown.cost || 0) + costUSD;
  }
  bucket.modelBreakdowns.set(model, breakdown);
}

function finalizeBucket(bucket) {
  return {
    date: bucket.date,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    cacheReadTokens: bucket.cacheReadTokens,
    cacheCreationTokens: bucket.cacheCreationTokens,
    totalTokens: bucket.totalTokens,
    totalCost: roundCost(bucket.totalCost),
    requestCount: bucket.requestCount,
    modelsUsed: [...bucket.modelsUsed].sort(),
    modelBreakdowns: [...bucket.modelBreakdowns.values()]
      .sort((a, b) => b.totalTokens - a.totalTokens || a.modelName.localeCompare(b.modelName))
      .map((item) => ({ ...item, cost: roundCost(item.cost) })),
  };
}

function emptyTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    totalCost: null,
    requestCount: 0,
    modelsUsed: [],
    modelBreakdowns: new Map(),
  };
}

function emptyDaily(date) {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    totalCost: null,
    requestCount: 0,
    modelsUsed: [],
    modelBreakdowns: [],
  };
}

function normalizeUsage(usage = {}) {
  const input = nonNegativeInt(usage.input_tokens);
  const output = nonNegativeInt(usage.output_tokens);
  const cached = nonNegativeInt(
    usage.input_tokens_details?.cached_tokens ??
    usage.input_tokens_details?.cache_read_tokens ??
    usage.cache_read_input_tokens ??
    usage.cached_input_tokens,
  );
  return {
    input_tokens: input,
    input_tokens_details: {
      cached_tokens: cached,
    },
    output_tokens: output,
    output_tokens_details: {
      reasoning_tokens: nonNegativeInt(usage.output_tokens_details?.reasoning_tokens),
    },
    total_tokens: nonNegativeInt(usage.total_tokens) || input + output,
  };
}

function estimateCostUSD(usage, pricing) {
  if (!pricing.configured) return null;
  const cached = usage.input_tokens_details.cached_tokens;
  const billableInput = Math.max(0, usage.input_tokens - cached);
  const cost =
    (billableInput / 1_000_000) * pricing.inputPer1M +
    (cached / 1_000_000) * pricing.cachedInputPer1M +
    (usage.output_tokens / 1_000_000) * pricing.outputPer1M;
  return roundCost(cost);
}

function numberFrom(value) {
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clampDays(value) {
  const parsed = Number.parseInt(String(value ?? '30'), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, parsed));
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function fileSize(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function roundCost(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}
