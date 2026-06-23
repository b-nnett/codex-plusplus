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

// src/preload/settings-sidebar-dedupe.ts
function selectInjectedSettingsGroupsToRemove(candidates) {
  const remove = /* @__PURE__ */ new Set();
  const groupsByParentAndKind = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (!candidate.validPlacement || !candidate.parent) {
      remove.add(candidate.group);
      continue;
    }
    let groupsByKind = groupsByParentAndKind.get(candidate.parent);
    if (!groupsByKind) {
      groupsByKind = /* @__PURE__ */ new Map();
      groupsByParentAndKind.set(candidate.parent, groupsByKind);
    }
    const repeatedGroups = groupsByKind.get(candidate.kind) ?? [];
    repeatedGroups.push(candidate);
    groupsByKind.set(candidate.kind, repeatedGroups);
  }
  for (const groupsByKind of groupsByParentAndKind.values()) {
    for (const repeatedGroups of groupsByKind.values()) {
      if (repeatedGroups.length <= 1) continue;
      const keep = repeatedGroups.find((candidate) => candidate.current) ?? repeatedGroups[0];
      for (const candidate of repeatedGroups) {
        if (candidate !== keep) remove.add(candidate.group);
      }
    }
  }
  return candidates.map((candidate) => candidate.group).filter((group) => remove.has(group));
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
    plog("sidebar not found");
    return;
  }
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
  const previousPagesGroup = state.pagesGroup;
  const attachedPagesGroup = state.pagesGroup && outer.contains(state.pagesGroup) ? state.pagesGroup : findExistingPagesGroup(outer);
  const adoptedPagesGroup = !!attachedPagesGroup && previousPagesGroup !== attachedPagesGroup;
  if (adoptedPagesGroup) {
    state.pagesGroup = attachedPagesGroup;
  }
  const groupAttached = !!attachedPagesGroup && outer.contains(attachedPagesGroup);
  if (!adoptedPagesGroup && state.pagesGroupKey === desiredKey && (pages.length === 0 ? !groupAttached : groupAttached)) {
    return;
  }
  if (pages.length === 0) {
    if (attachedPagesGroup) {
      attachedPagesGroup.remove();
      state.pagesGroup = null;
    }
    for (const p of state.pages.values()) p.navButton = null;
    state.pagesGroupKey = desiredKey;
    return;
  }
  let group = attachedPagesGroup;
  if (!group) {
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
function findExistingPagesGroup(outer) {
  return outer.querySelector(':scope > [data-codexpp="pages-group"]') ?? outer.querySelector('[data-codexpp="pages-group"]');
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
  const hasUpdate = !!entry.installed && entry.installed.version !== entry.manifest.version;
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
  return entries.filter((entry) => !!entry.installed && entry.installed.version !== entry.manifest.version).length;
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
  const hasUpdate = !!installed && installed !== latest;
  const badge = storeVersionBadgeShell(hasUpdate);
  const label = document.createElement("span");
  label.className = "truncate";
  label.textContent = installed ? `Installed v${installed} \xB7 Latest v${latest}` : `Latest v${latest}`;
  badge.title = installed ? `Installed version ${installed}. Latest approved version ${latest}.` : `Latest approved version ${latest}.`;
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
  const groupsToRemove = selectInjectedSettingsGroupsToRemove(
    Array.from(groups).map((group) => {
      const sidebar = codexPpInjectedSettingsGroupSidebar(group);
      return {
        group,
        kind: codexPpInjectedSettingsGroupKind(group),
        parent: sidebar,
        validPlacement: sidebar !== null,
        current: isCurrentCodexPpInjectedSettingsGroup(group)
      };
    })
  );
  for (const group of groupsToRemove) {
    resetCodexPpInjectedSettingsGroupState(group);
    group.remove();
  }
}
function codexPpInjectedSettingsGroupKind(group) {
  if (group.dataset.codexpp === "pages-group") return "pages-group";
  if (group.dataset.codexpp === "native-nav-header") return "native-nav-header";
  return "nav-group";
}
function isCurrentCodexPpInjectedSettingsGroup(group) {
  return group === state.navGroup || group === state.pagesGroup || group === state.nativeNavHeader;
}
function codexPpInjectedSettingsGroupSidebar(group) {
  if (isForbiddenSettingsSidebarSurface(group)) return null;
  let node = group.parentElement;
  for (let depth = 0; node && depth < 4; depth++) {
    if (isForbiddenSettingsSidebarSurface(node)) return null;
    if (isSettingsSidebarCandidate(node)) return node;
    node = node.parentElement;
  }
  return null;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvdHdlYWstc3RvcmUudHMiLCAiLi4vc3JjL3ByZWxvYWQvc2V0dGluZ3Mtc2lkZWJhci1kZWR1cGUudHMiLCAiLi4vc3JjL3ByZWxvYWQvdHdlYWstaG9zdC50cyIsICIuLi9zcmMvcHJlbG9hZC9tYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFJlbmRlcmVyIHByZWxvYWQgZW50cnkuIFJ1bnMgaW4gYW4gaXNvbGF0ZWQgd29ybGQgYmVmb3JlIENvZGV4J3MgcGFnZSBKUy5cbiAqIFJlc3BvbnNpYmlsaXRpZXM6XG4gKiAgIDEuIEluc3RhbGwgYSBSZWFjdCBEZXZUb29scy1zaGFwZWQgZ2xvYmFsIGhvb2sgdG8gY2FwdHVyZSB0aGUgcmVuZGVyZXJcbiAqICAgICAgcmVmZXJlbmNlIHdoZW4gUmVhY3QgbW91bnRzLiBXZSB1c2UgdGhpcyBmb3IgZmliZXIgd2Fsa2luZy5cbiAqICAgMi4gQWZ0ZXIgRE9NQ29udGVudExvYWRlZCwga2ljayBvZmYgc2V0dGluZ3MtaW5qZWN0aW9uIGxvZ2ljLlxuICogICAzLiBEaXNjb3ZlciByZW5kZXJlci1zY29wZWQgdHdlYWtzICh2aWEgSVBDIHRvIG1haW4pIGFuZCBzdGFydCB0aGVtLlxuICogICA0LiBMaXN0ZW4gZm9yIGBjb2RleHBwOnR3ZWFrcy1jaGFuZ2VkYCBmcm9tIG1haW4gKGZpbGVzeXN0ZW0gd2F0Y2hlcikgYW5kXG4gKiAgICAgIGhvdC1yZWxvYWQgdHdlYWtzIHdpdGhvdXQgZHJvcHBpbmcgdGhlIHBhZ2UuXG4gKi9cblxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IGluc3RhbGxSZWFjdEhvb2sgfSBmcm9tIFwiLi9yZWFjdC1ob29rXCI7XG5pbXBvcnQgeyBzdGFydFNldHRpbmdzSW5qZWN0b3IgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgc3RhcnRUd2Vha0hvc3QsIHRlYXJkb3duVHdlYWtIb3N0IH0gZnJvbSBcIi4vdHdlYWstaG9zdFwiO1xuaW1wb3J0IHsgbW91bnRNYW5hZ2VyIH0gZnJvbSBcIi4vbWFuYWdlclwiO1xuXG5jb25zdCBCUk9XU0VSX1VJX0NPTk5FQ1RfUE9SVCA9IFwiY29kZXhwcDpicm93c2VyLXVpLWNvbm5lY3QtYXBwLWhvc3RcIjtcbmNvbnN0IEJST1dTRVJfVUlfQlJJREdFX1JFUVVFU1QgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1icmlkZ2UtcmVxdWVzdFwiO1xuY29uc3QgQlJPV1NFUl9VSV9CUklER0VfUkVTUE9OU0UgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1icmlkZ2UtcmVzcG9uc2VcIjtcbmNvbnN0IEJST1dTRVJfVUlfTUVTU0FHRV9GT1JfVklFVyA9IFwiY29kZXhwcDpicm93c2VyLXVpLW1lc3NhZ2UtZm9yLXZpZXdcIjtcbmNvbnN0IEJST1dTRVJfVUlfV09SS0VSX01FU1NBR0UgPSBcImNvZGV4cHA6YnJvd3Nlci11aS13b3JrZXItbWVzc2FnZVwiO1xuY29uc3QgQlJPV1NFUl9VSV9TWVNURU1fVEhFTUUgPSBcImNvZGV4cHA6YnJvd3Nlci11aS1zeXN0ZW0tdGhlbWVcIjtcblxuY29uc3QgREVTS1RPUF9NRVNTQUdFX0ZST01fVklFVyA9IFwiY29kZXhfZGVza3RvcDptZXNzYWdlLWZyb20tdmlld1wiO1xuY29uc3QgREVTS1RPUF9NRVNTQUdFX0ZPUl9WSUVXID0gXCJjb2RleF9kZXNrdG9wOm1lc3NhZ2UtZm9yLXZpZXdcIjtcbmNvbnN0IERFU0tUT1BfU0hPV19DT05URVhUX01FTlUgPSBcImNvZGV4X2Rlc2t0b3A6c2hvdy1jb250ZXh0LW1lbnVcIjtcbmNvbnN0IERFU0tUT1BfU0hPV19BUFBMSUNBVElPTl9NRU5VID0gXCJjb2RleF9kZXNrdG9wOnNob3ctYXBwbGljYXRpb24tbWVudVwiO1xuY29uc3QgREVTS1RPUF9HRVRfU0VOVFJZX0lOSVRfT1BUSU9OUyA9IFwiY29kZXhfZGVza3RvcDpnZXQtc2VudHJ5LWluaXQtb3B0aW9uc1wiO1xuY29uc3QgREVTS1RPUF9HRVRfQlVJTERfRkxBVk9SID0gXCJjb2RleF9kZXNrdG9wOmdldC1idWlsZC1mbGF2b3JcIjtcbmNvbnN0IERFU0tUT1BfR0VUX1VTRVNfT1dMX0FQUF9TSEVMTCA9IFwiY29kZXhfZGVza3RvcDpnZXQtdXNlcy1vd2wtYXBwLXNoZWxsXCI7XG5jb25zdCBERVNLVE9QX0dFVF9TWVNURU1fVEhFTUVfVkFSSUFOVCA9IFwiY29kZXhfZGVza3RvcDpnZXQtc3lzdGVtLXRoZW1lLXZhcmlhbnRcIjtcbmNvbnN0IERFU0tUT1BfR0VUX1NIQVJFRF9PQkpFQ1RfU05BUFNIT1QgPSBcImNvZGV4X2Rlc2t0b3A6Z2V0LXNoYXJlZC1vYmplY3Qtc25hcHNob3RcIjtcbmNvbnN0IERFU0tUT1BfR0VUX0ZBU1RfTU9ERV9ST0xMT1VUX01FVFJJQ1MgPSBcImNvZGV4X2Rlc2t0b3A6Z2V0LWZhc3QtbW9kZS1yb2xsb3V0LW1ldHJpY3NcIjtcbmNvbnN0IERFU0tUT1BfU1lTVEVNX1RIRU1FX1VQREFURUQgPSBcImNvZGV4X2Rlc2t0b3A6c3lzdGVtLXRoZW1lLXZhcmlhbnQtdXBkYXRlZFwiO1xuY29uc3QgREVTS1RPUF9UUklHR0VSX1NFTlRSWV9URVNUID0gXCJjb2RleF9kZXNrdG9wOnRyaWdnZXItc2VudHJ5LXRlc3RcIjtcblxuZnVuY3Rpb24gZGVza3RvcFdvcmtlckZyb21WaWV3Q2hhbm5lbCh3b3JrZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBjb2RleF9kZXNrdG9wOndvcmtlcjoke3dvcmtlcklkfTpmcm9tLXZpZXdgO1xufVxuXG5mdW5jdGlvbiBkZXNrdG9wV29ya2VyRm9yVmlld0NoYW5uZWwod29ya2VySWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgY29kZXhfZGVza3RvcDp3b3JrZXI6JHt3b3JrZXJJZH06Zm9yLXZpZXdgO1xufVxuXG4vLyBGaWxlLWxvZyBwcmVsb2FkIHByb2dyZXNzIHNvIHdlIGNhbiBkaWFnbm9zZSB3aXRob3V0IERldlRvb2xzLiBCZXN0LWVmZm9ydDpcbi8vIGZhaWx1cmVzIGhlcmUgbXVzdCBuZXZlciB0aHJvdyBiZWNhdXNlIHdlJ2QgdGFrZSB0aGUgcGFnZSBkb3duIHdpdGggdXMuXG4vL1xuLy8gQ29kZXgncyByZW5kZXJlciBpcyBzYW5kYm94ZWQgKHNhbmRib3g6IHRydWUpLCBzbyBgcmVxdWlyZShcIm5vZGU6ZnNcIilgIGlzXG4vLyB1bmF2YWlsYWJsZS4gV2UgZm9yd2FyZCBsb2cgbGluZXMgdG8gbWFpbiB2aWEgSVBDOyBtYWluIHdyaXRlcyB0aGUgZmlsZS5cbmZ1bmN0aW9uIGZpbGVMb2coc3RhZ2U6IHN0cmluZywgZXh0cmE/OiB1bmtub3duKTogdm9pZCB7XG4gIGNvbnN0IG1zZyA9IGBbY29kZXgtcGx1c3BsdXMgcHJlbG9hZF0gJHtzdGFnZX0ke1xuICAgIGV4dHJhID09PSB1bmRlZmluZWQgPyBcIlwiIDogXCIgXCIgKyBzYWZlU3RyaW5naWZ5KGV4dHJhKVxuICB9YDtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gIH0gY2F0Y2gge31cbiAgdHJ5IHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLCBcImluZm9cIiwgbXNnKTtcbiAgfSBjYXRjaCB7fVxufVxuZnVuY3Rpb24gc2FmZVN0cmluZ2lmeSh2OiB1bmtub3duKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogSlNPTi5zdHJpbmdpZnkodik7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBTdHJpbmcodik7XG4gIH1cbn1cblxuZmlsZUxvZyhcInByZWxvYWQgZW50cnlcIiwgeyB1cmw6IGxvY2F0aW9uLmhyZWYgfSk7XG5cbnRyeSB7XG4gIGluc3RhbGxCcm93c2VyVWlIb3N0QnJpZGdlKCk7XG4gIGZpbGVMb2coXCJicm93c2VyIFVJIGhvc3QgYnJpZGdlIGluc3RhbGxlZFwiKTtcbn0gY2F0Y2ggKGUpIHtcbiAgZmlsZUxvZyhcImJyb3dzZXIgVUkgaG9zdCBicmlkZ2UgRkFJTEVEXCIsIFN0cmluZyhlKSk7XG59XG5cbi8vIFJlYWN0IGhvb2sgbXVzdCBiZSBpbnN0YWxsZWQgKmJlZm9yZSogQ29kZXgncyBidW5kbGUgcnVucy5cbnRyeSB7XG4gIGluc3RhbGxSZWFjdEhvb2soKTtcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgaW5zdGFsbGVkXCIpO1xufSBjYXRjaCAoZSkge1xuICBmaWxlTG9nKFwicmVhY3QgaG9vayBGQUlMRURcIiwgU3RyaW5nKGUpKTtcbn1cblxucXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBib290LCB7IG9uY2U6IHRydWUgfSk7XG4gIH0gZWxzZSB7XG4gICAgYm9vdCgpO1xuICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHtcbiAgZmlsZUxvZyhcImJvb3Qgc3RhcnRcIiwgeyByZWFkeVN0YXRlOiBkb2N1bWVudC5yZWFkeVN0YXRlIH0pO1xuICB0cnkge1xuICAgIHN0YXJ0U2V0dGluZ3NJbmplY3RvcigpO1xuICAgIGZpbGVMb2coXCJzZXR0aW5ncyBpbmplY3RvciBzdGFydGVkXCIpO1xuICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgZmlsZUxvZyhcInR3ZWFrIGhvc3Qgc3RhcnRlZFwiKTtcbiAgICBhd2FpdCBtb3VudE1hbmFnZXIoKTtcbiAgICBmaWxlTG9nKFwibWFuYWdlciBtb3VudGVkXCIpO1xuICAgIHN1YnNjcmliZVJlbG9hZCgpO1xuICAgIGZpbGVMb2coXCJib290IGNvbXBsZXRlXCIpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgZmlsZUxvZyhcImJvb3QgRkFJTEVEXCIsIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpKTtcbiAgICBjb25zb2xlLmVycm9yKFwiW2NvZGV4LXBsdXNwbHVzXSBwcmVsb2FkIGJvb3QgZmFpbGVkOlwiLCBlKTtcbiAgfVxufVxuXG4vLyBIb3QgcmVsb2FkOiBnYXRlZCBiZWhpbmQgYSBzbWFsbCBpbi1mbGlnaHQgbG9jayBzbyBhIGZsdXJyeSBvZiBmcyBldmVudHNcbi8vIGRvZXNuJ3QgcmVlbnRyYW50bHkgdGVhciBkb3duIHRoZSBob3N0IG1pZC1sb2FkLlxubGV0IHJlbG9hZGluZzogUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gc3Vic2NyaWJlUmVsb2FkKCk6IHZvaWQge1xuICBpcGNSZW5kZXJlci5vbihcImNvZGV4cHA6dHdlYWtzLWNoYW5nZWRcIiwgKCkgPT4ge1xuICAgIGlmIChyZWxvYWRpbmcpIHJldHVybjtcbiAgICByZWxvYWRpbmcgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5pbmZvKFwiW2NvZGV4LXBsdXNwbHVzXSBob3QtcmVsb2FkaW5nIHR3ZWFrc1wiKTtcbiAgICAgICAgdGVhcmRvd25Ud2Vha0hvc3QoKTtcbiAgICAgICAgYXdhaXQgc3RhcnRUd2Vha0hvc3QoKTtcbiAgICAgICAgYXdhaXQgbW91bnRNYW5hZ2VyKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIGhvdCByZWxvYWQgZmFpbGVkOlwiLCBlKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHJlbG9hZGluZyA9IG51bGw7XG4gICAgICB9XG4gICAgfSkoKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGluc3RhbGxCcm93c2VyVWlIb3N0QnJpZGdlKCk6IHZvaWQge1xuICBjb25zdCB3b3JrZXJMaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZD4oKTtcblxuICBpcGNSZW5kZXJlci5vbihCUk9XU0VSX1VJX0NPTk5FQ1RfUE9SVCwgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgW3BvcnRdID0gZXZlbnQucG9ydHM7XG4gICAgaWYgKCFwb3J0KSByZXR1cm47XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKHsgdHlwZTogXCJjb25uZWN0LWFwcC1ob3N0XCIsIHBvcnQgfSwgXCIqXCIsIFtwb3J0XSk7XG4gIH0pO1xuXG4gIGlwY1JlbmRlcmVyLm9uKEJST1dTRVJfVUlfQlJJREdFX1JFUVVFU1QsIGFzeW5jIChfZXZlbnQsIHBheWxvYWQpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0ID0gcGF5bG9hZCAmJiB0eXBlb2YgcGF5bG9hZCA9PT0gXCJvYmplY3RcIlxuICAgICAgPyBwYXlsb2FkIGFzIHsgaWQ/OiB1bmtub3duOyBtZXRob2Q/OiB1bmtub3duOyBhcmdzPzogdW5rbm93biB9XG4gICAgICA6IHt9O1xuICAgIGNvbnN0IGlkID0gdHlwZW9mIHJlcXVlc3QuaWQgPT09IFwic3RyaW5nXCIgPyByZXF1ZXN0LmlkIDogXCJcIjtcbiAgICBjb25zdCBtZXRob2QgPSB0eXBlb2YgcmVxdWVzdC5tZXRob2QgPT09IFwic3RyaW5nXCIgPyByZXF1ZXN0Lm1ldGhvZCA6IFwiXCI7XG4gICAgY29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkocmVxdWVzdC5hcmdzKSA/IHJlcXVlc3QuYXJncyA6IFtdO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHJ1bkJyb3dzZXJVaUJyaWRnZU1ldGhvZChtZXRob2QsIGFyZ3MsIHdvcmtlckxpc3RlbmVycyk7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKEJST1dTRVJfVUlfQlJJREdFX1JFU1BPTlNFLCB7IGlkLCBvazogdHJ1ZSwgdmFsdWUgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX0JSSURHRV9SRVNQT05TRSwge1xuICAgICAgICBpZCxcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBlcnJvcjogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBpcGNSZW5kZXJlci5vbihERVNLVE9QX01FU1NBR0VfRk9SX1ZJRVcsIChfZXZlbnQsIG1lc3NhZ2UpID0+IHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKEJST1dTRVJfVUlfTUVTU0FHRV9GT1JfVklFVywgbWVzc2FnZSk7XG4gIH0pO1xuXG4gIGlwY1JlbmRlcmVyLm9uKERFU0tUT1BfU1lTVEVNX1RIRU1FX1VQREFURUQsIChfZXZlbnQsIHZhbHVlKSA9PiB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX1NZU1RFTV9USEVNRSwgdmFsdWUpO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuQnJvd3NlclVpQnJpZGdlTWV0aG9kKFxuICBtZXRob2Q6IHN0cmluZyxcbiAgYXJnczogdW5rbm93bltdLFxuICB3b3JrZXJMaXN0ZW5lcnM6IE1hcDxzdHJpbmcsICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQ+LFxuKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIHN3aXRjaCAobWV0aG9kKSB7XG4gICAgY2FzZSBcInNuYXBzaG90XCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU0hBUkVEX09CSkVDVF9TTkFQU0hPVCkgPz8ge307XG4gICAgY2FzZSBcInN5c3RlbVRoZW1lXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU1lTVEVNX1RIRU1FX1ZBUklBTlQpO1xuICAgIGNhc2UgXCJzZW50cnlPcHRpb25zXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfU0VOVFJZX0lOSVRfT1BUSU9OUyk7XG4gICAgY2FzZSBcImJ1aWxkRmxhdm9yXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfQlVJTERfRkxBVk9SKTtcbiAgICBjYXNlIFwidXNlc093bEFwcFNoZWxsXCI6XG4gICAgICByZXR1cm4gaXBjUmVuZGVyZXIuc2VuZFN5bmMoREVTS1RPUF9HRVRfVVNFU19PV0xfQVBQX1NIRUxMKSA9PT0gdHJ1ZTtcbiAgICBjYXNlIFwic2VuZE1lc3NhZ2VGcm9tVmlld1wiOlxuICAgICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZShERVNLVE9QX01FU1NBR0VfRlJPTV9WSUVXLCBhcmdzWzBdKTtcbiAgICBjYXNlIFwic2VuZFdvcmtlck1lc3NhZ2VGcm9tVmlld1wiOlxuICAgICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZShkZXNrdG9wV29ya2VyRnJvbVZpZXdDaGFubmVsKFN0cmluZyhhcmdzWzBdKSksIGFyZ3NbMV0pO1xuICAgIGNhc2UgXCJzdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiOlxuICAgICAgcmV0dXJuIHN1YnNjcmliZUJyb3dzZXJVaVdvcmtlck1lc3NhZ2VzKFN0cmluZyhhcmdzWzBdKSwgd29ya2VyTGlzdGVuZXJzKTtcbiAgICBjYXNlIFwidW5zdWJzY3JpYmVXb3JrZXJNZXNzYWdlc1wiOlxuICAgICAgcmV0dXJuIHVuc3Vic2NyaWJlQnJvd3NlclVpV29ya2VyTWVzc2FnZXMoU3RyaW5nKGFyZ3NbMF0pLCB3b3JrZXJMaXN0ZW5lcnMpO1xuICAgIGNhc2UgXCJzaG93Q29udGV4dE1lbnVcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9TSE9XX0NPTlRFWFRfTUVOVSwgYXJnc1swXSk7XG4gICAgY2FzZSBcInNob3dBcHBsaWNhdGlvbk1lbnVcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9TSE9XX0FQUExJQ0FUSU9OX01FTlUsIHtcbiAgICAgICAgbWVudUlkOiBhcmdzWzBdLFxuICAgICAgICB4OiBhcmdzWzFdLFxuICAgICAgICB5OiBhcmdzWzJdLFxuICAgICAgfSk7XG4gICAgY2FzZSBcImdldEZhc3RNb2RlUm9sbG91dE1ldHJpY3NcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9HRVRfRkFTVF9NT0RFX1JPTExPVVRfTUVUUklDUywgYXJnc1swXSk7XG4gICAgY2FzZSBcInRyaWdnZXJTZW50cnlUZXN0RXJyb3JcIjpcbiAgICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoREVTS1RPUF9UUklHR0VSX1NFTlRSWV9URVNUKTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIENvZGV4KysgYnJvd3NlciBVSSBicmlkZ2UgbWV0aG9kOiAke21ldGhvZH1gKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdWJzY3JpYmVCcm93c2VyVWlXb3JrZXJNZXNzYWdlcyhcbiAgd29ya2VySWQ6IHN0cmluZyxcbiAgd29ya2VyTGlzdGVuZXJzOiBNYXA8c3RyaW5nLCAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkPixcbik6IGJvb2xlYW4ge1xuICBpZiAoIS9eW2EtekEtWjAtOS5fOi1dKyQvLnRlc3Qod29ya2VySWQpKSB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHdvcmtlciBpZFwiKTtcbiAgaWYgKHdvcmtlckxpc3RlbmVycy5oYXMod29ya2VySWQpKSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgbGlzdGVuZXIgPSAoX2V2ZW50OiB1bmtub3duLCBtZXNzYWdlOiB1bmtub3duKSA9PiB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZChCUk9XU0VSX1VJX1dPUktFUl9NRVNTQUdFLCB3b3JrZXJJZCwgbWVzc2FnZSk7XG4gIH07XG4gIHdvcmtlckxpc3RlbmVycy5zZXQod29ya2VySWQsIGxpc3RlbmVyKTtcbiAgaXBjUmVuZGVyZXIub24oZGVza3RvcFdvcmtlckZvclZpZXdDaGFubmVsKHdvcmtlcklkKSwgbGlzdGVuZXIpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gdW5zdWJzY3JpYmVCcm93c2VyVWlXb3JrZXJNZXNzYWdlcyhcbiAgd29ya2VySWQ6IHN0cmluZyxcbiAgd29ya2VyTGlzdGVuZXJzOiBNYXA8c3RyaW5nLCAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkPixcbik6IGJvb2xlYW4ge1xuICBjb25zdCBsaXN0ZW5lciA9IHdvcmtlckxpc3RlbmVycy5nZXQod29ya2VySWQpO1xuICBpZiAoIWxpc3RlbmVyKSByZXR1cm4gdHJ1ZTtcbiAgd29ya2VyTGlzdGVuZXJzLmRlbGV0ZSh3b3JrZXJJZCk7XG4gIGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKGRlc2t0b3BXb3JrZXJGb3JWaWV3Q2hhbm5lbCh3b3JrZXJJZCksIGxpc3RlbmVyKTtcbiAgcmV0dXJuIHRydWU7XG59XG4iLCAiLyoqXG4gKiBJbnN0YWxsIGEgbWluaW1hbCBfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18uIFJlYWN0IGNhbGxzXG4gKiBgaG9vay5pbmplY3QocmVuZGVyZXJJbnRlcm5hbHMpYCBkdXJpbmcgYGNyZWF0ZVJvb3RgL2BoeWRyYXRlUm9vdGAuIFRoZVxuICogXCJpbnRlcm5hbHNcIiBvYmplY3QgZXhwb3NlcyBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZSwgd2hpY2ggbGV0cyB1cyB0dXJuIGFcbiAqIERPTSBub2RlIGludG8gYSBSZWFjdCBmaWJlciBcdTIwMTQgbmVjZXNzYXJ5IGZvciBvdXIgU2V0dGluZ3MgaW5qZWN0b3IuXG4gKlxuICogV2UgZG9uJ3Qgd2FudCB0byBicmVhayByZWFsIFJlYWN0IERldlRvb2xzIGlmIHRoZSB1c2VyIG9wZW5zIGl0OyB3ZSBpbnN0YWxsXG4gKiBvbmx5IGlmIG5vIGhvb2sgZXhpc3RzIHlldCwgYW5kIHdlIGZvcndhcmQgY2FsbHMgdG8gYSBkb3duc3RyZWFtIGhvb2sgaWZcbiAqIG9uZSBpcyBsYXRlciBhc3NpZ25lZC5cbiAqL1xuZGVjbGFyZSBnbG9iYWwge1xuICBpbnRlcmZhY2UgV2luZG93IHtcbiAgICBfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18/OiBSZWFjdERldnRvb2xzSG9vaztcbiAgICBfX2NvZGV4cHBfXz86IHtcbiAgICAgIGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rO1xuICAgICAgcmVuZGVyZXJzOiBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz47XG4gICAgfTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgUmVuZGVyZXJJbnRlcm5hbHMge1xuICBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZT86IChuOiBOb2RlKSA9PiB1bmtub3duO1xuICB2ZXJzaW9uPzogc3RyaW5nO1xuICBidW5kbGVUeXBlPzogbnVtYmVyO1xuICByZW5kZXJlclBhY2thZ2VOYW1lPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUmVhY3REZXZ0b29sc0hvb2sge1xuICBzdXBwb3J0c0ZpYmVyOiB0cnVlO1xuICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcbiAgb24oZXZlbnQ6IHN0cmluZywgZm46ICguLi5hOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xuICBvZmYoZXZlbnQ6IHN0cmluZywgZm46ICguLi5hOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xuICBlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSk6IHZvaWQ7XG4gIGluamVjdChyZW5kZXJlcjogUmVuZGVyZXJJbnRlcm5hbHMpOiBudW1iZXI7XG4gIG9uU2NoZWR1bGVGaWJlclJvb3Q/KCk6IHZvaWQ7XG4gIG9uQ29tbWl0RmliZXJSb290PygpOiB2b2lkO1xuICBvbkNvbW1pdEZpYmVyVW5tb3VudD8oKTogdm9pZDtcbiAgY2hlY2tEQ0U/KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsUmVhY3RIb29rKCk6IHZvaWQge1xuICBpZiAod2luZG93Ll9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXykgcmV0dXJuO1xuICBjb25zdCByZW5kZXJlcnMgPSBuZXcgTWFwPG51bWJlciwgUmVuZGVyZXJJbnRlcm5hbHM+KCk7XG4gIGxldCBuZXh0SWQgPSAxO1xuICBjb25zdCBsaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCguLi5hOiB1bmtub3duW10pID0+IHZvaWQ+PigpO1xuXG4gIGNvbnN0IGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rID0ge1xuICAgIHN1cHBvcnRzRmliZXI6IHRydWUsXG4gICAgcmVuZGVyZXJzLFxuICAgIGluamVjdChyZW5kZXJlcikge1xuICAgICAgY29uc3QgaWQgPSBuZXh0SWQrKztcbiAgICAgIHJlbmRlcmVycy5zZXQoaWQsIHJlbmRlcmVyKTtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgICBcIltjb2RleC1wbHVzcGx1c10gUmVhY3QgcmVuZGVyZXIgYXR0YWNoZWQ6XCIsXG4gICAgICAgIHJlbmRlcmVyLnJlbmRlcmVyUGFja2FnZU5hbWUsXG4gICAgICAgIHJlbmRlcmVyLnZlcnNpb24sXG4gICAgICApO1xuICAgICAgcmV0dXJuIGlkO1xuICAgIH0sXG4gICAgb24oZXZlbnQsIGZuKSB7XG4gICAgICBsZXQgcyA9IGxpc3RlbmVycy5nZXQoZXZlbnQpO1xuICAgICAgaWYgKCFzKSBsaXN0ZW5lcnMuc2V0KGV2ZW50LCAocyA9IG5ldyBTZXQoKSkpO1xuICAgICAgcy5hZGQoZm4pO1xuICAgIH0sXG4gICAgb2ZmKGV2ZW50LCBmbikge1xuICAgICAgbGlzdGVuZXJzLmdldChldmVudCk/LmRlbGV0ZShmbik7XG4gICAgfSxcbiAgICBlbWl0KGV2ZW50LCAuLi5hcmdzKSB7XG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZm9yRWFjaCgoZm4pID0+IGZuKC4uLmFyZ3MpKTtcbiAgICB9LFxuICAgIG9uQ29tbWl0RmliZXJSb290KCkge30sXG4gICAgb25Db21taXRGaWJlclVubW91bnQoKSB7fSxcbiAgICBvblNjaGVkdWxlRmliZXJSb290KCkge30sXG4gICAgY2hlY2tEQ0UoKSB7fSxcbiAgfTtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LCBcIl9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfX1wiLCB7XG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiB0cnVlLCAvLyBhbGxvdyByZWFsIERldlRvb2xzIHRvIG92ZXJ3cml0ZSBpZiB1c2VyIGluc3RhbGxzIGl0XG4gICAgdmFsdWU6IGhvb2ssXG4gIH0pO1xuXG4gIHdpbmRvdy5fX2NvZGV4cHBfXyA9IHsgaG9vaywgcmVuZGVyZXJzIH07XG59XG5cbi8qKiBSZXNvbHZlIHRoZSBSZWFjdCBmaWJlciBmb3IgYSBET00gbm9kZSwgaWYgYW55IHJlbmRlcmVyIGhhcyBvbmUuICovXG5leHBvcnQgZnVuY3Rpb24gZmliZXJGb3JOb2RlKG5vZGU6IE5vZGUpOiB1bmtub3duIHwgbnVsbCB7XG4gIGNvbnN0IHJlbmRlcmVycyA9IHdpbmRvdy5fX2NvZGV4cHBfXz8ucmVuZGVyZXJzO1xuICBpZiAocmVuZGVyZXJzKSB7XG4gICAgZm9yIChjb25zdCByIG9mIHJlbmRlcmVycy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgZiA9IHIuZmluZEZpYmVyQnlIb3N0SW5zdGFuY2U/Lihub2RlKTtcbiAgICAgIGlmIChmKSByZXR1cm4gZjtcbiAgICB9XG4gIH1cbiAgLy8gRmFsbGJhY2s6IHJlYWQgdGhlIFJlYWN0IGludGVybmFsIHByb3BlcnR5IGRpcmVjdGx5IGZyb20gdGhlIERPTSBub2RlLlxuICAvLyBSZWFjdCBzdG9yZXMgZmliZXJzIGFzIGEgcHJvcGVydHkgd2hvc2Uga2V5IHN0YXJ0cyB3aXRoIFwiX19yZWFjdEZpYmVyXCIuXG4gIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhub2RlKSkge1xuICAgIGlmIChrLnN0YXJ0c1dpdGgoXCJfX3JlYWN0RmliZXJcIikpIHJldHVybiAobm9kZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrXTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cbiIsICIvKipcbiAqIFNldHRpbmdzIGluamVjdG9yIGZvciBDb2RleCdzIFNldHRpbmdzIHBhZ2UuXG4gKlxuICogQ29kZXgncyBzZXR0aW5ncyBpcyBhIHJvdXRlZCBwYWdlIChVUkwgc3RheXMgYXQgYC9pbmRleC5odG1sP2hvc3RJZD1sb2NhbGApXG4gKiBOT1QgYSBtb2RhbCBkaWFsb2cuIFRoZSBzaWRlYmFyIGxpdmVzIGluc2lkZSBhIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxuICogZ2FwLTEgZ2FwLTBcIj5gIHdyYXBwZXIgdGhhdCBob2xkcyBvbmUgb3IgbW9yZSBgPGRpdiBjbGFzcz1cImZsZXggZmxleC1jb2xcbiAqIGdhcC1weFwiPmAgZ3JvdXBzIG9mIGJ1dHRvbnMuIFRoZXJlIGFyZSBubyBzdGFibGUgYHJvbGVgIC8gYGFyaWEtbGFiZWxgIC9cbiAqIGBkYXRhLXRlc3RpZGAgaG9va3Mgb24gdGhlIHNoZWxsIHNvIHdlIGlkZW50aWZ5IHRoZSBzaWRlYmFyIGJ5IHRleHQtY29udGVudFxuICogbWF0Y2ggYWdhaW5zdCBrbm93biBpdGVtIGxhYmVscyAoR2VuZXJhbCwgQXBwZWFyYW5jZSwgQ29uZmlndXJhdGlvbiwgXHUyMDI2KS5cbiAqXG4gKiBMYXlvdXQgd2UgaW5qZWN0OlxuICpcbiAqICAgR0VORVJBTCAgICAgICAgICAgICAgICAgICAgICAgKHVwcGVyY2FzZSBncm91cCBsYWJlbClcbiAqICAgW0NvZGV4J3MgZXhpc3RpbmcgaXRlbXMgZ3JvdXBdXG4gKiAgIENPREVYKysgICAgICAgICAgICAgICAgICAgICAgICh1cHBlcmNhc2UgZ3JvdXAgbGFiZWwpXG4gKiAgIFx1MjREOCBDb25maWdcbiAqICAgXHUyNjMwIFR3ZWFrc1xuICogICBcdTI1QzcgVHdlYWsgU3RvcmVcbiAqXG4gKiBDbGlja2luZyBDb25maWcgLyBUd2Vha3MgLyBUd2VhayBTdG9yZSBoaWRlcyBDb2RleCdzIGNvbnRlbnQgcGFuZWwgY2hpbGRyZW4gYW5kIHJlbmRlcnNcbiAqIG91ciBvd24gYG1haW4tc3VyZmFjZWAgcGFuZWwgaW4gdGhlaXIgcGxhY2UuIENsaWNraW5nIGFueSBvZiBDb2RleCdzXG4gKiBzaWRlYmFyIGl0ZW1zIHJlc3RvcmVzIHRoZSBvcmlnaW5hbCB2aWV3LlxuICovXG5cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgdHlwZSB7XG4gIFNldHRpbmdzU2VjdGlvbixcbiAgU2V0dGluZ3NQYWdlLFxuICBTZXR0aW5nc0hhbmRsZSxcbiAgVHdlYWtNYW5pZmVzdCxcbn0gZnJvbSBcIkBjb2RleC1wbHVzcGx1cy9zZGtcIjtcbmltcG9ydCB7XG4gIGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwsXG4gIHR5cGUgVHdlYWtTdG9yZUVudHJ5LFxuICB0eXBlIFR3ZWFrU3RvcmVQdWJsaXNoU3VibWlzc2lvbixcbn0gZnJvbSBcIi4uL3R3ZWFrLXN0b3JlXCI7XG5pbXBvcnQge1xuICBzZWxlY3RJbmplY3RlZFNldHRpbmdzR3JvdXBzVG9SZW1vdmUsXG4gIHR5cGUgSW5qZWN0ZWRTZXR0aW5nc0dyb3VwQ2FuZGlkYXRlLFxuICB0eXBlIEluamVjdGVkU2V0dGluZ3NHcm91cEtpbmQsXG59IGZyb20gXCIuL3NldHRpbmdzLXNpZGViYXItZGVkdXBlXCI7XG5cbmNvbnN0IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTCA9IFwiaHR0cHM6Ly9naXRodWIuY29tL2Itbm5ldHQvY29kZXgtcGx1c3BsdXMvcmVsZWFzZXNcIjtcblxuLy8gTWlycm9ycyB0aGUgcnVudGltZSdzIG1haW4tc2lkZSBMaXN0ZWRUd2VhayBzaGFwZSAoa2VwdCBpbiBzeW5jIG1hbnVhbGx5KS5cbmludGVyZmFjZSBMaXN0ZWRUd2VhayB7XG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xuICBlbnRyeTogc3RyaW5nO1xuICBkaXI6IHN0cmluZztcbiAgZW50cnlFeGlzdHM6IGJvb2xlYW47XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZTogVHdlYWtVcGRhdGVDaGVjayB8IG51bGw7XG59XG5cbmludGVyZmFjZSBUd2Vha1VwZGF0ZUNoZWNrIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c0NvbmZpZyB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgYXV0b1VwZGF0ZTogYm9vbGVhbjtcbiAgdXBkYXRlQ2hhbm5lbDogU2VsZlVwZGF0ZUNoYW5uZWw7XG4gIHVwZGF0ZVJlcG86IHN0cmluZztcbiAgdXBkYXRlUmVmOiBzdHJpbmc7XG4gIHVwZGF0ZUNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsO1xuICBzZWxmVXBkYXRlOiBTZWxmVXBkYXRlU3RhdGUgfCBudWxsO1xuICBpbnN0YWxsYXRpb25Tb3VyY2U6IEluc3RhbGxhdGlvblNvdXJjZTtcbn1cblxuaW50ZXJmYWNlIENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB7XG4gIGNoZWNrZWRBdDogc3RyaW5nO1xuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xuICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlTm90ZXM6IHN0cmluZyB8IG51bGw7XG4gIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbnR5cGUgU2VsZlVwZGF0ZUNoYW5uZWwgPSBcInN0YWJsZVwiIHwgXCJwcmVyZWxlYXNlXCIgfCBcImN1c3RvbVwiO1xudHlwZSBTZWxmVXBkYXRlU3RhdHVzID0gXCJjaGVja2luZ1wiIHwgXCJ1cC10by1kYXRlXCIgfCBcInVwZGF0ZWRcIiB8IFwiZmFpbGVkXCIgfCBcImRpc2FibGVkXCI7XG5cbmludGVyZmFjZSBTZWxmVXBkYXRlU3RhdGUge1xuICBjaGVja2VkQXQ6IHN0cmluZztcbiAgY29tcGxldGVkQXQ/OiBzdHJpbmc7XG4gIHN0YXR1czogU2VsZlVwZGF0ZVN0YXR1cztcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcbiAgdGFyZ2V0UmVmOiBzdHJpbmcgfCBudWxsO1xuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICByZXBvOiBzdHJpbmc7XG4gIGNoYW5uZWw6IFNlbGZVcGRhdGVDaGFubmVsO1xuICBzb3VyY2VSb290OiBzdHJpbmc7XG4gIGluc3RhbGxhdGlvblNvdXJjZT86IEluc3RhbGxhdGlvblNvdXJjZTtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJbnN0YWxsYXRpb25Tb3VyY2Uge1xuICBraW5kOiBcImdpdGh1Yi1zb3VyY2VcIiB8IFwiaG9tZWJyZXdcIiB8IFwibG9jYWwtZGV2XCIgfCBcInNvdXJjZS1hcmNoaXZlXCIgfCBcInVua25vd25cIjtcbiAgbGFiZWw6IHN0cmluZztcbiAgZGV0YWlsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBXYXRjaGVySGVhbHRoIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIHN0YXR1czogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk6IHN0cmluZztcbiAgd2F0Y2hlcjogc3RyaW5nO1xuICBjaGVja3M6IFdhdGNoZXJIZWFsdGhDaGVja1tdO1xufVxuXG5pbnRlcmZhY2UgV2F0Y2hlckhlYWx0aENoZWNrIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzdGF0dXM6IFwib2tcIiB8IFwid2FyblwiIHwgXCJlcnJvclwiO1xuICBkZXRhaWw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFR3ZWFrU3RvcmVSZWdpc3RyeVZpZXcge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgc291cmNlVXJsOiBzdHJpbmc7XG4gIGZldGNoZWRBdDogc3RyaW5nO1xuICBlbnRyaWVzOiBUd2Vha1N0b3JlRW50cnlWaWV3W107XG59XG5cbmludGVyZmFjZSBUd2Vha1N0b3JlRW50cnlWaWV3IGV4dGVuZHMgVHdlYWtTdG9yZUVudHJ5IHtcbiAgaW5zdGFsbGVkOiB7XG4gICAgdmVyc2lvbjogc3RyaW5nO1xuICAgIGVuYWJsZWQ6IGJvb2xlYW47XG4gIH0gfCBudWxsO1xuICBwbGF0Zm9ybT86IHtcbiAgICBjdXJyZW50OiBzdHJpbmc7XG4gICAgc3VwcG9ydGVkOiBzdHJpbmdbXSB8IG51bGw7XG4gICAgY29tcGF0aWJsZTogYm9vbGVhbjtcbiAgICByZWFzb246IHN0cmluZyB8IG51bGw7XG4gIH07XG4gIHJ1bnRpbWU/OiB7XG4gICAgY3VycmVudDogc3RyaW5nO1xuICAgIHJlcXVpcmVkOiBzdHJpbmcgfCBudWxsO1xuICAgIGNvbXBhdGlibGU6IGJvb2xlYW47XG4gICAgcmVhc29uOiBzdHJpbmcgfCBudWxsO1xuICB9O1xufVxuXG4vKipcbiAqIEEgdHdlYWstcmVnaXN0ZXJlZCBwYWdlLiBXZSBjYXJyeSB0aGUgb3duaW5nIHR3ZWFrJ3MgbWFuaWZlc3Qgc28gd2UgY2FuXG4gKiByZXNvbHZlIHJlbGF0aXZlIGljb25VcmxzIGFuZCBzaG93IGF1dGhvcnNoaXAgaW4gdGhlIHBhZ2UgaGVhZGVyLlxuICovXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZFBhZ2Uge1xuICAvKiogRnVsbHktcXVhbGlmaWVkIGlkOiBgPHR3ZWFrSWQ+OjxwYWdlSWQ+YC4gKi9cbiAgaWQ6IHN0cmluZztcbiAgdHdlYWtJZDogc3RyaW5nO1xuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcbiAgcGFnZTogU2V0dGluZ3NQYWdlO1xuICAvKiogUGVyLXBhZ2UgRE9NIHRlYXJkb3duIHJldHVybmVkIGJ5IGBwYWdlLnJlbmRlcmAsIGlmIGFueS4gKi9cbiAgdGVhcmRvd24/OiAoKCkgPT4gdm9pZCkgfCBudWxsO1xuICAvKiogVGhlIGluamVjdGVkIHNpZGViYXIgYnV0dG9uIChzbyB3ZSBjYW4gdXBkYXRlIGl0cyBhY3RpdmUgc3RhdGUpLiAqL1xuICBuYXZCdXR0b24/OiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG59XG5cbi8qKiBXaGF0IHBhZ2UgaXMgY3VycmVudGx5IHNlbGVjdGVkIGluIG91ciBpbmplY3RlZCBuYXYuICovXG50eXBlIEFjdGl2ZVBhZ2UgPVxuICB8IHsga2luZDogXCJjb25maWdcIiB9XG4gIHwgeyBraW5kOiBcInN0b3JlXCIgfVxuICB8IHsga2luZDogXCJ0d2Vha3NcIiB9XG4gIHwgeyBraW5kOiBcInJlZ2lzdGVyZWRcIjsgaWQ6IHN0cmluZyB9O1xuXG5pbnRlcmZhY2UgSW5qZWN0b3JTdGF0ZSB7XG4gIHNlY3Rpb25zOiBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb24+O1xuICBwYWdlczogTWFwPHN0cmluZywgUmVnaXN0ZXJlZFBhZ2U+O1xuICBsaXN0ZWRUd2Vha3M6IExpc3RlZFR3ZWFrW107XG4gIC8qKiBPdXRlciB3cmFwcGVyIHRoYXQgaG9sZHMgQ29kZXgncyBpdGVtcyBncm91cCArIG91ciBpbmplY3RlZCBncm91cHMuICovXG4gIG91dGVyV3JhcHBlcjogSFRNTEVsZW1lbnQgfCBudWxsO1xuICAvKiogT3VyIFwiR2VuZXJhbFwiIGxhYmVsIGZvciBDb2RleCdzIG5hdGl2ZSBzZXR0aW5ncyBncm91cC4gKi9cbiAgbmF0aXZlTmF2SGVhZGVyOiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIC8qKiBPdXIgXCJDb2RleCsrXCIgbmF2IGdyb3VwIChDb25maWcvVHdlYWtzKS4gKi9cbiAgbmF2R3JvdXA6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgbmF2QnV0dG9uczogeyBjb25maWc6IEhUTUxCdXR0b25FbGVtZW50OyB0d2Vha3M6IEhUTUxCdXR0b25FbGVtZW50OyBzdG9yZTogSFRNTEJ1dHRvbkVsZW1lbnQgfSB8IG51bGw7XG4gIC8qKiBTaWRlYmFyIHVwZGF0ZSBwaWxsIHNob3duIG9ubHkgd2hlbiBHaXRIdWIgaGFzIGEgbmV3ZXIgQ29kZXgrKyByZWxlYXNlLiAqL1xuICBjb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XG4gIC8qKiBPdXIgXCJUd2Vha3NcIiBuYXYgZ3JvdXAgKHBlci10d2VhayBwYWdlcykuIENyZWF0ZWQgbGF6aWx5LiAqL1xuICBwYWdlc0dyb3VwOiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHBhZ2VzR3JvdXBLZXk6IHN0cmluZyB8IG51bGw7XG4gIHBhbmVsSG9zdDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGw7XG4gIGZpbmdlcnByaW50OiBzdHJpbmcgfCBudWxsO1xuICBzaWRlYmFyRHVtcGVkOiBib29sZWFuO1xuICBhY3RpdmVQYWdlOiBBY3RpdmVQYWdlIHwgbnVsbDtcbiAgc2lkZWJhclJvb3Q6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgc2lkZWJhclJlc3RvcmVIYW5kbGVyOiAoKGU6IEV2ZW50KSA9PiB2b2lkKSB8IG51bGw7XG4gIHNldHRpbmdzU3VyZmFjZVZpc2libGU6IGJvb2xlYW47XG4gIHNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsO1xuICB0d2Vha1N0b3JlOiBUd2Vha1N0b3JlUmVnaXN0cnlWaWV3IHwgbnVsbDtcbiAgdHdlYWtTdG9yZVByb21pc2U6IFByb21pc2U8VHdlYWtTdG9yZVJlZ2lzdHJ5Vmlldz4gfCBudWxsO1xuICB0d2Vha1N0b3JlRXJyb3I6IHVua25vd247XG59XG5cbmNvbnN0IHN0YXRlOiBJbmplY3RvclN0YXRlID0ge1xuICBzZWN0aW9uczogbmV3IE1hcCgpLFxuICBwYWdlczogbmV3IE1hcCgpLFxuICBsaXN0ZWRUd2Vha3M6IFtdLFxuICBvdXRlcldyYXBwZXI6IG51bGwsXG4gIG5hdGl2ZU5hdkhlYWRlcjogbnVsbCxcbiAgbmF2R3JvdXA6IG51bGwsXG4gIG5hdkJ1dHRvbnM6IG51bGwsXG4gIGNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b246IG51bGwsXG4gIHBhZ2VzR3JvdXA6IG51bGwsXG4gIHBhZ2VzR3JvdXBLZXk6IG51bGwsXG4gIHBhbmVsSG9zdDogbnVsbCxcbiAgb2JzZXJ2ZXI6IG51bGwsXG4gIGZpbmdlcnByaW50OiBudWxsLFxuICBzaWRlYmFyRHVtcGVkOiBmYWxzZSxcbiAgYWN0aXZlUGFnZTogbnVsbCxcbiAgc2lkZWJhclJvb3Q6IG51bGwsXG4gIHNpZGViYXJSZXN0b3JlSGFuZGxlcjogbnVsbCxcbiAgc2V0dGluZ3NTdXJmYWNlVmlzaWJsZTogZmFsc2UsXG4gIHNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcjogbnVsbCxcbiAgdHdlYWtTdG9yZTogbnVsbCxcbiAgdHdlYWtTdG9yZVByb21pc2U6IG51bGwsXG4gIHR3ZWFrU3RvcmVFcnJvcjogbnVsbCxcbn07XG5cbmZ1bmN0aW9uIHBsb2cobXNnOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xuICBpcGNSZW5kZXJlci5zZW5kKFxuICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgIFwiaW5mb1wiLFxuICAgIGBbc2V0dGluZ3MtaW5qZWN0b3JdICR7bXNnfSR7ZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpfWAsXG4gICk7XG59XG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFN0cmluZyh2KTtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgcHVibGljIEFQSSBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0U2V0dGluZ3NJbmplY3RvcigpOiB2b2lkIHtcbiAgaWYgKHN0YXRlLm9ic2VydmVyKSByZXR1cm47XG5cbiAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgIHRyeUluamVjdCgpO1xuICAgIG1heWJlRHVtcERvbSgpO1xuICB9KTtcbiAgb2JzLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgc3RhdGUub2JzZXJ2ZXIgPSBvYnM7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJwb3BzdGF0ZVwiLCBvbk5hdik7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiaGFzaGNoYW5nZVwiLCBvbk5hdik7XG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBvbkRvY3VtZW50Q2xpY2ssIHRydWUpO1xuICBmb3IgKGNvbnN0IG0gb2YgW1wicHVzaFN0YXRlXCIsIFwicmVwbGFjZVN0YXRlXCJdIGFzIGNvbnN0KSB7XG4gICAgY29uc3Qgb3JpZyA9IGhpc3RvcnlbbV07XG4gICAgaGlzdG9yeVttXSA9IGZ1bmN0aW9uICh0aGlzOiBIaXN0b3J5LCAuLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBvcmlnPikge1xuICAgICAgY29uc3QgciA9IG9yaWcuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoYGNvZGV4cHAtJHttfWApKTtcbiAgICAgIHJldHVybiByO1xuICAgIH0gYXMgdHlwZW9mIG9yaWc7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoYGNvZGV4cHAtJHttfWAsIG9uTmF2KTtcbiAgfVxuXG4gIHRyeUluamVjdCgpO1xuICBtYXliZUR1bXBEb20oKTtcbiAgbGV0IHRpY2tzID0gMDtcbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgdGlja3MrKztcbiAgICB0cnlJbmplY3QoKTtcbiAgICBtYXliZUR1bXBEb20oKTtcbiAgICBpZiAodGlja3MgPiA2MCkgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gIH0sIDUwMCk7XG59XG5cbmZ1bmN0aW9uIG9uTmF2KCk6IHZvaWQge1xuICBzdGF0ZS5maW5nZXJwcmludCA9IG51bGw7XG4gIHRyeUluamVjdCgpO1xuICBtYXliZUR1bXBEb20oKTtcbn1cblxuZnVuY3Rpb24gb25Eb2N1bWVudENsaWNrKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZS50YXJnZXQgOiBudWxsO1xuICBjb25zdCBjb250cm9sID0gdGFyZ2V0Py5jbG9zZXN0KFwiW3JvbGU9J2xpbmsnXSxidXR0b24sYVwiKTtcbiAgaWYgKCEoY29udHJvbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkgcmV0dXJuO1xuICBpZiAoY29tcGFjdFNldHRpbmdzVGV4dChjb250cm9sLnRleHRDb250ZW50IHx8IFwiXCIpICE9PSBcIkJhY2sgdG8gYXBwXCIpIHJldHVybjtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZShmYWxzZSwgXCJiYWNrLXRvLWFwcFwiKTtcbiAgfSwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNlY3Rpb24oc2VjdGlvbjogU2V0dGluZ3NTZWN0aW9uKTogU2V0dGluZ3NIYW5kbGUge1xuICBzdGF0ZS5zZWN0aW9ucy5zZXQoc2VjdGlvbi5pZCwgc2VjdGlvbik7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICByZXR1cm4ge1xuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcbiAgICAgIHN0YXRlLnNlY3Rpb25zLmRlbGV0ZShzZWN0aW9uLmlkKTtcbiAgICAgIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclNlY3Rpb25zKCk6IHZvaWQge1xuICBzdGF0ZS5zZWN0aW9ucy5jbGVhcigpO1xuICAvLyBEcm9wIHJlZ2lzdGVyZWQgcGFnZXMgdG9vIFx1MjAxNCB0aGV5J3JlIG93bmVkIGJ5IHR3ZWFrcyB0aGF0IGp1c3QgZ290XG4gIC8vIHRvcm4gZG93biBieSB0aGUgaG9zdC4gUnVuIGFueSB0ZWFyZG93bnMgYmVmb3JlIGZvcmdldHRpbmcgdGhlbS5cbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHAudGVhcmRvd24/LigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHBsb2coXCJwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBwLmlkLCBlcnI6IFN0cmluZyhlKSB9KTtcbiAgICB9XG4gIH1cbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcbiAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgLy8gSWYgd2Ugd2VyZSBvbiBhIHJlZ2lzdGVyZWQgcGFnZSB0aGF0IG5vIGxvbmdlciBleGlzdHMsIGZhbGwgYmFjayB0b1xuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxuICBpZiAoXG4gICAgc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiZcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXG4gICkge1xuICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XG4gICAgcmVyZW5kZXIoKTtcbiAgfVxufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdHdlYWstb3duZWQgc2V0dGluZ3MgcGFnZS4gVGhlIHJ1bnRpbWUgaW5qZWN0cyBhIHNpZGViYXIgZW50cnlcbiAqIHVuZGVyIGEgXCJUV0VBS1NcIiBncm91cCBoZWFkZXIgKHdoaWNoIGFwcGVhcnMgb25seSB3aGVuIGF0IGxlYXN0IG9uZSBwYWdlXG4gKiBpcyByZWdpc3RlcmVkKSBhbmQgcm91dGVzIGNsaWNrcyB0byB0aGUgcGFnZSdzIGByZW5kZXIocm9vdClgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQYWdlKFxuICB0d2Vha0lkOiBzdHJpbmcsXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LFxuICBwYWdlOiBTZXR0aW5nc1BhZ2UsXG4pOiBTZXR0aW5nc0hhbmRsZSB7XG4gIGNvbnN0IGlkID0gcGFnZS5pZDsgLy8gYWxyZWFkeSBuYW1lc3BhY2VkIGJ5IHR3ZWFrLWhvc3QgYXMgYCR7dHdlYWtJZH06JHtwYWdlLmlkfWBcbiAgY29uc3QgZW50cnk6IFJlZ2lzdGVyZWRQYWdlID0geyBpZCwgdHdlYWtJZCwgbWFuaWZlc3QsIHBhZ2UgfTtcbiAgc3RhdGUucGFnZXMuc2V0KGlkLCBlbnRyeSk7XG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XG4gIHN5bmNQYWdlc0dyb3VwKCk7XG4gIC8vIElmIHRoZSB1c2VyIHdhcyBhbHJlYWR5IG9uIHRoaXMgcGFnZSAoaG90IHJlbG9hZCksIHJlLW1vdW50IGl0cyBib2R5LlxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICByZXJlbmRlcigpO1xuICB9XG4gIHJldHVybiB7XG4gICAgdW5yZWdpc3RlcjogKCkgPT4ge1xuICAgICAgY29uc3QgZSA9IHN0YXRlLnBhZ2VzLmdldChpZCk7XG4gICAgICBpZiAoIWUpIHJldHVybjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGUudGVhcmRvd24/LigpO1xuICAgICAgfSBjYXRjaCB7fVxuICAgICAgc3RhdGUucGFnZXMuZGVsZXRlKGlkKTtcbiAgICAgIHN5bmNQYWdlc0dyb3VwKCk7XG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBDYWxsZWQgYnkgdGhlIHR3ZWFrIGhvc3QgYWZ0ZXIgZmV0Y2hpbmcgdGhlIHR3ZWFrIGxpc3QgZnJvbSBtYWluLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldExpc3RlZFR3ZWFrcyhsaXN0OiBMaXN0ZWRUd2Vha1tdKTogdm9pZCB7XG4gIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IGxpc3Q7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaW5qZWN0aW9uIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiB0cnlJbmplY3QoKTogdm9pZCB7XG4gIHJlbW92ZU1pc3BsYWNlZFNldHRpbmdzR3JvdXBzKCk7XG5cbiAgY29uc3QgaXRlbXNHcm91cCA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xuICBpZiAoIWl0ZW1zR3JvdXApIHtcbiAgICBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpO1xuICAgIHBsb2coXCJzaWRlYmFyIG5vdCBmb3VuZFwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcikge1xuICAgIGNsZWFyVGltZW91dChzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIpO1xuICAgIHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lciA9IG51bGw7XG4gIH1cbiAgc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZSh0cnVlLCBcInNpZGViYXItZm91bmRcIik7XG4gIC8vIENvZGV4J3MgaXRlbXMgZ3JvdXAgbGl2ZXMgaW5zaWRlIGFuIG91dGVyIHdyYXBwZXIgdGhhdCdzIGFscmVhZHkgc3R5bGVkXG4gIC8vIHRvIGhvbGQgbXVsdGlwbGUgZ3JvdXBzIChgZmxleCBmbGV4LWNvbCBnYXAtMSBnYXAtMGApLiBXZSBpbmplY3Qgb3VyXG4gIC8vIGdyb3VwIGFzIGEgc2libGluZyBzbyB0aGUgbmF0dXJhbCBnYXAtMSBhY3RzIGFzIG91ciB2aXN1YWwgc2VwYXJhdG9yLlxuICBjb25zdCBvdXRlciA9IGl0ZW1zR3JvdXAucGFyZW50RWxlbWVudCA/PyBpdGVtc0dyb3VwO1xuICBpZiAoIWlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKGl0ZW1zR3JvdXApIHx8ICFpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShvdXRlcikpIHtcbiAgICBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpO1xuICAgIHBsb2coXCJyZWplY3RlZCBub24tc2V0dGluZ3Mgc2lkZWJhciBjYW5kaWRhdGVcIiwge1xuICAgICAgaXRlbXNHcm91cDogZGVzY3JpYmUoaXRlbXNHcm91cCksXG4gICAgICBvdXRlcjogZGVzY3JpYmUob3V0ZXIpLFxuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG91dGVyO1xuICBzeW5jTmF0aXZlU2V0dGluZ3NIZWFkZXIoaXRlbXNHcm91cCwgb3V0ZXIpO1xuXG4gIGlmIChzdGF0ZS5uYXZHcm91cCAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5uYXZHcm91cCkpIHtcbiAgICBzeW5jUGFnZXNHcm91cCgpO1xuICAgIC8vIENvZGV4IHJlLXJlbmRlcnMgaXRzIG5hdGl2ZSBzaWRlYmFyIGJ1dHRvbnMgb24gaXRzIG93biBzdGF0ZSBjaGFuZ2VzLlxuICAgIC8vIElmIG9uZSBvZiBvdXIgcGFnZXMgaXMgYWN0aXZlLCByZS1zdHJpcCBDb2RleCdzIGFjdGl2ZSBzdHlsaW5nIHNvXG4gICAgLy8gR2VuZXJhbCBkb2Vzbid0IHJlYXBwZWFyIGFzIHNlbGVjdGVkLlxuICAgIGlmIChzdGF0ZS5hY3RpdmVQYWdlICE9PSBudWxsKSBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUodHJ1ZSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gU2lkZWJhciB3YXMgZWl0aGVyIGZyZXNobHkgbW91bnRlZCAoU2V0dGluZ3MganVzdCBvcGVuZWQpIG9yIHJlLW1vdW50ZWRcbiAgLy8gKGNsb3NlZCBhbmQgcmUtb3BlbmVkLCBvciBuYXZpZ2F0ZWQgYXdheSBhbmQgYmFjaykuIEluIGFsbCBvZiB0aG9zZVxuICAvLyBjYXNlcyBDb2RleCByZXNldHMgdG8gaXRzIGRlZmF1bHQgcGFnZSAoR2VuZXJhbCksIGJ1dCBvdXIgaW4tbWVtb3J5XG4gIC8vIGBhY3RpdmVQYWdlYCBtYXkgc3RpbGwgcmVmZXJlbmNlIHRoZSBsYXN0IHR3ZWFrL3BhZ2UgdGhlIHVzZXIgaGFkIG9wZW5cbiAgLy8gXHUyMDE0IHdoaWNoIHdvdWxkIGNhdXNlIHRoYXQgbmF2IGJ1dHRvbiB0byByZW5kZXIgd2l0aCB0aGUgYWN0aXZlIHN0eWxpbmdcbiAgLy8gZXZlbiB0aG91Z2ggQ29kZXggaXMgc2hvd2luZyBHZW5lcmFsLiBDbGVhciBpdCBzbyBgc3luY1BhZ2VzR3JvdXBgIC9cbiAgLy8gYHNldE5hdkFjdGl2ZWAgc3RhcnQgZnJvbSBhIG5ldXRyYWwgc3RhdGUuIFRoZSBwYW5lbEhvc3QgcmVmZXJlbmNlIGlzXG4gIC8vIGFsc28gc3RhbGUgKGl0cyBET00gd2FzIGRpc2NhcmRlZCB3aXRoIHRoZSBwcmV2aW91cyBjb250ZW50IGFyZWEpLlxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZSAhPT0gbnVsbCB8fCBzdGF0ZS5wYW5lbEhvc3QgIT09IG51bGwpIHtcbiAgICBwbG9nKFwic2lkZWJhciByZS1tb3VudCBkZXRlY3RlZDsgY2xlYXJpbmcgc3RhbGUgYWN0aXZlIHN0YXRlXCIsIHtcbiAgICAgIHByZXZBY3RpdmU6IHN0YXRlLmFjdGl2ZVBhZ2UsXG4gICAgfSk7XG4gICAgc3RhdGUuYWN0aXZlUGFnZSA9IG51bGw7XG4gICAgc3RhdGUucGFuZWxIb3N0ID0gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGV4aXN0aW5nQ29kZXhQcE5hdkdyb3VwID1cbiAgICBvdXRlci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignOnNjb3BlID4gW2RhdGEtY29kZXhwcD1cIm5hdi1ncm91cFwiXScpID8/XG4gICAgb3V0ZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ1tkYXRhLWNvZGV4cHA9XCJuYXYtZ3JvdXBcIl0nKTtcblxuICBpZiAoZXhpc3RpbmdDb2RleFBwTmF2R3JvdXApIHtcbiAgICBzdGF0ZS5uYXZHcm91cCA9IGV4aXN0aW5nQ29kZXhQcE5hdkdyb3VwO1xuICAgIHN0YXRlLmNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24gPSBleGlzdGluZ0NvZGV4UHBOYXZHcm91cC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcbiAgICAgIFwiW2RhdGEtY29kZXhwcC1zaWRlYmFyLXVwZGF0ZV1cIixcbiAgICApO1xuICAgIHN0YXRlLnNpZGViYXJSb290ID0gb3V0ZXI7XG4gICAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgICByZWZyZXNoU2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oKTtcbiAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZSAhPT0gbnVsbCkgc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKHRydWUpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMCBHcm91cCBjb250YWluZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IGdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZ3JvdXAuZGF0YXNldC5jb2RleHBwID0gXCJuYXYtZ3JvdXBcIjtcbiAgZ3JvdXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1weFwiO1xuXG4gIGNvbnN0IHVwZGF0ZUJ1dHRvbiA9IHNpZGViYXJVcGRhdGVQaWxsQnV0dG9uKCk7XG4gIHN0YXRlLmNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24gPSB1cGRhdGVCdXR0b247XG4gIGdyb3VwLmFwcGVuZENoaWxkKHNpZGViYXJHcm91cEhlYWRlcihcIkNvZGV4KytcIiwgXCJwdC0zXCIsIHVwZGF0ZUJ1dHRvbikpO1xuICByZWZyZXNoU2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgU2lkZWJhciBpdGVtcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgY29uc3QgY29uZmlnQnRuID0gbWFrZVNpZGViYXJJdGVtKFwiQ29uZmlnXCIsIGNvbmZpZ0ljb25TdmcoKSk7XG4gIGNvbnN0IHR3ZWFrc0J0biA9IG1ha2VTaWRlYmFySXRlbShcIlR3ZWFrc1wiLCB0d2Vha3NJY29uU3ZnKCkpO1xuICBjb25zdCBzdG9yZUJ0biA9IG1ha2VTaWRlYmFySXRlbShcIlR3ZWFrIFN0b3JlXCIsIHN0b3JlSWNvblN2ZygpKTtcbiAgYXBwZW5kU2lkZWJhclN0b3JlVXBkYXRlQmFkZ2Uoc3RvcmVCdG4pO1xuXG4gIGNvbmZpZ0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcImNvbmZpZ1wiIH0pO1xuICB9KTtcbiAgdHdlYWtzQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwidHdlYWtzXCIgfSk7XG4gIH0pO1xuICBzdG9yZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcInN0b3JlXCIgfSk7XG4gIH0pO1xuXG4gIGdyb3VwLmFwcGVuZENoaWxkKGNvbmZpZ0J0bik7XG4gIGdyb3VwLmFwcGVuZENoaWxkKHR3ZWFrc0J0bik7XG4gIGdyb3VwLmFwcGVuZENoaWxkKHN0b3JlQnRuKTtcbiAgb3V0ZXIuYXBwZW5kQ2hpbGQoZ3JvdXApO1xuXG4gIHN0YXRlLm5hdkdyb3VwID0gZ3JvdXA7XG4gIHN0YXRlLm5hdkJ1dHRvbnMgPSB7IGNvbmZpZzogY29uZmlnQnRuLCB0d2Vha3M6IHR3ZWFrc0J0biwgc3RvcmU6IHN0b3JlQnRuIH07XG4gIHBsb2coXCJuYXYgZ3JvdXAgaW5qZWN0ZWRcIiwgeyBvdXRlclRhZzogb3V0ZXIudGFnTmFtZSB9KTtcbiAgc3luY1BhZ2VzR3JvdXAoKTtcbn1cblxuZnVuY3Rpb24gc3luY05hdGl2ZVNldHRpbmdzSGVhZGVyKGl0ZW1zR3JvdXA6IEhUTUxFbGVtZW50LCBvdXRlcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgaWYgKHN0YXRlLm5hdGl2ZU5hdkhlYWRlciAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5uYXRpdmVOYXZIZWFkZXIpKSByZXR1cm47XG4gIGlmIChvdXRlciA9PT0gaXRlbXNHcm91cCkgcmV0dXJuO1xuXG4gIGNvbnN0IGhlYWRlciA9IHNpZGViYXJHcm91cEhlYWRlcihcIkdlbmVyYWxcIik7XG4gIGhlYWRlci5kYXRhc2V0LmNvZGV4cHAgPSBcIm5hdGl2ZS1uYXYtaGVhZGVyXCI7XG4gIG91dGVyLmluc2VydEJlZm9yZShoZWFkZXIsIGl0ZW1zR3JvdXApO1xuICBzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPSBoZWFkZXI7XG59XG5cbmZ1bmN0aW9uIHNpZGViYXJHcm91cEhlYWRlcih0ZXh0OiBzdHJpbmcsIHRvcFBhZGRpbmcgPSBcInB0LTJcIiwgdHJhaWxpbmc/OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyLmNsYXNzTmFtZSA9XG4gICAgYHB4LXJvdy14ICR7dG9wUGFkZGluZ30gcGItMSBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTIgdGV4dC1bMTFweF0gZm9udC1tZWRpdW0gdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVyIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBzZWxlY3Qtbm9uZWA7XG4gIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJ1bmNhdGVcIjtcbiAgbGFiZWwudGV4dENvbnRlbnQgPSB0ZXh0O1xuICBoZWFkZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICBpZiAodHJhaWxpbmcpIGhlYWRlci5hcHBlbmRDaGlsZCh0cmFpbGluZyk7XG4gIHJldHVybiBoZWFkZXI7XG59XG5cbmZ1bmN0aW9uIHNjaGVkdWxlU2V0dGluZ3NTdXJmYWNlSGlkZGVuKCk6IHZvaWQge1xuICBpZiAoIXN0YXRlLnNldHRpbmdzU3VyZmFjZVZpc2libGUgfHwgc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyKSByZXR1cm47XG4gIHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lciA9IG51bGw7XG4gICAgY29uc3Qgc2lkZWJhciA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xuICAgIGlmIChzaWRlYmFyICYmIGlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKHNpZGViYXIpKSByZXR1cm47XG4gICAgaWYgKGlzU2V0dGluZ3NUZXh0VmlzaWJsZSgpKSByZXR1cm47XG4gICAgc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZShmYWxzZSwgXCJzaWRlYmFyLW5vdC1mb3VuZFwiKTtcbiAgfSwgMTUwMCk7XG59XG5cbmZ1bmN0aW9uIGlzU2V0dGluZ3NUZXh0VmlzaWJsZSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIGlzQ29kZXhQcFNldHRpbmdzTGFiZWxTZXQoY29kZXhQcFNldHRpbmdzTGFiZWxzRnJvbShkb2N1bWVudCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U2V0dGluZ3NUZXh0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlIHx8IFwiXCIpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKTtcbn1cblxuY29uc3QgQ09ERVhQUF9DT1JFX1NFVFRJTkdTX0xBQkVMUyA9IFtcbiAgXCJHZW5lcmFsXCIsXG4gIFwiXHU1RTM4XHU4OUM0XCIsXG4gIFwiXHU5MDFBXHU3NTI4XCIsXG4gIFwiQXBwZWFyYW5jZVwiLFxuICBcIlx1NTkxNlx1ODlDMlwiLFxuICBcIkNvbmZpZ3VyYXRpb25cIixcbiAgXCJcdTkxNERcdTdGNkVcIixcbiAgXCJcdTlFRDhcdThCQTRcdTY3NDNcdTk2NTBcIixcbiAgXCJQZXJzb25hbGl6YXRpb25cIixcbiAgXCJcdTRFMkFcdTYwMjdcdTUzMTZcIixcbl0ubWFwKG5vcm1hbGl6ZUNvZGV4UHBTZXR0aW5nc0xhYmVsKTtcblxuY29uc3QgQ09ERVhQUF9FWFRFTkRFRF9TRVRUSU5HU19MQUJFTFMgPSBbXG4gIFwiQWNjb3VudFwiLFxuICBcIlx1OEQyNlx1NjIzN1wiLFxuICBcIlx1OEQyNlx1NTNGN1wiLFxuICBcIkdlbmVyYWxcIixcbiAgXCJcdTVFMzhcdTg5QzRcIixcbiAgXCJcdTkwMUFcdTc1MjhcIixcbiAgXCJBcHBlYXJhbmNlXCIsXG4gIFwiXHU1OTE2XHU4OUMyXCIsXG4gIFwiQ29uZmlndXJhdGlvblwiLFxuICBcIlx1OTE0RFx1N0Y2RVwiLFxuICBcIlx1OUVEOFx1OEJBNFx1Njc0M1x1OTY1MFwiLFxuICBcIlBlcnNvbmFsaXphdGlvblwiLFxuICBcIlx1NEUyQVx1NjAyN1x1NTMxNlwiLFxuICBcIktleWJvYXJkIHNob3J0Y3V0c1wiLFxuICBcIkFyY2hpdmVkIGNoYXRzXCIsXG4gIFwiVXNhZ2VcIixcbiAgXCJDb21wdXRlciB1c2VcIixcbiAgXCJCcm93c2VyIHVzZVwiLFxuICBcIk1DUCBzZXJ2ZXJzXCIsXG4gIFwiTUNQIFNlcnZlcnNcIixcbiAgXCJNQ1AgXHU2NzBEXHU1MkExXHU1NjY4XCIsXG4gIFwiR2l0XCIsXG4gIFwiRW52aXJvbm1lbnRzXCIsXG4gIFwiXHU3M0FGXHU1ODgzXCIsXG4gIFwiQ2xvdWQgRW52aXJvbm1lbnRzXCIsXG4gIFwiV29ya3RyZWVzXCIsXG4gIFwiQ29ubmVjdGlvbnNcIixcbiAgXCJQbHVnaW5zXCIsXG4gIFwiU2tpbGxzXCIsXG5dLm1hcChub3JtYWxpemVDb2RleFBwU2V0dGluZ3NMYWJlbCk7XG5cbmNvbnN0IENPREVYUFBfU0VUVElOR1NfT05MWV9MQUJFTFMgPSBbXG4gIFwiR2VuZXJhbFwiLFxuICBcIlx1NUUzOFx1ODlDNFwiLFxuICBcIlx1OTAxQVx1NzUyOFwiLFxuICBcIkFwcGVhcmFuY2VcIixcbiAgXCJcdTU5MTZcdTg5QzJcIixcbiAgXCJDb25maWd1cmF0aW9uXCIsXG4gIFwiXHU5MTREXHU3RjZFXCIsXG4gIFwiXHU5RUQ4XHU4QkE0XHU2NzQzXHU5NjUwXCIsXG4gIFwiUGVyc29uYWxpemF0aW9uXCIsXG4gIFwiXHU0RTJBXHU2MDI3XHU1MzE2XCIsXG4gIFwiS2V5Ym9hcmQgc2hvcnRjdXRzXCIsXG4gIFwiQXJjaGl2ZWQgY2hhdHNcIixcbiAgXCJVc2FnZVwiLFxuICBcIkNvbXB1dGVyIHVzZVwiLFxuICBcIkJyb3dzZXIgdXNlXCIsXG4gIFwiTUNQIHNlcnZlcnNcIixcbiAgXCJNQ1AgU2VydmVyc1wiLFxuICBcIk1DUCBcdTY3MERcdTUyQTFcdTU2NjhcIixcbiAgXCJHaXRcIixcbiAgXCJFbnZpcm9ubWVudHNcIixcbiAgXCJcdTczQUZcdTU4ODNcIixcbiAgXCJDbG91ZCBFbnZpcm9ubWVudHNcIixcbiAgXCJXb3JrdHJlZXNcIixcbiAgXCJDb25uZWN0aW9uc1wiLFxuXS5tYXAobm9ybWFsaXplQ29kZXhQcFNldHRpbmdzTGFiZWwpO1xuXG5jb25zdCBDT0RFWFBQX01BSU5fQVBQX05BVl9MQUJFTFMgPSBbXG4gIFwiTmV3IGNoYXRcIixcbiAgXCJRdWljayBjaGF0XCIsXG4gIFwiXHU1RkVCXHU5MDFGXHU1QkY5XHU4QkREXCIsXG4gIFwiU2VhcmNoXCIsXG4gIFwiXHU2NDFDXHU3RDIyXCIsXG4gIFwiUGx1Z2luc1wiLFxuICBcIlx1NjNEMlx1NEVGNlwiLFxuICBcIkF1dG9tYXRpb25zXCIsXG4gIFwiQXV0b21hdGlvblwiLFxuICBcIlx1ODFFQVx1NTJBOFx1NTMxNlwiLFxuICBcIkNoYXRzXCIsXG4gIFwiQ2hhdFwiLFxuICBcIlx1NUJGOVx1OEJERFwiLFxuICBcIlByb2plY3RzXCIsXG4gIFwiXHU5ODc5XHU3NkVFXCIsXG4gIFwiUGlubmVkXCIsXG4gIFwiU2V0dGluZ3NcIixcbiAgXCJcdThCQkVcdTdGNkVcIixcbiAgXCJXb3JrIGxvY2FsbHlcIixcbl0ubWFwKG5vcm1hbGl6ZUNvZGV4UHBTZXR0aW5nc0xhYmVsKTtcblxuZnVuY3Rpb24gbm9ybWFsaXplQ29kZXhQcFNldHRpbmdzTGFiZWwodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBjb21wYWN0U2V0dGluZ3NUZXh0KHZhbHVlKVxuICAgIC50b0xvY2FsZUxvd2VyQ2FzZSgpXG4gICAgLm5vcm1hbGl6ZShcIk5GRFwiKVxuICAgIC5yZXBsYWNlKC9bXFx1MDMwMC1cXHUwMzZmXS9nLCBcIlwiKVxuICAgIC5yZXBsYWNlKC9bXHUyMDE5XHUyMDE4YFx1MDBCNF0vZywgXCInXCIpXG4gICAgLnJlcGxhY2UoL1xccysvZywgXCIgXCIpXG4gICAgLnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gY29kZXhQcENvbnRyb2xMYWJlbChlbDogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplQ29kZXhQcFNldHRpbmdzTGFiZWwoXG4gICAgZWwuZ2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiKSB8fFxuICAgICAgZWwuZ2V0QXR0cmlidXRlKFwidGl0bGVcIikgfHxcbiAgICAgIGVsLnRleHRDb250ZW50IHx8XG4gICAgICBcIlwiLFxuICApO1xufVxuXG5mdW5jdGlvbiBjb2RleFBwU2V0dGluZ3NMYWJlbHNGcm9tKHJvb3Q6IFBhcmVudE5vZGUpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGNvbnRyb2xzID0gQXJyYXkuZnJvbShcbiAgICByb290LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiYnV0dG9uLGEsW3JvbGU9J2J1dHRvbiddLFtyb2xlPSdsaW5rJ11cIiksXG4gICk7XG5cbiAgcmV0dXJuIFtcbiAgICAuLi5uZXcgU2V0KFxuICAgICAgY29udHJvbHNcbiAgICAgICAgLm1hcChjb2RleFBwQ29udHJvbExhYmVsKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pLFxuICAgICksXG4gIF07XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBTZXR0aW5nc0xhYmVsU2NvcmUobGFiZWxzOiBzdHJpbmdbXSk6IHsgY29yZTogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH0ge1xuICBjb25zdCBjb3JlID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHRvdGFsID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgZm9yIChjb25zdCBsYWJlbCBvZiBsYWJlbHMpIHtcbiAgICBmb3IgKGNvbnN0IG1hcmtlciBvZiBDT0RFWFBQX0NPUkVfU0VUVElOR1NfTEFCRUxTKSB7XG4gICAgICBpZiAoY29kZXhQcExhYmVsTWF0Y2hlc01hcmtlcihsYWJlbCwgbWFya2VyKSkgY29yZS5hZGQobWFya2VyKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IG1hcmtlciBvZiBDT0RFWFBQX0VYVEVOREVEX1NFVFRJTkdTX0xBQkVMUykge1xuICAgICAgaWYgKGNvZGV4UHBMYWJlbE1hdGNoZXNNYXJrZXIobGFiZWwsIG1hcmtlcikpIHRvdGFsLmFkZChtYXJrZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGNvcmU6IGNvcmUuc2l6ZSwgdG90YWw6IHRvdGFsLnNpemUgfTtcbn1cblxuZnVuY3Rpb24gY29kZXhQcExhYmVsTWF0Y2hlc01hcmtlcihsYWJlbDogc3RyaW5nLCBtYXJrZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gbGFiZWwgPT09IG1hcmtlciB8fCBsYWJlbC5pbmNsdWRlcyhtYXJrZXIpO1xufVxuXG5mdW5jdGlvbiBjb2RleFBwTWFya2VyQ291bnQobGFiZWxzOiBzdHJpbmdbXSwgbWFya2Vyczogc3RyaW5nW10pOiBudW1iZXIge1xuICBjb25zdCBtYXRjaGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgbGFiZWwgb2YgbGFiZWxzKSB7XG4gICAgZm9yIChjb25zdCBtYXJrZXIgb2YgbWFya2Vycykge1xuICAgICAgaWYgKGNvZGV4UHBMYWJlbE1hdGNoZXNNYXJrZXIobGFiZWwsIG1hcmtlcikpIG1hdGNoZWQuYWRkKG1hcmtlcik7XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXRjaGVkLnNpemU7XG59XG5cbmZ1bmN0aW9uIGhhc0NvZGV4UHBTZXR0aW5nc09ubHlTaWduYWwobGFiZWxzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gY29kZXhQcE1hcmtlckNvdW50KGxhYmVscywgQ09ERVhQUF9TRVRUSU5HU19PTkxZX0xBQkVMUykgPiAwO1xufVxuXG5mdW5jdGlvbiBoYXNNYWluQXBwU2lkZWJhclNpZ25hbHMobGFiZWxzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICByZXR1cm4gY29kZXhQcE1hcmtlckNvdW50KGxhYmVscywgQ09ERVhQUF9NQUlOX0FQUF9OQVZfTEFCRUxTKSA+PSAyO1xufVxuXG5mdW5jdGlvbiBpc0NvZGV4UHBTZXR0aW5nc0xhYmVsU2V0KGxhYmVsczogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgY29uc3Qgc2NvcmUgPSBjb2RleFBwU2V0dGluZ3NMYWJlbFNjb3JlKGxhYmVscyk7XG4gIHJldHVybiBzY29yZS5jb3JlID49IDIgJiYgc2NvcmUudG90YWwgPj0gMztcbn1cblxuZnVuY3Rpb24gY29kZXhQcFZpc2libGVCb3goZWw6IEhUTUxFbGVtZW50KTogRE9NUmVjdCB8IG51bGwge1xuICBpZiAoIWVsLmlzQ29ubmVjdGVkKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsKTtcbiAgaWYgKHN0eWxlLmRpc3BsYXkgPT09IFwibm9uZVwiIHx8IHN0eWxlLnZpc2liaWxpdHkgPT09IFwiaGlkZGVuXCIpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgaWYgKHJlY3Qud2lkdGggPD0gMCB8fCByZWN0LmhlaWdodCA8PSAwKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHJlY3Q7XG59XG5cbmZ1bmN0aW9uIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUodmlzaWJsZTogYm9vbGVhbiwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKHN0YXRlLnNldHRpbmdzU3VyZmFjZVZpc2libGUgPT09IHZpc2libGUpIHJldHVybjtcbiAgc3RhdGUuc2V0dGluZ3NTdXJmYWNlVmlzaWJsZSA9IHZpc2libGU7XG4gIGlmICh2aXNpYmxlKSB3YXJtVHdlYWtTdG9yZSgpO1xuICB0cnkge1xuICAgICh3aW5kb3cgYXMgV2luZG93ICYgeyBfX2NvZGV4cHBTZXR0aW5nc1N1cmZhY2VWaXNpYmxlPzogYm9vbGVhbiB9KS5fX2NvZGV4cHBTZXR0aW5nc1N1cmZhY2VWaXNpYmxlID0gdmlzaWJsZTtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuZGF0YXNldC5jb2RleHBwU2V0dGluZ3NTdXJmYWNlID0gdmlzaWJsZSA/IFwidHJ1ZVwiIDogXCJmYWxzZVwiO1xuICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KFxuICAgICAgbmV3IEN1c3RvbUV2ZW50KFwiY29kZXhwcDpzZXR0aW5ncy1zdXJmYWNlXCIsIHtcbiAgICAgICAgZGV0YWlsOiB7IHZpc2libGUsIHJlYXNvbiB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgfSBjYXRjaCB7fVxuICBwbG9nKFwic2V0dGluZ3Mgc3VyZmFjZVwiLCB7IHZpc2libGUsIHJlYXNvbiwgdXJsOiBsb2NhdGlvbi5ocmVmIH0pO1xufVxuXG4vKipcbiAqIFJlbmRlciAob3IgcmUtcmVuZGVyKSB0aGUgc2Vjb25kIHNpZGViYXIgZ3JvdXAgb2YgcGVyLXR3ZWFrIHBhZ2VzLiBUaGVcbiAqIGdyb3VwIGlzIGNyZWF0ZWQgbGF6aWx5IGFuZCByZW1vdmVkIHdoZW4gdGhlIGxhc3QgcGFnZSB1bnJlZ2lzdGVycywgc29cbiAqIHVzZXJzIHdpdGggbm8gcGFnZS1yZWdpc3RlcmluZyB0d2Vha3MgbmV2ZXIgc2VlIGFuIGVtcHR5IFwiVHdlYWtzXCIgaGVhZGVyLlxuICovXG5mdW5jdGlvbiBzeW5jUGFnZXNHcm91cCgpOiB2b2lkIHtcbiAgY29uc3Qgb3V0ZXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKCFvdXRlcikgcmV0dXJuO1xuICBpZiAoIWlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKG91dGVyKSkge1xuICAgIHN0YXRlLnNpZGViYXJSb290ID0gbnVsbDtcbiAgICBzdGF0ZS5wYWdlc0dyb3VwID0gbnVsbDtcbiAgICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcGFnZXMgPSBbLi4uc3RhdGUucGFnZXMudmFsdWVzKCldO1xuXG4gIC8vIEJ1aWxkIGEgZGV0ZXJtaW5pc3RpYyBmaW5nZXJwcmludCBvZiB0aGUgZGVzaXJlZCBncm91cCBzdGF0ZS4gSWYgdGhlXG4gIC8vIGN1cnJlbnQgRE9NIGdyb3VwIGFscmVhZHkgbWF0Y2hlcywgdGhpcyBpcyBhIG5vLW9wIFx1MjAxNCBjcml0aWNhbCwgYmVjYXVzZVxuICAvLyBzeW5jUGFnZXNHcm91cCBpcyBjYWxsZWQgb24gZXZlcnkgTXV0YXRpb25PYnNlcnZlciB0aWNrIGFuZCBhbnkgRE9NXG4gIC8vIHdyaXRlIHdvdWxkIHJlLXRyaWdnZXIgdGhhdCBvYnNlcnZlciAoaW5maW5pdGUgbG9vcCwgYXBwIGZyZWV6ZSkuXG4gIGNvbnN0IGRlc2lyZWRLZXkgPSBwYWdlcy5sZW5ndGggPT09IDBcbiAgICA/IFwiRU1QVFlcIlxuICAgIDogcGFnZXMubWFwKChwKSA9PiBgJHtwLmlkfXwke3AucGFnZS50aXRsZX18JHtwLnBhZ2UuaWNvblN2ZyA/PyBcIlwifWApLmpvaW4oXCJcXG5cIik7XG4gIGNvbnN0IHByZXZpb3VzUGFnZXNHcm91cCA9IHN0YXRlLnBhZ2VzR3JvdXA7XG4gIGNvbnN0IGF0dGFjaGVkUGFnZXNHcm91cCA9XG4gICAgc3RhdGUucGFnZXNHcm91cCAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5wYWdlc0dyb3VwKVxuICAgICAgPyBzdGF0ZS5wYWdlc0dyb3VwXG4gICAgICA6IGZpbmRFeGlzdGluZ1BhZ2VzR3JvdXAob3V0ZXIpO1xuICBjb25zdCBhZG9wdGVkUGFnZXNHcm91cCA9ICEhYXR0YWNoZWRQYWdlc0dyb3VwICYmIHByZXZpb3VzUGFnZXNHcm91cCAhPT0gYXR0YWNoZWRQYWdlc0dyb3VwO1xuICBpZiAoYWRvcHRlZFBhZ2VzR3JvdXApIHtcbiAgICBzdGF0ZS5wYWdlc0dyb3VwID0gYXR0YWNoZWRQYWdlc0dyb3VwO1xuICB9XG4gIGNvbnN0IGdyb3VwQXR0YWNoZWQgPSAhIWF0dGFjaGVkUGFnZXNHcm91cCAmJiBvdXRlci5jb250YWlucyhhdHRhY2hlZFBhZ2VzR3JvdXApO1xuICBpZiAoXG4gICAgIWFkb3B0ZWRQYWdlc0dyb3VwICYmXG4gICAgc3RhdGUucGFnZXNHcm91cEtleSA9PT0gZGVzaXJlZEtleSAmJlxuICAgIChwYWdlcy5sZW5ndGggPT09IDAgPyAhZ3JvdXBBdHRhY2hlZCA6IGdyb3VwQXR0YWNoZWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoYXR0YWNoZWRQYWdlc0dyb3VwKSB7XG4gICAgICBhdHRhY2hlZFBhZ2VzR3JvdXAucmVtb3ZlKCk7XG4gICAgICBzdGF0ZS5wYWdlc0dyb3VwID0gbnVsbDtcbiAgICB9XG4gICAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSBwLm5hdkJ1dHRvbiA9IG51bGw7XG4gICAgc3RhdGUucGFnZXNHcm91cEtleSA9IGRlc2lyZWRLZXk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IGdyb3VwID0gYXR0YWNoZWRQYWdlc0dyb3VwO1xuICBpZiAoIWdyb3VwKSB7XG4gICAgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwicGFnZXMtZ3JvdXBcIjtcbiAgICBncm91cC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLXB4XCI7XG4gICAgZ3JvdXAuYXBwZW5kQ2hpbGQoc2lkZWJhckdyb3VwSGVhZGVyKFwiVHdlYWtzXCIsIFwicHQtM1wiKSk7XG4gICAgb3V0ZXIuYXBwZW5kQ2hpbGQoZ3JvdXApO1xuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBncm91cDtcbiAgfSBlbHNlIHtcbiAgICAvLyBTdHJpcCBwcmlvciBidXR0b25zIChrZWVwIHRoZSBoZWFkZXIgYXQgaW5kZXggMCkuXG4gICAgd2hpbGUgKGdyb3VwLmNoaWxkcmVuLmxlbmd0aCA+IDEpIGdyb3VwLnJlbW92ZUNoaWxkKGdyb3VwLmxhc3RDaGlsZCEpO1xuICB9XG5cbiAgZm9yIChjb25zdCBwIG9mIHBhZ2VzKSB7XG4gICAgY29uc3QgaWNvbiA9IHAucGFnZS5pY29uU3ZnID8/IGRlZmF1bHRQYWdlSWNvblN2ZygpO1xuICAgIGNvbnN0IGJ0biA9IG1ha2VTaWRlYmFySXRlbShwLnBhZ2UudGl0bGUsIGljb24pO1xuICAgIGJ0bi5kYXRhc2V0LmNvZGV4cHAgPSBgbmF2LXBhZ2UtJHtwLmlkfWA7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiLCBpZDogcC5pZCB9KTtcbiAgICB9KTtcbiAgICBwLm5hdkJ1dHRvbiA9IGJ0bjtcbiAgICBncm91cC5hcHBlbmRDaGlsZChidG4pO1xuICB9XG4gIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBkZXNpcmVkS2V5O1xuICBwbG9nKFwicGFnZXMgZ3JvdXAgc3luY2VkXCIsIHtcbiAgICBjb3VudDogcGFnZXMubGVuZ3RoLFxuICAgIGlkczogcGFnZXMubWFwKChwKSA9PiBwLmlkKSxcbiAgfSk7XG4gIC8vIFJlZmxlY3QgY3VycmVudCBhY3RpdmUgc3RhdGUgYWNyb3NzIHRoZSByZWJ1aWx0IGJ1dHRvbnMuXG4gIHNldE5hdkFjdGl2ZShzdGF0ZS5hY3RpdmVQYWdlKTtcbn1cblxuZnVuY3Rpb24gZmluZEV4aXN0aW5nUGFnZXNHcm91cChvdXRlcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICByZXR1cm4gKFxuICAgIG91dGVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiBbZGF0YS1jb2RleHBwPVwicGFnZXMtZ3JvdXBcIl0nKSA/P1xuICAgIG91dGVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbZGF0YS1jb2RleHBwPVwicGFnZXMtZ3JvdXBcIl0nKVxuICApO1xufVxuXG5mdW5jdGlvbiBtYWtlU2lkZWJhckl0ZW0obGFiZWw6IHN0cmluZywgaWNvblN2Zzogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICAvLyBDbGFzcyBzdHJpbmcgY29waWVkIHZlcmJhdGltIGZyb20gQ29kZXgncyBzaWRlYmFyIGJ1dHRvbnMgKEdlbmVyYWwgZXRjKS5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi0ke2xhYmVsLnRvTG93ZXJDYXNlKCl9YDtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbGFiZWwpO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBcImZvY3VzLXZpc2libGU6b3V0bGluZS10b2tlbi1ib3JkZXIgcmVsYXRpdmUgcHgtcm93LXggcHktcm93LXkgY3Vyc29yLWludGVyYWN0aW9uIHNocmluay0wIGl0ZW1zLWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyB0ZXh0LWxlZnQgdGV4dC1zbSBmb2N1cy12aXNpYmxlOm91dGxpbmUgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLTIgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLW9mZnNldC0yIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTUwIGdhcC0yIGZsZXggdy1mdWxsIGhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBmb250LW5vcm1hbFwiO1xuXG4gIGNvbnN0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaW5uZXIuY2xhc3NOYW1lID1cbiAgICBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgdGV4dC1iYXNlIGdhcC0yIGZsZXgtMSB0ZXh0LXRva2VuLWZvcmVncm91bmRcIjtcbiAgaW5uZXIuaW5uZXJIVE1MID0gYCR7aWNvblN2Z308c3BhbiBjbGFzcz1cInRydW5jYXRlXCI+JHtsYWJlbH08L3NwYW4+YDtcbiAgYnRuLmFwcGVuZENoaWxkKGlubmVyKTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gYXBwZW5kU2lkZWJhclN0b3JlVXBkYXRlQmFkZ2UoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmICghaW5uZXIpIHJldHVybjtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgYmFkZ2UuZGF0YXNldC5jb2RleHBwU3RvcmVVcGRhdGVCYWRnZSA9IFwidHJ1ZVwiO1xuICBiYWRnZS5oaWRkZW4gPSB0cnVlO1xuICBiYWRnZS50aXRsZSA9IFwiSW5zdGFsbGVkIHR3ZWFrcyB3aXRoIGFwcHJvdmVkIHVwZGF0ZXNcIjtcbiAgYmFkZ2UuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXJcIjtcbiAgT2JqZWN0LmFzc2lnbihiYWRnZS5zdHlsZSwge1xuICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gICAgcmlnaHQ6IFwiMTJweFwiLFxuICAgIHRvcDogXCI1MCVcIixcbiAgICB0cmFuc2Zvcm06IFwidHJhbnNsYXRlWSgtNTAlKVwiLFxuICAgIHpJbmRleDogXCIxXCIsXG4gIH0pO1xuICBhcHBseVN0b3JlVXBkYXRlQmFkZ2VTdHlsZShiYWRnZSwgbnVsbCk7XG4gIGJ0bi5hcHBlbmRDaGlsZChiYWRnZSk7XG59XG5cbi8qKiBJbnRlcm5hbCBrZXkgZm9yIHRoZSBidWlsdC1pbiBuYXYgYnV0dG9ucy4gKi9cbnR5cGUgQnVpbHRpblBhZ2UgPSBcImNvbmZpZ1wiIHwgXCJ0d2Vha3NcIiB8IFwic3RvcmVcIjtcblxuZnVuY3Rpb24gc2V0TmF2QWN0aXZlKGFjdGl2ZTogQWN0aXZlUGFnZSB8IG51bGwpOiB2b2lkIHtcbiAgLy8gQnVpbHQtaW4gKENvbmZpZy9Ud2Vha3MpIGJ1dHRvbnMuXG4gIGlmIChzdGF0ZS5uYXZCdXR0b25zKSB7XG4gICAgY29uc3QgYnVpbHRpbjogQnVpbHRpblBhZ2UgfCBudWxsID1cbiAgICAgIGFjdGl2ZT8ua2luZCA9PT0gXCJjb25maWdcIiA/IFwiY29uZmlnXCIgOlxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInR3ZWFrc1wiID8gXCJ0d2Vha3NcIiA6XG4gICAgICBhY3RpdmU/LmtpbmQgPT09IFwic3RvcmVcIiA/IFwic3RvcmVcIiA6IG51bGw7XG4gICAgZm9yIChjb25zdCBba2V5LCBidG5dIG9mIE9iamVjdC5lbnRyaWVzKHN0YXRlLm5hdkJ1dHRvbnMpIGFzIFtCdWlsdGluUGFnZSwgSFRNTEJ1dHRvbkVsZW1lbnRdW10pIHtcbiAgICAgIGFwcGx5TmF2QWN0aXZlKGJ0biwga2V5ID09PSBidWlsdGluKTtcbiAgICB9XG4gIH1cbiAgLy8gUGVyLXBhZ2UgcmVnaXN0ZXJlZCBidXR0b25zLlxuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoIXAubmF2QnV0dG9uKSBjb250aW51ZTtcbiAgICBjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgYWN0aXZlLmlkID09PSBwLmlkO1xuICAgIGFwcGx5TmF2QWN0aXZlKHAubmF2QnV0dG9uLCBpc0FjdGl2ZSk7XG4gIH1cbiAgLy8gQ29kZXgncyBvd24gc2lkZWJhciBidXR0b25zIChHZW5lcmFsLCBBcHBlYXJhbmNlLCBldGMpLiBXaGVuIG9uZSBvZlxuICAvLyBvdXIgcGFnZXMgaXMgYWN0aXZlLCBDb2RleCBzdGlsbCBoYXMgYXJpYS1jdXJyZW50PVwicGFnZVwiIGFuZCB0aGVcbiAgLy8gYWN0aXZlLWJnIGNsYXNzIG9uIHdoaWNoZXZlciBpdGVtIGl0IGNvbnNpZGVyZWQgdGhlIHJvdXRlIFx1MjAxNCB0eXBpY2FsbHlcbiAgLy8gR2VuZXJhbC4gVGhhdCBtYWtlcyBib3RoIGJ1dHRvbnMgbG9vayBzZWxlY3RlZC4gU3RyaXAgQ29kZXgncyBhY3RpdmVcbiAgLy8gc3R5bGluZyB3aGlsZSBvbmUgb2Ygb3VycyBpcyBhY3RpdmU7IHJlc3RvcmUgaXQgd2hlbiBub25lIGlzLlxuICBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUoYWN0aXZlICE9PSBudWxsKTtcbn1cblxuLyoqXG4gKiBNdXRlIENvZGV4J3Mgb3duIGFjdGl2ZS1zdGF0ZSBzdHlsaW5nIG9uIGl0cyBzaWRlYmFyIGJ1dHRvbnMuIFdlIGRvbid0XG4gKiB0b3VjaCBDb2RleCdzIFJlYWN0IHN0YXRlIFx1MjAxNCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIG5hdGl2ZSBpdGVtLCBDb2RleFxuICogcmUtcmVuZGVycyB0aGUgYnV0dG9ucyBhbmQgcmUtYXBwbGllcyBpdHMgb3duIGNvcnJlY3Qgc3RhdGUsIHRoZW4gb3VyXG4gKiBzaWRlYmFyLWNsaWNrIGxpc3RlbmVyIGZpcmVzIGByZXN0b3JlQ29kZXhWaWV3YCAod2hpY2ggY2FsbHMgYmFjayBpbnRvXG4gKiBgc2V0TmF2QWN0aXZlKG51bGwpYCBhbmQgbGV0cyBDb2RleCdzIHN0eWxpbmcgc3RhbmQpLlxuICpcbiAqIGBtdXRlPXRydWVgICBcdTIxOTIgc3RyaXAgYXJpYS1jdXJyZW50IGFuZCBzd2FwIGFjdGl2ZSBiZyBcdTIxOTIgaG92ZXIgYmdcbiAqIGBtdXRlPWZhbHNlYCBcdTIxOTIgbm8tb3AgKENvZGV4J3Mgb3duIHJlLXJlbmRlciBhbHJlYWR5IHJlc3RvcmVkIHRoaW5ncylcbiAqL1xuZnVuY3Rpb24gc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKG11dGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFtdXRlKSByZXR1cm47XG4gIGNvbnN0IHJvb3QgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKCFyb290KSByZXR1cm47XG4gIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXCJidXR0b25cIikpO1xuICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XG4gICAgLy8gU2tpcCBvdXIgb3duIGJ1dHRvbnMuXG4gICAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xuICAgIGlmIChidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpID09PSBcInBhZ2VcIikge1xuICAgICAgYnRuLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiKTtcbiAgICB9XG4gICAgaWYgKGJ0bi5jbGFzc0xpc3QuY29udGFpbnMoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIikpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5TmF2QWN0aXZlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChhY3RpdmUpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIiwgXCJwYWdlXCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiLCBcImZvbnQtbm9ybWFsXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGFjdGl2YXRpb24gXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIGFjdGl2YXRlUGFnZShwYWdlOiBBY3RpdmVQYWdlKTogdm9pZCB7XG4gIGNvbnN0IGNvbnRlbnQgPSBmaW5kQ29udGVudEFyZWEoKTtcbiAgaWYgKCFjb250ZW50KSB7XG4gICAgcGxvZyhcImFjdGl2YXRlOiBjb250ZW50IGFyZWEgbm90IGZvdW5kXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBzdGF0ZS5hY3RpdmVQYWdlID0gcGFnZTtcbiAgcGxvZyhcImFjdGl2YXRlXCIsIHsgcGFnZSB9KTtcblxuICAvLyBIaWRlIENvZGV4J3MgY29udGVudCBjaGlsZHJlbiwgc2hvdyBvdXJzLlxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oY29udGVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuID0gY2hpbGQuc3R5bGUuZGlzcGxheSB8fCBcIlwiO1xuICAgIH1cbiAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIH1cbiAgbGV0IHBhbmVsID0gY29udGVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtY29kZXhwcD1cInR3ZWFrcy1wYW5lbFwiXScpO1xuICBpZiAoIXBhbmVsKSB7XG4gICAgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHBhbmVsLmRhdGFzZXQuY29kZXhwcCA9IFwidHdlYWtzLXBhbmVsXCI7XG4gICAgcGFuZWwuc3R5bGUuY3NzVGV4dCA9IFwid2lkdGg6MTAwJTtoZWlnaHQ6MTAwJTtvdmVyZmxvdzphdXRvO1wiO1xuICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICB9XG4gIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIHN0YXRlLnBhbmVsSG9zdCA9IHBhbmVsO1xuICByZXJlbmRlcigpO1xuICBzZXROYXZBY3RpdmUocGFnZSk7XG4gIC8vIHJlc3RvcmUgQ29kZXgncyB2aWV3LiBSZS1yZWdpc3RlciBpZiBuZWVkZWQuXG4gIGNvbnN0IHNpZGViYXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKHNpZGViYXIpIHtcbiAgICBpZiAoc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyKSB7XG4gICAgICBzaWRlYmFyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsIHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBoYW5kbGVyID0gKGU6IEV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgaWYgKHN0YXRlLm5hdkdyb3VwPy5jb250YWlucyh0YXJnZXQpKSByZXR1cm47IC8vIG91ciBidXR0b25zXG4gICAgICBpZiAoc3RhdGUucGFnZXNHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgcGFnZSBidXR0b25zXG4gICAgICBpZiAodGFyZ2V0LmNsb3Nlc3QoXCJbZGF0YS1jb2RleHBwLXNldHRpbmdzLXNlYXJjaF1cIikpIHJldHVybjtcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgICB9O1xuICAgIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgc2lkZWJhci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlciwgdHJ1ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzdG9yZUNvZGV4VmlldygpOiB2b2lkIHtcbiAgcGxvZyhcInJlc3RvcmUgY29kZXggdmlld1wiKTtcbiAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xuICBpZiAoIWNvbnRlbnQpIHJldHVybjtcbiAgaWYgKHN0YXRlLnBhbmVsSG9zdCkgc3RhdGUucGFuZWxIb3N0LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcbiAgICBpZiAoY2hpbGQgPT09IHN0YXRlLnBhbmVsSG9zdCkgY29udGludWU7XG4gICAgaWYgKGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xuICAgICAgZGVsZXRlIGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbjtcbiAgICB9XG4gIH1cbiAgc3RhdGUuYWN0aXZlUGFnZSA9IG51bGw7XG4gIHNldE5hdkFjdGl2ZShudWxsKTtcbiAgaWYgKHN0YXRlLnNpZGViYXJSb290ICYmIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xuICAgIHN0YXRlLnNpZGViYXJSb290LnJlbW92ZUV2ZW50TGlzdGVuZXIoXG4gICAgICBcImNsaWNrXCIsXG4gICAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsXG4gICAgICB0cnVlLFxuICAgICk7XG4gICAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyID0gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXJlbmRlcigpOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZS5hY3RpdmVQYWdlKSByZXR1cm47XG4gIGNvbnN0IGhvc3QgPSBzdGF0ZS5wYW5lbEhvc3Q7XG4gIGlmICghaG9zdCkgcmV0dXJuO1xuICBob3N0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgY29uc3QgYXAgPSBzdGF0ZS5hY3RpdmVQYWdlO1xuICBpZiAoYXAua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIpIHtcbiAgICBjb25zdCBlbnRyeSA9IHN0YXRlLnBhZ2VzLmdldChhcC5pZCk7XG4gICAgaWYgKCFlbnRyeSkge1xuICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByb290ID0gcGFuZWxTaGVsbChlbnRyeS5wYWdlLnRpdGxlLCBlbnRyeS5wYWdlLmRlc2NyaXB0aW9uKTtcbiAgICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICAgIHRyeSB7XG4gICAgICAvLyBUZWFyIGRvd24gYW55IHByaW9yIHJlbmRlciBiZWZvcmUgcmUtcmVuZGVyaW5nIChob3QgcmVsb2FkKS5cbiAgICAgIHRyeSB7IGVudHJ5LnRlYXJkb3duPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgZW50cnkudGVhcmRvd24gPSBudWxsO1xuICAgICAgY29uc3QgcmV0ID0gZW50cnkucGFnZS5yZW5kZXIocm9vdC5zZWN0aW9uc1dyYXApO1xuICAgICAgaWYgKHR5cGVvZiByZXQgPT09IFwiZnVuY3Rpb25cIikgZW50cnkudGVhcmRvd24gPSByZXQ7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGVyci5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tY2hhcnRzLXJlZCB0ZXh0LXNtXCI7XG4gICAgICBlcnIudGV4dENvbnRlbnQgPSBgRXJyb3IgcmVuZGVyaW5nIHBhZ2U6ICR7KGUgYXMgRXJyb3IpLm1lc3NhZ2V9YDtcbiAgICAgIHJvb3Quc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKGVycik7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHRpdGxlID1cbiAgICBhcC5raW5kID09PSBcInR3ZWFrc1wiID8gXCJUd2Vha3NcIiA6XG4gICAgYXAua2luZCA9PT0gXCJzdG9yZVwiID8gXCJUd2VhayBTdG9yZVwiIDogXCJDb2RleCsrXCI7XG4gIGNvbnN0IHN1YnRpdGxlID1cbiAgICBhcC5raW5kID09PSBcInR3ZWFrc1wiXG4gICAgICA/IFwiTWFuYWdlIHlvdXIgaW5zdGFsbGVkIENvZGV4KysgdHdlYWtzLlwiXG4gICAgICA6IGFwLmtpbmQgPT09IFwic3RvcmVcIlxuICAgICAgICA/IFwiSW5zdGFsbCByZXZpZXdlZCB0d2Vha3MgcGlubmVkIHRvIGFwcHJvdmVkIEdpdEh1YiBjb21taXRzLlwiXG4gICAgICAgIDogXCJDaGVja2luZyBpbnN0YWxsZWQgQ29kZXgrKyB2ZXJzaW9uLlwiO1xuICBjb25zdCByb290ID0gcGFuZWxTaGVsbCh0aXRsZSwgc3VidGl0bGUpO1xuICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICBpZiAoYXAua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVuZGVyVHdlYWtzUGFnZShyb290LnNlY3Rpb25zV3JhcCk7XG4gIGVsc2UgaWYgKGFwLmtpbmQgPT09IFwic3RvcmVcIikgcmVuZGVyVHdlYWtTdG9yZVBhZ2Uocm9vdC5zZWN0aW9uc1dyYXAsIHJvb3QuaGVhZGVyQWN0aW9ucyk7XG4gIGVsc2UgcmVuZGVyQ29uZmlnUGFnZShyb290LnNlY3Rpb25zV3JhcCwgcm9vdC5zdWJ0aXRsZSk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBwYWdlcyBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gcmVuZGVyQ29uZmlnUGFnZShcbiAgc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCxcbiAgc3VidGl0bGU/OiBIVE1MRWxlbWVudCxcbik6IHZvaWQge1xuICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiQ29kZXgrKyBVcGRhdGVzXCIpKTtcbiAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gIGNhcmQuZGF0YXNldC5jb2RleHBwQ29uZmlnQ2FyZCA9IFwidHJ1ZVwiO1xuICBjb25zdCBsb2FkaW5nID0gcm93U2ltcGxlKFwiTG9hZGluZyB1cGRhdGUgc2V0dGluZ3NcIiwgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIik7XG4gIGNhcmQuYXBwZW5kQ2hpbGQobG9hZGluZyk7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblxuICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKVxuICAgIC50aGVuKChjb25maWcpID0+IHtcbiAgICAgIGlmIChzdWJ0aXRsZSkge1xuICAgICAgICBzdWJ0aXRsZS50ZXh0Q29udGVudCA9IGBZb3UgaGF2ZSBDb2RleCsrICR7KGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKS52ZXJzaW9ufSBpbnN0YWxsZWQuYDtcbiAgICAgIH1cbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkLCBjb25maWcgYXMgQ29kZXhQbHVzUGx1c0NvbmZpZyk7XG4gICAgfSlcbiAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgIGlmIChzdWJ0aXRsZSkgc3VidGl0bGUudGV4dENvbnRlbnQgPSBcIkNvdWxkIG5vdCBsb2FkIGluc3RhbGxlZCBDb2RleCsrIHZlcnNpb24uXCI7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IGxvYWQgdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pO1xuXG4gIGNvbnN0IHdhdGNoZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgd2F0Y2hlci5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgd2F0Y2hlci5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJBdXRvLVJlcGFpciBXYXRjaGVyXCIpKTtcbiAgY29uc3Qgd2F0Y2hlckNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICB3YXRjaGVyQ2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDaGVja2luZyB3YXRjaGVyXCIsIFwiVmVyaWZ5aW5nIHRoZSB1cGRhdGVyIHJlcGFpciBzZXJ2aWNlLlwiKSk7XG4gIHdhdGNoZXIuYXBwZW5kQ2hpbGQod2F0Y2hlckNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod2F0Y2hlcik7XG4gIHJlbmRlcldhdGNoZXJIZWFsdGhDYXJkKHdhdGNoZXJDYXJkKTtcblxuICBjb25zdCBtYWludGVuYW5jZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICBtYWludGVuYW5jZS5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgbWFpbnRlbmFuY2UuYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiTWFpbnRlbmFuY2VcIikpO1xuICBjb25zdCBtYWludGVuYW5jZUNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQodW5pbnN0YWxsUm93KCkpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQocmVwb3J0QnVnUm93KCkpO1xuICBtYWludGVuYW5jZS5hcHBlbmRDaGlsZChtYWludGVuYW5jZUNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2UpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQ6IEhUTUxFbGVtZW50LCBjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiB2b2lkIHtcbiAgc2V0U2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oY29uZmlnLnVwZGF0ZUNoZWNrKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChhdXRvVXBkYXRlUm93KGNvbmZpZykpO1xuICBjYXJkLmFwcGVuZENoaWxkKHVwZGF0ZUNoYW5uZWxSb3coY29uZmlnKSk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQoaW5zdGFsbGF0aW9uU291cmNlUm93KGNvbmZpZy5pbnN0YWxsYXRpb25Tb3VyY2UpKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChzZWxmVXBkYXRlU3RhdHVzUm93KGNvbmZpZy5zZWxmVXBkYXRlKSk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQoY2hlY2tGb3JVcGRhdGVzUm93KGNvbmZpZykpO1xuICBpZiAoY29uZmlnLnVwZGF0ZUNoZWNrKSBjYXJkLmFwcGVuZENoaWxkKHJlbGVhc2VOb3Rlc1Jvdyhjb25maWcudXBkYXRlQ2hlY2spKTtcbn1cblxuZnVuY3Rpb24gYXV0b1VwZGF0ZVJvdyhjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiQXV0b21hdGljYWxseSByZWZyZXNoIENvZGV4KytcIjtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICBkZXNjLnRleHRDb250ZW50ID0gYEluc3RhbGxlZCB2ZXJzaW9uIHYke2NvbmZpZy52ZXJzaW9ufS4gVGhlIHdhdGNoZXIgY2hlY2tzIGhvdXJseSBhbmQgY2FuIHJlZnJlc2ggdGhlIENvZGV4KysgcnVudGltZSBhdXRvbWF0aWNhbGx5LmA7XG4gIGxlZnQuYXBwZW5kQ2hpbGQodGl0bGUpO1xuICBsZWZ0LmFwcGVuZENoaWxkKGRlc2MpO1xuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XG4gIHJvdy5hcHBlbmRDaGlsZChcbiAgICBzd2l0Y2hDb250cm9sKGNvbmZpZy5hdXRvVXBkYXRlLCBhc3luYyAobmV4dCkgPT4ge1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpzZXQtYXV0by11cGRhdGVcIiwgbmV4dCk7XG4gICAgfSksXG4gICk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNoYW5uZWxSb3coY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXCJSZWxlYXNlIGNoYW5uZWxcIiwgdXBkYXRlQ2hhbm5lbFN1bW1hcnkoY29uZmlnKSk7XG4gIGNvbnN0IGFjdGlvbiA9IHJvdy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtcm93LWFjdGlvbnNdXCIpO1xuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VsZWN0XCIpO1xuICBzZWxlY3QuY2xhc3NOYW1lID1cbiAgICBcImgtOCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRyYW5zcGFyZW50IHB4LTIgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBmb2N1czpvdXRsaW5lLW5vbmVcIjtcbiAgZm9yIChjb25zdCBbdmFsdWUsIGxhYmVsXSBvZiBbXG4gICAgW1wic3RhYmxlXCIsIFwiU3RhYmxlXCJdLFxuICAgIFtcInByZXJlbGVhc2VcIiwgXCJQcmVyZWxlYXNlXCJdLFxuICAgIFtcImN1c3RvbVwiLCBcIkN1c3RvbVwiXSxcbiAgXSBhcyBjb25zdCkge1xuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJvcHRpb25cIik7XG4gICAgb3B0aW9uLnZhbHVlID0gdmFsdWU7XG4gICAgb3B0aW9uLnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgb3B0aW9uLnNlbGVjdGVkID0gY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IHZhbHVlO1xuICAgIHNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICB9XG4gIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAuaW52b2tlKFwiY29kZXhwcDpzZXQtdXBkYXRlLWNvbmZpZ1wiLCB7IHVwZGF0ZUNoYW5uZWw6IHNlbGVjdC52YWx1ZSB9KVxuICAgICAgLnRoZW4oKCkgPT4gcmVmcmVzaENvbmZpZ0NhcmQocm93KSlcbiAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcInNldCB1cGRhdGUgY2hhbm5lbCBmYWlsZWRcIiwgU3RyaW5nKGUpKSk7XG4gIH0pO1xuICBhY3Rpb24/LmFwcGVuZENoaWxkKHNlbGVjdCk7XG4gIGlmIChjb25maWcudXBkYXRlQ2hhbm5lbCA9PT0gXCJjdXN0b21cIikge1xuICAgIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXG4gICAgICBjb21wYWN0QnV0dG9uKFwiRWRpdFwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlcG8gPSB3aW5kb3cucHJvbXB0KFwiR2l0SHViIHJlcG9cIiwgY29uZmlnLnVwZGF0ZVJlcG8gfHwgXCJiLW5uZXR0L2NvZGV4LXBsdXNwbHVzXCIpO1xuICAgICAgICBpZiAocmVwbyA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICBjb25zdCByZWYgPSB3aW5kb3cucHJvbXB0KFwiR2l0IHJlZlwiLCBjb25maWcudXBkYXRlUmVmIHx8IFwibWFpblwiKTtcbiAgICAgICAgaWYgKHJlZiA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgICAgLmludm9rZShcImNvZGV4cHA6c2V0LXVwZGF0ZS1jb25maWdcIiwge1xuICAgICAgICAgICAgdXBkYXRlQ2hhbm5lbDogXCJjdXN0b21cIixcbiAgICAgICAgICAgIHVwZGF0ZVJlcG86IHJlcG8sXG4gICAgICAgICAgICB1cGRhdGVSZWY6IHJlZixcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKCgpID0+IHJlZnJlc2hDb25maWdDYXJkKHJvdykpXG4gICAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwic2V0IGN1c3RvbSB1cGRhdGUgc291cmNlIGZhaWxlZFwiLCBTdHJpbmcoZSkpKTtcbiAgICAgIH0pLFxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gaW5zdGFsbGF0aW9uU291cmNlUm93KHNvdXJjZTogSW5zdGFsbGF0aW9uU291cmNlKTogSFRNTEVsZW1lbnQge1xuICByZXR1cm4gcm93U2ltcGxlKFwiSW5zdGFsbGF0aW9uIHNvdXJjZVwiLCBgJHtzb3VyY2UubGFiZWx9OiAke3NvdXJjZS5kZXRhaWx9YCk7XG59XG5cbmZ1bmN0aW9uIHNlbGZVcGRhdGVTdGF0dXNSb3coc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IHJvd1NpbXBsZShcIkxhc3QgQ29kZXgrKyB1cGRhdGVcIiwgc2VsZlVwZGF0ZVN1bW1hcnkoc3RhdGUpKTtcbiAgY29uc3QgbGVmdCA9IHJvdy5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChsZWZ0ICYmIHN0YXRlKSBsZWZ0LnByZXBlbmQoc3RhdHVzQmFkZ2Uoc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdGUuc3RhdHVzKSwgc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXRlLnN0YXR1cykpKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzUm93KGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgY2hlY2sgPSBjb25maWcudXBkYXRlQ2hlY2s7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPyBcIkNvZGV4KysgdXBkYXRlIGF2YWlsYWJsZVwiIDogXCJDaGVjayBmb3IgQ29kZXgrKyB1cGRhdGVzXCI7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IHVwZGF0ZVN1bW1hcnkoY2hlY2spO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcbiAgaWYgKGNoZWNrPy5yZWxlYXNlVXJsKSB7XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlIE5vdGVzXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgY2hlY2sucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKVxuICAgICAgICAudGhlbigoY2hlY2spID0+IHtcbiAgICAgICAgICBzZXRTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbihjaGVjayBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2spO1xuICAgICAgICAgIHJlZnJlc2hDb25maWdDYXJkKHJvdyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcIkNvZGV4KysgcmVsZWFzZSBjaGVjayBmYWlsZWRcIiwgU3RyaW5nKGUpKSlcbiAgICAgICAgLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgIHJvdy5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcbiAgICAgICAgfSk7XG4gICAgfSksXG4gICk7XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkRvd25sb2FkIFVwZGF0ZVwiLCAoKSA9PiB7XG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xuICAgICAgY29uc3QgYnV0dG9ucyA9IGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKTtcbiAgICAgIGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiAoYnV0dG9uLmRpc2FibGVkID0gdHJ1ZSkpO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpydW4tY29kZXhwcC11cGRhdGVcIilcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlZnJlc2hTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbih0cnVlKTtcbiAgICAgICAgICByZWZyZXNoQ29uZmlnQ2FyZChyb3cpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICBwbG9nKFwiQ29kZXgrKyBzZWxmLXVwZGF0ZSBmYWlsZWRcIiwgU3RyaW5nKGUpKTtcbiAgICAgICAgICB2b2lkIHJlZnJlc2hDb25maWdDYXJkKHJvdyk7XG4gICAgICAgIH0pXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiXCI7XG4gICAgICAgICAgYnV0dG9ucy5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSBmYWxzZSkpO1xuICAgICAgICB9KTtcbiAgICB9KSxcbiAgKTtcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xuICByZXR1cm4gcm93O1xufVxuXG5mdW5jdGlvbiByZWxlYXNlTm90ZXNSb3coY2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMiBwLTNcIjtcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZS5jbGFzc05hbWUgPSBcInRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIkxhdGVzdCByZWxlYXNlIG5vdGVzXCI7XG4gIHJvdy5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBib2R5LmNsYXNzTmFtZSA9XG4gICAgXCJtYXgtaC02MCBvdmVyZmxvdy1hdXRvIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHAtMyB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgYm9keS5hcHBlbmRDaGlsZChyZW5kZXJSZWxlYXNlTm90ZXNNYXJrZG93bihjaGVjay5yZWxlYXNlTm90ZXM/LnRyaW0oKSB8fCBjaGVjay5lcnJvciB8fCBcIk5vIHJlbGVhc2Ugbm90ZXMgYXZhaWxhYmxlLlwiKSk7XG4gIHJvdy5hcHBlbmRDaGlsZChib2R5KTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24obWFya2Rvd246IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvb3QuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIGNvbnN0IGxpbmVzID0gbWFya2Rvd24ucmVwbGFjZSgvXFxyXFxuPy9nLCBcIlxcblwiKS5zcGxpdChcIlxcblwiKTtcbiAgbGV0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGxpc3Q6IEhUTUxPTGlzdEVsZW1lbnQgfCBIVE1MVUxpc3RFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBjb2RlTGluZXM6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKSA9PiB7XG4gICAgaWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gICAgcC5jbGFzc05hbWUgPSBcIm0tMCBsZWFkaW5nLTVcIjtcbiAgICBhcHBlbmRJbmxpbmVNYXJrZG93bihwLCBwYXJhZ3JhcGguam9pbihcIiBcIikudHJpbSgpKTtcbiAgICByb290LmFwcGVuZENoaWxkKHApO1xuICAgIHBhcmFncmFwaCA9IFtdO1xuICB9O1xuICBjb25zdCBmbHVzaExpc3QgPSAoKSA9PiB7XG4gICAgaWYgKCFsaXN0KSByZXR1cm47XG4gICAgcm9vdC5hcHBlbmRDaGlsZChsaXN0KTtcbiAgICBsaXN0ID0gbnVsbDtcbiAgfTtcbiAgY29uc3QgZmx1c2hDb2RlID0gKCkgPT4ge1xuICAgIGlmICghY29kZUxpbmVzKSByZXR1cm47XG4gICAgY29uc3QgcHJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInByZVwiKTtcbiAgICBwcmUuY2xhc3NOYW1lID1cbiAgICAgIFwibS0wIG92ZXJmbG93LWF1dG8gcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIHAtMiB0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gICAgY29uc3QgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjb2RlXCIpO1xuICAgIGNvZGUudGV4dENvbnRlbnQgPSBjb2RlTGluZXMuam9pbihcIlxcblwiKTtcbiAgICBwcmUuYXBwZW5kQ2hpbGQoY29kZSk7XG4gICAgcm9vdC5hcHBlbmRDaGlsZChwcmUpO1xuICAgIGNvZGVMaW5lcyA9IG51bGw7XG4gIH07XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgaWYgKGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoXCJgYGBcIikpIHtcbiAgICAgIGlmIChjb2RlTGluZXMpIGZsdXNoQ29kZSgpO1xuICAgICAgZWxzZSB7XG4gICAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICAgIGZsdXNoTGlzdCgpO1xuICAgICAgICBjb2RlTGluZXMgPSBbXTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoY29kZUxpbmVzKSB7XG4gICAgICBjb2RlTGluZXMucHVzaChsaW5lKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcbiAgICBpZiAoIXRyaW1tZWQpIHtcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICBmbHVzaExpc3QoKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGhlYWRpbmcgPSAvXigjezEsM30pXFxzKyguKykkLy5leGVjKHRyaW1tZWQpO1xuICAgIGlmIChoZWFkaW5nKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgZmx1c2hMaXN0KCk7XG4gICAgICBjb25zdCBoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChoZWFkaW5nWzFdLmxlbmd0aCA9PT0gMSA/IFwiaDNcIiA6IFwiaDRcIik7XG4gICAgICBoLmNsYXNzTmFtZSA9IFwibS0wIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICAgIGFwcGVuZElubGluZU1hcmtkb3duKGgsIGhlYWRpbmdbMl0pO1xuICAgICAgcm9vdC5hcHBlbmRDaGlsZChoKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHVub3JkZXJlZCA9IC9eWy0qXVxccysoLispJC8uZXhlYyh0cmltbWVkKTtcbiAgICBjb25zdCBvcmRlcmVkID0gL15cXGQrWy4pXVxccysoLispJC8uZXhlYyh0cmltbWVkKTtcbiAgICBpZiAodW5vcmRlcmVkIHx8IG9yZGVyZWQpIHtcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XG4gICAgICBjb25zdCB3YW50T3JkZXJlZCA9IEJvb2xlYW4ob3JkZXJlZCk7XG4gICAgICBpZiAoIWxpc3QgfHwgKHdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJPTFwiKSB8fCAoIXdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJVTFwiKSkge1xuICAgICAgICBmbHVzaExpc3QoKTtcbiAgICAgICAgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQod2FudE9yZGVyZWQgPyBcIm9sXCIgOiBcInVsXCIpO1xuICAgICAgICBsaXN0LmNsYXNzTmFtZSA9IHdhbnRPcmRlcmVkXG4gICAgICAgICAgPyBcIm0tMCBsaXN0LWRlY2ltYWwgc3BhY2UteS0xIHBsLTUgbGVhZGluZy01XCJcbiAgICAgICAgICA6IFwibS0wIGxpc3QtZGlzYyBzcGFjZS15LTEgcGwtNSBsZWFkaW5nLTVcIjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgYXBwZW5kSW5saW5lTWFya2Rvd24obGksICh1bm9yZGVyZWQgPz8gb3JkZXJlZCk/LlsxXSA/PyBcIlwiKTtcbiAgICAgIGxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgcXVvdGUgPSAvXj5cXHM/KC4rKSQvLmV4ZWModHJpbW1lZCk7XG4gICAgaWYgKHF1b3RlKSB7XG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xuICAgICAgZmx1c2hMaXN0KCk7XG4gICAgICBjb25zdCBibG9ja3F1b3RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJsb2NrcXVvdGVcIik7XG4gICAgICBibG9ja3F1b3RlLmNsYXNzTmFtZSA9IFwibS0wIGJvcmRlci1sLTIgYm9yZGVyLXRva2VuLWJvcmRlciBwbC0zIGxlYWRpbmctNVwiO1xuICAgICAgYXBwZW5kSW5saW5lTWFya2Rvd24oYmxvY2txdW90ZSwgcXVvdGVbMV0pO1xuICAgICAgcm9vdC5hcHBlbmRDaGlsZChibG9ja3F1b3RlKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHBhcmFncmFwaC5wdXNoKHRyaW1tZWQpO1xuICB9XG5cbiAgZmx1c2hQYXJhZ3JhcGgoKTtcbiAgZmx1c2hMaXN0KCk7XG4gIGZsdXNoQ29kZSgpO1xuICByZXR1cm4gcm9vdDtcbn1cblxuZnVuY3Rpb24gYXBwZW5kSW5saW5lTWFya2Rvd24ocGFyZW50OiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHBhdHRlcm4gPSAvKGAoW15gXSspYHxcXFsoW15cXF1dKylcXF1cXCgoaHR0cHM/OlxcL1xcL1teXFxzKV0rKVxcKXxcXCpcXCooW14qXSspXFwqXFwqfFxcKihbXipdKylcXCopL2c7XG4gIGxldCBsYXN0SW5kZXggPSAwO1xuICBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHQubWF0Y2hBbGwocGF0dGVybikpIHtcbiAgICBpZiAobWF0Y2guaW5kZXggPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgYXBwZW5kVGV4dChwYXJlbnQsIHRleHQuc2xpY2UobGFzdEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgIGlmIChtYXRjaFsyXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCBjb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNvZGVcIik7XG4gICAgICBjb2RlLmNsYXNzTmFtZSA9XG4gICAgICAgIFwicm91bmRlZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIHB4LTEgcHktMC41IHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICAgIGNvZGUudGV4dENvbnRlbnQgPSBtYXRjaFsyXTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChjb2RlKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzNdICE9PSB1bmRlZmluZWQgJiYgbWF0Y2hbNF0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuICAgICAgYS5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IHVuZGVybGluZSB1bmRlcmxpbmUtb2Zmc2V0LTJcIjtcbiAgICAgIGEuaHJlZiA9IG1hdGNoWzRdO1xuICAgICAgYS50YXJnZXQgPSBcIl9ibGFua1wiO1xuICAgICAgYS5yZWwgPSBcIm5vb3BlbmVyIG5vcmVmZXJyZXJcIjtcbiAgICAgIGEudGV4dENvbnRlbnQgPSBtYXRjaFszXTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChhKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHN0cm9uZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHJvbmdcIik7XG4gICAgICBzdHJvbmcuY2xhc3NOYW1lID0gXCJmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICAgICAgc3Ryb25nLnRleHRDb250ZW50ID0gbWF0Y2hbNV07XG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoc3Ryb25nKTtcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzZdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImVtXCIpO1xuICAgICAgZW0udGV4dENvbnRlbnQgPSBtYXRjaFs2XTtcbiAgICAgIHBhcmVudC5hcHBlbmRDaGlsZChlbSk7XG4gICAgfVxuICAgIGxhc3RJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICB9XG4gIGFwcGVuZFRleHQocGFyZW50LCB0ZXh0LnNsaWNlKGxhc3RJbmRleCkpO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRUZXh0KHBhcmVudDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICBpZiAodGV4dCkgcGFyZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyV2F0Y2hlckhlYWx0aENhcmQoY2FyZDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgdm9pZCBpcGNSZW5kZXJlclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC13YXRjaGVyLWhlYWx0aFwiKVxuICAgIC50aGVuKChoZWFsdGgpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcmVuZGVyV2F0Y2hlckhlYWx0aChjYXJkLCBoZWFsdGggYXMgV2F0Y2hlckhlYWx0aCk7XG4gICAgfSlcbiAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDb3VsZCBub3QgY2hlY2sgd2F0Y2hlclwiLCBTdHJpbmcoZSkpKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyV2F0Y2hlckhlYWx0aChjYXJkOiBIVE1MRWxlbWVudCwgaGVhbHRoOiBXYXRjaGVySGVhbHRoKTogdm9pZCB7XG4gIGNhcmQuYXBwZW5kQ2hpbGQod2F0Y2hlclN1bW1hcnlSb3coaGVhbHRoKSk7XG4gIGZvciAoY29uc3QgY2hlY2sgb2YgaGVhbHRoLmNoZWNrcykge1xuICAgIGlmIChjaGVjay5zdGF0dXMgPT09IFwib2tcIikgY29udGludWU7XG4gICAgY2FyZC5hcHBlbmRDaGlsZCh3YXRjaGVyQ2hlY2tSb3coY2hlY2spKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3YXRjaGVyU3VtbWFyeVJvdyhoZWFsdGg6IFdhdGNoZXJIZWFsdGgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGF0dXNCYWRnZShoZWFsdGguc3RhdHVzLCBoZWFsdGgud2F0Y2hlcikpO1xuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBoZWFsdGgudGl0bGU7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IGAke2hlYWx0aC5zdW1tYXJ5fSBDaGVja2VkICR7bmV3IERhdGUoaGVhbHRoLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX0uYDtcbiAgc3RhY2suYXBwZW5kQ2hpbGQodGl0bGUpO1xuICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcblxuICBjb25zdCBhY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBhY3Rpb24uYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjYXJkID0gcm93LnBhcmVudEVsZW1lbnQ7XG4gICAgICBpZiAoIWNhcmQpIHJldHVybjtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDaGVja2luZyB3YXRjaGVyXCIsIFwiVmVyaWZ5aW5nIHRoZSB1cGRhdGVyIHJlcGFpciBzZXJ2aWNlLlwiKSk7XG4gICAgICByZW5kZXJXYXRjaGVySGVhbHRoQ2FyZChjYXJkKTtcbiAgICB9KSxcbiAgKTtcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbik7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHdhdGNoZXJDaGVja1JvdyhjaGVjazogV2F0Y2hlckhlYWx0aENoZWNrKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSByb3dTaW1wbGUoY2hlY2submFtZSwgY2hlY2suZGV0YWlsKTtcbiAgY29uc3QgbGVmdCA9IHJvdy5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChsZWZ0KSBsZWZ0LnByZXBlbmQoc3RhdHVzQmFkZ2UoY2hlY2suc3RhdHVzKSk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHN0YXR1c0JhZGdlKHN0YXR1czogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIGxhYmVsPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjb25zdCB0b25lID1cbiAgICBzdGF0dXMgPT09IFwib2tcIlxuICAgICAgPyBcImJvcmRlci10b2tlbi1jaGFydHMtZ3JlZW4gdGV4dC10b2tlbi1jaGFydHMtZ3JlZW5cIlxuICAgICAgOiBzdGF0dXMgPT09IFwid2FyblwiXG4gICAgICAgID8gXCJib3JkZXItdG9rZW4tY2hhcnRzLXllbGxvdyB0ZXh0LXRva2VuLWNoYXJ0cy15ZWxsb3dcIlxuICAgICAgICA6IFwiYm9yZGVyLXRva2VuLWNoYXJ0cy1yZWQgdGV4dC10b2tlbi1jaGFydHMtcmVkXCI7XG4gIGJhZGdlLmNsYXNzTmFtZSA9IGBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgcm91bmRlZC1mdWxsIGJvcmRlciBweC0yIHB5LTAuNSB0ZXh0LXhzIGZvbnQtbWVkaXVtICR7dG9uZX1gO1xuICBiYWRnZS50ZXh0Q29udGVudCA9IGxhYmVsIHx8IChzdGF0dXMgPT09IFwib2tcIiA/IFwiT0tcIiA6IHN0YXR1cyA9PT0gXCJ3YXJuXCIgPyBcIlJldmlld1wiIDogXCJFcnJvclwiKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTdW1tYXJ5KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogc3RyaW5nIHtcbiAgaWYgKCFjaGVjaykgcmV0dXJuIFwiTm8gdXBkYXRlIGNoZWNrIGhhcyBydW4geWV0LlwiO1xuICBjb25zdCBsYXRlc3QgPSBjaGVjay5sYXRlc3RWZXJzaW9uID8gYExhdGVzdCB2JHtjaGVjay5sYXRlc3RWZXJzaW9ufS4gYCA6IFwiXCI7XG4gIGNvbnN0IGNoZWNrZWQgPSBgQ2hlY2tlZCAke25ldyBEYXRlKGNoZWNrLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX0uYDtcbiAgaWYgKGNoZWNrLmVycm9yKSByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH0gJHtjaGVjay5lcnJvcn1gO1xuICByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH1gO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGFubmVsU3VtbWFyeShjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiBzdHJpbmcge1xuICBpZiAoY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IFwiY3VzdG9tXCIpIHtcbiAgICByZXR1cm4gYCR7Y29uZmlnLnVwZGF0ZVJlcG8gfHwgXCJiLW5uZXR0L2NvZGV4LXBsdXNwbHVzXCJ9ICR7Y29uZmlnLnVwZGF0ZVJlZiB8fCBcIihubyByZWYgc2V0KVwifWA7XG4gIH1cbiAgaWYgKGNvbmZpZy51cGRhdGVDaGFubmVsID09PSBcInByZXJlbGVhc2VcIikge1xuICAgIHJldHVybiBcIlVzZSB0aGUgbmV3ZXN0IHB1Ymxpc2hlZCBHaXRIdWIgcmVsZWFzZSwgaW5jbHVkaW5nIHByZXJlbGVhc2VzLlwiO1xuICB9XG4gIHJldHVybiBcIlVzZSB0aGUgbGF0ZXN0IHN0YWJsZSBHaXRIdWIgcmVsZWFzZS5cIjtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN1bW1hcnkoc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBzdHJpbmcge1xuICBpZiAoIXN0YXRlKSByZXR1cm4gXCJObyBhdXRvbWF0aWMgQ29kZXgrKyB1cGRhdGUgaGFzIHJ1biB5ZXQuXCI7XG4gIGNvbnN0IGNoZWNrZWQgPSBuZXcgRGF0ZShzdGF0ZS5jb21wbGV0ZWRBdCA/PyBzdGF0ZS5jaGVja2VkQXQpLnRvTG9jYWxlU3RyaW5nKCk7XG4gIGNvbnN0IHRhcmdldCA9IHN0YXRlLmxhdGVzdFZlcnNpb24gPyBgIFRhcmdldCB2JHtzdGF0ZS5sYXRlc3RWZXJzaW9ufS5gIDogc3RhdGUudGFyZ2V0UmVmID8gYCBUYXJnZXQgJHtzdGF0ZS50YXJnZXRSZWZ9LmAgOiBcIlwiO1xuICBjb25zdCBzb3VyY2UgPSBzdGF0ZS5pbnN0YWxsYXRpb25Tb3VyY2U/LmxhYmVsID8/IFwidW5rbm93biBzb3VyY2VcIjtcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJmYWlsZWRcIikgcmV0dXJuIGBGYWlsZWQgJHtjaGVja2VkfS4ke3RhcmdldH0gJHtzdGF0ZS5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIn1gO1xuICBpZiAoc3RhdGUuc3RhdHVzID09PSBcInVwZGF0ZWRcIikgcmV0dXJuIGBVcGRhdGVkICR7Y2hlY2tlZH0uJHt0YXJnZXR9IFNvdXJjZTogJHtzb3VyY2V9LmA7XG4gIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwidXAtdG8tZGF0ZVwiKSByZXR1cm4gYFVwIHRvIGRhdGUgJHtjaGVja2VkfS4ke3RhcmdldH0gU291cmNlOiAke3NvdXJjZX0uYDtcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJkaXNhYmxlZFwiKSByZXR1cm4gYFNraXBwZWQgJHtjaGVja2VkfTsgYXV0b21hdGljIHJlZnJlc2ggaXMgZGlzYWJsZWQuYDtcbiAgcmV0dXJuIGBDaGVja2luZyBmb3IgdXBkYXRlcy4gU291cmNlOiAke3NvdXJjZX0uYDtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdHVzOiBTZWxmVXBkYXRlU3RhdHVzKTogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIge1xuICBpZiAoc3RhdHVzID09PSBcImZhaWxlZFwiKSByZXR1cm4gXCJlcnJvclwiO1xuICBpZiAoc3RhdHVzID09PSBcImRpc2FibGVkXCIgfHwgc3RhdHVzID09PSBcImNoZWNraW5nXCIpIHJldHVybiBcIndhcm5cIjtcbiAgcmV0dXJuIFwib2tcIjtcbn1cblxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXR1czogU2VsZlVwZGF0ZVN0YXR1cyk6IHN0cmluZyB7XG4gIGlmIChzdGF0dXMgPT09IFwidXAtdG8tZGF0ZVwiKSByZXR1cm4gXCJVcCB0byBkYXRlXCI7XG4gIGlmIChzdGF0dXMgPT09IFwidXBkYXRlZFwiKSByZXR1cm4gXCJVcGRhdGVkXCI7XG4gIGlmIChzdGF0dXMgPT09IFwiZmFpbGVkXCIpIHJldHVybiBcIkZhaWxlZFwiO1xuICBpZiAoc3RhdHVzID09PSBcImRpc2FibGVkXCIpIHJldHVybiBcIkRpc2FibGVkXCI7XG4gIHJldHVybiBcIkNoZWNraW5nXCI7XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hDb25maWdDYXJkKHJvdzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3QgY2FyZCA9IHJvdy5jbG9zZXN0KFwiW2RhdGEtY29kZXhwcC1jb25maWctY2FyZF1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAoIWNhcmQpIHJldHVybjtcbiAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiUmVmcmVzaGluZ1wiLCBcIkxvYWRpbmcgY3VycmVudCBDb2RleCsrIHVwZGF0ZSBzdGF0dXMuXCIpKTtcbiAgdm9pZCBpcGNSZW5kZXJlclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC1jb25maWdcIilcbiAgICAudGhlbigoY29uZmlnKSA9PiB7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIHJlbmRlckNvZGV4UGx1c1BsdXNDb25maWcoY2FyZCwgY29uZmlnIGFzIENvZGV4UGx1c1BsdXNDb25maWcpO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IHJlZnJlc2ggdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiB1bmluc3RhbGxSb3coKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXG4gICAgXCJVbmluc3RhbGwgQ29kZXgrK1wiLFxuICAgIFwiQ29waWVzIHRoZSB1bmluc3RhbGwgY29tbWFuZC4gUnVuIGl0IGZyb20gYSB0ZXJtaW5hbCBhZnRlciBxdWl0dGluZyBDb2RleC5cIixcbiAgKTtcbiAgY29uc3QgYWN0aW9uID0gcm93LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1yb3ctYWN0aW9uc11cIik7XG4gIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNvcHkgQ29tbWFuZFwiLCAoKSA9PiB7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOmNvcHktdGV4dFwiLCBcIm5vZGUgfi8uY29kZXgtcGx1c3BsdXMvc291cmNlL3BhY2thZ2VzL2luc3RhbGxlci9kaXN0L2NsaS5qcyB1bmluc3RhbGxcIilcbiAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwiY29weSB1bmluc3RhbGwgY29tbWFuZCBmYWlsZWRcIiwgU3RyaW5nKGUpKSk7XG4gICAgfSksXG4gICk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlcG9ydEJ1Z1JvdygpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGFjdGlvblJvdyhcbiAgICBcIlJlcG9ydCBhIGJ1Z1wiLFxuICAgIFwiT3BlbiBhIEdpdEh1YiBpc3N1ZSB3aXRoIHJ1bnRpbWUsIGluc3RhbGxlciwgb3IgdHdlYWstbWFuYWdlciBkZXRhaWxzLlwiLFxuICApO1xuICBjb25zdCBhY3Rpb24gPSByb3cucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCJbZGF0YS1jb2RleHBwLXJvdy1hY3Rpb25zXVwiKTtcbiAgYWN0aW9uPy5hcHBlbmRDaGlsZChcbiAgICBjb21wYWN0QnV0dG9uKFwiT3BlbiBJc3N1ZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCB0aXRsZSA9IGVuY29kZVVSSUNvbXBvbmVudChcIltCdWddOiBcIik7XG4gICAgICBjb25zdCBib2R5ID0gZW5jb2RlVVJJQ29tcG9uZW50KFxuICAgICAgICBbXG4gICAgICAgICAgXCIjIyBXaGF0IGhhcHBlbmVkP1wiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBTdGVwcyB0byByZXByb2R1Y2VcIixcbiAgICAgICAgICBcIjEuIFwiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBFbnZpcm9ubWVudFwiLFxuICAgICAgICAgIFwiLSBDb2RleCsrIHZlcnNpb246IFwiLFxuICAgICAgICAgIFwiLSBDb2RleCBhcHAgdmVyc2lvbjogXCIsXG4gICAgICAgICAgXCItIE9TOiBcIixcbiAgICAgICAgICBcIlwiLFxuICAgICAgICAgIFwiIyMgTG9nc1wiLFxuICAgICAgICAgIFwiQXR0YWNoIHJlbGV2YW50IGxpbmVzIGZyb20gdGhlIENvZGV4KysgbG9nIGRpcmVjdG9yeS5cIixcbiAgICAgICAgXS5qb2luKFwiXFxuXCIpLFxuICAgICAgKTtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICBcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLFxuICAgICAgICBgaHR0cHM6Ly9naXRodWIuY29tL2Itbm5ldHQvY29kZXgtcGx1c3BsdXMvaXNzdWVzL25ldz90aXRsZT0ke3RpdGxlfSZib2R5PSR7Ym9keX1gLFxuICAgICAgKTtcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gYWN0aW9uUm93KHRpdGxlVGV4dDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZVRleHQ7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclR3ZWFrU3RvcmVQYWdlKFxuICBzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50LFxuICBoZWFkZXJBY3Rpb25zPzogSFRNTEVsZW1lbnQsXG4pOiB2b2lkIHtcbiAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICBzZWN0aW9uLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtNFwiO1xuXG4gIGNvbnN0IHNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBzb3VyY2UuaGlkZGVuID0gdHJ1ZTtcbiAgc291cmNlLmRhdGFzZXQuY29kZXhwcFN0b3JlU291cmNlID0gXCJ0cnVlXCI7XG4gIHNvdXJjZS50ZXh0Q29udGVudCA9IFwiTG9hZGluZyBsaXZlIHJlZ2lzdHJ5XCI7XG5cbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBjb25zdCByZWZyZXNoQnRuID0gc3RvcmVJY29uQnV0dG9uKHJlZnJlc2hJY29uU3ZnKCksIFwiUmVmcmVzaCB0d2VhayBzdG9yZVwiLCAoKSA9PiB7XG4gICAgcmVmcmVzaEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgdXBkYXRlU3RvcmVVcGRhdGVCYWRnZShudWxsKTtcbiAgICBncmlkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQpO1xuICAgIHJlZnJlc2hUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UsIHJlZnJlc2hCdG4sIHRydWUpO1xuICB9KTtcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChyZWZyZXNoQnRuKTtcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChzdG9yZVRvb2xiYXJCdXR0b24oXCJQdWJsaXNoIFR3ZWFrXCIsIG9wZW5QdWJsaXNoVHdlYWtEaWFsb2csIFwicHJpbWFyeVwiKSk7XG4gIGlmIChoZWFkZXJBY3Rpb25zKSB7XG4gICAgaGVhZGVyQWN0aW9ucy5yZXBsYWNlQ2hpbGRyZW4oYWN0aW9ucyk7XG4gIH1cblxuICBjb25zdCBncmlkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZ3JpZC5kYXRhc2V0LmNvZGV4cHBTdG9yZUdyaWQgPSBcInRydWVcIjtcbiAgZ3JpZC5jbGFzc05hbWUgPSBcImdyaWQgZ2FwLTRcIjtcbiAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUpIHtcbiAgICBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlID0gSlNPTi5zdHJpbmdpZnkoc3RhdGUudHdlYWtTdG9yZSk7XG4gICAgcmVuZGVyVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlKTtcbiAgfSBlbHNlIHtcbiAgICByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQpO1xuICB9XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc291cmNlKTtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChncmlkKTtcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuICByZWZyZXNoVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlLCByZWZyZXNoQnRuKTtcbn1cblxuZnVuY3Rpb24gcmVmcmVzaFR3ZWFrU3RvcmVHcmlkKFxuICBncmlkOiBIVE1MRWxlbWVudCxcbiAgc291cmNlOiBIVE1MRWxlbWVudCxcbiAgcmVmcmVzaEJ0bj86IEhUTUxCdXR0b25FbGVtZW50LFxuICBmb3JjZSA9IGZhbHNlLFxuKTogdm9pZCB7XG4gIHZvaWQgZ2V0VHdlYWtTdG9yZShmb3JjZSlcbiAgICAudGhlbigoc3RvcmUpID0+IHtcbiAgICAgIGdyaWQuZGF0YXNldC5jb2RleHBwU3RvcmUgPSBKU09OLnN0cmluZ2lmeShzdG9yZSk7XG4gICAgICByZW5kZXJUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UpO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlID0gXCJcIjtcbiAgICAgIGdyaWQucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1idXN5XCIpO1xuICAgICAgc291cmNlLnRleHRDb250ZW50ID0gXCJMaXZlIHJlZ2lzdHJ5IHVuYXZhaWxhYmxlXCI7XG4gICAgICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKG51bGwpO1xuICAgICAgZ3JpZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICBncmlkLmFwcGVuZENoaWxkKHN0b3JlTWVzc2FnZUNhcmQoXCJDb3VsZCBub3QgbG9hZCB0d2VhayBzdG9yZVwiLCBTdHJpbmcoZSkpKTtcbiAgICB9KVxuICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgIGlmIChyZWZyZXNoQnRuKSByZWZyZXNoQnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHdhcm1Ud2Vha1N0b3JlKCk6IHZvaWQge1xuICBpZiAoc3RhdGUudHdlYWtTdG9yZSB8fCBzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSkgcmV0dXJuO1xuICB2b2lkIGdldFR3ZWFrU3RvcmUoKS50aGVuKChzdG9yZSkgPT4ge1xuICAgIHVwZGF0ZVN0b3JlVXBkYXRlQmFkZ2Uob3V0ZGF0ZWRJbnN0YWxsZWRTdG9yZUNvdW50KHN0b3JlLmVudHJpZXMpKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldFR3ZWFrU3RvcmUoZm9yY2UgPSBmYWxzZSk6IFByb21pc2U8VHdlYWtTdG9yZVJlZ2lzdHJ5Vmlldz4ge1xuICBpZiAoIWZvcmNlKSB7XG4gICAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUpIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3RhdGUudHdlYWtTdG9yZSk7XG4gICAgaWYgKHN0YXRlLnR3ZWFrU3RvcmVQcm9taXNlKSByZXR1cm4gc3RhdGUudHdlYWtTdG9yZVByb21pc2U7XG4gIH1cbiAgc3RhdGUudHdlYWtTdG9yZUVycm9yID0gbnVsbDtcbiAgY29uc3QgcHJvbWlzZSA9IGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LXR3ZWFrLXN0b3JlXCIpXG4gICAgLnRoZW4oKHN0b3JlKSA9PiB7XG4gICAgICBzdGF0ZS50d2Vha1N0b3JlID0gc3RvcmUgYXMgVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldztcbiAgICAgIHJldHVybiBzdGF0ZS50d2Vha1N0b3JlO1xuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBzdGF0ZS50d2Vha1N0b3JlRXJyb3IgPSBlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9KVxuICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgIGlmIChzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSA9PT0gcHJvbWlzZSkgc3RhdGUudHdlYWtTdG9yZVByb21pc2UgPSBudWxsO1xuICAgIH0pO1xuICBzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSA9IHByb21pc2U7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUd2Vha1N0b3JlR3JpZChncmlkOiBIVE1MRWxlbWVudCwgc291cmNlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBzdG9yZSA9IHBhcnNlU3RvcmVEYXRhc2V0KGdyaWQpO1xuICBpZiAoIXN0b3JlKSByZXR1cm47XG4gIGNvbnN0IGVudHJpZXMgPSBzdG9yZS5lbnRyaWVzO1xuICBncmlkLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcbiAgc291cmNlLnRleHRDb250ZW50ID0gYFJlZnJlc2hlZCAke25ldyBEYXRlKHN0b3JlLmZldGNoZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX1gO1xuICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKG91dGRhdGVkSW5zdGFsbGVkU3RvcmVDb3VudChlbnRyaWVzKSk7XG4gIGdyaWQudGV4dENvbnRlbnQgPSBcIlwiO1xuICBpZiAoc3RvcmUuZW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICBncmlkLmFwcGVuZENoaWxkKHN0b3JlTWVzc2FnZUNhcmQoXCJObyB0d2Vha3MgeWV0XCIsIFwiVXNlIFB1Ymxpc2ggVHdlYWsgdG8gc3VibWl0IHRoZSBmaXJzdCBvbmUuXCIpKTtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSBncmlkLmFwcGVuZENoaWxkKHR3ZWFrU3RvcmVDYXJkKGVudHJ5KSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU3RvcmVEYXRhc2V0KGdyaWQ6IEhUTUxFbGVtZW50KTogVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldyB8IG51bGwge1xuICBjb25zdCByYXcgPSBncmlkLmRhdGFzZXQuY29kZXhwcFN0b3JlO1xuICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmF3KSBhcyBUd2Vha1N0b3JlUmVnaXN0cnlWaWV3O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiB0d2Vha1N0b3JlQ2FyZChlbnRyeTogVHdlYWtTdG9yZUVudHJ5Vmlldyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgc2hlbGwgPSB0d2Vha1N0b3JlQ2FyZFNoZWxsKCk7XG4gIGNvbnN0IHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH0gPSBzaGVsbDtcblxuICBsZWZ0Lmluc2VydEJlZm9yZShzdG9yZUF2YXRhcihlbnRyeSksIHN0YWNrKTtcblxuICBjb25zdCB0aXRsZVJvdyA9IHR3ZWFrU3RvcmVUaXRsZVJvdygpO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LWxnIGZvbnQtc2VtaWJvbGQgbGVhZGluZy03IHRleHQtdG9rZW4tZm9yZWdyb3VuZFwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IGVudHJ5Lm1hbmlmZXN0Lm5hbWU7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodmVyaWZpZWRTYWZlQmFkZ2UoKSk7XG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuICBpZiAoZW50cnkubWFuaWZlc3QuZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkZXNjID0gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk7XG4gICAgZGVzYy50ZXh0Q29udGVudCA9IGVudHJ5Lm1hbmlmZXN0LmRlc2NyaXB0aW9uO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKGRlc2MpO1xuICB9XG5cbiAgc3RhY2suYXBwZW5kQ2hpbGQodHdlYWtTdG9yZVJlYWRNb3JlQnV0dG9uKGVudHJ5LnJlcG8pKTtcbiAgdmVyc2lvbnMuYXBwZW5kQ2hpbGQodHdlYWtTdG9yZVZlcnNpb25CYWRnZShlbnRyeSkpO1xuXG4gIGlmIChlbnRyeS5yZWxlYXNlVXJsKSB7XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgZW50cnkucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGNvbnN0IGhhc1VwZGF0ZSA9ICEhZW50cnkuaW5zdGFsbGVkICYmIGVudHJ5Lmluc3RhbGxlZC52ZXJzaW9uICE9PSBlbnRyeS5tYW5pZmVzdC52ZXJzaW9uO1xuICBpZiAoZW50cnkuaW5zdGFsbGVkICYmICFoYXNVcGRhdGUpIHtcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XG4gIH0gZWxzZSBpZiAoZW50cnkucGxhdGZvcm0gJiYgIWVudHJ5LnBsYXRmb3JtLmNvbXBhdGlibGUpIHtcbiAgICBjYXJkLmNsYXNzTGlzdC5hZGQoXCJvcGFjaXR5LTcwXCIpO1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNQaWxsKHBsYXRmb3JtTG9ja2VkTGFiZWwoZW50cnkucGxhdGZvcm0pKSk7XG4gIH0gZWxzZSBpZiAoZW50cnkucnVudGltZSAmJiAhZW50cnkucnVudGltZS5jb21wYXRpYmxlKSB7XG4gICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwib3BhY2l0eS03MFwiKTtcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChydW50aW1lTG9ja2VkTGFiZWwoZW50cnkucnVudGltZSkpKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBpbnN0YWxsTGFiZWwgPSBlbnRyeS5pbnN0YWxsZWQgPyBcIlVwZGF0ZVwiIDogXCJJbnN0YWxsXCI7XG4gICAgaWYgKGhhc1VwZGF0ZSkgYWN0aW9ucy5hcHBlbmRDaGlsZChzdG9yZVN0YXR1c1BpbGwoXCJVcGRhdGUgYXZhaWxhYmxlXCIsIFwiaW5mb1wiKSk7XG4gICAgY29uc3QgaW5zdGFsbEJ1dHRvbiA9IHN0b3JlSW5zdGFsbEJ1dHRvbihpbnN0YWxsTGFiZWwsIChidXR0b24pID0+IHtcbiAgICAgIGNvbnN0IGdyaWQgPSBjYXJkLmNsb3Nlc3QoXCJbZGF0YS1jb2RleHBwLXN0b3JlLWdyaWRdXCIpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgIGNvbnN0IHNvdXJjZSA9IGdyaWQ/LnBhcmVudEVsZW1lbnQ/LnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1jb2RleHBwLXN0b3JlLXNvdXJjZV1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgc2hvd1N0b3JlQnV0dG9uTG9hZGluZyhidXR0b24sIGVudHJ5Lmluc3RhbGxlZCA/IFwiVXBkYXRpbmdcIiA6IFwiSW5zdGFsbGluZ1wiKTtcbiAgICAgIGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKS5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSB0cnVlKSk7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOmluc3RhbGwtc3RvcmUtdHdlYWtcIiwgZW50cnkuaWQpXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBzaG93U3RvcmVUb2FzdChgJHtlbnRyeS5tYW5pZmVzdC5uYW1lfSBpbnN0YWxsZWQuYCk7XG4gICAgICAgICAgc2hvd1N0b3JlQnV0dG9uSW5zdGFsbGVkKGJ1dHRvbik7XG4gICAgICAgICAgdmVyc2lvbnMucmVwbGFjZUNoaWxkcmVuKHR3ZWFrU3RvcmVWZXJzaW9uQmFkZ2UoZW50cnksIGVudHJ5Lm1hbmlmZXN0LnZlcnNpb24pKTtcbiAgICAgICAgICB1cGRhdGVTdG9yZVVwZGF0ZUJhZGdlKE1hdGgubWF4KDAsIGN1cnJlbnRTdG9yZVVwZGF0ZUJhZGdlQ291bnQoKSAtIDEpKTtcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGFjdGlvbnMucmVwbGFjZUNoaWxkcmVuKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XG4gICAgICAgICAgICBpZiAoZ3JpZCAmJiBzb3VyY2UpIHJlZnJlc2hUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UsIHVuZGVmaW5lZCwgdHJ1ZSk7XG4gICAgICAgICAgfSwgOTAwKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgcmVzZXRTdG9yZUluc3RhbGxCdXR0b24oYnV0dG9uLCBpbnN0YWxsTGFiZWwpO1xuICAgICAgICAgIGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKS5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSBmYWxzZSkpO1xuICAgICAgICAgIHNob3dTdG9yZUNhcmRNZXNzYWdlKGNhcmQsIFN0cmluZygoZSBhcyBFcnJvcikubWVzc2FnZSA/PyBlKSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoaW5zdGFsbEJ1dHRvbik7XG4gIH1cbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIHBsYXRmb3JtTG9ja2VkTGFiZWwocGxhdGZvcm06IE5vbk51bGxhYmxlPFR3ZWFrU3RvcmVFbnRyeVZpZXdbXCJwbGF0Zm9ybVwiXT4pOiBzdHJpbmcge1xuICBjb25zdCBzdXBwb3J0ZWQgPSBwbGF0Zm9ybS5zdXBwb3J0ZWQgPz8gW107XG4gIGlmIChzdXBwb3J0ZWQuaW5jbHVkZXMoXCJ3aW4zMlwiKSkgcmV0dXJuIFwiV2luZG93cyBvbmx5XCI7XG4gIGlmIChzdXBwb3J0ZWQuaW5jbHVkZXMoXCJkYXJ3aW5cIikpIHJldHVybiBcIm1hY09TIG9ubHlcIjtcbiAgaWYgKHN1cHBvcnRlZC5pbmNsdWRlcyhcImxpbnV4XCIpKSByZXR1cm4gXCJMaW51eCBvbmx5XCI7XG4gIHJldHVybiBcIlVuYXZhaWxhYmxlXCI7XG59XG5cbmZ1bmN0aW9uIHJ1bnRpbWVMb2NrZWRMYWJlbChydW50aW1lOiBOb25OdWxsYWJsZTxUd2Vha1N0b3JlRW50cnlWaWV3W1wicnVudGltZVwiXT4pOiBzdHJpbmcge1xuICByZXR1cm4gcnVudGltZS5yZXF1aXJlZCA/IGBSZXF1aXJlcyBDb2RleCsrICR7cnVudGltZS5yZXF1aXJlZH1gIDogXCJSZXF1aXJlcyBuZXdlciBDb2RleCsrXCI7XG59XG5cbmZ1bmN0aW9uIHNob3dTdG9yZUNhcmRNZXNzYWdlKGNhcmQ6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgY2FyZC5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtY29kZXhwcC1zdG9yZS1jYXJkLW1lc3NhZ2VdXCIpPy5yZW1vdmUoKTtcbiAgY29uc3Qgbm90aWNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbm90aWNlLmRhdGFzZXQuY29kZXhwcFN0b3JlQ2FyZE1lc3NhZ2UgPSBcInRydWVcIjtcbiAgbm90aWNlLmNsYXNzTmFtZSA9XG4gICAgXCJyb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyLzUwIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0zIHB5LTIgdGV4dC1zbSBsZWFkaW5nLTUgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XG4gIG5vdGljZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGNvbnN0IGFjdGlvbnMgPSBjYXJkLmxhc3RFbGVtZW50Q2hpbGQ7XG4gIGlmIChhY3Rpb25zKSBjYXJkLmluc2VydEJlZm9yZShub3RpY2UsIGFjdGlvbnMpO1xuICBlbHNlIGNhcmQuYXBwZW5kQ2hpbGQobm90aWNlKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZUNhcmRTaGVsbCgpOiB7XG4gIGNhcmQ6IEhUTUxFbGVtZW50O1xuICBsZWZ0OiBIVE1MRWxlbWVudDtcbiAgc3RhY2s6IEhUTUxFbGVtZW50O1xuICB2ZXJzaW9uczogSFRNTEVsZW1lbnQ7XG4gIGFjdGlvbnM6IEhUTUxFbGVtZW50O1xufSB7XG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjYXJkLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyLzQwIGZsZXggbWluLWgtWzE5MHB4XSBmbGV4LWNvbCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcm91bmRlZC0yeGwgYm9yZGVyIHAtNCB0cmFuc2l0aW9uLWNvbG9ycyBob3ZlcjpiZy10b2tlbi1mb3JlZ3JvdW5kLzVcIjtcblxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTJcIjtcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XG4gIGNhcmQuYXBwZW5kQ2hpbGQobGVmdCk7XG5cbiAgY29uc3QgZm9vdGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZm9vdGVyLmNsYXNzTmFtZSA9IFwibXQtYXV0byBmbGV4IG1pbi13LTAgZmxleC13cmFwIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTJcIjtcbiAgY29uc3QgdmVyc2lvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB2ZXJzaW9ucy5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIGZvb3Rlci5hcHBlbmRDaGlsZCh2ZXJzaW9ucyk7XG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1lbmQgZ2FwLTJcIjtcbiAgZm9vdGVyLmFwcGVuZENoaWxkKGFjdGlvbnMpO1xuICBjYXJkLmFwcGVuZENoaWxkKGZvb3Rlcik7XG5cbiAgcmV0dXJuIHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH07XG59XG5cbmZ1bmN0aW9uIHR3ZWFrU3RvcmVUaXRsZVJvdygpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC0zXCI7XG4gIHJldHVybiB0aXRsZVJvdztcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJsaW5lLWNsYW1wLTMgbWluLXctMCB0ZXh0LXNtIGxlYWRpbmctNSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIHJldHVybiBkZXNjO1xufVxuXG5mdW5jdGlvbiB0d2Vha1N0b3JlUmVhZE1vcmVCdXR0b24ocmVwbzogc3RyaW5nKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCByZWFkTW9yZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIHJlYWRNb3JlLnR5cGUgPSBcImJ1dHRvblwiO1xuICByZWFkTW9yZS5jbGFzc05hbWUgPVxuICAgIFwiaW5saW5lLWZsZXggdy1maXQgaXRlbXMtY2VudGVyIGdhcC0xIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcbiAgcmVhZE1vcmUuaW5uZXJIVE1MID1cbiAgICBgUmVhZCBNb3JlYCArXG4gICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiIGZpbGw9XCJub25lXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNNiAzLjVoNi41VjEwTTEyLjI1IDMuNzUgNCAxMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNDVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmA7XG4gIHJlYWRNb3JlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfWApO1xuICB9KTtcbiAgcmV0dXJuIHJlYWRNb3JlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUd2Vha1N0b3JlR2hvc3RHcmlkKGdyaWQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGdyaWQuc2V0QXR0cmlidXRlKFwiYXJpYS1idXN5XCIsIFwidHJ1ZVwiKTtcbiAgZ3JpZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gIGdyaWQuYXBwZW5kQ2hpbGQodHdlYWtTdG9yZUdob3N0Q2FyZCgpKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtTdG9yZUdob3N0Q2FyZCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHsgY2FyZCwgbGVmdCwgc3RhY2ssIHZlcnNpb25zLCBhY3Rpb25zIH0gPSB0d2Vha1N0b3JlQ2FyZFNoZWxsKCk7XG4gIGNhcmQuY2xhc3NMaXN0LmFkZChcInBvaW50ZXItZXZlbnRzLW5vbmVcIik7XG4gIGNhcmQuc2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIiwgXCJ0cnVlXCIpO1xuXG4gIGxlZnQuaW5zZXJ0QmVmb3JlKHN0b3JlQXZhdGFyR2hvc3QoKSwgc3RhY2spO1xuXG4gIGNvbnN0IHRpdGxlUm93ID0gdHdlYWtTdG9yZVRpdGxlUm93KCk7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtbGcgZm9udC1zZW1pYm9sZCBsZWFkaW5nLTcgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCI7XG4gIHRpdGxlLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJteS0xIGgtNSB3LTQ0IHJvdW5kZWQtbWRcIikpO1xuICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHZlcmlmaWVkU2FmZUdob3N0QmFkZ2UoKSk7XG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuICBjb25zdCBkZXNjID0gdHdlYWtTdG9yZURlc2NyaXB0aW9uKCk7XG4gIGRlc2MuYXBwZW5kQ2hpbGQoZ2hvc3RCbG9jayhcIm10LTEgaC0zIHctZnVsbCByb3VuZGVkXCIpKTtcbiAgZGVzYy5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXQtMiBoLTMgdy0xMS8xMiByb3VuZGVkXCIpKTtcbiAgZGVzYy5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXQtMiBoLTMgdy03LzEyIHJvdW5kZWRcIikpO1xuICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcblxuICBjb25zdCByZWFkTW9yZSA9IHR3ZWFrU3RvcmVSZWFkTW9yZUJ1dHRvbihcIlwiKTtcbiAgcmVhZE1vcmUucmVwbGFjZUNoaWxkcmVuKGdob3N0QmxvY2soXCJoLTUgdy0yNCByb3VuZGVkXCIpKTtcbiAgc3RhY2suYXBwZW5kQ2hpbGQocmVhZE1vcmUpO1xuXG4gIHZlcnNpb25zLmFwcGVuZENoaWxkKHN0b3JlVmVyc2lvbkdob3N0QmFkZ2UoKSk7XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNHaG9zdFBpbGwoKSk7XG4gIHJldHVybiBjYXJkO1xufVxuXG5mdW5jdGlvbiBzdG9yZUF2YXRhckdob3N0KCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgYXZhdGFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XG4gICAgXCJmbGV4IGgtMTAgdy0xMCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXItZGVmYXVsdCBiZy10cmFuc3BhcmVudCB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcbiAgYXZhdGFyLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJoLWZ1bGwgdy1mdWxsXCIpKTtcbiAgcmV0dXJuIGF2YXRhcjtcbn1cblxuZnVuY3Rpb24gdmVyaWZpZWRTYWZlR2hvc3RCYWRnZSgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gdmVyaWZpZWRTYWZlQmFkZ2UoKTtcbiAgYmFkZ2UucmVwbGFjZUNoaWxkcmVuKGdob3N0QmxvY2soXCJoLVsxM3B4XSB3LVsxM3B4XSByb3VuZGVkLXNtXCIpLCBnaG9zdEJsb2NrKFwiaC0zIHctMjAgcm91bmRlZFwiKSk7XG4gIHJldHVybiBiYWRnZTtcbn1cblxuZnVuY3Rpb24gc3RvcmVTdGF0dXNHaG9zdFBpbGwoKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBwaWxsID0gc3RvcmVTdGF0dXNQaWxsKFwiSW5zdGFsbGVkXCIpO1xuICBwaWxsLmNsYXNzTGlzdC5hZGQoXCJhbmltYXRlLXB1bHNlXCIpO1xuICBwaWxsLnN0eWxlLmNvbG9yID0gXCJ0cmFuc3BhcmVudFwiO1xuICByZXR1cm4gcGlsbDtcbn1cblxuZnVuY3Rpb24gc3RvcmVWZXJzaW9uR2hvc3RCYWRnZSgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gc3RvcmVWZXJzaW9uQmFkZ2VTaGVsbChmYWxzZSk7XG4gIGJhZGdlLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJoLTMgdy0zNiByb3VuZGVkXCIpKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiBnaG9zdEJsb2NrKGNsYXNzTmFtZTogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBibG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGJsb2NrLmNsYXNzTmFtZSA9IGBhbmltYXRlLXB1bHNlIGJnLXRva2VuLWZvcmVncm91bmQvMTAgJHtjbGFzc05hbWV9YDtcbiAgYmxvY2suc2V0QXR0cmlidXRlKFwiYXJpYS1oaWRkZW5cIiwgXCJ0cnVlXCIpO1xuICByZXR1cm4gYmxvY2s7XG59XG5cbmZ1bmN0aW9uIHN0b3JlQXZhdGFyKGVudHJ5OiBUd2Vha1N0b3JlRW50cnlWaWV3KTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBhdmF0YXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhdmF0YXIuY2xhc3NOYW1lID1cbiAgICBcImZsZXggaC0xMCB3LTEwIHNocmluay0wIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci1kZWZhdWx0IGJnLXRyYW5zcGFyZW50IHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xuICBjb25zdCBpbml0aWFsID0gKGVudHJ5Lm1hbmlmZXN0Lm5hbWU/LlswXSA/PyBcIj9cIikudG9VcHBlckNhc2UoKTtcbiAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xuICBhdmF0YXIuYXBwZW5kQ2hpbGQoZmFsbGJhY2spO1xuICBjb25zdCBpY29uVXJsID0gc3RvcmVFbnRyeUljb25VcmwoZW50cnkpO1xuICBpZiAoaWNvblVybCkge1xuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgaW1nLmFsdCA9IFwiXCI7XG4gICAgaW1nLmNsYXNzTmFtZSA9IFwiaC1mdWxsIHctZnVsbCBvYmplY3QtY292ZXJcIjtcbiAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIGltZy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB9KTtcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcbiAgICAgIGltZy5yZW1vdmUoKTtcbiAgICB9KTtcbiAgICBpbWcuc3JjID0gaWNvblVybDtcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgfVxuICByZXR1cm4gYXZhdGFyO1xufVxuXG5mdW5jdGlvbiBzdG9yZUVudHJ5SWNvblVybChlbnRyeTogVHdlYWtTdG9yZUVudHJ5Vmlldyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBpY29uVXJsID0gZW50cnkubWFuaWZlc3QuaWNvblVybD8udHJpbSgpO1xuICBpZiAoIWljb25VcmwpIHJldHVybiBudWxsO1xuICBpZiAoL14oaHR0cHM/OnxkYXRhOikvaS50ZXN0KGljb25VcmwpKSByZXR1cm4gaWNvblVybDtcbiAgY29uc3QgcmVsID0gaWNvblVybC5yZXBsYWNlKC9eXFwuP1xcLy8sIFwiXCIpO1xuICBpZiAoIXJlbCB8fCByZWwuc3RhcnRzV2l0aChcIi4uL1wiKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLyR7ZW50cnkucmVwb30vJHtlbnRyeS5hcHByb3ZlZENvbW1pdFNoYX0vJHtyZWx9YDtcbn1cblxuZnVuY3Rpb24gc2lkZWJhclVwZGF0ZVBpbGxCdXR0b24oKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5kYXRhc2V0LmNvZGV4cHBTaWRlYmFyVXBkYXRlID0gXCJ0cnVlXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwidXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXBcIjtcbiAgT2JqZWN0LmFzc2lnbihidG4uc3R5bGUsIHtcbiAgICBkaXNwbGF5OiBcIm5vbmVcIixcbiAgICBoZWlnaHQ6IFwiMjBweFwiLFxuICAgIGJvcmRlclJhZGl1czogXCI5OTk5cHhcIixcbiAgICBib3JkZXI6IFwiMFwiLFxuICAgIGJhY2tncm91bmQ6IFwiIzBBODRGRlwiLFxuICAgIGNvbG9yOiBcIiNGRkZGRkZcIixcbiAgICBwYWRkaW5nOiBcIjAgOHB4XCIsXG4gICAgZm9udFNpemU6IFwiMTBweFwiLFxuICAgIGZvbnRXZWlnaHQ6IFwiNzAwXCIsXG4gICAgbGluZUhlaWdodDogXCIyMHB4XCIsXG4gICAgbGV0dGVyU3BhY2luZzogXCIwXCIsXG4gICAgdGV4dFRyYW5zZm9ybTogXCJub25lXCIsXG4gICAgYm94U2hhZG93OiBcIjAgMXB4IDJweCByZ2JhKDAsIDAsIDAsIDAuMTgpXCIsXG4gIH0pO1xuICBidG4udGV4dENvbnRlbnQgPSBcIlVwZGF0ZVwiO1xuICBidG4udGl0bGUgPSBcIk9wZW4gQ29kZXgrKyB1cGRhdGVcIjtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwiIzAwNzFFM1wiO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwiIzBBODRGRlwiO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGJ0bi5kYXRhc2V0LmNvZGV4cHBSZWxlYXNlVXJsIHx8IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTCk7XG4gIH0pO1xuICByZXR1cm4gYnRuO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24oZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuICBjb25zdCBidG4gPSBzdGF0ZS5jb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uO1xuICBpZiAoIWJ0bikgcmV0dXJuO1xuICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Y2hlY2stY29kZXhwcC11cGRhdGVcIiwgZm9yY2UpXG4gICAgLnRoZW4oKGNoZWNrKSA9PiBzZXRTaWRlYmFyQ29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbihjaGVjayBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2spKVxuICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgcGxvZyhcIkNvZGV4Kysgc2lkZWJhciByZWxlYXNlIGNoZWNrIGZhaWxlZFwiLCBTdHJpbmcoZSkpO1xuICAgICAgc2V0U2lkZWJhckNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b24obnVsbCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHNldFNpZGViYXJDb2RleFBsdXNQbHVzVXBkYXRlQnV0dG9uKGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogdm9pZCB7XG4gIGNvbnN0IGJ0biA9IHN0YXRlLmNvZGV4UGx1c1BsdXNVcGRhdGVCdXR0b247XG4gIGlmICghYnRuKSByZXR1cm47XG4gIGNvbnN0IHVwZGF0ZUF2YWlsYWJsZSA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPT09IHRydWU7XG4gIGJ0bi5zdHlsZS5kaXNwbGF5ID0gdXBkYXRlQXZhaWxhYmxlID8gXCJpbmxpbmUtZmxleFwiIDogXCJub25lXCI7XG4gIGJ0bi5oaWRkZW4gPSAhdXBkYXRlQXZhaWxhYmxlO1xuICBidG4uZGF0YXNldC5jb2RleHBwUmVsZWFzZVVybCA9IGNoZWNrPy5yZWxlYXNlVXJsIHx8IENPREVYX1BMVVNQTFVTX1JFTEVBU0VTX1VSTDtcbiAgYnRuLnRpdGxlID1cbiAgICB1cGRhdGVBdmFpbGFibGUgJiYgY2hlY2s/LmxhdGVzdFZlcnNpb25cbiAgICAgID8gYE9wZW4gQ29kZXgrKyAke2NoZWNrLmxhdGVzdFZlcnNpb259IHVwZGF0ZWBcbiAgICAgIDogXCJPcGVuIENvZGV4KysgdXBkYXRlXCI7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0b3JlVXBkYXRlQmFkZ2UoY291bnQ6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtc3RvcmUtdXBkYXRlLWJhZGdlXVwiKTtcbiAgaWYgKCFiYWRnZSkgcmV0dXJuO1xuICBiYWRnZS5kYXRhc2V0LmNvZGV4cHBTdG9yZVVwZGF0ZUNvdW50ID0gY291bnQgPT09IG51bGwgPyBcIlwiIDogU3RyaW5nKGNvdW50KTtcbiAgYXBwbHlTdG9yZVVwZGF0ZUJhZGdlU3R5bGUoYmFkZ2UsIGNvdW50KTtcbiAgYmFkZ2UuaGlkZGVuID0gY291bnQgPT09IG51bGwgfHwgY291bnQgPD0gMDtcbiAgYmFkZ2UudGV4dENvbnRlbnQgPSBjb3VudCAmJiBjb3VudCA+IDAgPyBTdHJpbmcoY291bnQpIDogXCJcIjtcbiAgYmFkZ2UudGl0bGUgPVxuICAgIGNvdW50ICYmIGNvdW50ID4gMFxuICAgICAgPyBgJHtjb3VudH0gaW5zdGFsbGVkIHR3ZWFrJHtjb3VudCA9PT0gMSA/IFwiXCIgOiBcInNcIn0gY2FuIGJlIHVwZGF0ZWRgXG4gICAgICA6IFwiSW5zdGFsbGVkIHR3ZWFrcyBhcmUgdXAgdG8gZGF0ZVwiO1xufVxuXG5mdW5jdGlvbiBhcHBseVN0b3JlVXBkYXRlQmFkZ2VTdHlsZShiYWRnZTogSFRNTEVsZW1lbnQsIGNvdW50OiBudW1iZXIgfCBudWxsKTogdm9pZCB7XG4gIGNvbnN0IGhhc1VwZGF0ZXMgPSAhIWNvdW50ICYmIGNvdW50ID4gMDtcbiAgT2JqZWN0LmFzc2lnbihiYWRnZS5zdHlsZSwge1xuICAgIG1pbldpZHRoOiBcIjI0cHhcIixcbiAgICBoZWlnaHQ6IFwiMjBweFwiLFxuICAgIGJvcmRlclJhZGl1czogXCI5OTk5cHhcIixcbiAgICBib3JkZXI6IFwiMFwiLFxuICAgIGJhY2tncm91bmQ6IGhhc1VwZGF0ZXMgPyBcIiMwQTg0RkZcIiA6IFwidHJhbnNwYXJlbnRcIixcbiAgICBjb2xvcjogXCIjRkZGRkZGXCIsXG4gICAgcGFkZGluZzogXCIwIDdweFwiLFxuICAgIGZvbnRTaXplOiBcIjEycHhcIixcbiAgICBmb250V2VpZ2h0OiBcIjcwMFwiLFxuICAgIGxpbmVIZWlnaHQ6IFwiMjBweFwiLFxuICAgIGxldHRlclNwYWNpbmc6IFwiMFwiLFxuICAgIGJveFNoYWRvdzogaGFzVXBkYXRlcyA/IFwiMCAxcHggMnB4IHJnYmEoMCwgMCwgMCwgMC4yMilcIiA6IFwibm9uZVwiLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gY3VycmVudFN0b3JlVXBkYXRlQmFkZ2VDb3VudCgpOiBudW1iZXIge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1zdG9yZS11cGRhdGUtYmFkZ2VdXCIpO1xuICBjb25zdCByYXcgPSBiYWRnZT8uZGF0YXNldC5jb2RleHBwU3RvcmVVcGRhdGVDb3VudDtcbiAgY29uc3QgcGFyc2VkID0gcmF3ID8gTnVtYmVyKHJhdykgOiAwO1xuICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkgPyBwYXJzZWQgOiAwO1xufVxuXG5mdW5jdGlvbiBvdXRkYXRlZEluc3RhbGxlZFN0b3JlQ291bnQoZW50cmllczogVHdlYWtTdG9yZUVudHJ5Vmlld1tdKTogbnVtYmVyIHtcbiAgcmV0dXJuIGVudHJpZXMuZmlsdGVyKChlbnRyeSkgPT4gISFlbnRyeS5pbnN0YWxsZWQgJiYgZW50cnkuaW5zdGFsbGVkLnZlcnNpb24gIT09IGVudHJ5Lm1hbmlmZXN0LnZlcnNpb24pLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gc3RvcmVUb29sYmFyQnV0dG9uKFxuICBsYWJlbDogc3RyaW5nLFxuICBvbkNsaWNrOiAoKSA9PiB2b2lkLFxuICB2YXJpYW50OiBcInByaW1hcnlcIiB8IFwic2Vjb25kYXJ5XCIgPSBcInNlY29uZGFyeVwiLFxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIHZhcmlhbnQgPT09IFwicHJpbWFyeVwiXG4gICAgICA/IFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGZsZXggaC04IGl0ZW1zLWNlbnRlciBnYXAtMSB3aGl0ZXNwYWNlLW5vd3JhcCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWJnLWZvZyBweC0yIHB5LTAgdGV4dC1zbSB0ZXh0LXRva2VuLWJ1dHRvbi10ZXJ0aWFyeS1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCJcbiAgICAgIDogXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggaXRlbXMtY2VudGVyIGdhcC0xIHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10cmFuc3BhcmVudCBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcHgtMiBweS0wIHRleHQtc20gdGV4dC10b2tlbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tZm9yZWdyb3VuZC8xMCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xuICBidG4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIHN0b3JlSWNvbkJ1dHRvbihcbiAgaWNvblN2Zzogc3RyaW5nLFxuICBsYWJlbDogc3RyaW5nLFxuICBvbkNsaWNrOiAoKSA9PiB2b2lkLFxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGZsZXggaC04IHctOCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRyYW5zcGFyZW50IGJnLXRva2VuLWZvcmVncm91bmQvNSBwLTAgdGV4dC10b2tlbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tZm9yZWdyb3VuZC8xMCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xuICBidG4uaW5uZXJIVE1MID0gaWNvblN2ZztcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbGFiZWwpO1xuICBidG4udGl0bGUgPSBsYWJlbDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hJY29uU3ZnKCk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgYDxzdmcgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgY2xhc3M9XCJpY29uLXhzXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNNC40IDkuMzVBNS42NSA1LjY1IDAgMCAxIDE0IDUuM0wxNS43NSA3TTE1Ljc1IDMuNzVWN2gtMy4yNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICBgPHBhdGggZD1cIk0xNS42IDEwLjY1QTUuNjUgNS42NSAwIDAgMSA2IDE0LjdMNC4yNSAxM000LjI1IDE2LjI1VjEzSDcuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5mdW5jdGlvbiB2ZXJpZmllZFNhZmVCYWRnZSgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGJhZGdlLmNsYXNzTmFtZSA9XG4gICAgXCJpbmxpbmUtZmxleCBoLTYgc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0xLjUgcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci8zMCBiZy10cmFuc3BhcmVudCBweC0yIHRleHQteHMgZm9udC1tZWRpdW0gdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XG4gIGJhZGdlLmlubmVySFRNTCA9XG4gICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAxNCAxNFwiIGZpbGw9XCJub25lXCIgY2xhc3M9XCJ0ZXh0LWJsdWUtNTAwXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNNyAxLjc1IDExLjI1IDMuNHYzLjJjMCAyLjYtMS42NSA0LjI1LTQuMjUgNS40LTIuNi0xLjE1LTQuMjUtMi44LTQuMjUtNS40VjMuNEw3IDEuNzVaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS4xNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTQuODUgNy4wNSA2LjMgOC40NWwyLjg1LTMuMDVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjI1XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gICtcbiAgICBgPHNwYW4+VmVyaWZpZWQgYXMgc2FmZTwvc3Bhbj5gO1xuICByZXR1cm4gYmFkZ2U7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrU3RvcmVWZXJzaW9uQmFkZ2UoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeVZpZXcsIGluc3RhbGxlZE92ZXJyaWRlPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBpbnN0YWxsZWQgPSBpbnN0YWxsZWRPdmVycmlkZSA/PyBlbnRyeS5pbnN0YWxsZWQ/LnZlcnNpb24gPz8gbnVsbDtcbiAgY29uc3QgbGF0ZXN0ID0gZW50cnkubWFuaWZlc3QudmVyc2lvbjtcbiAgY29uc3QgaGFzVXBkYXRlID0gISFpbnN0YWxsZWQgJiYgaW5zdGFsbGVkICE9PSBsYXRlc3Q7XG4gIGNvbnN0IGJhZGdlID0gc3RvcmVWZXJzaW9uQmFkZ2VTaGVsbChoYXNVcGRhdGUpO1xuICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBsYWJlbC5jbGFzc05hbWUgPSBcInRydW5jYXRlXCI7XG4gIGxhYmVsLnRleHRDb250ZW50ID0gaW5zdGFsbGVkXG4gICAgPyBgSW5zdGFsbGVkIHYke2luc3RhbGxlZH0gXHUwMEI3IExhdGVzdCB2JHtsYXRlc3R9YFxuICAgIDogYExhdGVzdCB2JHtsYXRlc3R9YDtcbiAgYmFkZ2UudGl0bGUgPSBpbnN0YWxsZWRcbiAgICA/IGBJbnN0YWxsZWQgdmVyc2lvbiAke2luc3RhbGxlZH0uIExhdGVzdCBhcHByb3ZlZCB2ZXJzaW9uICR7bGF0ZXN0fS5gXG4gICAgOiBgTGF0ZXN0IGFwcHJvdmVkIHZlcnNpb24gJHtsYXRlc3R9LmA7XG4gIGJhZGdlLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiBzdG9yZVZlcnNpb25CYWRnZVNoZWxsKGhhc1VwZGF0ZTogYm9vbGVhbik6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgYmFkZ2UuY2xhc3NOYW1lID0gW1xuICAgIFwiaW5saW5lLWZsZXggaC04IG1pbi13LTAgbWF4LXctZnVsbCBpdGVtcy1jZW50ZXIgcm91bmRlZC1sZyBib3JkZXIgcHgtMi41IHRleHQteHMgZm9udC1tZWRpdW1cIixcbiAgICBoYXNVcGRhdGVcbiAgICAgID8gXCJib3JkZXItYmx1ZS01MDAvMzAgYmctYmx1ZS01MDAvMTAgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCJcbiAgICAgIDogXCJib3JkZXItdG9rZW4tYm9yZGVyLzQwIGJnLXRva2VuLWZvcmVncm91bmQvNSB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIixcbiAgXS5qb2luKFwiIFwiKTtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiBzdG9yZVN0YXR1c1BpbGwobGFiZWw6IHN0cmluZywgdG9uZTogXCJuZXV0cmFsXCIgfCBcImluZm9cIiA9IFwibmV1dHJhbFwiKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIHBpbGwuY2xhc3NOYW1lID0gW1xuICAgIFwiaW5saW5lLWZsZXggaC04IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciB3aGl0ZXNwYWNlLW5vd3JhcCByb3VuZGVkLWxnIHB4LTMgdGV4dC1zbSBmb250LW1lZGl1bVwiLFxuICAgIHRvbmUgPT09IFwiaW5mb1wiXG4gICAgICA/IFwiYm9yZGVyIGJvcmRlci1ibHVlLTUwMC8zMCBiZy1ibHVlLTUwMC8xMCB0ZXh0LXRva2VuLWZvcmVncm91bmRcIlxuICAgICAgOiBcImJnLXRva2VuLWZvcmVncm91bmQvNSB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIixcbiAgXS5qb2luKFwiIFwiKTtcbiAgcGlsbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICByZXR1cm4gcGlsbDtcbn1cblxuZnVuY3Rpb24gc3RvcmVJbnN0YWxsQnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6IChidXR0b246IEhUTUxCdXR0b25FbGVtZW50KSA9PiB2b2lkKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIHN0b3JlSW5zdGFsbEJ1dHRvbkNsYXNzKCk7XG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljayhidG4pO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoZXh0cmEgPSBcIlwiKTogc3RyaW5nIHtcbiAgcmV0dXJuIFtcbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGgtOCBtaW4tdy1bODJweF0gaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIGdhcC0xLjUgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLWJsdWUtNTAwLzQwIGJnLWJsdWUtNTAwIHB4LTMgcHktMCB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tZm9yZWdyb3VuZCBzaGFkb3ctc20gdHJhbnNpdGlvbi1jb2xvcnMgZW5hYmxlZDpob3ZlcjpiZy1ibHVlLTYwMCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS04MFwiLFxuICAgIGV4dHJhLFxuICBdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiIFwiKTtcbn1cblxuZnVuY3Rpb24gc2hvd1N0b3JlQnV0dG9uTG9hZGluZyhidXR0b246IEhUTUxCdXR0b25FbGVtZW50LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSBzdG9yZUluc3RhbGxCdXR0b25DbGFzcygpO1xuICBidXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuICBidXR0b24uc2V0QXR0cmlidXRlKFwiYXJpYS1idXN5XCIsIFwidHJ1ZVwiKTtcbiAgYnV0dG9uLmlubmVySFRNTCA9XG4gICAgYDxzdmcgY2xhc3M9XCJhbmltYXRlLXNwaW5cIiB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgZmlsbD1cIm5vbmVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPGNpcmNsZSBjeD1cIjhcIiBjeT1cIjhcIiByPVwiNS41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIG9wYWNpdHk9XCIuMjVcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTMuNSA4QTUuNSA1LjUgMCAwIDAgOCAyLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcbiAgICBgPC9zdmc+YCArXG4gICAgYDxzcGFuPiR7bGFiZWx9PC9zcGFuPmA7XG59XG5cbmZ1bmN0aW9uIHNob3dTdG9yZUJ1dHRvbkluc3RhbGxlZChidXR0b246IEhUTUxCdXR0b25FbGVtZW50KTogdm9pZCB7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSBzdG9yZUluc3RhbGxCdXR0b25DbGFzcyhcImJvcmRlci1ibHVlLTUwMCBiZy1ibHVlLTUwMFwiKTtcbiAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgYnV0dG9uLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcbiAgYnV0dG9uLmlubmVySFRNTCA9XG4gICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiIGZpbGw9XCJub25lXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMy43NSA4LjE1IDYuNjUgMTEgMTIuMjUgNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICBgPC9zdmc+YCArXG4gICAgYDxzcGFuPkluc3RhbGxlZDwvc3Bhbj5gO1xufVxuXG5mdW5jdGlvbiByZXNldFN0b3JlSW5zdGFsbEJ1dHRvbihidXR0b246IEhUTUxCdXR0b25FbGVtZW50LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSBzdG9yZUluc3RhbGxCdXR0b25DbGFzcygpO1xuICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgYnV0dG9uLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcbiAgYnV0dG9uLnRleHRDb250ZW50ID0gbGFiZWw7XG59XG5cbmZ1bmN0aW9uIHNob3dTdG9yZVRvYXN0KG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBsZXQgaG9zdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1zdG9yZS10b2FzdC1ob3N0XVwiKTtcbiAgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgaG9zdC5kYXRhc2V0LmNvZGV4cHBTdG9yZVRvYXN0SG9zdCA9IFwidHJ1ZVwiO1xuICAgIGhvc3QuY2xhc3NOYW1lID0gXCJwb2ludGVyLWV2ZW50cy1ub25lIGZpeGVkIGJvdHRvbS01IHJpZ2h0LTUgei1bOTk5OV0gZmxleCBmbGV4LWNvbCBpdGVtcy1lbmQgZ2FwLTJcIjtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGhvc3QpO1xuICB9XG4gIGNvbnN0IHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9hc3QuY2xhc3NOYW1lID1cbiAgICBcInRyYW5zbGF0ZS15LTIgcm91bmRlZC14bCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci81MCBiZy10b2tlbi1tYWluLXN1cmZhY2UtcHJpbWFyeSBweC0zIHB5LTIgdGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLWZvcmVncm91bmQgb3BhY2l0eS0wIHNoYWRvdy1sZyB0cmFuc2l0aW9uLWFsbCBkdXJhdGlvbi0yMDBcIjtcbiAgdG9hc3QudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICBob3N0LmFwcGVuZENoaWxkKHRvYXN0KTtcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICB0b2FzdC5jbGFzc0xpc3QucmVtb3ZlKFwidHJhbnNsYXRlLXktMlwiLCBcIm9wYWNpdHktMFwiKTtcbiAgfSk7XG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHRvYXN0LmNsYXNzTGlzdC5hZGQoXCJ0cmFuc2xhdGUteS0yXCIsIFwib3BhY2l0eS0wXCIpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdG9hc3QucmVtb3ZlKCk7XG4gICAgICBpZiAoaG9zdCAmJiBob3N0LmNoaWxkRWxlbWVudENvdW50ID09PSAwKSBob3N0LnJlbW92ZSgpO1xuICAgIH0sIDIyMCk7XG4gIH0sIDI2MDApO1xufVxuXG5mdW5jdGlvbiBzdG9yZU1lc3NhZ2VDYXJkKHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY2FyZC5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlci80MCBmbGV4IG1pbi1oLVs4NHB4XSBmbGV4LWNvbCBqdXN0aWZ5LWNlbnRlciBnYXAtMSByb3VuZGVkLTJ4bCBib3JkZXIgcC00IHRleHQtc21cIjtcbiAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHQuY2xhc3NOYW1lID0gXCJmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0LnRleHRDb250ZW50ID0gdGl0bGU7XG4gIGNhcmQuYXBwZW5kQ2hpbGQodCk7XG4gIGlmIChkZXNjcmlwdGlvbikge1xuICAgIGNvbnN0IGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGQuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gICAgZC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuICAgIGNhcmQuYXBwZW5kQ2hpbGQoZCk7XG4gIH1cbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIHNob3J0U2hhKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUuc2xpY2UoMCwgNyk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclR3ZWFrc1BhZ2Uoc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBvcGVuQnRuID0gb3BlbkluUGxhY2VCdXR0b24oXCJPcGVuIFR3ZWFrcyBGb2xkZXJcIiwgKCkgPT4ge1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgdHdlYWtzUGF0aCgpKTtcbiAgfSk7XG4gIGNvbnN0IHJlbG9hZEJ0biA9IG9wZW5JblBsYWNlQnV0dG9uKFwiRm9yY2UgUmVsb2FkXCIsICgpID0+IHtcbiAgICAvLyBGdWxsIHBhZ2UgcmVmcmVzaCBcdTIwMTQgc2FtZSBhcyBEZXZUb29scyBDbWQtUiAvIG91ciBDRFAgUGFnZS5yZWxvYWQuXG4gICAgLy8gTWFpbiByZS1kaXNjb3ZlcnMgdHdlYWtzIGZpcnN0IHNvIHRoZSBuZXcgcmVuZGVyZXIgY29tZXMgdXAgd2l0aCBhXG4gICAgLy8gZnJlc2ggdHdlYWsgc2V0OyB0aGVuIGxvY2F0aW9uLnJlbG9hZCByZXN0YXJ0cyB0aGUgcmVuZGVyZXIgc28gdGhlXG4gICAgLy8gcHJlbG9hZCByZS1pbml0aWFsaXplcyBhZ2FpbnN0IGl0LlxuICAgIHZvaWQgaXBjUmVuZGVyZXJcbiAgICAgIC5pbnZva2UoXCJjb2RleHBwOnJlbG9hZC10d2Vha3NcIilcbiAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcImZvcmNlIHJlbG9hZCAobWFpbikgZmFpbGVkXCIsIFN0cmluZyhlKSkpXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIGxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgfSk7XG4gIH0pO1xuICAvLyBEcm9wIHRoZSBkaWFnb25hbC1hcnJvdyBpY29uIGZyb20gdGhlIHJlbG9hZCBidXR0b24gXHUyMDE0IGl0IGltcGxpZXMgXCJvcGVuXG4gIC8vIG91dCBvZiBhcHBcIiB3aGljaCBkb2Vzbid0IGZpdC4gUmVwbGFjZSBpdHMgdHJhaWxpbmcgc3ZnIHdpdGggYSByZWZyZXNoLlxuICBjb25zdCByZWxvYWRTdmcgPSByZWxvYWRCdG4ucXVlcnlTZWxlY3RvcihcInN2Z1wiKTtcbiAgaWYgKHJlbG9hZFN2Zykge1xuICAgIHJlbG9hZFN2Zy5vdXRlckhUTUwgPVxuICAgICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi0yeHNcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICAgIGA8cGF0aCBkPVwiTTQgMTBhNiA2IDAgMCAxIDEwLjI0LTQuMjRMMTYgNy41TTE2IDR2My41aC0zLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgICBgPHBhdGggZD1cIk0xNiAxMGE2IDYgMCAwIDEtMTAuMjQgNC4yNEw0IDEyLjVNNCAxNnYtMy41aDMuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICAgIGA8L3N2Zz5gO1xuICB9XG5cbiAgY29uc3QgdHJhaWxpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0cmFpbGluZy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIHRyYWlsaW5nLmFwcGVuZENoaWxkKHJlbG9hZEJ0bik7XG4gIHRyYWlsaW5nLmFwcGVuZENoaWxkKG9wZW5CdG4pO1xuXG4gIGlmIChzdGF0ZS5saXN0ZWRUd2Vha3MubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICAgIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gICAgc2VjdGlvbi5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJJbnN0YWxsZWQgVHdlYWtzXCIsIHRyYWlsaW5nKSk7XG4gICAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChcbiAgICAgIHJvd1NpbXBsZShcbiAgICAgICAgXCJObyB0d2Vha3MgaW5zdGFsbGVkXCIsXG4gICAgICAgIGBEcm9wIGEgdHdlYWsgZm9sZGVyIGludG8gJHt0d2Vha3NQYXRoKCl9IGFuZCByZWxvYWQuYCxcbiAgICAgICksXG4gICAgKTtcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKGNhcmQpO1xuICAgIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBHcm91cCByZWdpc3RlcmVkIFNldHRpbmdzU2VjdGlvbnMgYnkgdHdlYWsgaWQgKHByZWZpeCBzcGxpdCBhdCBcIjpcIikuXG4gIGNvbnN0IHNlY3Rpb25zQnlUd2VhayA9IG5ldyBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb25bXT4oKTtcbiAgZm9yIChjb25zdCBzIG9mIHN0YXRlLnNlY3Rpb25zLnZhbHVlcygpKSB7XG4gICAgY29uc3QgdHdlYWtJZCA9IHMuaWQuc3BsaXQoXCI6XCIpWzBdO1xuICAgIGlmICghc2VjdGlvbnNCeVR3ZWFrLmhhcyh0d2Vha0lkKSkgc2VjdGlvbnNCeVR3ZWFrLnNldCh0d2Vha0lkLCBbXSk7XG4gICAgc2VjdGlvbnNCeVR3ZWFrLmdldCh0d2Vha0lkKSEucHVzaChzKTtcbiAgfVxuXG4gIGNvbnN0IHBhZ2VzQnlUd2VhayA9IG5ldyBNYXA8c3RyaW5nLCBSZWdpc3RlcmVkUGFnZVtdPigpO1xuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoIXBhZ2VzQnlUd2Vhay5oYXMocC50d2Vha0lkKSkgcGFnZXNCeVR3ZWFrLnNldChwLnR3ZWFrSWQsIFtdKTtcbiAgICBwYWdlc0J5VHdlYWsuZ2V0KHAudHdlYWtJZCkhLnB1c2gocCk7XG4gIH1cblxuICBjb25zdCB3cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gIHdyYXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIHdyYXAuYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiSW5zdGFsbGVkIFR3ZWFrc1wiLCB0cmFpbGluZykpO1xuXG4gIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICBmb3IgKGNvbnN0IHQgb2Ygc3RhdGUubGlzdGVkVHdlYWtzKSB7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChcbiAgICAgIHR3ZWFrUm93KFxuICAgICAgICB0LFxuICAgICAgICBzZWN0aW9uc0J5VHdlYWsuZ2V0KHQubWFuaWZlc3QuaWQpID8/IFtdLFxuICAgICAgICBwYWdlc0J5VHdlYWsuZ2V0KHQubWFuaWZlc3QuaWQpID8/IFtdLFxuICAgICAgKSxcbiAgICApO1xuICB9XG4gIHdyYXAuYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZCh3cmFwKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtSb3coXG4gIHQ6IExpc3RlZFR3ZWFrLFxuICBzZWN0aW9uczogU2V0dGluZ3NTZWN0aW9uW10sXG4gIHBhZ2VzOiBSZWdpc3RlcmVkUGFnZVtdLFxuKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBtID0gdC5tYW5pZmVzdDtcblxuICAvLyBPdXRlciBjZWxsIHdyYXBzIHRoZSBoZWFkZXIgcm93ICsgKG9wdGlvbmFsKSBuZXN0ZWQgc2VjdGlvbnMgc28gdGhlXG4gIC8vIHBhcmVudCBjYXJkJ3MgZGl2aWRlciBzdGF5cyBiZXR3ZWVuICp0d2Vha3MqLCBub3QgYmV0d2VlbiBoZWFkZXIgYW5kXG4gIC8vIGJvZHkgb2YgdGhlIHNhbWUgdHdlYWsuXG4gIGNvbnN0IGNlbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBjZWxsLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbFwiO1xuICBpZiAoIXQuZW5hYmxlZCkgY2VsbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXIuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLXN0YXJ0IGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcblxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcblxuICAvLyBcdTI1MDBcdTI1MDAgQXZhdGFyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBjb25zdCBhdmF0YXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhdmF0YXIuY2xhc3NOYW1lID1cbiAgICBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgb3ZlcmZsb3ctaGlkZGVuIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgYXZhdGFyLnN0eWxlLndpZHRoID0gXCI1NnB4XCI7XG4gIGF2YXRhci5zdHlsZS5oZWlnaHQgPSBcIjU2cHhcIjtcbiAgYXZhdGFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCB0cmFuc3BhcmVudClcIjtcbiAgaWYgKG0uaWNvblVybCkge1xuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgaW1nLmFsdCA9IFwiXCI7XG4gICAgaW1nLmNsYXNzTmFtZSA9IFwic2l6ZS1mdWxsIG9iamVjdC1jb250YWluXCI7XG4gICAgLy8gSW5pdGlhbDogc2hvdyBmYWxsYmFjayBpbml0aWFsIGluIGNhc2UgdGhlIGljb24gZmFpbHMgdG8gbG9hZC5cbiAgICBjb25zdCBpbml0aWFsID0gKG0ubmFtZT8uWzBdID8/IFwiP1wiKS50b1VwcGVyQ2FzZSgpO1xuICAgIGNvbnN0IGZhbGxiYWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgZmFsbGJhY2suY2xhc3NOYW1lID0gXCJ0ZXh0LXhsIGZvbnQtbWVkaXVtXCI7XG4gICAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xuICAgIGF2YXRhci5hcHBlbmRDaGlsZChmYWxsYmFjayk7XG4gICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgKCkgPT4ge1xuICAgICAgZmFsbGJhY2sucmVtb3ZlKCk7XG4gICAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgfSk7XG4gICAgaW1nLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoKSA9PiB7XG4gICAgICBpbWcucmVtb3ZlKCk7XG4gICAgfSk7XG4gICAgdm9pZCByZXNvbHZlSWNvblVybChtLmljb25VcmwsIHQuZGlyKS50aGVuKCh1cmwpID0+IHtcbiAgICAgIGlmICh1cmwpIGltZy5zcmMgPSB1cmw7XG4gICAgICBlbHNlIGltZy5yZW1vdmUoKTtcbiAgICB9KTtcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBpbml0aWFsID0gKG0ubmFtZT8uWzBdID8/IFwiP1wiKS50b1VwcGVyQ2FzZSgpO1xuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICBzcGFuLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xuICAgIHNwYW4udGV4dENvbnRlbnQgPSBpbml0aWFsO1xuICAgIGF2YXRhci5hcHBlbmRDaGlsZChzcGFuKTtcbiAgfVxuICBsZWZ0LmFwcGVuZENoaWxkKGF2YXRhcik7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFRleHQgc3RhY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IHN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTAuNVwiO1xuXG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbmFtZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICBuYW1lLnRleHRDb250ZW50ID0gbS5uYW1lO1xuICB0aXRsZVJvdy5hcHBlbmRDaGlsZChuYW1lKTtcbiAgaWYgKG0udmVyc2lvbikge1xuICAgIGNvbnN0IHZlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHZlci5jbGFzc05hbWUgPVxuICAgICAgXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQteHMgZm9udC1ub3JtYWwgdGFidWxhci1udW1zXCI7XG4gICAgdmVyLnRleHRDb250ZW50ID0gYHYke20udmVyc2lvbn1gO1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHZlcik7XG4gIH1cbiAgaWYgKHQudXBkYXRlPy51cGRhdGVBdmFpbGFibGUpIHtcbiAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIGJhZGdlLmNsYXNzTmFtZSA9XG4gICAgICBcInJvdW5kZWQtZnVsbCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcHgtMiBweS0wLjUgdGV4dC1bMTFweF0gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICBiYWRnZS50ZXh0Q29udGVudCA9IFwiVXBkYXRlIEF2YWlsYWJsZVwiO1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKGJhZGdlKTtcbiAgfVxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XG5cbiAgaWYgKG0uZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgICBkZXNjLnRleHRDb250ZW50ID0gbS5kZXNjcmlwdGlvbjtcbiAgICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBtZXRhLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIGNvbnN0IGF1dGhvckVsID0gcmVuZGVyQXV0aG9yKG0uYXV0aG9yKTtcbiAgaWYgKGF1dGhvckVsKSBtZXRhLmFwcGVuZENoaWxkKGF1dGhvckVsKTtcbiAgaWYgKG0uZ2l0aHViUmVwbykge1xuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xuICAgIGNvbnN0IHJlcG8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIHJlcG8udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgcmVwby5jbGFzc05hbWUgPSBcImlubGluZS1mbGV4IHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XG4gICAgcmVwby50ZXh0Q29udGVudCA9IG0uZ2l0aHViUmVwbztcbiAgICByZXBvLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGBodHRwczovL2dpdGh1Yi5jb20vJHttLmdpdGh1YlJlcG99YCk7XG4gICAgfSk7XG4gICAgbWV0YS5hcHBlbmRDaGlsZChyZXBvKTtcbiAgfVxuICBpZiAobS5ob21lcGFnZSkge1xuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xuICAgIGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbiAgICBsaW5rLmhyZWYgPSBtLmhvbWVwYWdlO1xuICAgIGxpbmsudGFyZ2V0ID0gXCJfYmxhbmtcIjtcbiAgICBsaW5rLnJlbCA9IFwibm9yZWZlcnJlclwiO1xuICAgIGxpbmsuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xuICAgIGxpbmsudGV4dENvbnRlbnQgPSBcIkhvbWVwYWdlXCI7XG4gICAgbWV0YS5hcHBlbmRDaGlsZChsaW5rKTtcbiAgfVxuICBpZiAobWV0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSBzdGFjay5hcHBlbmRDaGlsZChtZXRhKTtcblxuICAvLyBUYWdzIHJvdyAoaWYgYW55KSBcdTIwMTQgc21hbGwgcGlsbCBjaGlwcyBiZWxvdyB0aGUgbWV0YSBsaW5lLlxuICBpZiAobS50YWdzICYmIG0udGFncy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGFnc1JvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGFnc1Jvdy5jbGFzc05hbWUgPSBcImZsZXggZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtMSBwdC0wLjVcIjtcbiAgICBmb3IgKGNvbnN0IHRhZyBvZiBtLnRhZ3MpIHtcbiAgICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIHBpbGwuY2xhc3NOYW1lID1cbiAgICAgICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgICAgIHBpbGwudGV4dENvbnRlbnQgPSB0YWc7XG4gICAgICB0YWdzUm93LmFwcGVuZENoaWxkKHBpbGwpO1xuICAgIH1cbiAgICBzdGFjay5hcHBlbmRDaGlsZCh0YWdzUm93KTtcbiAgfVxuXG4gIGxlZnQuYXBwZW5kQ2hpbGQoc3RhY2spO1xuICBoZWFkZXIuYXBwZW5kQ2hpbGQobGVmdCk7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIFRvZ2dsZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgY29uc3QgcmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yIHB0LTAuNVwiO1xuICBpZiAodC5lbmFibGVkICYmIHBhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjb25maWd1cmVCdG4gPSBjb21wYWN0QnV0dG9uKFwiQ29uZmlndXJlXCIsICgpID0+IHtcbiAgICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiLCBpZDogcGFnZXNbMF0hLmlkIH0pO1xuICAgIH0pO1xuICAgIGNvbmZpZ3VyZUJ0bi50aXRsZSA9IHBhZ2VzLmxlbmd0aCA9PT0gMVxuICAgICAgPyBgT3BlbiAke3BhZ2VzWzBdIS5wYWdlLnRpdGxlfWBcbiAgICAgIDogYE9wZW4gJHtwYWdlcy5tYXAoKHApID0+IHAucGFnZS50aXRsZSkuam9pbihcIiwgXCIpfWA7XG4gICAgcmlnaHQuYXBwZW5kQ2hpbGQoY29uZmlndXJlQnRuKTtcbiAgfVxuICBpZiAodC51cGRhdGU/LnVwZGF0ZUF2YWlsYWJsZSAmJiB0LnVwZGF0ZS5yZWxlYXNlVXJsKSB7XG4gICAgcmlnaHQuYXBwZW5kQ2hpbGQoXG4gICAgICBjb21wYWN0QnV0dG9uKFwiUmV2aWV3IFJlbGVhc2VcIiwgKCkgPT4ge1xuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCB0LnVwZGF0ZSEucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIHJpZ2h0LmFwcGVuZENoaWxkKFxuICAgIHN3aXRjaENvbnRyb2wodC5lbmFibGVkLCBhc3luYyAobmV4dCkgPT4ge1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpzZXQtdHdlYWstZW5hYmxlZFwiLCBtLmlkLCBuZXh0KTtcbiAgICAgIC8vIFRoZSBtYWluIHByb2Nlc3MgYnJvYWRjYXN0cyBhIHJlbG9hZCB3aGljaCB3aWxsIHJlLWZldGNoIHRoZSBsaXN0XG4gICAgICAvLyBhbmQgcmUtcmVuZGVyLiBXZSBkb24ndCBvcHRpbWlzdGljYWxseSB0b2dnbGUgdG8gYXZvaWQgZHJpZnQuXG4gICAgfSksXG4gICk7XG4gIGhlYWRlci5hcHBlbmRDaGlsZChyaWdodCk7XG5cbiAgY2VsbC5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gIC8vIElmIHRoZSB0d2VhayBpcyBlbmFibGVkIGFuZCByZWdpc3RlcmVkIHNldHRpbmdzIHNlY3Rpb25zLCByZW5kZXIgdGhvc2VcbiAgLy8gYm9kaWVzIGFzIG5lc3RlZCByb3dzIGJlbmVhdGggdGhlIGhlYWRlciBpbnNpZGUgdGhlIHNhbWUgY2VsbC5cbiAgaWYgKHQuZW5hYmxlZCAmJiBzZWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgbmVzdGVkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBuZXN0ZWQuY2xhc3NOYW1lID1cbiAgICAgIFwiZmxleCBmbGV4LWNvbCBkaXZpZGUteS1bMC41cHhdIGRpdmlkZS10b2tlbi1ib3JkZXIgYm9yZGVyLXQtWzAuNXB4XSBib3JkZXItdG9rZW4tYm9yZGVyXCI7XG4gICAgZm9yIChjb25zdCBzIG9mIHNlY3Rpb25zKSB7XG4gICAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGJvZHkuY2xhc3NOYW1lID0gXCJwLTNcIjtcbiAgICAgIHRyeSB7XG4gICAgICAgIHMucmVuZGVyKGJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBib2R5LnRleHRDb250ZW50ID0gYEVycm9yIHJlbmRlcmluZyB0d2VhayBzZWN0aW9uOiAkeyhlIGFzIEVycm9yKS5tZXNzYWdlfWA7XG4gICAgICB9XG4gICAgICBuZXN0ZWQuYXBwZW5kQ2hpbGQoYm9keSk7XG4gICAgfVxuICAgIGNlbGwuYXBwZW5kQ2hpbGQobmVzdGVkKTtcbiAgfVxuXG4gIHJldHVybiBjZWxsO1xufVxuXG5mdW5jdGlvbiByZW5kZXJBdXRob3IoYXV0aG9yOiBUd2Vha01hbmlmZXN0W1wiYXV0aG9yXCJdKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFhdXRob3IpIHJldHVybiBudWxsO1xuICBjb25zdCB3cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIHdyYXAuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTFcIjtcbiAgaWYgKHR5cGVvZiBhdXRob3IgPT09IFwic3RyaW5nXCIpIHtcbiAgICB3cmFwLnRleHRDb250ZW50ID0gYGJ5ICR7YXV0aG9yfWA7XG4gICAgcmV0dXJuIHdyYXA7XG4gIH1cbiAgd3JhcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcImJ5IFwiKSk7XG4gIGlmIChhdXRob3IudXJsKSB7XG4gICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuICAgIGEuaHJlZiA9IGF1dGhvci51cmw7XG4gICAgYS50YXJnZXQgPSBcIl9ibGFua1wiO1xuICAgIGEucmVsID0gXCJub3JlZmVycmVyXCI7XG4gICAgYS5jbGFzc05hbWUgPSBcImlubGluZS1mbGV4IHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XG4gICAgYS50ZXh0Q29udGVudCA9IGF1dGhvci5uYW1lO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQoYSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHNwYW4udGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcbiAgICB3cmFwLmFwcGVuZENoaWxkKHNwYW4pO1xuICB9XG4gIHJldHVybiB3cmFwO1xufVxuXG5mdW5jdGlvbiBvcGVuUHVibGlzaFR3ZWFrRGlhbG9nKCk6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1wdWJsaXNoLWRpYWxvZ11cIik7XG4gIGV4aXN0aW5nPy5yZW1vdmUoKTtcblxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3ZlcmxheS5kYXRhc2V0LmNvZGV4cHBQdWJsaXNoRGlhbG9nID0gXCJ0cnVlXCI7XG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJmaXhlZCBpbnNldC0wIHotWzk5OTldIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIGJnLWJsYWNrLzQwIHAtNFwiO1xuXG4gIGNvbnN0IGRpYWxvZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRpYWxvZy5jbGFzc05hbWUgPVxuICAgIFwiZmxleCB3LWZ1bGwgbWF4LXcteGwgZmxleC1jb2wgZ2FwLTQgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1tYWluLXN1cmZhY2UtcHJpbWFyeSBwLTQgc2hhZG93LXhsXCI7XG4gIG92ZXJsYXkuYXBwZW5kQ2hpbGQoZGlhbG9nKTtcblxuICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXIuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLXN0YXJ0IGp1c3RpZnktYmV0d2VlbiBnYXAtM1wiO1xuICBjb25zdCB0aXRsZVN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVTdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidGV4dC1iYXNlIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gIHRpdGxlLnRleHRDb250ZW50ID0gXCJQdWJsaXNoIFR3ZWFrXCI7XG4gIGNvbnN0IHN1YnRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc3VidGl0bGUuY2xhc3NOYW1lID0gXCJ0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgc3VidGl0bGUudGV4dENvbnRlbnQgPSBcIlN1Ym1pdCBhIEdpdEh1YiByZXBvIGZvciBhZG1pbiByZXZpZXcuIENvZGV4KysgcmVjb3JkcyB0aGUgZXhhY3QgY29tbWl0IGFkbWlucyBtdXN0IHJldmlldyBhbmQgcGluLlwiO1xuICB0aXRsZVN0YWNrLmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgdGl0bGVTdGFjay5hcHBlbmRDaGlsZChzdWJ0aXRsZSk7XG4gIGhlYWRlci5hcHBlbmRDaGlsZCh0aXRsZVN0YWNrKTtcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGNvbXBhY3RCdXR0b24oXCJEaXNtaXNzXCIsICgpID0+IG92ZXJsYXkucmVtb3ZlKCkpKTtcbiAgZGlhbG9nLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cbiAgY29uc3QgcmVwb0lucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICByZXBvSW5wdXQudHlwZSA9IFwidGV4dFwiO1xuICByZXBvSW5wdXQucGxhY2Vob2xkZXIgPSBcIm93bmVyL3JlcG8gb3IgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG9cIjtcbiAgcmVwb0lucHV0LmNsYXNzTmFtZSA9XG4gICAgXCJoLTEwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdHJhbnNwYXJlbnQgcHgtMyB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGZvY3VzOm91dGxpbmUtbm9uZVwiO1xuICBkaWFsb2cuYXBwZW5kQ2hpbGQocmVwb0lucHV0KTtcblxuICBjb25zdCBzdGF0dXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGF0dXMuY2xhc3NOYW1lID0gXCJtaW4taC01IHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBzdGF0dXMudGV4dENvbnRlbnQgPSBcIlRoZSBtYW5pZmVzdCBzaG91bGQgaW5jbHVkZSBhbiBpY29uVXJsIHN1aXRhYmxlIGZvciB0aGUgc3RvcmUuXCI7XG4gIGRpYWxvZy5hcHBlbmRDaGlsZChzdGF0dXMpO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1lbmQgZ2FwLTJcIjtcbiAgY29uc3Qgc3VibWl0ID0gY29tcGFjdEJ1dHRvbihcIk9wZW4gUmV2aWV3IElzc3VlXCIsICgpID0+IHtcbiAgICB2b2lkIHN1Ym1pdFB1Ymxpc2hUd2VhayhyZXBvSW5wdXQsIHN0YXR1cyk7XG4gIH0pO1xuICBhY3Rpb25zLmFwcGVuZENoaWxkKHN1Ym1pdCk7XG4gIGRpYWxvZy5hcHBlbmRDaGlsZChhY3Rpb25zKTtcblxuICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgb3ZlcmxheS5yZW1vdmUoKTtcbiAgfSk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG4gIHJlcG9JbnB1dC5mb2N1cygpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzdWJtaXRQdWJsaXNoVHdlYWsoXG4gIHJlcG9JbnB1dDogSFRNTElucHV0RWxlbWVudCxcbiAgc3RhdHVzOiBIVE1MRWxlbWVudCxcbik6IFByb21pc2U8dm9pZD4ge1xuICBzdGF0dXMuY2xhc3NOYW1lID0gXCJtaW4taC01IHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBzdGF0dXMudGV4dENvbnRlbnQgPSBcIlJlc29sdmluZyB0aGUgcmVwbyBjb21taXQgdG8gcmV2aWV3LlwiO1xuICB0cnkge1xuICAgIGNvbnN0IHN1Ym1pc3Npb24gPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXG4gICAgICBcImNvZGV4cHA6cHJlcGFyZS10d2Vhay1zdG9yZS1zdWJtaXNzaW9uXCIsXG4gICAgICByZXBvSW5wdXQudmFsdWUsXG4gICAgKSBhcyBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb247XG4gICAgY29uc3QgdXJsID0gYnVpbGRUd2Vha1B1Ymxpc2hJc3N1ZVVybChzdWJtaXNzaW9uKTtcbiAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgdXJsKTtcbiAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBgR2l0SHViIHJldmlldyBpc3N1ZSBvcGVuZWQgZm9yICR7c3VibWlzc2lvbi5jb21taXRTaGEuc2xpY2UoMCwgNyl9LmA7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBzdGF0dXMuY2xhc3NOYW1lID0gXCJtaW4taC01IHRleHQtc20gdGV4dC10b2tlbi1jaGFydHMtcmVkXCI7XG4gICAgc3RhdHVzLnRleHRDb250ZW50ID0gU3RyaW5nKChlIGFzIEVycm9yKS5tZXNzYWdlID8/IGUpO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBjb21wb25lbnRzIFx1MjUwMFx1MjUwMFxuXG4vKiogVGhlIGZ1bGwgcGFuZWwgc2hlbGwgKHRvb2xiYXIgKyBzY3JvbGwgKyBoZWFkaW5nICsgc2VjdGlvbnMgd3JhcCkuICovXG5mdW5jdGlvbiBwYW5lbFNoZWxsKFxuICB0aXRsZTogc3RyaW5nLFxuICBzdWJ0aXRsZT86IHN0cmluZyxcbiAgb3B0aW9ucz86IHsgd2lkZT86IGJvb2xlYW4gfSxcbik6IHtcbiAgb3V0ZXI6IEhUTUxFbGVtZW50O1xuICBzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50O1xuICBzdWJ0aXRsZT86IEhUTUxFbGVtZW50O1xuICBoZWFkZXJBY3Rpb25zOiBIVE1MRWxlbWVudDtcbiAgaGVhZGVyVGl0bGVBY3Rpb25zOiBIVE1MRWxlbWVudDtcbn0ge1xuICBjb25zdCBvdXRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG91dGVyLmNsYXNzTmFtZSA9IFwibWFpbi1zdXJmYWNlIGZsZXggaC1mdWxsIG1pbi1oLTAgZmxleC1jb2xcIjtcblxuICBjb25zdCB0b29sYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdG9vbGJhci5jbGFzc05hbWUgPVxuICAgIFwiZHJhZ2dhYmxlIGZsZXggaXRlbXMtY2VudGVyIHB4LXBhbmVsIGVsZWN0cm9uOmgtdG9vbGJhciBleHRlbnNpb246aC10b29sYmFyLXNtXCI7XG4gIG91dGVyLmFwcGVuZENoaWxkKHRvb2xiYXIpO1xuXG4gIGNvbnN0IHNjcm9sbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNjcm9sbC5jbGFzc05hbWUgPSBcImZsZXgtMSBvdmVyZmxvdy15LWF1dG8gcC1wYW5lbFwiO1xuICBvdXRlci5hcHBlbmRDaGlsZChzY3JvbGwpO1xuXG4gIGNvbnN0IGlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaW5uZXIuY2xhc3NOYW1lID1cbiAgICBvcHRpb25zPy53aWRlXG4gICAgICA/IFwibXgtYXV0byBmbGV4IHctZnVsbCBtYXgtdy01eGwgZmxleC1jb2wgZWxlY3Ryb246bWluLXctW2NhbGMoMzIwcHgqdmFyKC0tY29kZXgtd2luZG93LXpvb20pKV1cIlxuICAgICAgOiBcIm14LWF1dG8gZmxleCB3LWZ1bGwgZmxleC1jb2wgbWF4LXctMnhsIGVsZWN0cm9uOm1pbi13LVtjYWxjKDMyMHB4KnZhcigtLWNvZGV4LXdpbmRvdy16b29tKSldXCI7XG4gIHNjcm9sbC5hcHBlbmRDaGlsZChpbm5lcik7XG5cbiAgY29uc3QgaGVhZGVyV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlcldyYXAuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTMgcGItcGFuZWxcIjtcbiAgY29uc3QgaGVhZGVySW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkZXJJbm5lci5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTEuNSBwYi1wYW5lbFwiO1xuICBjb25zdCB0aXRsZUxpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZUxpbmUuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIGNvbnN0IGhlYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkaW5nLmNsYXNzTmFtZSA9IFwiZWxlY3Ryb246aGVhZGluZy1sZyBoZWFkaW5nLWJhc2UgdHJ1bmNhdGVcIjtcbiAgaGVhZGluZy50ZXh0Q29udGVudCA9IHRpdGxlO1xuICB0aXRsZUxpbmUuYXBwZW5kQ2hpbGQoaGVhZGluZyk7XG4gIGNvbnN0IGhlYWRlclRpdGxlQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlclRpdGxlQWN0aW9ucy5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIHRpdGxlTGluZS5hcHBlbmRDaGlsZChoZWFkZXJUaXRsZUFjdGlvbnMpO1xuICBoZWFkZXJJbm5lci5hcHBlbmRDaGlsZCh0aXRsZUxpbmUpO1xuICBsZXQgc3VidGl0bGVFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbiAgaWYgKHN1YnRpdGxlKSB7XG4gICAgY29uc3Qgc3ViID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBzdWIuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQtc21cIjtcbiAgICBzdWIudGV4dENvbnRlbnQgPSBzdWJ0aXRsZTtcbiAgICBoZWFkZXJJbm5lci5hcHBlbmRDaGlsZChzdWIpO1xuICAgIHN1YnRpdGxlRWxlbWVudCA9IHN1YjtcbiAgfVxuICBoZWFkZXJXcmFwLmFwcGVuZENoaWxkKGhlYWRlcklubmVyKTtcbiAgY29uc3QgaGVhZGVyQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlckFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBoZWFkZXJXcmFwLmFwcGVuZENoaWxkKGhlYWRlckFjdGlvbnMpO1xuICBpbm5lci5hcHBlbmRDaGlsZChoZWFkZXJXcmFwKTtcblxuICBjb25zdCBzZWN0aW9uc1dyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzZWN0aW9uc1dyYXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1bdmFyKC0tcGFkZGluZy1wYW5lbCldXCI7XG4gIGlubmVyLmFwcGVuZENoaWxkKHNlY3Rpb25zV3JhcCk7XG5cbiAgcmV0dXJuIHsgb3V0ZXIsIHNlY3Rpb25zV3JhcCwgc3VidGl0bGU6IHN1YnRpdGxlRWxlbWVudCwgaGVhZGVyQWN0aW9ucywgaGVhZGVyVGl0bGVBY3Rpb25zIH07XG59XG5cbmZ1bmN0aW9uIHNlY3Rpb25UaXRsZSh0ZXh0OiBzdHJpbmcsIHRyYWlsaW5nPzogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID1cbiAgICBcImZsZXggaC10b29sYmFyIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTIgcHgtMCBweS0wXCI7XG4gIGNvbnN0IHRpdGxlSW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZUlubmVyLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBmbGV4LWNvbCBnYXAtMVwiO1xuICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdC5jbGFzc05hbWUgPSBcInRleHQtYmFzZSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgdGl0bGVJbm5lci5hcHBlbmRDaGlsZCh0KTtcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodGl0bGVJbm5lcik7XG4gIGlmICh0cmFpbGluZykge1xuICAgIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gICAgcmlnaHQuYXBwZW5kQ2hpbGQodHJhaWxpbmcpO1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHJpZ2h0KTtcbiAgfVxuICByZXR1cm4gdGl0bGVSb3c7XG59XG5cbi8qKlxuICogQ29kZXgncyBcIk9wZW4gY29uZmlnLnRvbWxcIi1zdHlsZSB0cmFpbGluZyBidXR0b246IGdob3N0IGJvcmRlciwgbXV0ZWRcbiAqIGxhYmVsLCB0b3AtcmlnaHQgZGlhZ29uYWwgYXJyb3cgaWNvbi4gTWFya3VwIG1pcnJvcnMgQ29uZmlndXJhdGlvbiBwYW5lbC5cbiAqL1xuZnVuY3Rpb24gb3BlbkluUGxhY2VCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMSBib3JkZXIgd2hpdGVzcGFjZS1ub3dyYXAgZm9jdXM6b3V0bGluZS1ub25lIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwIHJvdW5kZWQtbGcgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRhdGEtW3N0YXRlPW9wZW5dOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBib3JkZXItdHJhbnNwYXJlbnQgaC10b2tlbi1idXR0b24tY29tcG9zZXIgcHgtMiBweS0wIHRleHQtYmFzZSBsZWFkaW5nLVsxOHB4XVwiO1xuICBidG4uaW5uZXJIVE1MID1cbiAgICBgJHtsYWJlbH1gICtcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLTJ4c1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTE0LjMzNDkgMTMuMzMwMVY2LjYwNjQ1TDUuNDcwNjUgMTUuNDcwN0M1LjIxMDk1IDE1LjczMDQgNC43ODg5NSAxNS43MzA0IDQuNTI5MjUgMTUuNDcwN0M0LjI2OTU1IDE1LjIxMSA0LjI2OTU1IDE0Ljc4OSA0LjUyOTI1IDE0LjUyOTNMMTMuMzkzNSA1LjY2NTA0SDYuNjYwMTFDNi4yOTI4NCA1LjY2NTA0IDUuOTk1MDcgNS4zNjcyNyA1Ljk5NTA3IDVDNS45OTUwNyA0LjYzMjczIDYuMjkyODQgNC4zMzQ5NiA2LjY2MDExIDQuMzM0OTZIMTQuOTk5OUwxNS4xMzM3IDQuMzQ4NjNDMTUuNDM2OSA0LjQxMDU3IDE1LjY2NSA0LjY3ODU3IDE1LjY2NSA1VjEzLjMzMDFDMTUuNjY0OSAxMy42OTczIDE1LjM2NzIgMTMuOTk1MSAxNC45OTk5IDEzLjk5NTFDMTQuNjMyNyAxMy45OTUxIDE0LjMzNSAxMy42OTczIDE0LjMzNDkgMTMuMzMwMVpcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+PC9wYXRoPmAgK1xuICAgIGA8L3N2Zz5gO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEJ1dHRvbihsYWJlbDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGlubGluZS1mbGV4IGgtOCBpdGVtcy1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgcHgtMiB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gcm91bmRlZENhcmQoKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY2FyZC5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciBmbGV4IGZsZXgtY29sIGRpdmlkZS15LVswLjVweF0gZGl2aWRlLXRva2VuLWJvcmRlciByb3VuZGVkLWxnIGJvcmRlclwiO1xuICBjYXJkLnNldEF0dHJpYnV0ZShcbiAgICBcInN0eWxlXCIsXG4gICAgXCJiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS1jb2xvci1iYWNrZ3JvdW5kLXBhbmVsLCB2YXIoLS1jb2xvci10b2tlbi1iZy1mb2cpKTtcIixcbiAgKTtcbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIHJvd1NpbXBsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgZ2FwLTNcIjtcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xuICBpZiAodGl0bGUpIHtcbiAgICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0LmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gICAgdC50ZXh0Q29udGVudCA9IHRpdGxlO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKHQpO1xuICB9XG4gIGlmIChkZXNjcmlwdGlvbikge1xuICAgIGNvbnN0IGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGQuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICAgIGQudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcbiAgICBzdGFjay5hcHBlbmRDaGlsZChkKTtcbiAgfVxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICByZXR1cm4gcm93O1xufVxuXG4vKipcbiAqIENvZGV4LXN0eWxlZCB0b2dnbGUgc3dpdGNoLiBNYXJrdXAgbWlycm9ycyB0aGUgR2VuZXJhbCA+IFBlcm1pc3Npb25zIHJvd1xuICogc3dpdGNoIHdlIGNhcHR1cmVkOiBvdXRlciBidXR0b24gKHJvbGU9c3dpdGNoKSwgaW5uZXIgcGlsbCwgc2xpZGluZyBrbm9iLlxuICovXG5mdW5jdGlvbiBzd2l0Y2hDb250cm9sKFxuICBpbml0aWFsOiBib29sZWFuLFxuICBvbkNoYW5nZTogKG5leHQ6IGJvb2xlYW4pID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LFxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwic3dpdGNoXCIpO1xuXG4gIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY29uc3Qga25vYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBrbm9iLmNsYXNzTmFtZSA9XG4gICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci1bY29sb3I6dmFyKC0tZ3JheS0wKV0gYmctW2NvbG9yOnZhcigtLWdyYXktMCldIHNoYWRvdy1zbSB0cmFuc2l0aW9uLXRyYW5zZm9ybSBkdXJhdGlvbi0yMDAgZWFzZS1vdXQgaC00IHctNFwiO1xuICBwaWxsLmFwcGVuZENoaWxkKGtub2IpO1xuXG4gIGNvbnN0IGFwcGx5ID0gKG9uOiBib29sZWFuKTogdm9pZCA9PiB7XG4gICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtY2hlY2tlZFwiLCBTdHJpbmcob24pKTtcbiAgICBidG4uZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xuICAgIGJ0bi5jbGFzc05hbWUgPVxuICAgICAgXCJpbmxpbmUtZmxleCBpdGVtcy1jZW50ZXIgdGV4dC1zbSBmb2N1cy12aXNpYmxlOm91dGxpbmUtbm9uZSBmb2N1cy12aXNpYmxlOnJpbmctMiBmb2N1cy12aXNpYmxlOnJpbmctdG9rZW4tZm9jdXMtYm9yZGVyIGZvY3VzLXZpc2libGU6cm91bmRlZC1mdWxsIGN1cnNvci1pbnRlcmFjdGlvblwiO1xuICAgIHBpbGwuY2xhc3NOYW1lID0gYHJlbGF0aXZlIGlubGluZS1mbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi1jb2xvcnMgZHVyYXRpb24tMjAwIGVhc2Utb3V0IGgtNSB3LTggJHtcbiAgICAgIG9uID8gXCJiZy10b2tlbi1jaGFydHMtYmx1ZVwiIDogXCJiZy10b2tlbi1mb3JlZ3JvdW5kLzIwXCJcbiAgICB9YDtcbiAgICBwaWxsLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcbiAgICBrbm9iLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcbiAgICBrbm9iLnN0eWxlLnRyYW5zZm9ybSA9IG9uID8gXCJ0cmFuc2xhdGVYKDE0cHgpXCIgOiBcInRyYW5zbGF0ZVgoMnB4KVwiO1xuICB9O1xuICBhcHBseShpbml0aWFsKTtcblxuICBidG4uYXBwZW5kQ2hpbGQocGlsbCk7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBjb25zdCBuZXh0ID0gYnRuLmdldEF0dHJpYnV0ZShcImFyaWEtY2hlY2tlZFwiKSAhPT0gXCJ0cnVlXCI7XG4gICAgYXBwbHkobmV4dCk7XG4gICAgYnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgb25DaGFuZ2UobmV4dCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIGRvdCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgcy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xuICBzLnRleHRDb250ZW50ID0gXCJcdTAwQjdcIjtcbiAgcmV0dXJuIHM7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBpY29ucyBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gY29uZmlnSWNvblN2ZygpOiBzdHJpbmcge1xuICAvLyBTbGlkZXJzIC8gc2V0dGluZ3MgZ2x5cGguIDIweDIwIGN1cnJlbnRDb2xvci5cbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk0zIDVoOU0xNSA1aDJNMyAxMGgyTTggMTBoOU0zIDE1aDExTTE3IDE1aDBcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIvPmAgK1xuICAgIGA8Y2lyY2xlIGN4PVwiMTNcIiBjeT1cIjVcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcbiAgICBgPGNpcmNsZSBjeD1cIjZcIiBjeT1cIjEwXCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXG4gICAgYDxjaXJjbGUgY3g9XCIxNVwiIGN5PVwiMTVcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5mdW5jdGlvbiB0d2Vha3NJY29uU3ZnKCk6IHN0cmluZyB7XG4gIC8vIFNwYXJrbGVzIC8gXCIrK1wiIGdseXBoIGZvciB0d2Vha3MuXG4gIHJldHVybiAoXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTAgMi41IEwxMS40IDguNiBMMTcuNSAxMCBMMTEuNCAxMS40IEwxMCAxNy41IEw4LjYgMTEuNCBMMi41IDEwIEw4LjYgOC42IFpcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTE1LjUgMyBMMTYgNSBMMTggNS41IEwxNiA2IEwxNS41IDggTDE1IDYgTDEzIDUuNSBMMTUgNSBaXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiIG9wYWNpdHk9XCIwLjdcIi8+YCArXG4gICAgYDwvc3ZnPmBcbiAgKTtcbn1cblxuZnVuY3Rpb24gc3RvcmVJY29uU3ZnKCk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNNCA4LjIgNS4xIDQuNUExLjUgMS41IDAgMCAxIDYuNTUgMy40aDYuOWExLjUgMS41IDAgMCAxIDEuNDUgMS4xTDE2IDguMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTQuNSA4aDExdjcuNUExLjUgMS41IDAgMCAxIDE0IDE3SDZhMS41IDEuNSAwIDAgMS0xLjUtMS41VjhaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNNy41IDh2MWEyLjUgMi41IDAgMCAwIDUgMFY4XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0UGFnZUljb25TdmcoKTogc3RyaW5nIHtcbiAgLy8gRG9jdW1lbnQvcGFnZSBnbHlwaCBmb3IgdHdlYWstcmVnaXN0ZXJlZCBwYWdlcyB3aXRob3V0IHRoZWlyIG93biBpY29uLlxuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTUgM2g3bDMgM3YxMWExIDEgMCAwIDEtMSAxSDVhMSAxIDAgMCAxLTEtMVY0YTEgMSAwIDAgMSAxLTFaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTIgM3YzYTEgMSAwIDAgMCAxIDFoMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTcgMTFoNk03IDE0aDRcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVJY29uVXJsKFxuICB1cmw6IHN0cmluZyxcbiAgdHdlYWtEaXI6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICBpZiAoL14oaHR0cHM/OnxkYXRhOikvLnRlc3QodXJsKSkgcmV0dXJuIHVybDtcbiAgLy8gUmVsYXRpdmUgcGF0aCBcdTIxOTIgYXNrIG1haW4gdG8gcmVhZCB0aGUgZmlsZSBhbmQgcmV0dXJuIGEgZGF0YTogVVJMLlxuICAvLyBSZW5kZXJlciBpcyBzYW5kYm94ZWQgc28gZmlsZTovLyB3b24ndCBsb2FkIGRpcmVjdGx5LlxuICBjb25zdCByZWwgPSB1cmwuc3RhcnRzV2l0aChcIi4vXCIpID8gdXJsLnNsaWNlKDIpIDogdXJsO1xuICB0cnkge1xuICAgIHJldHVybiAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgXCJjb2RleHBwOnJlYWQtdHdlYWstYXNzZXRcIixcbiAgICAgIHR3ZWFrRGlyLFxuICAgICAgcmVsLFxuICAgICkpIGFzIHN0cmluZztcbiAgfSBjYXRjaCAoZSkge1xuICAgIHBsb2coXCJpY29uIGxvYWQgZmFpbGVkXCIsIHsgdXJsLCB0d2Vha0RpciwgZXJyOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIERPTSBoZXVyaXN0aWNzIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJhc2lkZSxuYXYsW3JvbGU9J25hdmlnYXRpb24nXSxkaXZcIiksXG4gICk7XG5cbiAgbGV0IGJlc3Q6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGxldCBiZXN0U2NvcmUgPSAtMTtcbiAgbGV0IGJlc3RBcmVhID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoY2FuZGlkYXRlLmRhdGFzZXQuY29kZXhwcCkgY29udGludWU7XG4gICAgaWYgKCFpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShjYW5kaWRhdGUpKSBjb250aW51ZTtcblxuICAgIGNvbnN0IGxhYmVscyA9IGNvZGV4UHBTZXR0aW5nc0xhYmVsc0Zyb20oY2FuZGlkYXRlKTtcbiAgICBjb25zdCBzY29yZSA9IGNvZGV4UHBTZXR0aW5nc0xhYmVsU2NvcmUobGFiZWxzKTtcbiAgICBjb25zdCByZWN0ID0gY2FuZGlkYXRlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGFyZWEgPSByZWN0LndpZHRoICogcmVjdC5oZWlnaHQ7XG4gICAgY29uc3Qgd2VpZ2h0ZWQgPSBzY29yZS5jb3JlICogMTAwICsgc2NvcmUudG90YWw7XG5cbiAgICBpZiAod2VpZ2h0ZWQgPiBiZXN0U2NvcmUgfHwgKHdlaWdodGVkID09PSBiZXN0U2NvcmUgJiYgYXJlYSA8IGJlc3RBcmVhKSkge1xuICAgICAgYmVzdCA9IGNhbmRpZGF0ZTtcbiAgICAgIGJlc3RTY29yZSA9IHdlaWdodGVkO1xuICAgICAgYmVzdEFyZWEgPSBhcmVhO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBiZXN0O1xufVxuXG5jb25zdCBGT1JCSURERU5fU0VUVElOR1NfU0lERUJBUl9TRUxFQ1RPUiA9IFtcbiAgXCJbZGF0YS1jb21wb3Nlci1vdmVybGF5LWZsb2F0aW5nLXVpPSd0cnVlJ11cIixcbiAgXCJbZGF0YS1jb2RleHBwLXNsYXNoLW1lbnU9J3RydWUnXVwiLFxuICBcIltkYXRhLWNvZGV4cHAtb3ZlcmxheS1ub2lzZT0ndHJ1ZSddXCIsXG4gIFwiLmNvbXBvc2VyLWhvbWUtdG9wLW1lbnVcIixcbiAgXCIudmVydGljYWwtc2Nyb2xsLWZhZGUtbWFza1wiLFxuICBcIltjbGFzcyo9J1tjb250YWluZXItbmFtZTpob21lLW1haW4tY29udGVudF0nXVwiLFxuXS5qb2luKFwiLFwiKTtcblxuZnVuY3Rpb24gaXNGb3JiaWRkZW5TZXR0aW5nc1NpZGViYXJTdXJmYWNlKG5vZGU6IEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG4gIGlmICghbm9kZSkgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBlbCA9IG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCA/IG5vZGUgOiBub2RlLnBhcmVudEVsZW1lbnQ7XG4gIGlmICghZWwpIHJldHVybiBmYWxzZTtcbiAgaWYgKGVsLmNsb3Nlc3QoRk9SQklEREVOX1NFVFRJTkdTX1NJREVCQVJfU0VMRUNUT1IpKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGVsLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1saXN0LW5hdmlnYXRpb24taXRlbT0ndHJ1ZSddLCBbY21kay1pdGVtXVwiKSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUoZWw6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IHJlY3QgPSBjb2RleFBwVmlzaWJsZUJveChlbCk7XG4gIGlmICghcmVjdCkgcmV0dXJuIGZhbHNlO1xuXG4gIC8vIEN1cnJlbnQgQ29kZXggU2V0dGluZ3Mgc2lkZWJhcjogbGVmdCBjb2x1bW4sIG5vdCB0aGUgbWFpbiBjb250ZW50IHBhbmVsLlxuICBpZiAocmVjdC53aWR0aCA8IDEyMCB8fCByZWN0LndpZHRoID4gNjIwKSByZXR1cm4gZmFsc2U7XG4gIGlmIChyZWN0LmhlaWdodCA8IDgwKSByZXR1cm4gZmFsc2U7XG4gIGlmIChyZWN0LmxlZnQgPiB3aW5kb3cuaW5uZXJXaWR0aCAqIDAuNjUpIHJldHVybiBmYWxzZTtcblxuICBjb25zdCBsYWJlbHMgPSBjb2RleFBwU2V0dGluZ3NMYWJlbHNGcm9tKGVsKTtcbiAgaWYgKGhhc01haW5BcHBTaWRlYmFyU2lnbmFscyhsYWJlbHMpICYmICFoYXNDb2RleFBwU2V0dGluZ3NPbmx5U2lnbmFsKGxhYmVscykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gaXNDb2RleFBwU2V0dGluZ3NMYWJlbFNldChsYWJlbHMpO1xufVxuXG5mdW5jdGlvbiByZW1vdmVNaXNwbGFjZWRTZXR0aW5nc0dyb3VwcygpOiB2b2lkIHtcbiAgY29uc3QgZ3JvdXBzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgXCJbZGF0YS1jb2RleHBwPSduYXYtZ3JvdXAnXSwgW2RhdGEtY29kZXhwcD0ncGFnZXMtZ3JvdXAnXSwgW2RhdGEtY29kZXhwcD0nbmF0aXZlLW5hdi1oZWFkZXInXVwiLFxuICApO1xuICBjb25zdCBncm91cHNUb1JlbW92ZSA9IHNlbGVjdEluamVjdGVkU2V0dGluZ3NHcm91cHNUb1JlbW92ZShcbiAgICBBcnJheS5mcm9tKGdyb3VwcykubWFwKChncm91cCk6IEluamVjdGVkU2V0dGluZ3NHcm91cENhbmRpZGF0ZTxIVE1MRWxlbWVudD4gPT4ge1xuICAgICAgY29uc3Qgc2lkZWJhciA9IGNvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXBTaWRlYmFyKGdyb3VwKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdyb3VwLFxuICAgICAgICBraW5kOiBjb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwS2luZChncm91cCksXG4gICAgICAgIHBhcmVudDogc2lkZWJhcixcbiAgICAgICAgdmFsaWRQbGFjZW1lbnQ6IHNpZGViYXIgIT09IG51bGwsXG4gICAgICAgIGN1cnJlbnQ6IGlzQ3VycmVudENvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXAoZ3JvdXApLFxuICAgICAgfTtcbiAgICB9KSxcbiAgKTtcblxuICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwc1RvUmVtb3ZlKSB7XG4gICAgcmVzZXRDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwU3RhdGUoZ3JvdXApO1xuICAgIGdyb3VwLnJlbW92ZSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXBLaW5kKGdyb3VwOiBIVE1MRWxlbWVudCk6IEluamVjdGVkU2V0dGluZ3NHcm91cEtpbmQge1xuICBpZiAoZ3JvdXAuZGF0YXNldC5jb2RleHBwID09PSBcInBhZ2VzLWdyb3VwXCIpIHJldHVybiBcInBhZ2VzLWdyb3VwXCI7XG4gIGlmIChncm91cC5kYXRhc2V0LmNvZGV4cHAgPT09IFwibmF0aXZlLW5hdi1oZWFkZXJcIikgcmV0dXJuIFwibmF0aXZlLW5hdi1oZWFkZXJcIjtcbiAgcmV0dXJuIFwibmF2LWdyb3VwXCI7XG59XG5cbmZ1bmN0aW9uIGlzQ3VycmVudENvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXAoZ3JvdXA6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gIHJldHVybiBncm91cCA9PT0gc3RhdGUubmF2R3JvdXAgfHwgZ3JvdXAgPT09IHN0YXRlLnBhZ2VzR3JvdXAgfHwgZ3JvdXAgPT09IHN0YXRlLm5hdGl2ZU5hdkhlYWRlcjtcbn1cblxuZnVuY3Rpb24gaXNDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwUGxhY2VtZW50VmFsaWQoZ3JvdXA6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG4gIHJldHVybiBjb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwU2lkZWJhcihncm91cCkgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGNvZGV4UHBJbmplY3RlZFNldHRpbmdzR3JvdXBTaWRlYmFyKGdyb3VwOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmIChpc0ZvcmJpZGRlblNldHRpbmdzU2lkZWJhclN1cmZhY2UoZ3JvdXApKSByZXR1cm4gbnVsbDtcblxuICBsZXQgbm9kZSA9IGdyb3VwLnBhcmVudEVsZW1lbnQ7XG4gIGZvciAobGV0IGRlcHRoID0gMDsgbm9kZSAmJiBkZXB0aCA8IDQ7IGRlcHRoKyspIHtcbiAgICBpZiAoaXNGb3JiaWRkZW5TZXR0aW5nc1NpZGViYXJTdXJmYWNlKG5vZGUpKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUobm9kZSkpIHJldHVybiBub2RlO1xuICAgIG5vZGUgPSBub2RlLnBhcmVudEVsZW1lbnQ7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzZXRDb2RleFBwSW5qZWN0ZWRTZXR0aW5nc0dyb3VwU3RhdGUoZ3JvdXA6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGlmIChzdGF0ZS5uYXZHcm91cCA9PT0gZ3JvdXAgfHwgKHN0YXRlLm5hdkdyb3VwICYmIGdyb3VwLmNvbnRhaW5zKHN0YXRlLm5hdkdyb3VwKSkpIHtcbiAgICBzdGF0ZS5uYXZHcm91cCA9IG51bGw7XG4gICAgc3RhdGUubmF2QnV0dG9ucyA9IG51bGw7XG4gICAgc3RhdGUuY29kZXhQbHVzUGx1c1VwZGF0ZUJ1dHRvbiA9IG51bGw7XG4gIH1cbiAgaWYgKHN0YXRlLnBhZ2VzR3JvdXAgPT09IGdyb3VwIHx8IChzdGF0ZS5wYWdlc0dyb3VwICYmIGdyb3VwLmNvbnRhaW5zKHN0YXRlLnBhZ2VzR3JvdXApKSkge1xuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xuICAgIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBudWxsO1xuICAgIGZvciAoY29uc3QgcCBvZiBzdGF0ZS5wYWdlcy52YWx1ZXMoKSkgcC5uYXZCdXR0b24gPSBudWxsO1xuICB9XG4gIGlmIChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPT09IGdyb3VwIHx8IChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgJiYgZ3JvdXAuY29udGFpbnMoc3RhdGUubmF0aXZlTmF2SGVhZGVyKSkpIHtcbiAgICBzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPSBudWxsO1xuICB9XG4gIGlmIChzdGF0ZS5zaWRlYmFyUm9vdCAmJiBzdGF0ZS5zaWRlYmFyUm9vdC5jb250YWlucyhncm91cCkpIHtcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gZmluZENvbnRlbnRBcmVhKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgaWYgKCFzaWRlYmFyKSByZXR1cm4gbnVsbDtcbiAgbGV0IHBhcmVudCA9IHNpZGViYXIucGFyZW50RWxlbWVudDtcbiAgd2hpbGUgKHBhcmVudCkge1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShwYXJlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcbiAgICAgIGlmIChjaGlsZCA9PT0gc2lkZWJhciB8fCBjaGlsZC5jb250YWlucyhzaWRlYmFyKSkgY29udGludWU7XG4gICAgICBjb25zdCByID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAoci53aWR0aCA+IDMwMCAmJiByLmhlaWdodCA+IDIwMCkgcmV0dXJuIGNoaWxkO1xuICAgIH1cbiAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50RWxlbWVudDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbWF5YmVEdW1wRG9tKCk6IHZvaWQge1xuICB0cnkge1xuICAgIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgICBpZiAoc2lkZWJhciAmJiAhc3RhdGUuc2lkZWJhckR1bXBlZCkge1xuICAgICAgc3RhdGUuc2lkZWJhckR1bXBlZCA9IHRydWU7XG4gICAgICBjb25zdCBzYlJvb3QgPSBzaWRlYmFyLnBhcmVudEVsZW1lbnQgPz8gc2lkZWJhcjtcbiAgICAgIHBsb2coYGNvZGV4IHNpZGViYXIgSFRNTGAsIHNiUm9vdC5vdXRlckhUTUwuc2xpY2UoMCwgMzIwMDApKTtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xuICAgIGlmICghY29udGVudCkge1xuICAgICAgaWYgKHN0YXRlLmZpbmdlcnByaW50ICE9PSBsb2NhdGlvbi5ocmVmKSB7XG4gICAgICAgIHN0YXRlLmZpbmdlcnByaW50ID0gbG9jYXRpb24uaHJlZjtcbiAgICAgICAgcGxvZyhcImRvbSBwcm9iZSAobm8gY29udGVudClcIiwge1xuICAgICAgICAgIHVybDogbG9jYXRpb24uaHJlZixcbiAgICAgICAgICBzaWRlYmFyOiBzaWRlYmFyID8gZGVzY3JpYmUoc2lkZWJhcikgOiBudWxsLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHBhbmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XG4gICAgICBpZiAoY2hpbGQuZGF0YXNldC5jb2RleHBwID09PSBcInR3ZWFrcy1wYW5lbFwiKSBjb250aW51ZTtcbiAgICAgIGlmIChjaGlsZC5zdHlsZS5kaXNwbGF5ID09PSBcIm5vbmVcIikgY29udGludWU7XG4gICAgICBwYW5lbCA9IGNoaWxkO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZU5hdiA9IHNpZGViYXJcbiAgICAgID8gQXJyYXkuZnJvbShzaWRlYmFyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiYnV0dG9uLCBhXCIpKS5maW5kKFxuICAgICAgICAgIChiKSA9PlxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiIHx8XG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImRhdGEtYWN0aXZlXCIpID09PSBcInRydWVcIiB8fFxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLXNlbGVjdGVkXCIpID09PSBcInRydWVcIiB8fFxuICAgICAgICAgICAgYi5jbGFzc0xpc3QuY29udGFpbnMoXCJhY3RpdmVcIiksXG4gICAgICAgIClcbiAgICAgIDogbnVsbDtcbiAgICBjb25zdCBoZWFkaW5nID0gcGFuZWw/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgXCJoMSwgaDIsIGgzLCBbY2xhc3MqPSdoZWFkaW5nJ11cIixcbiAgICApO1xuICAgIGNvbnN0IGZpbmdlcnByaW50ID0gYCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudCA/PyBcIlwifXwke2hlYWRpbmc/LnRleHRDb250ZW50ID8/IFwiXCJ9fCR7cGFuZWw/LmNoaWxkcmVuLmxlbmd0aCA/PyAwfWA7XG4gICAgaWYgKHN0YXRlLmZpbmdlcnByaW50ID09PSBmaW5nZXJwcmludCkgcmV0dXJuO1xuICAgIHN0YXRlLmZpbmdlcnByaW50ID0gZmluZ2VycHJpbnQ7XG4gICAgcGxvZyhcImRvbSBwcm9iZVwiLCB7XG4gICAgICB1cmw6IGxvY2F0aW9uLmhyZWYsXG4gICAgICBhY3RpdmVOYXY6IGFjdGl2ZU5hdj8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxuICAgICAgaGVhZGluZzogaGVhZGluZz8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxuICAgICAgY29udGVudDogZGVzY3JpYmUoY29udGVudCksXG4gICAgfSk7XG4gICAgaWYgKHBhbmVsKSB7XG4gICAgICBjb25zdCBodG1sID0gcGFuZWwub3V0ZXJIVE1MO1xuICAgICAgcGxvZyhcbiAgICAgICAgYGNvZGV4IHBhbmVsIEhUTUwgKCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IFwiP1wifSlgLFxuICAgICAgICBodG1sLnNsaWNlKDAsIDMyMDAwKSxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgcGxvZyhcImRvbSBwcm9iZSBmYWlsZWRcIiwgU3RyaW5nKGUpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkZXNjcmliZShlbDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIHJldHVybiB7XG4gICAgdGFnOiBlbC50YWdOYW1lLFxuICAgIGNsczogZWwuY2xhc3NOYW1lLnNsaWNlKDAsIDEyMCksXG4gICAgaWQ6IGVsLmlkIHx8IHVuZGVmaW5lZCxcbiAgICBjaGlsZHJlbjogZWwuY2hpbGRyZW4ubGVuZ3RoLFxuICAgIHJlY3Q6ICgoKSA9PiB7XG4gICAgICBjb25zdCByID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICByZXR1cm4geyB3OiBNYXRoLnJvdW5kKHIud2lkdGgpLCBoOiBNYXRoLnJvdW5kKHIuaGVpZ2h0KSB9O1xuICAgIH0pKCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHR3ZWFrc1BhdGgoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICAod2luZG93IGFzIHVua25vd24gYXMgeyBfX2NvZGV4cHBfdHdlYWtzX2Rpcl9fPzogc3RyaW5nIH0pLl9fY29kZXhwcF90d2Vha3NfZGlyX18gPz9cbiAgICBcIjx1c2VyIGRpcj4vdHdlYWtzXCJcbiAgKTtcbn1cbiIsICJpbXBvcnQgdHlwZSB7IFR3ZWFrTWFuaWZlc3QgfSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9UV0VBS19TVE9SRV9JTkRFWF9VUkwgPVxuICBcImh0dHBzOi8vYi1ubmV0dC5naXRodWIuaW8vY29kZXgtcGx1c3BsdXMvc3RvcmUvaW5kZXguanNvblwiO1xuZXhwb3J0IGNvbnN0IFRXRUFLX1NUT1JFX1JFVklFV19JU1NVRV9VUkwgPVxuICBcImh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXdcIjtcblxuZXhwb3J0IGludGVyZmFjZSBUd2Vha1N0b3JlUmVnaXN0cnkge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcbiAgZW50cmllczogVHdlYWtTdG9yZUVudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZUVudHJ5IHtcbiAgaWQ6IHN0cmluZztcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gIHJlcG86IHN0cmluZztcbiAgYXBwcm92ZWRDb21taXRTaGE6IHN0cmluZztcbiAgYXBwcm92ZWRBdDogc3RyaW5nO1xuICBhcHByb3ZlZEJ5OiBzdHJpbmc7XG4gIHBsYXRmb3Jtcz86IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdO1xuICByZWxlYXNlVXJsPzogc3RyaW5nO1xuICByZXZpZXdVcmw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFR3ZWFrU3RvcmVQbGF0Zm9ybSA9IFwiZGFyd2luXCIgfCBcIndpbjMyXCIgfCBcImxpbnV4XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uIHtcbiAgcmVwbzogc3RyaW5nO1xuICBkZWZhdWx0QnJhbmNoOiBzdHJpbmc7XG4gIGNvbW1pdFNoYTogc3RyaW5nO1xuICBjb21taXRVcmw6IHN0cmluZztcbiAgbWFuaWZlc3Q/OiB7XG4gICAgaWQ/OiBzdHJpbmc7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICB2ZXJzaW9uPzogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICAgIGljb25Vcmw/OiBzdHJpbmc7XG4gIH07XG59XG5cbmNvbnN0IEdJVEhVQl9SRVBPX1JFID0gL15bQS1aYS16MC05Xy4tXStcXC9bQS1aYS16MC05Xy4tXSskLztcbmNvbnN0IEZVTExfU0hBX1JFID0gL15bYS1mMC05XXs0MH0kL2k7XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVHaXRIdWJSZXBvKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCByYXcgPSBpbnB1dC50cmltKCk7XG4gIGlmICghcmF3KSB0aHJvdyBuZXcgRXJyb3IoXCJHaXRIdWIgcmVwbyBpcyByZXF1aXJlZFwiKTtcblxuICBjb25zdCBzc2ggPSAvXmdpdEBnaXRodWJcXC5jb206KFteL10rXFwvW14vXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWMocmF3KTtcbiAgaWYgKHNzaCkgcmV0dXJuIG5vcm1hbGl6ZVJlcG9QYXJ0KHNzaFsxXSk7XG5cbiAgaWYgKC9eaHR0cHM/OlxcL1xcLy9pLnRlc3QocmF3KSkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmF3KTtcbiAgICBpZiAodXJsLmhvc3RuYW1lICE9PSBcImdpdGh1Yi5jb21cIikgdGhyb3cgbmV3IEVycm9yKFwiT25seSBnaXRodWIuY29tIHJlcG9zaXRvcmllcyBhcmUgc3VwcG9ydGVkXCIpO1xuICAgIGNvbnN0IHBhcnRzID0gdXJsLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rfFxcLyskL2csIFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICBpZiAocGFydHMubGVuZ3RoIDwgMikgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gVVJMIG11c3QgaW5jbHVkZSBvd25lciBhbmQgcmVwb3NpdG9yeVwiKTtcbiAgICByZXR1cm4gbm9ybWFsaXplUmVwb1BhcnQoYCR7cGFydHNbMF19LyR7cGFydHNbMV19YCk7XG4gIH1cblxuICByZXR1cm4gbm9ybWFsaXplUmVwb1BhcnQocmF3KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVN0b3JlUmVnaXN0cnkoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlUmVnaXN0cnkge1xuICBjb25zdCByZWdpc3RyeSA9IGlucHV0IGFzIFBhcnRpYWw8VHdlYWtTdG9yZVJlZ2lzdHJ5PiB8IG51bGw7XG4gIGlmICghcmVnaXN0cnkgfHwgcmVnaXN0cnkuc2NoZW1hVmVyc2lvbiAhPT0gMSB8fCAhQXJyYXkuaXNBcnJheShyZWdpc3RyeS5lbnRyaWVzKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlVuc3VwcG9ydGVkIHR3ZWFrIHN0b3JlIHJlZ2lzdHJ5XCIpO1xuICB9XG4gIGNvbnN0IGVudHJpZXMgPSByZWdpc3RyeS5lbnRyaWVzLm1hcChub3JtYWxpemVTdG9yZUVudHJ5KTtcbiAgZW50cmllcy5zb3J0KChhLCBiKSA9PiBhLm1hbmlmZXN0Lm5hbWUubG9jYWxlQ29tcGFyZShiLm1hbmlmZXN0Lm5hbWUpKTtcbiAgcmV0dXJuIHtcbiAgICBzY2hlbWFWZXJzaW9uOiAxLFxuICAgIGdlbmVyYXRlZEF0OiB0eXBlb2YgcmVnaXN0cnkuZ2VuZXJhdGVkQXQgPT09IFwic3RyaW5nXCIgPyByZWdpc3RyeS5nZW5lcmF0ZWRBdCA6IHVuZGVmaW5lZCxcbiAgICBlbnRyaWVzLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2h1ZmZsZVN0b3JlRW50cmllczxUPihcbiAgZW50cmllczogcmVhZG9ubHkgVFtdLFxuICByYW5kb21JbmRleDogKGV4Y2x1c2l2ZU1heDogbnVtYmVyKSA9PiBudW1iZXIgPSAoZXhjbHVzaXZlTWF4KSA9PiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBleGNsdXNpdmVNYXgpLFxuKTogVFtdIHtcbiAgY29uc3Qgc2h1ZmZsZWQgPSBbLi4uZW50cmllc107XG4gIGZvciAobGV0IGkgPSBzaHVmZmxlZC5sZW5ndGggLSAxOyBpID4gMDsgaSAtPSAxKSB7XG4gICAgY29uc3QgaiA9IHJhbmRvbUluZGV4KGkgKyAxKTtcbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoaikgfHwgaiA8IDAgfHwgaiA+IGkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgc2h1ZmZsZSByYW5kb21JbmRleCByZXR1cm5lZCAke2p9OyBleHBlY3RlZCBhbiBpbnRlZ2VyIGZyb20gMCB0byAke2l9YCk7XG4gICAgfVxuICAgIFtzaHVmZmxlZFtpXSwgc2h1ZmZsZWRbal1dID0gW3NodWZmbGVkW2pdLCBzaHVmZmxlZFtpXV07XG4gIH1cbiAgcmV0dXJuIHNodWZmbGVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplU3RvcmVFbnRyeShpbnB1dDogdW5rbm93bik6IFR3ZWFrU3RvcmVFbnRyeSB7XG4gIGNvbnN0IGVudHJ5ID0gaW5wdXQgYXMgUGFydGlhbDxUd2Vha1N0b3JlRW50cnk+IHwgbnVsbDtcbiAgaWYgKCFlbnRyeSB8fCB0eXBlb2YgZW50cnkgIT09IFwib2JqZWN0XCIpIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdHdlYWsgc3RvcmUgZW50cnlcIik7XG4gIGNvbnN0IHJlcG8gPSBub3JtYWxpemVHaXRIdWJSZXBvKFN0cmluZyhlbnRyeS5yZXBvID8/IGVudHJ5Lm1hbmlmZXN0Py5naXRodWJSZXBvID8/IFwiXCIpKTtcbiAgY29uc3QgbWFuaWZlc3QgPSBlbnRyeS5tYW5pZmVzdCBhcyBUd2Vha01hbmlmZXN0IHwgdW5kZWZpbmVkO1xuICBpZiAoIW1hbmlmZXN0Py5pZCB8fCAhbWFuaWZlc3QubmFtZSB8fCAhbWFuaWZlc3QudmVyc2lvbikge1xuICAgIHRocm93IG5ldyBFcnJvcihgU3RvcmUgZW50cnkgZm9yICR7cmVwb30gaXMgbWlzc2luZyBtYW5pZmVzdCBmaWVsZHNgKTtcbiAgfVxuICBpZiAobm9ybWFsaXplR2l0SHViUmVwbyhtYW5pZmVzdC5naXRodWJSZXBvKSAhPT0gcmVwbykge1xuICAgIHRocm93IG5ldyBFcnJvcihgU3RvcmUgZW50cnkgJHttYW5pZmVzdC5pZH0gcmVwbyBkb2VzIG5vdCBtYXRjaCBtYW5pZmVzdCBnaXRodWJSZXBvYCk7XG4gIH1cbiAgaWYgKCFpc0Z1bGxDb21taXRTaGEoU3RyaW5nKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhID8/IFwiXCIpKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgU3RvcmUgZW50cnkgJHttYW5pZmVzdC5pZH0gbXVzdCBwaW4gYSBmdWxsIGFwcHJvdmVkIGNvbW1pdCBTSEFgKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGlkOiBtYW5pZmVzdC5pZCxcbiAgICBtYW5pZmVzdCxcbiAgICByZXBvLFxuICAgIGFwcHJvdmVkQ29tbWl0U2hhOiBTdHJpbmcoZW50cnkuYXBwcm92ZWRDb21taXRTaGEpLFxuICAgIGFwcHJvdmVkQXQ6IHR5cGVvZiBlbnRyeS5hcHByb3ZlZEF0ID09PSBcInN0cmluZ1wiID8gZW50cnkuYXBwcm92ZWRBdCA6IFwiXCIsXG4gICAgYXBwcm92ZWRCeTogdHlwZW9mIGVudHJ5LmFwcHJvdmVkQnkgPT09IFwic3RyaW5nXCIgPyBlbnRyeS5hcHByb3ZlZEJ5IDogXCJcIixcbiAgICBwbGF0Zm9ybXM6IG5vcm1hbGl6ZVN0b3JlUGxhdGZvcm1zKChlbnRyeSBhcyB7IHBsYXRmb3Jtcz86IHVua25vd24gfSkucGxhdGZvcm1zKSxcbiAgICByZWxlYXNlVXJsOiBvcHRpb25hbEdpdGh1YlVybChlbnRyeS5yZWxlYXNlVXJsKSxcbiAgICByZXZpZXdVcmw6IG9wdGlvbmFsR2l0aHViVXJsKGVudHJ5LnJldmlld1VybCksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdG9yZUFyY2hpdmVVcmwoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeSk6IHN0cmluZyB7XG4gIGlmICghaXNGdWxsQ29tbWl0U2hhKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgU3RvcmUgZW50cnkgJHtlbnRyeS5pZH0gaXMgbm90IHBpbm5lZCB0byBhIGZ1bGwgY29tbWl0IFNIQWApO1xuICB9XG4gIHJldHVybiBgaHR0cHM6Ly9jb2RlbG9hZC5naXRodWIuY29tLyR7ZW50cnkucmVwb30vdGFyLmd6LyR7ZW50cnkuYXBwcm92ZWRDb21taXRTaGF9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwoc3VibWlzc2lvbjogVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uKTogc3RyaW5nIHtcbiAgY29uc3QgcmVwbyA9IG5vcm1hbGl6ZUdpdEh1YlJlcG8oc3VibWlzc2lvbi5yZXBvKTtcbiAgaWYgKCFpc0Z1bGxDb21taXRTaGEoc3VibWlzc2lvbi5jb21taXRTaGEpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiU3VibWlzc2lvbiBtdXN0IGluY2x1ZGUgdGhlIGZ1bGwgY29tbWl0IFNIQSB0byByZXZpZXdcIik7XG4gIH1cbiAgY29uc3QgdGl0bGUgPSBgVHdlYWsgc3RvcmUgcmV2aWV3OiAke3JlcG99YDtcbiAgY29uc3QgYm9keSA9IFtcbiAgICBcIiMjIFR3ZWFrIHJlcG9cIixcbiAgICBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb31gLFxuICAgIFwiXCIsXG4gICAgXCIjIyBDb21taXQgdG8gcmV2aWV3XCIsXG4gICAgc3VibWlzc2lvbi5jb21taXRTaGEsXG4gICAgc3VibWlzc2lvbi5jb21taXRVcmwsXG4gICAgXCJcIixcbiAgICBcIkRvIG5vdCBhcHByb3ZlIGEgZGlmZmVyZW50IGNvbW1pdC4gSWYgdGhlIGF1dGhvciBwdXNoZXMgY2hhbmdlcywgYXNrIHRoZW0gdG8gcmVzdWJtaXQuXCIsXG4gICAgXCJcIixcbiAgICBcIiMjIE1hbmlmZXN0XCIsXG4gICAgYC0gaWQ6ICR7c3VibWlzc2lvbi5tYW5pZmVzdD8uaWQgPz8gXCIobm90IGRldGVjdGVkKVwifWAsXG4gICAgYC0gbmFtZTogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py5uYW1lID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxuICAgIGAtIHZlcnNpb246ICR7c3VibWlzc2lvbi5tYW5pZmVzdD8udmVyc2lvbiA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBgLSBkZXNjcmlwdGlvbjogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py5kZXNjcmlwdGlvbiA/PyBcIihub3QgZGV0ZWN0ZWQpXCJ9YCxcbiAgICBgLSBpY29uVXJsOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/Lmljb25VcmwgPz8gXCIobm90IGRldGVjdGVkKVwifWAsXG4gICAgXCJcIixcbiAgICBcIiMjIEFkbWluIGNoZWNrbGlzdFwiLFxuICAgIFwiLSBbIF0gbWFuaWZlc3QuanNvbiBpcyB2YWxpZFwiLFxuICAgIFwiLSBbIF0gbWFuaWZlc3QuaWNvblVybCBpcyB1c2FibGUgYXMgdGhlIHN0b3JlIGljb25cIixcbiAgICBcIi0gWyBdIHNvdXJjZSB3YXMgcmV2aWV3ZWQgYXQgdGhlIGV4YWN0IGNvbW1pdCBhYm92ZVwiLFxuICAgIFwiLSBbIF0gYHN0b3JlL2luZGV4Lmpzb25gIGVudHJ5IHBpbnMgYGFwcHJvdmVkQ29tbWl0U2hhYCB0byB0aGUgZXhhY3QgY29tbWl0IGFib3ZlXCIsXG4gIF0uam9pbihcIlxcblwiKTtcbiAgY29uc3QgdXJsID0gbmV3IFVSTChUV0VBS19TVE9SRV9SRVZJRVdfSVNTVUVfVVJMKTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJ0ZW1wbGF0ZVwiLCBcInR3ZWFrLXN0b3JlLXJldmlldy5tZFwiKTtcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJ0aXRsZVwiLCB0aXRsZSk7XG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwiYm9keVwiLCBib2R5KTtcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNGdWxsQ29tbWl0U2hhKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIEZVTExfU0hBX1JFLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVSZXBvUGFydCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgcmVwbyA9IHZhbHVlLnRyaW0oKS5yZXBsYWNlKC9cXC5naXQkL2ksIFwiXCIpLnJlcGxhY2UoL15cXC8rfFxcLyskL2csIFwiXCIpO1xuICBpZiAoIUdJVEhVQl9SRVBPX1JFLnRlc3QocmVwbykpIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiByZXBvIG11c3QgYmUgaW4gb3duZXIvcmVwbyBmb3JtXCIpO1xuICByZXR1cm4gcmVwbztcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU3RvcmVQbGF0Zm9ybXMoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlUGxhdGZvcm1bXSB8IHVuZGVmaW5lZCB7XG4gIGlmIChpbnB1dCA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuICBpZiAoIUFycmF5LmlzQXJyYXkoaW5wdXQpKSB0aHJvdyBuZXcgRXJyb3IoXCJTdG9yZSBlbnRyeSBwbGF0Zm9ybXMgbXVzdCBiZSBhbiBhcnJheVwiKTtcbiAgY29uc3QgYWxsb3dlZCA9IG5ldyBTZXQ8VHdlYWtTdG9yZVBsYXRmb3JtPihbXCJkYXJ3aW5cIiwgXCJ3aW4zMlwiLCBcImxpbnV4XCJdKTtcbiAgY29uc3QgcGxhdGZvcm1zID0gQXJyYXkuZnJvbShuZXcgU2V0KGlucHV0Lm1hcCgodmFsdWUpID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8ICFhbGxvd2VkLmhhcyh2YWx1ZSBhcyBUd2Vha1N0b3JlUGxhdGZvcm0pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHN0b3JlIHBsYXRmb3JtOiAke1N0cmluZyh2YWx1ZSl9YCk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZSBhcyBUd2Vha1N0b3JlUGxhdGZvcm07XG4gIH0pKSk7XG4gIHJldHVybiBwbGF0Zm9ybXMubGVuZ3RoID4gMCA/IHBsYXRmb3JtcyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gb3B0aW9uYWxHaXRodWJVcmwodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8ICF2YWx1ZS50cmltKCkpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwodmFsdWUpO1xuICBpZiAodXJsLnByb3RvY29sICE9PSBcImh0dHBzOlwiIHx8IHVybC5ob3N0bmFtZSAhPT0gXCJnaXRodWIuY29tXCIpIHJldHVybiB1bmRlZmluZWQ7XG4gIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbn1cbiIsICJleHBvcnQgdHlwZSBJbmplY3RlZFNldHRpbmdzR3JvdXBLaW5kID1cbiAgfCBcIm5hdGl2ZS1uYXYtaGVhZGVyXCJcbiAgfCBcIm5hdi1ncm91cFwiXG4gIHwgXCJwYWdlcy1ncm91cFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEluamVjdGVkU2V0dGluZ3NHcm91cENhbmRpZGF0ZTxUIGV4dGVuZHMgb2JqZWN0PiB7XG4gIGdyb3VwOiBUO1xuICBraW5kOiBJbmplY3RlZFNldHRpbmdzR3JvdXBLaW5kO1xuICBwYXJlbnQ6IFQgfCBudWxsO1xuICB2YWxpZFBsYWNlbWVudDogYm9vbGVhbjtcbiAgY3VycmVudDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdEluamVjdGVkU2V0dGluZ3NHcm91cHNUb1JlbW92ZTxUIGV4dGVuZHMgb2JqZWN0PihcbiAgY2FuZGlkYXRlczogcmVhZG9ubHkgSW5qZWN0ZWRTZXR0aW5nc0dyb3VwQ2FuZGlkYXRlPFQ+W10sXG4pOiBUW10ge1xuICBjb25zdCByZW1vdmUgPSBuZXcgU2V0PFQ+KCk7XG4gIGNvbnN0IGdyb3Vwc0J5UGFyZW50QW5kS2luZCA9IG5ldyBNYXA8VCwgTWFwPEluamVjdGVkU2V0dGluZ3NHcm91cEtpbmQsIEluamVjdGVkU2V0dGluZ3NHcm91cENhbmRpZGF0ZTxUPltdPj4oKTtcblxuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKCFjYW5kaWRhdGUudmFsaWRQbGFjZW1lbnQgfHwgIWNhbmRpZGF0ZS5wYXJlbnQpIHtcbiAgICAgIHJlbW92ZS5hZGQoY2FuZGlkYXRlLmdyb3VwKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGxldCBncm91cHNCeUtpbmQgPSBncm91cHNCeVBhcmVudEFuZEtpbmQuZ2V0KGNhbmRpZGF0ZS5wYXJlbnQpO1xuICAgIGlmICghZ3JvdXBzQnlLaW5kKSB7XG4gICAgICBncm91cHNCeUtpbmQgPSBuZXcgTWFwKCk7XG4gICAgICBncm91cHNCeVBhcmVudEFuZEtpbmQuc2V0KGNhbmRpZGF0ZS5wYXJlbnQsIGdyb3Vwc0J5S2luZCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVwZWF0ZWRHcm91cHMgPSBncm91cHNCeUtpbmQuZ2V0KGNhbmRpZGF0ZS5raW5kKSA/PyBbXTtcbiAgICByZXBlYXRlZEdyb3Vwcy5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgZ3JvdXBzQnlLaW5kLnNldChjYW5kaWRhdGUua2luZCwgcmVwZWF0ZWRHcm91cHMpO1xuICB9XG5cbiAgZm9yIChjb25zdCBncm91cHNCeUtpbmQgb2YgZ3JvdXBzQnlQYXJlbnRBbmRLaW5kLnZhbHVlcygpKSB7XG4gICAgZm9yIChjb25zdCByZXBlYXRlZEdyb3VwcyBvZiBncm91cHNCeUtpbmQudmFsdWVzKCkpIHtcbiAgICAgIGlmIChyZXBlYXRlZEdyb3Vwcy5sZW5ndGggPD0gMSkgY29udGludWU7XG4gICAgICBjb25zdCBrZWVwID0gcmVwZWF0ZWRHcm91cHMuZmluZCgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuY3VycmVudCkgPz8gcmVwZWF0ZWRHcm91cHNbMF0hO1xuICAgICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgcmVwZWF0ZWRHcm91cHMpIHtcbiAgICAgICAgaWYgKGNhbmRpZGF0ZSAhPT0ga2VlcCkgcmVtb3ZlLmFkZChjYW5kaWRhdGUuZ3JvdXApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjYW5kaWRhdGVzXG4gICAgLm1hcCgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuZ3JvdXApXG4gICAgLmZpbHRlcigoZ3JvdXApID0+IHJlbW92ZS5oYXMoZ3JvdXApKTtcbn1cbiIsICIvKipcbiAqIFJlbmRlcmVyLXNpZGUgdHdlYWsgaG9zdC4gV2U6XG4gKiAgIDEuIEFzayBtYWluIGZvciB0aGUgdHdlYWsgbGlzdCAod2l0aCByZXNvbHZlZCBlbnRyeSBwYXRoKS5cbiAqICAgMi4gRm9yIGVhY2ggcmVuZGVyZXItc2NvcGVkIChvciBcImJvdGhcIikgdHdlYWssIGZldGNoIGl0cyBzb3VyY2UgdmlhIElQQ1xuICogICAgICBhbmQgZXhlY3V0ZSBpdCBhcyBhIENvbW1vbkpTLXNoYXBlZCBmdW5jdGlvbi5cbiAqICAgMy4gUHJvdmlkZSBpdCB0aGUgcmVuZGVyZXIgaGFsZiBvZiB0aGUgQVBJLlxuICpcbiAqIENvZGV4IHJ1bnMgdGhlIHJlbmRlcmVyIHdpdGggc2FuZGJveDogdHJ1ZSwgc28gTm9kZSdzIGByZXF1aXJlKClgIGlzXG4gKiByZXN0cmljdGVkIHRvIGEgdGlueSB3aGl0ZWxpc3QgKGVsZWN0cm9uICsgYSBmZXcgcG9seWZpbGxzKS4gVGhhdCBtZWFucyB3ZVxuICogY2Fubm90IGByZXF1aXJlKClgIGFyYml0cmFyeSB0d2VhayBmaWxlcyBmcm9tIGRpc2suIEluc3RlYWQgd2UgcHVsbCB0aGVcbiAqIHNvdXJjZSBzdHJpbmcgZnJvbSBtYWluIGFuZCBldmFsdWF0ZSBpdCB3aXRoIGBuZXcgRnVuY3Rpb25gIGluc2lkZSB0aGVcbiAqIHByZWxvYWQgY29udGV4dC4gVHdlYWsgYXV0aG9ycyB3aG8gbmVlZCBucG0gZGVwcyBtdXN0IGJ1bmRsZSB0aGVtIGluLlxuICovXG5cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgeyByZWdpc3RlclNlY3Rpb24sIHJlZ2lzdGVyUGFnZSwgY2xlYXJTZWN0aW9ucywgc2V0TGlzdGVkVHdlYWtzIH0gZnJvbSBcIi4vc2V0dGluZ3MtaW5qZWN0b3JcIjtcbmltcG9ydCB7IGZpYmVyRm9yTm9kZSB9IGZyb20gXCIuL3JlYWN0LWhvb2tcIjtcbmltcG9ydCB0eXBlIHtcbiAgQ29kZXhDZHBTdGF0dXMsXG4gIENvZGV4Q2RwVGFyZ2V0LFxuICBDb2RleFJ1bnRpbWVDYXBhYmlsaXRpZXMsXG4gIENvZGV4UnVudGltZUluZm8sXG4gIENvZGV4Vmlld1JlZixcbiAgQ29kZXhXaW5kb3dSZWYsXG4gIE5hdGl2ZUhlbHBlckxhdW5jaE9wdGlvbnMsXG4gIE5hdGl2ZUhlbHBlclJlZixcbiAgTmF0aXZlTW9kdWxlS2luZCxcbiAgTmF0aXZlTW9kdWxlTG9hZE9wdGlvbnMsXG4gIE5hdGl2ZU1vZHVsZVJlZixcbiAgTmF0aXZlUGFuZWxDcmVhdGVPcHRpb25zLFxuICBOYXRpdmVQYW5lbFJlZixcbiAgTmF0aXZlVmlld0F0dGFjaE9wdGlvbnMsXG4gIE5hdGl2ZVZpZXdSZWYsXG4gIFR3ZWFrTWFuaWZlc3QsXG4gIFR3ZWFrQXBpLFxuICBSZWFjdEZpYmVyTm9kZSxcbiAgVHdlYWssXG59IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5cbmludGVyZmFjZSBMaXN0ZWRUd2VhayB7XG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xuICBlbnRyeTogc3RyaW5nO1xuICBkaXI6IHN0cmluZztcbiAgZW50cnlFeGlzdHM6IGJvb2xlYW47XG4gIGVuYWJsZWQ6IGJvb2xlYW47XG4gIHVwZGF0ZToge1xuICAgIGNoZWNrZWRBdDogc3RyaW5nO1xuICAgIHJlcG86IHN0cmluZztcbiAgICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xuICAgIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gICAgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsO1xuICAgIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XG4gICAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xuICAgIGVycm9yPzogc3RyaW5nO1xuICB9IHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIFVzZXJQYXRocyB7XG4gIHVzZXJSb290OiBzdHJpbmc7XG4gIHJ1bnRpbWVEaXI6IHN0cmluZztcbiAgdHdlYWtzRGlyOiBzdHJpbmc7XG4gIGxvZ0Rpcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRWxlY3Ryb25CcmlkZ2Uge1xuICBnZXRCdWlsZEZsYXZvcj86ICgpID0+IHN0cmluZyB8IG51bGw7XG4gIHVzZXNPd2xBcHBTaGVsbD86ICgpID0+IGJvb2xlYW47XG59XG5cbmNvbnN0IGxvYWRlZCA9IG5ldyBNYXA8c3RyaW5nLCB7IHN0b3A/OiAoKSA9PiB2b2lkIH0+KCk7XG5sZXQgY2FjaGVkUGF0aHM6IFVzZXJQYXRocyB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRUd2Vha0hvc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHR3ZWFrcyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmxpc3QtdHdlYWtzXCIpKSBhcyBMaXN0ZWRUd2Vha1tdO1xuICBjb25zdCBwYXRocyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnVzZXItcGF0aHNcIikpIGFzIFVzZXJQYXRocztcbiAgY2FjaGVkUGF0aHMgPSBwYXRocztcbiAgLy8gUHVzaCB0aGUgbGlzdCB0byB0aGUgc2V0dGluZ3MgaW5qZWN0b3Igc28gdGhlIFR3ZWFrcyBwYWdlIGNhbiByZW5kZXJcbiAgLy8gY2FyZHMgZXZlbiBiZWZvcmUgYW55IHR3ZWFrJ3Mgc3RhcnQoKSBydW5zIChhbmQgZm9yIGRpc2FibGVkIHR3ZWFrc1xuICAvLyB0aGF0IHdlIG5ldmVyIGxvYWQpLlxuICBzZXRMaXN0ZWRUd2Vha3ModHdlYWtzKTtcbiAgLy8gU3Rhc2ggZm9yIHRoZSBzZXR0aW5ncyBpbmplY3RvcidzIGVtcHR5LXN0YXRlIG1lc3NhZ2UuXG4gICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IF9fY29kZXhwcF90d2Vha3NfZGlyX18/OiBzdHJpbmcgfSkuX19jb2RleHBwX3R3ZWFrc19kaXJfXyA9XG4gICAgcGF0aHMudHdlYWtzRGlyO1xuXG4gIGZvciAoY29uc3QgdCBvZiB0d2Vha3MpIHtcbiAgICBpZiAodC5tYW5pZmVzdC5zY29wZSA9PT0gXCJtYWluXCIpIGNvbnRpbnVlO1xuICAgIGlmICghdC5lbnRyeUV4aXN0cykgY29udGludWU7XG4gICAgaWYgKCF0LmVuYWJsZWQpIGNvbnRpbnVlO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBsb2FkVHdlYWsodCwgcGF0aHMpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIHR3ZWFrIGxvYWQgZmFpbGVkOlwiLCB0Lm1hbmlmZXN0LmlkLCBlKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlwY1JlbmRlcmVyLnNlbmQoXG4gICAgICAgICAgXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsXG4gICAgICAgICAgXCJlcnJvclwiLFxuICAgICAgICAgIFwidHdlYWsgbG9hZCBmYWlsZWQ6IFwiICsgdC5tYW5pZmVzdC5pZCArIFwiOiBcIiArIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCB7fVxuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUuaW5mbyhcbiAgICBgW2NvZGV4LXBsdXNwbHVzXSByZW5kZXJlciBob3N0IGxvYWRlZCAke2xvYWRlZC5zaXplfSB0d2VhayhzKTpgLFxuICAgIFsuLi5sb2FkZWQua2V5cygpXS5qb2luKFwiLCBcIikgfHwgXCIobm9uZSlcIixcbiAgKTtcbiAgaXBjUmVuZGVyZXIuc2VuZChcbiAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcbiAgICBcImluZm9cIixcbiAgICBgcmVuZGVyZXIgaG9zdCBsb2FkZWQgJHtsb2FkZWQuc2l6ZX0gdHdlYWsocyk6ICR7Wy4uLmxvYWRlZC5rZXlzKCldLmpvaW4oXCIsIFwiKSB8fCBcIihub25lKVwifWAsXG4gICk7XG59XG5cbi8qKlxuICogU3RvcCBldmVyeSByZW5kZXJlci1zY29wZSB0d2VhayBzbyBhIHN1YnNlcXVlbnQgYHN0YXJ0VHdlYWtIb3N0KClgIHdpbGxcbiAqIHJlLWV2YWx1YXRlIGZyZXNoIHNvdXJjZS4gTW9kdWxlIGNhY2hlIGlzbid0IHJlbGV2YW50IHNpbmNlIHdlIGV2YWxcbiAqIHNvdXJjZSBzdHJpbmdzIGRpcmVjdGx5IFx1MjAxNCBlYWNoIGxvYWQgY3JlYXRlcyBhIGZyZXNoIHNjb3BlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdGVhcmRvd25Ud2Vha0hvc3QoKTogdm9pZCB7XG4gIGZvciAoY29uc3QgW2lkLCB0XSBvZiBsb2FkZWQpIHtcbiAgICB0cnkge1xuICAgICAgdC5zdG9wPy4oKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJbY29kZXgtcGx1c3BsdXNdIHR3ZWFrIHN0b3AgZmFpbGVkOlwiLCBpZCwgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC12aWV3LWRpc3Bvc2UtdHdlYWtcIiwgaWQpLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtZGlzcG9zZS10d2Vha1wiLCBpZCkuY2F0Y2goKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuICBsb2FkZWQuY2xlYXIoKTtcbiAgY2xlYXJTZWN0aW9ucygpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkVHdlYWsodDogTGlzdGVkVHdlYWssIHBhdGhzOiBVc2VyUGF0aHMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc291cmNlID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcbiAgICBcImNvZGV4cHA6cmVhZC10d2Vhay1zb3VyY2VcIixcbiAgICB0LmVudHJ5LFxuICApKSBhcyBzdHJpbmc7XG5cbiAgLy8gRXZhbHVhdGUgYXMgQ0pTLXNoYXBlZDogcHJvdmlkZSBtb2R1bGUvZXhwb3J0cy9hcGkuIFR3ZWFrIGNvZGUgbWF5IHVzZVxuICAvLyBgbW9kdWxlLmV4cG9ydHMgPSB7IHN0YXJ0LCBzdG9wIH1gIG9yIGBleHBvcnRzLnN0YXJ0ID0gLi4uYCBvciBwdXJlIEVTTVxuICAvLyBkZWZhdWx0IGV4cG9ydCBzaGFwZSAod2UgYWNjZXB0IGJvdGgpLlxuICBjb25zdCBtb2R1bGUgPSB7IGV4cG9ydHM6IHt9IGFzIHsgZGVmYXVsdD86IFR3ZWFrIH0gJiBUd2VhayB9O1xuICBjb25zdCBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHM7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8taW1wbGllZC1ldmFsLCBuby1uZXctZnVuY1xuICBjb25zdCBmbiA9IG5ldyBGdW5jdGlvbihcbiAgICBcIm1vZHVsZVwiLFxuICAgIFwiZXhwb3J0c1wiLFxuICAgIFwiY29uc29sZVwiLFxuICAgIGAke3NvdXJjZX1cXG4vLyMgc291cmNlVVJMPWNvZGV4cHAtdHdlYWs6Ly8ke2VuY29kZVVSSUNvbXBvbmVudCh0Lm1hbmlmZXN0LmlkKX0vJHtlbmNvZGVVUklDb21wb25lbnQodC5lbnRyeSl9YCxcbiAgKTtcbiAgZm4obW9kdWxlLCBleHBvcnRzLCBjb25zb2xlKTtcbiAgY29uc3QgbW9kID0gbW9kdWxlLmV4cG9ydHMgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSAmIFR3ZWFrO1xuICBjb25zdCB0d2VhazogVHdlYWsgPSAobW9kIGFzIHsgZGVmYXVsdD86IFR3ZWFrIH0pLmRlZmF1bHQgPz8gKG1vZCBhcyBUd2Vhayk7XG4gIGlmICh0eXBlb2YgdHdlYWs/LnN0YXJ0ICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYHR3ZWFrICR7dC5tYW5pZmVzdC5pZH0gaGFzIG5vIHN0YXJ0KClgKTtcbiAgfVxuICBjb25zdCBhcGkgPSBtYWtlUmVuZGVyZXJBcGkodC5tYW5pZmVzdCwgcGF0aHMpO1xuICBhd2FpdCB0d2Vhay5zdGFydChhcGkpO1xuICBsb2FkZWQuc2V0KHQubWFuaWZlc3QuaWQsIHsgc3RvcDogdHdlYWsuc3RvcD8uYmluZCh0d2VhaykgfSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VSZW5kZXJlckFwaShtYW5pZmVzdDogVHdlYWtNYW5pZmVzdCwgcGF0aHM6IFVzZXJQYXRocyk6IFR3ZWFrQXBpIHtcbiAgY29uc3QgaWQgPSBtYW5pZmVzdC5pZDtcbiAgY29uc3QgbG9nID0gKGxldmVsOiBcImRlYnVnXCIgfCBcImluZm9cIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCAuLi5hOiB1bmtub3duW10pID0+IHtcbiAgICBjb25zdCBjb25zb2xlRm4gPVxuICAgICAgbGV2ZWwgPT09IFwiZGVidWdcIiA/IGNvbnNvbGUuZGVidWdcbiAgICAgIDogbGV2ZWwgPT09IFwid2FyblwiID8gY29uc29sZS53YXJuXG4gICAgICA6IGxldmVsID09PSBcImVycm9yXCIgPyBjb25zb2xlLmVycm9yXG4gICAgICA6IGNvbnNvbGUubG9nO1xuICAgIGNvbnNvbGVGbihgW2NvZGV4LXBsdXNwbHVzXVske2lkfV1gLCAuLi5hKTtcbiAgICAvLyBBbHNvIG1pcnJvciB0byBtYWluJ3MgbG9nIGZpbGUgc28gd2UgY2FuIGRpYWdub3NlIHR3ZWFrIGJlaGF2aW9yXG4gICAgLy8gd2l0aG91dCBhdHRhY2hpbmcgRGV2VG9vbHMuIFN0cmluZ2lmeSBlYWNoIGFyZyBkZWZlbnNpdmVseS5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFydHMgPSBhLm1hcCgodikgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHJldHVybiB2O1xuICAgICAgICBpZiAodiBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gYCR7di5uYW1lfTogJHt2Lm1lc3NhZ2V9YDtcbiAgICAgICAgdHJ5IHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHYpOyB9IGNhdGNoIHsgcmV0dXJuIFN0cmluZyh2KTsgfVxuICAgICAgfSk7XG4gICAgICBpcGNSZW5kZXJlci5zZW5kKFxuICAgICAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcbiAgICAgICAgbGV2ZWwsXG4gICAgICAgIGBbdHdlYWsgJHtpZH1dICR7cGFydHMuam9pbihcIiBcIil9YCxcbiAgICAgICk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvKiBzd2FsbG93IFx1MjAxNCBuZXZlciBsZXQgbG9nZ2luZyBicmVhayBhIHR3ZWFrICovXG4gICAgfVxuICB9O1xuXG4gIHJldHVybiB7XG4gICAgbWFuaWZlc3QsXG4gICAgcHJvY2VzczogXCJyZW5kZXJlclwiLFxuICAgIGxvZzoge1xuICAgICAgZGVidWc6ICguLi5hKSA9PiBsb2coXCJkZWJ1Z1wiLCAuLi5hKSxcbiAgICAgIGluZm86ICguLi5hKSA9PiBsb2coXCJpbmZvXCIsIC4uLmEpLFxuICAgICAgd2FybjogKC4uLmEpID0+IGxvZyhcIndhcm5cIiwgLi4uYSksXG4gICAgICBlcnJvcjogKC4uLmEpID0+IGxvZyhcImVycm9yXCIsIC4uLmEpLFxuICAgIH0sXG4gICAgc3RvcmFnZTogcmVuZGVyZXJTdG9yYWdlKGlkKSxcbiAgICBzZXR0aW5nczoge1xuICAgICAgcmVnaXN0ZXI6IChzKSA9PiByZWdpc3RlclNlY3Rpb24oeyAuLi5zLCBpZDogYCR7aWR9OiR7cy5pZH1gIH0pLFxuICAgICAgcmVnaXN0ZXJQYWdlOiAocCkgPT5cbiAgICAgICAgcmVnaXN0ZXJQYWdlKGlkLCBtYW5pZmVzdCwgeyAuLi5wLCBpZDogYCR7aWR9OiR7cC5pZH1gIH0pLFxuICAgIH0sXG4gICAgcmVhY3Q6IHtcbiAgICAgIGdldEZpYmVyOiAobikgPT4gZmliZXJGb3JOb2RlKG4pIGFzIFJlYWN0RmliZXJOb2RlIHwgbnVsbCxcbiAgICAgIGZpbmRPd25lckJ5TmFtZTogKG4sIG5hbWUpID0+IHtcbiAgICAgICAgbGV0IGYgPSBmaWJlckZvck5vZGUobikgYXMgUmVhY3RGaWJlck5vZGUgfCBudWxsO1xuICAgICAgICB3aGlsZSAoZikge1xuICAgICAgICAgIGNvbnN0IHQgPSBmLnR5cGUgYXMgeyBkaXNwbGF5TmFtZT86IHN0cmluZzsgbmFtZT86IHN0cmluZyB9IHwgbnVsbDtcbiAgICAgICAgICBpZiAodCAmJiAodC5kaXNwbGF5TmFtZSA9PT0gbmFtZSB8fCB0Lm5hbWUgPT09IG5hbWUpKSByZXR1cm4gZjtcbiAgICAgICAgICBmID0gZi5yZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9LFxuICAgICAgd2FpdEZvckVsZW1lbnQ6IChzZWwsIHRpbWVvdXRNcyA9IDUwMDApID0+XG4gICAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcpIHJldHVybiByZXNvbHZlKGV4aXN0aW5nKTtcbiAgICAgICAgICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXM7XG4gICAgICAgICAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XG4gICAgICAgICAgICBpZiAoZWwpIHtcbiAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZShlbCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKERhdGUubm93KCkgPiBkZWFkbGluZSkge1xuICAgICAgICAgICAgICBvYnMuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGB0aW1lb3V0IHdhaXRpbmcgZm9yICR7c2VsfWApKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuICAgICAgICB9KSxcbiAgICB9LFxuICAgIGlwYzoge1xuICAgICAgb246IChjLCBoKSA9PiB7XG4gICAgICAgIGNvbnN0IHdyYXBwZWQgPSAoX2U6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gaCguLi5hcmdzKTtcbiAgICAgICAgaXBjUmVuZGVyZXIub24oYGNvZGV4cHA6JHtpZH06JHtjfWAsIHdyYXBwZWQpO1xuICAgICAgICByZXR1cm4gKCkgPT4gaXBjUmVuZGVyZXIucmVtb3ZlTGlzdGVuZXIoYGNvZGV4cHA6JHtpZH06JHtjfWAsIHdyYXBwZWQpO1xuICAgICAgfSxcbiAgICAgIHNlbmQ6IChjLCAuLi5hcmdzKSA9PiBpcGNSZW5kZXJlci5zZW5kKGBjb2RleHBwOiR7aWR9OiR7Y31gLCAuLi5hcmdzKSxcbiAgICAgIGludm9rZTogPFQ+KGM6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoYGNvZGV4cHA6JHtpZH06JHtjfWAsIC4uLmFyZ3MpIGFzIFByb21pc2U8VD4sXG4gICAgfSxcbiAgICBmczogcmVuZGVyZXJGcyhpZCwgcGF0aHMpLFxuICAgIGNvZGV4OiByZW5kZXJlckNvZGV4QXBpKGlkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyZXJDb2RleEFwaSh0d2Vha0lkOiBzdHJpbmcpOiBOb25OdWxsYWJsZTxUd2Vha0FwaVtcImNvZGV4XCJdPiB7XG4gIHJldHVybiB7XG4gICAgcnVudGltZToge1xuICAgICAgZ2V0SW5mbzogYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC1ydW50aW1lLWluZm9cIikgYXMgQ29kZXhSdW50aW1lSW5mbztcbiAgICAgICAgY29uc3QgYnJpZGdlID0gcmVuZGVyZXJFbGVjdHJvbkJyaWRnZSgpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmluZm8sXG4gICAgICAgICAgYnVpbGRGbGF2b3I6IGJyaWRnZT8uZ2V0QnVpbGRGbGF2b3I/LigpID8/IGluZm8uYnVpbGRGbGF2b3IsXG4gICAgICAgICAgdXNlc093bEFwcFNoZWxsOiBicmlkZ2U/LnVzZXNPd2xBcHBTaGVsbD8uKCkgPz8gaW5mby51c2VzT3dsQXBwU2hlbGwsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZ2V0Q2FwYWJpbGl0aWVzOiAoKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXJ1bnRpbWUtY2FwYWJpbGl0aWVzXCIpIGFzIFByb21pc2U8Q29kZXhSdW50aW1lQ2FwYWJpbGl0aWVzPixcbiAgICB9LFxuICAgIHdpbmRvd3M6IHtcbiAgICAgIGNyZWF0ZTogKG9wdGlvbnMpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtd2luZG93LWNyZWF0ZVwiLCBvcHRpb25zKSBhcyBQcm9taXNlPENvZGV4V2luZG93UmVmPixcbiAgICAgIGdldFByaW1hcnk6ICgpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtd2luZG93LXByaW1hcnlcIikgYXMgUHJvbWlzZTxDb2RleFdpbmRvd1JlZiB8IG51bGw+LFxuICAgICAgZm9jdXM6ICh3aW5kb3dJZCkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctZm9jdXNcIiwgd2luZG93SWQpIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gICAgICBzaG93OiAod2luZG93SWQpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtd2luZG93LXNob3dcIiwgd2luZG93SWQpIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gICAgfSxcbiAgICB2aWV3czoge1xuICAgICAgY3JlYXRlOiBhc3luYyAob3B0aW9ucykgPT4ge1xuICAgICAgICBjb25zdCByZWYgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXG4gICAgICAgICAgXCJjb2RleHBwOmNvZGV4LXZpZXctY3JlYXRlXCIsXG4gICAgICAgICAgdHdlYWtJZCxcbiAgICAgICAgICBvcHRpb25zLFxuICAgICAgICApIGFzIHsgaWQ6IHN0cmluZzsgd2ViQ29udGVudHNJZDogbnVtYmVyOyBwYXJlbnRXaW5kb3dJZDogbnVtYmVyIHwgbnVsbCB9O1xuICAgICAgICByZXR1cm4gcmVuZGVyZXJDb2RleFZpZXdSZWYodHdlYWtJZCwgcmVmLmlkLCByZWYud2ViQ29udGVudHNJZCwgcmVmLnBhcmVudFdpbmRvd0lkKTtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBjZHA6IHtcbiAgICAgIGdldFN0YXR1czogKCkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC1jZHAtc3RhdHVzXCIpIGFzIFByb21pc2U8Q29kZXhDZHBTdGF0dXM+LFxuICAgICAgbGlzdFRhcmdldHM6ICgpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtY2RwLXRhcmdldHNcIikgYXMgUHJvbWlzZTxDb2RleENkcFRhcmdldFtdPixcbiAgICB9LFxuICAgIG5hdGl2ZToge1xuICAgICAgbG9hZE1vZHVsZTogYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgICAgY29uc3QgcmVmID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICAgIFwiY29kZXhwcDpuYXRpdmUtbG9hZC1tb2R1bGVcIixcbiAgICAgICAgICB0d2Vha0lkLFxuICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICkgYXMgeyBpZDogc3RyaW5nOyBraW5kOiBOYXRpdmVNb2R1bGVLaW5kIH07XG4gICAgICAgIHJldHVybiByZW5kZXJlck5hdGl2ZU1vZHVsZVJlZih0d2Vha0lkLCByZWYuaWQsIHJlZi5raW5kKTtcbiAgICAgIH0sXG4gICAgICBjcmVhdGVQYW5lbDogYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgICAgY29uc3QgcmVmID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgICAgIFwiY29kZXhwcDpuYXRpdmUtY3JlYXRlLXBhbmVsXCIsXG4gICAgICAgICAgdHdlYWtJZCxcbiAgICAgICAgICBvcHRpb25zLFxuICAgICAgICApIGFzIHsgaWQ6IHN0cmluZzsgd2luZG93SWQ6IG51bWJlciB8IG51bGwgfTtcbiAgICAgICAgcmV0dXJuIHJlbmRlcmVyTmF0aXZlUGFuZWxSZWYodHdlYWtJZCwgcmVmLmlkLCByZWYud2luZG93SWQpO1xuICAgICAgfSxcbiAgICAgIGF0dGFjaFZpZXc6IGFzeW5jIChvcHRpb25zKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlZiA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgICBcImNvZGV4cHA6bmF0aXZlLWF0dGFjaC12aWV3XCIsXG4gICAgICAgICAgdHdlYWtJZCxcbiAgICAgICAgICBvcHRpb25zLFxuICAgICAgICApIGFzIHsgaWQ6IHN0cmluZyB9O1xuICAgICAgICByZXR1cm4gcmVuZGVyZXJOYXRpdmVWaWV3UmVmKHR3ZWFrSWQsIHJlZi5pZCk7XG4gICAgICB9LFxuICAgICAgbGF1bmNoSGVscGVyOiBhc3luYyAob3B0aW9ucykgPT4ge1xuICAgICAgICBjb25zdCByZWYgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXG4gICAgICAgICAgXCJjb2RleHBwOm5hdGl2ZS1sYXVuY2gtaGVscGVyXCIsXG4gICAgICAgICAgdHdlYWtJZCxcbiAgICAgICAgICBvcHRpb25zLFxuICAgICAgICApIGFzIHsgaWQ6IHN0cmluZzsgcGlkOiBudW1iZXIgfTtcbiAgICAgICAgcmV0dXJuIHJlbmRlcmVyTmF0aXZlSGVscGVyUmVmKHR3ZWFrSWQsIHJlZi5pZCwgcmVmLnBpZCk7XG4gICAgICB9LFxuICAgIH0sXG4gICAgY3JlYXRlQnJvd3NlclZpZXc6IChfb3B0aW9ucykgPT4ge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXBpLmNvZGV4LmNyZWF0ZUJyb3dzZXJWaWV3IGlzIG1haW4tb25seTsgdXNlIGEgbWFpbi1zY29wZWQgdHdlYWtcIik7XG4gICAgfSxcbiAgICBjcmVhdGVXaW5kb3c6IChvcHRpb25zKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC13aW5kb3ctY3JlYXRlXCIsIG9wdGlvbnMpIGFzIFByb21pc2U8Q29kZXhXaW5kb3dSZWY+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlckNvZGV4Vmlld1JlZihcbiAgdHdlYWtJZDogc3RyaW5nLFxuICBpZDogc3RyaW5nLFxuICB3ZWJDb250ZW50c0lkOiBudW1iZXIsXG4gIHBhcmVudFdpbmRvd0lkOiBudW1iZXIgfCBudWxsLFxuKTogQ29kZXhWaWV3UmVmIHtcbiAgcmV0dXJuIHtcbiAgICBpZCxcbiAgICB3ZWJDb250ZW50c0lkLFxuICAgIHBhcmVudFdpbmRvd0lkLFxuICAgIHNldEJvdW5kczogKGJvdW5kcykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtdmlldy1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcInNldEJvdW5kc1wiLCBib3VuZHMpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgc2V0VmlzaWJsZTogKHZpc2libGUpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXZpZXctY2FsbFwiLCB0d2Vha0lkLCBpZCwgXCJzZXRWaXNpYmxlXCIsIHZpc2libGUpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgYnJpbmdUb0Zyb250OiAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC12aWV3LWNhbGxcIiwgdHdlYWtJZCwgaWQsIFwiYnJpbmdUb0Zyb250XCIpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgbG9hZFJvdXRlOiAocm91dGUsIGhvc3RJZCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y29kZXgtdmlldy1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcImxvYWRSb3V0ZVwiLCByb3V0ZSwgaG9zdElkKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGxvYWRVcmw6ICh1cmwpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvZGV4LXZpZXctY2FsbFwiLCB0d2Vha0lkLCBpZCwgXCJsb2FkVXJsXCIsIHVybCkgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBkaXNwb3NlOiAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb2RleC12aWV3LWNhbGxcIiwgdHdlYWtJZCwgaWQsIFwiZGlzcG9zZVwiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlck5hdGl2ZU1vZHVsZVJlZihcbiAgdHdlYWtJZDogc3RyaW5nLFxuICBpZDogc3RyaW5nLFxuICBraW5kOiBOYXRpdmVNb2R1bGVLaW5kLFxuKTogTmF0aXZlTW9kdWxlUmVmIHtcbiAgcmV0dXJuIHtcbiAgICBpZCxcbiAgICBraW5kLFxuICAgIHJlcXVlc3Q6IChtZXRob2QsIHBheWxvYWQsIHRpbWVvdXRNcykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgXCJjb2RleHBwOm5hdGl2ZS1tb2R1bGUtcmVxdWVzdFwiLFxuICAgICAgICB0d2Vha0lkLFxuICAgICAgICBpZCxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBwYXlsb2FkLFxuICAgICAgICB0aW1lb3V0TXMsXG4gICAgICApLFxuICAgIGRpc3Bvc2U6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1tb2R1bGUtZGlzcG9zZVwiLCB0d2Vha0lkLCBpZCkgYXMgUHJvbWlzZTx2b2lkPixcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyZXJOYXRpdmVQYW5lbFJlZih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcsIHdpbmRvd0lkOiBudW1iZXIgfCBudWxsKTogTmF0aXZlUGFuZWxSZWYge1xuICByZXR1cm4ge1xuICAgIGlkLFxuICAgIHdpbmRvd0lkLFxuICAgIHNldEJvdW5kczogKGJvdW5kcykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWluc3RhbmNlLWNhbGxcIiwgdHdlYWtJZCwgXCJwYW5lbFwiLCBpZCwgXCJzZXRCb3VuZHNcIiwgYm91bmRzKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIHNob3c6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1pbnN0YW5jZS1jYWxsXCIsIHR3ZWFrSWQsIFwicGFuZWxcIiwgaWQsIFwic2hvd1wiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGhpZGU6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1pbnN0YW5jZS1jYWxsXCIsIHR3ZWFrSWQsIFwicGFuZWxcIiwgaWQsIFwiaGlkZVwiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGRpc3Bvc2U6ICgpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1pbnN0YW5jZS1jYWxsXCIsIHR3ZWFrSWQsIFwicGFuZWxcIiwgaWQsIFwiZGlzcG9zZVwiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlck5hdGl2ZVZpZXdSZWYodHdlYWtJZDogc3RyaW5nLCBpZDogc3RyaW5nKTogTmF0aXZlVmlld1JlZiB7XG4gIHJldHVybiB7XG4gICAgaWQsXG4gICAgc2V0Qm91bmRzOiAoYm91bmRzKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtaW5zdGFuY2UtY2FsbFwiLCB0d2Vha0lkLCBcInZpZXdcIiwgaWQsIFwic2V0Qm91bmRzXCIsIGJvdW5kcykgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBzZXRWaXNpYmxlOiAodmlzaWJsZSkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWluc3RhbmNlLWNhbGxcIiwgdHdlYWtJZCwgXCJ2aWV3XCIsIGlkLCBcInNldFZpc2libGVcIiwgdmlzaWJsZSkgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBkaXNwb3NlOiAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpuYXRpdmUtaW5zdGFuY2UtY2FsbFwiLCB0d2Vha0lkLCBcInZpZXdcIiwgaWQsIFwiZGlzcG9zZVwiKSBhcyBQcm9taXNlPHZvaWQ+LFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlck5hdGl2ZUhlbHBlclJlZih0d2Vha0lkOiBzdHJpbmcsIGlkOiBzdHJpbmcsIHBpZDogbnVtYmVyKTogTmF0aXZlSGVscGVyUmVmIHtcbiAgcmV0dXJuIHtcbiAgICBpZCxcbiAgICBwaWQsXG4gICAgc2VuZDogKG1lc3NhZ2UpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm5hdGl2ZS1oZWxwZXItY2FsbFwiLCB0d2Vha0lkLCBpZCwgXCJzZW5kXCIsIG1lc3NhZ2UpIGFzIFByb21pc2U8dm9pZD4sXG4gICAgcmVxdWVzdDogKG1lc3NhZ2UsIHRpbWVvdXRNcykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgXCJjb2RleHBwOm5hdGl2ZS1oZWxwZXItY2FsbFwiLFxuICAgICAgICB0d2Vha0lkLFxuICAgICAgICBpZCxcbiAgICAgICAgXCJyZXF1ZXN0XCIsXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIHRpbWVvdXRNcyxcbiAgICAgICksXG4gICAgc3RvcDogKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bmF0aXZlLWhlbHBlci1jYWxsXCIsIHR3ZWFrSWQsIGlkLCBcInN0b3BcIikgYXMgUHJvbWlzZTx2b2lkPixcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyZXJFbGVjdHJvbkJyaWRnZSgpOiBFbGVjdHJvbkJyaWRnZSB8IG51bGwge1xuICBjb25zdCB2YWx1ZSA9ICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IGVsZWN0cm9uQnJpZGdlPzogdW5rbm93biB9KS5lbGVjdHJvbkJyaWRnZTtcbiAgcmV0dXJuIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiA/IHZhbHVlIGFzIEVsZWN0cm9uQnJpZGdlIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyZXJTdG9yYWdlKGlkOiBzdHJpbmcpIHtcbiAgY29uc3Qga2V5ID0gYGNvZGV4cHA6c3RvcmFnZToke2lkfWA7XG4gIGNvbnN0IHJlYWQgPSAoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPT4ge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpID8/IFwie31cIik7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4ge307XG4gICAgfVxuICB9O1xuICBjb25zdCB3cml0ZSA9ICh2OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT5cbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIEpTT04uc3RyaW5naWZ5KHYpKTtcbiAgcmV0dXJuIHtcbiAgICBnZXQ6IDxUPihrOiBzdHJpbmcsIGQ/OiBUKSA9PiAoayBpbiByZWFkKCkgPyAocmVhZCgpW2tdIGFzIFQpIDogKGQgYXMgVCkpLFxuICAgIHNldDogKGs6IHN0cmluZywgdjogdW5rbm93bikgPT4ge1xuICAgICAgY29uc3QgbyA9IHJlYWQoKTtcbiAgICAgIG9ba10gPSB2O1xuICAgICAgd3JpdGUobyk7XG4gICAgfSxcbiAgICBkZWxldGU6IChrOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IG8gPSByZWFkKCk7XG4gICAgICBkZWxldGUgb1trXTtcbiAgICAgIHdyaXRlKG8pO1xuICAgIH0sXG4gICAgYWxsOiAoKSA9PiByZWFkKCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyRnMoaWQ6IHN0cmluZywgX3BhdGhzOiBVc2VyUGF0aHMpIHtcbiAgLy8gU2FuZGJveGVkIHJlbmRlcmVyIGNhbid0IHVzZSBOb2RlIGZzIGRpcmVjdGx5IFx1MjAxNCBwcm94eSB0aHJvdWdoIG1haW4gSVBDLlxuICByZXR1cm4ge1xuICAgIGRhdGFEaXI6IGA8cmVtb3RlPi90d2Vhay1kYXRhLyR7aWR9YCxcbiAgICByZWFkOiAocDogc3RyaW5nKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCBcInJlYWRcIiwgaWQsIHApIGFzIFByb21pc2U8c3RyaW5nPixcbiAgICB3cml0ZTogKHA6IHN0cmluZywgYzogc3RyaW5nKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCBcIndyaXRlXCIsIGlkLCBwLCBjKSBhcyBQcm9taXNlPHZvaWQ+LFxuICAgIGV4aXN0czogKHA6IHN0cmluZykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJleGlzdHNcIiwgaWQsIHApIGFzIFByb21pc2U8Ym9vbGVhbj4sXG4gIH07XG59XG4iLCAiLyoqXG4gKiBCdWlsdC1pbiBcIlR3ZWFrIE1hbmFnZXJcIiBcdTIwMTQgYXV0by1pbmplY3RlZCBieSB0aGUgcnVudGltZSwgbm90IGEgdXNlciB0d2Vhay5cbiAqIExpc3RzIGRpc2NvdmVyZWQgdHdlYWtzIHdpdGggZW5hYmxlIHRvZ2dsZXMsIG9wZW5zIHRoZSB0d2Vha3MgZGlyLCBsaW5rc1xuICogdG8gbG9ncyBhbmQgY29uZmlnLiBMaXZlcyBpbiB0aGUgcmVuZGVyZXIuXG4gKlxuICogVGhpcyBpcyBpbnZva2VkIGZyb20gcHJlbG9hZC9pbmRleC50cyBBRlRFUiB1c2VyIHR3ZWFrcyBhcmUgbG9hZGVkIHNvIGl0XG4gKiBjYW4gc2hvdyB1cC10by1kYXRlIHN0YXR1cy5cbiAqL1xuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdGlvbiB9IGZyb20gXCIuL3NldHRpbmdzLWluamVjdG9yXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtb3VudE1hbmFnZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHR3ZWFrcyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmxpc3QtdHdlYWtzXCIpKSBhcyBBcnJheTx7XG4gICAgbWFuaWZlc3Q6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyB2ZXJzaW9uOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH07XG4gICAgZW50cnlFeGlzdHM6IGJvb2xlYW47XG4gIH0+O1xuICBjb25zdCBwYXRocyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnVzZXItcGF0aHNcIikpIGFzIHtcbiAgICB1c2VyUm9vdDogc3RyaW5nO1xuICAgIHR3ZWFrc0Rpcjogc3RyaW5nO1xuICAgIGxvZ0Rpcjogc3RyaW5nO1xuICB9O1xuXG4gIHJlZ2lzdGVyU2VjdGlvbih7XG4gICAgaWQ6IFwiY29kZXgtcGx1c3BsdXM6bWFuYWdlclwiLFxuICAgIHRpdGxlOiBcIlR3ZWFrIE1hbmFnZXJcIixcbiAgICBkZXNjcmlwdGlvbjogYCR7dHdlYWtzLmxlbmd0aH0gdHdlYWsocykgaW5zdGFsbGVkLiBVc2VyIGRpcjogJHtwYXRocy51c2VyUm9vdH1gLFxuICAgIHJlbmRlcihyb290KSB7XG4gICAgICByb290LnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweDtcIjtcblxuICAgICAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBhY3Rpb25zLnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6ZmxleDtnYXA6OHB4O2ZsZXgtd3JhcDp3cmFwO1wiO1xuICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgICAgYnV0dG9uKFwiT3BlbiB0d2Vha3MgZm9sZGVyXCIsICgpID0+XG4gICAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgcGF0aHMudHdlYWtzRGlyKS5jYXRjaCgoKSA9PiB7fSksXG4gICAgICAgICksXG4gICAgICApO1xuICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgICAgYnV0dG9uKFwiT3BlbiBsb2dzXCIsICgpID0+XG4gICAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgcGF0aHMubG9nRGlyKS5jYXRjaCgoKSA9PiB7fSksXG4gICAgICAgICksXG4gICAgICApO1xuICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgICAgYnV0dG9uKFwiUmVsb2FkIHdpbmRvd1wiLCAoKSA9PiBsb2NhdGlvbi5yZWxvYWQoKSksXG4gICAgICApO1xuICAgICAgcm9vdC5hcHBlbmRDaGlsZChhY3Rpb25zKTtcblxuICAgICAgaWYgKHR3ZWFrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgICAgICAgZW1wdHkuc3R5bGUuY3NzVGV4dCA9IFwiY29sb3I6Izg4ODtmb250OjEzcHggc3lzdGVtLXVpO21hcmdpbjo4cHggMDtcIjtcbiAgICAgICAgZW1wdHkudGV4dENvbnRlbnQgPVxuICAgICAgICAgIFwiTm8gdXNlciB0d2Vha3MgeWV0LiBEcm9wIGEgZm9sZGVyIHdpdGggbWFuaWZlc3QuanNvbiArIGluZGV4LmpzIGludG8gdGhlIHR3ZWFrcyBkaXIsIHRoZW4gcmVsb2FkLlwiO1xuICAgICAgICByb290LmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInVsXCIpO1xuICAgICAgbGlzdC5zdHlsZS5jc3NUZXh0ID0gXCJsaXN0LXN0eWxlOm5vbmU7bWFyZ2luOjA7cGFkZGluZzowO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjZweDtcIjtcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0d2Vha3MpIHtcbiAgICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICAgIGxpLnN0eWxlLmNzc1RleHQgPVxuICAgICAgICAgIFwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtwYWRkaW5nOjhweCAxMHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyLCMyYTJhMmEpO2JvcmRlci1yYWRpdXM6NnB4O1wiO1xuICAgICAgICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgbGVmdC5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQ6NjAwIDEzcHggc3lzdGVtLXVpO1wiPiR7ZXNjYXBlKHQubWFuaWZlc3QubmFtZSl9IDxzcGFuIHN0eWxlPVwiY29sb3I6Izg4ODtmb250LXdlaWdodDo0MDA7XCI+diR7ZXNjYXBlKHQubWFuaWZlc3QudmVyc2lvbil9PC9zcGFuPjwvZGl2PlxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjojODg4O2ZvbnQ6MTJweCBzeXN0ZW0tdWk7XCI+JHtlc2NhcGUodC5tYW5pZmVzdC5kZXNjcmlwdGlvbiA/PyB0Lm1hbmlmZXN0LmlkKX08L2Rpdj5cbiAgICAgICAgYDtcbiAgICAgICAgY29uc3QgcmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICByaWdodC5zdHlsZS5jc3NUZXh0ID0gXCJjb2xvcjojODg4O2ZvbnQ6MTJweCBzeXN0ZW0tdWk7XCI7XG4gICAgICAgIHJpZ2h0LnRleHRDb250ZW50ID0gdC5lbnRyeUV4aXN0cyA/IFwibG9hZGVkXCIgOiBcIm1pc3NpbmcgZW50cnlcIjtcbiAgICAgICAgbGkuYXBwZW5kKGxlZnQsIHJpZ2h0KTtcbiAgICAgICAgbGlzdC5hcHBlbmQobGkpO1xuICAgICAgfVxuICAgICAgcm9vdC5hcHBlbmQobGlzdCk7XG4gICAgfSxcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1dHRvbihsYWJlbDogc3RyaW5nLCBvbmNsaWNrOiAoKSA9PiB2b2lkKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBiID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYi50eXBlID0gXCJidXR0b25cIjtcbiAgYi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICBiLnN0eWxlLmNzc1RleHQgPVxuICAgIFwicGFkZGluZzo2cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlciwjMzMzKTtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOmluaGVyaXQ7Zm9udDoxMnB4IHN5c3RlbS11aTtjdXJzb3I6cG9pbnRlcjtcIjtcbiAgYi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgb25jbGljayk7XG4gIHJldHVybiBiO1xufVxuXG5mdW5jdGlvbiBlc2NhcGUoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHMucmVwbGFjZSgvWyY8PlwiJ10vZywgKGMpID0+XG4gICAgYyA9PT0gXCImXCJcbiAgICAgID8gXCImYW1wO1wiXG4gICAgICA6IGMgPT09IFwiPFwiXG4gICAgICAgID8gXCImbHQ7XCJcbiAgICAgICAgOiBjID09PSBcIj5cIlxuICAgICAgICAgID8gXCImZ3Q7XCJcbiAgICAgICAgICA6IGMgPT09ICdcIidcbiAgICAgICAgICAgID8gXCImcXVvdDtcIlxuICAgICAgICAgICAgOiBcIiYjMzk7XCIsXG4gICk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFXQSxJQUFBQSxtQkFBNEI7OztBQzZCckIsU0FBUyxtQkFBeUI7QUFDdkMsTUFB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QUFBQSxJQUNsRSxLQUFLO0FBQ0gsYUFBTyw2QkFBWSxPQUFPLDJCQUEyQixLQUFLLENBQUMsQ0FBQztBQUFBLElBQzlELEtBQUs7QUFDSCxhQUFPLDZCQUFZLE9BQU8sNkJBQTZCLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDbEYsS0FBSztBQUNILGFBQU8saUNBQWlDLE9BQU8sS0FBSyxDQUFDLENBQUMsR0FBRyxlQUFlO0FBQUEsSUFDMUUsS0FBSztBQUNILGFBQU8sbUNBQW1DLE9BQU8sS0FBSyxDQUFDLENBQUMsR0FBRyxlQUFlO0FBQUEsSUFDNUUsS0FBSztBQUNILGFBQU8sNkJBQVksT0FBTywyQkFBMkIsS0FBSyxDQUFDLENBQUM7QUFBQSxJQUM5RCxLQUFLO0FBQ0gsYUFBTyw2QkFBWSxPQUFPLCtCQUErQjtBQUFBLFFBQ3ZELFFBQVEsS0FBSyxDQUFDO0FBQUEsUUFDZCxHQUFHLEtBQUssQ0FBQztBQUFBLFFBQ1QsR0FBRyxLQUFLLENBQUM7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNILEtBQUs7QUFDSCxhQUFPLDZCQUFZLE9BQU8sdUNBQXVDLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDMUUsS0FBSztBQUNILGFBQU8sNkJBQVksT0FBTywyQkFBMkI7QUFBQSxJQUN2RDtBQUNFLFlBQU0sSUFBSSxNQUFNLDZDQUE2QyxNQUFNLEVBQUU7QUFBQSxFQUN6RTtBQUNGO0FBRUEsU0FBUyxpQ0FDUCxVQUNBLGlCQUNTO0FBQ1QsTUFBSSxDQUFDLHFCQUFxQixLQUFLLFFBQVEsRUFBRyxPQUFNLElBQUksTUFBTSxtQkFBbUI7QUFDN0UsTUFBSSxnQkFBZ0IsSUFBSSxRQUFRLEVBQUcsUUFBTztBQUMxQyxRQUFNLFdBQVcsQ0FBQyxRQUFpQixZQUFxQjtBQUN0RCxpQ0FBWSxLQUFLLDJCQUEyQixVQUFVLE9BQU87QUFBQSxFQUMvRDtBQUNBLGtCQUFnQixJQUFJLFVBQVUsUUFBUTtBQUN0QywrQkFBWSxHQUFHLDRCQUE0QixRQUFRLEdBQUcsUUFBUTtBQUM5RCxTQUFPO0FBQ1Q7QUFFQSxTQUFTLG1DQUNQLFVBQ0EsaUJBQ1M7QUFDVCxRQUFNLFdBQVcsZ0JBQWdCLElBQUksUUFBUTtBQUM3QyxNQUFJLENBQUMsU0FBVSxRQUFPO0FBQ3RCLGtCQUFnQixPQUFPLFFBQVE7QUFDL0IsK0JBQVksZUFBZSw0QkFBNEIsUUFBUSxHQUFHLFFBQVE7QUFDMUUsU0FBTztBQUNUOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfZWxlY3Ryb24iLCAicm9vdCIsICJzdGF0ZSIsICJjaGVjayIsICJidXR0b24iLCAiY2FyZCIsICJpbXBvcnRfZWxlY3Ryb24iLCAibW9kdWxlIiwgImV4cG9ydHMiLCAiaW1wb3J0X2VsZWN0cm9uIiwgInNhZmVTdHJpbmdpZnkiXQp9Cg==
