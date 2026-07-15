"use strict";

// src/preload/index.ts
var import_electron4 = require("electron");

// src/preload/react-hook.ts
function installReactHook() {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
  const renderers = /* @__PURE__ */ new Map();
  let nextId = 1;
  const listeners = /* @__PURE__ */ new Map();
  const hook = {
    supportsFiber: true,
    renderers,
    inject(renderer) {
      const id = nextId++;
      renderers.set(id, renderer);
      console.debug(
        "[codex-plusplus] React renderer attached:",
        renderer.rendererPackageName,
        renderer.version
      );
      return id;
    },
    on(event, fn) {
      let s = listeners.get(event);
      if (!s) listeners.set(event, s = /* @__PURE__ */ new Set());
      s.add(fn);
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
    onCommitFiberRoot() {
    },
    onCommitFiberUnmount() {
    },
    onScheduleFiberRoot() {
    },
    checkDCE() {
    }
  };
  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    configurable: true,
    enumerable: false,
    writable: true,
    // allow real DevTools to overwrite if user installs it
    value: hook
  });
  window.__codexpp__ = { hook, renderers };
}
function fiberForNode(node) {
  const renderers = window.__codexpp__?.renderers;
  if (renderers) {
    for (const r of renderers.values()) {
      const f = r.findFiberByHostInstance?.(node);
      if (f) return f;
    }
  }
  for (const k of Object.keys(node)) {
    if (k.startsWith("__reactFiber")) return node[k];
  }
  return null;
}

// src/preload/settings-injector.ts
var import_electron = require("electron");

// src/tweak-store.ts
var TWEAK_STORE_REVIEW_ISSUE_URL = "https://github.com/b-nnett/codex-plusplus/issues/new";
var GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var FULL_SHA_RE = /^[a-f0-9]{40}$/i;
var VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i;
function normalizeGitHubRepo(input) {
  const raw = input.trim();
  if (!raw) throw new Error("GitHub repo is required");
  const ssh = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(raw);
  if (ssh) return normalizeRepoPart(ssh[1]);
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.hostname !== "github.com") throw new Error("Only github.com repositories are supported");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) throw new Error("GitHub repo URL must include owner and repository");
    return normalizeRepoPart(`${parts[0]}/${parts[1]}`);
  }
  return normalizeRepoPart(raw);
}
function isStoreUpdateAvailable(installedVersion, approvedVersion) {
  const installed = VERSION_RE.exec(installedVersion.trim());
  const approved = VERSION_RE.exec(approvedVersion.trim());
  if (!installed || !approved) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(approved[i]) - Number(installed[i]);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
function buildTweakPublishIssueUrl(submission) {
  const repo = normalizeGitHubRepo(submission.repo);
  if (!isFullCommitSha(submission.commitSha)) {
    throw new Error("Submission must include the full commit SHA to review");
  }
  const title = `Tweak store review: ${repo}`;
  const body = [
    "## Tweak repo",
    `https://github.com/${repo}`,
    "",
    "## Commit to review",
    submission.commitSha,
    submission.commitUrl,
    "",
    "Do not approve a different commit. If the author pushes changes, ask them to resubmit.",
    "",
    "## Manifest",
    `- id: ${submission.manifest?.id ?? "(not detected)"}`,
    `- name: ${submission.manifest?.name ?? "(not detected)"}`,
    `- version: ${submission.manifest?.version ?? "(not detected)"}`,
    `- description: ${submission.manifest?.description ?? "(not detected)"}`,
    `- iconUrl: ${submission.manifest?.iconUrl ?? "(not detected)"}`,
    "",
    "## Admin checklist",
    "- [ ] manifest.json is valid",
    "- [ ] manifest.iconUrl is usable as the store icon",
    "- [ ] source was reviewed at the exact commit above",
    "- [ ] `store/index.json` entry pins `approvedCommitSha` to the exact commit above"
  ].join("\n");
  const url = new URL(TWEAK_STORE_REVIEW_ISSUE_URL);
  url.searchParams.set("template", "tweak-store-review.md");
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  return url.toString();
}
function isFullCommitSha(value) {
  return FULL_SHA_RE.test(value);
}
function normalizeRepoPart(value) {
  const repo = value.trim().replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!GITHUB_REPO_RE.test(repo)) throw new Error("GitHub repo must be in owner/repo form");
  return repo;
}

// src/preload/settings-injector.ts
var CODEX_PLUSPLUS_RELEASES_URL = "https://github.com/b-nnett/codex-plusplus/releases";
var state = {
  sections: /* @__PURE__ */ new Map(),
  pages: /* @__PURE__ */ new Map(),
  listedTweaks: [],
  outerWrapper: null,
  nativeNavHeader: null,
  navGroup: null,
  navButtons: null,
  codexPlusPlusUpdateButton: null,
  pagesGroup: null,
  pagesGroupKey: null,
  panelHost: null,
  observer: null,
  fingerprint: null,
  sidebarDumped: false,
  activePage: null,
  sidebarRoot: null,
  sidebarRestoreHandler: null,
  settingsSurfaceVisible: false,
  settingsSurfaceHideTimer: null,
  sidebarMissingLogged: false,
  tweakStore: null,
  tweakStorePromise: null,
  tweakStoreError: null
};
function plog(msg, extra) {
  import_electron.ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `[settings-injector] ${msg}${extra === void 0 ? "" : " " + safeStringify(extra)}`
  );
}
function safeStringify(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function startSettingsInjector() {
  if (state.observer) return;
  const obs = new MutationObserver(() => {
    tryInject();
    maybeDumpDom();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  state.observer = obs;
  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);
  document.addEventListener("click", onDocumentClick, true);
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function(...args) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(`codexpp-${m}`));
      return r;
    };
    window.addEventListener(`codexpp-${m}`, onNav);
  }
  tryInject();
  maybeDumpDom();
  let ticks = 0;
  const interval = setInterval(() => {
    ticks++;
    tryInject();
    maybeDumpDom();
    if (ticks > 60) clearInterval(interval);
  }, 500);
}
function onNav() {
  state.fingerprint = null;
  tryInject();
  maybeDumpDom();
}
function onDocumentClick(e) {
  const target = e.target instanceof Element ? e.target : null;
  const control = target?.closest("[role='link'],button,a");
  if (!(control instanceof HTMLElement)) return;
  if (compactSettingsText(control.textContent || "") !== "Back to app") return;
  setTimeout(() => {
    setSettingsSurfaceVisible(false, "back-to-app");
  }, 0);
}
function registerSection(section) {
  state.sections.set(section.id, section);
  if (state.activePage?.kind === "tweaks") rerender();
  return {
    unregister: () => {
      state.sections.delete(section.id);
      if (state.activePage?.kind === "tweaks") rerender();
    }
  };
}
function clearSections() {
  state.sections.clear();
  for (const p of state.pages.values()) {
    try {
      p.teardown?.();
    } catch (e) {
      plog("page teardown failed", { id: p.id, err: String(e) });
    }
  }
  state.pages.clear();
  syncPagesGroup();
  if (state.activePage?.kind === "registered" && !state.pages.has(state.activePage.id)) {
    restoreCodexView();
  } else if (state.activePage?.kind === "tweaks") {
    rerender();
  }
}
function registerPage(tweakId, manifest, page) {
  const id = page.id;
  const entry = { id, tweakId, manifest, page };
  state.pages.set(id, entry);
  plog("registerPage", { id, title: page.title, tweakId });
  syncPagesGroup();
  if (state.activePage?.kind === "registered" && state.activePage.id === id) {
    rerender();
  }
  return {
    unregister: () => {
      const e = state.pages.get(id);
      if (!e) return;
      try {
        e.teardown?.();
      } catch {
      }
      state.pages.delete(id);
      syncPagesGroup();
      if (state.activePage?.kind === "registered" && state.activePage.id === id) {
        restoreCodexView();
      }
    }
  };
}
function setListedTweaks(list) {
  state.listedTweaks = list;
  if (state.activePage?.kind === "tweaks") rerender();
}
function tryInject() {
  removeMisplacedSettingsGroups();
  const itemsGroup = findSidebarItemsGroup();
  if (!itemsGroup) {
    scheduleSettingsSurfaceHidden();
    if (!state.sidebarMissingLogged) {
      state.sidebarMissingLogged = true;
      plog("sidebar not found");
    }
    return;
  }
  state.sidebarMissingLogged = false;
  if (state.settingsSurfaceHideTimer) {
    clearTimeout(state.settingsSurfaceHideTimer);
    state.settingsSurfaceHideTimer = null;
  }
  setSettingsSurfaceVisible(true, "sidebar-found");
  const outer = itemsGroup.parentElement ?? itemsGroup;
  if (!isSettingsSidebarCandidate(itemsGroup) || !isSettingsSidebarCandidate(outer)) {
    scheduleSettingsSurfaceHidden();
    plog("rejected non-settings sidebar candidate", {
      itemsGroup: describe(itemsGroup),
      outer: describe(outer)
    });
    return;
  }
  state.sidebarRoot = outer;
  syncNativeSettingsHeader(itemsGroup, outer);
  if (state.navGroup && outer.contains(state.navGroup)) {
    syncPagesGroup();
    if (state.activePage !== null) syncCodexNativeNavActive(true);
    return;
  }
  if (state.activePage !== null || state.panelHost !== null) {
    plog("sidebar re-mount detected; clearing stale active state", {
      prevActive: state.activePage
    });
    state.activePage = null;
    state.panelHost = null;
  }
  const existingCodexPpNavGroup = outer.querySelector(':scope > [data-codexpp="nav-group"]') ?? outer.querySelector('[data-codexpp="nav-group"]');
  if (existingCodexPpNavGroup) {
    state.navGroup = existingCodexPpNavGroup;
    state.codexPlusPlusUpdateButton = existingCodexPpNavGroup.querySelector(
      "[data-codexpp-sidebar-update]"
    );
    state.sidebarRoot = outer;
    syncPagesGroup();
    refreshSidebarCodexPlusPlusUpdateButton();
    if (state.activePage !== null) syncCodexNativeNavActive(true);
    return;
  }
  const group = document.createElement("div");
  group.dataset.codexpp = "nav-group";
  group.className = "flex flex-col gap-px";
  const updateButton = sidebarUpdatePillButton();
  state.codexPlusPlusUpdateButton = updateButton;
  group.appendChild(sidebarGroupHeader("Codex++", "pt-3", updateButton));
  refreshSidebarCodexPlusPlusUpdateButton();
  const configBtn = makeSidebarItem("Config", configIconSvg());
  const tweaksBtn = makeSidebarItem("Tweaks", tweaksIconSvg());
  const storeBtn = makeSidebarItem("Tweak Store", storeIconSvg());
  appendSidebarStoreUpdateBadge(storeBtn);
  configBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activatePage({ kind: "config" });
  });
  tweaksBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activatePage({ kind: "tweaks" });
  });
  storeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activatePage({ kind: "store" });
  });
  group.appendChild(configBtn);
  group.appendChild(tweaksBtn);
  group.appendChild(storeBtn);
  outer.appendChild(group);
  state.navGroup = group;
  state.navButtons = { config: configBtn, tweaks: tweaksBtn, store: storeBtn };
  plog("nav group injected", { outerTag: outer.tagName });
  syncPagesGroup();
}
function syncNativeSettingsHeader(itemsGroup, outer) {
  if (state.nativeNavHeader && outer.contains(state.nativeNavHeader)) return;
  if (outer === itemsGroup) return;
  const header = sidebarGroupHeader("General");
  header.dataset.codexpp = "native-nav-header";
  outer.insertBefore(header, itemsGroup);
  state.nativeNavHeader = header;
}
function sidebarGroupHeader(text, topPadding = "pt-2", trailing) {
  const header = document.createElement("div");
  header.className = `px-row-x ${topPadding} pb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none`;
  const label = document.createElement("span");
  label.className = "truncate";
  label.textContent = text;
  header.appendChild(label);
  if (trailing) header.appendChild(trailing);
  return header;
}
function scheduleSettingsSurfaceHidden() {
  if (!state.settingsSurfaceVisible || state.settingsSurfaceHideTimer) return;
  state.settingsSurfaceHideTimer = setTimeout(() => {
    state.settingsSurfaceHideTimer = null;
    const sidebar = findSidebarItemsGroup();
    if (sidebar && isSettingsSidebarCandidate(sidebar)) return;
    if (isSettingsTextVisible()) return;
    setSettingsSurfaceVisible(false, "sidebar-not-found");
  }, 1500);
}
function isSettingsTextVisible() {
  return isCodexPpSettingsLabelSet(codexPpSettingsLabelsFrom(document));
}
function compactSettingsText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
var CODEXPP_CORE_SETTINGS_LABELS = [
  "General",
  "\u5E38\u89C4",
  "\u901A\u7528",
  "Appearance",
  "\u5916\u89C2",
  "Configuration",
  "\u914D\u7F6E",
  "\u9ED8\u8BA4\u6743\u9650",
  "Personalization",
  "\u4E2A\u6027\u5316"
].map(normalizeCodexPpSettingsLabel);
var CODEXPP_EXTENDED_SETTINGS_LABELS = [
  "Account",
  "\u8D26\u6237",
  "\u8D26\u53F7",
  "General",
  "\u5E38\u89C4",
  "\u901A\u7528",
  "Appearance",
  "\u5916\u89C2",
  "Configuration",
  "\u914D\u7F6E",
  "\u9ED8\u8BA4\u6743\u9650",
  "Personalization",
  "\u4E2A\u6027\u5316",
  "Keyboard shortcuts",
  "Archived chats",
  "Usage",
  "Computer use",
  "Browser use",
  "MCP servers",
  "MCP Servers",
  "MCP \u670D\u52A1\u5668",
  "Git",
  "Environments",
  "\u73AF\u5883",
  "Cloud Environments",
  "Worktrees",
  "Connections",
  "Plugins",
  "Skills"
].map(normalizeCodexPpSettingsLabel);
var CODEXPP_SETTINGS_ONLY_LABELS = [
  "General",
  "\u5E38\u89C4",
  "\u901A\u7528",
  "Appearance",
  "\u5916\u89C2",
  "Configuration",
  "\u914D\u7F6E",
  "\u9ED8\u8BA4\u6743\u9650",
  "Personalization",
  "\u4E2A\u6027\u5316",
  "Keyboard shortcuts",
  "Archived chats",
  "Usage",
  "Computer use",
  "Browser use",
  "MCP servers",
  "MCP Servers",
  "MCP \u670D\u52A1\u5668",
  "Git",
  "Environments",
  "\u73AF\u5883",
  "Cloud Environments",
  "Worktrees",
  "Connections"
].map(normalizeCodexPpSettingsLabel);
var CODEXPP_MAIN_APP_NAV_LABELS = [
  "New chat",
  "Quick chat",
  "\u5FEB\u901F\u5BF9\u8BDD",
  "Search",
  "\u641C\u7D22",
  "Plugins",
  "\u63D2\u4EF6",
  "Automations",
  "Automation",
  "\u81EA\u52A8\u5316",
  "Chats",
  "Chat",
  "\u5BF9\u8BDD",
  "Projects",
  "\u9879\u76EE",
  "Pinned",
  "Settings",
  "\u8BBE\u7F6E",
  "Work locally"
].map(normalizeCodexPpSettingsLabel);
function normalizeCodexPpSettingsLabel(value) {
  return compactSettingsText(value).toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
}
function codexPpControlLabel(el) {
  return normalizeCodexPpSettingsLabel(
    el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || ""
  );
}
function codexPpSettingsLabelsFrom(root) {
  const controls = Array.from(
    root.querySelectorAll("button,a,[role='button'],[role='link']")
  );
  return [
    ...new Set(
      controls.map(codexPpControlLabel).filter(Boolean)
    )
  ];
}
function codexPpSettingsLabelScore(labels) {
  const core = /* @__PURE__ */ new Set();
  const total = /* @__PURE__ */ new Set();
  for (const label of labels) {
    for (const marker of CODEXPP_CORE_SETTINGS_LABELS) {
      if (codexPpLabelMatchesMarker(label, marker)) core.add(marker);
    }
    for (const marker of CODEXPP_EXTENDED_SETTINGS_LABELS) {
      if (codexPpLabelMatchesMarker(label, marker)) total.add(marker);
    }
  }
  return { core: core.size, total: total.size };
}
function codexPpLabelMatchesMarker(label, marker) {
  return label === marker || label.includes(marker);
}
function codexPpMarkerCount(labels, markers) {
  const matched = /* @__PURE__ */ new Set();
  for (const label of labels) {
    for (const marker of markers) {
      if (codexPpLabelMatchesMarker(label, marker)) matched.add(marker);
    }
  }
  return matched.size;
}
function hasCodexPpSettingsOnlySignal(labels) {
  return codexPpMarkerCount(labels, CODEXPP_SETTINGS_ONLY_LABELS) > 0;
}
function hasMainAppSidebarSignals(labels) {
  return codexPpMarkerCount(labels, CODEXPP_MAIN_APP_NAV_LABELS) >= 2;
}
function isCodexPpSettingsLabelSet(labels) {
  const score = codexPpSettingsLabelScore(labels);
  return score.core >= 2 && score.total >= 3;
}
function codexPpVisibleBox(el) {
  if (!el.isConnected) return null;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}
function setSettingsSurfaceVisible(visible, reason) {
  if (state.settingsSurfaceVisible === visible) return;
  state.settingsSurfaceVisible = visible;
  if (visible) warmTweakStore();
  try {
    window.__codexppSettingsSurfaceVisible = visible;
    document.documentElement.dataset.codexppSettingsSurface = visible ? "true" : "false";
    window.dispatchEvent(
      new CustomEvent("codexpp:settings-surface", {
        detail: { visible, reason }
      })
    );
  } catch {
  }
  plog("settings surface", { visible, reason, url: location.href });
}
function syncPagesGroup() {
  const outer = state.sidebarRoot;
  if (!outer) return;
  if (!isSettingsSidebarCandidate(outer)) {
    state.sidebarRoot = null;
    state.pagesGroup = null;
    state.pagesGroupKey = null;
    for (const p of state.pages.values()) p.navButton = null;
    return;
  }
  const pages = [...state.pages.values()];
  const desiredKey = pages.length === 0 ? "EMPTY" : pages.map((p) => `${p.id}|${p.page.title}|${p.page.iconSvg ?? ""}`).join("\n");
  const groupAttached = !!state.pagesGroup && outer.contains(state.pagesGroup);
  if (state.pagesGroupKey === desiredKey && (pages.length === 0 ? !groupAttached : groupAttached)) {
    return;
  }
  if (pages.length === 0) {
    if (state.pagesGroup) {
      state.pagesGroup.remove();
      state.pagesGroup = null;
    }
    for (const p of state.pages.values()) p.navButton = null;
    state.pagesGroupKey = desiredKey;
    return;
  }
  let group = state.pagesGroup;
  if (!group || !outer.contains(group)) {
    group = document.createElement("div");
    group.dataset.codexpp = "pages-group";
    group.className = "flex flex-col gap-px";
    group.appendChild(sidebarGroupHeader("Tweaks", "pt-3"));
    outer.appendChild(group);
    state.pagesGroup = group;
  } else {
    while (group.children.length > 1) group.removeChild(group.lastChild);
  }
  for (const p of pages) {
    const icon = p.page.iconSvg ?? defaultPageIconSvg();
    const btn = makeSidebarItem(p.page.title, icon);
    btn.dataset.codexpp = `nav-page-${p.id}`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activatePage({ kind: "registered", id: p.id });
    });
    p.navButton = btn;
    group.appendChild(btn);
  }
  state.pagesGroupKey = desiredKey;
  plog("pages group synced", {
    count: pages.length,
    ids: pages.map((p) => p.id)
  });
  setNavActive(state.activePage);
}
function makeSidebarItem(label, iconSvg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexpp = `nav-${label.toLowerCase()}`;
  btn.setAttribute("aria-label", label);
  btn.className = "focus-visible:outline-token-border relative px-row-x py-row-y cursor-interaction shrink-0 items-center overflow-hidden rounded-lg text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full hover:bg-token-list-hover-background font-normal";
  const inner = document.createElement("div");
  inner.className = "flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground";
  inner.innerHTML = `${iconSvg}<span class="truncate">${label}</span>`;
  btn.appendChild(inner);
  return btn;
}
function appendSidebarStoreUpdateBadge(btn) {
  const inner = btn.firstElementChild;
  if (!inner) return;
  const badge = document.createElement("span");
  badge.dataset.codexppStoreUpdateBadge = "true";
  badge.hidden = true;
  badge.title = "Installed tweaks with approved updates";
  badge.className = "inline-flex shrink-0 items-center justify-center";
  Object.assign(badge.style, {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: "1"
  });
  applyStoreUpdateBadgeStyle(badge, null);
  btn.appendChild(badge);
}
function setNavActive(active) {
  if (state.navButtons) {
    const builtin = active?.kind === "config" ? "config" : active?.kind === "tweaks" ? "tweaks" : active?.kind === "store" ? "store" : null;
    for (const [key, btn] of Object.entries(state.navButtons)) {
      applyNavActive(btn, key === builtin);
    }
  }
  for (const p of state.pages.values()) {
    if (!p.navButton) continue;
    const isActive = active?.kind === "registered" && active.id === p.id;
    applyNavActive(p.navButton, isActive);
  }
  syncCodexNativeNavActive(active !== null);
}
function syncCodexNativeNavActive(mute) {
  if (!mute) return;
  const root = state.sidebarRoot;
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll("button"));
  for (const btn of buttons) {
    if (btn.dataset.codexpp) continue;
    if (btn.getAttribute("aria-current") === "page") {
      btn.removeAttribute("aria-current");
    }
    if (btn.classList.contains("bg-token-list-hover-background")) {
      btn.classList.remove("bg-token-list-hover-background");
      btn.classList.add("hover:bg-token-list-hover-background");
    }
  }
}
function applyNavActive(btn, active) {
  const inner = btn.firstElementChild;
  if (active) {
    btn.classList.remove("hover:bg-token-list-hover-background", "font-normal");
    btn.classList.add("bg-token-list-hover-background");
    btn.setAttribute("aria-current", "page");
    if (inner) {
      inner.classList.remove("text-token-foreground");
      inner.classList.add("text-token-list-active-selection-foreground");
      inner.querySelector("svg")?.classList.add("text-token-list-active-selection-icon-foreground");
    }
  } else {
    btn.classList.add("hover:bg-token-list-hover-background", "font-normal");
    btn.classList.remove("bg-token-list-hover-background");
    btn.removeAttribute("aria-current");
    if (inner) {
      inner.classList.add("text-token-foreground");
      inner.classList.remove("text-token-list-active-selection-foreground");
      inner.querySelector("svg")?.classList.remove("text-token-list-active-selection-icon-foreground");
    }
  }
}
function activatePage(page) {
  const content = findContentArea();
  if (!content) {
    plog("activate: content area not found");
    return;
  }
  state.activePage = page;
  plog("activate", { page });
  for (const child of Array.from(content.children)) {
    if (child.dataset.codexpp === "tweaks-panel") continue;
    if (child.dataset.codexppHidden === void 0) {
      child.dataset.codexppHidden = child.style.display || "";
    }
    child.style.display = "none";
  }
  let panel = content.querySelector('[data-codexpp="tweaks-panel"]');
  if (!panel) {
    panel = document.createElement("div");
    panel.dataset.codexpp = "tweaks-panel";
    panel.style.cssText = "width:100%;height:100%;overflow:auto;";
    content.appendChild(panel);
  }
  panel.style.display = "block";
  state.panelHost = panel;
  rerender();
  setNavActive(page);
  const sidebar = state.sidebarRoot;
  if (sidebar) {
    if (state.sidebarRestoreHandler) {
      sidebar.removeEventListener("click", state.sidebarRestoreHandler, true);
    }
    const handler = (e) => {
      const target = e.target;
      if (!target) return;
      if (state.navGroup?.contains(target)) return;
      if (state.pagesGroup?.contains(target)) return;
      if (target.closest("[data-codexpp-settings-search]")) return;
      restoreCodexView();
    };
    state.sidebarRestoreHandler = handler;
    sidebar.addEventListener("click", handler, true);
  }
}
function restoreCodexView() {
  plog("restore codex view");
  const content = findContentArea();
  if (!content) return;
  if (state.panelHost) state.panelHost.style.display = "none";
  for (const child of Array.from(content.children)) {
    if (child === state.panelHost) continue;
    if (child.dataset.codexppHidden !== void 0) {
      child.style.display = child.dataset.codexppHidden;
      delete child.dataset.codexppHidden;
    }
  }
  state.activePage = null;
  setNavActive(null);
  if (state.sidebarRoot && state.sidebarRestoreHandler) {
    state.sidebarRoot.removeEventListener(
      "click",
      state.sidebarRestoreHandler,
      true
    );
    state.sidebarRestoreHandler = null;
  }
}
function rerender() {
  if (!state.activePage) return;
  const host = state.panelHost;
  if (!host) return;
  host.innerHTML = "";
  const ap = state.activePage;
  if (ap.kind === "registered") {
    const entry = state.pages.get(ap.id);
    if (!entry) {
      restoreCodexView();
      return;
    }
    const root2 = panelShell(entry.page.title, entry.page.description);
    host.appendChild(root2.outer);
    try {
      try {
        entry.teardown?.();
      } catch {
      }
      entry.teardown = null;
      const ret = entry.page.render(root2.sectionsWrap);
      if (typeof ret === "function") entry.teardown = ret;
    } catch (e) {
      const err = document.createElement("div");
      err.className = "text-token-charts-red text-sm";
      err.textContent = `Error rendering page: ${e.message}`;
      root2.sectionsWrap.appendChild(err);
    }
    return;
  }
  const title = ap.kind === "tweaks" ? "Tweaks" : ap.kind === "store" ? "Tweak Store" : "Codex++";
  const subtitle = ap.kind === "tweaks" ? "Manage your installed Codex++ tweaks." : ap.kind === "store" ? "Install reviewed tweaks pinned to approved GitHub commits." : "Checking installed Codex++ version.";
  const root = panelShell(title, subtitle);
  host.appendChild(root.outer);
  if (ap.kind === "tweaks") renderTweaksPage(root.sectionsWrap);
  else if (ap.kind === "store") renderTweakStorePage(root.sectionsWrap, root.headerActions);
  else renderConfigPage(root.sectionsWrap, root.subtitle);
}
function renderConfigPage(sectionsWrap, subtitle) {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  card.dataset.codexppConfigCard = "true";
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
    if (subtitle) {
      subtitle.textContent = `You have Codex++ ${config.version} installed.`;
    }
    card.textContent = "";
    renderCodexPlusPlusConfig(card, config);
  }).catch((e) => {
    if (subtitle) subtitle.textContent = "Could not load installed Codex++ version.";
    card.textContent = "";
    card.appendChild(rowSimple("Could not load update settings", String(e)));
  });
  const watcher = document.createElement("section");
  watcher.className = "flex flex-col gap-2";
  watcher.appendChild(sectionTitle("Auto-Repair Watcher"));
  const watcherCard = roundedCard();
  watcherCard.appendChild(rowSimple("Checking watcher", "Verifying the updater repair service."));
  watcher.appendChild(watcherCard);
  sectionsWrap.appendChild(watcher);
  renderWatcherHealthCard(watcherCard);
  const maintenance = document.createElement("section");
  maintenance.className = "flex flex-col gap-2";
  maintenance.appendChild(sectionTitle("Maintenance"));
  const maintenanceCard = roundedCard();
  maintenanceCard.appendChild(uninstallRow());
  maintenanceCard.appendChild(reportBugRow());
  maintenance.appendChild(maintenanceCard);
  sectionsWrap.appendChild(maintenance);
}
function renderCodexPlusPlusConfig(card, config) {
  setSidebarCodexPlusPlusUpdateButton(config.updateCheck);
  card.appendChild(autoUpdateRow(config));
  card.appendChild(updateChannelRow(config));
  card.appendChild(installationSourceRow(config.installationSource));
  card.appendChild(selfUpdateStatusRow(config.selfUpdate));
  card.appendChild(checkForUpdatesRow(config));
  if (config.updateCheck) card.appendChild(releaseNotesRow(config.updateCheck));
}
function autoUpdateRow(config) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = "Automatically refresh Codex++";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = `Installed version v${config.version}. The watcher checks hourly and can refresh the Codex++ runtime automatically.`;
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  row.appendChild(
    switchControl(config.autoUpdate, async (next) => {
      await import_electron.ipcRenderer.invoke("codexpp:set-auto-update", next);
    })
  );
  return row;
}
function updateChannelRow(config) {
  const row = actionRow("Release channel", updateChannelSummary(config));
  const action = row.querySelector("[data-codexpp-row-actions]");
  const select = document.createElement("select");
  select.className = "h-8 rounded-lg border border-token-border bg-transparent px-2 text-sm text-token-text-primary focus:outline-none";
  for (const [value, label] of [
    ["stable", "Stable"],
    ["prerelease", "Prerelease"],
    ["custom", "Custom"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = config.updateChannel === value;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    void import_electron.ipcRenderer.invoke("codexpp:set-update-config", { updateChannel: select.value }).then(() => refreshConfigCard(row)).catch((e) => plog("set update channel failed", String(e)));
  });
  action?.appendChild(select);
  if (config.updateChannel === "custom") {
    action?.appendChild(
      compactButton("Edit", () => {
        const repo = window.prompt("GitHub repo", config.updateRepo || "b-nnett/codex-plusplus");
        if (repo === null) return;
        const ref = window.prompt("Git ref", config.updateRef || "main");
        if (ref === null) return;
        void import_electron.ipcRenderer.invoke("codexpp:set-update-config", {
          updateChannel: "custom",
          updateRepo: repo,
          updateRef: ref
        }).then(() => refreshConfigCard(row)).catch((e) => plog("set custom update source failed", String(e)));
      })
    );
  }
  return row;
}
function installationSourceRow(source) {
  return rowSimple("Installation source", `${source.label}: ${source.detail}`);
}
function selfUpdateStatusRow(state2) {
  const row = rowSimple("Last Codex++ update", selfUpdateSummary(state2));
  const left = row.firstElementChild;
  if (left && state2) left.prepend(statusBadge(selfUpdateStatusTone(state2.status), selfUpdateStatusLabel(state2.status)));
  return row;
}
function checkForUpdatesRow(config) {
  const check = config.updateCheck;
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = check?.updateAvailable ? "Codex++ update available" : "Check for Codex++ updates";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = updateSummary(check);
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  const actions = document.createElement("div");
  actions.className = "flex shrink-0 items-center gap-2";
  if (check?.releaseUrl) {
    actions.appendChild(
      compactButton("Release Notes", () => {
        void import_electron.ipcRenderer.invoke("codexpp:open-external", check.releaseUrl);
      })
    );
  }
  actions.appendChild(
    compactButton("Check Now", () => {
      row.style.opacity = "0.65";
      void import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", true).then((check2) => {
        setSidebarCodexPlusPlusUpdateButton(check2);
        refreshConfigCard(row);
      }).catch((e) => plog("Codex++ release check failed", String(e))).finally(() => {
        row.style.opacity = "";
      });
    })
  );
  actions.appendChild(
    compactButton("Download Update", () => {
      row.style.opacity = "0.65";
      const buttons = actions.querySelectorAll("button");
      buttons.forEach((button2) => button2.disabled = true);
      void import_electron.ipcRenderer.invoke("codexpp:run-codexpp-update").then(() => {
        refreshSidebarCodexPlusPlusUpdateButton(true);
        refreshConfigCard(row);
      }).catch((e) => {
        plog("Codex++ self-update failed", String(e));
        void refreshConfigCard(row);
      }).finally(() => {
        row.style.opacity = "";
        buttons.forEach((button2) => button2.disabled = false);
      });
    })
  );
  row.appendChild(actions);
  return row;
}
function releaseNotesRow(check) {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-2 p-3";
  const title = document.createElement("div");
  title.className = "text-sm text-token-text-primary";
  title.textContent = "Latest release notes";
  row.appendChild(title);
  const body = document.createElement("div");
  body.className = "max-h-60 overflow-auto rounded-md border border-token-border bg-token-foreground/5 p-3 text-sm text-token-text-secondary";
  body.appendChild(renderReleaseNotesMarkdown(check.releaseNotes?.trim() || check.error || "No release notes available."));
  row.appendChild(body);
  return row;
}
function renderReleaseNotesMarkdown(markdown) {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-2";
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph = [];
  let list = null;
  let codeLines = null;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const p = document.createElement("p");
    p.className = "m-0 leading-5";
    appendInlineMarkdown(p, paragraph.join(" ").trim());
    root.appendChild(p);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    root.appendChild(list);
    list = null;
  };
  const flushCode = () => {
    if (!codeLines) return;
    const pre = document.createElement("pre");
    pre.className = "m-0 overflow-auto rounded-md border border-token-border bg-token-foreground/10 p-2 text-xs text-token-text-primary";
    const code = document.createElement("code");
    code.textContent = codeLines.join("\n");
    pre.appendChild(code);
    root.appendChild(pre);
    codeLines = null;
  };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (codeLines) flushCode();
      else {
        flushParagraph();
        flushList();
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const h = document.createElement(heading[1].length === 1 ? "h3" : "h4");
      h.className = "m-0 text-sm font-medium text-token-text-primary";
      appendInlineMarkdown(h, heading[2]);
      root.appendChild(h);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const wantOrdered = Boolean(ordered);
      if (!list || wantOrdered && list.tagName !== "OL" || !wantOrdered && list.tagName !== "UL") {
        flushList();
        list = document.createElement(wantOrdered ? "ol" : "ul");
        list.className = wantOrdered ? "m-0 list-decimal space-y-1 pl-5 leading-5" : "m-0 list-disc space-y-1 pl-5 leading-5";
      }
      const li = document.createElement("li");
      appendInlineMarkdown(li, (unordered ?? ordered)?.[1] ?? "");
      list.appendChild(li);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      const blockquote = document.createElement("blockquote");
      blockquote.className = "m-0 border-l-2 border-token-border pl-3 leading-5";
      appendInlineMarkdown(blockquote, quote[1]);
      root.appendChild(blockquote);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  flushCode();
  return root;
}
function appendInlineMarkdown(parent, text) {
  const pattern = /(`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === void 0) continue;
    appendText(parent, text.slice(lastIndex, match.index));
    if (match[2] !== void 0) {
      const code = document.createElement("code");
      code.className = "rounded border border-token-border bg-token-foreground/10 px-1 py-0.5 text-xs text-token-text-primary";
      code.textContent = match[2];
      parent.appendChild(code);
    } else if (match[3] !== void 0 && match[4] !== void 0) {
      const a = document.createElement("a");
      a.className = "text-token-text-primary underline underline-offset-2";
      a.href = match[4];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[3];
      parent.appendChild(a);
    } else if (match[5] !== void 0) {
      const strong = document.createElement("strong");
      strong.className = "font-medium text-token-text-primary";
      strong.textContent = match[5];
      parent.appendChild(strong);
    } else if (match[6] !== void 0) {
      const em = document.createElement("em");
      em.textContent = match[6];
      parent.appendChild(em);
    }
    lastIndex = match.index + match[0].length;
  }
  appendText(parent, text.slice(lastIndex));
}
function appendText(parent, text) {
  if (text) parent.appendChild(document.createTextNode(text));
}
function renderWatcherHealthCard(card) {
  void import_electron.ipcRenderer.invoke("codexpp:get-watcher-health").then((health) => {
    card.textContent = "";
    renderWatcherHealth(card, health);
  }).catch((e) => {
    card.textContent = "";
    card.appendChild(rowSimple("Could not check watcher", String(e)));
  });
}
function renderWatcherHealth(card, health) {
  card.appendChild(watcherSummaryRow(health));
  for (const check of health.checks) {
    if (check.status === "ok") continue;
    card.appendChild(watcherCheckRow(check));
  }
}
function watcherSummaryRow(health) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 items-start gap-3";
  left.appendChild(statusBadge(health.status, health.watcher));
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = health.title;
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = `${health.summary} Checked ${new Date(health.checkedAt).toLocaleString()}.`;
  stack.appendChild(title);
  stack.appendChild(desc);
  left.appendChild(stack);
  row.appendChild(left);
  const action = document.createElement("div");
  action.className = "flex shrink-0 items-center gap-2";
  action.appendChild(
    compactButton("Check Now", () => {
      const card = row.parentElement;
      if (!card) return;
      card.textContent = "";
      card.appendChild(rowSimple("Checking watcher", "Verifying the updater repair service."));
      renderWatcherHealthCard(card);
    })
  );
  row.appendChild(action);
  return row;
}
function watcherCheckRow(check) {
  const row = rowSimple(check.name, check.detail);
  const left = row.firstElementChild;
  if (left) left.prepend(statusBadge(check.status));
  return row;
}
function statusBadge(status, label) {
  const badge = document.createElement("span");
  const tone = status === "ok" ? "border-token-charts-green text-token-charts-green" : status === "warn" ? "border-token-charts-yellow text-token-charts-yellow" : "border-token-charts-red text-token-charts-red";
  badge.className = `inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`;
  badge.textContent = label || (status === "ok" ? "OK" : status === "warn" ? "Review" : "Error");
  return badge;
}
function updateSummary(check) {
  if (!check) return "No update check has run yet.";
  const latest = check.latestVersion ? `Latest v${check.latestVersion}. ` : "";
  const checked = `Checked ${new Date(check.checkedAt).toLocaleString()}.`;
  if (check.error) return `${latest}${checked} ${check.error}`;
  return `${latest}${checked}`;
}
function updateChannelSummary(config) {
  if (config.updateChannel === "custom") {
    return `${config.updateRepo || "b-nnett/codex-plusplus"} ${config.updateRef || "(no ref set)"}`;
  }
  if (config.updateChannel === "prerelease") {
    return "Use the newest published GitHub release, including prereleases.";
  }
  return "Use the latest stable GitHub release.";
}
function selfUpdateSummary(state2) {
  if (!state2) return "No automatic Codex++ update has run yet.";
  const checked = new Date(state2.completedAt ?? state2.checkedAt).toLocaleString();
  const target = state2.latestVersion ? ` Target v${state2.latestVersion}.` : state2.targetRef ? ` Target ${state2.targetRef}.` : "";
  const source = state2.installationSource?.label ?? "unknown source";
  if (state2.status === "failed") return `Failed ${checked}.${target} ${state2.error ?? "Unknown error"}`;
  if (state2.status === "updated") return `Updated ${checked}.${target} Source: ${source}.`;
  if (state2.status === "up-to-date") return `Up to date ${checked}.${target} Source: ${source}.`;
  if (state2.status === "disabled") return `Skipped ${checked}; automatic refresh is disabled.`;
  return `Checking for updates. Source: ${source}.`;
}
function selfUpdateStatusTone(status) {
  if (status === "failed") return "error";
  if (status === "disabled" || status === "checking") return "warn";
  return "ok";
}
function selfUpdateStatusLabel(status) {
  if (status === "up-to-date") return "Up to date";
  if (status === "updated") return "Updated";
  if (status === "failed") return "Failed";
  if (status === "disabled") return "Disabled";
  return "Checking";
}
function refreshConfigCard(row) {
  const card = row.closest("[data-codexpp-config-card]");
  if (!card) return;
  card.textContent = "";
  card.appendChild(rowSimple("Refreshing", "Loading current Codex++ update status."));
  void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
    card.textContent = "";
    renderCodexPlusPlusConfig(card, config);
  }).catch((e) => {
    card.textContent = "";
    card.appendChild(rowSimple("Could not refresh update settings", String(e)));
  });
}
function uninstallRow() {
  const row = actionRow(
    "Uninstall Codex++",
    "Copies the uninstall command. Run it from a terminal after quitting Codex."
  );
  const action = row.querySelector("[data-codexpp-row-actions]");
  action?.appendChild(
    compactButton("Copy Command", () => {
      void import_electron.ipcRenderer.invoke("codexpp:copy-text", "node ~/.codex-plusplus/source/packages/installer/dist/cli.js uninstall").catch((e) => plog("copy uninstall command failed", String(e)));
    })
  );
  return row;
}
function reportBugRow() {
  const row = actionRow(
    "Report a bug",
    "Open a GitHub issue with runtime, installer, or tweak-manager details."
  );
  const action = row.querySelector("[data-codexpp-row-actions]");
  action?.appendChild(
    compactButton("Open Issue", () => {
      const title = encodeURIComponent("[Bug]: ");
      const body = encodeURIComponent(
        [
          "## What happened?",
          "",
          "## Steps to reproduce",
          "1. ",
          "",
          "## Environment",
          "- Codex++ version: ",
          "- Codex app version: ",
          "- OS: ",
          "",
          "## Logs",
          "Attach relevant lines from the Codex++ log directory."
        ].join("\n")
      );
      void import_electron.ipcRenderer.invoke(
        "codexpp:open-external",
        `https://github.com/b-nnett/codex-plusplus/issues/new?title=${title}&body=${body}`
      );
    })
  );
  return row;
}
function actionRow(titleText, description) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = titleText;
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = description;
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  const actions = document.createElement("div");
  actions.dataset.codexppRowActions = "true";
  actions.className = "flex shrink-0 items-center gap-2";
  row.appendChild(actions);
  return row;
}
function renderTweakStorePage(sectionsWrap, headerActions) {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-4";
  const source = document.createElement("span");
  source.hidden = true;
  source.dataset.codexppStoreSource = "true";
  source.textContent = "Loading live registry";
  const actions = document.createElement("div");
  actions.className = "flex shrink-0 items-center gap-2";
  const refreshBtn = storeIconButton(refreshIconSvg(), "Refresh tweak store", () => {
    refreshBtn.disabled = true;
    updateStoreUpdateBadge(null);
    grid.textContent = "";
    renderTweakStoreGhostGrid(grid);
    refreshTweakStoreGrid(grid, source, refreshBtn, true);
  });
  actions.appendChild(refreshBtn);
  actions.appendChild(storeToolbarButton("Publish Tweak", openPublishTweakDialog, "primary"));
  if (headerActions) {
    headerActions.replaceChildren(actions);
  }
  const grid = document.createElement("div");
  grid.dataset.codexppStoreGrid = "true";
  grid.className = "grid gap-4";
  if (state.tweakStore) {
    grid.dataset.codexppStore = JSON.stringify(state.tweakStore);
    renderTweakStoreGrid(grid, source);
  } else {
    renderTweakStoreGhostGrid(grid);
  }
  section.appendChild(source);
  section.appendChild(grid);
  sectionsWrap.appendChild(section);
  refreshTweakStoreGrid(grid, source, refreshBtn);
}
function refreshTweakStoreGrid(grid, source, refreshBtn, force = false) {
  void getTweakStore(force).then((store) => {
    grid.dataset.codexppStore = JSON.stringify(store);
    renderTweakStoreGrid(grid, source);
  }).catch((e) => {
    grid.dataset.codexppStore = "";
    grid.removeAttribute("aria-busy");
    source.textContent = "Live registry unavailable";
    updateStoreUpdateBadge(null);
    grid.textContent = "";
    grid.appendChild(storeMessageCard("Could not load tweak store", String(e)));
  }).finally(() => {
    if (refreshBtn) refreshBtn.disabled = false;
  });
}
function warmTweakStore() {
  if (state.tweakStore || state.tweakStorePromise) return;
  void getTweakStore().then((store) => {
    updateStoreUpdateBadge(outdatedInstalledStoreCount(store.entries));
  });
}
function getTweakStore(force = false) {
  if (!force) {
    if (state.tweakStore) return Promise.resolve(state.tweakStore);
    if (state.tweakStorePromise) return state.tweakStorePromise;
  }
  state.tweakStoreError = null;
  const promise = import_electron.ipcRenderer.invoke("codexpp:get-tweak-store").then((store) => {
    state.tweakStore = store;
    return state.tweakStore;
  }).catch((e) => {
    state.tweakStoreError = e;
    throw e;
  }).finally(() => {
    if (state.tweakStorePromise === promise) state.tweakStorePromise = null;
  });
  state.tweakStorePromise = promise;
  return promise;
}
function renderTweakStoreGrid(grid, source) {
  const store = parseStoreDataset(grid);
  if (!store) return;
  const entries = store.entries;
  grid.removeAttribute("aria-busy");
  source.textContent = `Refreshed ${new Date(store.fetchedAt).toLocaleString()}`;
  updateStoreUpdateBadge(outdatedInstalledStoreCount(entries));
  grid.textContent = "";
  if (store.entries.length === 0) {
    grid.appendChild(storeMessageCard("No tweaks yet", "Use Publish Tweak to submit the first one."));
    return;
  }
  for (const entry of entries) grid.appendChild(tweakStoreCard(entry));
}
function parseStoreDataset(grid) {
  const raw = grid.dataset.codexppStore;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function tweakStoreCard(entry) {
  const shell = tweakStoreCardShell();
  const { card, left, stack, versions, actions } = shell;
  left.insertBefore(storeAvatar(entry), stack);
  const titleRow = tweakStoreTitleRow();
  const title = document.createElement("div");
  title.className = "min-w-0 text-lg font-semibold leading-7 text-token-foreground";
  title.textContent = entry.manifest.name;
  titleRow.appendChild(title);
  titleRow.appendChild(verifiedSafeBadge());
  stack.appendChild(titleRow);
  if (entry.manifest.description) {
    const desc = tweakStoreDescription();
    desc.textContent = entry.manifest.description;
    stack.appendChild(desc);
  }
  stack.appendChild(tweakStoreReadMoreButton(entry.repo));
  versions.appendChild(tweakStoreVersionBadge(entry));
  if (entry.releaseUrl) {
    actions.appendChild(
      compactButton("Release", () => {
        void import_electron.ipcRenderer.invoke("codexpp:open-external", entry.releaseUrl);
      })
    );
  }
  const hasUpdate = !!entry.installed && isStoreUpdateAvailable(entry.installed.version, entry.manifest.version);
  if (entry.installed && !hasUpdate) {
    actions.appendChild(storeStatusPill("Installed"));
  } else if (entry.platform && !entry.platform.compatible) {
    card.classList.add("opacity-70");
    actions.appendChild(storeStatusPill(platformLockedLabel(entry.platform)));
  } else if (entry.runtime && !entry.runtime.compatible) {
    card.classList.add("opacity-70");
    actions.appendChild(storeStatusPill(runtimeLockedLabel(entry.runtime)));
  } else {
    const installLabel = entry.installed ? "Update" : "Install";
    if (hasUpdate) actions.appendChild(storeStatusPill("Update available", "info"));
    const installButton = storeInstallButton(installLabel, (button2) => {
      const grid = card.closest("[data-codexpp-store-grid]");
      const source = grid?.parentElement?.querySelector("[data-codexpp-store-source]");
      showStoreButtonLoading(button2, entry.installed ? "Updating" : "Installing");
      actions.querySelectorAll("button").forEach((button3) => button3.disabled = true);
      void import_electron.ipcRenderer.invoke("codexpp:install-store-tweak", entry.id).then(() => {
        showStoreToast(`${entry.manifest.name} installed.`);
        showStoreButtonInstalled(button2);
        versions.replaceChildren(tweakStoreVersionBadge(entry, entry.manifest.version));
        updateStoreUpdateBadge(Math.max(0, currentStoreUpdateBadgeCount() - 1));
        setTimeout(() => {
          actions.replaceChildren(storeStatusPill("Installed"));
          if (grid && source) refreshTweakStoreGrid(grid, source, void 0, true);
        }, 900);
      }).catch((e) => {
        resetStoreInstallButton(button2, installLabel);
        actions.querySelectorAll("button").forEach((button3) => button3.disabled = false);
        showStoreCardMessage(card, String(e.message ?? e));
      });
    });
    actions.appendChild(installButton);
  }
  return card;
}
function platformLockedLabel(platform) {
  const supported = platform.supported ?? [];
  if (supported.includes("win32")) return "Windows only";
  if (supported.includes("darwin")) return "macOS only";
  if (supported.includes("linux")) return "Linux only";
  return "Unavailable";
}
function runtimeLockedLabel(runtime) {
  return runtime.required ? `Requires Codex++ ${runtime.required}` : "Requires newer Codex++";
}
function showStoreCardMessage(card, message) {
  card.querySelector("[data-codexpp-store-card-message]")?.remove();
  const notice = document.createElement("div");
  notice.dataset.codexppStoreCardMessage = "true";
  notice.className = "rounded-lg border border-token-border/50 bg-token-foreground/5 px-3 py-2 text-sm leading-5 text-token-description-foreground";
  notice.textContent = message;
  const actions = card.lastElementChild;
  if (actions) card.insertBefore(notice, actions);
  else card.appendChild(notice);
}
function tweakStoreCardShell() {
  const card = document.createElement("div");
  card.className = "border-token-border/40 flex min-h-[190px] flex-col justify-between gap-4 rounded-2xl border p-4 transition-colors hover:bg-token-foreground/5";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-1 flex-col gap-2";
  left.appendChild(stack);
  card.appendChild(left);
  const footer = document.createElement("div");
  footer.className = "mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2";
  const versions = document.createElement("div");
  versions.className = "flex min-w-0 flex-1 items-center gap-2";
  footer.appendChild(versions);
  const actions = document.createElement("div");
  actions.className = "flex shrink-0 items-center justify-end gap-2";
  footer.appendChild(actions);
  card.appendChild(footer);
  return { card, left, stack, versions, actions };
}
function tweakStoreTitleRow() {
  const titleRow = document.createElement("div");
  titleRow.className = "flex min-w-0 items-start justify-between gap-3";
  return titleRow;
}
function tweakStoreDescription() {
  const desc = document.createElement("div");
  desc.className = "line-clamp-3 min-w-0 text-sm leading-5 text-token-text-secondary";
  return desc;
}
function tweakStoreReadMoreButton(repo) {
  const readMore = document.createElement("button");
  readMore.type = "button";
  readMore.className = "inline-flex w-fit items-center gap-1 text-sm font-medium text-token-text-link-foreground hover:underline";
  readMore.innerHTML = `Read More<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5h6.5V10M12.25 3.75 4 12" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  readMore.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void import_electron.ipcRenderer.invoke("codexpp:open-external", `https://github.com/${repo}`);
  });
  return readMore;
}
function renderTweakStoreGhostGrid(grid) {
  grid.setAttribute("aria-busy", "true");
  grid.textContent = "";
  grid.appendChild(tweakStoreGhostCard());
}
function tweakStoreGhostCard() {
  const { card, left, stack, versions, actions } = tweakStoreCardShell();
  card.classList.add("pointer-events-none");
  card.setAttribute("aria-hidden", "true");
  left.insertBefore(storeAvatarGhost(), stack);
  const titleRow = tweakStoreTitleRow();
  const title = document.createElement("div");
  title.className = "min-w-0 text-lg font-semibold leading-7 text-token-foreground";
  title.appendChild(ghostBlock("my-1 h-5 w-44 rounded-md"));
  titleRow.appendChild(title);
  titleRow.appendChild(verifiedSafeGhostBadge());
  stack.appendChild(titleRow);
  const desc = tweakStoreDescription();
  desc.appendChild(ghostBlock("mt-1 h-3 w-full rounded"));
  desc.appendChild(ghostBlock("mt-2 h-3 w-11/12 rounded"));
  desc.appendChild(ghostBlock("mt-2 h-3 w-7/12 rounded"));
  stack.appendChild(desc);
  const readMore = tweakStoreReadMoreButton("");
  readMore.replaceChildren(ghostBlock("h-5 w-24 rounded"));
  stack.appendChild(readMore);
  versions.appendChild(storeVersionGhostBadge());
  actions.appendChild(storeStatusGhostPill());
  return card;
}
function storeAvatarGhost() {
  const avatar = document.createElement("div");
  avatar.className = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-token-border-default bg-transparent text-token-description-foreground";
  avatar.appendChild(ghostBlock("h-full w-full"));
  return avatar;
}
function verifiedSafeGhostBadge() {
  const badge = verifiedSafeBadge();
  badge.replaceChildren(ghostBlock("h-[13px] w-[13px] rounded-sm"), ghostBlock("h-3 w-20 rounded"));
  return badge;
}
function storeStatusGhostPill() {
  const pill = storeStatusPill("Installed");
  pill.classList.add("animate-pulse");
  pill.style.color = "transparent";
  return pill;
}
function storeVersionGhostBadge() {
  const badge = storeVersionBadgeShell(false);
  badge.appendChild(ghostBlock("h-3 w-36 rounded"));
  return badge;
}
function ghostBlock(className) {
  const block = document.createElement("div");
  block.className = `animate-pulse bg-token-foreground/10 ${className}`;
  block.setAttribute("aria-hidden", "true");
  return block;
}
function storeAvatar(entry) {
  const avatar = document.createElement("div");
  avatar.className = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-token-border-default bg-transparent text-token-description-foreground";
  const initial = (entry.manifest.name?.[0] ?? "?").toUpperCase();
  const fallback = document.createElement("span");
  fallback.textContent = initial;
  avatar.appendChild(fallback);
  const iconUrl = storeEntryIconUrl(entry);
  if (iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.className = "h-full w-full object-cover";
    img.style.display = "none";
    img.addEventListener("load", () => {
      fallback.remove();
      img.style.display = "";
    });
    img.addEventListener("error", () => {
      img.remove();
    });
    img.src = iconUrl;
    avatar.appendChild(img);
  }
  return avatar;
}
function storeEntryIconUrl(entry) {
  const iconUrl = entry.manifest.iconUrl?.trim();
  if (!iconUrl) return null;
  if (/^(https?:|data:)/i.test(iconUrl)) return iconUrl;
  const rel = iconUrl.replace(/^\.?\//, "");
  if (!rel || rel.startsWith("../")) return null;
  return `https://raw.githubusercontent.com/${entry.repo}/${entry.approvedCommitSha}/${rel}`;
}
function sidebarUpdatePillButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexppSidebarUpdate = "true";
  btn.className = "user-select-none no-drag cursor-interaction inline-flex shrink-0 items-center justify-center whitespace-nowrap";
  Object.assign(btn.style, {
    display: "none",
    height: "20px",
    borderRadius: "9999px",
    border: "0",
    background: "#0A84FF",
    color: "#FFFFFF",
    padding: "0 8px",
    fontSize: "10px",
    fontWeight: "700",
    lineHeight: "20px",
    letterSpacing: "0",
    textTransform: "none",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.18)"
  });
  btn.textContent = "Update";
  btn.title = "Open Codex++ update";
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#0071E3";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#0A84FF";
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void import_electron.ipcRenderer.invoke("codexpp:open-external", btn.dataset.codexppReleaseUrl || CODEX_PLUSPLUS_RELEASES_URL);
  });
  return btn;
}
function refreshSidebarCodexPlusPlusUpdateButton(force = false) {
  const btn = state.codexPlusPlusUpdateButton;
  if (!btn) return;
  void import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", force).then((check) => setSidebarCodexPlusPlusUpdateButton(check)).catch((e) => {
    plog("Codex++ sidebar release check failed", String(e));
    setSidebarCodexPlusPlusUpdateButton(null);
  });
}
function setSidebarCodexPlusPlusUpdateButton(check) {
  const btn = state.codexPlusPlusUpdateButton;
  if (!btn) return;
  const updateAvailable = check?.updateAvailable === true;
  btn.style.display = updateAvailable ? "inline-flex" : "none";
  btn.hidden = !updateAvailable;
  btn.dataset.codexppReleaseUrl = check?.releaseUrl || CODEX_PLUSPLUS_RELEASES_URL;
  btn.title = updateAvailable && check?.latestVersion ? `Open Codex++ ${check.latestVersion} update` : "Open Codex++ update";
}
function updateStoreUpdateBadge(count) {
  const badge = document.querySelector("[data-codexpp-store-update-badge]");
  if (!badge) return;
  badge.dataset.codexppStoreUpdateCount = count === null ? "" : String(count);
  applyStoreUpdateBadgeStyle(badge, count);
  badge.hidden = count === null || count <= 0;
  badge.textContent = count && count > 0 ? String(count) : "";
  badge.title = count && count > 0 ? `${count} installed tweak${count === 1 ? "" : "s"} can be updated` : "Installed tweaks are up to date";
}
function applyStoreUpdateBadgeStyle(badge, count) {
  const hasUpdates = !!count && count > 0;
  Object.assign(badge.style, {
    minWidth: "24px",
    height: "20px",
    borderRadius: "9999px",
    border: "0",
    background: hasUpdates ? "#0A84FF" : "transparent",
    color: "#FFFFFF",
    padding: "0 7px",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "20px",
    letterSpacing: "0",
    boxShadow: hasUpdates ? "0 1px 2px rgba(0, 0, 0, 0.22)" : "none"
  });
}
function currentStoreUpdateBadgeCount() {
  const badge = document.querySelector("[data-codexpp-store-update-badge]");
  const raw = badge?.dataset.codexppStoreUpdateCount;
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
function outdatedInstalledStoreCount(entries) {
  return entries.filter(
    (entry) => !!entry.installed && isStoreUpdateAvailable(entry.installed.version, entry.manifest.version)
  ).length;
}
function storeToolbarButton(label, onClick, variant = "secondary") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = variant === "primary" ? "border-token-border user-select-none no-drag cursor-interaction flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-token-border bg-token-bg-fog px-2 py-0 text-sm text-token-button-tertiary-foreground enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40" : "border-token-border user-select-none no-drag cursor-interaction flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-transparent bg-token-foreground/5 px-2 py-0 text-sm text-token-foreground enabled:hover:bg-token-foreground/10 disabled:cursor-not-allowed disabled:opacity-40";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function storeIconButton(iconSvg, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "border-token-border user-select-none no-drag cursor-interaction flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-token-foreground/5 p-0 text-token-foreground enabled:hover:bg-token-foreground/10 disabled:cursor-not-allowed disabled:opacity-40";
  btn.innerHTML = iconSvg;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function refreshIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" class="icon-xs" aria-hidden="true"><path d="M4.4 9.35A5.65 5.65 0 0 1 14 5.3L15.75 7M15.75 3.75V7h-3.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.6 10.65A5.65 5.65 0 0 1 6 14.7L4.25 13M4.25 16.25V13H7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function verifiedSafeBadge() {
  const badge = document.createElement("span");
  badge.className = "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-token-border/30 bg-transparent px-2 text-xs font-medium text-token-description-foreground";
  badge.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" class="text-blue-500" aria-hidden="true"><path d="M7 1.75 11.25 3.4v3.2c0 2.6-1.65 4.25-4.25 5.4-2.6-1.15-4.25-2.8-4.25-5.4V3.4L7 1.75Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M4.85 7.05 6.3 8.45l2.85-3.05" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Verified as safe</span>`;
  return badge;
}
function tweakStoreVersionBadge(entry, installedOverride) {
  const installed = installedOverride ?? entry.installed?.version ?? null;
  const latest = entry.manifest.version;
  const hasUpdate = !!installed && isStoreUpdateAvailable(installed, latest);
  const installedAhead = !!installed && isStoreUpdateAvailable(latest, installed);
  const badge = storeVersionBadgeShell(hasUpdate);
  const label = document.createElement("span");
  label.className = "truncate";
  label.textContent = installed ? installedAhead ? `Installed v${installed} \xB7 Approved v${latest}` : `Installed v${installed} \xB7 Latest v${latest}` : `Latest v${latest}`;
  badge.title = installed ? `Installed version ${installed}. ${installedAhead ? "Store-approved" : "Latest approved"} version ${latest}.` : `Latest approved version ${latest}.`;
  badge.appendChild(label);
  return badge;
}
function storeVersionBadgeShell(hasUpdate) {
  const badge = document.createElement("span");
  badge.className = [
    "inline-flex h-8 min-w-0 max-w-full items-center rounded-lg border px-2.5 text-xs font-medium",
    hasUpdate ? "border-blue-500/30 bg-blue-500/10 text-token-foreground" : "border-token-border/40 bg-token-foreground/5 text-token-description-foreground"
  ].join(" ");
  return badge;
}
function storeStatusPill(label, tone = "neutral") {
  const pill = document.createElement("span");
  pill.className = [
    "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium",
    tone === "info" ? "border border-blue-500/30 bg-blue-500/10 text-token-foreground" : "bg-token-foreground/5 text-token-description-foreground"
  ].join(" ");
  pill.textContent = label;
  return pill;
}
function storeInstallButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = storeInstallButtonClass();
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}
function storeInstallButtonClass(extra = "") {
  return [
    "border-token-border user-select-none no-drag cursor-interaction flex h-8 min-w-[82px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-500/40 bg-blue-500 px-3 py-0 text-sm font-medium text-token-foreground shadow-sm transition-colors enabled:hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-80",
    extra
  ].filter(Boolean).join(" ");
}
function showStoreButtonLoading(button2, label) {
  button2.className = storeInstallButtonClass();
  button2.disabled = true;
  button2.setAttribute("aria-busy", "true");
  button2.innerHTML = `<svg class="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2" opacity=".25"/><path d="M13.5 8A5.5 5.5 0 0 0 8 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>${label}</span>`;
}
function showStoreButtonInstalled(button2) {
  button2.className = storeInstallButtonClass("border-blue-500 bg-blue-500");
  button2.disabled = true;
  button2.removeAttribute("aria-busy");
  button2.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.75 8.15 6.65 11 12.25 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Installed</span>`;
}
function resetStoreInstallButton(button2, label) {
  button2.className = storeInstallButtonClass();
  button2.disabled = false;
  button2.removeAttribute("aria-busy");
  button2.textContent = label;
}
function showStoreToast(message) {
  let host = document.querySelector("[data-codexpp-store-toast-host]");
  if (!host) {
    host = document.createElement("div");
    host.dataset.codexppStoreToastHost = "true";
    host.className = "pointer-events-none fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = "translate-y-2 rounded-xl border border-token-border/50 bg-token-main-surface-primary px-3 py-2 text-sm font-medium text-token-foreground opacity-0 shadow-lg transition-all duration-200";
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });
  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => {
      toast.remove();
      if (host && host.childElementCount === 0) host.remove();
    }, 220);
  }, 2600);
}
function storeMessageCard(title, description) {
  const card = document.createElement("div");
  card.className = "border-token-border/40 flex min-h-[84px] flex-col justify-center gap-1 rounded-2xl border p-4 text-sm";
  const t = document.createElement("div");
  t.className = "font-medium text-token-text-primary";
  t.textContent = title;
  card.appendChild(t);
  if (description) {
    const d = document.createElement("div");
    d.className = "text-token-text-secondary";
    d.textContent = description;
    card.appendChild(d);
  }
  return card;
}
function renderTweaksPage(sectionsWrap) {
  const openBtn = openInPlaceButton("Open Tweaks Folder", () => {
    void import_electron.ipcRenderer.invoke("codexpp:reveal", tweaksPath());
  });
  const reloadBtn = openInPlaceButton("Force Reload", () => {
    void import_electron.ipcRenderer.invoke("codexpp:reload-tweaks").catch((e) => plog("force reload (main) failed", String(e))).finally(() => {
      location.reload();
    });
  });
  const reloadSvg = reloadBtn.querySelector("svg");
  if (reloadSvg) {
    reloadSvg.outerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true"><path d="M4 10a6 6 0 0 1 10.24-4.24L16 7.5M16 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10a6 6 0 0 1-10.24 4.24L4 12.5M4 16v-3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  const trailing = document.createElement("div");
  trailing.className = "flex items-center gap-2";
  trailing.appendChild(reloadBtn);
  trailing.appendChild(openBtn);
  if (state.listedTweaks.length === 0) {
    const section = document.createElement("section");
    section.className = "flex flex-col gap-2";
    section.appendChild(sectionTitle("Installed Tweaks", trailing));
    const card2 = roundedCard();
    card2.appendChild(
      rowSimple(
        "No tweaks installed",
        `Drop a tweak folder into ${tweaksPath()} and reload.`
      )
    );
    section.appendChild(card2);
    sectionsWrap.appendChild(section);
    return;
  }
  const sectionsByTweak = /* @__PURE__ */ new Map();
  for (const s of state.sections.values()) {
    const tweakId = s.id.split(":")[0];
    if (!sectionsByTweak.has(tweakId)) sectionsByTweak.set(tweakId, []);
    sectionsByTweak.get(tweakId).push(s);
  }
  const pagesByTweak = /* @__PURE__ */ new Map();
  for (const p of state.pages.values()) {
    if (!pagesByTweak.has(p.tweakId)) pagesByTweak.set(p.tweakId, []);
    pagesByTweak.get(p.tweakId).push(p);
  }
  const wrap = document.createElement("section");
  wrap.className = "flex flex-col gap-2";
  wrap.appendChild(sectionTitle("Installed Tweaks", trailing));
  const card = roundedCard();
  for (const t of state.listedTweaks) {
    card.appendChild(
      tweakRow(
        t,
        sectionsByTweak.get(t.manifest.id) ?? [],
        pagesByTweak.get(t.manifest.id) ?? []
      )
    );
  }
  wrap.appendChild(card);
  sectionsWrap.appendChild(wrap);
}
function tweakRow(t, sections, pages) {
  const m = t.manifest;
  const cell = document.createElement("div");
  cell.className = "flex flex-col";
  if (!t.enabled) cell.style.opacity = "0.7";
  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";
  const avatar = document.createElement("div");
  avatar.className = "flex shrink-0 items-center justify-center rounded-md border border-token-border overflow-hidden text-token-text-secondary";
  avatar.style.width = "56px";
  avatar.style.height = "56px";
  avatar.style.backgroundColor = "var(--color-token-bg-fog, transparent)";
  if (m.iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.className = "size-full object-contain";
    const initial = (m.name?.[0] ?? "?").toUpperCase();
    const fallback = document.createElement("span");
    fallback.className = "text-xl font-medium";
    fallback.textContent = initial;
    avatar.appendChild(fallback);
    img.style.display = "none";
    img.addEventListener("load", () => {
      fallback.remove();
      img.style.display = "";
    });
    img.addEventListener("error", () => {
      img.remove();
    });
    void resolveIconUrl(m.iconUrl, t.dir).then((url) => {
      if (url) img.src = url;
      else img.remove();
    });
    avatar.appendChild(img);
  } else {
    const initial = (m.name?.[0] ?? "?").toUpperCase();
    const span = document.createElement("span");
    span.className = "text-xl font-medium";
    span.textContent = initial;
    avatar.appendChild(span);
  }
  left.appendChild(avatar);
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-0.5";
  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center gap-2";
  const name = document.createElement("div");
  name.className = "min-w-0 text-sm font-medium text-token-text-primary";
  name.textContent = m.name;
  titleRow.appendChild(name);
  if (m.version) {
    const ver = document.createElement("span");
    ver.className = "text-token-text-secondary text-xs font-normal tabular-nums";
    ver.textContent = `v${m.version}`;
    titleRow.appendChild(ver);
  }
  if (t.update?.updateAvailable) {
    const badge = document.createElement("span");
    badge.className = "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] font-medium text-token-text-primary";
    badge.textContent = "Update Available";
    titleRow.appendChild(badge);
  }
  stack.appendChild(titleRow);
  if (m.description) {
    const desc = document.createElement("div");
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = m.description;
    stack.appendChild(desc);
  }
  const meta = document.createElement("div");
  meta.className = "flex items-center gap-2 text-xs text-token-text-secondary";
  const authorEl = renderAuthor(m.author);
  if (authorEl) meta.appendChild(authorEl);
  if (m.githubRepo) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const repo = document.createElement("button");
    repo.type = "button";
    repo.className = "inline-flex text-token-text-link-foreground hover:underline";
    repo.textContent = m.githubRepo;
    repo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void import_electron.ipcRenderer.invoke("codexpp:open-external", `https://github.com/${m.githubRepo}`);
    });
    meta.appendChild(repo);
  }
  if (m.homepage) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const link = document.createElement("a");
    link.href = m.homepage;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "inline-flex text-token-text-link-foreground hover:underline";
    link.textContent = "Homepage";
    meta.appendChild(link);
  }
  if (meta.children.length > 0) stack.appendChild(meta);
  if (m.tags && m.tags.length > 0) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "flex flex-wrap items-center gap-1 pt-0.5";
    for (const tag of m.tags) {
      const pill = document.createElement("span");
      pill.className = "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] text-token-text-secondary";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    }
    stack.appendChild(tagsRow);
  }
  left.appendChild(stack);
  header.appendChild(left);
  const right = document.createElement("div");
  right.className = "flex shrink-0 items-center gap-2 pt-0.5";
  if (t.enabled && pages.length > 0) {
    const configureBtn = compactButton("Configure", () => {
      activatePage({ kind: "registered", id: pages[0].id });
    });
    configureBtn.title = pages.length === 1 ? `Open ${pages[0].page.title}` : `Open ${pages.map((p) => p.page.title).join(", ")}`;
    right.appendChild(configureBtn);
  }
  if (t.update?.updateAvailable && t.update.releaseUrl) {
    right.appendChild(
      compactButton("Review Release", () => {
        void import_electron.ipcRenderer.invoke("codexpp:open-external", t.update.releaseUrl);
      })
    );
  }
  right.appendChild(
    switchControl(t.enabled, async (next) => {
      await import_electron.ipcRenderer.invoke("codexpp:set-tweak-enabled", m.id, next);
    })
  );
  header.appendChild(right);
  cell.appendChild(header);
  if (t.enabled && sections.length > 0) {
    const nested = document.createElement("div");
    nested.className = "flex flex-col divide-y-[0.5px] divide-token-border border-t-[0.5px] border-token-border";
    for (const s of sections) {
      const body = document.createElement("div");
      body.className = "p-3";
      try {
        s.render(body);
      } catch (e) {
        body.textContent = `Error rendering tweak section: ${e.message}`;
      }
      nested.appendChild(body);
    }
    cell.appendChild(nested);
  }
  return cell;
}
function renderAuthor(author) {
  if (!author) return null;
  const wrap = document.createElement("span");
  wrap.className = "inline-flex items-center gap-1";
  if (typeof author === "string") {
    wrap.textContent = `by ${author}`;
    return wrap;
  }
  wrap.appendChild(document.createTextNode("by "));
  if (author.url) {
    const a = document.createElement("a");
    a.href = author.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.className = "inline-flex text-token-text-link-foreground hover:underline";
    a.textContent = author.name;
    wrap.appendChild(a);
  } else {
    const span = document.createElement("span");
    span.textContent = author.name;
    wrap.appendChild(span);
  }
  return wrap;
}
function openPublishTweakDialog() {
  const existing = document.querySelector("[data-codexpp-publish-dialog]");
  existing?.remove();
  const overlay = document.createElement("div");
  overlay.dataset.codexppPublishDialog = "true";
  overlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4";
  const dialog = document.createElement("div");
  dialog.className = "flex w-full max-w-xl flex-col gap-4 rounded-lg border border-token-border bg-token-main-surface-primary p-4 shadow-xl";
  overlay.appendChild(dialog);
  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3";
  const titleStack = document.createElement("div");
  titleStack.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "text-base font-medium text-token-text-primary";
  title.textContent = "Publish Tweak";
  const subtitle = document.createElement("div");
  subtitle.className = "text-sm text-token-text-secondary";
  subtitle.textContent = "Submit a GitHub repo for admin review. Codex++ records the exact commit admins must review and pin.";
  titleStack.appendChild(title);
  titleStack.appendChild(subtitle);
  header.appendChild(titleStack);
  header.appendChild(compactButton("Dismiss", () => overlay.remove()));
  dialog.appendChild(header);
  const repoInput = document.createElement("input");
  repoInput.type = "text";
  repoInput.placeholder = "owner/repo or https://github.com/owner/repo";
  repoInput.className = "h-10 rounded-lg border border-token-border bg-transparent px-3 text-sm text-token-text-primary focus:outline-none";
  dialog.appendChild(repoInput);
  const status = document.createElement("div");
  status.className = "min-h-5 text-sm text-token-text-secondary";
  status.textContent = "The manifest should include an iconUrl suitable for the store.";
  dialog.appendChild(status);
  const actions = document.createElement("div");
  actions.className = "flex items-center justify-end gap-2";
  const submit = compactButton("Open Review Issue", () => {
    void submitPublishTweak(repoInput, status);
  });
  actions.appendChild(submit);
  dialog.appendChild(actions);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  repoInput.focus();
}
async function submitPublishTweak(repoInput, status) {
  status.className = "min-h-5 text-sm text-token-text-secondary";
  status.textContent = "Resolving the repo commit to review.";
  try {
    const submission = await import_electron.ipcRenderer.invoke(
      "codexpp:prepare-tweak-store-submission",
      repoInput.value
    );
    const url = buildTweakPublishIssueUrl(submission);
    await import_electron.ipcRenderer.invoke("codexpp:open-external", url);
    status.textContent = `GitHub review issue opened for ${submission.commitSha.slice(0, 7)}.`;
  } catch (e) {
    status.className = "min-h-5 text-sm text-token-charts-red";
    status.textContent = String(e.message ?? e);
  }
}
function panelShell(title, subtitle, options) {
  const outer = document.createElement("div");
  outer.className = "main-surface flex h-full min-h-0 flex-col";
  const toolbar = document.createElement("div");
  toolbar.className = "draggable flex items-center px-panel electron:h-toolbar extension:h-toolbar-sm";
  outer.appendChild(toolbar);
  const scroll = document.createElement("div");
  scroll.className = "flex-1 overflow-y-auto p-panel";
  outer.appendChild(scroll);
  const inner = document.createElement("div");
  inner.className = options?.wide ? "mx-auto flex w-full max-w-5xl flex-col electron:min-w-[calc(320px*var(--codex-window-zoom))]" : "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
  scroll.appendChild(inner);
  const headerWrap = document.createElement("div");
  headerWrap.className = "flex items-center justify-between gap-3 pb-panel";
  const headerInner = document.createElement("div");
  headerInner.className = "flex min-w-0 flex-1 flex-col gap-1.5 pb-panel";
  const titleLine = document.createElement("div");
  titleLine.className = "flex min-w-0 items-center gap-2";
  const heading = document.createElement("div");
  heading.className = "electron:heading-lg heading-base truncate";
  heading.textContent = title;
  titleLine.appendChild(heading);
  const headerTitleActions = document.createElement("div");
  headerTitleActions.className = "flex shrink-0 items-center gap-2";
  titleLine.appendChild(headerTitleActions);
  headerInner.appendChild(titleLine);
  let subtitleElement;
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "text-token-text-secondary text-sm";
    sub.textContent = subtitle;
    headerInner.appendChild(sub);
    subtitleElement = sub;
  }
  headerWrap.appendChild(headerInner);
  const headerActions = document.createElement("div");
  headerActions.className = "flex shrink-0 items-center gap-2";
  headerWrap.appendChild(headerActions);
  inner.appendChild(headerWrap);
  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "flex flex-col gap-[var(--padding-panel)]";
  inner.appendChild(sectionsWrap);
  return { outer, sectionsWrap, subtitle: subtitleElement, headerActions, headerTitleActions };
}
function sectionTitle(text, trailing) {
  const titleRow = document.createElement("div");
  titleRow.className = "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
  const titleInner = document.createElement("div");
  titleInner.className = "flex min-w-0 flex-1 flex-col gap-1";
  const t = document.createElement("div");
  t.className = "text-base font-medium text-token-text-primary";
  t.textContent = text;
  titleInner.appendChild(t);
  titleRow.appendChild(titleInner);
  if (trailing) {
    const right = document.createElement("div");
    right.className = "flex items-center gap-2";
    right.appendChild(trailing);
    titleRow.appendChild(right);
  }
  return titleRow;
}
function openInPlaceButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "border-token-border user-select-none no-drag cursor-interaction flex items-center gap-1 border whitespace-nowrap focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 rounded-lg text-token-description-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px]";
  btn.innerHTML = `${label}<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true"><path d="M14.3349 13.3301V6.60645L5.47065 15.4707C5.21095 15.7304 4.78895 15.7304 4.52925 15.4707C4.26955 15.211 4.26955 14.789 4.52925 14.5293L13.3935 5.66504H6.66011C6.29284 5.66504 5.99507 5.36727 5.99507 5C5.99507 4.63273 6.29284 4.33496 6.66011 4.33496H14.9999L15.1337 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V13.3301C15.6649 13.6973 15.3672 13.9951 14.9999 13.9951C14.6327 13.9951 14.335 13.6973 14.3349 13.3301Z" fill="currentColor"></path></svg>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function compactButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2 text-sm text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function roundedCard() {
  const card = document.createElement("div");
  card.className = "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
  card.setAttribute(
    "style",
    "background-color: var(--color-background-panel, var(--color-token-bg-fog));"
  );
  return card;
}
function rowSimple(title, description) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 items-center gap-3";
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-1";
  if (title) {
    const t = document.createElement("div");
    t.className = "min-w-0 text-sm text-token-text-primary";
    t.textContent = title;
    stack.appendChild(t);
  }
  if (description) {
    const d = document.createElement("div");
    d.className = "text-token-text-secondary min-w-0 text-sm";
    d.textContent = description;
    stack.appendChild(d);
  }
  left.appendChild(stack);
  row.appendChild(left);
  return row;
}
function switchControl(initial, onChange) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className = "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);
  const apply = (on) => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className = "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className = `relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out h-5 w-8 ${on ? "bg-token-charts-blue" : "bg-token-foreground/20"}`;
    pill.dataset.state = on ? "checked" : "unchecked";
    knob.dataset.state = on ? "checked" : "unchecked";
    knob.style.transform = on ? "translateX(14px)" : "translateX(2px)";
  };
  apply(initial);
  btn.appendChild(pill);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = btn.getAttribute("aria-checked") !== "true";
    apply(next);
    btn.disabled = true;
    try {
      await onChange(next);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}
function dot() {
  const s = document.createElement("span");
  s.className = "text-token-description-foreground";
  s.textContent = "\xB7";
  return s;
}
function configIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h11M17 15h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="13" cy="5" r="1.6" fill="currentColor"/><circle cx="6" cy="10" r="1.6" fill="currentColor"/><circle cx="15" cy="15" r="1.6" fill="currentColor"/></svg>`;
}
function tweaksIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M10 2.5 L11.4 8.6 L17.5 10 L11.4 11.4 L10 17.5 L8.6 11.4 L2.5 10 L8.6 8.6 Z" fill="currentColor"/><path d="M15.5 3 L16 5 L18 5.5 L16 6 L15.5 8 L15 6 L13 5.5 L15 5 Z" fill="currentColor" opacity="0.7"/></svg>`;
}
function storeIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M4 8.2 5.1 4.5A1.5 1.5 0 0 1 6.55 3.4h6.9a1.5 1.5 0 0 1 1.45 1.1L16 8.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4.5 8h11v7.5A1.5 1.5 0 0 1 14 17H6a1.5 1.5 0 0 1-1.5-1.5V8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 8v1a2.5 2.5 0 0 0 5 0V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
function defaultPageIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v3a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
async function resolveIconUrl(url, tweakDir) {
  if (/^(https?:|data:)/.test(url)) return url;
  const rel = url.startsWith("./") ? url.slice(2) : url;
  try {
    return await import_electron.ipcRenderer.invoke(
      "codexpp:read-tweak-asset",
      tweakDir,
      rel
    );
  } catch (e) {
    plog("icon load failed", { url, tweakDir, err: String(e) });
    return null;
  }
}
function findSidebarItemsGroup() {
  const candidates = Array.from(
    document.querySelectorAll("aside,nav,[role='navigation'],div")
  );
  let best = null;
  let bestScore = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.dataset.codexpp) continue;
    if (!isSettingsSidebarCandidate(candidate)) continue;
    const labels = codexPpSettingsLabelsFrom(candidate);
    const score = codexPpSettingsLabelScore(labels);
    const rect = candidate.getBoundingClientRect();
    const area = rect.width * rect.height;
    const weighted = score.core * 100 + score.total;
    if (weighted > bestScore || weighted === bestScore && area < bestArea) {
      best = candidate;
      bestScore = weighted;
      bestArea = area;
    }
  }
  return best;
}
var FORBIDDEN_SETTINGS_SIDEBAR_SELECTOR = [
  "[data-composer-overlay-floating-ui='true']",
  "[data-codexpp-slash-menu='true']",
  "[data-codexpp-overlay-noise='true']",
  ".composer-home-top-menu",
  ".vertical-scroll-fade-mask",
  "[class*='[container-name:home-main-content]']"
].join(",");
function isForbiddenSettingsSidebarSurface(node) {
  if (!node) return false;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return false;
  if (el.closest(FORBIDDEN_SETTINGS_SIDEBAR_SELECTOR)) return true;
  if (el.querySelector("[data-list-navigation-item='true'], [cmdk-item]")) return true;
  return false;
}
function isSettingsSidebarCandidate(el) {
  const rect = codexPpVisibleBox(el);
  if (!rect) return false;
  if (rect.width < 120 || rect.width > 620) return false;
  if (rect.height < 80) return false;
  if (rect.left > window.innerWidth * 0.65) return false;
  const labels = codexPpSettingsLabelsFrom(el);
  if (hasMainAppSidebarSignals(labels) && !hasCodexPpSettingsOnlySignal(labels)) {
    return false;
  }
  return isCodexPpSettingsLabelSet(labels);
}
function removeMisplacedSettingsGroups() {
  const groups = document.querySelectorAll(
    "[data-codexpp='nav-group'], [data-codexpp='pages-group'], [data-codexpp='native-nav-header']"
  );
  for (const group of Array.from(groups)) {
    if (isCodexPpInjectedSettingsGroupPlacementValid(group)) continue;
    resetCodexPpInjectedSettingsGroupState(group);
    group.remove();
  }
}
function isCodexPpInjectedSettingsGroupPlacementValid(group) {
  if (isForbiddenSettingsSidebarSurface(group)) return false;
  let node = group.parentElement;
  for (let depth = 0; node && depth < 4; depth++) {
    if (isForbiddenSettingsSidebarSurface(node)) return false;
    if (isSettingsSidebarCandidate(node)) return true;
    node = node.parentElement;
  }
  return false;
}
function resetCodexPpInjectedSettingsGroupState(group) {
  if (state.navGroup === group || state.navGroup && group.contains(state.navGroup)) {
    state.navGroup = null;
    state.navButtons = null;
    state.codexPlusPlusUpdateButton = null;
  }
  if (state.pagesGroup === group || state.pagesGroup && group.contains(state.pagesGroup)) {
    state.pagesGroup = null;
    state.pagesGroupKey = null;
    for (const p of state.pages.values()) p.navButton = null;
  }
  if (state.nativeNavHeader === group || state.nativeNavHeader && group.contains(state.nativeNavHeader)) {
    state.nativeNavHeader = null;
  }
  if (state.sidebarRoot && state.sidebarRoot.contains(group)) {
    state.sidebarRoot = null;
  }
}
function findContentArea() {
  const sidebar = findSidebarItemsGroup();
  if (!sidebar) return null;
  let parent = sidebar.parentElement;
  while (parent) {
    for (const child of Array.from(parent.children)) {
      if (child === sidebar || child.contains(sidebar)) continue;
      const r = child.getBoundingClientRect();
      if (r.width > 300 && r.height > 200) return child;
    }
    parent = parent.parentElement;
  }
  return null;
}
function maybeDumpDom() {
  try {
    const sidebar = findSidebarItemsGroup();
    if (sidebar && !state.sidebarDumped) {
      state.sidebarDumped = true;
      const sbRoot = sidebar.parentElement ?? sidebar;
      plog(`codex sidebar HTML`, sbRoot.outerHTML.slice(0, 32e3));
    }
    const content = findContentArea();
    if (!content) {
      if (state.fingerprint !== location.href) {
        state.fingerprint = location.href;
        plog("dom probe (no content)", {
          url: location.href,
          sidebar: sidebar ? describe(sidebar) : null
        });
      }
      return;
    }
    let panel = null;
    for (const child of Array.from(content.children)) {
      if (child.dataset.codexpp === "tweaks-panel") continue;
      if (child.style.display === "none") continue;
      panel = child;
      break;
    }
    const activeNav = sidebar ? Array.from(sidebar.querySelectorAll("button, a")).find(
      (b) => b.getAttribute("aria-current") === "page" || b.getAttribute("data-active") === "true" || b.getAttribute("aria-selected") === "true" || b.classList.contains("active")
    ) : null;
    const heading = panel?.querySelector(
      "h1, h2, h3, [class*='heading']"
    );
    const fingerprint = `${activeNav?.textContent ?? ""}|${heading?.textContent ?? ""}|${panel?.children.length ?? 0}`;
    if (state.fingerprint === fingerprint) return;
    state.fingerprint = fingerprint;
    plog("dom probe", {
      url: location.href,
      activeNav: activeNav?.textContent?.trim() ?? null,
      heading: heading?.textContent?.trim() ?? null,
      content: describe(content)
    });
    if (panel) {
      const html = panel.outerHTML;
      plog(
        `codex panel HTML (${activeNav?.textContent?.trim() ?? "?"})`,
        html.slice(0, 32e3)
      );
    }
  } catch (e) {
    plog("dom probe failed", String(e));
  }
}
function describe(el) {
  return {
    tag: el.tagName,
    cls: el.className.slice(0, 120),
    id: el.id || void 0,
    children: el.children.length,
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })()
  };
}
function tweaksPath() {
  return window.__codexpp_tweaks_dir__ ?? "<user dir>/tweaks";
}

// src/preload/tweak-host.ts
var import_electron2 = require("electron");
var loaded = /* @__PURE__ */ new Map();
var cachedPaths = null;
async function startTweakHost() {
  const tweaks = await import_electron2.ipcRenderer.invoke("codexpp:list-tweaks");
  const paths = await import_electron2.ipcRenderer.invoke("codexpp:user-paths");
  cachedPaths = paths;
  setListedTweaks(tweaks);
  window.__codexpp_tweaks_dir__ = paths.tweaksDir;
  for (const t of tweaks) {
    if (t.manifest.scope === "main") continue;
    if (!t.entryExists) continue;
    if (!t.enabled) continue;
    try {
      await loadTweak(t, paths);
    } catch (e) {
      console.error("[codex-plusplus] tweak load failed:", t.manifest.id, e);
      try {
        import_electron2.ipcRenderer.send(
          "codexpp:preload-log",
          "error",
          "tweak load failed: " + t.manifest.id + ": " + String(e?.stack ?? e)
        );
      } catch {
      }
    }
  }
  console.info(
    `[codex-plusplus] renderer host loaded ${loaded.size} tweak(s):`,
    [...loaded.keys()].join(", ") || "(none)"
  );
  import_electron2.ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `renderer host loaded ${loaded.size} tweak(s): ${[...loaded.keys()].join(", ") || "(none)"}`
  );
}
function teardownTweakHost() {
  for (const [id, t] of loaded) {
    try {
      t.stop?.();
    } catch (e) {
      console.warn("[codex-plusplus] tweak stop failed:", id, e);
    } finally {
      void import_electron2.ipcRenderer.invoke("codexpp:codex-view-dispose-tweak", id).catch(() => {
      });
      void import_electron2.ipcRenderer.invoke("codexpp:native-dispose-tweak", id).catch(() => {
      });
    }
  }
  loaded.clear();
  clearSections();
}
async function loadTweak(t, paths) {
  const source = await import_electron2.ipcRenderer.invoke(
    "codexpp:read-tweak-source",
    t.entry
  );
  const module2 = { exports: {} };
  const exports2 = module2.exports;
  const fn = new Function(
    "module",
    "exports",
    "console",
    `${source}
//# sourceURL=codexpp-tweak://${encodeURIComponent(t.manifest.id)}/${encodeURIComponent(t.entry)}`
  );
  fn(module2, exports2, console);
  const mod = module2.exports;
  const tweak = mod.default ?? mod;
  if (typeof tweak?.start !== "function") {
    throw new Error(`tweak ${t.manifest.id} has no start()`);
  }
  const api = makeRendererApi(t.manifest, paths);
  await tweak.start(api);
  loaded.set(t.manifest.id, { stop: tweak.stop?.bind(tweak) });
}
function makeRendererApi(manifest, paths) {
  const id = manifest.id;
  const log = (level, ...a) => {
    const consoleFn = level === "debug" ? console.debug : level === "warn" ? console.warn : level === "error" ? console.error : console.log;
    consoleFn(`[codex-plusplus][${id}]`, ...a);
    try {
      const parts = a.map((v) => {
        if (typeof v === "string") return v;
        if (v instanceof Error) return `${v.name}: ${v.message}`;
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      });
      import_electron2.ipcRenderer.send(
        "codexpp:preload-log",
        level,
        `[tweak ${id}] ${parts.join(" ")}`
      );
    } catch {
    }
  };
  return {
    manifest,
    process: "renderer",
    log: {
      debug: (...a) => log("debug", ...a),
      info: (...a) => log("info", ...a),
      warn: (...a) => log("warn", ...a),
      error: (...a) => log("error", ...a)
    },
    storage: rendererStorage(id),
    settings: {
      register: (s) => registerSection({ ...s, id: `${id}:${s.id}` }),
      registerPage: (p) => registerPage(id, manifest, { ...p, id: `${id}:${p.id}` })
    },
    react: {
      getFiber: (n) => fiberForNode(n),
      findOwnerByName: (n, name) => {
        let f = fiberForNode(n);
        while (f) {
          const t = f.type;
          if (t && (t.displayName === name || t.name === name)) return f;
          f = f.return;
        }
        return null;
      },
      waitForElement: (sel, timeoutMs = 5e3) => new Promise((resolve, reject) => {
        const existing = document.querySelector(sel);
        if (existing) return resolve(existing);
        const deadline = Date.now() + timeoutMs;
        const obs = new MutationObserver(() => {
          const el = document.querySelector(sel);
          if (el) {
            obs.disconnect();
            resolve(el);
          } else if (Date.now() > deadline) {
            obs.disconnect();
            reject(new Error(`timeout waiting for ${sel}`));
          }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
      })
    },
    ipc: {
      on: (c, h) => {
        const wrapped = (_e, ...args) => h(...args);
        import_electron2.ipcRenderer.on(`codexpp:${id}:${c}`, wrapped);
        return () => import_electron2.ipcRenderer.removeListener(`codexpp:${id}:${c}`, wrapped);
      },
      send: (c, ...args) => import_electron2.ipcRenderer.send(`codexpp:${id}:${c}`, ...args),
      invoke: (c, ...args) => import_electron2.ipcRenderer.invoke(`codexpp:${id}:${c}`, ...args)
    },
    fs: rendererFs(id, paths),
    codex: rendererCodexApi(id)
  };
}
function rendererCodexApi(tweakId) {
  return {
    runtime: {
      getInfo: async () => {
        const info = await import_electron2.ipcRenderer.invoke("codexpp:codex-runtime-info");
        const bridge = rendererElectronBridge();
        return {
          ...info,
          buildFlavor: bridge?.getBuildFlavor?.() ?? info.buildFlavor,
          usesOwlAppShell: bridge?.usesOwlAppShell?.() ?? info.usesOwlAppShell
        };
      },
      getCapabilities: () => import_electron2.ipcRenderer.invoke("codexpp:codex-runtime-capabilities")
    },
    windows: {
      create: (options) => import_electron2.ipcRenderer.invoke("codexpp:codex-window-create", options),
      getPrimary: () => import_electron2.ipcRenderer.invoke("codexpp:codex-window-primary"),
      focus: (windowId) => import_electron2.ipcRenderer.invoke("codexpp:codex-window-focus", windowId),
      show: (windowId) => import_electron2.ipcRenderer.invoke("codexpp:codex-window-show", windowId)
    },
    views: {
      create: async (options) => {
        const ref = await import_electron2.ipcRenderer.invoke(
          "codexpp:codex-view-create",
          tweakId,
          options
        );
        return rendererCodexViewRef(tweakId, ref.id, ref.webContentsId, ref.parentWindowId);
      }
    },
    cdp: {
      getStatus: () => import_electron2.ipcRenderer.invoke("codexpp:codex-cdp-status"),
      listTargets: () => import_electron2.ipcRenderer.invoke("codexpp:codex-cdp-targets")
    },
    native: {
      loadModule: async (options) => {
        const ref = await import_electron2.ipcRenderer.invoke(
          "codexpp:native-load-module",
          tweakId,
          options
        );
        return rendererNativeModuleRef(tweakId, ref.id, ref.kind);
      },
      createPanel: async (options) => {
        const ref = await import_electron2.ipcRenderer.invoke(
          "codexpp:native-create-panel",
          tweakId,
          options
        );
        return rendererNativePanelRef(tweakId, ref.id, ref.windowId);
      },
      attachView: async (options) => {
        const ref = await import_electron2.ipcRenderer.invoke(
          "codexpp:native-attach-view",
          tweakId,
          options
        );
        return rendererNativeViewRef(tweakId, ref.id);
      },
      launchHelper: async (options) => {
        const ref = await import_electron2.ipcRenderer.invoke(
          "codexpp:native-launch-helper",
          tweakId,
          options
        );
        return rendererNativeHelperRef(tweakId, ref.id, ref.pid);
      }
    },
    createBrowserView: (_options) => {
      throw new Error("api.codex.createBrowserView is main-only; use a main-scoped tweak");
    },
    createWindow: (options) => import_electron2.ipcRenderer.invoke("codexpp:codex-window-create", options)
  };
}
function rendererCodexViewRef(tweakId, id, webContentsId, parentWindowId) {
  return {
    id,
    webContentsId,
    parentWindowId,
    setBounds: (bounds) => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "setBounds", bounds),
    setVisible: (visible) => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "setVisible", visible),
    bringToFront: () => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "bringToFront"),
    loadRoute: (route, hostId) => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "loadRoute", route, hostId),
    loadUrl: (url) => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "loadUrl", url),
    dispose: () => import_electron2.ipcRenderer.invoke("codexpp:codex-view-call", tweakId, id, "dispose")
  };
}
function rendererNativeModuleRef(tweakId, id, kind) {
  return {
    id,
    kind,
    request: (method, payload, timeoutMs) => import_electron2.ipcRenderer.invoke(
      "codexpp:native-module-request",
      tweakId,
      id,
      method,
      payload,
      timeoutMs
    ),
    dispose: () => import_electron2.ipcRenderer.invoke("codexpp:native-module-dispose", tweakId, id)
  };
}
function rendererNativePanelRef(tweakId, id, windowId) {
  return {
    id,
    windowId,
    setBounds: (bounds) => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "panel", id, "setBounds", bounds),
    show: () => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "panel", id, "show"),
    hide: () => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "panel", id, "hide"),
    dispose: () => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "panel", id, "dispose")
  };
}
function rendererNativeViewRef(tweakId, id) {
  return {
    id,
    setBounds: (bounds) => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "view", id, "setBounds", bounds),
    setVisible: (visible) => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "view", id, "setVisible", visible),
    dispose: () => import_electron2.ipcRenderer.invoke("codexpp:native-instance-call", tweakId, "view", id, "dispose")
  };
}
function rendererNativeHelperRef(tweakId, id, pid) {
  return {
    id,
    pid,
    send: (message) => import_electron2.ipcRenderer.invoke("codexpp:native-helper-call", tweakId, id, "send", message),
    request: (message, timeoutMs) => import_electron2.ipcRenderer.invoke(
      "codexpp:native-helper-call",
      tweakId,
      id,
      "request",
      message,
      timeoutMs
    ),
    stop: () => import_electron2.ipcRenderer.invoke("codexpp:native-helper-call", tweakId, id, "stop")
  };
}
function rendererElectronBridge() {
  const value = window.electronBridge;
  return value && typeof value === "object" ? value : null;
}
function rendererStorage(id) {
  const key = `codexpp:storage:${id}`;
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  };
  const write = (v) => localStorage.setItem(key, JSON.stringify(v));
  return {
    get: (k, d) => k in read() ? read()[k] : d,
    set: (k, v) => {
      const o = read();
      o[k] = v;
      write(o);
    },
    delete: (k) => {
      const o = read();
      delete o[k];
      write(o);
    },
    all: () => read()
  };
}
function rendererFs(id, _paths) {
  return {
    dataDir: `<remote>/tweak-data/${id}`,
    read: (p) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "read", id, p),
    write: (p, c) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "write", id, p, c),
    exists: (p) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "exists", id, p)
  };
}

// src/preload/manager.ts
var import_electron3 = require("electron");
async function mountManager() {
  const tweaks = await import_electron3.ipcRenderer.invoke("codexpp:list-tweaks");
  const paths = await import_electron3.ipcRenderer.invoke("codexpp:user-paths");
  registerSection({
    id: "codex-plusplus:manager",
    title: "Tweak Manager",
    description: `${tweaks.length} tweak(s) installed. User dir: ${paths.userRoot}`,
    render(root) {
      root.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
      actions.appendChild(
        button(
          "Open tweaks folder",
          () => import_electron3.ipcRenderer.invoke("codexpp:reveal", paths.tweaksDir).catch(() => {
          })
        )
      );
      actions.appendChild(
        button(
          "Open logs",
          () => import_electron3.ipcRenderer.invoke("codexpp:reveal", paths.logDir).catch(() => {
          })
        )
      );
      actions.appendChild(
        button("Reload window", () => location.reload())
      );
      root.appendChild(actions);
      if (tweaks.length === 0) {
        const empty = document.createElement("p");
        empty.style.cssText = "color:#888;font:13px system-ui;margin:8px 0;";
        empty.textContent = "No user tweaks yet. Drop a folder with manifest.json + index.js into the tweaks dir, then reload.";
        root.appendChild(empty);
        return;
      }
      const list = document.createElement("ul");
      list.style.cssText = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;";
      for (const t of tweaks) {
        const li = document.createElement("li");
        li.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--border,#2a2a2a);border-radius:6px;";
        const left = document.createElement("div");
        left.innerHTML = `
          <div style="font:600 13px system-ui;">${escape(t.manifest.name)} <span style="color:#888;font-weight:400;">v${escape(t.manifest.version)}</span></div>
          <div style="color:#888;font:12px system-ui;">${escape(t.manifest.description ?? t.manifest.id)}</div>
        `;
        const right = document.createElement("div");
        right.style.cssText = "color:#888;font:12px system-ui;";
        right.textContent = t.entryExists ? "loaded" : "missing entry";
        li.append(left, right);
        list.append(li);
      }
      root.append(list);
    }
  });
}
function button(label, onclick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText = "padding:6px 10px;border:1px solid var(--border,#333);border-radius:6px;background:transparent;color:inherit;font:12px system-ui;cursor:pointer;";
  b.addEventListener("click", onclick);
  return b;
}
function escape(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

// src/preload/index.ts
var BROWSER_UI_CONNECT_PORT = "codexpp:browser-ui-connect-app-host";
var BROWSER_UI_BRIDGE_REQUEST = "codexpp:browser-ui-bridge-request";
var BROWSER_UI_BRIDGE_RESPONSE = "codexpp:browser-ui-bridge-response";
var BROWSER_UI_MESSAGE_FOR_VIEW = "codexpp:browser-ui-message-for-view";
var BROWSER_UI_WORKER_MESSAGE = "codexpp:browser-ui-worker-message";
var BROWSER_UI_SYSTEM_THEME = "codexpp:browser-ui-system-theme";
var DESKTOP_MESSAGE_FROM_VIEW = "codex_desktop:message-from-view";
var DESKTOP_MESSAGE_FOR_VIEW = "codex_desktop:message-for-view";
var DESKTOP_SHOW_CONTEXT_MENU = "codex_desktop:show-context-menu";
var DESKTOP_SHOW_APPLICATION_MENU = "codex_desktop:show-application-menu";
var DESKTOP_GET_SENTRY_INIT_OPTIONS = "codex_desktop:get-sentry-init-options";
var DESKTOP_GET_BUILD_FLAVOR = "codex_desktop:get-build-flavor";
var DESKTOP_GET_USES_OWL_APP_SHELL = "codex_desktop:get-uses-owl-app-shell";
var DESKTOP_GET_SYSTEM_THEME_VARIANT = "codex_desktop:get-system-theme-variant";
var DESKTOP_GET_SHARED_OBJECT_SNAPSHOT = "codex_desktop:get-shared-object-snapshot";
var DESKTOP_GET_FAST_MODE_ROLLOUT_METRICS = "codex_desktop:get-fast-mode-rollout-metrics";
var DESKTOP_SYSTEM_THEME_UPDATED = "codex_desktop:system-theme-variant-updated";
var DESKTOP_TRIGGER_SENTRY_TEST = "codex_desktop:trigger-sentry-test";
function desktopWorkerFromViewChannel(workerId) {
  return `codex_desktop:worker:${workerId}:from-view`;
}
function desktopWorkerForViewChannel(workerId) {
  return `codex_desktop:worker:${workerId}:for-view`;
}
function fileLog(stage, extra) {
  const msg = `[codex-plusplus preload] ${stage}${extra === void 0 ? "" : " " + safeStringify2(extra)}`;
  try {
    console.error(msg);
  } catch {
  }
  try {
    import_electron4.ipcRenderer.send("codexpp:preload-log", "info", msg);
  } catch {
  }
}
function safeStringify2(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
fileLog("preload entry", { url: location.href });
try {
  installBrowserUiHostBridge();
  fileLog("browser UI host bridge installed");
} catch (e) {
  fileLog("browser UI host bridge FAILED", String(e));
}
try {
  installReactHook();
  fileLog("react hook installed");
} catch (e) {
  fileLog("react hook FAILED", String(e));
}
queueMicrotask(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});
async function boot() {
  fileLog("boot start", { readyState: document.readyState });
  try {
    startSettingsInjector();
    fileLog("settings injector started");
    await startTweakHost();
    fileLog("tweak host started");
    await mountManager();
    fileLog("manager mounted");
    subscribeReload();
    fileLog("boot complete");
  } catch (e) {
    fileLog("boot FAILED", String(e?.stack ?? e));
    console.error("[codex-plusplus] preload boot failed:", e);
  }
}
var reloading = null;
function subscribeReload() {
  import_electron4.ipcRenderer.on("codexpp:tweaks-changed", () => {
    if (reloading) return;
    reloading = (async () => {
      try {
        console.info("[codex-plusplus] hot-reloading tweaks");
        teardownTweakHost();
        await startTweakHost();
        await mountManager();
      } catch (e) {
        console.error("[codex-plusplus] hot reload failed:", e);
      } finally {
        reloading = null;
      }
    })();
  });
}
function installBrowserUiHostBridge() {
  const workerListeners = /* @__PURE__ */ new Map();
  import_electron4.ipcRenderer.on(BROWSER_UI_CONNECT_PORT, (event) => {
    const [port] = event.ports;
    if (!port) return;
    window.postMessage({ type: "connect-app-host", port }, "*", [port]);
  });
  import_electron4.ipcRenderer.on(BROWSER_UI_BRIDGE_REQUEST, async (_event, payload) => {
    const request = payload && typeof payload === "object" ? payload : {};
    const id = typeof request.id === "string" ? request.id : "";
    const method = typeof request.method === "string" ? request.method : "";
    const args = Array.isArray(request.args) ? request.args : [];
    try {
      const value = await runBrowserUiBridgeMethod(method, args, workerListeners);
      import_electron4.ipcRenderer.send(BROWSER_UI_BRIDGE_RESPONSE, { id, ok: true, value });
    } catch (e) {
      import_electron4.ipcRenderer.send(BROWSER_UI_BRIDGE_RESPONSE, {
        id,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  });
  import_electron4.ipcRenderer.on(DESKTOP_MESSAGE_FOR_VIEW, (_event, message) => {
    import_electron4.ipcRenderer.send(BROWSER_UI_MESSAGE_FOR_VIEW, message);
  });
  import_electron4.ipcRenderer.on(DESKTOP_SYSTEM_THEME_UPDATED, (_event, value) => {
    import_electron4.ipcRenderer.send(BROWSER_UI_SYSTEM_THEME, value);
  });
}
async function runBrowserUiBridgeMethod(method, args, workerListeners) {
  switch (method) {
    case "snapshot":
      return import_electron4.ipcRenderer.sendSync(DESKTOP_GET_SHARED_OBJECT_SNAPSHOT) ?? {};
    case "systemTheme":
      return import_electron4.ipcRenderer.sendSync(DESKTOP_GET_SYSTEM_THEME_VARIANT);
    case "sentryOptions":
      return import_electron4.ipcRenderer.sendSync(DESKTOP_GET_SENTRY_INIT_OPTIONS);
    case "buildFlavor":
      return import_electron4.ipcRenderer.sendSync(DESKTOP_GET_BUILD_FLAVOR);
    case "usesOwlAppShell":
      return import_electron4.ipcRenderer.sendSync(DESKTOP_GET_USES_OWL_APP_SHELL) === true;
    case "sendMessageFromView":
      return import_electron4.ipcRenderer.invoke(DESKTOP_MESSAGE_FROM_VIEW, args[0]);
    case "sendWorkerMessageFromView":
      return import_electron4.ipcRenderer.invoke(desktopWorkerFromViewChannel(String(args[0])), args[1]);
    case "subscribeWorkerMessages":
      return subscribeBrowserUiWorkerMessages(String(args[0]), workerListeners);
    case "unsubscribeWorkerMessages":
      return unsubscribeBrowserUiWorkerMessages(String(args[0]), workerListeners);
    case "showContextMenu":
      return import_electron4.ipcRenderer.invoke(DESKTOP_SHOW_CONTEXT_MENU, args[0]);
    case "showApplicationMenu":
      return import_electron4.ipcRenderer.invoke(DESKTOP_SHOW_APPLICATION_MENU, {
        menuId: args[0],
        x: args[1],
        y: args[2]
      });
    case "getFastModeRolloutMetrics":
      return import_electron4.ipcRenderer.invoke(DESKTOP_GET_FAST_MODE_ROLLOUT_METRICS, args[0]);
    case "triggerSentryTestError":
      return import_electron4.ipcRenderer.invoke(DESKTOP_TRIGGER_SENTRY_TEST);
    default:
      throw new Error(`Unknown Codex++ browser UI bridge method: ${method}`);
  }
}
function subscribeBrowserUiWorkerMessages(workerId, workerListeners) {
  if (!/^[a-zA-Z0-9._:-]+$/.test(workerId)) throw new Error("invalid worker id");
  if (workerListeners.has(workerId)) return true;
  const listener = (_event, message) => {
    import_electron4.ipcRenderer.send(BROWSER_UI_WORKER_MESSAGE, workerId, message);
  };
  workerListeners.set(workerId, listener);
  import_electron4.ipcRenderer.on(desktopWorkerForViewChannel(workerId), listener);
  return true;
}
function unsubscribeBrowserUiWorkerMessages(workerId, workerListeners) {
  const listener = workerListeners.get(workerId);
  if (!listener) return true;
  workerListeners.delete(workerId);
  import_electron4.ipcRenderer.removeListener(desktopWorkerForViewChannel(workerId), listener);
  return true;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvdHdlYWstc3RvcmUudHMiLCAiLi4vc3JjL3ByZWxvYWQvdHdlYWstaG9zdC50cyIsICIuLi9zcmMvcHJlbG9hZC9tYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFJlbmRlcmVyIHByZWxvYWQgZW50cnkuIFJ1bnMgaW4gYW4gaXNvbGF0ZWQgd29ybGQgYmVmb3JlIENvZGV4J3MgcGFnZSBKUy5cbiAqIFJlc3BvbnNpYmlsaXRpZXM6XG4gKiAgIDEuIEluc3RhbGwgYSBSZWFjdCBEZXZUb29scy1zaGFwZWQgZ2xvYmFsIGhvb2sgdG8gY2FwdHVyZSB0aGUgcmVuZGVyZXJcbiAqICAgICAgcmVmZXJlbmNlIHdoZW4gUmVhY3QgbW91bnRzLiBXZSB1c2UgdGhpcyBmb3IgZmliZXIgd2Fsa2luZy5cbiAqICAgMi4gQWZ0ZXIgRE9NQ29udGVudExvYWRlZCwga2ljayBvZmYgc2V0dGluZ3MtaW5qZWN0aW9uIGxvZ2ljLlxuICogICAzLiBEaXNjb3ZlciByZW5kZXJlci1zY29wZWQgdHdlYWtzICh2aWEgSVBDIHRvIG1haW4pIGFuZCBzdGFydCB0aGVtLlxuICogICA0LiBMaXN0ZW4gZm9yIGBjb2RleHBwOnR3ZWFrcy1jaGFuZ2VkYCBmcm9tIG1haW4gKGZpbGVzeXN0ZW0gd2F0Y2hlcikgYW5kXG4gKiAgICAgIGhvdC1yZWxvYWQgdHdlYWtzIHdpdGhvdXQgZHJvcHBpbmcgdGhlIHBhZ2UuXG4gKi9cblxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IGluc3RhbGxSZWFjdEhvb2sgfSBmcm9tIFwiLi9yZWFjdC1ob29rXCI7XG5pbXBvcnQgeyBzdGFydFNldHRpbmdzSW5qZWN0b3IgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgc3RhcnRUd2Vha0hvc3QsIHRlYXJkb3duVHdlYWtIb3N0IH0gZnJvbSBcIi4vdHdlYWstaG9zdFwiO1xuaW1wb3J0IHsgbW91bnRNYW5hZ2VyIH0gZnJvbSBcIi4vbWFuYWdlclwiO1xuXG5jb25zdCBCUk9XU0VSX1VJX0NPTk5FQ1RfUE9SVCA9IFwiY29kZXhwcDpicm93c2VyLXVpLWNvbm5lY3QtYXBwLWhvc3RcIjtcbmNvbnN0IEJST1dTRVJfVUlfQlJJREdFX1JFUVVFU1QgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1icmlkZ2UtcmVxdWVzdFwiO1xuY29uc3QgQlJPV1NFUl9VSV9CUklER0VfUkVTUE9OU0UgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1icmlkZ2UtcmVzcG9uc2VcIjtcbmNvbnN0IEJST1dTRVJfVUlfTUVTU0FHRV9GT1JfVklFVyA9IFwiY29kZXhwcDpicm93c2VyLXVpLW1lc3NhZ2UtZm9yLXZpZXdcIjtcbmNvbnN0IEJST1dTRVJfVUlfV09SS0VSX01FU1NBR0UgPSBcImNvZGV4cHA6YnJvd3Nlci11aS13b3JrZXItbWVzc2FnZVwiO1xuY29uc3QgQlJPV1NFUl9VSV9TWVNURU1fVEhFTUUgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1zeXN0ZW0tdGhlbWVcIjtcblxuY29uc3QgREVTS1RPUF9NRVNTQUdFX0ZST01fVklFVyA9IFwiY29kZXhfZGVza3RvcDptZXNzYWdlLWZyb20tdmlld1wiO1xuY29uc3QgREVTS1RPUF9NRVNTQUdFX0ZPUl9WSUVXID0gXCJjb2RleF9kZXNrdG9wOm1lc3NhZ2UtZm9yLXZpZXdcIjtcbmNvbnN0IERFU0tUT1BfU0hPV19DT05URVhUX01FTlUgPSBcImNvZGV4X2Rlc2t0b3A6c2hvdy1jb250ZXh0LW1lbnVcIjtcbmNvbnN0IERFU0tUT1BfU0hPV19BUFBMSUNBVElPTl9NRU5VID0gXCJjb2RleF9kZXNrdG9wOnNob3ctYXBwbGljYXRpb24tbWVudVwiO1xuY29uc3QgREVTS1RPUF9HRVRfU0VOVFJZX0lOSVRfT1BUSU9OUyA9IFwiY29kZXhfZGVza3RvcDpnZXQtc2VudHJ5LWluaXQtb3B0aW9uc1wiO1xuY29uc3QgREVTS1RPUF9HRVRfQlVJTERfRkxBVk9SID0gXCJjb2RleF9kZXNrdG9wOmdldC1idWlsZC1mbGF2b3JcIjtcbmNvbnN0IERFU0tUT1BfR0VUX1VTRVNfT1dMX0FQUF9TSEVMTCA9IFwiY29kZXhfZGVza3RvcDpnZXQtdXNlcy1vd2wtYXBwLXNoZWxsXCI7XG5jb25zdCBERVNLVE9QX0dFVF9TWVNURU1fVEhFTUVfVkFSSUFOVCA9IFwiY29kZXhfZGVza3RvcDpnZXQtc3lzdGVtLXRoZW1lLXZhcmlhbnRcIjtcbmNvbnN0IERFU0tUT1BfR0VUX1NIQVJFRF9PQkpFQ1RfU05BUFNIT1QgPSBcImNvZGV4X2Rlc2t0b3A6Z2V0LXNoYXJlZC1vYmplY3Qtc25hcHNob3RcIjtcbmNvbnN0IERFU0tUT1BfR0VUX0ZBU1RfTU9ERV9ST0xMT1VUX01FVFJJQ1MgPSBcImNvZGV4X2Rlc2t0b3A6Z2V0LWZhc3QtbW9kZS1yb2xsb3V0LW1ldHJpY3NcIjtcbmNvbnN0IERFU0tUT1BfU1lTVEVNX1RIRU1FX1VQREFURUQgPSBcImNvZGV4X2Rlc2t0b3A6c3lzdGVtLXRoZW1lLXZhcmlhbnQtdXBkYXRlZFwiO1xuY29uc3QgREVTS1RPUF9UUklHR0VSX1NFTlRSWV9URVNUID0gXCJjb2RleF9kZXNrdG9wOnRyaWdnZXItc2VudHJ5LXRlc3RcIjtcblxuZnVuY3Rpb24gZGVza3RvcFdvcmtlckZyb21WaWV3Q2hhbm5lbCh3b3JrZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBjb2RleF9kZXNrdG9wOndvcmtlcjoke3dvcmtlcklkfTpmcm9tLXZpZXdgO1xufVxuXG5mdW5jdGlvbiBkZXNrdG9wV29ya2VyRm9yVmlld0NoYW5uZWwod29ya2VySWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgY29kZXhfZGVza3RvcDp3b3JrZXI6JHt3b3JrZXJJZH06Zm9yLXZpZXdgO1xufVxuXG4vLyBGaWxlLWxvZyBwcmVsb2FkIHByb2dyZXNzIHNvIHdlIGNhbiBkaWFnbm9zZSB3aXRob3V0IERldlRvb2xzLiBCZXN0LWVmZm9ydDpcbi8vIGZhaWx1cmVzIGhlcmUgbXVzdCBuZXZlciB0aHJvdyBiZWNhdXNlIHdlJ2QgdGFrZSB0aGUgcGFnZSBkb3duIHdpdGggdXMuXG4vL1xuLy8gQ29kZXgncyByZW5kZXJlciBpcyBzYW5kYm94ZWQgKHNhbmRib3g6IHRydWUpLCBzbyBgcmVxdWlyZShcIm5vZGU6ZnNcIilgIGlzXG4vLyB1bmF2YWlsYWJsZS4gV2UgZm9yd2FyZCBsb2cgbGluZXMgdG8gbWFpbiB2aWEgSVBDOyBtYWluIHdyaXRlcyB0aGUgZmlsZS5cbmZ1bmN0aW9uIGZpbGVMb2coc3RhZ2U6IHN0cmluZywgZXh0cmE/OiB1bmtub3duKTogdm9pZCB7XG4gIGNvbnN0IG1zZyA9IGBbY29kZXgtcGx1c3BsdXMgcHJlbG9hZF0gJHtzdGFnZX0ke1xuICAgIGV4dHJhID09PSB1bmRlZmluZWQgPyBcIlwiIDogXCIgXCIgKyBzYWZlU3RyaW5naWZ5KGV4dHJhKVxuICB9YDtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gIH0gY2F0Y2gge31cbiAgdHJ5IHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLCBcImluZm9cIiwgbXNnKTtcbiAgfSBjYXRjaCB7fVxufVxuZnVuY3Rpb24gc2FmZVN0cmluZ2lmeSh2OiB1bmtub3duKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogSlNPTi5zdHJpbmdpZnkodik7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBTdHJpbmcodik7XG4gIH1cbn1cblxuZmlsZUxvZyhcInByZWxvYWQgZW50cnlcIiwgeyB1cmw6IGxvY2F0aW9uLmhyZWYgfSk7XG5cbnRyeSB7XG4gIGluc3RhbGxCcm93c2VyVWlIb3N0QnJpZGdlKCk7XG4gIGZpbGVMb2coXCJicm93c2VyIFVJIGhvc3QgYnJpZGdlIGluc3RhbGxlZFwiKTtcbn0gY2F0Y2ggKGUpIHtcbiAgZmlsZUxvZyhcImJyb3dzZXIgVUkgaG9zdCBicmlkZ2UgRkFJTEVEXCIsIFN0cmluZyhlKSk7XG59XG5cbi8vIFJlYWN0IGhvb2sgbXVzdCBiZSBpbnN0YWxsZWQgKmJlZm9yZSogQ29kZXgncyBidW5kbGUgcnVucy5cbnRyeSB7XG4gIGluc3RhbGxSZWFjdEhvb2soKTtcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgaW5zdGFsbGVkXCIpO1xufSBjYXRjaCAoZSkge1xuICBmaWxlTG9nKFwicmVhY3QgaG9vayBGQUlMRURcIiwgU3RyaW5nKGUpKTtcbn1cblxucXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBib290LCB7IG9uY2U6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgYm9vdCgpO1xuICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHtcbiAgZmlsZUxvZyhcImJvb3Qgc3RhcnRcIiwgeyByZWFkeVN0YXRlOiBkb2N1bWVudC5yZWFkeVN0YXRlIH0pO1xuICB0cnkge1xuICAgIHN0YXJ0U2V0dGluZ3NJbmplY3RvcigpO1xuICAgIGZpbGVMb2coXCJzZXR0aW5ncyBpbmplY3RvciBzdGFydGVkXCIpO1xuICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgZmlsZUxvZyhcInR3ZWFrIGhvc3Qgc3RhcnRlZFwiKTtcbiAgICBhd2FpdCBtb3VudE1hbmFnZXIoKTtcbiAgICBmaWxlTG9nKFwibWFuYWdlciBtb3VudGVkXCIpO1xuICAgIHN1YnNjcmliZVJlbG9hZCgpO1xuICAgIGZpbGVMb2coXCJib290IGNvbXBsZXRlXCIpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgZmlsZUxvZyhcImJvb3QgRkFJTEVEXCIsIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpKTtcbiAgICBjb25zb2xlLmVycm9yKFwiW2NvZGV4LXBsdXNwbHVzXSBwcmVsb2FkIGJvb3QgZmFpbGVkOlwiLCBlKTtcbiAgfVxufVxuXG4vLyBIb3QgcmVsb2FkOiBnYXRlZCBiZWhpbmQgYSBzbWFsbCBpbi1mbGlnaHQgbG9jayBzbyBhIGZsdXJyeSBvZiBmcyBldmVudHNcbi8vIGRvZXNuJ3QgcmVlbnRyYW50bHkgdGVhciBkb3duIHRoZSBob3N0IG1pZC1sb2FkLlxubGV0IHJlbG9hZGluZzogUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gc3Vic2NyaWJlUmVsb2FkKCk6IHZvaWQge1xuICBpcGNSZW5kZXJlci5vbihcImNvZGV4cHA6dHdlYWtzLWNoYW5nZWRcIiwgKCkgPT4ge1xuICAgIGlmIChyZWxvYWRpbmcpIHJldHVybjtcbiAgICByZWxvYWRpbmcgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5pbmZvKFwiW2NvZGV4LXBsdXNwbHVzXSBob3QtcmVsb2FkaW5nIHR3ZWFrc1wiKTtcbiAgICAgICAgdGVhcmRvd25Ud2Vha0hvc3QoKTtcbiAgICAgICAgYXdhaXQgc3RhcnRUd2Vha0hvc3QoKTtcbiAgICAgICAgYXdhaXQgbW91bnRNYW5hZ2VyKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIGhvdCByZWxvYWQgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHJlbG9hZGluZyA9IG51bGw7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGluc3RhbGxCcm93c2VyVWlIb3N0QnJpZGdlKCk6IHZvaWQge1xuICBjb25zdCB3b3JrZXJMaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZD4oKTtcblxuICBpcGNSZW5kZXJlci5vbihCUk9XU0VSX1VJX0NPTk5FQ1RfUE9SVCwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgW3BvcnRdID0gZXZlbnQucG9ydHM7XG4gICAgaWYgKCFwb3J0KSByZXR1cm47XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogXCJjb25uZWN0LWFwcC1ob3N0XCIsIHBvcnQgfSwgXCIqXCIsIFtwb3J0XSk7XG4gIH0pO1xuXG4gIGlwY1JlbmRlcmVyLm9uKEJST1dTRVJfVUlfQlJJREdFX1JFUVVFU1QsIGFzeW5jIChfZXZlbnQsIHBheWxvYWQpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIlxuICAgICAgPyBwYXlsb2FkIGFzIHsgaWQ/OiB1bmtub3duOyBtZXRob2Q/OiB1bmtub3duOyBhcmdzPzogdW5rbm93biB9XG4gICAgICA6IHt9O1xuICAgIGNvbnN0IGlkID0gdHlwZW9mIHJlcXVlc3QuaWQgPT09IFwic3RyaW5nXCIgPyByZXF1ZXN0LmlkIDogXCJcIjtcbiAgICBjb25zdCBtZXRob2QgPSB0eXBlb2YgcmVxdWVzdC5tZXRob2QgPT09IFwic3RyaW5nXCIgPyByZXF1ZXN0Lm1ldGhvZCA6IFwiXCI7XG4gICAgY29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5hcmdzKSA/IHJlcXVlc3QuYXJncyA6IFtdO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHJ1bkJyb3dzZXJVaUJyaWRnZU1ldGhvZChtZXRob2QsIGFyZ3MsIHdvcmtlckxpc3RlbmVycyk7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKEJST1dTRVJfVUlfQlJJREdFX1JFU1BPTlNFLCB7IGlkLCBvazogdHJ1ZSwgdmFsdWUgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX0JSSURHRV9SRVNQT05TRSwge1xuICAgICAgICBpZCxcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBpcGNSZW5kZXJlci5vbihERVNLVE9QX01FU1NBR0VfRk9SX1ZJRVcsIChfZXZlbnQsIG1lc3NhZ2UpID0+IHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKEJST1dTRVJfVUlfTUVTU0FHRV9GT1JfVklFVywgbWVzc2FnZSk7XG4gIH0pO1xuXG4gIGlwY1JlbmRlcmVyLm9uKERFU0tUT1BfU1lTVEVNX1RIRU1FX1VQREFURUQsIChfZXZlbnQsIHZhbHVlKSA9PiB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX1NZU1RFTV9USEVNRSwgdmFsdWUpO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuQnJvd3NlclVpQnJpZGdlTWV0aG9kKFxuICBtZXRob2Q6IHN0cmluZyxcbiAgYXJnczogdW5rbm93bltdLFxuICB3b3JrZXJMaXN0ZW5lcnM6IE1hcDxzdHJpbmcsICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQ+LFxuKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIHN3aXRjaCAobWV0aG9kKSB7XG4gICAgY2FzZSBcInNuYXBzaG90XCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU0hBUkVEX09CSkVDVF9TTkFQU0hPVCkgPz8ge307XG4gICAgY2FzZSBcInN5c3RlbVRoZW1lXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU1lTVEVNX1RIRU1FX1ZBUklBTlQpO1xuICAgIGNhc2UgXCJzZW50cnlPcHRpb25zXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU0VOVFJZX0lOSVRfT1BUSU9OUyk7XG4gICAgY2FzZSBcImJ1aWxkRmxhdm9yXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfQlVJTERfRkxBVk9SKTtcbiAgICBjYXNlIFwidXNlc093bEFwcFNoZWxsXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfVVNFU19PV0xfQVBQX1NIRUxMKSA9PT0gdHJ1ZTtcbiAgICBjYXNlIFwic2VuZE1lc3NhZ2VGcm9tVmlld1wiOlxuICAgICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZShERVNLVE9QX01FU1NBR0VfRlJPTV9WSUVXLCBhcmdzWzBdKTtcbiAgICBjYXNlIFwic2VuZFdvcmtlck1lc3NhZ2VGcm9tVmlld1wiOlxuICAgICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZShkZXNrdG9wV29ya2VyRnJvbVZpZXdDaGFubmVsKFN0cmluZyhhcmdzWzBdKSksIGFyZ3NbMV0pO1xuICAgIGNhc2UgXCJzdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiOlxuICAgICAgcmV0dXJuIHN1YnNjcmliZUJyb3dzZXJVaVdvcmtlck1lc3NhZ2VzKFN0cmluZyhhcmdzWzBdKSwgd29ya2VyTGlzdGVuZXJzKTtcbiAgICBjYXNlIFwidW5zdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiOlxuICAgICAgcmV0dXJuIHVuc3Vic2NyaWJlQnJvd3NlclVpV29ya2VyTWVzc2FnZXMoU3RyaW5nKGFyZ3NbMF0pLCB3b3JrZXJMaXN0ZW5lcnMpO1xuICAgIGNhc2UgXCJzaG93Q29udGV4dE1lbnVcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9TSE9XX0NPTlRFWFRfTUVOVSwgYXJnc1swXSk7XG4gICAgY2FzZSBcInNob3dBcHBsaWNhdGlvbk1lbnVcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9TSE9XX0FQUExJQ0FUSU9OX01FTlUsIHtcbiAgICAgICAgbWVudUlkOiBhcmdzWzBdLFxuICAgICAgICB4OiBhcmdzWzFdLFxuICAgICAgICB5OiBhcmdzWzJdLFxuICAgICAgfSk7XG4gICAgY2FzZSBcImdldEZhc3RNb2RlUm9sbG91dE1ldHJpY3NcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9HRVRfRkFTVF9NT0RFX1JPTExPVVRfTUVUUklDUywgYXJnc1swXSk7XG4gICAgY2FzZSBcInRyaWdnZXJTZW50cnlUZXN0RXJyb3JcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9UUklHR0VSX1NFTlRSWV9URVNUKTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIENvZGV4KysgYnJvd3NlciBVSSBicmlkZ2UgbWV0aG9kOiAke21ldGhvZH1gKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdWJzY3JpYmVCcm93c2VyVWlXb3JrZXJNZXNzYWdlcyhcbiAgd29ya2VySWQ6IHN0cmluZyxcbiAgd29ya2VyTGlzdGVuZXJzOiBNYXA8c3RyaW5nLCAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkPixcbik6IGJvb2xlYW4ge1xuICBpZiAoIS9eW2EtekEtWjAtOS5fOi1dKyQvLnRlc3Qod29ya2VySWQpKSB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHdvcmtlciBpZFwiKTtcbiAgaWYgKHdvcmtlckxpc3RlbmVycy5oYXMod29ya2VySWQpKSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgbGlzdGVuZXIgPSAoX2V2ZW50OiB1bmtub3duLCBtZXNzYWdlOiB1bmtub3duKSA9PiB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX1dPUktFUl9NRVNTQUdFLCB3b3JrZXJJZCwgbWVzc2FnZSk7XG4gIH07XG4gIHdvcmtlckxpc3RlbmVycy5zZXQod29ya2VySWQsIGxpc3RlbmVyKTtcbiAgaXBjUmVuZGVyZXIub24oZGVza3RvcFdvcmtlckZvclZpZXdDaGFubmVsKHdvcmtlcklkKSwgbGlzdGVuZXIpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdW5zdWJzY3JpYmVCcm93c2VyVWlXb3JrZXJNZXNzYWdlcyhcbiAgd29ya2VySWQ6IHN0cmluZyxcbiAgd29ya2VyTGlzdGVuZXJzOiBNYXA8c3RyaW5nLCAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkPixcbik6IGJvb2xlYW4ge1xuICBjb25zdCBsaXN0ZW5lciA9IHdvcmtlckxpc3RlbmVycy5nZXQod29ya2VySWQpO1xuICBpZiAoIWxpc3RlbmVyKSByZXR1cm4gdHJ1ZTtcbiAgd29ya2VyTGlzdGVuZXJzLmRlbGV0ZSh3b3JrZXJJZCk7XG4gIGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKGRlc2t0b3BXb3JrZXJGb3JWaWV3Q2hhbm5lbCh3b3JrZXJJZCksIGxpc3RlbmVyKTtcbiAgcmV0dXJuIHRydWU7XG59XG4iLCAiLyoqXG4gKiBJbnN0YWxsIGEgbWluaW1hbCBfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18uIFJlYWN0IGNhbGxzXG4gKiBgaG9vay5pbmplY3QocmVuZGVyZXJJbnRlcm5hbHMpYCBkdXJpbmcgYGNyZWF0ZVJvb3RgL2BoeWRyYXRlUm9vdGAuIFRoZVxuICogXCJpbnRlcm5hbHNcIiBvYmplY3QgZXhwb3NlcyBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZSwgd2hpY2ggbGV0cyB1cyB0dXJuIGFcbiAqIERPTSBub2RlIGludG8gYSBSZWFjdCBmaWJlciBcdTIwMTQgbmVjZXNzYXJ5IGZvciBvdXIgU2V0dGluZ3MgaW5qZWN0b3IuXG4gKlxuICogV2UgZG9uJ3Qgd2FudCB0byBicmVhayByZWFsIFJlYWN0IERldlRvb2xzIGlmIHRoZSB1c2VyIG9wZW5zIGl0OyB3ZSBpbnN0YWxsXG4gKiBvbmx5IGlmIG5vIGhvb2sgZXhpc3RzIHlldCwgYW5kIHdlIGZvcndhcmQgY2FsbHMgdG8gYSBkb3duc3RyZWFtIGhvb2sgaWZcbiAqIG9uZSBpcyBsYXRlciBhc3NpZ25lZC5cbiAqL1xuZGVjbGFyZSBnbG9iYWwge1xuICBpbnRlcmZhY2UgV2luZG93IHtcbiAgICBfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18/OiBSZWFjdERldnRvb2xzSG9vaztcbiAgICBfX2NvZGV4cHBfXz86IHtcbiAgICAgIGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rO1xuICAgICAgcmVuZGVyZXJzOiBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz47XG4gICAgfTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgUmVuZGVyZXJJbnRlcm5hbHMge1xuICBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZT86IChuOiBOb2RlKSA9PiB1bmtub3duO1xuICB2ZXJzaW9uPzogc3RyaW5nO1xuICBidW5kbGVUeXBlPzogbnVtYmVyO1xuICByZW5kZXJlclBhY2thZ2VOYW1lPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUmVhY3REZXZ0b29sc0hvb2sge1xuICBzdXBwb3J0c0ZpYmVyOiB0cnVlO1xuICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcbiAgb24oZXZlbnQ6IHN0cmluZywgZm46ICguLi5hOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xuICBvZmYoZXZlbnQ6IHN0cmluZywgZm46ICguLi5hOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xuICBlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSk6IHZvaWQ7XG4gIGluamVjdChyZW5kZXJlcjogUmVuZGVyZXJJbnRlcm5hbHMpOiBudW1iZXI7XG4gIG9uU2NoZWR1bGVGaWJlclJvb3Q/KCk6IHZvaWQ7XG4gIG9uQ29tbWl0RmliZXJSb290PygpOiB2b2lkO1xuICBvbkNvbW1pdEZpYmVyVW5tb3VudD8oKTogdm9pZDtcbiAgY2hlY2tEQ0U/KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsUmVhY3RIb29rKCk6IHZvaWQge1xuICBpZiAod2luZG93Ll9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXykgcmV0dXJuO1xuICBjb25zdCByZW5kZXJlcnMgPSBuZXcgTWFwPG51bWJlciwgUmVuZGVyZXJJbnRlcm5hbHM+KCk7XG4gIGxldCBuZXh0SWQgPSAxO1xuICBjb25zdCBsaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCguLi5hOiB1bmtub3duW10pID0+IHZvaWQ+PigpO1xuXG4gIGNvbnN0IGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rID0ge1xuICAgIHN1cHBvcnRzRmliZXI6IHRydWUsXG4gICAgcmVuZGVyZXJzLFxuICAgIGluamVjdChyZW5kZXJlcikge1xuICAgICAgY29uc3QgaWQgPSBuZXh0SWQrKztcbiAgICAgIHJlbmRlcmVycy5zZXQoaWQsIHJlbmRlcmVyKTtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgICBcIltjb2RleC1wbHVzcGx1c10gUmVhY3QgcmVuZGVyZXIgYXR0YWNoZWQ6XCIsXG4gICAgICAgIHJlbmRlcmVyLnJlbmRlcmVyUGFja2FnZU5hbWUsXG4gICAgICAgIHJlbmRlcmVyLnZlcnNpb24sXG4gICAgICApO1xuICAgICAgcmV0dXJuIGlkO1xuICAgIH0sXG4gICAgb24oZXZlbnQsIGZuKSB7XG4gICAgICBsZXQgcyA9IGxpc3RlbmVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzKSBsaXN0ZW5lcnMuc2V0KGV2ZW50LCAocyA9IG5ldyBTZXQoKSkpO1xuICAgICAgcy5hZGQoZm4pO1xuICAgIH0sXG4gICAgb2ZmKGV2ZW50LCBmbikge1xuICAgICAgbGlzdGVuZXJzLmdldChldmVudCk/LmRlbGV0ZShmbik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50LCAuLi5hcmdzKSB7XG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZm9yRWFjaCgoZm4pID0+IGZuKC4uLmFyZ3MpKTtcbiAgICB9LFxuICAgIG9uQ29tbWl0RmliZXJSb290KCkge30sXG4gICAgb25Db21taXRGaWJlclVubW91bnQoKSB7fSxcbiAgICBvblNjaGVkdWxlRmliZXJSb290KCkge30sXG4gICAgY2hlY2tEQ0UoKSB7fSxcbiAgfTtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LCBcIl9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfX1wiLCB7XG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiB0cnVlLCAvLyBhbGxvdyByZWFsIERldlRvb2xzIHRvIG92ZXJ3cml0ZSBpZiB1c2VyIGluc3RhbGxzIGl0XG4gICAgdmFsdWU6IGhvb2ssXG4gIH0pO1xuXG4gIHdpbmRvdy5fX2NvZGV4cHBfXyA9IHsgaG9vaywgcmVuZGVyZXJzIH07XG59XG5cbi8qKiBSZXNvbHZlIHRoZSBSZWFjdCBmaWJlciBmb3IgYSBET00gbm9kZSwgaWYgYW55IHJlbmRlcmVyIGhhcyBvbmUuICovXG5leHBvcnQgZnVuY3Rpb24gZmliZXJGb3JOb2RlKG5vZGU6IE5vZGUpOiB1bmtub3duIHwgbnVsbCB7XG4gIGNvbnN0IHJlbmRlcmVycyA9IHdpbmRvdy5fX2NvZGV4cHBfXz8ucmVuZGVyZXJzO1xuICBpZiAocmVuZGVyZXJzKSB7XG4gICAgZm9yIChjb25zdCByIG9mIHJlbmRlcmVycy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgZiA9IHIuZmluZEZpYmVyQnlIb3N0SW5zdGFuY2U/Lihub2RlKTtcbiAgICAgIGlmIChmKSByZXR1cm4gZjtcbiAgICB9XG4gIH1cbiAgLy8gRmFsbGJhY2s6IHJlYWQgdGhlIFJlYWN0IGludGVybmFsIHByb3BlcnR5IGRpcmVjdGx5IGZyb20gdGhlIERPTSBub2RlLlxuICAvLyBSZWFjdCBzdG9yZXMgZmliZXJzIGFzIGEgcHJvcGVydHkgd2hvc2Uga2V5IHN0YXJ0cyB3aXRoIFwiX19yZWFjdEZpYmVyXCIuXG4gIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhub2RlKSkge1xuICAgIGlmIChrLnN0YXJ0c1dpdGgoXCJfX3JlYWN0RmliZXJcIikpIHJldHVybiAobm9kZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrXTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbiIsICIvKipcbiAqIFNldHRpbmdzIGluamVjdG9yIGZvciBDb2RleCdzIFNldHRpbmdzIHBhZ2UuXG4gKlxuICogQ29kZXgncyBzZXR0aW5ncyBpcyBhIHJvdXRlZCBwYWdlIChVUkwgc3RheXMgYXQgYC9pbmRleC5odG1sP2hvc3RJZD1sb2NhbGApXG4gKiBOT1QgYSBtb2RhbCBkaWFsb2cuIFRoZSBzaWRlYmFyIGxpdmVzIGluc2lkZSBhIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxuICogZ2FwLTEgZ2FwLTBcIj5gIHdyYXBwZXIgdGhhdCBob2xkcyBvbmUgb3IgbW9yZSBgPGRpdiBjbGFzcz1cImZsZXggZmxleC1jb2xcbiAqIGdhcC1weFwiPmAgZ3JvdXBzIG9mIGJ1dHRvbnMuIFRoZXJlIGFyZSBubyBzdGFibGUgYHJvbGVgIC8gYGFyaWEtbGFiZWxgIC9cbiAqIGBkYXRhLXRlc3RpZGAgaG9va3Mgb24gdGhlIHNoZWxsIHNvIHdlIGlkZW50aWZ5IHRoZSBzaWRlYmFyIGJ5IHRleHQtY29udGVudFxuICogbWF0Y2ggYWdhaW5zdCBrbm93biBpdGVtIGxhYmVscyAoR2VuZXJhbCwgQXBwZWFyYW5jZSwgQ29uZmlndXJhdGlvbiwgXHUyMDI2KS5cbiAqXG4gKiBMYXlvdXQgd2UgaW5qZWN0OlxuICpcbiAqICAgR0VORVJBTCAgICAgICAgICAgICAgICAgICAgICAgKHVwcGVyY2FzZSBncm91cCBsYWJlbClcbiAqICAgW0NvZGV4J3MgZXhpc3RpbmcgaXRlbXMgZ3JvdXBdXG4gKiAgIENPREVYKysgICAgICAgICAgICAgICAgICAgICAgICh1cHBlcmNhc2UgZ3JvdXAgbGFiZWwpXG4gKiAgIFx1MjREOCBDb25maWdcbiAqICAgXHUyNjMwIFR3ZWFrc1xuICogICBcdTI1QzcgVHdlYWsgU3RvcmVcbiAqXG4gKiBDbGlja2luZyBDb25maWcgLyBUd2Vha3MgLyBUd2VhayBTdG9yZSBoaWRlcyBDb2RleCdzIGNvbnRlbnQgcGFuZWwgY2hpbGRyZW4gYW5kIHJlbmRlcnNcbiAqIG91ciBvd24gYG1haW4tc3VyZmFjZWAgcGFuZWwgaW4gdGhlaXIgcGxhY2UuIENsaWNraW5nIGFueSBvZiBDb2RleCdzXG4gKiBzaWRlYmFyIGl0ZW1zIHJlc3RvcmVzIHRoZSBvcmlnaW5hbCB2aWV3LlxuICovXG5cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgdHlwZSB7XG4gIFNldHRpbmdzU2VjdGlvbixcbiAgU2V0dGluZ3NQYWdlLFxuICBTZXR0aW5nc0hhbmRsZSxcbiAgVHdlYWtNYW5pZmVzdCxcbn0gZnJvbSBcIkBjb2RleC1wbHVzcGx1cy9zZGtcIjtcbmltcG9ydCB7XG4gIGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwsXG4gIGlzU3RvcmVVcGRhdGVBdmFpbGFibGUsXG4gIHR5cGUgVHdlYWtTdG9yZUVudHJ5LFxuICB0eXBlIFR3ZWFrU3RvcmVQdWJsaXNoU3VibWlzc2lvbixcbn0gZnJvbSBcIi4uL3R3ZWFrLXN0b3JlXCI7XG5cbmNvbnN0IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTCA9IFwiaHR0cHM6Ly9naXRodWIuY29tL2Itbm5ldHQvY29kZXgtcGx1c3BsdXMvcmVsZWFzZXNcIjtcblxuLy8gTWlycm9ycyB0aGUgcnVudGltZSdzIG1haW4tc2lkZSBMaXN0ZWRUd2VhayBzaGFwZSAoa2VwdCBpbiBzeW5jIG1hbnVhbGx5KS5cbmludGVyZmFjZSBMaXN0ZWRUd2VhayB7XG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xuICBlbnRyeTogc3RyaW5nO1xuICBkaXI6IHN0cmluZztcbiAgZW50cnlFeGlzdHM6IGJvb2xlYW47XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZTogVHdlYWtVcGRhdGVDaGVjayB8IG51bGw7XG59XG5cbmludGVyZmFjZSBUd2Vha1VwZGF0ZUNoZWNrIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c0NvbmZpZyB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgYXV0b1VwZGF0ZTogYm9vbGVhbjtcbiAgdXBkYXRlQ2hhbm5lbDogU2VsZlVwZGF0ZUNoYW5uZWw7XG4gIHVwZGF0ZVJlcG86IHN0cmluZztcbiAgdXBkYXRlUmVmOiBzdHJpbmc7XG4gIHVwZGF0ZUNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsO1xuICBzZWxmVXBkYXRlOiBTZWxmVXBkYXRlU3RhdGUgfCBudWxsO1xuICBpbnN0YWxsYXRpb25Tb3VyY2U6IEluc3RhbGxhdGlvblNvdXJjZTtcbn1cblxuaW50ZXJmYWNlIENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB7XG4gIGNoZWNrZWRBdDogc3RyaW5nO1xuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xuICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlTm90ZXM6IHN0cmluZyB8IG51bGw7XG4gIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbnR5cGUgU2VsZlVwZGF0ZUNoYW5uZWwgPSBcInN0YWJsZVwiIHwgXCJwcmVyZWxlYXNlXCIgfCBcImN1c3RvbVwiO1xudHlwZSBTZWxmVXBkYXRlU3RhdHVzID0gXCJjaGVja2luZ1wiIHwgXCJ1cC10by1kYXRlXCIgfCBcInVwZGF0ZWRcIiB8IFwiZmFpbGVkXCIgfCBcImRpc2FibGVkXCI7XG5cbmludGVyZmFjZSBTZWxmVXBkYXRlU3RhdGUge1xuICBjaGVja2VkQXQ6IHN0cmluZztcbiAgY29tcGxldGVkQXQ/OiBzdHJpbmc7XG4gIHN0YXR1czogU2VsZlVwZGF0ZVN0YXR1cztcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgdGFyZ2V0UmVmOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICByZXBvOiBzdHJpbmc7XG4gIGNoYW5uZWw6IFNlbGZVcGRhdGVDaGFubmVsO1xuICBzb3VyY2VSb290OiBzdHJpbmc7XG4gIGluc3RhbGxhdGlvblNvdXJjZT86IEluc3RhbGxhdGlvblNvdXJjZTtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJbnN0YWxsYXRpb25Tb3VyY2Uge1xuICBraW5kOiBcImdpdGh1Yi1zb3VyY2VcIiB8IFwiaG9tZWJyZXdcIiB8IFwibG9jYWwtZGV2XCIgfCBcInNvdXJjZS1hcmNoaXZlXCIgfCBcInVua25vd25cIjtcbiAgbGFiZWw6IHN0cmluZztcbiAgZGV0YWlsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBXYXRjaGVySGVhbHRoIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIHN0YXR1czogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk6IHN0cmluZztcbiAgd2F0Y2hlcjogc3RyaW5nO1xuICBjaGVja3M6IFdhdGNoZXJIZWFsdGhDaGVja1tdO1xufVxuXG5pbnRlcmZhY2UgV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzdGF0dXM6IFwib2tcIiB8IFwid2FyblwiIHwgXCJlcnJvclwiO1xuICBkZXRhaWw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFR3ZWFrU3RvcmVSZWdpc3RyeVZpZXcge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgc291cmNlVXJsOiBzdHJpbmc7XG4gIGZldGNoZWRBdDogc3RyaW5nO1xuICBlbnRyaWVzOiBUd2Vha1N0b3JlRW50cnlWaWV3W107XG59XG5cbmludGVyZmFjZSBUd2Vha1N0b3JlRW50cnlWaWV3IGV4dGVuZHMgVHdlYWtTdG9yZUVudHJ5IHtcbiAgaW5zdGFsbGVkOiB7XG4gICAgdmVyc2lvbjogc3RyaW5nO1xuICAgIGVuYWJsZWQ6IGJvb2xlYW47XG4gIH0gfCBudWxsO1xuICBwbGF0Zm9ybT86IHtcbiAgICBjdXJyZW50OiBzdHJpbmc7XG4gICAgc3VwcG9ydGVkOiBzdHJpbmdbXSB8IG51bGw7XG4gICAgY29tcGF0aWJsZTogYm9vbGVhbjtcbiAgICByZWFzb246IHN0cmluZyB8IG51bGw7XG4gIH07XG4gIHJ1bnRpbWU/OiB7XG4gICAgY3VycmVudDogc3RyaW5nO1xuICAgIHJlcXVpcmVkOiBzdHJpbmcgfCBudWxsO1xuICAgIGNvbXBhdGlibGU6IGJvb2xlYW47XG4gICAgcmVhc29uOiBzdHJpbmcgfCBudWxsO1xuICB9O1xufVxuXG4vKipcbiAqIEEgdHdlYWstcmVnaXN0ZXJlZCBwYWdlLiBXZSBjYXJyeSB0aGUgb3duaW5nIHR3ZWFrJ3MgbWFuaWZlc3Qgc28gd2UgY2FuXG4gKiByZXNvbHZlIHJlbGF0aXZlIGljb25VcmxzIGFuZCBzaG93IGF1dGhvcnNoaXAgaW4gdGhlIHBhZ2UgaGVhZGVyLlxuICovXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZFBhZ2Uge1xuICAvKiogRnVsbHktcXVhbGlmaWVkIGlkOiBgPHR3ZWFrSWQ+OjxwYWdlSWQ+YC4gKi9cbiAgaWQ6IHN0cmluZztcbiAgdHdlYWtJZDogc3RyaW5nO1xuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcbiAgcGFnZTogU2V0dGluZ3NQYWdlO1xuICAvKiogUGVyLXBhZ2UgRE9NIHRlYXJkb3duIHJldHVybmVkIGJ5IGBwYWdlLnJlbmRlcmAsIGlmIGFueS4gKi9cbiAgdGVhcmRvd24/OiAoKCkgPT4gdm9pZCkgfCBudWxsO1xuICAvKiogVGhlIGluamVjdGVkIHNpZGViYXIgYnV0dG9uIChzbyB3ZSBjYW4gdXBkYXRlIGl0cyBhY3RpdmUgc3RhdGUpLiAqL1xuICBuYXZCdXR0b24/OiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG59XG5cbi8qKiBXaGF0IHBhZ2UgaXMgY3VycmVudGx5IHNlbGVjdGVkIGluIG91ciBpbmplY3RlZCBuYXYuICovXG50eXBlIEFjdGl2ZVBhZ2UgPVxuICB8IHsga2luZDogXCJjb25maWdcIiB9XG4gIHwgeyBraW5kOiBcInN0b3JlXCIgfVxuICB8IHsga2luZDogXCJ0d2Vha3NcIiB9XG4gIHwgeyBraW5kOiBcInJlZ2lzdGVyZWRcIjsgaWQ6IHN0cmluZyB9O1xuXG5pbnRlcmZhY2UgSW5qZWN0b3JTdGF0ZSB7XG4gIHNlY3Rpb25zOiBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb24+O1xuICBwYWdlczogTWFwPHN0cmluZywgUmVnaXN0ZXJlZFBhZ2U+O1xuICBsaXN0ZWRUd2Vha3M6IExpc3RlZFR3ZWFrW107XG4gIC8qKiBPdXRlciB3cmFwcGVyIHRoYXQgaG9sZHMgQ29kZXgncyBpdGVtcyBncm91cCArIG91ciBpbmplY3RlZCBncm91cHMuICovXG4gIG91dGVyV3JhcHBlcjogSFRNTEVsZW1lbnQgfCBudWxsO1xuICAvKiogT3VyIFwiR2VuZXJhbFwiIGxhYmVsIGZvciBDb2RleCdzIG5hdGl2ZSBzZXR0aW5ncyBncm91cC4gKi9cbiAgbmF0aXZlTmF2SGVhZGVyOiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIC8qKiBPdXIgXCJDb2RleCsrXCIgbmF2IGdyb3VwIChDb25maWcvVHdlYWtzKS4gKi9cbiAgbmF2R3JvdXA6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgbmF2QnV0dG9uczogeyBjb25maWc6IEhUTUxCdXR0b25FbGVtZW50OyB0d2Vha3M6IEhUTUxCdXR0b25FbGVtZW50OyBzdG9yZTogSFRNTEJ1dHRvbkVsZW1lbnQgfSB8IG51bGw7XG4gIC8qKiBTaWRlYmFyIHVwZGF0ZSBwaWxsIHNob3duIG9ubHkgd2hlbiBHaXRIdWIgaGFzIGEgbmV3ZXIgQ29kZXgrKyByZWxlYXNlLiAqL1xuICBjb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIC8qKiBPdXIgXCJUd2Vha3NcIiBuYXYgZ3JvdXAgKHBlci10d2VhayBwYWdlcykuIENyZWF0ZWQgbGF6aWx5LiAqL1xuICBwYWdlc0dyb3VwOiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHBhZ2VzR3JvdXBLZXk6IHN0cmluZyB8IG51bGw7XG4gIHBhbmVsSG9zdDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGw7XG4gIGZpbmdlcnByaW50OiBzdHJpbmcgfCBudWxsO1xuICBzaWRlYmFyRHVtcGVkOiBib29sZWFuO1xuICBhY3RpdmVQYWdlOiBBY3RpdmVQYWdlIHwgbnVsbDtcbiAgc2lkZWJhclJvb3Q6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgc2lkZWJhclJlc3RvcmVIYW5kbGVyOiAoKGU6IEV2ZW50KSA9PiB2b2lkKSB8IG51bGw7XG4gIHNldHRpbmdzU3VyZmFjZVZpc2libGU6IGJvb2xlYW47XG4gIHNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsO1xuICBzaWRlYmFyTWlzc2luZ0xvZ2dlZDogYm9vbGVhbjtcbiAgdHdlYWtTdG9yZTogVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldyB8IG51bGw7XG4gIHR3ZWFrU3RvcmVQcm9taXNlOiBQcm9taXNlPFR3ZWFrU3RvcmVSZWdpc3RyeVZpZXc+IHwgbnVsbDtcbiAgdHdlYWtTdG9yZUVycm9yOiB1bmtub3duO1xufVxuXG5jb25zdCBzdGF0ZTogSW5qZWN0b3JTdGF0ZSA9IHtcbiAgc2VjdGlvbnM6IG5ldyBNYXAoKSxcbiAgcGFnZXM6IG5ldyBNYXAoKSxcbiAgbGlzdGVkVHdlYWtzOiBbXSxcbiAgb3V0ZXJXcmFwcGVyOiBudWxsLFxuICBuYXRpdmVOYXZIZWFkZXI6IG51bGwsXG4gIG5hdkdyb3VwOiBudWxsLFxuICBuYXZCdXR0b25zOiBudWxsLFxuICBjb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uOiBudWxsLFxuICBwYWdlc0dyb3VwOiBudWxsLFxuICBwYWdlc0dyb3VwS2V5OiBudWxsLFxuICBwYW5lbEhvc3Q6IG51bGwsXG4gIG9ic2VydmVyOiBudWxsLFxuICBmaW5nZXJwcmludDogbnVsbCxcbiAgc2lkZWJhckR1bXBlZDogZmFsc2UsXG4gIGFjdGl2ZVBhZ2U6IG51bGwsXG4gIHNpZGViYXJSb290OiBudWxsLFxuICBzaWRlYmFyUmVzdG9yZUhhbmRsZXI6IG51bGwsXG4gIHNldHRpbmdzU3VyZmFjZVZpc2libGU6IGZhbHNlLFxuICBzZXR0aW5nc1N1cmZhY2VIaWRlVGltZXI6IG51bGwsXG4gIHNpZGViYXJNaXNzaW5nTG9nZ2VkOiBmYWxzZSxcbiAgdHdlYWtTdG9yZTogbnVsbCxcbiAgdHdlYWtTdG9yZVByb21pc2U6IG51bGwsXG4gIHR3ZWFrU3RvcmVFcnJvcjogbnVsbCxcbn07XG5cbmZ1bmN0aW9uIHBsb2cobXNnOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xuICBpcGNSZW5kZXJlci5zZW5kKFxuICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgIFwiaW5mb1wiLFxuICAgIGBbc2V0dGluZ3MtaW5qZWN0b3JdICR7bXNnfSR7ZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpfWAsXG4gICk7XG59XG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFN0cmluZyh2KTtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgcHVibGljIEFQSSBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0U2V0dGluZ3NJbmplY3RvcigpOiB2b2lkIHtcbiAgaWYgKHN0YXRlLm9ic2VydmVyKSByZXR1cm47XG5cbiAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgIHRyeUluamVjdCgpO1xuICAgIG1heWJlRHVtcERvbSgpO1xuICB9KTtcbiAgb2JzLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgc3RhdGUub2JzZXJ2ZXIgPSBvYnM7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJwb3BzdGF0ZVwiLCBvbk5hdik7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiaGFzaGNoYW5nZVwiLCBvbk5hdik7XG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBvbkRvY3VtZW50Q2xpY2ssIHRydWUpO1xuICBmb3IgKGNvbnN0IG0gb2YgW1wicHVzaFN0YXRlXCIsIFwicmVwbGFjZVN0YXRlXCJdIGFzIGNvbnN0KSB7XG4gICAgY29uc3Qgb3JpZyA9IGhpc3RvcnlbbV07XG4gICAgaGlzdG9yeVttXSA9IGZ1bmN0aW9uICh0aGlzOiBIaXN0b3J5LCAuLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBvcmlnPikge1xuICAgICAgY29uc3QgciA9IG9yaWcuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoYGNvZGV4cHAtJHttfWApKTtcbiAgICAgIHJldHVybiByO1xuICAgIH0gYXMgdHlwZW9mIG9yaWc7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoYGNvZGV4cHAtJHttfWAsIG9uTmF2KTtcbiAgfVxuXG4gIHRyeUluamVjdCgpO1xuICBtYXliZUR1bXBEb20oKTtcbiAgbGV0IHRpY2tzID0gMDtcbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgdGlja3MrKztcbiAgICB0cnlJbmplY3QoKTtcbiAgICBtYXliZUR1bXBEb20oKTtcbiAgICBpZiAodGlja3MgPiA2MCkgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gIH0sIDUwMCk7XG59XG5cbmZ1bmN0aW9uIG9uTmF2KCk6IHZvaWQge1xuICBzdGF0ZS5maW5nZXJwcmludCA9IG51bGw7XG4gIHRyeUluamVjdCgpO1xuICBtYXliZUR1bXBEb20oKTtcbn1cblxuZnVuY3Rpb24gb25Eb2N1bWVudENsaWNrKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZS50YXJnZXQgOiBudWxsO1xuICBjb25zdCBjb250cm9sID0gdGFyZ2V0Py5jbG9zZXN0KFwiW3JvbGU9J2xpbmsnXSxidXR0b24sYVwiKTtcbiAgaWYgKCEoY29udHJvbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkgcmV0dXJuO1xuICBpZiAoY29tcGFjdFNldHRpbmdzVGV4dChjb250cm9sLnRleHRDb250ZW50IHx8IFwiXCIpICE9PSBcIkJhY2sgdG8gYXBwXCIpIHJldHVybjtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZShmYWxzZSwgXCJiYWNrLXRvLWFwcFwiKTtcbiAgfSwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNlY3Rpb24oc2VjdGlvbjogU2V0dGluZ3NTZWN0aW9uKTogU2V0dGluZ3NIYW5kbGUge1xuICBzdGF0ZS5zZWN0aW9ucy5zZXQoc2VjdGlvbi5pZCwgc2VjdGlvbik7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICByZXR1cm4ge1xuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcbiAgICAgIHN0YXRlLnNlY3Rpb25zLmRlbGV0ZShzZWN0aW9uLmlkKTtcbiAgICAgIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclNlY3Rpb25zKCk6IHZvaWQge1xuICBzdGF0ZS5zZWN0aW9ucy5jbGVhcigpO1xuICAvLyBEcm9wIHJlZ2lzdGVyZWQgcGFnZXMgdG9vIFx1MjAxNCB0aGV5J3JlIG93bmVkIGJ5IHR3ZWFrcyB0aGF0IGp1c3QgZ290XG4gIC8vIHRvcm4gZG93biBieSB0aGUgaG9zdC4gUnVuIGFueSB0ZWFyZG93bnMgYmVmb3JlIGZvcmdldHRpbmcgdGhlbS5cbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHAudGVhcmRvd24/LigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHBsb2coXCJwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBwLmlkLCBlcnI6IFN0cmluZyhlKSB9KTtcbiAgICB9XG4gIH1cbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcbiAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgLy8gSWYgd2Ugd2VyZSBvbiBhIHJlZ2lzdGVyZWQgcGFnZSB0aGF0IG5vIGxvbmdlciBleGlzdHMsIGZhbGwgYmFjayB0b1xuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxuICBpZiAoXG4gICAgc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiZcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXG4gICkge1xuICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XG4gICAgcmVyZW5kZXIoKTtcbiAgfVxufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdHdlYWstb3duZWQgc2V0dGluZ3MgcGFnZS4gVGhlIHJ1bnRpbWUgaW5qZWN0cyBhIHNpZGViYXIgZW50cnlcbiAqIHVuZGVyIGEgXCJUV0VBS1NcIiBncm91cCBoZWFkZXIgKHdoaWNoIGFwcGVhcnMgb25seSB3aGVuIGF0IGxlYXN0IG9uZSBwYWdlXG4gKiBpcyByZWdpc3RlcmVkKSBhbmQgcm91dGVzIGNsaWNrcyB0byB0aGUgcGFnZSdzIGByZW5kZXIocm9vdClgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQYWdlKFxuICB0d2Vha0lkOiBzdHJpbmcsXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LFxuICBwYWdlOiBTZXR0aW5nc1BhZ2UsXG4pOiBTZXR0aW5nc0hhbmRsZSB7XG4gIGNvbnN0IGlkID0gcGFnZS5pZDsgLy8gYWxyZWFkeSBuYW1lc3BhY2VkIGJ5IHR3ZWFrLWhvc3QgYXMgYCR7dHdlYWtJZH06JHtwYWdlLmlkfWBcbiAgY29uc3QgZW50cnk6IFJlZ2lzdGVyZWRQYWdlID0geyBpZCwgdHdlYWtJZCwgbWFuaWZlc3QsIHBhZ2UgfTtcbiAgc3RhdGUucGFnZXMuc2V0KGlkLCBlbnRyeSk7XG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XG4gIHN5bmNQYWdlc0dyb3VwKCk7XG4gIC8vIElmIHRoZSB1c2VyIHdhcyBhbHJlYWR5IG9uIHRoaXMgcGFnZSAoaG90IHJlbG9hZCksIHJlLW1vdW50IGl0cyBib2R5LlxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICByZXJlbmRlcigpO1xuICB9XG4gIHJldHVybiB7XG4gICAgdW5yZWdpc3RlcjogKCkgPT4ge1xuICAgICAgY29uc3QgZSA9IHN0YXRlLnBhZ2VzLmdldChpZCk7XG4gICAgICBpZiAoIWUpIHJldHVybjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGUudGVhcmRvd24/LigpO1xuICAgICAgfSBjYXRjaCB7fVxuICAgICAgc3RhdGUucGFnZXMuZGVsZXRlKGlkKTtcbiAgICAgIHN5bmNQYWdlc0dyb3VwKCk7XG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBDYWxsZWQgYnkgdGhlIHR3ZWFrIGhvc3QgYWZ0ZXIgZmV0Y2hpbmcgdGhlIHR3ZWFrIGxpc3QgZnJvbSBtYWluLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldExpc3RlZFR3ZWFrcyhsaXN0OiBMaXN0ZWRUd2Vha1tdKTogdm9pZCB7XG4gIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IGxpc3Q7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaW5qZWN0aW9uIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiB0cnlJbmplY3QoKTogdm9pZCB7XG4gIHJlbW92ZU1pc3BsYWNlZFNldHRpbmdzR3JvdXBzKCk7XG5cbiAgY29uc3QgaXRlbXNHcm91cCA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xuICBpZiAoIWl0ZW1zR3JvdXApIHtcbiAgICBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpO1xuICAgIGlmICghc3RhdGUuc2lkZWJhck1pc3NpbmdMb2dnZWQpIHtcbiAgICAgIHN0YXRlLnNpZGViYXJNaXNzaW5nTG9nZ2VkID0gdHJ1ZTtcbiAgICAgIHBsb2coXCJzaWRlYmFyIG5vdCBmb3VuZFwiKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG4gIHN0YXRlLnNpZGViYXJNaXNzaW5nTG9nZ2VkID0gZmFsc2U7XG4gIGlmIChzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIpIHtcbiAgICBjbGVhclRpbWVvdXQoc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyKTtcbiAgICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBudWxsO1xuICB9XG4gIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUodHJ1ZSwgXCJzaWRlYmFyLWZvdW5kXCIpO1xuICAvLyBDb2RleCdzIGl0ZW1zIGdyb3VwIGxpdmVzIGluc2lkZSBhbiBvdXRlciB3cmFwcGVyIHRoYXQncyBhbHJlYWR5IHN0eWxlZFxuICAvLyB0byBob2xkIG11bHRpcGxlIGdyb3VwcyAoYGZsZXggZmxleC1jb2wgZ2FwLTEgZ2FwLTBgKS4gV2UgaW5qZWN0IG91clxuICAvLyBncm91cCBhcyBhIHNpYmxpbmcgc28gdGhlIG5hdHVyYWwgZ2FwLTEgYWN0cyBhcyBvdXIgdmlzdWFsIHNlcGFyYXRvci5cbiAgY29uc3Qgb3V0ZXIgPSBpdGVtc0dyb3VwLnBhcmVudEVsZW1lbnQgPz8gaXRlbXNHcm91cDtcbiAgaWYgKCFpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShpdGVtc0dyb3VwKSB8fCAhaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUob3V0ZXIpKSB7XG4gICAgc2NoZWR1bGVTZXR0aW5nc1N1cmZhY2VIaWRkZW4oKTtcbiAgICBwbG9nKFwicmVqZWN0ZWQgbm9uLXNldHRpbmdzIHNpZGViYXIgY2FuZGlkYXRlXCIsIHtcbiAgICAgIGl0ZW1zR3JvdXA6IGRlc2NyaWJlKGl0ZW1zR3JvdXApLFxuICAgICAgb3V0ZXI6IGRlc2NyaWJlKG91dGVyKSxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgc3RhdGUuc2lkZWJhclJvb3QgPSBvdXRlcjtcbiAgc3luY05hdGl2ZVNldHRpbmdzSGVhZGVyKGl0ZW1zR3JvdXAsIG91dGVyKTtcblxuICBpZiAoc3RhdGUubmF2R3JvdXAgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUubmF2R3JvdXApKSB7XG4gICAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgICAvLyBDb2RleCByZS1yZW5kZXJzIGl0cyBuYXRpdmUgc2lkZWJhciBidXR0b25zIG9uIGl0cyBvd24gc3RhdGUgY2hhbmdlcy5cbiAgICAvLyBJZiBvbmUgb2Ygb3VyIHBhZ2VzIGlzIGFjdGl2ZSwgcmUtc3RyaXAgQ29kZXgncyBhY3RpdmUgc3R5bGluZyBzb1xuICAgIC8vIEdlbmVyYWwgZG9lc24ndCByZWFwcGVhciBhcyBzZWxlY3RlZC5cbiAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZSAhPT0gbnVsbCkgc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKHRydWUpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFNpZGViYXIgd2FzIGVpdGhlciBmcmVzaGx5IG1vdW50ZWQgKFNldHRpbmdzIGp1c3Qgb3BlbmVkKSBvciByZS1tb3VudGVkXG4gIC8vIChjbG9zZWQgYW5kIHJlLW9wZW5lZCwgb3IgbmF2aWdhdGVkIGF3YXkgYW5kIGJhY2spLiBJbiBhbGwgb2YgdGhvc2VcbiAgLy8gY2FzZXMgQ29kZXggcmVzZXRzIHRvIGl0cyBkZWZhdWx0IHBhZ2UgKEdlbmVyYWwpLCBidXQgb3VyIGluLW1lbW9yeVxuICAvLyBgYWN0aXZlUGFnZWAgbWF5IHN0aWxsIHJlZmVyZW5jZSB0aGUgbGFzdCB0d2Vhay9wYWdlIHRoZSB1c2VyIGhhZCBvcGVuXG4gIC8vIFx1MjAxNCB3aGljaCB3b3VsZCBjYXVzZSB0aGF0IG5hdiBidXR0b24gdG8gcmVuZGVyIHdpdGggdGhlIGFjdGl2ZSBzdHlsaW5nXG4gIC8vIGV2ZW4gdGhvdWdoIENvZGV4IGlzIHNob3dpbmcgR2VuZXJhbC4gQ2xlYXIgaXQgc28gYHN5bmNQYWdlc0dyb3VwYCAvXG4gIC8vIGBzZXROYXZBY3RpdmVgIHN0YXJ0IGZyb20gYSBuZXV0cmFsIHN0YXRlLiBUaGUgcGFuZWxIb3N0IHJlZmVyZW5jZSBpc1xuICAvLyBhbHNvIHN0YWxlIChpdHMgRE9NIHdhcyBkaXNjYXJkZWQgd2l0aCB0aGUgcHJldmlvdXMgY29udGVudCBhcmVhKS5cbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwgfHwgc3RhdGUucGFuZWxIb3N0ICE9PSBudWxsKSB7XG4gICAgcGxvZyhcInNpZGViYXIgcmUtbW91bnQgZGV0ZWN0ZWQ7IGNsZWFyaW5nIHN0YWxlIGFjdGl2ZSBzdGF0ZVwiLCB7XG4gICAgICBwcmV2QWN0aXZlOiBzdGF0ZS5hY3RpdmVQYWdlLFxuICAgIH0pO1xuICAgIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xuICAgIHN0YXRlLnBhbmVsSG9zdCA9IG51bGw7XG4gIH1cblxuICBjb25zdCBleGlzdGluZ0NvZGV4UHBOYXZHcm91cCA9XG4gICAgb3V0ZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJzpzY29wZSA+IFtkYXRhLWNvZGV4cHA9XCJuYXYtZ3JvdXBcIl0nKSA/P1xuICAgIG91dGVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbZGF0YS1jb2RleHBwPVwibmF2LWdyb3VwXCJdJyk7XG5cbiAgaWYgKGV4aXN0aW5nQ29kZXhQcE5hdkdyb3VwKSB7XG4gICAgc3RhdGUubmF2R3JvdXAgPSBleGlzdGluZ0NvZGV4UHBOYXZHcm91cDtcbiAgICBzdGF0ZS5jb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uID0gZXhpc3RpbmdDb2RleFBwTmF2R3JvdXAucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXG4gICAgICBcIltkYXRhLWNvZGV4cHAtc2lkZWJhci11cGRhdGVdXCIsXG4gICAgKTtcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG91dGVyO1xuICAgIHN5bmNQYWdlc0dyb3VwKCk7XG4gICAgcmVmcmVzaFNpZGViYXJDb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uKCk7XG4gICAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwpIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZSh0cnVlKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgR3JvdXAgY29udGFpbmVyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBjb25zdCBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwibmF2LWdyb3VwXCI7XG4gIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcblxuICBjb25zdCB1cGRhdGVCdXR0b24gPSBzaWRlYmFyVXBkYXRlUGlsbEJ1dHRvbigpO1xuICBzdGF0ZS5jb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uID0gdXBkYXRlQnV0dG9uO1xuICBncm91cC5hcHBlbmRDaGlsZChzaWRlYmFyR3JvdXBIZWFkZXIoXCJDb2RleCsrXCIsIFwicHQtM1wiLCB1cGRhdGVCdXR0b24pKTtcbiAgcmVmcmVzaFNpZGViYXJDb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uKCk7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFNpZGViYXIgaXRlbXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IGNvbmZpZ0J0biA9IG1ha2VTaWRlYmFySXRlbShcIkNvbmZpZ1wiLCBjb25maWdJY29uU3ZnKCkpO1xuICBjb25zdCB0d2Vha3NCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJUd2Vha3NcIiwgdHdlYWtzSWNvblN2ZygpKTtcbiAgY29uc3Qgc3RvcmVCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJUd2VhayBTdG9yZVwiLCBzdG9yZUljb25TdmcoKSk7XG4gIGFwcGVuZFNpZGViYXJTdG9yZVVwZGF0ZUJhZGdlKHN0b3JlQnRuKTtcblxuICBjb25maWdCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgYWN0aXZhdGVQYWdlKHsga2luZDogXCJjb25maWdcIiB9KTtcbiAgfSk7XG4gIHR3ZWFrc0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcInR3ZWFrc1wiIH0pO1xuICB9KTtcbiAgc3RvcmVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgYWN0aXZhdGVQYWdlKHsga2luZDogXCJzdG9yZVwiIH0pO1xuICB9KTtcblxuICBncm91cC5hcHBlbmRDaGlsZChjb25maWdCdG4pO1xuICBncm91cC5hcHBlbmRDaGlsZCh0d2Vha3NCdG4pO1xuICBncm91cC5hcHBlbmRDaGlsZChzdG9yZUJ0bik7XG4gIG91dGVyLmFwcGVuZENoaWxkKGdyb3VwKTtcblxuICBzdGF0ZS5uYXZHcm91cCA9IGdyb3VwO1xuICBzdGF0ZS5uYXZCdXR0b25zID0geyBjb25maWc6IGNvbmZpZ0J0biwgdHdlYWtzOiB0d2Vha3NCdG4sIHN0b3JlOiBzdG9yZUJ0biB9O1xuICBwbG9nKFwibmF2IGdyb3VwIGluamVjdGVkXCIsIHsgb3V0ZXJUYWc6IG91dGVyLnRhZ05hbWUgfSk7XG4gIHN5bmNQYWdlc0dyb3VwKCk7XG59XG5cbmZ1bmN0aW9uIHN5bmNOYXRpdmVTZXR0aW5nc0hlYWRlcihpdGVtc0dyb3VwOiBIVE1MRWxlbWVudCwgb3V0ZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGlmIChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUubmF0aXZlTmF2SGVhZGVyKSkgcmV0dXJuO1xuICBpZiAob3V0ZXIgPT09IGl0ZW1zR3JvdXApIHJldHVybjtcblxuICBjb25zdCBoZWFkZXIgPSBzaWRlYmFyR3JvdXBIZWFkZXIoXCJHZW5lcmFsXCIpO1xuICBoZWFkZXIuZGF0YXNldC5jb2RleHBwID0gXCJuYXRpdmUtbmF2LWhlYWRlclwiO1xuICBvdXRlci5pbnNlcnRCZWZvcmUoaGVhZGVyLCBpdGVtc0dyb3VwKTtcbiAgc3RhdGUubmF0aXZlTmF2SGVhZGVyID0gaGVhZGVyO1xufVxuXG5mdW5jdGlvbiBzaWRlYmFyR3JvdXBIZWFkZXIodGV4dDogc3RyaW5nLCB0b3BQYWRkaW5nID0gXCJwdC0yXCIsIHRyYWlsaW5nPzogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlci5jbGFzc05hbWUgPVxuICAgIGBweC1yb3cteCAke3RvcFBhZGRpbmd9IHBiLTEgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0yIHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmQgc2VsZWN0LW5vbmVgO1xuICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBsYWJlbC5jbGFzc05hbWUgPSBcInRydW5jYXRlXCI7XG4gIGxhYmVsLnRleHRDb250ZW50ID0gdGV4dDtcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgaWYgKHRyYWlsaW5nKSBoZWFkZXIuYXBwZW5kQ2hpbGQodHJhaWxpbmcpO1xuICByZXR1cm4gaGVhZGVyO1xufVxuXG5mdW5jdGlvbiBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlIHx8IHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcikgcmV0dXJuO1xuICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBudWxsO1xuICAgIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgICBpZiAoc2lkZWJhciAmJiBpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShzaWRlYmFyKSkgcmV0dXJuO1xuICAgIGlmIChpc1NldHRpbmdzVGV4dFZpc2libGUoKSkgcmV0dXJuO1xuICAgIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUoZmFsc2UsIFwic2lkZWJhci1ub3QtZm91bmRcIik7XG4gIH0sIDE1MDApO1xufVxuXG5mdW5jdGlvbiBpc1NldHRpbmdzVGV4dFZpc2libGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBpc0NvZGV4UHBTZXR0aW5nc0xhYmVsU2V0KGNvZGV4UHBTZXR0aW5nc0xhYmVsc0Zyb20oZG9jdW1lbnQpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFNldHRpbmdzVGV4dCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSB8fCBcIlwiKS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKS50cmltKCk7XG59XG5cbmNvbnN0IENPREVYUFBfQ09SRV9TRVRUSU5HU19MQUJFTFMgPSBbXG4gIFwiR2VuZXJhbFwiLFxuICBcIlx1NUUzOFx1ODlDNFwiLFxuICBcIlx1OTAxQVx1NzUyOFwiLFxuICBcIkFwcGVhcmFuY2VcIixcbiAgXCJcdTU5MTZcdTg5QzJcIixcbiAgXCJDb25maWd1cmF0aW9uXCIsXG4gIFwiXHU5MTREXHU3RjZFXCIsXG4gIFwiXHU5RUQ4XHU4QkE0XHU2NzQzXHU5NjUwXCIsXG4gIFwiUGVyc29uYWxpemF0aW9uXCIsXG4gIFwiXHU0RTJBXHU2MDI3XHU1MzE2XCIsXG5dLm1hcChub3JtYWxpemVDb2RleFBwU2V0dGluZ3NMYWJlbCk7XG5cbmNvbnN0IENPREVYUFBfRVhURU5ERURfU0VUVElOR1NfTEFCRUxTID0gW1xuICBcIkFjY291bnRcIixcbiAgXCJcdThEMjZcdTYyMzdcIixcbiAgXCJcdThEMjZcdTUzRjdcIixcbiAgXCJHZW5lcmFsXCIsXG4gIFwiXHU1RTM4XHU4OUM0XCIsXG4gIFwiXHU5MDFBXHU3NTI4XCIsXG4gIFwiQXBwZWFyYW5jZVwiLFxuICBcIlx1NTkxNlx1ODlDMlwiLFxuICBcIkNvbmZpZ3VyYXRpb25cIixcbiAgXCJcdTkxNERcdTdGNkVcIixcbiAgXCJcdTlFRDhcdThCQTRcdTY3NDNcdTk2NTBcIixcbiAgXCJQZXJzb25hbGl6YXRpb25cIixcbiAgXCJcdTRFMkFcdTYwMjdcdTUzMTZcIixcbiAgXCJLZXlib2FyZCBzaG9ydGN1dHNcIixcbiAgXCJBcmNoaXZlZCBjaGF0c1wiLFxuICBcIlVzYWdlXCIsXG4gIFwiQ29tcHV0ZXIgdXNlXCIsXG4gIFwiQnJvd3NlciB1c2VcIixcbiAgXCJNQ1Agc2VydmVyc1wiLFxuICBcIk1DUCBTZXJ2ZXJzXCIsXG4gIFwiTUNQIFx1NjcwRFx1NTJBMVx1NTY2OFwiLFxuICBcIkdpdFwiLFxuICBcIkVudmlyb25tZW50c1wiLFxuICBcIlx1NzNBRlx1NTg4M1wiLFxuICBcIkNsb3VkIEVudmlyb25tZW50c1wiLFxuICBcIldvcmt0cmVlc1wiLFxuICBcIkNvbm5lY3Rpb25zXCIsXG4gIFwiUGx1Z2luc1wiLFxuICBcIlNraWxsc1wiLFxuXS5tYXAobm9ybWFsaXplQ29kZXhQcFNldHRpbmdzTGFiZWwpO1xuXG5jb25zdCBDT0RFWFBQX1NFVFRJTkdTX09OTFlfTEFCRUxTID0gW1xuICBcIkdlbmVyYWxcIixcbiAgXCJcdTVFMzhcdTg5QzRcIixcbiAgXCJcdTkwMUFcdTc1MjhcIixcbiAgXCJBcHBlYXJhbmNlXCIsXG4gIFwiXHU1OTE2XHU4OUMyXCIsXG4gIFwiQ29uZmlndXJhdGlvblwiLFxuICBcIlx1OTE0RFx1N0Y2RVwiLFxuICBcIlx1OUVEOFx1OEJBNFx1Njc0M1x1OTY1MFwiLFxuICBcIlBlcnNvbmFsaXphdGlvblwiLFxuICBcIlx1NEUyQVx1NjAyN1x1NTMxNlwiLFxuICBcIktleWJvYXJkIHNob3J0Y3V0c1wiLFxuICBcIkFyY2hpdmVkIGNoYXRzXCIsXG4gIFwiVXNhZ2VcIixcbiAgXCJDb21wdXRlciB1c2VcIixcbiAgXCJCcm93c2VyIHVzZVwiLFxuICBcIk1DUCBzZXJ2ZXJzXCIsXG4gIFwiTUNQIFNlcnZlcnNcIixcbiAgXCJNQ1AgXHU2NzBEXHU1MkExXHU1NjY4XCIsXG4gIFwiR2l0XCIsXG4gIFwiRW52aXJvbm1lbnRzXCIsXG4gIFwiXHU3M0FGXHU1ODgzXCIsXG4gIFwiQ2xvdWQgRW52aXJvbm1lbnRzXCIsXG4gIFwiV29ya3RyZWVzXCIsXG4gIFwiQ29ubmVjdGlvbnNcIixcbl0ubWFwKG5vcm1hbGl6ZUNvZGV4UHBTZXR0aW5nc0xhYmVsKTtcblxuY29uc3QgQ09ERVhQUF9NQUlOX0FQUF9OQVZfTEFCRUxTID0gW1xuICBcIk5ldyBjaGF0XCIsXG4gIFwiUXVpY2sgY2hhdFwiLFxuICBcIlx1NUZFQlx1OTAxRlx1NUJGOVx1OEJERFwiLFxuICBcIlNlYXJjaFwiLFxuICBcIlx1NjQxQ1x1N0QyMlwiLFxuICBcIlBsdWdpbnNcIixcbiAgXCJcdTYzRDJcdTRFRjZcIixcbiAgXCJBdXRvbWF0aW9uc1wiLFxuICBcIkF1dG9tYXRpb25cIixcbiAgXCJcdTgxRUFcdTUyQThcdTUzMTZcIixcbiAgXCJDaGF0c1wiLFxuICBcIkNoYXRcIixcbiAgXCJcdTVCRjlcdThCRERcIixcbiAgXCJQcm9qZWN0c1wiLFxuICBcIlx1OTg3OVx1NzZFRVwiLFxuICBcIlBpbm5lZFwiLFxuICBcIlNldHRpbmdzXCIsXG4gIFwiXHU4QkJFXHU3RjZFXCIsXG4gIFwiV29yayBsb2NhbGx5XCIsXG5dLm1hcChub3JtYWxpemVDb2RleFBwU2V0dGluZ3NMYWJlbCk7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvZGV4UHBTZXR0aW5nc0xhYmVsKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gY29tcGFjdFNldHRpbmdzVGV4dCh2YWx1ZSlcbiAgICAudG9Mb2NhbGVMb3dlckNhc2UoKVxuICAgIC5ub3JtYWxpemUoXCJORkRcIilcbiAgICAucmVwbGFjZSgvW1xcdTAzMDAtXFx1MDM2Zl0vZywgXCJcIilcbiAgICAucmVwbGFjZSgvW1x1MjAxOVx1MjAxOGBcdTAwQjRdL2csIFwiJ1wiKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKVxuICAgIC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBDb250cm9sTGFiZWwoZWw6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgcmV0dXJuIG5vcm1hbGl6ZUNvZGV4UHBTZXR0aW5nc0xhYmVsKFxuICAgIGVsLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIikgfHxcbiAgICAgIGVsLmdldEF0dHJpYnV0ZShcInRpdGxlXCIpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudCB8fFxuICAgICAgXCJcIixcbiAgKTtcbn1cblxuZnVuY3Rpb24gY29kZXhQcFNldHRpbmdzTGFiZWxzRnJvbShyb290OiBQYXJlbnROb2RlKTogc3RyaW5nW10ge1xuICBjb25zdCBjb250cm9scyA9IEFycmF5LmZyb20oXG4gICAgcm9vdC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcImJ1dHRvbixhLFtyb2xlPSdidXR0b24nXSxbcm9sZT0nbGluayddXCIpLFxuICApO1xuXG4gIHJldHVybiBbXG4gICAgLi4ubmV3IFNldChcbiAgICAgIGNvbnRyb2xzXG4gICAgICAgIC5tYXAoY29kZXhQcENvbnRyb2xMYWJlbClcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKSxcbiAgICApLFxuICBdO1xufVxuXG5mdW5jdGlvbiBjb2RleFBwU2V0dGluZ3NMYWJlbFNjb3JlKGxhYmVsczogc3RyaW5nW10pOiB7IGNvcmU6IG51bWJlcjsgdG90YWw6IG51bWJlciB9IHtcbiAgY29uc3QgY29yZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCB0b3RhbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gIGZvciAoY29uc3QgbGFiZWwgb2YgbGFiZWxzKSB7XG4gICAgZm9yIChjb25zdCBtYXJrZXIgb2YgQ09ERVhQUF9DT1JFX1NFVFRJTkdTX0xBQkVMUykge1xuICAgICAgaWYgKGNvZGV4UHBMYWJlbE1hdGNoZXNNYXJrZXIobGFiZWwsIG1hcmtlcikpIGNvcmUuYWRkKG1hcmtlcik7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtYXJrZXIgb2YgQ09ERVhQUF9FWFRFTkRFRF9TRVRUSU5HU19MQUJFTFMpIHtcbiAgICAgIGlmIChjb2RleFBwTGFiZWxNYXRjaGVzTWFya2VyKGxhYmVsLCBtYXJrZXIpKSB0b3RhbC5hZGQobWFya2VyKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBjb3JlOiBjb3JlLnNpemUsIHRvdGFsOiB0b3RhbC5zaXplIH07XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBMYWJlbE1hdGNoZXNNYXJrZXIobGFiZWw6IHN0cmluZywgbWFya2VyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIGxhYmVsID09PSBtYXJrZXIgfHwgbGFiZWwuaW5jbHVkZXMobWFya2VyKTtcbn1cblxuZnVuY3Rpb24gY29kZXhQcE1hcmtlckNvdW50KGxhYmVsczogc3RyaW5nW10sIG1hcmtlcnM6IHN0cmluZ1tdKTogbnVtYmVyIHtcbiAgY29uc3QgbWF0Y2hlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGxhYmVsIG9mIGxhYmVscykge1xuICAgIGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnMpIHtcbiAgICAgIGlmIChjb2RleFBwTGFiZWxNYXRjaGVzTWFya2VyKGxhYmVsLCBtYXJrZXIpKSBtYXRjaGVkLmFkZChtYXJrZXIpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWF0Y2hlZC5zaXplO1xufVxuXG5mdW5jdGlvbiBoYXNDb2RleFBwU2V0dGluZ3NPbmx5U2lnbmFsKGxhYmVsczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIGNvZGV4UHBNYXJrZXJDb3VudChsYWJlbHMsIENPREVYUFBfU0VUVElOR1NfT05MWV9MQUJFTFMpID4gMDtcbn1cblxuZnVuY3Rpb24gaGFzTWFpbkFwcFNpZGViYXJTaWduYWxzKGxhYmVsczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgcmV0dXJuIGNvZGV4UHBNYXJrZXJDb3VudChsYWJlbHMsIENPREVYUFBfTUFJTl9BUFBfTkFWX0xBQkVMUykgPj0gMjtcbn1cblxuZnVuY3Rpb24gaXNDb2RleFBwU2V0dGluZ3NMYWJlbFNldChsYWJlbHM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG4gIGNvbnN0IHNjb3JlID0gY29kZXhQcFNldHRpbmdzTGFiZWxTY29yZShsYWJlbHMpO1xuICByZXR1cm4gc2NvcmUuY29yZSA+PSAyICYmIHNjb3JlLnRvdGFsID49IDM7XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBWaXNpYmxlQm94KGVsOiBIVE1MRWxlbWVudCk6IERPTVJlY3QgfCBudWxsIHtcbiAgaWYgKCFlbC5pc0Nvbm5lY3RlZCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XG4gIGlmIChzdHlsZS5kaXNwbGF5ID09PSBcIm5vbmVcIiB8fCBzdHlsZS52aXNpYmlsaXR5ID09PSBcImhpZGRlblwiKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGlmIChyZWN0LndpZHRoIDw9IDAgfHwgcmVjdC5oZWlnaHQgPD0gMCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiByZWN0O1xufVxuXG5mdW5jdGlvbiBzZXRTZXR0aW5nc1N1cmZhY2VWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4sIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG4gIGlmIChzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlID09PSB2aXNpYmxlKSByZXR1cm47XG4gIHN0YXRlLnNldHRpbmdzU3VyZmFjZVZpc2libGUgPSB2aXNpYmxlO1xuICBpZiAodmlzaWJsZSkgd2FybVR3ZWFrU3RvcmUoKTtcbiAgdHJ5IHtcbiAgICAod2luZG93IGFzIFdpbmRvdyAmIHsgX19jb2RleHBwU2V0dGluZ3NTdXJmYWNlVmlzaWJsZT86IGJvb2xlYW4gfSkuX19jb2RleHBwU2V0dGluZ3NTdXJmYWNlVmlzaWJsZSA9IHZpc2libGU7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmRhdGFzZXQuY29kZXhwcFNldHRpbmdzU3VyZmFjZSA9IHZpc2libGUgPyBcInRydWVcIiA6IFwiZmFsc2VcIjtcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBDdXN0b21FdmVudChcImNvZGV4cHA6c2V0dGluZ3Mtc3VyZmFjZVwiLCB7XG4gICAgICAgIGRldGFpbDogeyB2aXNpYmxlLCByZWFzb24gfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2gge31cbiAgcGxvZyhcInNldHRpbmdzIHN1cmZhY2VcIiwgeyB2aXNpYmxlLCByZWFzb24sIHVybDogbG9jYXRpb24uaHJlZiB9KTtcbn1cblxuLyoqXG4gKiBSZW5kZXIgKG9yIHJlLXJlbmRlcikgdGhlIHNlY29uZCBzaWRlYmFyIGdyb3VwIG9mIHBlci10d2VhayBwYWdlcy4gVGhlXG4gKiBncm91cCBpcyBjcmVhdGVkIGxhemlseSBhbmQgcmVtb3ZlZCB3aGVuIHRoZSBsYXN0IHBhZ2UgdW5yZWdpc3RlcnMsIHNvXG4gKiB1c2VycyB3aXRoIG5vIHBhZ2UtcmVnaXN0ZXJpbmcgdHdlYWtzIG5ldmVyIHNlZSBhbiBlbXB0eSBcIlR3ZWFrc1wiIGhlYWRlci5cbiAqL1xuZnVuY3Rpb24gc3luY1BhZ2VzR3JvdXAoKTogdm9pZCB7XG4gIGNvbnN0IG91dGVyID0gc3RhdGUuc2lkZWJhclJvb3Q7XG4gIGlmICghb3V0ZXIpIHJldHVybjtcbiAgaWYgKCFpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShvdXRlcikpIHtcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG51bGw7XG4gICAgc3RhdGUucGFnZXNHcm91cCA9IG51bGw7XG4gICAgc3RhdGUucGFnZXNHcm91cEtleSA9IG51bGw7XG4gICAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSBwLm5hdkJ1dHRvbiA9IG51bGw7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHBhZ2VzID0gWy4uLnN0YXRlLnBhZ2VzLnZhbHVlcygpXTtcblxuICAvLyBCdWlsZCBhIGRldGVybWluaXN0aWMgZmluZ2VycHJpbnQgb2YgdGhlIGRlc2lyZWQgZ3JvdXAgc3RhdGUuIElmIHRoZVxuICAvLyBjdXJyZW50IERPTSBncm91cCBhbHJlYWR5IG1hdGNoZXMsIHRoaXMgaXMgYSBuby1vcCBcdTIwMTQgY3JpdGljYWwsIGJlY2F1c2VcbiAgLy8gc3luY1BhZ2VzR3JvdXAgaXMgY2FsbGVkIG9uIGV2ZXJ5IE11dGF0aW9uT2JzZXJ2ZXIgdGljayBhbmQgYW55IERPTVxuICAvLyB3cml0ZSB3b3VsZCByZS10cmlnZ2VyIHRoYXQgb2JzZXJ2ZXIgKGluZmluaXRlIGxvb3AsIGFwcCBmcmVlemUpLlxuICBjb25zdCBkZXNpcmVkS2V5ID0gcGFnZXMubGVuZ3RoID09PSAwXG4gICAgPyBcIkVNUFRZXCJcbiAgICA6IHBhZ2VzLm1hcCgocCkgPT4gYCR7cC5pZH18JHtwLnBhZ2UudGl0bGV9fCR7cC5wYWdlLmljb25TdmcgPz8gXCJcIn1gKS5qb2luKFwiXFxuXCIpO1xuICBjb25zdCBncm91cEF0dGFjaGVkID0gISFzdGF0ZS5wYWdlc0dyb3VwICYmIG91dGVyLmNvbnRhaW5zKHN0YXRlLnBhZ2VzR3JvdXApO1xuICBpZiAoc3RhdGUucGFnZXNHcm91cEtleSA9PT0gZGVzaXJlZEtleSAmJiAocGFnZXMubGVuZ3RoID09PSAwID8gIWdyb3VwQXR0YWNoZWQgOiBncm91cEF0dGFjaGVkKSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoc3RhdGUucGFnZXNHcm91cCkge1xuICAgICAgc3RhdGUucGFnZXNHcm91cC5yZW1vdmUoKTtcbiAgICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcbiAgICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgZ3JvdXAgPSBzdGF0ZS5wYWdlc0dyb3VwO1xuICBpZiAoIWdyb3VwIHx8ICFvdXRlci5jb250YWlucyhncm91cCkpIHtcbiAgICBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JvdXAuZGF0YXNldC5jb2RleHBwID0gXCJwYWdlcy1ncm91cFwiO1xuICAgIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcbiAgICBncm91cC5hcHBlbmRDaGlsZChzaWRlYmFyR3JvdXBIZWFkZXIoXCJUd2Vha3NcIiwgXCJwdC0zXCIpKTtcbiAgICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XG4gICAgc3RhdGUucGFnZXNHcm91cCA9IGdyb3VwO1xuICB9IGVsc2Uge1xuICAgIC8vIFN0cmlwIHByaW9yIGJ1dHRvbnMgKGtlZXAgdGhlIGhlYWRlciBhdCBpbmRleCAwKS5cbiAgICB3aGlsZSAoZ3JvdXAuY2hpbGRyZW4ubGVuZ3RoID4gMSkgZ3JvdXAucmVtb3ZlQ2hpbGQoZ3JvdXAubGFzdENoaWxkISk7XG4gIH1cblxuICBmb3IgKGNvbnN0IHAgb2YgcGFnZXMpIHtcbiAgICBjb25zdCBpY29uID0gcC5wYWdlLmljb25TdmcgPz8gZGVmYXVsdFBhZ2VJY29uU3ZnKCk7XG4gICAgY29uc3QgYnRuID0gbWFrZVNpZGViYXJJdGVtKHAucGFnZS50aXRsZSwgaWNvbik7XG4gICAgYnRuLmRhdGFzZXQuY29kZXhwcCA9IGBuYXYtcGFnZS0ke3AuaWR9YDtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgYWN0aXZhdGVQYWdlKHsga2luZDogXCJyZWdpc3RlcmVkXCIsIGlkOiBwLmlkIH0pO1xuICAgIH0pO1xuICAgIHAubmF2QnV0dG9uID0gYnRuO1xuICAgIGdyb3VwLmFwcGVuZENoaWxkKGJ0bik7XG4gIH1cbiAgc3RhdGUucGFnZXNHcm91cEtleSA9IGRlc2lyZWRLZXk7XG4gIHBsb2coXCJwYWdlcyBncm91cCBzeW5jZWRcIiwge1xuICAgIGNvdW50OiBwYWdlcy5sZW5ndGgsXG4gICAgaWRzOiBwYWdlcy5tYXAoKHApID0+IHAuaWQpLFxuICB9KTtcbiAgLy8gUmVmbGVjdCBjdXJyZW50IGFjdGl2ZSBzdGF0ZSBhY3Jvc3MgdGhlIHJlYnVpbHQgYnV0dG9ucy5cbiAgc2V0TmF2QWN0aXZlKHN0YXRlLmFjdGl2ZVBhZ2UpO1xufVxuXG5mdW5jdGlvbiBtYWtlU2lkZWJhckl0ZW0obGFiZWw6IHN0cmluZywgaWNvblN2Zzogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICAvLyBDbGFzcyBzdHJpbmcgY29waWVkIHZlcmJhdGltIGZyb20gQ29kZXgncyBzaWRlYmFyIGJ1dHRvbnMgKEdlbmVyYWwgZXRjKS5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi0ke2xhYmVsLnRvTG93ZXJDYXNlKCl9YDtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbGFiZWwpO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBcImZvY3VzLXZpc2libGU6b3V0bGluZS10b2tlbi1ib3JkZXIgcmVsYXRpdmUgcHgtcm93LXggcHktcm93LXkgY3Vyc29yLWludGVyYWN0aW9uIHNocmluay0wIGl0ZW1zLWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyB0ZXh0LWxlZnQgdGV4dC1zbSBmb2N1cy12aXNpYmxlOm91dGxpbmUgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLTIgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLW9mZnNldC0yIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTUwIGdhcC0yIGZsZXggdy1mdWxsIGhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBmb250LW5vcm1hbFwiO1xuXG4gIGNvbnN0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaW5uZXIuY2xhc3NOYW1lID1cbiAgICBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgdGV4dC1iYXNlIGdhcC0yIGZsZXgtMSB0ZXh0LXRva2VuLWZvcmVncm91bmRcIjtcbiAgaW5uZXIuaW5uZXJIVE1MID0gYCR7aWNvblN2Z308c3BhbiBjbGFzcz1cInRydW5jYXRlXCI+JHtsYWJlbH08L3NwYW4+YDtcbiAgYnRuLmFwcGVuZENoaWxkKGlubmVyKTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gYXBwZW5kU2lkZWJhclN0b3JlVXBkYXRlQmFkZ2UoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmICghaW5uZXIpIHJldHVybjtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgYmFkZ2UuZGF0YXNldC5jb2RleHBwU3RvcmVVcGRhdGVCYWRnZSA9IFwidHJ1ZVwiO1xuICBiYWRnZS5oaWRkZW4gPSB0cnVlO1xuICBiYWRnZS50aXRsZSA9IFwiSW5zdGFsbGVkIHR3ZWFrcyB3aXRoIGFwcHJvdmVkIHVwZGF0ZXNcIjtcbiAgYmFkZ2UuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXJcIjtcbiAgT2JqZWN0LmFzc2lnbihiYWRnZS5zdHlsZSwge1xuICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gICAgcmlnaHQ6IFwiMTJweFwiLFxuICAgIHRvcDogXCI1MCVcIixcbiAgICB0cmFuc2Zvcm06IFwidHJhbnNsYXRlWSgtNTAlKVwiLFxuICAgIHpJbmRleDogXCIxXCIsXG4gIH0pO1xuICBhcHBseVN0b3JlVXBkYXRlQmFkZ2VTdHlsZShiYWRnZSwgbnVsbCk7XG4gIGJ0bi5hcHBlbmRDaGlsZChiYWRnZSk7XG59XG5cbi8qKiBJbnRlcm5hbCBrZXkgZm9yIHRoZSBidWlsdC1pbiBuYXYgYnV0dG9ucy4gKi9cbnR5cGUgQnVpbHRpblBhZ2UgPSBcImNvbmZpZ1wiIHwgXCJ0d2Vha3NcIiB8IFwic3RvcmVcIjtcblxuZnVuY3Rpb24gc2V0TmF2QWN0aXZlKGFjdGl2ZTogQWN0aXZlUGFnZSB8IG51bGwpOiB2b2lkIHtcbiAgLy8gQnVpbHQtaW4gKENvbmZpZy9Ud2Vha3MpIGJ1dHRvbnMuXG4gIGlmIChzdGF0ZS5uYXZCdXR0b25zKSB7XG4gICAgY29uc3QgYnVpbHRpbjogQnVpbHRpblBhZ2UgfCBudWxsID1cbiAgICAgIGFjdGl2ZT8ua2luZCA9PT0gXCJjb25maWdcIiA/IFwiY29uZmlnXCIgOlxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInR3ZWFrc1wiID8gXCJ0d2Vha3NcIiA6XG4gICAgICBhY3RpdmU/LmtpbmQgPT09IFwic3RvcmVcIiA/IFwic3RvcmVcIiA6IG51bGw7XG4gICAgZm9yIChjb25zdCBba2V5LCBidG5dIG9mIE9iamVjdC5lbnRyaWVzKHN0YXRlLm5hdkJ1dHRvbnMpIGFzIFtCdWlsdGluUGFnZSwgSFRNTEJ1dHRvbkVsZW1lbnRdW10pIHtcbiAgICAgIGFwcGx5TmF2QWN0aXZlKGJ0biwga2V5ID09PSBidWlsdGluKTtcbiAgICB9XG4gIH1cbiAgLy8gUGVyLXBhZ2UgcmVnaXN0ZXJlZCBidXR0b25zLlxuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoIXAubmF2QnV0dG9uKSBjb250aW51ZTtcbiAgICBjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgYWN0aXZlLmlkID09PSBwLmlkO1xuICAgIGFwcGx5TmF2QWN0aXZlKHAubmF2QnV0dG9uLCBpc0FjdGl2ZSk7XG4gIH1cbiAgLy8gQ29kZXgncyBvd24gc2lkZWJhciBidXR0b25zIChHZW5lcmFsLCBBcHBlYXJhbmNlLCBldGMpLiBXaGVuIG9uZSBvZlxuICAvLyBvdXIgcGFnZXMgaXMgYWN0aXZlLCBDb2RleCBzdGlsbCBoYXMgYXJpYS1jdXJyZW50PVwicGFnZVwiIGFuZCB0aGVcbiAgLy8gYWN0aXZlLWJnIGNsYXNzIG9uIHdoaWNoZXZlciBpdGVtIGl0IGNvbnNpZGVyZWQgdGhlIHJvdXRlIFx1MjAxNCB0eXBpY2FsbHlcbiAgLy8gR2VuZXJhbC4gVGhhdCBtYWtlcyBib3RoIGJ1dHRvbnMgbG9vayBzZWxlY3RlZC4gU3RyaXAgQ29kZXgncyBhY3RpdmVcbiAgLy8gc3R5bGluZyB3aGlsZSBvbmUgb2Ygb3VycyBpcyBhY3RpdmU7IHJlc3RvcmUgaXQgd2hlbiBub25lIGlzLlxuICBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUoYWN0aXZlICE9PSBudWxsKTtcbn1cblxuLyoqXG4gKiBNdXRlIENvZGV4J3Mgb3duIGFjdGl2ZS1zdGF0ZSBzdHlsaW5nIG9uIGl0cyBzaWRlYmFyIGJ1dHRvbnMuIFdlIGRvbid0XG4gKiB0b3VjaCBDb2RleCdzIFJlYWN0IHN0YXRlIFx1MjAxNCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIG5hdGl2ZSBpdGVtLCBDb2RleFxuICogcmUtcmVuZGVycyB0aGUgYnV0dG9ucyBhbmQgcmUtYXBwbGllcyBpdHMgb3duIGNvcnJlY3Qgc3RhdGUsIHRoZW4gb3VyXG4gKiBzaWRlYmFyLWNsaWNrIGxpc3RlbmVyIGZpcmVzIGByZXN0b3JlQ29kZXhWaWV3YCAod2hpY2ggY2FsbHMgYmFjayBpbnRvXG4gKiBgc2V0TmF2QWN0aXZlKG51bGwpYCBhbmQgbGV0cyBDb2RleCdzIHN0eWxpbmcgc3RhbmQpLlxuICpcbiAqIGBtdXRlPXRydWVgICBcdTIxOTIgc3RyaXAgYXJpYS1jdXJyZW50IGFuZCBzd2FwIGFjdGl2ZSBiZyBcdTIxOTIgaG92ZXIgYmdcbiAqIGBtdXRlPWZhbHNlYCBcdTIxOTIgbm8tb3AgKENvZGV4J3Mgb3duIHJlLXJlbmRlciBhbHJlYWR5IHJlc3RvcmVkIHRoaW5ncylcbiAqL1xuZnVuY3Rpb24gc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKG11dGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFtdXRlKSByZXR1cm47XG4gIGNvbnN0IHJvb3QgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKCFyb290KSByZXR1cm47XG4gIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXCJidXR0b25cIikpO1xuICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XG4gICAgLy8gU2tpcCBvdXIgb3duIGJ1dHRvbnMuXG4gICAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xuICAgIGlmIChidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpID09PSBcInBhZ2VcIikge1xuICAgICAgYnRuLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiKTtcbiAgICB9XG4gICAgaWYgKGJ0bi5jbGFzc0xpc3QuY29udGFpbnMoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIikpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5TmF2QWN0aXZlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChhY3RpdmUpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIiwgXCJwYWdlXCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiLCBcImZvbnQtbm9ybWFsXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGFjdGl2YXRpb24gXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIGFjdGl2YXRlUGFnZShwYWdlOiBBY3RpdmVQYWdlKTogdm9pZCB7XG4gIGNvbnN0IGNvbnRlbnQgPSBmaW5kQ29udGVudEFyZWEoKTtcbiAgaWYgKCFjb250ZW50KSB7XG4gICAgcGxvZyhcImFjdGl2YXRlOiBjb250ZW50IGFyZWEgbm90IGZvdW5kXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBzdGF0ZS5hY3RpdmVQYWdlID0gcGFnZTtcbiAgcGxvZyhcImFjdGl2YXRlXCIsIHsgcGFnZSB9KTtcblxuICAvLyBIaWRlIENvZGV4J3MgY29udGVudCBjaGlsZHJlbiwgc2hvdyBvdXJzLlxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oY29udGVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuID0gY2hpbGQuc3R5bGUuZGlzcGxheSB8fCBcIlwiO1xuICAgIH1cbiAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIH1cbiAgbGV0IHBhbmVsID0gY29udGVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtY29kZXhwcD1cInR3ZWFrcy1wYW5lbFwiXScpO1xuICBpZiAoIXBhbmVsKSB7XG4gICAgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHBhbmVsLmRhdGFzZXQuY29kZXhwcCA9IFwidHdlYWtzLXBhbmVsXCI7XG4gICAgcGFuZWwuc3R5bGUuY3NzVGV4dCA9IFwid2lkdGg6MTAwJTtoZWlnaHQ6MTAwJTtvdmVyZmxvdzphdXRvO1wiO1xuICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICB9XG4gIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIHN0YXRlLnBhbmVsSG9zdCA9IHBhbmVsO1xuICByZXJlbmRlcigpO1xuICBzZXROYXZBY3RpdmUocGFnZSk7XG4gIC8vIHJlc3RvcmUgQ29kZXgncyB2aWV3LiBSZS1yZWdpc3RlciBpZiBuZWVkZWQuXG4gIGNvbnN0IHNpZGViYXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKHNpZGViYXIpIHtcbiAgICBpZiAoc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyKSB7XG4gICAgICBzaWRlYmFyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsIHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBoYW5kbGVyID0gKGU6IEV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgaWYgKHN0YXRlLm5hdkdyb3VwPy5jb250YWlucyh0YXJnZXQpKSByZXR1cm47IC8vIG91ciBidXR0b25zXG4gICAgICBpZiAoc3RhdGUucGFnZXNHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgcGFnZSBidXR0b25zXG4gICAgICBpZiAodGFyZ2V0LmNsb3Nlc3QoXCJbZGF0YS1jb2RleHBwLXNldHRpbmdzLXNlYXJjaF1cIikpIHJldHVybjtcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgICB9O1xuICAgIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgc2lkZWJhci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlciwgdHJ1ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzdG9yZUNvZGV4VmlldygpOiB2b2lkIHtcbiAgcGxvZyhcInJlc3RvcmUgY29kZXggdmlld1wiKTtcbiAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xuICBpZiAoIWNvbnRlbnQpIHJldHVybjtcbiAgaWYgKHN0YXRlLnBhbmVsSG9zdCkgc3RhdGUucGFuZWxIb3N0LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcbiAgICBpZiAoY2hpbGQgPT09IHN0YXRlLnBhbmVsSG9zdCkgY29udGludWU7XG4gICAgaWYgKGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xuICAgICAgZGVsZXRlIGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbjtcbiAgICB9XG4gIH1cbiAgc3RhdGUuYWN0aXZlUGFnZSA9IG51bGw7XG4gIHNldE5hdkFjdGl2ZShudWxsKTtcbiAgaWYgKHN0YXRlLnNpZGViYXJSb290ICYmIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xuICAgIHN0YXRlLnNpZGViYXJSb290LnJlbW92ZUV2ZW50TGlzdGVuZXIoXG4gICAgICBcImNsaWNrXCIsXG4gICAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsXG4gICAgICB0cnVlLFxuICAgICk7XG4gICAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyID0gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXJlbmRlcigpOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZS5hY3RpdmVQYWdlKSByZXR1cm47XG4gIGNvbnN0IGhvc3QgPSBzdGF0ZS5wYW5lbEhvc3Q7XG4gIGlmICghaG9zdCkgcmV0dXJuO1xuICBob3N0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgY29uc3QgYXAgPSBzdGF0ZS5hY3RpdmVQYWdlO1xuICBpZiAoYXAua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIpIHtcbiAgICBjb25zdCBlbnRyeSA9IHN0YXRlLnBhZ2VzLmdldChhcC5pZCk7XG4gICAgaWYgKCFlbnRyeSkge1xuICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByb290ID0gcGFuZWxTaGVsbChlbnRyeS5wYWdlLnRpdGxlLCBlbnRyeS5wYWdlLmRlc2NyaXB0aW9uKTtcbiAgICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICAgIHRyeSB7XG4gICAgICAvLyBUZWFyIGRvd24gYW55IHByaW9yIHJlbmRlciBiZWZvcmUgcmUtcmVuZGVyaW5nIChob3QgcmVsb2FkKS5cbiAgICAgIHRyeSB7IGVudHJ5LnRlYXJkb3duPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgZW50cnkudGVhcmRvd24gPSBudWxsO1xuICAgICAgY29uc3QgcmV0ID0gZW50cnkucGFnZS5yZW5kZXIocm9vdC5zZWN0aW9uc1dyYXApO1xuICAgICAgaWYgKHR5cGVvZiByZXQgPT09IFwiZnVuY3Rpb25cIikgZW50cnkudGVhcmRvd24gPSByZXQ7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGVyci5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tY2hhcnRzLXJlZCB0ZXh0LXNtXCI7XG4gICAgICBlcnIudGV4dENvbnRlbnQgPSBgRXJyb3IgcmVuZGVyaW5nIHBhZ2U6ICR7KGUgYXMgRXJyb3IpLm1lc3NhZ2V9YDtcbiAgICAgIHJvb3Quc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKGVycik7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHRpdGxlID1cbiAgICBhcC5raW5kID09PSBcInR3ZWFrc1wiID8gXCJUd2Vha3NcIiA6XG4gICAgYXAua2luZCA9PT0gXCJzdG9yZVwiID8gXCJUd2VhayBTdG9yZVwiIDogXCJDb2RleCsrXCI7XG4gIGNvbnN0IHN1YnRpdGxlID1cbiAgICBhcC5raW5kID09PSBcInR3ZWFrc1wiXG4gICAgICA/IFwiTWFuYWdlIHlvdXIgaW5zdGFsbGVkIENvZGV4KysgdHdlYWtzLlwiXG4gICAgICA6IGFwLmtpbmQgPT09IFwic3RvcmVcIlxuICAgICAgICA/IFwiSW5zdGFsbCByZXZpZXdlZCB0d2Vha3MgcGlubmVkIHRvIGFwcHJvdmVkIEdpdEh1YiBjb21taXRzLlwiXG4gICAgICAgIDogXCJDaGVja2luZyBpbnN0YWxsZWQgQ29kZXgrKyB2ZXJzaW9uLlwiO1xuICBjb25zdCByb290ID0gcGFuZWxTaGVsbCh0aXRsZSwgc3VidGl0bGUpO1xuICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICBpZiAoYXAua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVuZGVyVHdlYWtzUGFnZShyb290LnNlY3Rpb25zV3JhcCk7XG4gIGVsc2UgaWYgKGFwLmtpbmQgPT09IFwic3RvcmVcIikgcmVuZGVyVHdlYWtTdG9yZVBhZ2Uocm9vdC5zZWN0aW9uc1dyYXAsIHJvb3QuaGVhZGVyQWN0aW9ucyk7XG4gIGVsc2UgcmVuZGVyQ29uZmlnUGFnZShyb290LnNlY3Rpb25zV3JhcCwgcm9vdC5zdWJ0aXRsZSk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBwYWdlcyBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gcmVuZGVyQ29uZmlnUGFnZShcbiAgc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCxcbiAgc3VidGl0bGU/OiBIVE1MRWxlbWVudCxcbik6IHZvaWQge1xuICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiQ29kZXgrKyBVcGRhdGVzXCIpKTtcbiAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gIGNhcmQuZGF0YXNldC5jb2RleHBwQ29uZmlnQ2FyZCA9IFwidHJ1ZVwiO1xuICBjb25zdCBsb2FkaW5nID0gcm93U2ltcGxlKFwiTG9hZGluZyB1cGRhdGUgc2V0dGluZ3NcIiwgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIik7XG4gIGNhcmQuYXBwZW5kQ2hpbGQobG9hZGluZyk7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblxuICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKVxuICAgIC50aGVuKChjb25maWcpID0+IHtcbiAgICAgIGlmIChzdWJ0aXRsZSkge1xuICAgICAgICBzdWJ0aXRsZS50ZXh0Q29udGVudCA9IGBZb3UgaGF2ZSBDb2RleCsrICR7KGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKS52ZXJzaW9ufSBpbnN0YWxsZWQuYDtcbiAgICAgIH1cbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkLCBjb25maWcgYXMgQ29kZXhQbHVzUGx1c0NvbmZpZyk7XG4gICAgfSlcbiAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgIGlmIChzdWJ0aXRsZSkgc3VidGl0bGUudGV4dENvbnRlbnQgPSBcIkNvdWxkIG5vdCBsb2FkIGluc3RhbGxlZCBDb2RleCsrIHZlcnNpb24uXCI7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IGxvYWQgdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pO1xuXG4gIGNvbnN0IHdhdGNoZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgd2F0Y2hlci5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgd2F0Y2hlci5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJBdXRvLVJlcGFpciBXYXRjaGVyXCIpKTtcbiAgY29uc3Qgd2F0Y2hlckNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICB3YXRjaGVyQ2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDaGVja2luZyB3YXRjaGVyXCIsIFwiVmVyaWZ5aW5nIHRoZSB1cGRhdGVyIHJlcGFpciBzZXJ2aWNlLlwiKSk7XG4gIHdhdGNoZXIuYXBwZW5kQ2hpbGQod2F0Y2hlckNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod2F0Y2hlcik7XG4gIHJlbmRlcldhdGNoZXJIZWFsdGhDYXJkKHdhdGNoZXJDYXJkKTtcblxuICBjb25zdCBtYWludGVuYW5jZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICBtYWludGVuYW5jZS5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgbWFpbnRlbmFuY2UuYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiTWFpbnRlbmFuY2VcIikpO1xuICBjb25zdCBtYWludGVuYW5jZUNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQodW5pbnN0YWxsUm93KCkpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQocmVwb3J0QnVnUm93KCkpO1xuICBtYWludGVuYW5jZS5hcHBlbmRDaGlsZChtYWludGVuYW5jZUNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2UpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQ6IEhUTUxFbGVtZW50LCBjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiB2b2lkIHtcbiAgc2V0U2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oY29uZmlnLnVwZGF0ZUNoZWNrKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChhdXRvVXBkYXRlUm93KGNvbmZpZykpO1xuICBjYXJkLmFwcGVuZENoaWxkKHVwZGF0ZUNoYW5uZWxSb3coY29uZmlnKSk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQoaW5zdGFsbGF0aW9uU291cmNlUm93KGNvbmZpZy5pbnN0YWxsYXRpb25Tb3VyY2UpKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChzZWxmVXBkYXRlU3RhdHVzUm93KGNvbmZpZy5zZWxmVXBkYXRlKSk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQoY2hlY2tGb3JVcGRhdGVzUm93KGNvbmZpZykpO1xuICBpZiAoY29uZmlnLnVwZGF0ZUNoZWNrKSBjYXJkLmFwcGVuZENoaWxkKHJlbGVhc2VOb3Rlc1Jvdyhjb25maWcudXBkYXRlQ2hlY2spKTtcbn1cblxuZnVuY3Rpb24gYXV0b1VwZGF0ZVJvdyhjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiQXV0b21hdGljYWxseSByZWZyZXNoIENvZGV4KytcIjtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICBkZXNjLnRleHRDb250ZW50ID0gYEluc3RhbGxlZCB2ZXJzaW9uIHYke2NvbmZpZy52ZXJzaW9ufS4gVGhlIHdhdGNoZXIgY2hlY2tzIGhvdXJseSBhbmQgY2FuIHJlZnJlc2ggdGhlIENvZGV4KysgcnVudGltZSBhdXRvbWF0aWNhbGx5LmA7XG4gIGxlZnQuYXBwZW5kQ2hpbGQodGl0bGUpO1xuICBsZWZ0LmFwcGVuZENoaWxkKGRlc2MpO1xuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XG4gIHJvdy5hcHBlbmRDaGlsZChcbiAgICBzd2l0Y2hDb250cm9sKGNvbmZpZy5hdXRvVXBkYXRlLCBhc3luYyAobmV4dCkgPT4ge1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpzZXQtYXV0by11cGRhdGVcIiwgbmV4dCk7XG4gICAgfSksXG4gICk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNoYW5uZWxSb3coY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXCJSZWxlYXNlIGNoYW5uZWxcIiwgdXBkYXRlQ2hhbm5lbFN1bW1hcnkoY29uZmlnKSk7XG4gIGNvbnN0IGFjdGlvbiA9IHJvdy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtcm93LWFjdGlvbnNdXCIpO1xuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VsZWN0XCIpO1xuICBzZWxlY3QuY2xhc3NOYW1lID1cbiAgICBcImgtOCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRyYW5zcGFyZW50IHB4LTIgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBmb2N1czpvdXRsaW5lLW5vbmVcIjtcbiAgZm9yIChjb25zdCBbdmFsdWUsIGxhYmVsXSBvZiBbXG4gICAgW1wic3RhYmxlXCIsIFwiU3RhYmxlXCJdLFxuICAgIFtcInByZXJlbGVhc2VcIiwgXCJQcmVyZWxlYXNlXCJdLFxuICAgIFtcImN1c3RvbVwiLCBcIkN1c3RvbVwiXSxcbiAgXSBhcyBjb25zdCkge1xuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvcHRpb25cIik7XG4gICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XG4gICAgb3B0aW9uLnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgb3B0aW9uLnNlbGVjdGVkID0gY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IHZhbHVlO1xuICAgIHNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICB9XG4gIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAuaW52b2tlKFwiY29kZXhwcDpzZXQtdXBkYXRlLWNvbmZpZ1wiLCB7IHVwZGF0ZUNoYW5uZWw6IHNlbGVjdC52YWx1ZSB9KVxuICAgICAgLnRoZW4oKCkgPT4gcmVmcmVzaENvbmZpZ0NhcmQocm93KSlcbiAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcInNldCB1cGRhdGUgY2hhbm5lbCBmYWlsZWRcIiwgU3RyaW5nKGUpKSk7XG4gIH0pO1xuICBhY3Rpb24/LmFwcGVuZENoaWxkKHNlbGVjdCk7XG4gIGlmIChjb25maWcudXBkYXRlQ2hhbm5lbCA9PT0gXCJjdXN0b21cIikge1xuICAgIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXG4gICAgICBjb21wYWN0QnV0dG9uKFwiRWRpdFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlcG8gPSB3aW5kb3cucHJvbXB0KFwiR2l0SHViIHJlcG9cIiwgY29uZmlnLnVwZGF0ZVJlcG8gfHwgXCJiLW5uZXR0L2NvZGV4LXBsdXNwbHVzXCIpO1xuICAgICAgICBpZiAocmVwbyA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICBjb25zdCByZWYgPSB3aW5kb3cucHJvbXB0KFwiR2l0IHJlZlwiLCBjb25maWcudXBkYXRlUmVmIHx8IFwibWFpblwiKTtcbiAgICAgICAgaWYgKHJlZiA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgICAgLmludm9rZShcImNvZGV4cHA6c2V0LXVwZGF0ZS1jb25maWdcIiwge1xuICAgICAgICAgICAgdXBkYXRlQ2hhbm5lbDogXCJjdXN0b21cIixcbiAgICAgICAgICAgIHVwZGF0ZVJlcG86IHJlcG8sXG4gICAgICAgICAgICB1cGRhdGVSZWY6IHJlZixcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKCgpID0+IHJlZnJlc2hDb25maWdDYXJkKHJvdykpXG4gICAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwic2V0IGN1c3RvbSB1cGRhdGUgc291cmNlIGZhaWxlZFwiLCBTdHJpbmcoZSkpKTtcbiAgICAgIH0pLFxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gaW5zdGFsbGF0aW9uU291cmNlUm93KHNvdXJjZTogSW5zdGFsbGF0aW9uU291cmNlKTogSFRNTEVsZW1lbnQge1xuICByZXR1cm4gcm93U2ltcGxlKFwiSW5zdGFsbGF0aW9uIHNvdXJjZVwiLCBgJHtzb3VyY2UubGFiZWx9OiAke3NvdXJjZS5kZXRhaWx9YCk7XG59XG5cbmZ1bmN0aW9uIHNlbGZVcGRhdGVTdGF0dXNSb3coc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IHJvd1NpbXBsZShcIkxhc3QgQ29kZXgrKyB1cGRhdGVcIiwgc2VsZlVwZGF0ZVN1bW1hcnkoc3RhdGUpKTtcbiAgY29uc3QgbGVmdCA9IHJvdy5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChsZWZ0ICYmIHN0YXRlKSBsZWZ0LnByZXBlbmQoc3RhdHVzQmFkZ2Uoc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdGUuc3RhdHVzKSwgc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXRlLnN0YXR1cykpKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzUm93KGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgY2hlY2sgPSBjb25maWcudXBkYXRlQ2hlY2s7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPyBcIkNvZGV4KysgdXBkYXRlIGF2YWlsYWJsZVwiIDogXCJDaGVjayBmb3IgQ29kZXgrKyB1cGRhdGVzXCI7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IHVwZGF0ZVN1bW1hcnkoY2hlY2spO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcbiAgaWYgKGNoZWNrPy5yZWxlYXNlVXJsKSB7XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlIE5vdGVzXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgY2hlY2sucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKVxuICAgICAgICAudGhlbigoY2hlY2spID0+IHtcbiAgICAgICAgICBzZXRTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbihjaGVjayBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2spO1xuICAgICAgICAgIHJlZnJlc2hDb25maWdDYXJkKHJvdyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcIkNvZGV4KysgcmVsZWFzZSBjaGVjayBmYWlsZWRcIiwgU3RyaW5nKGUpKSlcbiAgICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgIHJvdy5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcbiAgICAgICAgfSk7XG4gICAgfSksXG4gICk7XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkRvd25sb2FkIFVwZGF0ZVwiLCAoKSA9PiB7XG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xuICAgICAgY29uc3QgYnV0dG9ucyA9IGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiAoYnV0dG9uLmRpc2FibGVkID0gdHJ1ZSkpO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpydW4tY29kZXhwcC11cGRhdGVcIilcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlZnJlc2hTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbih0cnVlKTtcbiAgICAgICAgICByZWZyZXNoQ29uZmlnQ2FyZChyb3cpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICBwbG9nKFwiQ29kZXgrKyBzZWxmLXVwZGF0ZSBmYWlsZWRcIiwgU3RyaW5nKGUpKTtcbiAgICAgICAgICB2b2lkIHJlZnJlc2hDb25maWdDYXJkKHJvdyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiXCI7XG4gICAgICAgICAgYnV0dG9ucy5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSBmYWxzZSkpO1xuICAgICAgICB9KTtcbiAgICB9KSxcbiAgKTtcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xuICByZXR1cm4gcm93O1xufVxuXG5mdW5jdGlvbiByZWxlYXNlTm90ZXNSb3coY2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMiBwLTNcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcInRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIkxhdGVzdCByZWxlYXNlIG5vdGVzXCI7XG4gIHJvdy5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBib2R5LmNsYXNzTmFtZSA9XG4gICAgXCJtYXgtaC02MCBvdmVyZmxvdy1hdXRvIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHAtMyB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgYm9keS5hcHBlbmRDaGlsZChyZW5kZXJSZWxlYXNlTm90ZXNNYXJrZG93bihjaGVjay5yZWxlYXNlTm90ZXM/LnRyaW0oKSB8fCBjaGVjay5lcnJvciB8fCBcIk5vIHJlbGVhc2Ugbm90ZXMgYXZhaWxhYmxlLlwiKSk7XG4gIHJvdy5hcHBlbmRDaGlsZChib2R5KTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24obWFya2Rvd246IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvb3QuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIGNvbnN0IGxpbmVzID0gbWFya2Rvd24ucmVwbGFjZSgvXFxyXFxuPy9nLCBcIlxcblwiKS5zcGxpdChcIlxcblwiKTtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3Q6IEhUTUxPTGlzdEVsZW1lbnQgfCBIVE1MVUxpc3RFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBjb2RlTGluZXM6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKSA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gICAgcC5jbGFzc05hbWUgPSBcIm0tMCBsZWFkaW5nLTVcIjtcbiAgICBhcHBlbmRJbmxpbmVNYXJrZG93bihwLCBwYXJhZ3JhcGguam9pbihcIiBcIikudHJpbSgpKTtcbiAgICByb290LmFwcGVuZENoaWxkKHApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuICBjb25zdCBmbHVzaExpc3QgPSAoKSA9PiB7XG4gICAgaWYgKCFsaXN0KSByZXR1cm47XG4gICAgcm9vdC5hcHBlbmRDaGlsZChsaXN0KTtcbiAgICBsaXN0ID0gbnVsbDtcbiAgfTtcbiAgY29uc3QgZmx1c2hDb2RlID0gKCkgPT4ge1xuICAgIGlmICghY29kZUxpbmVzKSByZXR1cm47XG4gICAgY29uc3QgcHJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInByZVwiKTtcbiAgICBwcmUuY2xhc3NOYW1lID1cbiAgICAgIFwibS0wIG92ZXJmbG93LWF1dG8gcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIHAtMiB0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gICAgY29uc3QgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjb2RlXCIpO1xuICAgIGNvZGUudGV4dENvbnRlbnQgPSBjb2RlTGluZXMuam9pbihcIlxcblwiKTtcbiAgICBwcmUuYXBwZW5kQ2hpbGQoY29kZSk7XG4gICAgcm9vdC5hcHBlbmRDaGlsZChwcmUpO1xuICAgIGNvZGVMaW5lcyA9IG51bGw7XG4gIH07XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgaWYgKGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoXCJgYGBcIikpIHtcbiAgICAgIGlmIChjb2RlTGluZXMpIGZsdXNoQ29kZSgpO1xuICAgICAgZWxzZSB7XG4gICAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICAgIGZsdXNoTGlzdCgpO1xuICAgICAgICBjb2RlTGluZXMgPSBbXTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoY29kZUxpbmVzKSB7XG4gICAgICBjb2RlTGluZXMucHVzaChsaW5lKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHtcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICBmbHVzaExpc3QoKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGhlYWRpbmcgPSAvXigjezEsM30pXFxzKyguKykkLy5leGVjKHRyaW1tZWQpO1xuICAgIGlmIChoZWFkaW5nKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgZmx1c2hMaXN0KCk7XG4gICAgICBjb25zdCBoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChoZWFkaW5nWzFdLmxlbmd0aCA9PT0gMSA/IFwiaDNcIiA6IFwiaDRcIik7XG4gICAgICBoLmNsYXNzTmFtZSA9IFwibS0wIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICAgIGFwcGVuZElubGluZU1hcmtkb3duKGgsIGhlYWRpbmdbMl0pO1xuICAgICAgcm9vdC5hcHBlbmRDaGlsZChoKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHVub3JkZXJlZCA9IC9eWy0qXVxccysoLispJC8uZXhlYyh0cmltbWVkKTtcbiAgICBjb25zdCBvcmRlcmVkID0gL15cXGQrWy4pXVxccysoLispJC8uZXhlYyh0cmltbWVkKTtcbiAgICBpZiAodW5vcmRlcmVkIHx8IG9yZGVyZWQpIHtcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICBjb25zdCB3YW50T3JkZXJlZCA9IEJvb2xlYW4ob3JkZXJlZCk7XG4gICAgICBpZiAoIWxpc3QgfHwgKHdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJPTFwiKSB8fCAoIXdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJVTFwiKSkge1xuICAgICAgICBmbHVzaExpc3QoKTtcbiAgICAgICAgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQod2FudE9yZGVyZWQgPyBcIm9sXCIgOiBcInVsXCIpO1xuICAgICAgICBsaXN0LmNsYXNzTmFtZSA9IHdhbnRPcmRlcmVkXG4gICAgICAgICAgPyBcIm0tMCBsaXN0LWRlY2ltYWwgc3BhY2UteS0xIHBsLTUgbGVhZGluZy01XCJcbiAgICAgICAgICA6IFwibS0wIGxpc3QtZGlzYyBzcGFjZS15LTEgcGwtNSBsZWFkaW5nLTVcIjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgYXBwZW5kSW5saW5lTWFya2Rvd24obGksICh1bm9yZGVyZWQgPz8gb3JkZXJlZCk/LlsxXSA/PyBcIlwiKTtcbiAgICAgIGxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgcXVvdGUgPSAvXj5cXHM/KC4rKSQvLmV4ZWModHJpbW1lZCk7XG4gICAgaWYgKHF1b3RlKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgZmx1c2hMaXN0KCk7XG4gICAgICBjb25zdCBibG9ja3F1b3RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJsb2NrcXVvdGVcIik7XG4gICAgICBibG9ja3F1b3RlLmNsYXNzTmFtZSA9IFwibS0wIGJvcmRlci1sLTIgYm9yZGVyLXRva2VuLWJvcmRlciBwbC0zIGxlYWRpbmctNVwiO1xuICAgICAgYXBwZW5kSW5saW5lTWFya2Rvd24oYmxvY2txdW90ZSwgcXVvdGVbMV0pO1xuICAgICAgcm9vdC5hcHBlbmRDaGlsZChibG9ja3F1b3RlKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHBhcmFncmFwaC5wdXNoKHRyaW1tZWQpO1xuICB9XG5cbiAgZmx1c2hQYXJhZ3JhcGgoKTtcbiAgZmx1c2hMaXN0KCk7XG4gIGZsdXNoQ29kZSgpO1xuICByZXR1cm4gcm9vdDtcbn1cblxuZnVuY3Rpb24gYXBwZW5kSW5saW5lTWFya2Rvd24ocGFyZW50OiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHBhdHRlcm4gPSAvKGAoW15gXSspYHxcXFsoW15cXF1dKylcXF1cXCgoaHR0cHM/OlxcL1xcL1teXFxzKV0rKVxcKXxcXCpcXCooW14qXSspXFwqXFwqfFxcKihbXipdKylcXCopL2c7XG4gIGxldCBsYXN0SW5kZXggPSAwO1xuICBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHQubWF0Y2hBbGwocGF0dGVybikpIHtcbiAgICBpZiAobWF0Y2guaW5kZXggPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgYXBwZW5kVGV4dChwYXJlbnQsIHRleHQuc2xpY2UobGFzdEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgIGlmIChtYXRjaFsyXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCBjb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNvZGVcIik7XG4gICAgICBjb2RlLmNsYXNzTmFtZSA9XG4gICAgICAgIFwicm91bmRlZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIHB4LTEgcHktMC41IHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICAgIGNvZGUudGV4dENvbnRlbnQgPSBtYXRjaFsyXTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChjb2RlKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzNdICE9PSB1bmRlZmluZWQgJiYgbWF0Y2hbNF0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuICAgICAgYS5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IHVuZGVybGluZSB1bmRlcmxpbmUtb2Zmc2V0LTJcIjtcbiAgICAgIGEuaHJlZiA9IG1hdGNoWzRdO1xuICAgICAgYS50YXJnZXQgPSBcIl9ibGFua1wiO1xuICAgICAgYS5yZWwgPSBcIm5vb3BlbmVyIG5vcmVmZXJyZXJcIjtcbiAgICAgIGEudGV4dENvbnRlbnQgPSBtYXRjaFszXTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChhKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHN0cm9uZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHJvbmdcIik7XG4gICAgICBzdHJvbmcuY2xhc3NOYW1lID0gXCJmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICAgICAgc3Ryb25nLnRleHRDb250ZW50ID0gbWF0Y2hbNV07XG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoc3Ryb25nKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzZdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImVtXCIpO1xuICAgICAgZW0udGV4dENvbnRlbnQgPSBtYXRjaFs2XTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChlbSk7XG4gICAgfVxuICAgIGxhc3RJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICB9XG4gIGFwcGVuZFRleHQocGFyZW50LCB0ZXh0LnNsaWNlKGxhc3RJbmRleCkpO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRUZXh0KHBhcmVudDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICBpZiAodGV4dCkgcGFyZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyV2F0Y2hlckhlYWx0aENhcmQoY2FyZDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgdm9pZCBpcGNSZW5kZXJlclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC13YXRjaGVyLWhlYWx0aFwiKVxuICAgIC50aGVuKChoZWFsdGgpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcmVuZGVyV2F0Y2hlckhlYWx0aChjYXJkLCBoZWFsdGggYXMgV2F0Y2hlckhlYWx0aCk7XG4gICAgfSlcbiAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDb3VsZCBub3QgY2hlY2sgd2F0Y2hlclwiLCBTdHJpbmcoZSkpKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyV2F0Y2hlckhlYWx0aChjYXJkOiBIVE1MRWxlbWVudCwgaGVhbHRoOiBXYXRjaGVySGVhbHRoKTogdm9pZCB7XG4gIGNhcmQuYXBwZW5kQ2hpbGQod2F0Y2hlclN1bW1hcnlSb3coaGVhbHRoKSk7XG4gIGZvciAoY29uc3QgY2hlY2sgb2YgaGVhbHRoLmNoZWNrcykge1xuICAgIGlmIChjaGVjay5zdGF0dXMgPT09IFwib2tcIikgY29udGludWU7XG4gICAgY2FyZC5hcHBlbmRDaGlsZCh3YXRjaGVyQ2hlY2tSb3coY2hlY2spKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3YXRjaGVyU3VtbWFyeVJvdyhoZWFsdGg6IFdhdGNoZXJIZWFsdGgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGF0dXNCYWRnZShoZWFsdGguc3RhdHVzLCBoZWFsdGgud2F0Y2hlcikpO1xuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBoZWFsdGgudGl0bGU7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IGAke2hlYWx0aC5zdW1tYXJ5fSBDaGVja2VkICR7bmV3IERhdGUoaGVhbHRoLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX0uYDtcbiAgc3RhY2suYXBwZW5kQ2hpbGQodGl0bGUpO1xuICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcblxuICBjb25zdCBhY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBhY3Rpb24uYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjYXJkID0gcm93LnBhcmVudEVsZW1lbnQ7XG4gICAgICBpZiAoIWNhcmQpIHJldHVybjtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDaGVja2luZyB3YXRjaGVyXCIsIFwiVmVyaWZ5aW5nIHRoZSB1cGRhdGVyIHJlcGFpciBzZXJ2aWNlLlwiKSk7XG4gICAgICByZW5kZXJXYXRjaGVySGVhbHRoQ2FyZChjYXJkKTtcbiAgICB9KSxcbiAgKTtcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbik7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHdhdGNoZXJDaGVja1JvdyhjaGVjazogV2F0Y2hlckhlYWx0aENoZWNrKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSByb3dTaW1wbGUoY2hlY2submFtZSwgY2hlY2suZGV0YWlsKTtcbiAgY29uc3QgbGVmdCA9IHJvdy5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChsZWZ0KSBsZWZ0LnByZXBlbmQoc3RhdHVzQmFkZ2UoY2hlY2suc3RhdHVzKSk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHN0YXR1c0JhZGdlKHN0YXR1czogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIGxhYmVsPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjb25zdCB0b25lID1cbiAgICBzdGF0dXMgPT09IFwib2tcIlxuICAgICAgPyBcImJvcmRlci10b2tlbi1jaGFydHMtZ3JlZW4gdGV4dC10b2tlbi1jaGFydHMtZ3JlZW5cIlxuICAgICAgOiBzdGF0dXMgPT09IFwid2FyblwiXG4gICAgICAgID8gXCJib3JkZXItdG9rZW4tY2hhcnRzLXllbGxvdyB0ZXh0LXRva2VuLWNoYXJ0cy15ZWxsb3dcIlxuICAgICAgICA6IFwiYm9yZGVyLXRva2VuLWNoYXJ0cy1yZWQgdGV4dC10b2tlbi1jaGFydHMtcmVkXCI7XG4gIGJhZGdlLmNsYXNzTmFtZSA9IGBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgcm91bmRlZC1mdWxsIGJvcmRlciBweC0yIHB5LTAuNSB0ZXh0LXhzIGZvbnQtbWVkaXVtICR7dG9uZX1gO1xuICBiYWRnZS50ZXh0Q29udGVudCA9IGxhYmVsIHx8IChzdGF0dXMgPT09IFwib2tcIiA/IFwiT0tcIiA6IHN0YXR1cyA9PT0gXCJ3YXJuXCIgPyBcIlJldmlld1wiIDogXCJFcnJvclwiKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdW1tYXJ5KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCFjaGVjaykgcmV0dXJuIFwiTm8gdXBkYXRlIGNoZWNrIGhhcyBydW4geWV0LlwiO1xuICBjb25zdCBsYXRlc3QgPSBjaGVjay5sYXRlc3RWZXJzaW9uID8gYExhdGVzdCB2JHtjaGVjay5sYXRlc3RWZXJzaW9ufS4gYCA6IFwiXCI7XG4gIGNvbnN0IGNoZWNrZWQgPSBgQ2hlY2tlZCAke25ldyBEYXRlKGNoZWNrLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX0uYDtcbiAgaWYgKGNoZWNrLmVycm9yKSByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH0gJHtjaGVjay5lcnJvcn1gO1xuICByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH1gO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGFubmVsU3VtbWFyeShjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiBzdHJpbmcge1xuICBpZiAoY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IFwiY3VzdG9tXCIpIHtcbiAgICByZXR1cm4gYCR7Y29uZmlnLnVwZGF0ZVJlcG8gfHwgXCJiLW5uZXR0L2NvZGV4LXBsdXNwbHVzXCJ9ICR7Y29uZmlnLnVwZGF0ZVJlZiB8fCBcIihubyByZWYgc2V0KVwifWA7XG4gIH1cbiAgaWYgKGNvbmZpZy51cGRhdGVDaGFubmVsID09PSBcInByZXJlbGVhc2VcIikge1xuICAgIHJldHVybiBcIlVzZSB0aGUgbmV3ZXN0IHB1Ymxpc2hlZCBHaXRIdWIgcmVsZWFzZSwgaW5jbHVkaW5nIHByZXJlbGVhc2VzLlwiO1xuICB9XG4gIHJldHVybiBcIlVzZSB0aGUgbGF0ZXN0IHN0YWJsZSBHaXRIdWIgcmVsZWFzZS5cIjtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN1bW1hcnkoc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBzdHJpbmcge1xuICBpZiAoIXN0YXRlKSByZXR1cm4gXCJObyBhdXRvbWF0aWMgQ29kZXgrKyB1cGRhdGUgaGFzIHJ1biB5ZXQuXCI7XG4gIGNvbnN0IGNoZWNrZWQgPSBuZXcgRGF0ZShzdGF0ZS5jb21wbGV0ZWRBdCA/PyBzdGF0ZS5jaGVja2VkQXQpLnRvTG9jYWxlU3RyaW5nKCk7XG4gIGNvbnN0IHRhcmdldCA9IHN0YXRlLmxhdGVzdFZlcnNpb24gPyBgIFRhcmdldCB2JHtzdGF0ZS5sYXRlc3RWZXJzaW9ufS5gIDogc3RhdGUudGFyZ2V0UmVmID8gYCBUYXJnZXQgJHtzdGF0ZS50YXJnZXRSZWZ9LmAgOiBcIlwiO1xuICBjb25zdCBzb3VyY2UgPSBzdGF0ZS5pbnN0YWxsYXRpb25Tb3VyY2U/LmxhYmVsID8/IFwidW5rbm93biBzb3VyY2VcIjtcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJmYWlsZWRcIikgcmV0dXJuIGBGYWlsZWQgJHtjaGVja2VkfS4ke3RhcmdldH0gJHtzdGF0ZS5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIn1gO1xuICBpZiAoc3RhdGUuc3RhdHVzID09PSBcInVwZGF0ZWRcIikgcmV0dXJuIGBVcGRhdGVkICR7Y2hlY2tlZH0uJHt0YXJnZXR9IFNvdXJjZTogJHtzb3VyY2V9LmA7XG4gIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwidXAtdG8tZGF0ZVwiKSByZXR1cm4gYFVwIHRvIGRhdGUgJHtjaGVja2VkfS4ke3RhcmdldH0gU291cmNlOiAke3NvdXJjZX0uYDtcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJkaXNhYmxlZFwiKSByZXR1cm4gYFNraXBwZWQgJHtjaGVja2VkfTsgYXV0b21hdGljIHJlZnJlc2ggaXMgZGlzYWJsZWQuYDtcbiAgcmV0dXJuIGBDaGVja2luZyBmb3IgdXBkYXRlcy4gU291cmNlOiAke3NvdXJjZX0uYDtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdHVzOiBTZWxmVXBkYXRlU3RhdHVzKTogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIge1xuICBpZiAoc3RhdHVzID09PSBcImZhaWxlZFwiKSByZXR1cm4gXCJlcnJvclwiO1xuICBpZiAoc3RhdHVzID09PSBcImRpc2FibGVkXCIgfHwgc3RhdHVzID09PSBcImNoZWNraW5nXCIpIHJldHVybiBcIndhcm5cIjtcbiAgcmV0dXJuIFwib2tcIjtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXR1czogU2VsZlVwZGF0ZVN0YXR1cyk6IHN0cmluZyB7XG4gIGlmIChzdGF0dXMgPT09IFwidXAtdG8tZGF0ZVwiKSByZXR1cm4gXCJVcCB0byBkYXRlXCI7XG4gIGlmIChzdGF0dXMgPT09IFwidXBkYXRlZFwiKSByZXR1cm4gXCJVcGRhdGVkXCI7XG4gIGlmIChzdGF0dXMgPT09IFwiZmFpbGVkXCIpIHJldHVybiBcIkZhaWxlZFwiO1xuICBpZiAoc3RhdHVzID09PSBcImRpc2FibGVkXCIpIHJldHVybiBcIkRpc2FibGVkXCI7XG4gIHJldHVybiBcIkNoZWNraW5nXCI7XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hDb25maWdDYXJkKHJvdzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3QgY2FyZCA9IHJvdy5jbG9zZXN0KFwiW2RhdGEtY29kZXhwcC1jb25maWctY2FyZF1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAoIWNhcmQpIHJldHVybjtcbiAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiUmVmcmVzaGluZ1wiLCBcIkxvYWRpbmcgY3VycmVudCBDb2RleCsrIHVwZGF0ZSBzdGF0dXMuXCIpKTtcbiAgdm9pZCBpcGNSZW5kZXJlclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC1jb25maWdcIilcbiAgICAudGhlbigoY29uZmlnKSA9PiB7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHJlbmRlckNvZGV4UGx1c1BsdXNDb25maWcoY2FyZCwgY29uZmlnIGFzIENvZGV4UGx1c1BsdXNDb25maWcpO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IHJlZnJlc2ggdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiB1bmluc3RhbGxSb3coKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXG4gICAgXCJVbmluc3RhbGwgQ29kZXgrK1wiLFxuICAgIFwiQ29waWVzIHRoZSB1bmluc3RhbGwgY29tbWFuZC4gUnVuIGl0IGZyb20gYSB0ZXJtaW5hbCBhZnRlciBxdWl0dGluZyBDb2RleC5cIixcbiAgKTtcbiAgY29uc3QgYWN0aW9uID0gcm93LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1yb3ctYWN0aW9uc11cIik7XG4gIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNvcHkgQ29tbWFuZFwiLCAoKSA9PiB7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOmNvcHktdGV4dFwiLCBcIm5vZGUgfi8uY29kZXgtcGx1c3BsdXMvc291cmNlL3BhY2thZ2VzL2luc3RhbGxlci9kaXN0L2NsaS5qcyB1bmluc3RhbGxcIilcbiAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwiY29weSB1bmluc3RhbGwgY29tbWFuZCBmYWlsZWRcIiwgU3RyaW5nKGUpKSk7XG4gICAgfSksXG4gICk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlcG9ydEJ1Z1JvdygpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGFjdGlvblJvdyhcbiAgICBcIlJlcG9ydCBhIGJ1Z1wiLFxuICAgIFwiT3BlbiBhIEdpdEh1YiBpc3N1ZSB3aXRoIHJ1bnRpbWUsIGluc3RhbGxlciwgb3IgdHdlYWstbWFuYWdlciBkZXRhaWxzLlwiLFxuICApO1xuICBjb25zdCBhY3Rpb24gPSByb3cucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCJbZGF0YS1jb2RleHBwLXJvdy1hY3Rpb25zXVwiKTtcbiAgYWN0aW9uPy5hcHBlbmRDaGlsZChcbiAgICBjb21wYWN0QnV0dG9uKFwiT3BlbiBJc3N1ZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCB0aXRsZSA9IGVuY29kZVVSSUNvbXBvbmVudChcIltCdWddOiBcIik7XG4gICAgICBjb25zdCBib2R5ID0gZW5jb2RlVVJJQ29tcG9uZW50KFxuICAgICAgICBbXG4gICAgICAgICAgXCIjIyBXaGF0IGhhcHBlbmVkP1wiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBTdGVwcyB0byByZXByb2R1Y2VcIixcbiAgICAgICAgICBcIjEuIFwiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBFbnZpcm9ubWVudFwiLFxuICAgICAgICAgIFwiLSBDb2RleCsrIHZlcnNpb246IFwiLFxuICAgICAgICAgIFwiLSBDb2RleCBhcHAgdmVyc2lvbjogXCIsXG4gICAgICAgICAgXCItIE9TOiBcIixcbiAgICAgICAgICBcIlwiLFxuICAgICAgICAgIFwiIyMgTG9nc1wiLFxuICAgICAgICAgIFwiQXR0YWNoIHJlbGV2YW50IGxpbmVzIGZyb20gdGhlIENvZGV4KysgbG9nIGRpcmVjdG9yeS5cIixcbiAgICAgICAgXS5qb2luKFwiXFxuXCIpLFxuICAgICAgKTtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICBcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLFxuICAgICAgICBgaHR0cHM6Ly9naXRodWIuY29tL2Itbm5ldHQvY29kZXgtcGx1c3BsdXMvaXNzdWVzL25ldz90aXRsZT0ke3RpdGxlfSZib2R5PSR7Ym9keX1gLFxuICAgICAgKTtcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gYWN0aW9uUm93KHRpdGxlVGV4dDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZVRleHQ7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclR3ZWFrU3RvcmVQYWdlKFxuICBzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50LFxuICBoZWFkZXJBY3Rpb25zPzogSFRNTEVsZW1lbnQsXG4pOiB2b2lkIHtcbiAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICBzZWN0aW9uLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtNFwiO1xuXG4gIGNvbnN0IHNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBzb3VyY2UuaGlkZGVuID0gdHJ1ZTtcbiAgc291cmNlLmRhdGFzZXQuY29kZXhwcFN0b3JlU291cmNlID0gXCJ0cnVlXCI7XG4gIHNvdXJjZS50ZXh0Q29udGVudCA9IFwiTG9hZGluZyBsaXZlIHJlZ2lzdHJ5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBjb25zdCByZWZyZXNoQnRuID0gc3RvcmVJY29uQnV0dG9uKHJlZnJlc2hJY29uU3ZnKCksIFwiUmVmcmVzaCB0d2VhayBzdG9yZVwiLCAoKSA9PiB7XG4gICAgcmVmcmVzaEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgdXBkYXRlU3RvcmVVcGRhdGVCYWRnZShudWxsKTtcbiAgICBncmlkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQpO1xuICAgIHJlZnJlc2hUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UsIHJlZnJlc2hCdG4sIHRydWUpO1xuICB9KTtcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChyZWZyZXNoQnRuKTtcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChzdG9yZVRvb2xiYXJCdXR0b24oXCJQdWJsaXNoIFR3ZWFrXCIsIG9wZW5QdWJsaXNoVHdlYWtEaWFsb2csIFwicHJpbWFyeVwiKSk7XG4gIGlmIChoZWFkZXJBY3Rpb25zKSB7XG4gICAgaGVhZGVyQWN0aW9ucy5yZXBsYWNlQ2hpbGRyZW4oYWN0aW9ucyk7XG4gIH1cblxuICBjb25zdCBncmlkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZ3JpZC5kYXRhc2V0LmNvZGV4cHBTdG9yZUdyaWQgPSBcInRydWVcIjtcbiAgZ3JpZC5jbGFzc05hbWUgPSBcImdyaWQgZ2FwLTRcIjtcbiAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUpIHtcbiAgICBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlID0gSlNPTi5zdHJpbmdpZnkoc3RhdGUudHdlYWtTdG9yZSk7XG4gICAgcmVuZGVyVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlKTtcbiAgfSBlbHNlIHtcbiAgICByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQpO1xuICB9XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc291cmNlKTtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChncmlkKTtcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuICByZWZyZXNoVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlLCByZWZyZXNoQnRuKTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaFR3ZWFrU3RvcmVHcmlkKFxuICBncmlkOiBIVE1MRWxlbWVudCxcbiAgc291cmNlOiBIVE1MRWxlbWVudCxcbiAgcmVmcmVzaEJ0bj86IEhUTUxCdXR0b25FbGVtZW50LFxuICBmb3JjZSA9IGZhbHNlLFxuKTogdm9pZCB7XG4gIHZvaWQgZ2V0VHdlYWtTdG9yZShmb3JjZSlcbiAgICAudGhlbigoc3RvcmUpID0+IHtcbiAgICAgIGdyaWQuZGF0YXNldC5jb2RleHBwU3RvcmUgPSBKU09OLnN0cmluZ2lmeShzdG9yZSk7XG4gICAgICByZW5kZXJUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UpO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlID0gXCJcIjtcbiAgICAgIGdyaWQucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1idXN5XCIpO1xuICAgICAgc291cmNlLnRleHRDb250ZW50ID0gXCJMaXZlIHJlZ2lzdHJ5IHVuYXZhaWxhYmxlXCI7XG4gICAgICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKG51bGwpO1xuICAgICAgZ3JpZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBncmlkLmFwcGVuZENoaWxkKHN0b3JlTWVzc2FnZUNhcmQoXCJDb3VsZCBub3QgbG9hZCB0d2VhayBzdG9yZVwiLCBTdHJpbmcoZSkpKTtcbiAgICB9KVxuICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgIGlmIChyZWZyZXNoQnRuKSByZWZyZXNoQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHdhcm1Ud2Vha1N0b3JlKCk6IHZvaWQge1xuICBpZiAoc3RhdGUudHdlYWtTdG9yZSB8fCBzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSkgcmV0dXJuO1xuICB2b2lkIGdldFR3ZWFrU3RvcmUoKS50aGVuKChzdG9yZSkgPT4ge1xuICAgIHVwZGF0ZVN0b3JlVXBkYXRlQmFkZ2Uob3V0ZGF0ZWRJbnN0YWxsZWRTdG9yZUNvdW50KHN0b3JlLmVudHJpZXMpKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldFR3ZWFrU3RvcmUoZm9yY2UgPSBmYWxzZSk6IFByb21pc2U8VHdlYWtTdG9yZVJlZ2lzdHJ5Vmlldz4ge1xuICBpZiAoIWZvcmNlKSB7XG4gICAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUpIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3RhdGUudHdlYWtTdG9yZSk7XG4gICAgaWYgKHN0YXRlLnR3ZWFrU3RvcmVQcm9taXNlKSByZXR1cm4gc3RhdGUudHdlYWtTdG9yZVByb21pc2U7XG4gIH1cbiAgc3RhdGUudHdlYWtTdG9yZUVycm9yID0gbnVsbDtcbiAgY29uc3QgcHJvbWlzZSA9IGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LXR3ZWFrLXN0b3JlXCIpXG4gICAgLnRoZW4oKHN0b3JlKSA9PiB7XG4gICAgICBzdGF0ZS50d2Vha1N0b3JlID0gc3RvcmUgYXMgVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldztcbiAgICAgIHJldHVybiBzdGF0ZS50d2Vha1N0b3JlO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBzdGF0ZS50d2Vha1N0b3JlRXJyb3IgPSBlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9KVxuICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgIGlmIChzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSA9PT0gcHJvbWlzZSkgc3RhdGUudHdlYWtTdG9yZVByb21pc2UgPSBudWxsO1xuICAgIH0pO1xuICBzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSA9IHByb21pc2U7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUd2Vha1N0b3JlR3JpZChncmlkOiBIVE1MRWxlbWVudCwgc291cmNlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBzdG9yZSA9IHBhcnNlU3RvcmVEYXRhc2V0KGdyaWQpO1xuICBpZiAoIXN0b3JlKSByZXR1cm47XG4gIGNvbnN0IGVudHJpZXMgPSBzdG9yZS5lbnRyaWVzO1xuICBncmlkLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcbiAgc291cmNlLnRleHRDb250ZW50ID0gYFJlZnJlc2hlZCAke25ldyBEYXRlKHN0b3JlLmZldGNoZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX1gO1xuICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKG91dGRhdGVkSW5zdGFsbGVkU3RvcmVDb3VudChlbnRyaWVzKSk7XG4gIGdyaWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICBpZiAoc3RvcmUuZW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBncmlkLmFwcGVuZENoaWxkKHN0b3JlTWVzc2FnZUNhcmQoXCJObyB0d2Vha3MgeWV0XCIsIFwiVXNlIFB1Ymxpc2ggVHdlYWsgdG8gc3VibWl0IHRoZSBmaXJzdCBvbmUuXCIpKTtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSBncmlkLmFwcGVuZENoaWxkKHR3ZWFrU3RvcmVDYXJkKGVudHJ5KSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU3RvcmVEYXRhc2V0KGdyaWQ6IEhUTUxFbGVtZW50KTogVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldyB8IG51bGwge1xuICBjb25zdCByYXcgPSBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlO1xuICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmF3KSBhcyBUd2Vha1N0b3JlUmVnaXN0cnlWaWV3O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0d2Vha1N0b3JlQ2FyZChlbnRyeTogVHdlYWtTdG9yZUVudHJ5Vmlldyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgc2hlbGwgPSB0d2Vha1N0b3JlQ2FyZFNoZWxsKCk7XG4gIGNvbnN0IHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH0gPSBzaGVsbDtcblxuICBsZWZ0Lmluc2VydEJlZm9yZShzdG9yZUF2YXRhcihlbnRyeSksIHN0YWNrKTtcblxuICBjb25zdCB0aXRsZVJvdyA9IHR3ZWFrU3RvcmVUaXRsZVJvdygpO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LWxnIGZvbnQtc2VtaWJvbGQgbGVhZGluZy03IHRleHQtdG9rZW4tZm9yZWdyb3VuZFwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IGVudHJ5Lm1hbmlmZXN0Lm5hbWU7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodmVyaWZpZWRTYWZlQmFkZ2UoKSk7XG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuICBpZiAoZW50cnkubWFuaWZlc3QuZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkZXNjID0gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk7XG4gICAgZGVzYy50ZXh0Q29udGVudCA9IGVudHJ5Lm1hbmlmZXN0LmRlc2NyaXB0aW9uO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKGRlc2MpO1xuICB9XG5cbiAgc3RhY2suYXBwZW5kQ2hpbGQodHdlYWtTdG9yZVJlYWRNb3JlQnV0dG9uKGVudHJ5LnJlcG8pKTtcbiAgdmVyc2lvbnMuYXBwZW5kQ2hpbGQodHdlYWtTdG9yZVZlcnNpb25CYWRnZShlbnRyeSkpO1xuXG4gIGlmIChlbnRyeS5yZWxlYXNlVXJsKSB7XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgZW50cnkucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGNvbnN0IGhhc1VwZGF0ZSA9ICEhZW50cnkuaW5zdGFsbGVkICYmIGlzU3RvcmVVcGRhdGVBdmFpbGFibGUoZW50cnkuaW5zdGFsbGVkLnZlcnNpb24sIGVudHJ5Lm1hbmlmZXN0LnZlcnNpb24pO1xuICBpZiAoZW50cnkuaW5zdGFsbGVkICYmICFoYXNVcGRhdGUpIHtcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XG4gIH0gZWxzZSBpZiAoZW50cnkucGxhdGZvcm0gJiYgIWVudHJ5LnBsYXRmb3JtLmNvbXBhdGlibGUpIHtcbiAgICBjYXJkLmNsYXNzTGlzdC5hZGQoXCJvcGFjaXR5LTcwXCIpO1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNQaWxsKHBsYXRmb3JtTG9ja2VkTGFiZWwoZW50cnkucGxhdGZvcm0pKSk7XG4gIH0gZWxzZSBpZiAoZW50cnkucnVudGltZSAmJiAhZW50cnkucnVudGltZS5jb21wYXRpYmxlKSB7XG4gICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwib3BhY2l0eS03MFwiKTtcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChydW50aW1lTG9ja2VkTGFiZWwoZW50cnkucnVudGltZSkpKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBpbnN0YWxsTGFiZWwgPSBlbnRyeS5pbnN0YWxsZWQgPyBcIlVwZGF0ZVwiIDogXCJJbnN0YWxsXCI7XG4gICAgaWYgKGhhc1VwZGF0ZSkgYWN0aW9ucy5hcHBlbmRDaGlsZChzdG9yZVN0YXR1c1BpbGwoXCJVcGRhdGUgYXZhaWxhYmxlXCIsIFwiaW5mb1wiKSk7XG4gICAgY29uc3QgaW5zdGFsbEJ1dHRvbiA9IHN0b3JlSW5zdGFsbEJ1dHRvbihpbnN0YWxsTGFiZWwsIChidXR0b24pID0+IHtcbiAgICAgIGNvbnN0IGdyaWQgPSBjYXJkLmNsb3Nlc3QoXCJbZGF0YS1jb2RleHBwLXN0b3JlLWdyaWRdXCIpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgIGNvbnN0IHNvdXJjZSA9IGdyaWQ/LnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1jb2RleHBwLXN0b3JlLXNvdXJjZV1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgc2hvd1N0b3JlQnV0dG9uTG9hZGluZyhidXR0b24sIGVudHJ5Lmluc3RhbGxlZCA/IFwiVXBkYXRpbmdcIiA6IFwiSW5zdGFsbGluZ1wiKTtcbiAgICAgIGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKS5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSB0cnVlKSk7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOmluc3RhbGwtc3RvcmUtdHdlYWtcIiwgZW50cnkuaWQpXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBzaG93U3RvcmVUb2FzdChgJHtlbnRyeS5tYW5pZmVzdC5uYW1lfSBpbnN0YWxsZWQuYCk7XG4gICAgICAgICAgc2hvd1N0b3JlQnV0dG9uSW5zdGFsbGVkKGJ1dHRvbik7XG4gICAgICAgICAgdmVyc2lvbnMucmVwbGFjZUNoaWxkcmVuKHR3ZWFrU3RvcmVWZXJzaW9uQmFkZ2UoZW50cnksIGVudHJ5Lm1hbmlmZXN0LnZlcnNpb24pKTtcbiAgICAgICAgICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKE1hdGgubWF4KDAsIGN1cnJlbnRTdG9yZVVwZGF0ZUJhZGdlQ291bnQoKSAtIDEpKTtcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGFjdGlvbnMucmVwbGFjZUNoaWxkcmVuKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBzb3VyY2UpIHJlZnJlc2hUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UsIHVuZGVmaW5lZCwgdHJ1ZSk7XG4gICAgICAgICAgfSwgOTAwKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgcmVzZXRTdG9yZUluc3RhbGxCdXR0b24oYnV0dG9uLCBpbnN0YWxsTGFiZWwpO1xuICAgICAgICAgIGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKS5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSBmYWxzZSkpO1xuICAgICAgICAgIHNob3dTdG9yZUNhcmRNZXNzYWdlKGNhcmQsIFN0cmluZygoZSBhcyBFcnJvcikubWVzc2FnZSA/PyBlKSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoaW5zdGFsbEJ1dHRvbik7XG4gIH1cbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIHBsYXRmb3JtTG9ja2VkTGFiZWwocGxhdGZvcm06IE5vbk51bGxhYmxlPFR3ZWFrU3RvcmVFbnRyeVZpZXdbXCJwbGF0Zm9ybVwiXT4pOiBzdHJpbmcge1xuICBjb25zdCBzdXBwb3J0ZWQgPSBwbGF0Zm9ybS5zdXBwb3J0ZWQgPz8gW107XG4gIGlmIChzdXBwb3J0ZWQuaW5jbHVkZXMoXCJ3aW4zMlwiKSkgcmV0dXJuIFwiV2luZG93cyBvbmx5XCI7XG4gIGlmIChzdXBwb3J0ZWQuaW5jbHVkZXMoXCJkYXJ3aW5cIikpIHJldHVybiBcIm1hY09TIG9ubHlcIjtcbiAgaWYgKHN1cHBvcnRlZC5pbmNsdWRlcyhcImxpbnV4XCIpKSByZXR1cm4gXCJMaW51eCBvbmx5XCI7XG4gIHJldHVybiBcIlVuYXZhaWxhYmxlXCI7XG59XG5cbmZ1bmN0aW9uIHJ1bnRpbWVMb2NrZWRMYWJlbChydW50aW1lOiBOb25OdWxsYWJsZTxUd2Vha1N0b3JlRW50cnlWaWV3W1wicnVudGltZVwiXT4pOiBzdHJpbmcge1xuICByZXR1cm4gcnVudGltZS5yZXF1aXJlZCA/IGBSZXF1aXJlcyBDb2RleCsrICR7cnVudGltZS5yZXF1aXJlZH1gIDogXCJSZXF1aXJlcyBuZXdlciBDb2RleCsrXCI7XG59XG5cbmZ1bmN0aW9uIHNob3dTdG9yZUNhcmRNZXNzYWdlKGNhcmQ6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgY2FyZC5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtY29kZXhwcC1zdG9yZS1jYXJkLW1lc3NhZ2VdXCIpPy5yZW1vdmUoKTtcbiAgY29uc3Qgbm90aWNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbm90aWNlLmRhdGFzZXQuY29kZXhwcFN0b3JlQ2FyZE1lc3NhZ2UgPSBcInRydWVcIjtcbiAgbm90aWNlLmNsYXNzTmFtZSA9XG4gICAgXCJyb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyLzUwIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0zIHB5LTIgdGV4dC1zbSBsZWFkaW5nLTUgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XG4gIG5vdGljZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGNvbnN0IGFjdGlvbnMgPSBjYXJkLmxhc3RFbGVtZW50Q2hpbGQ7XG4gIGlmIChhY3Rpb25zKSBjYXJkLmluc2VydEJlZm9yZShub3RpY2UsIGFjdGlvbnMpO1xuICBlbHNlIGNhcmQuYXBwZW5kQ2hpbGQobm90aWNlKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZUNhcmRTaGVsbCgpOiB7XG4gIGNhcmQ6IEhUTUxFbGVtZW50O1xuICBsZWZ0OiBIVE1MRWxlbWVudDtcbiAgc3RhY2s6IEhUTUxFbGVtZW50O1xuICB2ZXJzaW9uczogSFRNTEVsZW1lbnQ7XG4gIGFjdGlvbnM6IEhUTUxFbGVtZW50O1xufSB7XG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjYXJkLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyLzQwIGZsZXggbWluLWgtWzE5MHB4XSBmbGV4LWNvbCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcm91bmRlZC0yeGwgYm9yZGVyIHAtNCB0cmFuc2l0aW9uLWNvbG9ycyBob3ZlcjpiZy10b2tlbi1mb3JlZ3JvdW5kLzVcIjtcblxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTJcIjtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQobGVmdCk7XG5cbiAgY29uc3QgZm9vdGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZm9vdGVyLmNsYXNzTmFtZSA9IFwibXQtYXV0byBmbGV4IG1pbi13LTAgZmxleC13cmFwIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTJcIjtcbiAgY29uc3QgdmVyc2lvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB2ZXJzaW9ucy5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIGZvb3Rlci5hcHBlbmRDaGlsZCh2ZXJzaW9ucyk7XG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1lbmQgZ2FwLTJcIjtcbiAgZm9vdGVyLmFwcGVuZENoaWxkKGFjdGlvbnMpO1xuICBjYXJkLmFwcGVuZENoaWxkKGZvb3Rlcik7XG5cbiAgcmV0dXJuIHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH07XG59XG5cbmZ1bmN0aW9uIHR3ZWFrU3RvcmVUaXRsZVJvdygpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC0zXCI7XG4gIHJldHVybiB0aXRsZVJvdztcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJsaW5lLWNsYW1wLTMgbWluLXctMCB0ZXh0LXNtIGxlYWRpbmctNSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIHJldHVybiBkZXNjO1xufVxuXG5mdW5jdGlvbiB0d2Vha1N0b3JlUmVhZE1vcmVCdXR0b24ocmVwbzogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCByZWFkTW9yZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHJlYWRNb3JlLnR5cGUgPSBcImJ1dHRvblwiO1xuICByZWFkTW9yZS5jbGFzc05hbWUgPVxuICAgIFwiaW5saW5lLWZsZXggdy1maXQgaXRlbXMtY2VudGVyIGdhcC0xIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcbiAgcmVhZE1vcmUuaW5uZXJIVE1MID1cbiAgICBgUmVhZCBNb3JlYCArXG4gICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiIGZpbGw9XCJub25lXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNNiAzLjVoNi41VjEwTTEyLjI1IDMuNzUgNCAxMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNDVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmA7XG4gIHJlYWRNb3JlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfWApO1xuICB9KTtcbiAgcmV0dXJuIHJlYWRNb3JlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGdyaWQuc2V0QXR0cmlidXRlKFwiYXJpYS1idXN5XCIsIFwidHJ1ZVwiKTtcbiAgZ3JpZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gIGdyaWQuYXBwZW5kQ2hpbGQodHdlYWtTdG9yZUdob3N0Q2FyZCgpKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZUdob3N0Q2FyZCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH0gPSB0d2Vha1N0b3JlQ2FyZFNoZWxsKCk7XG4gIGNhcmQuY2xhc3NMaXN0LmFkZChcInBvaW50ZXItZXZlbnRzLW5vbmVcIik7XG4gIGNhcmQuc2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIiwgXCJ0cnVlXCIpO1xuXG4gIGxlZnQuaW5zZXJ0QmVmb3JlKHN0b3JlQXZhdGFyR2hvc3QoKSwgc3RhY2spO1xuXG4gIGNvbnN0IHRpdGxlUm93ID0gdHdlYWtTdG9yZVRpdGxlUm93KCk7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtbGcgZm9udC1zZW1pYm9sZCBsZWFkaW5nLTcgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCI7XG4gIHRpdGxlLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJteS0xIGgtNSB3LTQ0IHJvdW5kZWQtbWRcIikpO1xuICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHZlcmlmaWVkU2FmZUdob3N0QmFkZ2UoKSk7XG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuICBjb25zdCBkZXNjID0gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk7XG4gIGRlc2MuYXBwZW5kQ2hpbGQoZ2hvc3RCbG9jayhcIm10LTEgaC0zIHctZnVsbCByb3VuZGVkXCIpKTtcbiAgZGVzYy5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXQtMiBoLTMgdy0xMS8xMiByb3VuZGVkXCIpKTtcbiAgZGVzYy5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXQtMiBoLTMgdy03LzEyIHJvdW5kZWRcIikpO1xuICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcblxuICBjb25zdCByZWFkTW9yZSA9IHR3ZWFrU3RvcmVSZWFkTW9yZUJ1dHRvbihcIlwiKTtcbiAgcmVhZE1vcmUucmVwbGFjZUNoaWxkcmVuKGdob3N0QmxvY2soXCJoLTUgdy0yNCByb3VuZGVkXCIpKTtcbiAgc3RhY2suYXBwZW5kQ2hpbGQocmVhZE1vcmUpO1xuXG4gIHZlcnNpb25zLmFwcGVuZENoaWxkKHN0b3JlVmVyc2lvbkdob3N0QmFkZ2UoKSk7XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNHaG9zdFBpbGwoKSk7XG4gIHJldHVybiBjYXJkO1xufVxuXG5mdW5jdGlvbiBzdG9yZUF2YXRhckdob3N0KCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgYXZhdGFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XG4gICAgXCJmbGV4IGgtMTAgdy0xMCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXItZGVmYXVsdCBiZy10cmFuc3BhcmVudCB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcbiAgYXZhdGFyLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJoLWZ1bGwgdy1mdWxsXCIpKTtcbiAgcmV0dXJuIGF2YXRhcjtcbn1cblxuZnVuY3Rpb24gdmVyaWZpZWRTYWZlR2hvc3RCYWRnZSgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gdmVyaWZpZWRTYWZlQmFkZ2UoKTtcbiAgYmFkZ2UucmVwbGFjZUNoaWxkcmVuKGdob3N0QmxvY2soXCJoLVsxM3B4XSB3LVsxM3B4XSByb3VuZGVkLXNtXCIpLCBnaG9zdEJsb2NrKFwiaC0zIHctMjAgcm91bmRlZFwiKSk7XG4gIHJldHVybiBiYWRnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmVTdGF0dXNHaG9zdFBpbGwoKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBwaWxsID0gc3RvcmVTdGF0dXNQaWxsKFwiSW5zdGFsbGVkXCIpO1xuICBwaWxsLmNsYXNzTGlzdC5hZGQoXCJhbmltYXRlLXB1bHNlXCIpO1xuICBwaWxsLnN0eWxlLmNvbG9yID0gXCJ0cmFuc3BhcmVudFwiO1xuICByZXR1cm4gcGlsbDtcbn1cblxuZnVuY3Rpb24gc3RvcmVWZXJzaW9uR2hvc3RCYWRnZSgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gc3RvcmVWZXJzaW9uQmFkZ2VTaGVsbChmYWxzZSk7XG4gIGJhZGdlLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJoLTMgdy0zNiByb3VuZGVkXCIpKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiBnaG9zdEJsb2NrKGNsYXNzTmFtZTogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBibG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGJsb2NrLmNsYXNzTmFtZSA9IGBhbmltYXRlLXB1bHNlIGJnLXRva2VuLWZvcmVncm91bmQvMTAgJHtjbGFzc05hbWV9YDtcbiAgYmxvY2suc2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIiwgXCJ0cnVlXCIpO1xuICByZXR1cm4gYmxvY2s7XG59XG5cbmZ1bmN0aW9uIHN0b3JlQXZhdGFyKGVudHJ5OiBUd2Vha1N0b3JlRW50cnlWaWV3KTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBhdmF0YXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhdmF0YXIuY2xhc3NOYW1lID1cbiAgICBcImZsZXggaC0xMCB3LTEwIHNocmluay0wIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci1kZWZhdWx0IGJnLXRyYW5zcGFyZW50IHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xuICBjb25zdCBpbml0aWFsID0gKGVudHJ5Lm1hbmlmZXN0Lm5hbWU/LlswXSA/PyBcIj9cIikudG9VcHBlckNhc2UoKTtcbiAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xuICBhdmF0YXIuYXBwZW5kQ2hpbGQoZmFsbGJhY2spO1xuICBjb25zdCBpY29uVXJsID0gc3RvcmVFbnRyeUljb25VcmwoZW50cnkpO1xuICBpZiAoaWNvblVybCkge1xuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgaW1nLmFsdCA9IFwiXCI7XG4gICAgaW1nLmNsYXNzTmFtZSA9IFwiaC1mdWxsIHctZnVsbCBvYmplY3QtY292ZXJcIjtcbiAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIGltZy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB9KTtcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcbiAgICAgIGltZy5yZW1vdmUoKTtcbiAgICB9KTtcbiAgICBpbWcuc3JjID0gaWNvblVybDtcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgfVxuICByZXR1cm4gYXZhdGFyO1xufVxuXG5mdW5jdGlvbiBzdG9yZUVudHJ5SWNvblVybChlbnRyeTogVHdlYWtTdG9yZUVudHJ5Vmlldyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBpY29uVXJsID0gZW50cnkubWFuaWZlc3QuaWNvblVybD8udHJpbSgpO1xuICBpZiAoIWljb25VcmwpIHJldHVybiBudWxsO1xuICBpZiAoL14oaHR0cHM/OnxkYXRhOikvaS50ZXN0KGljb25VcmwpKSByZXR1cm4gaWNvblVybDtcbiAgY29uc3QgcmVsID0gaWNvblVybC5yZXBsYWNlKC9eXFwuP1xcLy8sIFwiXCIpO1xuICBpZiAoIXJlbCB8fCByZWwuc3RhcnRzV2l0aChcIi4uL1wiKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLyR7ZW50cnkucmVwb30vJHtlbnRyeS5hcHByb3ZlZENvbW1pdFNoYX0vJHtyZWx9YDtcbn1cblxuZnVuY3Rpb24gc2lkZWJhclVwZGF0ZVBpbGxCdXR0b24oKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5kYXRhc2V0LmNvZGV4cHBTaWRlYmFyVXBkYXRlID0gXCJ0cnVlXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwidXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXBcIjtcbiAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHtcbiAgICBkaXNwbGF5OiBcIm5vbmVcIixcbiAgICBoZWlnaHQ6IFwiMjBweFwiLFxuICAgIGJvcmRlclJhZGl1czogXCI5OTk5cHhcIixcbiAgICBib3JkZXI6IFwiMFwiLFxuICAgIGJhY2tncm91bmQ6IFwiIzBBODRGRlwiLFxuICAgIGNvbG9yOiBcIiNGRkZGRkZcIixcbiAgICBwYWRkaW5nOiBcIjAgOHB4XCIsXG4gICAgZm9udFNpemU6IFwiMTBweFwiLFxuICAgIGZvbnRXZWlnaHQ6IFwiNzAwXCIsXG4gICAgbGluZUhlaWdodDogXCIyMHB4XCIsXG4gICAgbGV0dGVyU3BhY2luZzogXCIwXCIsXG4gICAgdGV4dFRyYW5zZm9ybTogXCJub25lXCIsXG4gICAgYm94U2hhZG93OiBcIjAgMXB4IDJweCByZ2JhKDAsIDAsIDAsIDAuMTgpXCIsXG4gIH0pO1xuICBidG4udGV4dENvbnRlbnQgPSBcIlVwZGF0ZVwiO1xuICBidG4udGl0bGUgPSBcIk9wZW4gQ29kZXgrKyB1cGRhdGVcIjtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwiIzAwNzFFM1wiO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwiIzBBODRGRlwiO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGJ0bi5kYXRhc2V0LmNvZGV4cHBSZWxlYXNlVXJsIHx8IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTCk7XG4gIH0pO1xuICByZXR1cm4gYnRuO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICBjb25zdCBidG4gPSBzdGF0ZS5jb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uO1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Y2hlY2stY29kZXhwcC11cGRhdGVcIiwgZm9yY2UpXG4gICAgLnRoZW4oKGNoZWNrKSA9PiBzZXRTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbihjaGVjayBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2spKVxuICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgcGxvZyhcIkNvZGV4Kysgc2lkZWJhciByZWxlYXNlIGNoZWNrIGZhaWxlZFwiLCBTdHJpbmcoZSkpO1xuICAgICAgc2V0U2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24obnVsbCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFNpZGViYXJDb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uKGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogdm9pZCB7XG4gIGNvbnN0IGJ0biA9IHN0YXRlLmNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b247XG4gIGlmICghYnRuKSByZXR1cm47XG4gIGNvbnN0IHVwZGF0ZUF2YWlsYWJsZSA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPT09IHRydWU7XG4gIGJ0bi5zdHlsZS5kaXNwbGF5ID0gdXBkYXRlQXZhaWxhYmxlID8gXCJpbmxpbmUtZmxleFwiIDogXCJub25lXCI7XG4gIGJ0bi5oaWRkZW4gPSAhdXBkYXRlQXZhaWxhYmxlO1xuICBidG4uZGF0YXNldC5jb2RleHBwUmVsZWFzZVVybCA9IGNoZWNrPy5yZWxlYXNlVXJsIHx8IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTDtcbiAgYnRuLnRpdGxlID1cbiAgICB1cGRhdGVBdmFpbGFibGUgJiYgY2hlY2s/LmxhdGVzdFZlcnNpb25cbiAgICAgID8gYE9wZW4gQ29kZXgrKyAke2NoZWNrLmxhdGVzdFZlcnNpb259IHVwZGF0ZWBcbiAgICAgIDogXCJPcGVuIENvZGV4KysgdXBkYXRlXCI7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0b3JlVXBkYXRlQmFkZ2UoY291bnQ6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtc3RvcmUtdXBkYXRlLWJhZGdlXVwiKTtcbiAgaWYgKCFiYWRnZSkgcmV0dXJuO1xuICBiYWRnZS5kYXRhc2V0LmNvZGV4cHBTdG9yZVVwZGF0ZUNvdW50ID0gY291bnQgPT09IG51bGwgPyBcIlwiIDogU3RyaW5nKGNvdW50KTtcbiAgYXBwbHlTdG9yZVVwZGF0ZUJhZGdlU3R5bGUoYmFkZ2UsIGNvdW50KTtcbiAgYmFkZ2UuaGlkZGVuID0gY291bnQgPT09IG51bGwgfHwgY291bnQgPD0gMDtcbiAgYmFkZ2UudGV4dENvbnRlbnQgPSBjb3VudCAmJiBjb3VudCA+IDAgPyBTdHJpbmcoY291bnQpIDogXCJcIjtcbiAgYmFkZ2UudGl0bGUgPVxuICAgIGNvdW50ICYmIGNvdW50ID4gMFxuICAgICAgPyBgJHtjb3VudH0gaW5zdGFsbGVkIHR3ZWFrJHtjb3VudCA9PT0gMSA/IFwiXCIgOiBcInNcIn0gY2FuIGJlIHVwZGF0ZWRgXG4gICAgICA6IFwiSW5zdGFsbGVkIHR3ZWFrcyBhcmUgdXAgdG8gZGF0ZVwiO1xufVxuXG5mdW5jdGlvbiBhcHBseVN0b3JlVXBkYXRlQmFkZ2VTdHlsZShiYWRnZTogSFRNTEVsZW1lbnQsIGNvdW50OiBudW1iZXIgfCBudWxsKTogdm9pZCB7XG4gIGNvbnN0IGhhc1VwZGF0ZXMgPSAhIWNvdW50ICYmIGNvdW50ID4gMDtcbiAgT2JqZWN0LmFzc2lnbihiYWRnZS5zdHlsZSwge1xuICAgIG1pbldpZHRoOiBcIjI0cHhcIixcbiAgICBoZWlnaHQ6IFwiMjBweFwiLFxuICAgIGJvcmRlclJhZGl1czogXCI5OTk5cHhcIixcbiAgICBib3JkZXI6IFwiMFwiLFxuICAgIGJhY2tncm91bmQ6IGhhc1VwZGF0ZXMgPyBcIiMwQTg0RkZcIiA6IFwidHJhbnNwYXJlbnRcIixcbiAgICBjb2xvcjogXCIjRkZGRkZGXCIsXG4gICAgcGFkZGluZzogXCIwIDdweFwiLFxuICAgIGZvbnRTaXplOiBcIjEycHhcIixcbiAgICBmb250V2VpZ2h0OiBcIjcwMFwiLFxuICAgIGxpbmVIZWlnaHQ6IFwiMjBweFwiLFxuICAgIGxldHRlclNwYWNpbmc6IFwiMFwiLFxuICAgIGJveFNoYWRvdzogaGFzVXBkYXRlcyA/IFwiMCAxcHggMnB4IHJnYmEoMCwgMCwgMCwgMC4yMilcIiA6IFwibm9uZVwiLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3VycmVudFN0b3JlVXBkYXRlQmFkZ2VDb3VudCgpOiBudW1iZXIge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1zdG9yZS11cGRhdGUtYmFkZ2VdXCIpO1xuICBjb25zdCByYXcgPSBiYWRnZT8uZGF0YXNldC5jb2RleHBwU3RvcmVVcGRhdGVDb3VudDtcbiAgY29uc3QgcGFyc2VkID0gcmF3ID8gTnVtYmVyKHJhdykgOiAwO1xuICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkgPyBwYXJzZWQgOiAwO1xufVxuXG5mdW5jdGlvbiBvdXRkYXRlZEluc3RhbGxlZFN0b3JlQ291bnQoZW50cmllczogVHdlYWtTdG9yZUVudHJ5Vmlld1tdKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVudHJpZXMuZmlsdGVyKFxuICAgIChlbnRyeSkgPT4gISFlbnRyeS5pbnN0YWxsZWQgJiYgaXNTdG9yZVVwZGF0ZUF2YWlsYWJsZShlbnRyeS5pbnN0YWxsZWQudmVyc2lvbiwgZW50cnkubWFuaWZlc3QudmVyc2lvbiksXG4gICkubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBzdG9yZVRvb2xiYXJCdXR0b24oXG4gIGxhYmVsOiBzdHJpbmcsXG4gIG9uQ2xpY2s6ICgpID0+IHZvaWQsXG4gIHZhcmlhbnQ6IFwicHJpbWFyeVwiIHwgXCJzZWNvbmRhcnlcIiA9IFwic2Vjb25kYXJ5XCIsXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgdmFyaWFudCA9PT0gXCJwcmltYXJ5XCJcbiAgICAgID8gXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggaXRlbXMtY2VudGVyIGdhcC0xIHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tYmctZm9nIHB4LTIgcHktMCB0ZXh0LXNtIHRleHQtdG9rZW4tYnV0dG9uLXRlcnRpYXJ5LWZvcmVncm91bmQgZW5hYmxlZDpob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkIGRpc2FibGVkOm9wYWNpdHktNDBcIlxuICAgICAgOiBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGgtOCBpdGVtcy1jZW50ZXIgZ2FwLTEgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRyYW5zcGFyZW50IGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0yIHB5LTAgdGV4dC1zbSB0ZXh0LXRva2VuLWZvcmVncm91bmQgZW5hYmxlZDpob3ZlcjpiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gc3RvcmVJY29uQnV0dG9uKFxuICBpY29uU3ZnOiBzdHJpbmcsXG4gIGxhYmVsOiBzdHJpbmcsXG4gIG9uQ2xpY2s6ICgpID0+IHZvaWQsXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggdy04IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdHJhbnNwYXJlbnQgYmctdG9rZW4tZm9yZWdyb3VuZC81IHAtMCB0ZXh0LXRva2VuLWZvcmVncm91bmQgZW5hYmxlZDpob3ZlcjpiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XG4gIGJ0bi5pbm5lckhUTUwgPSBpY29uU3ZnO1xuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBsYWJlbCk7XG4gIGJ0bi50aXRsZSA9IGxhYmVsO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaEljb25TdmcoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiBjbGFzcz1cImljb24teHNcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk00LjQgOS4zNUE1LjY1IDUuNjUgMCAwIDEgMTQgNS4zTDE1Ljc1IDdNMTUuNzUgMy43NVY3aC0zLjI1XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTE1LjYgMTAuNjVBNS42NSA1LjY1IDAgMCAxIDYgMTQuN0w0LjI1IDEzTTQuMjUgMTYuMjVWMTNINy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmZ1bmN0aW9uIHZlcmlmaWVkU2FmZUJhZGdlKCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgYmFkZ2UuY2xhc3NOYW1lID1cbiAgICBcImlubGluZS1mbGV4IGgtNiBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTEuNSByb3VuZGVkLW1kIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyLzMwIGJnLXRyYW5zcGFyZW50IHB4LTIgdGV4dC14cyBmb250LW1lZGl1bSB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcbiAgYmFkZ2UuaW5uZXJIVE1MID1cbiAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDE0IDE0XCIgZmlsbD1cIm5vbmVcIiBjbGFzcz1cInRleHQtYmx1ZS01MDBcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk03IDEuNzUgMTEuMjUgMy40djMuMmMwIDIuNi0xLjY1IDQuMjUtNC4yNSA1LjQtMi42LTEuMTUtNC4yNS0yLjgtNC4yNS01LjRWMy40TDcgMS43NVpcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjE1XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNNC44NSA3LjA1IDYuMyA4LjQ1bDIuODUtMy4wNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuMjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmAgK1xuICAgIGA8c3Bhbj5WZXJpZmllZCBhcyBzYWZlPC9zcGFuPmA7XG4gIHJldHVybiBiYWRnZTtcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZVZlcnNpb25CYWRnZShlbnRyeTogVHdlYWtTdG9yZUVudHJ5VmlldywgaW5zdGFsbGVkT3ZlcnJpZGU/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGluc3RhbGxlZCA9IGluc3RhbGxlZE92ZXJyaWRlID8/IGVudHJ5Lmluc3RhbGxlZD8udmVyc2lvbiA/PyBudWxsO1xuICBjb25zdCBsYXRlc3QgPSBlbnRyeS5tYW5pZmVzdC52ZXJzaW9uO1xuICBjb25zdCBoYXNVcGRhdGUgPSAhIWluc3RhbGxlZCAmJiBpc1N0b3JlVXBkYXRlQXZhaWxhYmxlKGluc3RhbGxlZCwgbGF0ZXN0KTtcbiAgY29uc3QgaW5zdGFsbGVkQWhlYWQgPSAhIWluc3RhbGxlZCAmJiBpc1N0b3JlVXBkYXRlQXZhaWxhYmxlKGxhdGVzdCwgaW5zdGFsbGVkKTtcbiAgY29uc3QgYmFkZ2UgPSBzdG9yZVZlcnNpb25CYWRnZVNoZWxsKGhhc1VwZGF0ZSk7XG4gIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJ1bmNhdGVcIjtcbiAgbGFiZWwudGV4dENvbnRlbnQgPSBpbnN0YWxsZWRcbiAgICA/IGluc3RhbGxlZEFoZWFkXG4gICAgICA/IGBJbnN0YWxsZWQgdiR7aW5zdGFsbGVkfSBcdTAwQjcgQXBwcm92ZWQgdiR7bGF0ZXN0fWBcbiAgICAgIDogYEluc3RhbGxlZCB2JHtpbnN0YWxsZWR9IFx1MDBCNyBMYXRlc3QgdiR7bGF0ZXN0fWBcbiAgICA6IGBMYXRlc3QgdiR7bGF0ZXN0fWA7XG4gIGJhZGdlLnRpdGxlID0gaW5zdGFsbGVkXG4gICAgPyBgSW5zdGFsbGVkIHZlcnNpb24gJHtpbnN0YWxsZWR9LiAke2luc3RhbGxlZEFoZWFkID8gXCJTdG9yZS1hcHByb3ZlZFwiIDogXCJMYXRlc3QgYXBwcm92ZWRcIn0gdmVyc2lvbiAke2xhdGVzdH0uYFxuICAgIDogYExhdGVzdCBhcHByb3ZlZCB2ZXJzaW9uICR7bGF0ZXN0fS5gO1xuICBiYWRnZS5hcHBlbmRDaGlsZChsYWJlbCk7XG4gIHJldHVybiBiYWRnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmVWZXJzaW9uQmFkZ2VTaGVsbChoYXNVcGRhdGU6IGJvb2xlYW4pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGJhZGdlLmNsYXNzTmFtZSA9IFtcbiAgICBcImlubGluZS1mbGV4IGgtOCBtaW4tdy0wIG1heC13LWZ1bGwgaXRlbXMtY2VudGVyIHJvdW5kZWQtbGcgYm9yZGVyIHB4LTIuNSB0ZXh0LXhzIGZvbnQtbWVkaXVtXCIsXG4gICAgaGFzVXBkYXRlXG4gICAgICA/IFwiYm9yZGVyLWJsdWUtNTAwLzMwIGJnLWJsdWUtNTAwLzEwIHRleHQtdG9rZW4tZm9yZWdyb3VuZFwiXG4gICAgICA6IFwiYm9yZGVyLXRva2VuLWJvcmRlci80MCBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCIsXG4gIF0uam9pbihcIiBcIik7XG4gIHJldHVybiBiYWRnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmVTdGF0dXNQaWxsKGxhYmVsOiBzdHJpbmcsIHRvbmU6IFwibmV1dHJhbFwiIHwgXCJpbmZvXCIgPSBcIm5ldXRyYWxcIik6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBwaWxsLmNsYXNzTmFtZSA9IFtcbiAgICBcImlubGluZS1mbGV4IGgtOCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBweC0zIHRleHQtc20gZm9udC1tZWRpdW1cIixcbiAgICB0b25lID09PSBcImluZm9cIlxuICAgICAgPyBcImJvcmRlciBib3JkZXItYmx1ZS01MDAvMzAgYmctYmx1ZS01MDAvMTAgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCJcbiAgICAgIDogXCJiZy10b2tlbi1mb3JlZ3JvdW5kLzUgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCIsXG4gIF0uam9pbihcIiBcIik7XG4gIHBpbGwudGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgcmV0dXJuIHBpbGw7XG59XG5cbmZ1bmN0aW9uIHN0b3JlSW5zdGFsbEJ1dHRvbihsYWJlbDogc3RyaW5nLCBvbkNsaWNrOiAoYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBzdG9yZUluc3RhbGxCdXR0b25DbGFzcygpO1xuICBidG4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soYnRuKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIHN0b3JlSW5zdGFsbEJ1dHRvbkNsYXNzKGV4dHJhID0gXCJcIik6IHN0cmluZyB7XG4gIHJldHVybiBbXG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggbWluLXctWzgycHhdIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBnYXAtMS41IHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci1ibHVlLTUwMC80MCBiZy1ibHVlLTUwMCBweC0zIHB5LTAgdGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLWZvcmVncm91bmQgc2hhZG93LXNtIHRyYW5zaXRpb24tY29sb3JzIGVuYWJsZWQ6aG92ZXI6YmctYmx1ZS02MDAgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkIGRpc2FibGVkOm9wYWNpdHktODBcIixcbiAgICBleHRyYSxcbiAgXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIiBcIik7XG59XG5cbmZ1bmN0aW9uIHNob3dTdG9yZUJ1dHRvbkxvYWRpbmcoYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCwgbGFiZWw6IHN0cmluZyk6IHZvaWQge1xuICBidXR0b24uY2xhc3NOYW1lID0gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoKTtcbiAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZShcImFyaWEtYnVzeVwiLCBcInRydWVcIik7XG4gIGJ1dHRvbi5pbm5lckhUTUwgPVxuICAgIGA8c3ZnIGNsYXNzPVwiYW5pbWF0ZS1zcGluXCIgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiIGZpbGw9XCJub25lXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxjaXJjbGUgY3g9XCI4XCIgY3k9XCI4XCIgcj1cIjUuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBvcGFjaXR5PVwiLjI1XCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTEzLjUgOEE1LjUgNS41IDAgMCAwIDggMi41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmAgK1xuICAgIGA8c3Bhbj4ke2xhYmVsfTwvc3Bhbj5gO1xufVxuXG5mdW5jdGlvbiBzaG93U3RvcmVCdXR0b25JbnN0YWxsZWQoYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xuICBidXR0b24uY2xhc3NOYW1lID0gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoXCJib3JkZXItYmx1ZS01MDAgYmctYmx1ZS01MDBcIik7XG4gIGJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gIGJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoXCJhcmlhLWJ1c3lcIik7XG4gIGJ1dHRvbi5pbm5lckhUTUwgPVxuICAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMTYgMTZcIiBmaWxsPVwibm9uZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTMuNzUgOC4xNSA2LjY1IDExIDEyLjI1IDVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjhcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmAgK1xuICAgIGA8c3Bhbj5JbnN0YWxsZWQ8L3NwYW4+YDtcbn1cblxuZnVuY3Rpb24gcmVzZXRTdG9yZUluc3RhbGxCdXR0b24oYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCwgbGFiZWw6IHN0cmluZyk6IHZvaWQge1xuICBidXR0b24uY2xhc3NOYW1lID0gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoKTtcbiAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gIGJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoXCJhcmlhLWJ1c3lcIik7XG4gIGJ1dHRvbi50ZXh0Q29udGVudCA9IGxhYmVsO1xufVxuXG5mdW5jdGlvbiBzaG93U3RvcmVUb2FzdChtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgbGV0IGhvc3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtc3RvcmUtdG9hc3QtaG9zdF1cIik7XG4gIGlmICghaG9zdCkge1xuICAgIGhvc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGhvc3QuZGF0YXNldC5jb2RleHBwU3RvcmVUb2FzdEhvc3QgPSBcInRydWVcIjtcbiAgICBob3N0LmNsYXNzTmFtZSA9IFwicG9pbnRlci1ldmVudHMtbm9uZSBmaXhlZCBib3R0b20tNSByaWdodC01IHotWzk5OTldIGZsZXggZmxleC1jb2wgaXRlbXMtZW5kIGdhcC0yXCI7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChob3N0KTtcbiAgfVxuICBjb25zdCB0b2FzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvYXN0LmNsYXNzTmFtZSA9XG4gICAgXCJ0cmFuc2xhdGUteS0yIHJvdW5kZWQteGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIvNTAgYmctdG9rZW4tbWFpbi1zdXJmYWNlLXByaW1hcnkgcHgtMyBweS0yIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi1mb3JlZ3JvdW5kIG9wYWNpdHktMCBzaGFkb3ctbGcgdHJhbnNpdGlvbi1hbGwgZHVyYXRpb24tMjAwXCI7XG4gIHRvYXN0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgaG9zdC5hcHBlbmRDaGlsZCh0b2FzdCk7XG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgdG9hc3QuY2xhc3NMaXN0LnJlbW92ZShcInRyYW5zbGF0ZS15LTJcIiwgXCJvcGFjaXR5LTBcIik7XG4gIH0pO1xuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICB0b2FzdC5jbGFzc0xpc3QuYWRkKFwidHJhbnNsYXRlLXktMlwiLCBcIm9wYWNpdHktMFwiKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRvYXN0LnJlbW92ZSgpO1xuICAgICAgaWYgKGhvc3QgJiYgaG9zdC5jaGlsZEVsZW1lbnRDb3VudCA9PT0gMCkgaG9zdC5yZW1vdmUoKTtcbiAgICB9LCAyMjApO1xuICB9LCAyNjAwKTtcbn1cblxuZnVuY3Rpb24gc3RvcmVNZXNzYWdlQ2FyZCh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNhcmQuY2xhc3NOYW1lID1cbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIvNDAgZmxleCBtaW4taC1bODRweF0gZmxleC1jb2wganVzdGlmeS1jZW50ZXIgZ2FwLTEgcm91bmRlZC0yeGwgYm9yZGVyIHAtNCB0ZXh0LXNtXCI7XG4gIGNvbnN0IHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0LmNsYXNzTmFtZSA9IFwiZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdC50ZXh0Q29udGVudCA9IHRpdGxlO1xuICBjYXJkLmFwcGVuZENoaWxkKHQpO1xuICBpZiAoZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICAgIGQudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcbiAgICBjYXJkLmFwcGVuZENoaWxkKGQpO1xuICB9XG4gIHJldHVybiBjYXJkO1xufVxuXG5mdW5jdGlvbiBzaG9ydFNoYSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlLnNsaWNlKDAsIDcpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUd2Vha3NQYWdlKHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgb3BlbkJ0biA9IG9wZW5JblBsYWNlQnV0dG9uKFwiT3BlbiBUd2Vha3MgRm9sZGVyXCIsICgpID0+IHtcbiAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHR3ZWFrc1BhdGgoKSk7XG4gIH0pO1xuICBjb25zdCByZWxvYWRCdG4gPSBvcGVuSW5QbGFjZUJ1dHRvbihcIkZvcmNlIFJlbG9hZFwiLCAoKSA9PiB7XG4gICAgLy8gRnVsbCBwYWdlIHJlZnJlc2ggXHUyMDE0IHNhbWUgYXMgRGV2VG9vbHMgQ21kLVIgLyBvdXIgQ0RQIFBhZ2UucmVsb2FkLlxuICAgIC8vIE1haW4gcmUtZGlzY292ZXJzIHR3ZWFrcyBmaXJzdCBzbyB0aGUgbmV3IHJlbmRlcmVyIGNvbWVzIHVwIHdpdGggYVxuICAgIC8vIGZyZXNoIHR3ZWFrIHNldDsgdGhlbiBsb2NhdGlvbi5yZWxvYWQgcmVzdGFydHMgdGhlIHJlbmRlcmVyIHNvIHRoZVxuICAgIC8vIHByZWxvYWQgcmUtaW5pdGlhbGl6ZXMgYWdhaW5zdCBpdC5cbiAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAuaW52b2tlKFwiY29kZXhwcDpyZWxvYWQtdHdlYWtzXCIpXG4gICAgICAuY2F0Y2goKGUpID0+IHBsb2coXCJmb3JjZSByZWxvYWQgKG1haW4pIGZhaWxlZFwiLCBTdHJpbmcoZSkpKVxuICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICBsb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgIH0pO1xuICB9KTtcbiAgLy8gRHJvcCB0aGUgZGlhZ29uYWwtYXJyb3cgaWNvbiBmcm9tIHRoZSByZWxvYWQgYnV0dG9uIFx1MjAxNCBpdCBpbXBsaWVzIFwib3BlblxuICAvLyBvdXQgb2YgYXBwXCIgd2hpY2ggZG9lc24ndCBmaXQuIFJlcGxhY2UgaXRzIHRyYWlsaW5nIHN2ZyB3aXRoIGEgcmVmcmVzaC5cbiAgY29uc3QgcmVsb2FkU3ZnID0gcmVsb2FkQnRuLnF1ZXJ5U2VsZWN0b3IoXCJzdmdcIik7XG4gIGlmIChyZWxvYWRTdmcpIHtcbiAgICByZWxvYWRTdmcub3V0ZXJIVE1MID1cbiAgICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tMnhzXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgICBgPHBhdGggZD1cIk00IDEwYTYgNiAwIDAgMSAxMC4yNC00LjI0TDE2IDcuNU0xNiA0djMuNWgtMy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgICAgYDxwYXRoIGQ9XCJNMTYgMTBhNiA2IDAgMCAxLTEwLjI0IDQuMjRMNCAxMi41TTQgMTZ2LTMuNWgzLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgICBgPC9zdmc+YDtcbiAgfVxuXG4gIGNvbnN0IHRyYWlsaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdHJhaWxpbmcuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICB0cmFpbGluZy5hcHBlbmRDaGlsZChyZWxvYWRCdG4pO1xuICB0cmFpbGluZy5hcHBlbmRDaGlsZChvcGVuQnRuKTtcblxuICBpZiAoc3RhdGUubGlzdGVkVHdlYWtzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnN0IHNlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgICBzZWN0aW9uLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xuICAgIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiSW5zdGFsbGVkIFR3ZWFrc1wiLCB0cmFpbGluZykpO1xuICAgIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICAgIGNhcmQuYXBwZW5kQ2hpbGQoXG4gICAgICByb3dTaW1wbGUoXG4gICAgICAgIFwiTm8gdHdlYWtzIGluc3RhbGxlZFwiLFxuICAgICAgICBgRHJvcCBhIHR3ZWFrIGZvbGRlciBpbnRvICR7dHdlYWtzUGF0aCgpfSBhbmQgcmVsb2FkLmAsXG4gICAgICApLFxuICAgICk7XG4gICAgc2VjdGlvbi5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gR3JvdXAgcmVnaXN0ZXJlZCBTZXR0aW5nc1NlY3Rpb25zIGJ5IHR3ZWFrIGlkIChwcmVmaXggc3BsaXQgYXQgXCI6XCIpLlxuICBjb25zdCBzZWN0aW9uc0J5VHdlYWsgPSBuZXcgTWFwPHN0cmluZywgU2V0dGluZ3NTZWN0aW9uW10+KCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdGF0ZS5zZWN0aW9ucy52YWx1ZXMoKSkge1xuICAgIGNvbnN0IHR3ZWFrSWQgPSBzLmlkLnNwbGl0KFwiOlwiKVswXTtcbiAgICBpZiAoIXNlY3Rpb25zQnlUd2Vhay5oYXModHdlYWtJZCkpIHNlY3Rpb25zQnlUd2Vhay5zZXQodHdlYWtJZCwgW10pO1xuICAgIHNlY3Rpb25zQnlUd2Vhay5nZXQodHdlYWtJZCkhLnB1c2gocyk7XG4gIH1cblxuICBjb25zdCBwYWdlc0J5VHdlYWsgPSBuZXcgTWFwPHN0cmluZywgUmVnaXN0ZXJlZFBhZ2VbXT4oKTtcbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XG4gICAgaWYgKCFwYWdlc0J5VHdlYWsuaGFzKHAudHdlYWtJZCkpIHBhZ2VzQnlUd2Vhay5zZXQocC50d2Vha0lkLCBbXSk7XG4gICAgcGFnZXNCeVR3ZWFrLmdldChwLnR3ZWFrSWQpIS5wdXNoKHApO1xuICB9XG5cbiAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICB3cmFwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xuICB3cmFwLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIkluc3RhbGxlZCBUd2Vha3NcIiwgdHJhaWxpbmcpKTtcblxuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcbiAgZm9yIChjb25zdCB0IG9mIHN0YXRlLmxpc3RlZFR3ZWFrcykge1xuICAgIGNhcmQuYXBwZW5kQ2hpbGQoXG4gICAgICB0d2Vha1JvdyhcbiAgICAgICAgdCxcbiAgICAgICAgc2VjdGlvbnNCeVR3ZWFrLmdldCh0Lm1hbmlmZXN0LmlkKSA/PyBbXSxcbiAgICAgICAgcGFnZXNCeVR3ZWFrLmdldCh0Lm1hbmlmZXN0LmlkKSA/PyBbXSxcbiAgICAgICksXG4gICAgKTtcbiAgfVxuICB3cmFwLmFwcGVuZENoaWxkKGNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod3JhcCk7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrUm93KFxuICB0OiBMaXN0ZWRUd2VhayxcbiAgc2VjdGlvbnM6IFNldHRpbmdzU2VjdGlvbltdLFxuICBwYWdlczogUmVnaXN0ZXJlZFBhZ2VbXSxcbik6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgbSA9IHQubWFuaWZlc3Q7XG5cbiAgLy8gT3V0ZXIgY2VsbCB3cmFwcyB0aGUgaGVhZGVyIHJvdyArIChvcHRpb25hbCkgbmVzdGVkIHNlY3Rpb25zIHNvIHRoZVxuICAvLyBwYXJlbnQgY2FyZCdzIGRpdmlkZXIgc3RheXMgYmV0d2VlbiAqdHdlYWtzKiwgbm90IGJldHdlZW4gaGVhZGVyIGFuZFxuICAvLyBib2R5IG9mIHRoZSBzYW1lIHR3ZWFrLlxuICBjb25zdCBjZWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY2VsbC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2xcIjtcbiAgaWYgKCF0LmVuYWJsZWQpIGNlbGwuc3R5bGUub3BhY2l0eSA9IFwiMC43XCI7XG5cbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1zdGFydCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XG5cbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC0xIGl0ZW1zLXN0YXJ0IGdhcC0zXCI7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIEF2YXRhciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgY29uc3QgYXZhdGFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XG4gICAgXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLW1kIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIG92ZXJmbG93LWhpZGRlbiB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIGF2YXRhci5zdHlsZS53aWR0aCA9IFwiNTZweFwiO1xuICBhdmF0YXIuc3R5bGUuaGVpZ2h0ID0gXCI1NnB4XCI7XG4gIGF2YXRhci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcInZhcigtLWNvbG9yLXRva2VuLWJnLWZvZywgdHJhbnNwYXJlbnQpXCI7XG4gIGlmIChtLmljb25VcmwpIHtcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgIGltZy5hbHQgPSBcIlwiO1xuICAgIGltZy5jbGFzc05hbWUgPSBcInNpemUtZnVsbCBvYmplY3QtY29udGFpblwiO1xuICAgIC8vIEluaXRpYWw6IHNob3cgZmFsbGJhY2sgaW5pdGlhbCBpbiBjYXNlIHRoZSBpY29uIGZhaWxzIHRvIGxvYWQuXG4gICAgY29uc3QgaW5pdGlhbCA9IChtLm5hbWU/LlswXSA/PyBcIj9cIikudG9VcHBlckNhc2UoKTtcbiAgICBjb25zdCBmYWxsYmFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIGZhbGxiYWNrLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xuICAgIGZhbGxiYWNrLnRleHRDb250ZW50ID0gaW5pdGlhbDtcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoZmFsbGJhY2spO1xuICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgaW1nLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsICgpID0+IHtcbiAgICAgIGZhbGxiYWNrLnJlbW92ZSgpO1xuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIH0pO1xuICAgIGltZy5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKCkgPT4ge1xuICAgICAgaW1nLnJlbW92ZSgpO1xuICAgIH0pO1xuICAgIHZvaWQgcmVzb2x2ZUljb25VcmwobS5pY29uVXJsLCB0LmRpcikudGhlbigodXJsKSA9PiB7XG4gICAgICBpZiAodXJsKSBpbWcuc3JjID0gdXJsO1xuICAgICAgZWxzZSBpbWcucmVtb3ZlKCk7XG4gICAgfSk7XG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGltZyk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgaW5pdGlhbCA9IChtLm5hbWU/LlswXSA/PyBcIj9cIikudG9VcHBlckNhc2UoKTtcbiAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgc3Bhbi5jbGFzc05hbWUgPSBcInRleHQteGwgZm9udC1tZWRpdW1cIjtcbiAgICBzcGFuLnRleHRDb250ZW50ID0gaW5pdGlhbDtcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gIH1cbiAgbGVmdC5hcHBlbmRDaGlsZChhdmF0YXIpO1xuXG4gIC8vIFx1MjUwMFx1MjUwMCBUZXh0IHN0YWNrIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0wLjVcIjtcblxuICBjb25zdCB0aXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlUm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcbiAgY29uc3QgbmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG5hbWUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgbmFtZS50ZXh0Q29udGVudCA9IG0ubmFtZTtcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQobmFtZSk7XG4gIGlmIChtLnZlcnNpb24pIHtcbiAgICBjb25zdCB2ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICB2ZXIuY2xhc3NOYW1lID1cbiAgICAgIFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSB0ZXh0LXhzIGZvbnQtbm9ybWFsIHRhYnVsYXItbnVtc1wiO1xuICAgIHZlci50ZXh0Q29udGVudCA9IGB2JHttLnZlcnNpb259YDtcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh2ZXIpO1xuICB9XG4gIGlmICh0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlKSB7XG4gICAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICBiYWRnZS5jbGFzc05hbWUgPVxuICAgICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gICAgYmFkZ2UudGV4dENvbnRlbnQgPSBcIlVwZGF0ZSBBdmFpbGFibGVcIjtcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZChiYWRnZSk7XG4gIH1cbiAgc3RhY2suYXBwZW5kQ2hpbGQodGl0bGVSb3cpO1xuXG4gIGlmIChtLmRlc2NyaXB0aW9uKSB7XG4gICAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZGVzYy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgbWluLXctMCB0ZXh0LXNtXCI7XG4gICAgZGVzYy50ZXh0Q29udGVudCA9IG0uZGVzY3JpcHRpb247XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIH1cblxuICBjb25zdCBtZXRhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbWV0YS5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBjb25zdCBhdXRob3JFbCA9IHJlbmRlckF1dGhvcihtLmF1dGhvcik7XG4gIGlmIChhdXRob3JFbCkgbWV0YS5hcHBlbmRDaGlsZChhdXRob3JFbCk7XG4gIGlmIChtLmdpdGh1YlJlcG8pIHtcbiAgICBpZiAobWV0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSBtZXRhLmFwcGVuZENoaWxkKGRvdCgpKTtcbiAgICBjb25zdCByZXBvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICByZXBvLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIHJlcG8uY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xuICAgIHJlcG8udGV4dENvbnRlbnQgPSBtLmdpdGh1YlJlcG87XG4gICAgcmVwby5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCBgaHR0cHM6Ly9naXRodWIuY29tLyR7bS5naXRodWJSZXBvfWApO1xuICAgIH0pO1xuICAgIG1ldGEuYXBwZW5kQ2hpbGQocmVwbyk7XG4gIH1cbiAgaWYgKG0uaG9tZXBhZ2UpIHtcbiAgICBpZiAobWV0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSBtZXRhLmFwcGVuZENoaWxkKGRvdCgpKTtcbiAgICBjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG4gICAgbGluay5ocmVmID0gbS5ob21lcGFnZTtcbiAgICBsaW5rLnRhcmdldCA9IFwiX2JsYW5rXCI7XG4gICAgbGluay5yZWwgPSBcIm5vcmVmZXJyZXJcIjtcbiAgICBsaW5rLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcbiAgICBsaW5rLnRleHRDb250ZW50ID0gXCJIb21lcGFnZVwiO1xuICAgIG1ldGEuYXBwZW5kQ2hpbGQobGluayk7XG4gIH1cbiAgaWYgKG1ldGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkgc3RhY2suYXBwZW5kQ2hpbGQobWV0YSk7XG5cbiAgLy8gVGFncyByb3cgKGlmIGFueSkgXHUyMDE0IHNtYWxsIHBpbGwgY2hpcHMgYmVsb3cgdGhlIG1ldGEgbGluZS5cbiAgaWYgKG0udGFncyAmJiBtLnRhZ3MubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRhZ3NSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhZ3NSb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIgZ2FwLTEgcHQtMC41XCI7XG4gICAgZm9yIChjb25zdCB0YWcgb2YgbS50YWdzKSB7XG4gICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBwaWxsLmNsYXNzTmFtZSA9XG4gICAgICAgIFwicm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0yIHB5LTAuNSB0ZXh0LVsxMXB4XSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gICAgICBwaWxsLnRleHRDb250ZW50ID0gdGFnO1xuICAgICAgdGFnc1Jvdy5hcHBlbmRDaGlsZChwaWxsKTtcbiAgICB9XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQodGFnc1Jvdyk7XG4gIH1cblxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxlZnQpO1xuXG4gIC8vIFx1MjUwMFx1MjUwMCBUb2dnbGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcmlnaHQuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMiBwdC0wLjVcIjtcbiAgaWYgKHQuZW5hYmxlZCAmJiBwYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY29uZmlndXJlQnRuID0gY29tcGFjdEJ1dHRvbihcIkNvbmZpZ3VyZVwiLCAoKSA9PiB7XG4gICAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcInJlZ2lzdGVyZWRcIiwgaWQ6IHBhZ2VzWzBdIS5pZCB9KTtcbiAgICB9KTtcbiAgICBjb25maWd1cmVCdG4udGl0bGUgPSBwYWdlcy5sZW5ndGggPT09IDFcbiAgICAgID8gYE9wZW4gJHtwYWdlc1swXSEucGFnZS50aXRsZX1gXG4gICAgICA6IGBPcGVuICR7cGFnZXMubWFwKChwKSA9PiBwLnBhZ2UudGl0bGUpLmpvaW4oXCIsIFwiKX1gO1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKGNvbmZpZ3VyZUJ0bik7XG4gIH1cbiAgaWYgKHQudXBkYXRlPy51cGRhdGVBdmFpbGFibGUgJiYgdC51cGRhdGUucmVsZWFzZVVybCkge1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKFxuICAgICAgY29tcGFjdEJ1dHRvbihcIlJldmlldyBSZWxlYXNlXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgdC51cGRhdGUhLnJlbGVhc2VVcmwpO1xuICAgICAgfSksXG4gICAgKTtcbiAgfVxuICByaWdodC5hcHBlbmRDaGlsZChcbiAgICBzd2l0Y2hDb250cm9sKHQuZW5hYmxlZCwgYXN5bmMgKG5leHQpID0+IHtcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6c2V0LXR3ZWFrLWVuYWJsZWRcIiwgbS5pZCwgbmV4dCk7XG4gICAgICAvLyBUaGUgbWFpbiBwcm9jZXNzIGJyb2FkY2FzdHMgYSByZWxvYWQgd2hpY2ggd2lsbCByZS1mZXRjaCB0aGUgbGlzdFxuICAgICAgLy8gYW5kIHJlLXJlbmRlci4gV2UgZG9uJ3Qgb3B0aW1pc3RpY2FsbHkgdG9nZ2xlIHRvIGF2b2lkIGRyaWZ0LlxuICAgIH0pLFxuICApO1xuICBoZWFkZXIuYXBwZW5kQ2hpbGQocmlnaHQpO1xuXG4gIGNlbGwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICAvLyBJZiB0aGUgdHdlYWsgaXMgZW5hYmxlZCBhbmQgcmVnaXN0ZXJlZCBzZXR0aW5ncyBzZWN0aW9ucywgcmVuZGVyIHRob3NlXG4gIC8vIGJvZGllcyBhcyBuZXN0ZWQgcm93cyBiZW5lYXRoIHRoZSBoZWFkZXIgaW5zaWRlIHRoZSBzYW1lIGNlbGwuXG4gIGlmICh0LmVuYWJsZWQgJiYgc2VjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG5lc3RlZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbmVzdGVkLmNsYXNzTmFtZSA9XG4gICAgICBcImZsZXggZmxleC1jb2wgZGl2aWRlLXktWzAuNXB4XSBkaXZpZGUtdG9rZW4tYm9yZGVyIGJvcmRlci10LVswLjVweF0gYm9yZGVyLXRva2VuLWJvcmRlclwiO1xuICAgIGZvciAoY29uc3QgcyBvZiBzZWN0aW9ucykge1xuICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBib2R5LmNsYXNzTmFtZSA9IFwicC0zXCI7XG4gICAgICB0cnkge1xuICAgICAgICBzLnJlbmRlcihib2R5KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgYm9keS50ZXh0Q29udGVudCA9IGBFcnJvciByZW5kZXJpbmcgdHdlYWsgc2VjdGlvbjogJHsoZSBhcyBFcnJvcikubWVzc2FnZX1gO1xuICAgICAgfVxuICAgICAgbmVzdGVkLmFwcGVuZENoaWxkKGJvZHkpO1xuICAgIH1cbiAgICBjZWxsLmFwcGVuZENoaWxkKG5lc3RlZCk7XG4gIH1cblxuICByZXR1cm4gY2VsbDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQXV0aG9yKGF1dGhvcjogVHdlYWtNYW5pZmVzdFtcImF1dGhvclwiXSk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICB3cmFwLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIGdhcC0xXCI7XG4gIGlmICh0eXBlb2YgYXV0aG9yID09PSBcInN0cmluZ1wiKSB7XG4gICAgd3JhcC50ZXh0Q29udGVudCA9IGBieSAke2F1dGhvcn1gO1xuICAgIHJldHVybiB3cmFwO1xuICB9XG4gIHdyYXAuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJieSBcIikpO1xuICBpZiAoYXV0aG9yLnVybCkge1xuICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbiAgICBhLmhyZWYgPSBhdXRob3IudXJsO1xuICAgIGEudGFyZ2V0ID0gXCJfYmxhbmtcIjtcbiAgICBhLnJlbCA9IFwibm9yZWZlcnJlclwiO1xuICAgIGEuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xuICAgIGEudGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcbiAgICB3cmFwLmFwcGVuZENoaWxkKGEpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICBzcGFuLnRleHRDb250ZW50ID0gYXV0aG9yLm5hbWU7XG4gICAgd3JhcC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgfVxuICByZXR1cm4gd3JhcDtcbn1cblxuZnVuY3Rpb24gb3BlblB1Ymxpc2hUd2Vha0RpYWxvZygpOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtcHVibGlzaC1kaWFsb2ddXCIpO1xuICBleGlzdGluZz8ucmVtb3ZlKCk7XG5cbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG92ZXJsYXkuZGF0YXNldC5jb2RleHBwUHVibGlzaERpYWxvZyA9IFwidHJ1ZVwiO1xuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwiZml4ZWQgaW5zZXQtMCB6LVs5OTk5XSBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBiZy1ibGFjay80MCBwLTRcIjtcblxuICBjb25zdCBkaWFsb2cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkaWFsb2cuY2xhc3NOYW1lID1cbiAgICBcImZsZXggdy1mdWxsIG1heC13LXhsIGZsZXgtY29sIGdhcC00IHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tbWFpbi1zdXJmYWNlLXByaW1hcnkgcC00IHNoYWRvdy14bFwiO1xuICBvdmVybGF5LmFwcGVuZENoaWxkKGRpYWxvZyk7XG5cbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1zdGFydCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTNcIjtcbiAgY29uc3QgdGl0bGVTdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlU3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcInRleHQtYmFzZSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiUHVibGlzaCBUd2Vha1wiO1xuICBjb25zdCBzdWJ0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHN1YnRpdGxlLmNsYXNzTmFtZSA9IFwidGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIHN1YnRpdGxlLnRleHRDb250ZW50ID0gXCJTdWJtaXQgYSBHaXRIdWIgcmVwbyBmb3IgYWRtaW4gcmV2aWV3LiBDb2RleCsrIHJlY29yZHMgdGhlIGV4YWN0IGNvbW1pdCBhZG1pbnMgbXVzdCByZXZpZXcgYW5kIHBpbi5cIjtcbiAgdGl0bGVTdGFjay5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIHRpdGxlU3RhY2suYXBwZW5kQ2hpbGQoc3VidGl0bGUpO1xuICBoZWFkZXIuYXBwZW5kQ2hpbGQodGl0bGVTdGFjayk7XG4gIGhlYWRlci5hcHBlbmRDaGlsZChjb21wYWN0QnV0dG9uKFwiRGlzbWlzc1wiLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKSk7XG4gIGRpYWxvZy5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gIGNvbnN0IHJlcG9JbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgcmVwb0lucHV0LnR5cGUgPSBcInRleHRcIjtcbiAgcmVwb0lucHV0LnBsYWNlaG9sZGVyID0gXCJvd25lci9yZXBvIG9yIGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvXCI7XG4gIHJlcG9JbnB1dC5jbGFzc05hbWUgPVxuICAgIFwiaC0xMCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRyYW5zcGFyZW50IHB4LTMgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBmb2N1czpvdXRsaW5lLW5vbmVcIjtcbiAgZGlhbG9nLmFwcGVuZENoaWxkKHJlcG9JbnB1dCk7XG5cbiAgY29uc3Qgc3RhdHVzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3RhdHVzLmNsYXNzTmFtZSA9IFwibWluLWgtNSB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgc3RhdHVzLnRleHRDb250ZW50ID0gXCJUaGUgbWFuaWZlc3Qgc2hvdWxkIGluY2x1ZGUgYW4gaWNvblVybCBzdWl0YWJsZSBmb3IgdGhlIHN0b3JlLlwiO1xuICBkaWFsb2cuYXBwZW5kQ2hpbGQoc3RhdHVzKTtcblxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktZW5kIGdhcC0yXCI7XG4gIGNvbnN0IHN1Ym1pdCA9IGNvbXBhY3RCdXR0b24oXCJPcGVuIFJldmlldyBJc3N1ZVwiLCAoKSA9PiB7XG4gICAgdm9pZCBzdWJtaXRQdWJsaXNoVHdlYWsocmVwb0lucHV0LCBzdGF0dXMpO1xuICB9KTtcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChzdWJtaXQpO1xuICBkaWFsb2cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG5cbiAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7XG4gIH0pO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuICByZXBvSW5wdXQuZm9jdXMoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3VibWl0UHVibGlzaFR3ZWFrKFxuICByZXBvSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQsXG4gIHN0YXR1czogSFRNTEVsZW1lbnQsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgc3RhdHVzLmNsYXNzTmFtZSA9IFwibWluLWgtNSB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgc3RhdHVzLnRleHRDb250ZW50ID0gXCJSZXNvbHZpbmcgdGhlIHJlcG8gY29tbWl0IHRvIHJldmlldy5cIjtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdWJtaXNzaW9uID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgXCJjb2RleHBwOnByZXBhcmUtdHdlYWstc3RvcmUtc3VibWlzc2lvblwiLFxuICAgICAgcmVwb0lucHV0LnZhbHVlLFxuICAgICkgYXMgVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwoc3VibWlzc2lvbik7XG4gICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIHVybCk7XG4gICAgc3RhdHVzLnRleHRDb250ZW50ID0gYEdpdEh1YiByZXZpZXcgaXNzdWUgb3BlbmVkIGZvciAke3N1Ym1pc3Npb24uY29tbWl0U2hhLnNsaWNlKDAsIDcpfS5gO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc3RhdHVzLmNsYXNzTmFtZSA9IFwibWluLWgtNSB0ZXh0LXNtIHRleHQtdG9rZW4tY2hhcnRzLXJlZFwiO1xuICAgIHN0YXR1cy50ZXh0Q29udGVudCA9IFN0cmluZygoZSBhcyBFcnJvcikubWVzc2FnZSA/PyBlKTtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgY29tcG9uZW50cyBcdTI1MDBcdTI1MDBcblxuLyoqIFRoZSBmdWxsIHBhbmVsIHNoZWxsICh0b29sYmFyICsgc2Nyb2xsICsgaGVhZGluZyArIHNlY3Rpb25zIHdyYXApLiAqL1xuZnVuY3Rpb24gcGFuZWxTaGVsbChcbiAgdGl0bGU6IHN0cmluZyxcbiAgc3VidGl0bGU/OiBzdHJpbmcsXG4gIG9wdGlvbnM/OiB7IHdpZGU/OiBib29sZWFuIH0sXG4pOiB7XG4gIG91dGVyOiBIVE1MRWxlbWVudDtcbiAgc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudDtcbiAgc3VidGl0bGU/OiBIVE1MRWxlbWVudDtcbiAgaGVhZGVyQWN0aW9uczogSFRNTEVsZW1lbnQ7XG4gIGhlYWRlclRpdGxlQWN0aW9uczogSFRNTEVsZW1lbnQ7XG59IHtcbiAgY29uc3Qgb3V0ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBvdXRlci5jbGFzc05hbWUgPSBcIm1haW4tc3VyZmFjZSBmbGV4IGgtZnVsbCBtaW4taC0wIGZsZXgtY29sXCI7XG5cbiAgY29uc3QgdG9vbGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRvb2xiYXIuY2xhc3NOYW1lID1cbiAgICBcImRyYWdnYWJsZSBmbGV4IGl0ZW1zLWNlbnRlciBweC1wYW5lbCBlbGVjdHJvbjpoLXRvb2xiYXIgZXh0ZW5zaW9uOmgtdG9vbGJhci1zbVwiO1xuICBvdXRlci5hcHBlbmRDaGlsZCh0b29sYmFyKTtcblxuICBjb25zdCBzY3JvbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzY3JvbGwuY2xhc3NOYW1lID0gXCJmbGV4LTEgb3ZlcmZsb3cteS1hdXRvIHAtcGFuZWxcIjtcbiAgb3V0ZXIuYXBwZW5kQ2hpbGQoc2Nyb2xsKTtcblxuICBjb25zdCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGlubmVyLmNsYXNzTmFtZSA9XG4gICAgb3B0aW9ucz8ud2lkZVxuICAgICAgPyBcIm14LWF1dG8gZmxleCB3LWZ1bGwgbWF4LXctNXhsIGZsZXgtY29sIGVsZWN0cm9uOm1pbi13LVtjYWxjKDMyMHB4KnZhcigtLWNvZGV4LXdpbmRvdy16b29tKSldXCJcbiAgICAgIDogXCJteC1hdXRvIGZsZXggdy1mdWxsIGZsZXgtY29sIG1heC13LTJ4bCBlbGVjdHJvbjptaW4tdy1bY2FsYygzMjBweCp2YXIoLS1jb2RleC13aW5kb3ctem9vbSkpXVwiO1xuICBzY3JvbGwuYXBwZW5kQ2hpbGQoaW5uZXIpO1xuXG4gIGNvbnN0IGhlYWRlcldyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXJXcmFwLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0zIHBiLXBhbmVsXCI7XG4gIGNvbnN0IGhlYWRlcklubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVySW5uZXIuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC0xIGZsZXgtY29sIGdhcC0xLjUgcGItcGFuZWxcIjtcbiAgY29uc3QgdGl0bGVMaW5lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVMaW5lLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGluZy5jbGFzc05hbWUgPSBcImVsZWN0cm9uOmhlYWRpbmctbGcgaGVhZGluZy1iYXNlIHRydW5jYXRlXCI7XG4gIGhlYWRpbmcudGV4dENvbnRlbnQgPSB0aXRsZTtcbiAgdGl0bGVMaW5lLmFwcGVuZENoaWxkKGhlYWRpbmcpO1xuICBjb25zdCBoZWFkZXJUaXRsZUFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXJUaXRsZUFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICB0aXRsZUxpbmUuYXBwZW5kQ2hpbGQoaGVhZGVyVGl0bGVBY3Rpb25zKTtcbiAgaGVhZGVySW5uZXIuYXBwZW5kQ2hpbGQodGl0bGVMaW5lKTtcbiAgbGV0IHN1YnRpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG4gIGlmIChzdWJ0aXRsZSkge1xuICAgIGNvbnN0IHN1YiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgc3ViLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSB0ZXh0LXNtXCI7XG4gICAgc3ViLnRleHRDb250ZW50ID0gc3VidGl0bGU7XG4gICAgaGVhZGVySW5uZXIuYXBwZW5kQ2hpbGQoc3ViKTtcbiAgICBzdWJ0aXRsZUVsZW1lbnQgPSBzdWI7XG4gIH1cbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJJbm5lcik7XG4gIGNvbnN0IGhlYWRlckFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXJBY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJBY3Rpb25zKTtcbiAgaW5uZXIuYXBwZW5kQ2hpbGQoaGVhZGVyV3JhcCk7XG5cbiAgY29uc3Qgc2VjdGlvbnNXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2VjdGlvbnNXcmFwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtW3ZhcigtLXBhZGRpbmctcGFuZWwpXVwiO1xuICBpbm5lci5hcHBlbmRDaGlsZChzZWN0aW9uc1dyYXApO1xuXG4gIHJldHVybiB7IG91dGVyLCBzZWN0aW9uc1dyYXAsIHN1YnRpdGxlOiBzdWJ0aXRsZUVsZW1lbnQsIGhlYWRlckFjdGlvbnMsIGhlYWRlclRpdGxlQWN0aW9ucyB9O1xufVxuXG5mdW5jdGlvbiBzZWN0aW9uVGl0bGUodGV4dDogc3RyaW5nLCB0cmFpbGluZz86IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICBjb25zdCB0aXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlUm93LmNsYXNzTmFtZSA9XG4gICAgXCJmbGV4IGgtdG9vbGJhciBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0yIHB4LTAgcHktMFwiO1xuICBjb25zdCB0aXRsZUlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVJbm5lci5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHQuY2xhc3NOYW1lID0gXCJ0ZXh0LWJhc2UgZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdC50ZXh0Q29udGVudCA9IHRleHQ7XG4gIHRpdGxlSW5uZXIuYXBwZW5kQ2hpbGQodCk7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlSW5uZXIpO1xuICBpZiAodHJhaWxpbmcpIHtcbiAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcmlnaHQuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKHRyYWlsaW5nKTtcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZChyaWdodCk7XG4gIH1cbiAgcmV0dXJuIHRpdGxlUm93O1xufVxuXG4vKipcbiAqIENvZGV4J3MgXCJPcGVuIGNvbmZpZy50b21sXCItc3R5bGUgdHJhaWxpbmcgYnV0dG9uOiBnaG9zdCBib3JkZXIsIG11dGVkXG4gKiBsYWJlbCwgdG9wLXJpZ2h0IGRpYWdvbmFsIGFycm93IGljb24uIE1hcmt1cCBtaXJyb3JzIENvbmZpZ3VyYXRpb24gcGFuZWwuXG4gKi9cbmZ1bmN0aW9uIG9wZW5JblBsYWNlQnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTEgYm9yZGVyIHdoaXRlc3BhY2Utbm93cmFwIGZvY3VzOm91dGxpbmUtbm9uZSBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MCByb3VuZGVkLWxnIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBlbmFibGVkOmhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBkYXRhLVtzdGF0ZT1vcGVuXTpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgYm9yZGVyLXRyYW5zcGFyZW50IGgtdG9rZW4tYnV0dG9uLWNvbXBvc2VyIHB4LTIgcHktMCB0ZXh0LWJhc2UgbGVhZGluZy1bMThweF1cIjtcbiAgYnRuLmlubmVySFRNTCA9XG4gICAgYCR7bGFiZWx9YCArXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi0yeHNcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk0xNC4zMzQ5IDEzLjMzMDFWNi42MDY0NUw1LjQ3MDY1IDE1LjQ3MDdDNS4yMTA5NSAxNS43MzA0IDQuNzg4OTUgMTUuNzMwNCA0LjUyOTI1IDE1LjQ3MDdDNC4yNjk1NSAxNS4yMTEgNC4yNjk1NSAxNC43ODkgNC41MjkyNSAxNC41MjkzTDEzLjM5MzUgNS42NjUwNEg2LjY2MDExQzYuMjkyODQgNS42NjUwNCA1Ljk5NTA3IDUuMzY3MjcgNS45OTUwNyA1QzUuOTk1MDcgNC42MzI3MyA2LjI5Mjg0IDQuMzM0OTYgNi42NjAxMSA0LjMzNDk2SDE0Ljk5OTlMMTUuMTMzNyA0LjM0ODYzQzE1LjQzNjkgNC40MTA1NyAxNS42NjUgNC42Nzg1NyAxNS42NjUgNVYxMy4zMzAxQzE1LjY2NDkgMTMuNjk3MyAxNS4zNjcyIDEzLjk5NTEgMTQuOTk5OSAxMy45OTUxQzE0LjYzMjcgMTMuOTk1MSAxNC4zMzUgMTMuNjk3MyAxNC4zMzQ5IDEzLjMzMDFaXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPjwvcGF0aD5gICtcbiAgICBgPC9zdmc+YDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBpbmxpbmUtZmxleCBoLTggaXRlbXMtY2VudGVyIHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIHB4LTIgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBlbmFibGVkOmhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xuICBidG4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIHJvdW5kZWRDYXJkKCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNhcmQuY2xhc3NOYW1lID1cbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgZmxleCBmbGV4LWNvbCBkaXZpZGUteS1bMC41cHhdIGRpdmlkZS10b2tlbi1ib3JkZXIgcm91bmRlZC1sZyBib3JkZXJcIjtcbiAgY2FyZC5zZXRBdHRyaWJ1dGUoXG4gICAgXCJzdHlsZVwiLFxuICAgIFwiYmFja2dyb3VuZC1jb2xvcjogdmFyKC0tY29sb3ItYmFja2dyb3VuZC1wYW5lbCwgdmFyKC0tY29sb3ItdG9rZW4tYmctZm9nKSk7XCIsXG4gICk7XG4gIHJldHVybiBjYXJkO1xufVxuXG5mdW5jdGlvbiByb3dTaW1wbGUodGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtY2VudGVyIGdhcC0zXCI7XG4gIGNvbnN0IHN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgaWYgKHRpdGxlKSB7XG4gICAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdC5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICAgIHQudGV4dENvbnRlbnQgPSB0aXRsZTtcbiAgICBzdGFjay5hcHBlbmRDaGlsZCh0KTtcbiAgfVxuICBpZiAoZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgICBkLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZCk7XG4gIH1cbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcbiAgcmV0dXJuIHJvdztcbn1cblxuLyoqXG4gKiBDb2RleC1zdHlsZWQgdG9nZ2xlIHN3aXRjaC4gTWFya3VwIG1pcnJvcnMgdGhlIEdlbmVyYWwgPiBQZXJtaXNzaW9ucyByb3dcbiAqIHN3aXRjaCB3ZSBjYXB0dXJlZDogb3V0ZXIgYnV0dG9uIChyb2xlPXN3aXRjaCksIGlubmVyIHBpbGwsIHNsaWRpbmcga25vYi5cbiAqL1xuZnVuY3Rpb24gc3dpdGNoQ29udHJvbChcbiAgaW5pdGlhbDogYm9vbGVhbixcbiAgb25DaGFuZ2U6IChuZXh0OiBib29sZWFuKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPixcbik6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInN3aXRjaFwiKTtcblxuICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGNvbnN0IGtub2IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAga25vYi5jbGFzc05hbWUgPVxuICAgIFwicm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItW2NvbG9yOnZhcigtLWdyYXktMCldIGJnLVtjb2xvcjp2YXIoLS1ncmF5LTApXSBzaGFkb3ctc20gdHJhbnNpdGlvbi10cmFuc2Zvcm0gZHVyYXRpb24tMjAwIGVhc2Utb3V0IGgtNCB3LTRcIjtcbiAgcGlsbC5hcHBlbmRDaGlsZChrbm9iKTtcblxuICBjb25zdCBhcHBseSA9IChvbjogYm9vbGVhbik6IHZvaWQgPT4ge1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWNoZWNrZWRcIiwgU3RyaW5nKG9uKSk7XG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcbiAgICBidG4uY2xhc3NOYW1lID1cbiAgICAgIFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIHRleHQtc20gZm9jdXMtdmlzaWJsZTpvdXRsaW5lLW5vbmUgZm9jdXMtdmlzaWJsZTpyaW5nLTIgZm9jdXMtdmlzaWJsZTpyaW5nLXRva2VuLWZvY3VzLWJvcmRlciBmb2N1cy12aXNpYmxlOnJvdW5kZWQtZnVsbCBjdXJzb3ItaW50ZXJhY3Rpb25cIjtcbiAgICBwaWxsLmNsYXNzTmFtZSA9IGByZWxhdGl2ZSBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgcm91bmRlZC1mdWxsIHRyYW5zaXRpb24tY29sb3JzIGR1cmF0aW9uLTIwMCBlYXNlLW91dCBoLTUgdy04ICR7XG4gICAgICBvbiA/IFwiYmctdG9rZW4tY2hhcnRzLWJsdWVcIiA6IFwiYmctdG9rZW4tZm9yZWdyb3VuZC8yMFwiXG4gICAgfWA7XG4gICAgcGlsbC5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XG4gICAga25vYi5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XG4gICAga25vYi5zdHlsZS50cmFuc2Zvcm0gPSBvbiA/IFwidHJhbnNsYXRlWCgxNHB4KVwiIDogXCJ0cmFuc2xhdGVYKDJweClcIjtcbiAgfTtcbiAgYXBwbHkoaW5pdGlhbCk7XG5cbiAgYnRuLmFwcGVuZENoaWxkKHBpbGwpO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgY29uc3QgbmV4dCA9IGJ0bi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWNoZWNrZWRcIikgIT09IFwidHJ1ZVwiO1xuICAgIGFwcGx5KG5leHQpO1xuICAgIGJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG9uQ2hhbmdlKG5leHQpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBidG4uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gYnRuO1xufVxuXG5mdW5jdGlvbiBkb3QoKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIHMuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcbiAgcy50ZXh0Q29udGVudCA9IFwiXHUwMEI3XCI7XG4gIHJldHVybiBzO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaWNvbnMgXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIGNvbmZpZ0ljb25TdmcoKTogc3RyaW5nIHtcbiAgLy8gU2xpZGVycyAvIHNldHRpbmdzIGdseXBoLiAyMHgyMCBjdXJyZW50Q29sb3IuXG4gIHJldHVybiAoXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMyA1aDlNMTUgNWgyTTMgMTBoMk04IDEwaDlNMyAxNWgxMU0xNyAxNWgwXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcbiAgICBgPGNpcmNsZSBjeD1cIjEzXCIgY3k9XCI1XCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXG4gICAgYDxjaXJjbGUgY3g9XCI2XCIgY3k9XCIxMFwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xuICAgIGA8Y2lyY2xlIGN4PVwiMTVcIiBjeT1cIjE1XCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXG4gICAgYDwvc3ZnPmBcbiAgKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtzSWNvblN2ZygpOiBzdHJpbmcge1xuICAvLyBTcGFya2xlcyAvIFwiKytcIiBnbHlwaCBmb3IgdHdlYWtzLlxuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTEwIDIuNSBMMTEuNCA4LjYgTDE3LjUgMTAgTDExLjQgMTEuNCBMMTAgMTcuNSBMOC42IDExLjQgTDIuNSAxMCBMOC42IDguNiBaXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcbiAgICBgPHBhdGggZD1cIk0xNS41IDMgTDE2IDUgTDE4IDUuNSBMMTYgNiBMMTUuNSA4IEwxNSA2IEwxMyA1LjUgTDE1IDUgWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBvcGFjaXR5PVwiMC43XCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmZ1bmN0aW9uIHN0b3JlSWNvblN2ZygpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTQgOC4yIDUuMSA0LjVBMS41IDEuNSAwIDAgMSA2LjU1IDMuNGg2LjlhMS41IDEuNSAwIDAgMSAxLjQ1IDEuMUwxNiA4LjJcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICBgPHBhdGggZD1cIk00LjUgOGgxMXY3LjVBMS41IDEuNSAwIDAgMSAxNCAxN0g2YTEuNSAxLjUgMCAwIDEtMS41LTEuNVY4WlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTcuNSA4djFhMi41IDIuNSAwIDAgMCA1IDBWOFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmBcbiAgKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFBhZ2VJY29uU3ZnKCk6IHN0cmluZyB7XG4gIC8vIERvY3VtZW50L3BhZ2UgZ2x5cGggZm9yIHR3ZWFrLXJlZ2lzdGVyZWQgcGFnZXMgd2l0aG91dCB0aGVpciBvd24gaWNvbi5cbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk01IDNoN2wzIDN2MTFhMSAxIDAgMCAxLTEgMUg1YTEgMSAwIDAgMS0xLTFWNGExIDEgMCAwIDEgMS0xWlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTEyIDN2M2ExIDEgMCAwIDAgMSAxaDJcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICBgPHBhdGggZD1cIk03IDExaDZNNyAxNGg0XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlSWNvblVybChcbiAgdXJsOiBzdHJpbmcsXG4gIHR3ZWFrRGlyOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgaWYgKC9eKGh0dHBzPzp8ZGF0YTopLy50ZXN0KHVybCkpIHJldHVybiB1cmw7XG4gIC8vIFJlbGF0aXZlIHBhdGggXHUyMTkyIGFzayBtYWluIHRvIHJlYWQgdGhlIGZpbGUgYW5kIHJldHVybiBhIGRhdGE6IFVSTC5cbiAgLy8gUmVuZGVyZXIgaXMgc2FuZGJveGVkIHNvIGZpbGU6Ly8gd29uJ3QgbG9hZCBkaXJlY3RseS5cbiAgY29uc3QgcmVsID0gdXJsLnN0YXJ0c1dpdGgoXCIuL1wiKSA/IHVybC5zbGljZSgyKSA6IHVybDtcbiAgdHJ5IHtcbiAgICByZXR1cm4gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLWFzc2V0XCIsXG4gICAgICB0d2Vha0RpcixcbiAgICAgIHJlbCxcbiAgICApKSBhcyBzdHJpbmc7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBwbG9nKFwiaWNvbiBsb2FkIGZhaWxlZFwiLCB7IHVybCwgdHdlYWtEaXIsIGVycjogU3RyaW5nKGUpIH0pO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBET00gaGV1cmlzdGljcyBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiYXNpZGUsbmF2LFtyb2xlPSduYXZpZ2F0aW9uJ10sZGl2XCIpLFxuICApO1xuXG4gIGxldCBiZXN0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBsZXQgYmVzdFNjb3JlID0gLTE7XG4gIGxldCBiZXN0QXJlYSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGNhbmRpZGF0ZS5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xuICAgIGlmICghaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUoY2FuZGlkYXRlKSkgY29udGludWU7XG5cbiAgICBjb25zdCBsYWJlbHMgPSBjb2RleFBwU2V0dGluZ3NMYWJlbHNGcm9tKGNhbmRpZGF0ZSk7XG4gICAgY29uc3Qgc2NvcmUgPSBjb2RleFBwU2V0dGluZ3NMYWJlbFNjb3JlKGxhYmVscyk7XG4gICAgY29uc3QgcmVjdCA9IGNhbmRpZGF0ZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBhcmVhID0gcmVjdC53aWR0aCAqIHJlY3QuaGVpZ2h0O1xuICAgIGNvbnN0IHdlaWdodGVkID0gc2NvcmUuY29yZSAqIDEwMCArIHNjb3JlLnRvdGFsO1xuXG4gICAgaWYgKHdlaWdodGVkID4gYmVzdFNjb3JlIHx8ICh3ZWlnaHRlZCA9PT0gYmVzdFNjb3JlICYmIGFyZWEgPCBiZXN0QXJlYSkpIHtcbiAgICAgIGJlc3QgPSBjYW5kaWRhdGU7XG4gICAgICBiZXN0U2NvcmUgPSB3ZWlnaHRlZDtcbiAgICAgIGJlc3RBcmVhID0gYXJlYTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYmVzdDtcbn1cblxuY29uc3QgRk9SQklEREVOX1NFVFRJTkdTX1NJREVCQVJfU0VMRUNUT1IgPSBbXG4gIFwiW2RhdGEtY29tcG9zZXItb3ZlcmxheS1mbG9hdGluZy11aT0ndHJ1ZSddXCIsXG4gIFwiW2RhdGEtY29kZXhwcC1zbGFzaC1tZW51PSd0cnVlJ11cIixcbiAgXCJbZGF0YS1jb2RleHBwLW92ZXJsYXktbm9pc2U9J3RydWUnXVwiLFxuICBcIi5jb21wb3Nlci1ob21lLXRvcC1tZW51XCIsXG4gIFwiLnZlcnRpY2FsLXNjcm9sbC1mYWRlLW1hc2tcIixcbiAgXCJbY2xhc3MqPSdbY29udGFpbmVyLW5hbWU6aG9tZS1tYWluLWNvbnRlbnRdJ11cIixcbl0uam9pbihcIixcIik7XG5cbmZ1bmN0aW9uIGlzRm9yYmlkZGVuU2V0dGluZ3NTaWRlYmFyU3VyZmFjZShub2RlOiBFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuICBpZiAoIW5vZGUpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgZWwgPSBub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgPyBub2RlIDogbm9kZS5wYXJlbnRFbGVtZW50O1xuICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XG4gIGlmIChlbC5jbG9zZXN0KEZPUkJJRERFTl9TRVRUSU5HU19TSURFQkFSX1NFTEVDVE9SKSkgcmV0dXJuIHRydWU7XG4gIGlmIChlbC5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtbGlzdC1uYXZpZ2F0aW9uLWl0ZW09J3RydWUnXSwgW2NtZGstaXRlbV1cIikpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKGVsOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuICBjb25zdCByZWN0ID0gY29kZXhQcFZpc2libGVCb3goZWwpO1xuICBpZiAoIXJlY3QpIHJldHVybiBmYWxzZTtcblxuICAvLyBDdXJyZW50IENvZGV4IFNldHRpbmdzIHNpZGViYXI6IGxlZnQgY29sdW1uLCBub3QgdGhlIG1haW4gY29udGVudCBwYW5lbC5cbiAgaWYgKHJlY3Qud2lkdGggPCAxMjAgfHwgcmVjdC53aWR0aCA+IDYyMCkgcmV0dXJuIGZhbHNlO1xuICBpZiAocmVjdC5oZWlnaHQgPCA4MCkgcmV0dXJuIGZhbHNlO1xuICBpZiAocmVjdC5sZWZ0ID4gd2luZG93LmlubmVyV2lkdGggKiAwLjY1KSByZXR1cm4gZmFsc2U7XG5cbiAgY29uc3QgbGFiZWxzID0gY29kZXhQcFNldHRpbmdzTGFiZWxzRnJvbShlbCk7XG4gIGlmIChoYXNNYWluQXBwU2lkZWJhclNpZ25hbHMobGFiZWxzKSAmJiAhaGFzQ29kZXhQcFNldHRpbmdzT25seVNpZ25hbChsYWJlbHMpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGlzQ29kZXhQcFNldHRpbmdzTGFiZWxTZXQobGFiZWxzKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlTWlzcGxhY2VkU2V0dGluZ3NHcm91cHMoKTogdm9pZCB7XG4gIGNvbnN0IGdyb3VwcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgIFwiW2RhdGEtY29kZXhwcD0nbmF2LWdyb3VwJ10sIFtkYXRhLWNvZGV4cHA9J3BhZ2VzLWdyb3VwJ10sIFtkYXRhLWNvZGV4cHA9J25hdGl2ZS1uYXYtaGVhZGVyJ11cIixcbiAgKTtcbiAgZm9yIChjb25zdCBncm91cCBvZiBBcnJheS5mcm9tKGdyb3VwcykpIHtcbiAgICBpZiAoaXNDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwUGxhY2VtZW50VmFsaWQoZ3JvdXApKSBjb250aW51ZTtcbiAgICByZXNldENvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXBTdGF0ZShncm91cCk7XG4gICAgZ3JvdXAucmVtb3ZlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwUGxhY2VtZW50VmFsaWQoZ3JvdXA6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gIGlmIChpc0ZvcmJpZGRlblNldHRpbmdzU2lkZWJhclN1cmZhY2UoZ3JvdXApKSByZXR1cm4gZmFsc2U7XG5cbiAgbGV0IG5vZGUgPSBncm91cC5wYXJlbnRFbGVtZW50O1xuICBmb3IgKGxldCBkZXB0aCA9IDA7IG5vZGUgJiYgZGVwdGggPCA0OyBkZXB0aCsrKSB7XG4gICAgaWYgKGlzRm9yYmlkZGVuU2V0dGluZ3NTaWRlYmFyU3VyZmFjZShub2RlKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShub2RlKSkgcmV0dXJuIHRydWU7XG4gICAgbm9kZSA9IG5vZGUucGFyZW50RWxlbWVudDtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gcmVzZXRDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwU3RhdGUoZ3JvdXA6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGlmIChzdGF0ZS5uYXZHcm91cCA9PT0gZ3JvdXAgfHwgKHN0YXRlLm5hdkdyb3VwICYmIGdyb3VwLmNvbnRhaW5zKHN0YXRlLm5hdkdyb3VwKSkpIHtcbiAgICBzdGF0ZS5uYXZHcm91cCA9IG51bGw7XG4gICAgc3RhdGUubmF2QnV0dG9ucyA9IG51bGw7XG4gICAgc3RhdGUuY29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbiA9IG51bGw7XG4gIH1cbiAgaWYgKHN0YXRlLnBhZ2VzR3JvdXAgPT09IGdyb3VwIHx8IChzdGF0ZS5wYWdlc0dyb3VwICYmIGdyb3VwLmNvbnRhaW5zKHN0YXRlLnBhZ2VzR3JvdXApKSkge1xuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xuICAgIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBudWxsO1xuICAgIGZvciAoY29uc3QgcCBvZiBzdGF0ZS5wYWdlcy52YWx1ZXMoKSkgcC5uYXZCdXR0b24gPSBudWxsO1xuICB9XG4gIGlmIChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPT09IGdyb3VwIHx8IChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgJiYgZ3JvdXAuY29udGFpbnMoc3RhdGUubmF0aXZlTmF2SGVhZGVyKSkpIHtcbiAgICBzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPSBudWxsO1xuICB9XG4gIGlmIChzdGF0ZS5zaWRlYmFyUm9vdCAmJiBzdGF0ZS5zaWRlYmFyUm9vdC5jb250YWlucyhncm91cCkpIHtcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZENvbnRlbnRBcmVhKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgaWYgKCFzaWRlYmFyKSByZXR1cm4gbnVsbDtcbiAgbGV0IHBhcmVudCA9IHNpZGViYXIucGFyZW50RWxlbWVudDtcbiAgd2hpbGUgKHBhcmVudCkge1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShwYXJlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcbiAgICAgIGlmIChjaGlsZCA9PT0gc2lkZWJhciB8fCBjaGlsZC5jb250YWlucyhzaWRlYmFyKSkgY29udGludWU7XG4gICAgICBjb25zdCByID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAoci53aWR0aCA+IDMwMCAmJiByLmhlaWdodCA+IDIwMCkgcmV0dXJuIGNoaWxkO1xuICAgIH1cbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbWF5YmVEdW1wRG9tKCk6IHZvaWQge1xuICB0cnkge1xuICAgIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgICBpZiAoc2lkZWJhciAmJiAhc3RhdGUuc2lkZWJhckR1bXBlZCkge1xuICAgICAgc3RhdGUuc2lkZWJhckR1bXBlZCA9IHRydWU7XG4gICAgICBjb25zdCBzYlJvb3QgPSBzaWRlYmFyLnBhcmVudEVsZW1lbnQgPz8gc2lkZWJhcjtcbiAgICAgIHBsb2coYGNvZGV4IHNpZGViYXIgSFRNTGAsIHNiUm9vdC5vdXRlckhUTUwuc2xpY2UoMCwgMzIwMDApKTtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xuICAgIGlmICghY29udGVudCkge1xuICAgICAgaWYgKHN0YXRlLmZpbmdlcnByaW50ICE9PSBsb2NhdGlvbi5ocmVmKSB7XG4gICAgICAgIHN0YXRlLmZpbmdlcnByaW50ID0gbG9jYXRpb24uaHJlZjtcbiAgICAgICAgcGxvZyhcImRvbSBwcm9iZSAobm8gY29udGVudClcIiwge1xuICAgICAgICAgIHVybDogbG9jYXRpb24uaHJlZixcbiAgICAgICAgICBzaWRlYmFyOiBzaWRlYmFyID8gZGVzY3JpYmUoc2lkZWJhcikgOiBudWxsLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHBhbmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XG4gICAgICBpZiAoY2hpbGQuZGF0YXNldC5jb2RleHBwID09PSBcInR3ZWFrcy1wYW5lbFwiKSBjb250aW51ZTtcbiAgICAgIGlmIChjaGlsZC5zdHlsZS5kaXNwbGF5ID09PSBcIm5vbmVcIikgY29udGludWU7XG4gICAgICBwYW5lbCA9IGNoaWxkO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZU5hdiA9IHNpZGViYXJcbiAgICAgID8gQXJyYXkuZnJvbShzaWRlYmFyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiYnV0dG9uLCBhXCIpKS5maW5kKFxuICAgICAgICAgIChiKSA9PlxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiIHx8XG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImRhdGEtYWN0aXZlXCIpID09PSBcInRydWVcIiB8fFxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLXNlbGVjdGVkXCIpID09PSBcInRydWVcIiB8fFxuICAgICAgICAgICAgYi5jbGFzc0xpc3QuY29udGFpbnMoXCJhY3RpdmVcIiksXG4gICAgICAgIClcbiAgICAgIDogbnVsbDtcbiAgICBjb25zdCBoZWFkaW5nID0gcGFuZWw/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgXCJoMSwgaDIsIGgzLCBbY2xhc3MqPSdoZWFkaW5nJ11cIixcbiAgICApO1xuICAgIGNvbnN0IGZpbmdlcnByaW50ID0gYCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudCA/PyBcIlwifXwke2hlYWRpbmc/LnRleHRDb250ZW50ID8/IFwiXCJ9fCR7cGFuZWw/LmNoaWxkcmVuLmxlbmd0aCA/PyAwfWA7XG4gICAgaWYgKHN0YXRlLmZpbmdlcnByaW50ID09PSBmaW5nZXJwcmludCkgcmV0dXJuO1xuICAgIHN0YXRlLmZpbmdlcnByaW50ID0gZmluZ2VycHJpbnQ7XG4gICAgcGxvZyhcImRvbSBwcm9iZVwiLCB7XG4gICAgICB1cmw6IGxvY2F0aW9uLmhyZWYsXG4gICAgICBhY3RpdmVOYXY6IGFjdGl2ZU5hdj8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxuICAgICAgaGVhZGluZzogaGVhZGluZz8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxuICAgICAgY29udGVudDogZGVzY3JpYmUoY29udGVudCksXG4gICAgfSk7XG4gICAgaWYgKHBhbmVsKSB7XG4gICAgICBjb25zdCBodG1sID0gcGFuZWwub3V0ZXJIVE1MO1xuICAgICAgcGxvZyhcbiAgICAgICAgYGNvZGV4IHBhbmVsIEhUTUwgKCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IFwiP1wifSlgLFxuICAgICAgICBodG1sLnNsaWNlKDAsIDMyMDAwKSxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgcGxvZyhcImRvbSBwcm9iZSBmYWlsZWRcIiwgU3RyaW5nKGUpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkZXNjcmliZShlbDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIHJldHVybiB7XG4gICAgdGFnOiBlbC50YWdOYW1lLFxuICAgIGNsczogZWwuY2xhc3NOYW1lLnNsaWNlKDAsIDEyMCksXG4gICAgaWQ6IGVsLmlkIHx8IHVuZGVmaW5lZCxcbiAgICBjaGlsZHJlbjogZWwuY2hpbGRyZW4ubGVuZ3RoLFxuICAgIHJlY3Q6ICgoKSA9PiB7XG4gICAgICBjb25zdCByID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICByZXR1cm4geyB3OiBNYXRoLnJvdW5kKHIud2lkdGgpLCBoOiBNYXRoLnJvdW5kKHIuaGVpZ2h0KSB9O1xuICAgIH0pKCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHR3ZWFrc1BhdGgoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICAod2luZG93IGFzIHVua25vd24gYXMgeyBfX2NvZGV4cHBfdHdlYWtzX2Rpcl9fPzogc3RyaW5nIH0pLl9fY29kZXhwcF90d2Vha3NfZGlyX18gPz9cbiAgICBcIjx1c2VyIGRpcj4vdHdlYWtzXCJcbiAgKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR3ZWFrTWFuaWZlc3QgfSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9UV0VBS19TVE9SRV9JTkRFWF9VUkwgPVxuICBcImh0dHBzOi8vYi1ubmV0dC5naXRodWIuaW8vY29kZXgtcGx1c3BsdXMvc3RvcmUvaW5kZXguanNvblwiO1xuZXhwb3J0IGNvbnN0IFRXRUFLX1NUT1JFX1JFVklFV19JU1NVRV9VUkwgPVxuICBcImh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXdcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUd2Vha1N0b3JlUmVnaXN0cnkge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgZW50cmllczogVHdlYWtTdG9yZUVudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZUVudHJ5IHtcbiAgaWQ6IHN0cmluZztcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gIHJlcG86IHN0cmluZztcbiAgYXBwcm92ZWRDb21taXRTaGE6IHN0cmluZztcbiAgYXBwcm92ZWRBdDogc3RyaW5nO1xuICBhcHByb3ZlZEJ5OiBzdHJpbmc7XG4gIHBsYXRmb3Jtcz86IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdO1xuICByZWxlYXNlVXJsPzogc3RyaW5nO1xuICByZXZpZXdVcmw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFR3ZWFrU3RvcmVQbGF0Zm9ybSA9IFwiZGFyd2luXCIgfCBcIndpbjMyXCIgfCBcImxpbnV4XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uIHtcbiAgcmVwbzogc3RyaW5nO1xuICBkZWZhdWx0QnJhbmNoOiBzdHJpbmc7XG4gIGNvbW1pdFNoYTogc3RyaW5nO1xuICBjb21taXRVcmw6IHN0cmluZztcbiAgbWFuaWZlc3Q/OiB7XG4gICAgaWQ/OiBzdHJpbmc7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICB2ZXJzaW9uPzogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICAgIGljb25Vcmw/OiBzdHJpbmc7XG4gIH07XG59XG5cbmNvbnN0IEdJVEhVQl9SRVBPX1JFID0gL15bQS1aYS16MC05Xy4tXStcXC9bQS1aYS16MC05Xy4tXSskLztcbmNvbnN0IEZVTExfU0hBX1JFID0gL15bYS1mMC05XXs0MH0kL2k7XG5jb25zdCBWRVJTSU9OX1JFID0gL152PyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlstK10uKik/JC9pO1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplR2l0SHViUmVwbyhpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgcmF3ID0gaW5wdXQudHJpbSgpO1xuICBpZiAoIXJhdykgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gaXMgcmVxdWlyZWRcIik7XG5cbiAgY29uc3Qgc3NoID0gL15naXRAZ2l0aHViXFwuY29tOihbXi9dK1xcL1teL10rPykoPzpcXC5naXQpPyQvaS5leGVjKHJhdyk7XG4gIGlmIChzc2gpIHJldHVybiBub3JtYWxpemVSZXBvUGFydChzc2hbMV0pO1xuXG4gIGlmICgvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHJhdykpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhdyk7XG4gICAgaWYgKHVybC5ob3N0bmFtZSAhPT0gXCJnaXRodWIuY29tXCIpIHRocm93IG5ldyBFcnJvcihcIk9ubHkgZ2l0aHViLmNvbSByZXBvc2l0b3JpZXMgYXJlIHN1cHBvcnRlZFwiKTtcbiAgICBjb25zdCBwYXJ0cyA9IHVybC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCBcIlwiKS5zcGxpdChcIi9cIik7XG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8IDIpIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiByZXBvIFVSTCBtdXN0IGluY2x1ZGUgb3duZXIgYW5kIHJlcG9zaXRvcnlcIik7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZVJlcG9QYXJ0KGAke3BhcnRzWzBdfS8ke3BhcnRzWzFdfWApO1xuICB9XG5cbiAgcmV0dXJuIG5vcm1hbGl6ZVJlcG9QYXJ0KHJhdyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVTdG9yZVJlZ2lzdHJ5KGlucHV0OiB1bmtub3duKTogVHdlYWtTdG9yZVJlZ2lzdHJ5IHtcbiAgY29uc3QgcmVnaXN0cnkgPSBpbnB1dCBhcyBQYXJ0aWFsPFR3ZWFrU3RvcmVSZWdpc3RyeT4gfCBudWxsO1xuICBpZiAoIXJlZ2lzdHJ5IHx8IHJlZ2lzdHJ5LnNjaGVtYVZlcnNpb24gIT09IDEgfHwgIUFycmF5LmlzQXJyYXkocmVnaXN0cnkuZW50cmllcykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnN1cHBvcnRlZCB0d2VhayBzdG9yZSByZWdpc3RyeVwiKTtcbiAgfVxuICBjb25zdCBlbnRyaWVzID0gcmVnaXN0cnkuZW50cmllcy5tYXAobm9ybWFsaXplU3RvcmVFbnRyeSk7XG4gIGVudHJpZXMuc29ydCgoYSwgYikgPT4gYS5tYW5pZmVzdC5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tYW5pZmVzdC5uYW1lKSk7XG4gIHJldHVybiB7XG4gICAgc2NoZW1hVmVyc2lvbjogMSxcbiAgICBnZW5lcmF0ZWRBdDogdHlwZW9mIHJlZ2lzdHJ5LmdlbmVyYXRlZEF0ID09PSBcInN0cmluZ1wiID8gcmVnaXN0cnkuZ2VuZXJhdGVkQXQgOiB1bmRlZmluZWQsXG4gICAgZW50cmllcyxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNodWZmbGVTdG9yZUVudHJpZXM8VD4oXG4gIGVudHJpZXM6IHJlYWRvbmx5IFRbXSxcbiAgcmFuZG9tSW5kZXg6IChleGNsdXNpdmVNYXg6IG51bWJlcikgPT4gbnVtYmVyID0gKGV4Y2x1c2l2ZU1heCkgPT4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZXhjbHVzaXZlTWF4KSxcbik6IFRbXSB7XG4gIGNvbnN0IHNodWZmbGVkID0gWy4uLmVudHJpZXNdO1xuICBmb3IgKGxldCBpID0gc2h1ZmZsZWQubGVuZ3RoIC0gMTsgaSA+IDA7IGkgLT0gMSkge1xuICAgIGNvbnN0IGogPSByYW5kb21JbmRleChpICsgMSk7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGopIHx8IGogPCAwIHx8IGogPiBpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHNodWZmbGUgcmFuZG9tSW5kZXggcmV0dXJuZWQgJHtqfTsgZXhwZWN0ZWQgYW4gaW50ZWdlciBmcm9tIDAgdG8gJHtpfWApO1xuICAgIH1cbiAgICBbc2h1ZmZsZWRbaV0sIHNodWZmbGVkW2pdXSA9IFtzaHVmZmxlZFtqXSwgc2h1ZmZsZWRbaV1dO1xuICB9XG4gIHJldHVybiBzaHVmZmxlZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVN0b3JlRW50cnkoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlRW50cnkge1xuICBjb25zdCBlbnRyeSA9IGlucHV0IGFzIFBhcnRpYWw8VHdlYWtTdG9yZUVudHJ5PiB8IG51bGw7XG4gIGlmICghZW50cnkgfHwgdHlwZW9mIGVudHJ5ICE9PSBcIm9iamVjdFwiKSB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHR3ZWFrIHN0b3JlIGVudHJ5XCIpO1xuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhTdHJpbmcoZW50cnkucmVwbyA/PyBlbnRyeS5tYW5pZmVzdD8uZ2l0aHViUmVwbyA/PyBcIlwiKSk7XG4gIGNvbnN0IG1hbmlmZXN0ID0gZW50cnkubWFuaWZlc3QgYXMgVHdlYWtNYW5pZmVzdCB8IHVuZGVmaW5lZDtcbiAgaWYgKCFtYW5pZmVzdD8uaWQgfHwgIW1hbmlmZXN0Lm5hbWUgfHwgIW1hbmlmZXN0LnZlcnNpb24pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5IGZvciAke3JlcG99IGlzIG1pc3NpbmcgbWFuaWZlc3QgZmllbGRzYCk7XG4gIH1cbiAgaWYgKG5vcm1hbGl6ZUdpdEh1YlJlcG8obWFuaWZlc3QuZ2l0aHViUmVwbykgIT09IHJlcG8pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IHJlcG8gZG9lcyBub3QgbWF0Y2ggbWFuaWZlc3QgZ2l0aHViUmVwb2ApO1xuICB9XG4gIGlmICghaXNGdWxsQ29tbWl0U2hhKFN0cmluZyhlbnRyeS5hcHByb3ZlZENvbW1pdFNoYSA/PyBcIlwiKSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IG11c3QgcGluIGEgZnVsbCBhcHByb3ZlZCBjb21taXQgU0hBYCk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBpZDogbWFuaWZlc3QuaWQsXG4gICAgbWFuaWZlc3QsXG4gICAgcmVwbyxcbiAgICBhcHByb3ZlZENvbW1pdFNoYTogU3RyaW5nKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhKSxcbiAgICBhcHByb3ZlZEF0OiB0eXBlb2YgZW50cnkuYXBwcm92ZWRBdCA9PT0gXCJzdHJpbmdcIiA/IGVudHJ5LmFwcHJvdmVkQXQgOiBcIlwiLFxuICAgIGFwcHJvdmVkQnk6IHR5cGVvZiBlbnRyeS5hcHByb3ZlZEJ5ID09PSBcInN0cmluZ1wiID8gZW50cnkuYXBwcm92ZWRCeSA6IFwiXCIsXG4gICAgcGxhdGZvcm1zOiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcygoZW50cnkgYXMgeyBwbGF0Zm9ybXM/OiB1bmtub3duIH0pLnBsYXRmb3JtcyksXG4gICAgcmVsZWFzZVVybDogb3B0aW9uYWxHaXRodWJVcmwoZW50cnkucmVsZWFzZVVybCksXG4gICAgcmV2aWV3VXJsOiBvcHRpb25hbEdpdGh1YlVybChlbnRyeS5yZXZpZXdVcmwpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RvcmVBcmNoaXZlVXJsKGVudHJ5OiBUd2Vha1N0b3JlRW50cnkpOiBzdHJpbmcge1xuICBpZiAoIWlzRnVsbENvbW1pdFNoYShlbnRyeS5hcHByb3ZlZENvbW1pdFNoYSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7ZW50cnkuaWR9IGlzIG5vdCBwaW5uZWQgdG8gYSBmdWxsIGNvbW1pdCBTSEFgKTtcbiAgfVxuICByZXR1cm4gYGh0dHBzOi8vY29kZWxvYWQuZ2l0aHViLmNvbS8ke2VudHJ5LnJlcG99L3Rhci5nei8ke2VudHJ5LmFwcHJvdmVkQ29tbWl0U2hhfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0b3JlVXBkYXRlQXZhaWxhYmxlKGluc3RhbGxlZFZlcnNpb246IHN0cmluZywgYXBwcm92ZWRWZXJzaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgaW5zdGFsbGVkID0gVkVSU0lPTl9SRS5leGVjKGluc3RhbGxlZFZlcnNpb24udHJpbSgpKTtcbiAgY29uc3QgYXBwcm92ZWQgPSBWRVJTSU9OX1JFLmV4ZWMoYXBwcm92ZWRWZXJzaW9uLnRyaW0oKSk7XG4gIGlmICghaW5zdGFsbGVkIHx8ICFhcHByb3ZlZCkgcmV0dXJuIGZhbHNlO1xuICBmb3IgKGxldCBpID0gMTsgaSA8PSAzOyBpKyspIHtcbiAgICBjb25zdCBkaWZmID0gTnVtYmVyKGFwcHJvdmVkW2ldKSAtIE51bWJlcihpbnN0YWxsZWRbaV0pO1xuICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZiA+IDA7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRUd2Vha1B1Ymxpc2hJc3N1ZVVybChzdWJtaXNzaW9uOiBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb24pOiBzdHJpbmcge1xuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhzdWJtaXNzaW9uLnJlcG8pO1xuICBpZiAoIWlzRnVsbENvbW1pdFNoYShzdWJtaXNzaW9uLmNvbW1pdFNoYSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJTdWJtaXNzaW9uIG11c3QgaW5jbHVkZSB0aGUgZnVsbCBjb21taXQgU0hBIHRvIHJldmlld1wiKTtcbiAgfVxuICBjb25zdCB0aXRsZSA9IGBUd2VhayBzdG9yZSByZXZpZXc6ICR7cmVwb31gO1xuICBjb25zdCBib2R5ID0gW1xuICAgIFwiIyMgVHdlYWsgcmVwb1wiLFxuICAgIGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfWAsXG4gICAgXCJcIixcbiAgICBcIiMjIENvbW1pdCB0byByZXZpZXdcIixcbiAgICBzdWJtaXNzaW9uLmNvbW1pdFNoYSxcbiAgICBzdWJtaXNzaW9uLmNvbW1pdFVybCxcbiAgICBcIlwiLFxuICAgIFwiRG8gbm90IGFwcHJvdmUgYSBkaWZmZXJlbnQgY29tbWl0LiBJZiB0aGUgYXV0aG9yIHB1c2hlcyBjaGFuZ2VzLCBhc2sgdGhlbSB0byByZXN1Ym1pdC5cIixcbiAgICBcIlwiLFxuICAgIFwiIyMgTWFuaWZlc3RcIixcbiAgICBgLSBpZDogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py5pZCA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBgLSBuYW1lOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/Lm5hbWUgPz8gXCIobm90IGRldGVjdGVkKVwifWAsXG4gICAgYC0gdmVyc2lvbjogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py52ZXJzaW9uID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxuICAgIGAtIGRlc2NyaXB0aW9uOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/LmRlc2NyaXB0aW9uID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxuICAgIGAtIGljb25Vcmw6ICR7c3VibWlzc2lvbi5tYW5pZmVzdD8uaWNvblVybCA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBcIlwiLFxuICAgIFwiIyMgQWRtaW4gY2hlY2tsaXN0XCIsXG4gICAgXCItIFsgXSBtYW5pZmVzdC5qc29uIGlzIHZhbGlkXCIsXG4gICAgXCItIFsgXSBtYW5pZmVzdC5pY29uVXJsIGlzIHVzYWJsZSBhcyB0aGUgc3RvcmUgaWNvblwiLFxuICAgIFwiLSBbIF0gc291cmNlIHdhcyByZXZpZXdlZCBhdCB0aGUgZXhhY3QgY29tbWl0IGFib3ZlXCIsXG4gICAgXCItIFsgXSBgc3RvcmUvaW5kZXguanNvbmAgZW50cnkgcGlucyBgYXBwcm92ZWRDb21taXRTaGFgIHRvIHRoZSBleGFjdCBjb21taXQgYWJvdmVcIixcbiAgXS5qb2luKFwiXFxuXCIpO1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKFRXRUFLX1NUT1JFX1JFVklFV19JU1NVRV9VUkwpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInRlbXBsYXRlXCIsIFwidHdlYWstc3RvcmUtcmV2aWV3Lm1kXCIpO1xuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInRpdGxlXCIsIHRpdGxlKTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJib2R5XCIsIGJvZHkpO1xuICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0Z1bGxDb21taXRTaGEodmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gRlVMTF9TSEFfUkUudGVzdCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVJlcG9QYXJ0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCByZXBvID0gdmFsdWUudHJpbSgpLnJlcGxhY2UoL1xcLmdpdCQvaSwgXCJcIikucmVwbGFjZSgvXlxcLyt8XFwvKyQvZywgXCJcIik7XG4gIGlmICghR0lUSFVCX1JFUE9fUkUudGVzdChyZXBvKSkgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gbXVzdCBiZSBpbiBvd25lci9yZXBvIGZvcm1cIik7XG4gIHJldHVybiByZXBvO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcyhpbnB1dDogdW5rbm93bik6IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdIHwgdW5kZWZpbmVkIHtcbiAgaWYgKGlucHV0ID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWQ7XG4gIGlmICghQXJyYXkuaXNBcnJheShpbnB1dCkpIHRocm93IG5ldyBFcnJvcihcIlN0b3JlIGVudHJ5IHBsYXRmb3JtcyBtdXN0IGJlIGFuIGFycmF5XCIpO1xuICBjb25zdCBhbGxvd2VkID0gbmV3IFNldDxUd2Vha1N0b3JlUGxhdGZvcm0+KFtcImRhcndpblwiLCBcIndpbjMyXCIsIFwibGludXhcIl0pO1xuICBjb25zdCBwbGF0Zm9ybXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoaW5wdXQubWFwKCh2YWx1ZSkgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIgfHwgIWFsbG93ZWQuaGFzKHZhbHVlIGFzIFR3ZWFrU3RvcmVQbGF0Zm9ybSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgc3RvcmUgcGxhdGZvcm06ICR7U3RyaW5nKHZhbHVlKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlIGFzIFR3ZWFrU3RvcmVQbGF0Zm9ybTtcbiAgfSkpKTtcbiAgcmV0dXJuIHBsYXRmb3Jtcy5sZW5ndGggPiAwID8gcGxhdGZvcm1zIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBvcHRpb25hbEdpdGh1YlVybCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIgfHwgIXZhbHVlLnRyaW0oKSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7XG4gIGlmICh1cmwucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgfHwgdXJsLmhvc3RuYW1lICE9PSBcImdpdGh1Yi5jb21cIikgcmV0dXJuIHVuZGVmaW5lZDtcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xufVxuIiwgIi8qKlxuICogUmVuZGVyZXItc2lkZSB0d2VhayBob3N0LiBXZTpcbiAqICAgMS4gQXNrIG1haW4gZm9yIHRoZSB0d2VhayBsaXN0ICh3aXRoIHJlc29sdmVkIGVudHJ5IHBhdGgpLlxuICogICAyLiBGb3IgZWFjaCByZW5kZXJlci1zY29wZWQgKG9yIFwiYm90aFwiKSB0d2VhaywgZmV0Y2ggaXRzIHNvdXJjZSB2aWEgSVBDXG4gKiAgICAgIGFuZCBleGVjdXRlIGl0IGFzIGEgQ29tbW9uSlMtc2hhcGVkIGZ1bmN0aW9uLlxuICogICAzLiBQcm92aWRlIGl0IHRoZSByZW5kZXJlciBoYWxmIG9mIHRoZSBBUEkuXG4gKlxuICogQ29kZXggcnVucyB0aGUgcmVuZGVyZXIgd2l0aCBzYW5kYm94OiB0cnVlLCBzbyBOb2RlJ3MgYHJlcXVpcmUoKWAgaXNcbiAqIHJlc3RyaWN0ZWQgdG8gYSB0aW55IHdoaXRlbGlzdCAoZWxlY3Ryb24gKyBhIGZldyBwb2x5ZmlsbHMpLiBUaGF0IG1lYW5zIHdlXG4gKiBjYW5ub3QgYHJlcXVpcmUoKWAgYXJiaXRyYXJ5IHR3ZWFrIGZpbGVzIGZyb20gZGlzay4gSW5zdGVhZCB3ZSBwdWxsIHRoZVxuICogc291cmNlIHN0cmluZyBmcm9tIG1haW4gYW5kIGV2YWx1YXRlIGl0IHdpdGggYG5ldyBGdW5jdGlvbmAgaW5zaWRlIHRoZVxuICogcHJlbG9hZCBjb250ZXh0LiBUd2VhayBhdXRob3JzIHdobyBuZWVkIG5wbSBkZXBzIG11c3QgYnVuZGxlIHRoZW0gaW4uXG4gKi9cblxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdGlvbiwgcmVnaXN0ZXJQYWdlLCBjbGVhclNlY3Rpb25zLCBzZXRMaXN0ZWRUd2Vha3MgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgZmliZXJGb3JOb2RlIH0gZnJvbSBcIi4vcmVhY3QtaG9va1wiO1xuaW1wb3J0IHR5cGUge1xuICBDb2RleENkcFN0YXR1cyxcbiAgQ29kZXhDZHBUYXJnZXQsXG4gIENvZGV4UnVudGltZUNhcGFiaWxpdGllcyxcbiAgQ29kZXhSdW50aW1lSW5mbyxcbiAgQ29kZXhWaWV3UmVmLFxuICBDb2RleFdpbmRvd1JlZixcbiAgTmF0aXZlSGVscGVyTGF1bmNoT3B0aW9ucyxcbiAgTmF0aXZlSGVscGVyUmVmLFxuICBOYXRpdmVNb2R1bGVLaW5kLFxuICBOYXRpdmVNb2R1bGVMb2FkT3B0aW9ucyxcbiAgTmF0aXZlTW9kdWxlUmVmLFxuICBOYXRpdmVQYW5lbENyZWF0ZU9wdGlvbnMsXG4gIE5hdGl2ZVBhbmVsUmVmLFxuICBOYXRpdmVWaWV3QXR0YWNoT3B0aW9ucyxcbiAgTmF0aXZlVmlld1JlZixcbiAgVHdlYWtNYW5pZmVzdCxcbiAgVHdlYWtBcGksXG4gIFJlYWN0RmliZXJOb2RlLFxuICBUd2Vhayxcbn0gZnJvbSBcIkBjb2RleC1wbHVzcGx1cy9zZGtcIjtcblxuaW50ZXJmYWNlIExpc3RlZFR3ZWFrIHtcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gIGVudHJ5OiBzdHJpbmc7XG4gIGRpcjogc3RyaW5nO1xuICBlbnRyeUV4aXN0czogYm9vbGVhbjtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgdXBkYXRlOiB7XG4gICAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gICAgcmVwbzogc3RyaW5nO1xuICAgIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gICAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgICBsYXRlc3RUYWc6IHN0cmluZyB8IG51bGw7XG4gICAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XG4gICAgZXJyb3I/OiBzdHJpbmc7XG4gIH0gfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgVXNlclBhdGhzIHtcbiAgdXNlclJvb3Q6IHN0cmluZztcbiAgcnVudGltZURpcjogc3RyaW5nO1xuICB0d2Vha3NEaXI6IHN0cmluZztcbiAgbG9nRGlyOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBFbGVjdHJvbkJyaWRnZSB7XG4gIGdldEJ1aWxkRmxhdm9yPzogKCkgPT4gc3RyaW5nIHwgbnVsbDtcbiAgdXNlc093bEFwcFNoZWxsPzogKCkgPT4gYm9vbGVhbjtcbn1cblxuY29uc3QgbG9hZGVkID0gbmV3IE1hcDxzdHJpbmcsIHsgc3RvcD86ICgpID0+IHZvaWQgfT4oKTtcbmxldCBjYWNoZWRQYXRoczogVXNlclBhdGhzIHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFR3ZWFrSG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgdHdlYWtzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIikpIGFzIExpc3RlZFR3ZWFrW107XG4gIGNvbnN0IHBhdGhzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dXNlci1wYXRoc1wiKSkgYXMgVXNlclBhdGhzO1xuICBjYWNoZWRQYXRocyA9IHBhdGhzO1xuICAvLyBQdXNoIHRoZSBsaXN0IHRvIHRoZSBzZXR0aW5ncyBpbmplY3RvciBzbyB0aGUgVHdlYWtzIHBhZ2UgY2FuIHJlbmRlclxuICAvLyBjYXJkcyBldmVuIGJlZm9yZSBhbnkgdHdlYWsncyBzdGFydCgpIHJ1bnMgKGFuZCBmb3IgZGlzYWJsZWQgdHdlYWtzXG4gIC8vIHRoYXQgd2UgbmV2ZXIgbG9hZCkuXG4gIHNldExpc3RlZFR3ZWFrcyh0d2Vha3MpO1xuICAvLyBTdGFzaCBmb3IgdGhlIHNldHRpbmdzIGluamVjdG9yJ3MgZW1wdHktc3RhdGUgbWVzc2FnZS5cbiAgKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgX19jb2RleHBwX3R3ZWFrc19kaXJfXz86IHN0cmluZyB9KS5fX2NvZGV4cHBfdHdlYWtzX2Rpcl9fID1cbiAgICBwYXRocy50d2Vha3NEaXI7XG5cbiAgZm9yIChjb25zdCB0IG9mIHR3ZWFrcykge1xuICAgIGlmICh0Lm1hbmlmZXN0LnNjb3BlID09PSBcIm1haW5cIikgY29udGludWU7XG4gICAgaWYgKCF0LmVudHJ5RXhpc3RzKSBjb250aW51ZTtcbiAgICBpZiAoIXQuZW5hYmxlZCkgY29udGludWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGxvYWRUd2Vhayh0LCBwYXRocyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gdHdlYWsgbG9hZCBmYWlsZWQ6XCIsIHQubWFuaWZlc3QuaWQsIGUpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgaXBjUmVuZGVyZXIuc2VuZChcbiAgICAgICAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcbiAgICAgICAgICBcImVycm9yXCIsXG4gICAgICAgICAgXCJ0d2VhayBsb2FkIGZhaWxlZDogXCIgKyB0Lm1hbmlmZXN0LmlkICsgXCI6IFwiICsgU3RyaW5nKChlIGFzIEVycm9yKT8uc3RhY2sgPz8gZSksXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIHt9XG4gICAgfVxuICB9XG5cbiAgY29uc29sZS5pbmZvKFxuICAgIGBbY29kZXgtcGx1c3BsdXNdIHJlbmRlcmVyIGhvc3QgbG9hZGVkICR7bG9hZGVkLnNpemV9IHR3ZWFrKHMpOmAsXG4gICAgWy4uLmxvYWRlZC5rZXlzKCldLmpvaW4oXCIsIFwiKSB8fCBcIihub25lKVwiLFxuICApO1xuICBpcGNSZW5kZXJlci5zZW5kKFxuICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgIFwiaW5mb1wiLFxuICAgIGByZW5kZXJlciBob3N0IGxvYWRlZCAke2xvYWRlZC5zaXplfSB0d2VhayhzKTogJHtbLi4ubG9hZGVkLmtleXMoKV0uam9pbihcIiwgXCIpIHx8IFwiKG5vbmUpXCJ9YCxcbiAgKTtcbn1cblxuLyoqXG4gKiBTdG9wIGV2ZXJ5IHJlbmRlcmVyLXNjb3BlIHR3ZWFrIHNvIGEgc3Vic2VxdWVudCBgc3RhcnRUd2Vha0hvc3QoKWAgd2lsbFxuICogcmUtZXZhbHVhdGUgZnJlc2ggc291cmNlLiBNb2R1bGUgY2FjaGUgaXNuJ3QgcmVsZXZhbnQgc2luY2Ugd2UgZXZhbFxuICogc291cmNlIHN0cmluZ3MgZGlyZWN0bHkgXHUyMDE0IGVhY2ggbG9hZCBjcmVhdGVzIGEgZnJlc2ggc2NvcGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZWFyZG93blR3ZWFrSG9zdCgpOiB2b2lkIHtcbiAgZm9yIChjb25zdCBbaWQsIHRdIG9mIGxvYWRlZCkge1xuICAgIHRyeSB7XG4gICAgICB0LnN0b3A/LigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUud2FybihcIltjb2RleC1wbHVzcGx1c10gdHdlYWsgc3RvcCBmYWlsZWQ6XCIsIGlkLCBlKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXZpZXctZGlzcG9zZS10d2Vha1wiLCBpZCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1kaXNwb3NlLXR3ZWFrXCIsIGlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG4gIGxvYWRlZC5jbGVhcigpO1xuICBjbGVhclNlY3Rpb25zKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRUd2Vhayh0OiBMaXN0ZWRUd2VhaywgcGF0aHM6IFVzZXJQYXRocyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzb3VyY2UgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLXNvdXJjZVwiLFxuICAgIHQuZW50cnksXG4gICkpIGFzIHN0cmluZztcblxuICAvLyBFdmFsdWF0ZSBhcyBDSlMtc2hhcGVkOiBwcm92aWRlIG1vZHVsZS9leHBvcnRzL2FwaS4gVHdlYWsgY29kZSBtYXkgdXNlXG4gIC8vIGBtb2R1bGUuZXhwb3J0cyA9IHsgc3RhcnQsIHN0b3AgfWAgb3IgYGV4cG9ydHMuc3RhcnQgPSAuLi5gIG9yIHB1cmUgRVNNXG4gIC8vIGRlZmF1bHQgZXhwb3J0IHNoYXBlICh3ZSBhY2NlcHQgYm90aCkuXG4gIGNvbnN0IG1vZHVsZSA9IHsgZXhwb3J0czoge30gYXMgeyBkZWZhdWx0PzogVHdlYWsgfSAmIFR3ZWFrIH07XG4gIGNvbnN0IGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cztcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1pbXBsaWVkLWV2YWwsIG5vLW5ldy1mdW5jXG4gIGNvbnN0IGZuID0gbmV3IEZ1bmN0aW9uKFxuICAgIFwibW9kdWxlXCIsXG4gICAgXCJleHBvcnRzXCIsXG4gICAgXCJjb25zb2xlXCIsXG4gICAgYCR7c291cmNlfVxcbi8vIyBzb3VyY2VVUkw9Y29kZXhwcC10d2VhazovLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHQubWFuaWZlc3QuaWQpfS8ke2VuY29kZVVSSUNvbXBvbmVudCh0LmVudHJ5KX1gLFxuICApO1xuICBmbihtb2R1bGUsIGV4cG9ydHMsIGNvbnNvbGUpO1xuICBjb25zdCBtb2QgPSBtb2R1bGUuZXhwb3J0cyBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9ICYgVHdlYWs7XG4gIGNvbnN0IHR3ZWFrOiBUd2VhayA9IChtb2QgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSkuZGVmYXVsdCA/PyAobW9kIGFzIFR3ZWFrKTtcbiAgaWYgKHR5cGVvZiB0d2Vhaz8uc3RhcnQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgIHRocm93IG5ldyBFcnJvcihgdHdlYWsgJHt0Lm1hbmlmZXN0LmlkfSBoYXMgbm8gc3RhcnQoKWApO1xuICB9XG4gIGNvbnN0IGFwaSA9IG1ha2VSZW5kZXJlckFwaSh0Lm1hbmlmZXN0LCBwYXRocyk7XG4gIGF3YWl0IHR3ZWFrLnN0YXJ0KGFwaSk7XG4gIGxvYWRlZC5zZXQodC5tYW5pZmVzdC5pZCwgeyBzdG9wOiB0d2Vhay5zdG9wPy5iaW5kKHR3ZWFrKSB9KTtcbn1cblxuZnVuY3Rpb24gbWFrZVJlbmRlcmVyQXBpKG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LCBwYXRoczogVXNlclBhdGhzKTogVHdlYWtBcGkge1xuICBjb25zdCBpZCA9IG1hbmlmZXN0LmlkO1xuICBjb25zdCBsb2cgPSAobGV2ZWw6IFwiZGVidWdcIiB8IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIC4uLmE6IHVua25vd25bXSkgPT4ge1xuICAgIGNvbnN0IGNvbnNvbGVGbiA9XG4gICAgICBsZXZlbCA9PT0gXCJkZWJ1Z1wiID8gY29uc29sZS5kZWJ1Z1xuICAgICAgOiBsZXZlbCA9PT0gXCJ3YXJuXCIgPyBjb25zb2xlLndhcm5cbiAgICAgIDogbGV2ZWwgPT09IFwiZXJyb3JcIiA/IGNvbnNvbGUuZXJyb3JcbiAgICAgIDogY29uc29sZS5sb2c7XG4gICAgY29uc29sZUZuKGBbY29kZXgtcGx1c3BsdXNdWyR7aWR9XWAsIC4uLmEpO1xuICAgIC8vIEFsc28gbWlycm9yIHRvIG1haW4ncyBsb2cgZmlsZSBzbyB3ZSBjYW4gZGlhZ25vc2UgdHdlYWsgYmVoYXZpb3JcbiAgICAvLyB3aXRob3V0IGF0dGFjaGluZyBEZXZUb29scy4gU3RyaW5naWZ5IGVhY2ggYXJnIGRlZmVuc2l2ZWx5LlxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGEubWFwKCh2KSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIHY7XG4gICAgICAgIGlmICh2IGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiBgJHt2Lm5hbWV9OiAke3YubWVzc2FnZX1gO1xuICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHYpOyB9XG4gICAgICB9KTtcbiAgICAgIGlwY1JlbmRlcmVyLnNlbmQoXG4gICAgICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgICAgICBsZXZlbCxcbiAgICAgICAgYFt0d2VhayAke2lkfV0gJHtwYXJ0cy5qb2luKFwiIFwiKX1gLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIHN3YWxsb3cgXHUyMDE0IG5ldmVyIGxldCBsb2dnaW5nIGJyZWFrIGEgdHdlYWsgKi9cbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBtYW5pZmVzdCxcbiAgICBwcm9jZXNzOiBcInJlbmRlcmVyXCIsXG4gICAgbG9nOiB7XG4gICAgICBkZWJ1ZzogKC4uLmEpID0+IGxvZyhcImRlYnVnXCIsIC4uLmEpLFxuICAgICAgaW5mbzogKC4uLmEpID0+IGxvZyhcImluZm9cIiwgLi4uYSksXG4gICAgICB3YXJuOiAoLi4uYSkgPT4gbG9nKFwid2FyblwiLCAuLi5hKSxcbiAgICAgIGVycm9yOiAoLi4uYSkgPT4gbG9nKFwiZXJyb3JcIiwgLi4uYSksXG4gICAgfSxcbiAgICBzdG9yYWdlOiByZW5kZXJlclN0b3JhZ2UoaWQpLFxuICAgIHNldHRpbmdzOiB7XG4gICAgICByZWdpc3RlcjogKHMpID0+IHJlZ2lzdGVyU2VjdGlvbih7IC4uLnMsIGlkOiBgJHtpZH06JHtzLmlkfWAgfSksXG4gICAgICByZWdpc3RlclBhZ2U6IChwKSA9PlxuICAgICAgICByZWdpc3RlclBhZ2UoaWQsIG1hbmlmZXN0LCB7IC4uLnAsIGlkOiBgJHtpZH06JHtwLmlkfWAgfSksXG4gICAgfSxcbiAgICByZWFjdDoge1xuICAgICAgZ2V0RmliZXI6IChuKSA9PiBmaWJlckZvck5vZGUobikgYXMgUmVhY3RGaWJlck5vZGUgfCBudWxsLFxuICAgICAgZmluZE93bmVyQnlOYW1lOiAobiwgbmFtZSkgPT4ge1xuICAgICAgICBsZXQgZiA9IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGw7XG4gICAgICAgIHdoaWxlIChmKSB7XG4gICAgICAgICAgY29uc3QgdCA9IGYudHlwZSBhcyB7IGRpc3BsYXlOYW1lPzogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0gfCBudWxsO1xuICAgICAgICAgIGlmICh0ICYmICh0LmRpc3BsYXlOYW1lID09PSBuYW1lIHx8IHQubmFtZSA9PT0gbmFtZSkpIHJldHVybiBmO1xuICAgICAgICAgIGYgPSBmLnJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH0sXG4gICAgICB3YWl0Rm9yRWxlbWVudDogKHNlbCwgdGltZW91dE1zID0gNTAwMCkgPT5cbiAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xuICAgICAgICAgIGlmIChleGlzdGluZykgcmV0dXJuIHJlc29sdmUoZXhpc3RpbmcpO1xuICAgICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIHRpbWVvdXRNcztcbiAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgICBvYnMuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICByZXNvbHZlKGVsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoRGF0ZS5ub3coKSA+IGRlYWRsaW5lKSB7XG4gICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYHRpbWVvdXQgd2FpdGluZyBmb3IgJHtzZWx9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIH0pLFxuICAgIH0sXG4gICAgaXBjOiB7XG4gICAgICBvbjogKGMsIGgpID0+IHtcbiAgICAgICAgY29uc3Qgd3JhcHBlZCA9IChfZTogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiBoKC4uLmFyZ3MpO1xuICAgICAgICBpcGNSZW5kZXJlci5vbihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XG4gICAgICAgIHJldHVybiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XG4gICAgICB9LFxuICAgICAgc2VuZDogKGMsIC4uLmFyZ3MpID0+IGlwY1JlbmRlcmVyLnNlbmQoYGNvZGV4cHA6JHtpZH06JHtjfWAsIC4uLmFyZ3MpLFxuICAgICAgaW52b2tlOiA8VD4oYzogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShgY29kZXhwcDoke2lkfToke2N9YCwgLi4uYXJncykgYXMgUHJvbWlzZTxUPixcbiAgICB9LFxuICAgIGZzOiByZW5kZXJlckZzKGlkLCBwYXRocyksXG4gICAgY29kZXg6IHJlbmRlcmVyQ29kZXhBcGkoaWQpLFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlckNvZGV4QXBpKHR3ZWFrSWQ6IHN0cmluZyk6IE5vbk51bGxhYmxlPFR3ZWFrQXBpW1wiY29kZXhcIl0+IHtcbiAgcmV0dXJuIHtcbiAgICBydW50aW1lOiB7XG4gICAgICBnZXRJbmZvOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGluZm8gPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXJ1bnRpbWUtaW5mb1wiKSBhcyBDb2RleFJ1bnRpbWVJbmZvO1xuICAgICAgICBjb25zdCBicmlkZ2UgPSByZW5kZXJlckVsZWN0cm9uQnJpZGdlKCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uaW5mbyxcbiAgICAgICAgICBidWlsZEZsYXZvcjogYnJpZGdlPy5nZXRCdWlsZEZsYXZvcj8uKCkgPz8gaW5mby5idWlsZEZsYXZvcixcbiAgICAgICAgICB1c2VzT3dsQXBwU2hlbGw6IGJyaWRnZT8udXNlc093bEFwcFNoZWxsPy4oKSA/PyBpbmZvLnVzZXNPd2xBcHBTaGVsbCxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBnZXRDYXBhYmlsaXRpZXM6ICgpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtcnVudGltZS1jYXBhYmlsaXRpZXNcIikgYXMgUHJvbWlzZTxDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXM+LFxuICAgIH0sXG4gICAgd2luZG93czoge1xuICAgICAgY3JlYXRlOiAob3B0aW9ucykgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctY3JlYXRlXCIsIG9wdGlvbnMpIGFzIFByb21pc2U8Q29kZXhXaW5kb3dSZWY+LFxuICAgICAgZ2V0UHJpbWFyeTogKCkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctcHJpbWFyeVwiKSBhcyBQcm9taXNlPENvZGV4V2luZG93UmVmIHwgbnVsbD4sXG4gICAgICBmb2N1czogKHdpbmRvd0lkKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXdpbmRvdy1mb2N1c1wiLCB3aW5kb3dJZCkgYXMgUHJvbWlzZTxib29sZWFuPixcbiAgICAgIHNob3c6ICh3aW5kb3dJZCkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctc2hvd1wiLCB3aW5kb3dJZCkgYXMgUHJvbWlzZTxib29sZWFuPixcbiAgICB9LFxuICAgIHZpZXdzOiB7XG4gICAgICBjcmVhdGU6IGFzeW5jIChvcHRpb25zKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlZiA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgICBcImNvZGV4cHA6Y29kZXgtdmlldy1jcmVhdGVcIixcbiAgICAgICAgICB0d2Vha0lkLFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICkgYXMgeyBpZDogc3RyaW5nOyB3ZWJDb250ZW50c0lkOiBudW1iZXI7IHBhcmVudFdpbmRvd0lkOiBudW1iZXIgfCBudWxsIH07XG4gICAgICAgIHJldHVybiByZW5kZXJlckNvZGV4Vmlld1JlZih0d2Vha0lkLCByZWYuaWQsIHJlZi53ZWJDb250ZW50c0lkLCByZWYucGFyZW50V2luZG93SWQpO1xuICAgICAgfSxcbiAgICB9LFxuICAgIGNkcDoge1xuICAgICAgZ2V0U3RhdHVzOiAoKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LWNkcC1zdGF0dXNcIikgYXMgUHJvbWlzZTxDb2RleENkcFN0YXR1cz4sXG4gICAgICBsaXN0VGFyZ2V0czogKCkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC1jZHAtdGFyZ2V0c1wiKSBhcyBQcm9taXNlPENvZGV4Q2RwVGFyZ2V0W10+LFxuICAgIH0sXG4gICAgbmF0aXZlOiB7XG4gICAgICBsb2FkTW9kdWxlOiBhc3luYyAob3B0aW9ucykgPT4ge1xuICAgICAgICBjb25zdCByZWYgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXG4gICAgICAgICAgXCJjb2RleHBwOm5hdGl2ZS1sb2FkLW1vZHVsZVwiLFxuICAgICAgICAgIHR3ZWFrSWQsXG4gICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgKSBhcyB7IGlkOiBzdHJpbmc7IGtpbmQ6IE5hdGl2ZU1vZHVsZUtpbmQgfTtcbiAgICAgICAgcmV0dXJuIHJlbmRlcmVyTmF0aXZlTW9kdWxlUmVmKHR3ZWFrSWQsIHJlZi5pZCwgcmVmLmtpbmQpO1xuICAgICAgfSxcbiAgICAgIGNyZWF0ZVBhbmVsOiBhc3luYyAob3B0aW9ucykgPT4ge1xuICAgICAgICBjb25zdCByZWYgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXG4gICAgICAgICAgXCJjb2RleHBwOm5hdGl2ZS1jcmVhdGUtcGFuZWxcIixcbiAgICAgICAgICB0d2Vha0lkLFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICkgYXMgeyBpZDogc3RyaW5nOyB3aW5kb3dJZDogbnVtYmVyIHwgbnVsbCB9O1xuICAgICAgICByZXR1cm4gcmVuZGVyZXJOYXRpdmVQYW5lbFJlZih0d2Vha0lkLCByZWYuaWQsIHJlZi53aW5kb3dJZCk7XG4gICAgICB9LFxuICAgICAgYXR0YWNoVmlldzogYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgICAgY29uc3QgcmVmID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICAgIFwiY29kZXhwcDpuYXRpdmUtYXR0YWNoLXZpZXdcIixcbiAgICAgICAgICB0d2Vha0lkLFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICkgYXMgeyBpZDogc3RyaW5nIH07XG4gICAgICAgIHJldHVybiByZW5kZXJlck5hdGl2ZVZpZXdSZWYodHdlYWtJZCwgcmVmLmlkKTtcbiAgICAgIH0sXG4gICAgICBsYXVuY2hIZWxwZXI6IGFzeW5jIChvcHRpb25zKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlZiA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgICBcImNvZGV4cHA6bmF0aXZlLWxhdW5jaC1oZWxwZXJcIixcbiAgICAgICAgICB0d2Vha0lkLFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICkgYXMgeyBpZDogc3RyaW5nOyBwaWQ6IG51bWJlciB9O1xuICAgICAgICByZXR1cm4gcmVuZGVyZXJOYXRpdmVIZWxwZXJSZWYodHdlYWtJZCwgcmVmLmlkLCByZWYucGlkKTtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBjcmVhdGVCcm93c2VyVmlldzogKF9vcHRpb25zKSA9PiB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJhcGkuY29kZXguY3JlYXRlQnJvd3NlclZpZXcgaXMgbWFpbi1vbmx5OyB1c2UgYSBtYWluLXNjb3BlZCB0d2Vha1wiKTtcbiAgICB9LFxuICAgIGNyZWF0ZVdpbmRvdzogKG9wdGlvbnMpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXdpbmRvdy1jcmVhdGVcIiwgb3B0aW9ucykgYXMgUHJvbWlzZTxDb2RleFdpbmRvd1JlZj4sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyQ29kZXhWaWV3UmVmKFxuICB0d2Vha0lkOiBzdHJpbmcsXG4gIGlkOiBzdHJpbmcsXG4gIHdlYkNvbnRlbnRzSWQ6IG51bWJlcixcbiAgcGFyZW50V2luZG93SWQ6IG51bWJlciB8IG51bGwsXG4pOiBDb2RleFZpZXdSZWYge1xuICByZXR1cm4ge1xuICAgIGlkLFxuICAgIHdlYkNvbnRlbnRzSWQsXG4gICAgcGFyZW50V2luZG93SWQsXG4gICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC12aWV3LWNhbGxcIiwgdHdlYWtJZCwgaWQsIFwic2V0Qm91bmRzXCIsIGJvdW5kcykgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBzZXRWaXNpYmxlOiAodmlzaWJsZSkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtdmlldy1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcInNldFZpc2libGVcIiwgdmlzaWJsZSkgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBicmluZ1RvRnJvbnQ6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXZpZXctY2FsbFwiLCB0d2Vha0lkLCBpZCwgXCJicmluZ1RvRnJvbnRcIikgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBsb2FkUm91dGU6IChyb3V0ZSwgaG9zdElkKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC12aWV3LWNhbGxcIiwgdHdlYWtJZCwgaWQsIFwibG9hZFJvdXRlXCIsIHJvdXRlLCBob3N0SWQpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgbG9hZFVybDogKHVybCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtdmlldy1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcImxvYWRVcmxcIiwgdXJsKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGRpc3Bvc2U6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXZpZXctY2FsbFwiLCB0d2Vha0lkLCBpZCwgXCJkaXNwb3NlXCIpIGFzIFByb21pc2U8dm9pZD4sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyTmF0aXZlTW9kdWxlUmVmKFxuICB0d2Vha0lkOiBzdHJpbmcsXG4gIGlkOiBzdHJpbmcsXG4gIGtpbmQ6IE5hdGl2ZU1vZHVsZUtpbmQsXG4pOiBOYXRpdmVNb2R1bGVSZWYge1xuICByZXR1cm4ge1xuICAgIGlkLFxuICAgIGtpbmQsXG4gICAgcmVxdWVzdDogKG1ldGhvZCwgcGF5bG9hZCwgdGltZW91dE1zKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICBcImNvZGV4cHA6bmF0aXZlLW1vZHVsZS1yZXF1ZXN0XCIsXG4gICAgICAgIHR3ZWFrSWQsXG4gICAgICAgIGlkLFxuICAgICAgICBtZXRob2QsXG4gICAgICAgIHBheWxvYWQsXG4gICAgICAgIHRpbWVvdXRNcyxcbiAgICAgICksXG4gICAgZGlzcG9zZTogKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLW1vZHVsZS1kaXNwb3NlXCIsIHR3ZWFrSWQsIGlkKSBhcyBQcm9taXNlPHZvaWQ+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlck5hdGl2ZVBhbmVsUmVmKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZywgd2luZG93SWQ6IG51bWJlciB8IG51bGwpOiBOYXRpdmVQYW5lbFJlZiB7XG4gIHJldHVybiB7XG4gICAgaWQsXG4gICAgd2luZG93SWQsXG4gICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtaW5zdGFuY2UtY2FsbFwiLCB0d2Vha0lkLCBcInBhbmVsXCIsIGlkLCBcInNldEJvdW5kc1wiLCBib3VuZHMpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgc2hvdzogKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWluc3RhbmNlLWNhbGxcIiwgdHdlYWtJZCwgXCJwYW5lbFwiLCBpZCwgXCJzaG93XCIpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgaGlkZTogKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWluc3RhbmNlLWNhbGxcIiwgdHdlYWtJZCwgXCJwYW5lbFwiLCBpZCwgXCJoaWRlXCIpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgZGlzcG9zZTogKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWluc3RhbmNlLWNhbGxcIiwgdHdlYWtJZCwgXCJwYW5lbFwiLCBpZCwgXCJkaXNwb3NlXCIpIGFzIFByb21pc2U8dm9pZD4sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyTmF0aXZlVmlld1JlZih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBOYXRpdmVWaWV3UmVmIHtcbiAgcmV0dXJuIHtcbiAgICBpZCxcbiAgICBzZXRCb3VuZHM6IChib3VuZHMpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1pbnN0YW5jZS1jYWxsXCIsIHR3ZWFrSWQsIFwidmlld1wiLCBpZCwgXCJzZXRCb3VuZHNcIiwgYm91bmRzKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIHNldFZpc2libGU6ICh2aXNpYmxlKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtaW5zdGFuY2UtY2FsbFwiLCB0d2Vha0lkLCBcInZpZXdcIiwgaWQsIFwic2V0VmlzaWJsZVwiLCB2aXNpYmxlKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGRpc3Bvc2U6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1pbnN0YW5jZS1jYWxsXCIsIHR3ZWFrSWQsIFwidmlld1wiLCBpZCwgXCJkaXNwb3NlXCIpIGFzIFByb21pc2U8dm9pZD4sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyTmF0aXZlSGVscGVyUmVmKHR3ZWFrSWQ6IHN0cmluZywgaWQ6IHN0cmluZywgcGlkOiBudW1iZXIpOiBOYXRpdmVIZWxwZXJSZWYge1xuICByZXR1cm4ge1xuICAgIGlkLFxuICAgIHBpZCxcbiAgICBzZW5kOiAobWVzc2FnZSkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWhlbHBlci1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcInNlbmRcIiwgbWVzc2FnZSkgYXMgUHJvbWlzZTx2b2lkPixcbiAgICByZXF1ZXN0OiAobWVzc2FnZSwgdGltZW91dE1zKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICBcImNvZGV4cHA6bmF0aXZlLWhlbHBlci1jYWxsXCIsXG4gICAgICAgIHR3ZWFrSWQsXG4gICAgICAgIGlkLFxuICAgICAgICBcInJlcXVlc3RcIixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgdGltZW91dE1zLFxuICAgICAgKSxcbiAgICBzdG9wOiAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtaGVscGVyLWNhbGxcIiwgdHdlYWtJZCwgaWQsIFwic3RvcFwiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlckVsZWN0cm9uQnJpZGdlKCk6IEVsZWN0cm9uQnJpZGdlIHwgbnVsbCB7XG4gIGNvbnN0IHZhbHVlID0gKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgZWxlY3Ryb25CcmlkZ2U/OiB1bmtub3duIH0pLmVsZWN0cm9uQnJpZGdlO1xuICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiID8gdmFsdWUgYXMgRWxlY3Ryb25CcmlkZ2UgOiBudWxsO1xufVxuXG5mdW5jdGlvbiByZW5kZXJlclN0b3JhZ2UoaWQ6IHN0cmluZykge1xuICBjb25zdCBrZXkgPSBgY29kZXhwcDpzdG9yYWdlOiR7aWR9YDtcbiAgY29uc3QgcmVhZCA9ICgpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSkgPz8gXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gIH07XG4gIGNvbnN0IHdyaXRlID0gKHY6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PlxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgSlNPTi5zdHJpbmdpZnkodikpO1xuICByZXR1cm4ge1xuICAgIGdldDogPFQ+KGs6IHN0cmluZywgZD86IFQpID0+IChrIGluIHJlYWQoKSA/IChyZWFkKClba10gYXMgVCkgOiAoZCBhcyBUKSksXG4gICAgc2V0OiAoazogc3RyaW5nLCB2OiB1bmtub3duKSA9PiB7XG4gICAgICBjb25zdCBvID0gcmVhZCgpO1xuICAgICAgb1trXSA9IHY7XG4gICAgICB3cml0ZShvKTtcbiAgICB9LFxuICAgIGRlbGV0ZTogKGs6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgbyA9IHJlYWQoKTtcbiAgICAgIGRlbGV0ZSBvW2tdO1xuICAgICAgd3JpdGUobyk7XG4gICAgfSxcbiAgICBhbGw6ICgpID0+IHJlYWQoKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyZXJGcyhpZDogc3RyaW5nLCBfcGF0aHM6IFVzZXJQYXRocykge1xuICAvLyBTYW5kYm94ZWQgcmVuZGVyZXIgY2FuJ3QgdXNlIE5vZGUgZnMgZGlyZWN0bHkgXHUyMDE0IHByb3h5IHRocm91Z2ggbWFpbiBJUEMuXG4gIHJldHVybiB7XG4gICAgZGF0YURpcjogYDxyZW1vdGU+L3R3ZWFrLWRhdGEvJHtpZH1gLFxuICAgIHJlYWQ6IChwOiBzdHJpbmcpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnR3ZWFrLWZzXCIsIFwicmVhZFwiLCBpZCwgcCkgYXMgUHJvbWlzZTxzdHJpbmc+LFxuICAgIHdyaXRlOiAocDogc3RyaW5nLCBjOiBzdHJpbmcpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnR3ZWFrLWZzXCIsIFwid3JpdGVcIiwgaWQsIHAsIGMpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgZXhpc3RzOiAocDogc3RyaW5nKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCBcImV4aXN0c1wiLCBpZCwgcCkgYXMgUHJvbWlzZTxib29sZWFuPixcbiAgfTtcbn1cbiIsICIvKipcbiAqIEJ1aWx0LWluIFwiVHdlYWsgTWFuYWdlclwiIFx1MjAxNCBhdXRvLWluamVjdGVkIGJ5IHRoZSBydW50aW1lLCBub3QgYSB1c2VyIHR3ZWFrLlxuICogTGlzdHMgZGlzY292ZXJlZCB0d2Vha3Mgd2l0aCBlbmFibGUgdG9nZ2xlcywgb3BlbnMgdGhlIHR3ZWFrcyBkaXIsIGxpbmtzXG4gKiB0byBsb2dzIGFuZCBjb25maWcuIExpdmVzIGluIHRoZSByZW5kZXJlci5cbiAqXG4gKiBUaGlzIGlzIGludm9rZWQgZnJvbSBwcmVsb2FkL2luZGV4LnRzIEFGVEVSIHVzZXIgdHdlYWtzIGFyZSBsb2FkZWQgc28gaXRcbiAqIGNhbiBzaG93IHVwLXRvLWRhdGUgc3RhdHVzLlxuICovXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gXCJlbGVjdHJvblwiO1xuaW1wb3J0IHsgcmVnaXN0ZXJTZWN0aW9uIH0gZnJvbSBcIi4vc2V0dGluZ3MtaW5qZWN0b3JcIjtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vdW50TWFuYWdlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgdHdlYWtzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIikpIGFzIEFycmF5PHtcbiAgICBtYW5pZmVzdDogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHZlcnNpb246IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfTtcbiAgICBlbnRyeUV4aXN0czogYm9vbGVhbjtcbiAgfT47XG4gIGNvbnN0IHBhdGhzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dXNlci1wYXRoc1wiKSkgYXMge1xuICAgIHVzZXJSb290OiBzdHJpbmc7XG4gICAgdHdlYWtzRGlyOiBzdHJpbmc7XG4gICAgbG9nRGlyOiBzdHJpbmc7XG4gIH07XG5cbiAgcmVnaXN0ZXJTZWN0aW9uKHtcbiAgICBpZDogXCJjb2RleC1wbHVzcGx1czptYW5hZ2VyXCIsXG4gICAgdGl0bGU6IFwiVHdlYWsgTWFuYWdlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBgJHt0d2Vha3MubGVuZ3RofSB0d2VhayhzKSBpbnN0YWxsZWQuIFVzZXIgZGlyOiAke3BhdGhzLnVzZXJSb290fWAsXG4gICAgcmVuZGVyKHJvb3QpIHtcbiAgICAgIHJvb3Quc3R5bGUuY3NzVGV4dCA9IFwiZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O1wiO1xuXG4gICAgICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGFjdGlvbnMuc3R5bGUuY3NzVGV4dCA9IFwiZGlzcGxheTpmbGV4O2dhcDo4cHg7ZmxleC13cmFwOndyYXA7XCI7XG4gICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKFxuICAgICAgICBidXR0b24oXCJPcGVuIHR3ZWFrcyBmb2xkZXJcIiwgKCkgPT5cbiAgICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnJldmVhbFwiLCBwYXRocy50d2Vha3NEaXIpLmNhdGNoKCgpID0+IHt9KSxcbiAgICAgICAgKSxcbiAgICAgICk7XG4gICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKFxuICAgICAgICBidXR0b24oXCJPcGVuIGxvZ3NcIiwgKCkgPT5cbiAgICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnJldmVhbFwiLCBwYXRocy5sb2dEaXIpLmNhdGNoKCgpID0+IHt9KSxcbiAgICAgICAgKSxcbiAgICAgICk7XG4gICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKFxuICAgICAgICBidXR0b24oXCJSZWxvYWQgd2luZG93XCIsICgpID0+IGxvY2F0aW9uLnJlbG9hZCgpKSxcbiAgICAgICk7XG4gICAgICByb290LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xuXG4gICAgICBpZiAodHdlYWtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xuICAgICAgICBlbXB0eS5zdHlsZS5jc3NUZXh0ID0gXCJjb2xvcjojODg4O2ZvbnQ6MTNweCBzeXN0ZW0tdWk7bWFyZ2luOjhweCAwO1wiO1xuICAgICAgICBlbXB0eS50ZXh0Q29udGVudCA9XG4gICAgICAgICAgXCJObyB1c2VyIHR3ZWFrcyB5ZXQuIERyb3AgYSBmb2xkZXIgd2l0aCBtYW5pZmVzdC5qc29uICsgaW5kZXguanMgaW50byB0aGUgdHdlYWtzIGRpciwgdGhlbiByZWxvYWQuXCI7XG4gICAgICAgIHJvb3QuYXBwZW5kQ2hpbGQoZW1wdHkpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gICAgICBsaXN0LnN0eWxlLmNzc1RleHQgPSBcImxpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjA7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NnB4O1wiO1xuICAgICAgZm9yIChjb25zdCB0IG9mIHR3ZWFrcykge1xuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgICAgbGkuc3R5bGUuY3NzVGV4dCA9XG4gICAgICAgICAgXCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6OHB4IDEwcHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIsIzJhMmEyYSk7Ym9yZGVyLXJhZGl1czo2cHg7XCI7XG4gICAgICAgIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBsZWZ0LmlubmVySFRNTCA9IGBcbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udDo2MDAgMTNweCBzeXN0ZW0tdWk7XCI+JHtlc2NhcGUodC5tYW5pZmVzdC5uYW1lKX0gPHNwYW4gc3R5bGU9XCJjb2xvcjojODg4O2ZvbnQtd2VpZ2h0OjQwMDtcIj52JHtlc2NhcGUodC5tYW5pZmVzdC52ZXJzaW9uKX08L3NwYW4+PC9kaXY+XG4gICAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiM4ODg7Zm9udDoxMnB4IHN5c3RlbS11aTtcIj4ke2VzY2FwZSh0Lm1hbmlmZXN0LmRlc2NyaXB0aW9uID8/IHQubWFuaWZlc3QuaWQpfTwvZGl2PlxuICAgICAgICBgO1xuICAgICAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHJpZ2h0LnN0eWxlLmNzc1RleHQgPSBcImNvbG9yOiM4ODg7Zm9udDoxMnB4IHN5c3RlbS11aTtcIjtcbiAgICAgICAgcmlnaHQudGV4dENvbnRlbnQgPSB0LmVudHJ5RXhpc3RzID8gXCJsb2FkZWRcIiA6IFwibWlzc2luZyBlbnRyeVwiO1xuICAgICAgICBsaS5hcHBlbmQobGVmdCwgcmlnaHQpO1xuICAgICAgICBsaXN0LmFwcGVuZChsaSk7XG4gICAgICB9XG4gICAgICByb290LmFwcGVuZChsaXN0KTtcbiAgICB9LFxuICB9KTtcbn1cblxuZnVuY3Rpb24gYnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uY2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBiLnR5cGUgPSBcImJ1dHRvblwiO1xuICBiLnRleHRDb250ZW50ID0gbGFiZWw7XG4gIGIuc3R5bGUuY3NzVGV4dCA9XG4gICAgXCJwYWRkaW5nOjZweCAxMHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyLCMzMzMpO2JvcmRlci1yYWRpdXM6NnB4O2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6aW5oZXJpdDtmb250OjEycHggc3lzdGVtLXVpO2N1cnNvcjpwb2ludGVyO1wiO1xuICBiLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBvbmNsaWNrKTtcbiAgcmV0dXJuIGI7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZShzOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcy5yZXBsYWNlKC9bJjw+XCInXS9nLCAoYykgPT5cbiAgICBjID09PSBcIiZcIlxuICAgICAgPyBcIiZhbXA7XCJcbiAgICAgIDogYyA9PT0gXCI8XCJcbiAgICAgICAgPyBcIiZsdDtcIlxuICAgICAgICA6IGMgPT09IFwiPlwiXG4gICAgICAgICAgPyBcIiZndDtcIlxuICAgICAgICAgIDogYyA9PT0gJ1wiJ1xuICAgICAgICAgICAgPyBcIiZxdW90O1wiXG4gICAgICAgICAgICA6IFwiJiMzOTtcIixcbiAgKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQVdBLElBQUFBLG1CQUE0Qjs7O0FDNkJyQixTQUFTLG1CQUF5QjtBQUN2QyxNQUFJLE9BQU8sK0JBQWdDO0FBQzNDLFFBQU0sWUFBWSxvQkFBSSxJQUErQjtBQUNyRCxNQUFJLFNBQVM7QUFDYixRQUFNLFlBQVksb0JBQUksSUFBNEM7QUFFbEUsUUFBTSxPQUEwQjtBQUFBLElBQzlCLGVBQWU7QUFBQSxJQUNmO0FBQUEsSUFDQSxPQUFPLFVBQVU7QUFDZixZQUFNLEtBQUs7QUFDWCxnQkFBVSxJQUFJLElBQUksUUFBUTtBQUUxQixjQUFRO0FBQUEsUUFDTjtBQUFBLFFBQ0EsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLE1BQ1g7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsR0FBRyxPQUFPLElBQUk7QUFDWixVQUFJLElBQUksVUFBVSxJQUFJLEtBQUs7QUFDM0IsVUFBSSxDQUFDLEVBQUcsV0FBVSxJQUFJLE9BQVEsSUFBSSxvQkFBSSxJQUFJLENBQUU7QUFDNUMsUUFBRSxJQUFJLEVBQUU7QUFBQSxJQUNWO0FBQUEsSUFDQSxJQUFJLE9BQU8sSUFBSTtBQUNiLGdCQUFVLElBQUksS0FBSyxHQUFHLE9BQU8sRUFBRTtBQUFBLElBQ2pDO0FBQUEsSUFDQSxLQUFLLFVBQVUsTUFBTTtBQUNuQixnQkFBVSxJQUFJLEtBQUssR0FBRyxRQUFRLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBQUEsSUFDbkQ7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLElBQUM7QUFBQSxJQUNyQix1QkFBdUI7QUFBQSxJQUFDO0FBQUEsSUFDeEIsc0JBQXNCO0FBQUEsSUFBQztBQUFBLElBQ3ZCLFdBQVc7QUFBQSxJQUFDO0FBQUEsRUFDZDtBQUVBLFNBQU8s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QUFDRjtBQUVBLFNBQVMsaUNBQ1AsVUFDQSxpQkFDUztBQUNULE1BQUksQ0FBQyxxQkFBcUIsS0FBSyxRQUFRLEVBQUcsT0FBTSxJQUFJLE1BQU0sbUJBQW1CO0FBQzdFLE1BQUksZ0JBQWdCLElBQUksUUFBUSxFQUFHLFFBQU87QUFDMUMsUUFBTSxXQUFXLENBQUMsUUFBaUIsWUFBcUI7QUFDdEQsaUNBQVksS0FBSywyQkFBMkIsVUFBVSxPQUFPO0FBQUEsRUFDL0Q7QUFDQSxrQkFBZ0IsSUFBSSxVQUFVLFFBQVE7QUFDdEMsK0JBQVksR0FBRyw0QkFBNEIsUUFBUSxHQUFHLFFBQVE7QUFDOUQsU0FBTztBQUNUO0FBRUEsU0FBUyxtQ0FDUCxVQUNBLGlCQUNTO0FBQ1QsUUFBTSxXQUFXLGdCQUFnQixJQUFJLFFBQVE7QUFDN0MsTUFBSSxDQUFDLFNBQVUsUUFBTztBQUN0QixrQkFBZ0IsT0FBTyxRQUFRO0FBQy9CLCtCQUFZLGVBQWUsNEJBQTRCLFFBQVEsR0FBRyxRQUFRO0FBQzFFLFNBQU87QUFDVDsiLAogICJuYW1lcyI6IFsiaW1wb3J0X2VsZWN0cm9uIiwgInJvb3QiLCAic3RhdGUiLCAiY2hlY2siLCAiYnV0dG9uIiwgImNhcmQiLCAiaW1wb3J0X2VsZWN0cm9uIiwgIm1vZHVsZSIsICJleHBvcnRzIiwgImltcG9ydF9lbGVjdHJvbiIsICJzYWZlU3RyaW5naWZ5Il0KfQo=
