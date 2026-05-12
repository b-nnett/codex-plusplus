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

// src/preload/settings-injector.ts
var state = {
  sections: /* @__PURE__ */ new Map(),
  pages: /* @__PURE__ */ new Map(),
  listedTweaks: [],
  outerWrapper: null,
  nativeNavHeader: null,
  navGroup: null,
  navButtons: null,
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
var standaloneLauncher = null;
var standaloneOverlay = null;
var standaloneNavRoot = null;
var standalonePanel = null;
var standaloneNavButtons = null;
var standalonePageButtons = /* @__PURE__ */ new Map();
var standaloneKeyHandler = null;
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
  refreshStandaloneNav();
  if (state.activePage?.kind === "registered" && !state.pages.has(state.activePage.id)) {
    fallbackAfterRegisteredPageRemoved();
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
  refreshStandaloneNav();
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
      refreshStandaloneNav();
      if (state.activePage?.kind === "registered" && state.activePage.id === id) {
        fallbackAfterRegisteredPageRemoved();
      }
    }
  };
}
function setListedTweaks(list) {
  state.listedTweaks = list;
  if (state.activePage?.kind === "tweaks") rerender();
}
function mountFloatingSettingsLauncher() {
  if (standaloneLauncher?.isConnected) return;
  const mount = () => {
    if (!document.body) return;
    const existing = document.querySelector(
      "[data-codexpp-standalone-launcher='true']"
    );
    if (existing) {
      standaloneLauncher = existing;
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.codexppStandaloneLauncher = "true";
    btn.title = "Codex++ Settings";
    btn.textContent = "++";
    btn.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483645",
      "width:38px",
      "height:38px",
      "border-radius:10px",
      "border:1px solid var(--color-token-border, rgba(127,127,127,0.35))",
      "background:var(--color-token-main-surface-primary, rgba(24,24,24,0.92))",
      "color:var(--color-token-text-primary, currentColor)",
      "box-shadow:0 10px 28px rgba(0,0,0,0.28)",
      "font:700 14px system-ui, sans-serif",
      "letter-spacing:0",
      "cursor:pointer"
    ].join(";");
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--color-token-bg-fog, rgba(127,127,127,0.18))";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "var(--color-token-main-surface-primary, rgba(24,24,24,0.92))";
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openStandaloneSettingsPanel();
    });
    document.body.appendChild(btn);
    standaloneLauncher = btn;
    plog("standalone launcher mounted");
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
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
  const group = document.createElement("div");
  group.dataset.codexpp = "nav-group";
  group.className = "flex flex-col gap-px";
  group.appendChild(sidebarGroupHeader("Codex++", "pt-3"));
  const configBtn = makeSidebarItem("Config", configIconSvg());
  const tweaksBtn = makeSidebarItem("Tweaks", tweaksIconSvg());
  const storeBtn = makeSidebarItem("Tweak Store", storeIconSvg());
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
function sidebarGroupHeader(text, topPadding = "pt-2") {
  const header = document.createElement("div");
  header.className = `px-row-x ${topPadding} pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none`;
  header.textContent = text;
  return header;
}
function scheduleSettingsSurfaceHidden() {
  if (!state.settingsSurfaceVisible || state.settingsSurfaceHideTimer) return;
  state.settingsSurfaceHideTimer = setTimeout(() => {
    state.settingsSurfaceHideTimer = null;
    if (findSidebarItemsGroup()) return;
    if (isSettingsTextVisible()) return;
    setSettingsSurfaceVisible(false, "sidebar-not-found");
  }, 1500);
}
function isSettingsTextVisible() {
  const text = compactSettingsText(document.body?.textContent || "").toLowerCase();
  return text.includes("back to app") && text.includes("general") && text.includes("appearance") && (text.includes("configuration") || text.includes("default permissions"));
}
function compactSettingsText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
function openStandaloneSettingsPanel(page) {
  if (!document.body) return;
  if (!standaloneOverlay?.isConnected) {
    const overlay = document.createElement("div");
    overlay.dataset.codexppStandaloneOverlay = "true";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(0,0,0,0.38)"
    ].join(";");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "Codex++ Settings");
    dialog.className = "bg-token-main-surface-primary text-token-text-primary border-token-border";
    dialog.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "width:min(1000px, calc(100vw - 32px))",
      "height:min(760px, calc(100vh - 32px))",
      "overflow:hidden",
      "border:1px solid var(--color-token-border, rgba(127,127,127,0.35))",
      "border-radius:12px",
      "background:var(--color-token-main-surface-primary, var(--color-background, #111))",
      "color:var(--color-token-text-primary, inherit)",
      "box-shadow:0 24px 80px rgba(0,0,0,0.45)"
    ].join(";");
    dialog.addEventListener("click", (e) => e.stopPropagation());
    overlay.appendChild(dialog);
    const chrome = document.createElement("div");
    chrome.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:12px",
      "min-height:52px",
      "padding:0 16px",
      "border-bottom:1px solid var(--color-token-border, rgba(127,127,127,0.22))"
    ].join(";");
    const title = document.createElement("div");
    title.textContent = "Codex++";
    title.style.cssText = "font:600 15px system-ui, sans-serif;letter-spacing:0;";
    chrome.appendChild(title);
    chrome.appendChild(standaloneChromeButton("Close", closeStandaloneSettingsPanel));
    dialog.appendChild(chrome);
    const body = document.createElement("div");
    body.style.cssText = "display:flex;min-height:0;flex:1;";
    dialog.appendChild(body);
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Codex++ Settings");
    nav.style.cssText = [
      "width:220px",
      "flex:0 0 220px",
      "overflow:auto",
      "padding:12px",
      "border-right:1px solid var(--color-token-border, rgba(127,127,127,0.22))"
    ].join(";");
    body.appendChild(nav);
    const panel = document.createElement("main");
    panel.dataset.codexpp = "standalone-panel";
    panel.style.cssText = "min-width:0;min-height:0;flex:1;overflow:hidden;";
    body.appendChild(panel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeStandaloneSettingsPanel();
    });
    standaloneKeyHandler = (e) => {
      if (e.key === "Escape") closeStandaloneSettingsPanel();
    };
    document.addEventListener("keydown", standaloneKeyHandler, true);
    document.body.appendChild(overlay);
    standaloneOverlay = overlay;
    standaloneNavRoot = nav;
    standalonePanel = panel;
  }
  setSettingsSurfaceVisible(true, "standalone-open");
  refreshStandaloneNav();
  activateStandalonePage(normalizeStandalonePage(page ?? state.activePage) ?? { kind: "tweaks" });
}
function closeStandaloneSettingsPanel() {
  const panel = standalonePanel;
  const active = state.activePage;
  if (active?.kind === "registered") {
    const entry = state.pages.get(active.id);
    try {
      entry?.teardown?.();
    } catch (e) {
      plog("standalone page teardown failed", { id: active.id, err: String(e) });
    }
    if (entry) entry.teardown = null;
  }
  standaloneOverlay?.remove();
  standaloneOverlay = null;
  standaloneNavRoot = null;
  standalonePanel = null;
  standaloneNavButtons = null;
  standalonePageButtons = /* @__PURE__ */ new Map();
  if (standaloneKeyHandler) {
    document.removeEventListener("keydown", standaloneKeyHandler, true);
    standaloneKeyHandler = null;
  }
  if (panel && state.panelHost === panel) {
    state.panelHost = null;
    state.activePage = null;
  }
  setSettingsSurfaceVisible(false, "standalone-closed");
}
function activateStandalonePage(page) {
  if (!standalonePanel?.isConnected) {
    openStandaloneSettingsPanel(page);
    return;
  }
  const normalized = normalizeStandalonePage(page) ?? { kind: "tweaks" };
  state.activePage = normalized;
  state.panelHost = standalonePanel;
  plog("standalone activate", { page: normalized });
  rerender();
  syncStandaloneNavActive();
}
function fallbackAfterRegisteredPageRemoved() {
  if (standalonePanel?.isConnected) {
    activateStandalonePage({ kind: "tweaks" });
  } else {
    restoreCodexView();
  }
}
function normalizeStandalonePage(page) {
  if (!page) return null;
  if (page.kind === "registered" && !state.pages.has(page.id)) return null;
  return page;
}
function refreshStandaloneNav() {
  const root = standaloneNavRoot;
  if (!root?.isConnected) return;
  root.textContent = "";
  standalonePageButtons = /* @__PURE__ */ new Map();
  const builtins = document.createElement("div");
  builtins.style.cssText = "display:flex;flex-direction:column;gap:3px;";
  builtins.appendChild(standaloneNavHeader("Codex++"));
  const configBtn = makeStandaloneNavButton("Config", configIconSvg(), () => {
    activateStandalonePage({ kind: "config" });
  });
  const tweaksBtn = makeStandaloneNavButton("Tweaks", tweaksIconSvg(), () => {
    activateStandalonePage({ kind: "tweaks" });
  });
  const storeBtn = makeStandaloneNavButton("Tweak Store", storeIconSvg(), () => {
    activateStandalonePage({ kind: "store" });
  });
  builtins.append(configBtn, tweaksBtn, storeBtn);
  root.appendChild(builtins);
  standaloneNavButtons = { config: configBtn, tweaks: tweaksBtn, store: storeBtn };
  const pages = [...state.pages.values()];
  if (pages.length > 0) {
    const pageGroup = document.createElement("div");
    pageGroup.style.cssText = "display:flex;flex-direction:column;gap:3px;margin-top:14px;";
    pageGroup.appendChild(standaloneNavHeader("Tweak Pages"));
    for (const p of pages) {
      const btn = makeStandaloneNavButton(
        p.page.title,
        p.page.iconSvg ?? defaultPageIconSvg(),
        () => activateStandalonePage({ kind: "registered", id: p.id })
      );
      standalonePageButtons.set(p.id, btn);
      pageGroup.appendChild(btn);
    }
    root.appendChild(pageGroup);
  }
  syncStandaloneNavActive();
}
function standaloneNavHeader(text) {
  const header = document.createElement("div");
  header.textContent = text;
  header.style.cssText = [
    "padding:6px 10px 4px",
    "font:600 11px system-ui, sans-serif",
    "letter-spacing:0",
    "text-transform:uppercase",
    "color:var(--color-token-text-secondary, rgba(127,127,127,0.9))"
  ].join(";");
  return header;
}
function makeStandaloneNavButton(label, iconSvg, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText = [
    "width:100%",
    "display:flex",
    "align-items:center",
    "gap:9px",
    "border:0",
    "border-radius:8px",
    "background:transparent",
    "color:var(--color-token-text-primary, inherit)",
    "padding:8px 10px",
    "text-align:left",
    "font:400 13px system-ui, sans-serif",
    "cursor:pointer",
    "letter-spacing:0"
  ].join(";");
  const icon = document.createElement("span");
  icon.style.cssText = "display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;flex:0 0 20px;";
  icon.innerHTML = iconSvg;
  btn.appendChild(icon);
  const text = document.createElement("span");
  text.textContent = label;
  text.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  btn.appendChild(text);
  btn.addEventListener("mouseenter", () => {
    if (btn.dataset.active !== "true") {
      btn.style.background = "var(--color-token-bg-fog, rgba(127,127,127,0.10))";
    }
  });
  btn.addEventListener("mouseleave", () => {
    if (btn.dataset.active !== "true") btn.style.background = "transparent";
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function standaloneChromeButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText = [
    "height:32px",
    "border-radius:8px",
    "border:1px solid var(--color-token-border, rgba(127,127,127,0.35))",
    "background:transparent",
    "color:var(--color-token-text-primary, inherit)",
    "padding:0 10px",
    "font:500 12px system-ui, sans-serif",
    "cursor:pointer",
    "letter-spacing:0"
  ].join(";");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}
function syncStandaloneNavActive() {
  const active = state.activePage;
  if (standaloneNavButtons) {
    setStandaloneButtonActive(standaloneNavButtons.config, active?.kind === "config");
    setStandaloneButtonActive(standaloneNavButtons.tweaks, active?.kind === "tweaks");
    setStandaloneButtonActive(standaloneNavButtons.store, active?.kind === "store");
  }
  for (const [id, btn] of standalonePageButtons) {
    setStandaloneButtonActive(
      btn,
      active?.kind === "registered" && active.id === id
    );
  }
}
function setStandaloneButtonActive(btn, active) {
  btn.dataset.active = active ? "true" : "false";
  btn.style.background = active ? "var(--color-token-bg-fog, rgba(127,127,127,0.16))" : "transparent";
  btn.style.fontWeight = active ? "600" : "400";
}
function activatePage(page) {
  const content = findContentArea();
  if (!content) {
    if (standalonePanel?.isConnected) {
      activateStandalonePage(page);
      return;
    }
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
  const title = ap.kind === "tweaks" ? "Tweaks" : ap.kind === "store" ? "Tweak Store" : "Config";
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
      void import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", true).then(() => refreshConfigCard(row)).catch((e) => plog("Codex++ release check failed", String(e))).finally(() => {
        row.style.opacity = "";
      });
    })
  );
  actions.appendChild(
    compactButton("Download Update", () => {
      row.style.opacity = "0.65";
      const buttons = actions.querySelectorAll("button");
      buttons.forEach((button2) => button2.disabled = true);
      void import_electron.ipcRenderer.invoke("codexpp:run-codexpp-update").then(() => refreshConfigCard(row)).catch((e) => {
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
    grid.textContent = "";
    grid.appendChild(storeMessageCard("Could not load tweak store", String(e)));
  }).finally(() => {
    if (refreshBtn) refreshBtn.disabled = false;
  });
}
function warmTweakStore() {
  if (state.tweakStore || state.tweakStorePromise) return;
  void getTweakStore();
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
  if (entry.installed && entry.installed.version === entry.manifest.version) {
    actions.appendChild(storeStatusPill("Installed"));
  } else if (entry.platform && !entry.platform.compatible) {
    card.classList.add("opacity-70");
    actions.appendChild(storeStatusPill(platformLockedLabel(entry.platform)));
  } else if (entry.runtime && !entry.runtime.compatible) {
    card.classList.add("opacity-70");
    actions.appendChild(storeStatusPill(runtimeLockedLabel(entry.runtime)));
  } else {
    const installLabel = entry.installed ? "Update" : "Install";
    const installButton = storeInstallButton(installLabel, (button2) => {
      const grid = card.closest("[data-codexpp-store-grid]");
      const source = grid?.parentElement?.querySelector("[data-codexpp-store-source]");
      showStoreButtonLoading(button2, entry.installed ? "Updating" : "Installing");
      actions.querySelectorAll("button").forEach((button3) => button3.disabled = true);
      void import_electron.ipcRenderer.invoke("codexpp:install-store-tweak", entry.id).then(() => {
        showStoreToast(`${entry.manifest.name} installed.`);
        showStoreButtonInstalled(button2);
        versions.replaceChildren(tweakStoreVersionBadge(entry, entry.manifest.version));
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
function storeStatusPill(label) {
  const pill = document.createElement("span");
  pill.className = "inline-flex h-8 items-center justify-center rounded-lg bg-token-foreground/5 px-3 text-sm font-medium text-token-description-foreground";
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
  const heading = document.createElement("div");
  heading.className = "electron:heading-lg heading-base truncate";
  heading.textContent = title;
  headerInner.appendChild(heading);
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
  return { outer, sectionsWrap, subtitle: subtitleElement, headerActions };
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
  const links = Array.from(
    document.querySelectorAll("a[href*='/settings/']")
  );
  if (links.length >= 2) {
    let node = links[0].parentElement;
    while (node) {
      const inside = node.querySelectorAll("a[href*='/settings/']");
      if (inside.length >= Math.max(2, links.length - 1) && isSettingsSidebarCandidate(node)) return node;
      node = node.parentElement;
    }
  }
  const KNOWN = [
    "General",
    "Appearance",
    "Configuration",
    "Personalization",
    "MCP servers",
    "MCP Servers",
    "Git",
    "Environments"
  ];
  const matches = [];
  const all = document.querySelectorAll(
    "button, a, [role='button'], li, div"
  );
  for (const el of Array.from(all)) {
    if (isForbiddenSettingsSidebarSurface(el)) continue;
    const t = (el.textContent ?? "").trim();
    if (t.length > 30) continue;
    if (KNOWN.some((k) => t === k)) matches.push(el);
    if (matches.length > 50) break;
  }
  if (matches.length >= 2) {
    let node = matches[0].parentElement;
    while (node) {
      let count = 0;
      for (const m of matches) if (node.contains(m)) count++;
      if (count >= Math.min(3, matches.length) && isSettingsSidebarCandidate(node)) return node;
      node = node.parentElement;
    }
  }
  return null;
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
function isSettingsSidebarCandidate(node) {
  if (isForbiddenSettingsSidebarSurface(node)) return false;
  const root = node.parentElement ?? node;
  if (isForbiddenSettingsSidebarSurface(root)) return false;
  if (root.querySelector("a[href*='/settings/']")) return true;
  const text = compactSettingsText(root.textContent ?? "");
  return text.includes("Back to app") && text.includes("General") && text.includes("Appearance");
}
function removeMisplacedSettingsGroups() {
  const groups = document.querySelectorAll(
    "[data-codexpp='nav-group'], [data-codexpp='pages-group'], [data-codexpp='native-nav-header']"
  );
  for (const group of Array.from(groups)) {
    if (!isForbiddenSettingsSidebarSurface(group)) continue;
    if (state.navGroup === group) state.navGroup = null;
    if (state.pagesGroup === group) {
      state.pagesGroup = null;
      state.pagesGroupKey = null;
    }
    if (state.nativeNavHeader === group) state.nativeNavHeader = null;
    group.remove();
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
    fs: rendererFs(id, paths)
  };
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
var standaloneSettingsEnabled = false;
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
    const config = await import_electron4.ipcRenderer.invoke("codexpp:get-config").catch(() => null);
    standaloneSettingsEnabled = config?.settingsInjector === false;
    if (standaloneSettingsEnabled) {
      fileLog("settings injector disabled by config");
    } else {
      startSettingsInjector();
      fileLog("settings injector started");
    }
    await startTweakHost();
    fileLog("tweak host started");
    await mountManager();
    fileLog("manager mounted");
    if (standaloneSettingsEnabled) {
      mountFloatingSettingsLauncher();
      fileLog("standalone settings launcher mounted");
    }
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
        if (standaloneSettingsEnabled) mountFloatingSettingsLauncher();
      } catch (e) {
        console.error("[codex-plusplus] hot reload failed:", e);
      } finally {
        reloading = null;
      }
    })();
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvdHdlYWstc3RvcmUudHMiLCAiLi4vc3JjL3ByZWxvYWQvdHdlYWstaG9zdC50cyIsICIuLi9zcmMvcHJlbG9hZC9tYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcclxuICogUmVuZGVyZXIgcHJlbG9hZCBlbnRyeS4gUnVucyBpbiBhbiBpc29sYXRlZCB3b3JsZCBiZWZvcmUgQ29kZXgncyBwYWdlIEpTLlxyXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxyXG4gKiAgIDEuIEluc3RhbGwgYSBSZWFjdCBEZXZUb29scy1zaGFwZWQgZ2xvYmFsIGhvb2sgdG8gY2FwdHVyZSB0aGUgcmVuZGVyZXJcclxuICogICAgICByZWZlcmVuY2Ugd2hlbiBSZWFjdCBtb3VudHMuIFdlIHVzZSB0aGlzIGZvciBmaWJlciB3YWxraW5nLlxyXG4gKiAgIDIuIEFmdGVyIERPTUNvbnRlbnRMb2FkZWQsIGtpY2sgb2ZmIHNldHRpbmdzLWluamVjdGlvbiBsb2dpYy5cclxuICogICAzLiBEaXNjb3ZlciByZW5kZXJlci1zY29wZWQgdHdlYWtzICh2aWEgSVBDIHRvIG1haW4pIGFuZCBzdGFydCB0aGVtLlxyXG4gKiAgIDQuIExpc3RlbiBmb3IgYGNvZGV4cHA6dHdlYWtzLWNoYW5nZWRgIGZyb20gbWFpbiAoZmlsZXN5c3RlbSB3YXRjaGVyKSBhbmRcclxuICogICAgICBob3QtcmVsb2FkIHR3ZWFrcyB3aXRob3V0IGRyb3BwaW5nIHRoZSBwYWdlLlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgeyBpbnN0YWxsUmVhY3RIb29rIH0gZnJvbSBcIi4vcmVhY3QtaG9va1wiO1xuaW1wb3J0IHtcbiAgbW91bnRGbG9hdGluZ1NldHRpbmdzTGF1bmNoZXIsXG4gIHN0YXJ0U2V0dGluZ3NJbmplY3Rvcixcbn0gZnJvbSBcIi4vc2V0dGluZ3MtaW5qZWN0b3JcIjtcbmltcG9ydCB7IHN0YXJ0VHdlYWtIb3N0LCB0ZWFyZG93blR3ZWFrSG9zdCB9IGZyb20gXCIuL3R3ZWFrLWhvc3RcIjtcbmltcG9ydCB7IG1vdW50TWFuYWdlciB9IGZyb20gXCIuL21hbmFnZXJcIjtcblxyXG4vLyBGaWxlLWxvZyBwcmVsb2FkIHByb2dyZXNzIHNvIHdlIGNhbiBkaWFnbm9zZSB3aXRob3V0IERldlRvb2xzLiBCZXN0LWVmZm9ydDpcclxuLy8gZmFpbHVyZXMgaGVyZSBtdXN0IG5ldmVyIHRocm93IGJlY2F1c2Ugd2UnZCB0YWtlIHRoZSBwYWdlIGRvd24gd2l0aCB1cy5cclxuLy9cclxuLy8gQ29kZXgncyByZW5kZXJlciBpcyBzYW5kYm94ZWQgKHNhbmRib3g6IHRydWUpLCBzbyBgcmVxdWlyZShcIm5vZGU6ZnNcIilgIGlzXHJcbi8vIHVuYXZhaWxhYmxlLiBXZSBmb3J3YXJkIGxvZyBsaW5lcyB0byBtYWluIHZpYSBJUEM7IG1haW4gd3JpdGVzIHRoZSBmaWxlLlxyXG5mdW5jdGlvbiBmaWxlTG9nKHN0YWdlOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xyXG4gIGNvbnN0IG1zZyA9IGBbY29kZXgtcGx1c3BsdXMgcHJlbG9hZF0gJHtzdGFnZX0ke1xyXG4gICAgZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpXHJcbiAgfWA7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcclxuICB9IGNhdGNoIHt9XHJcbiAgdHJ5IHtcclxuICAgIGlwY1JlbmRlcmVyLnNlbmQoXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsIFwiaW5mb1wiLCBtc2cpO1xyXG4gIH0gY2F0Y2gge31cclxufVxyXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogSlNPTi5zdHJpbmdpZnkodik7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHYpO1xyXG4gIH1cclxufVxyXG5cclxuZmlsZUxvZyhcInByZWxvYWQgZW50cnlcIiwgeyB1cmw6IGxvY2F0aW9uLmhyZWYgfSk7XG5cbmxldCBzdGFuZGFsb25lU2V0dGluZ3NFbmFibGVkID0gZmFsc2U7XG5cclxuLy8gUmVhY3QgaG9vayBtdXN0IGJlIGluc3RhbGxlZCAqYmVmb3JlKiBDb2RleCdzIGJ1bmRsZSBydW5zLlxyXG50cnkge1xyXG4gIGluc3RhbGxSZWFjdEhvb2soKTtcclxuICBmaWxlTG9nKFwicmVhY3QgaG9vayBpbnN0YWxsZWRcIik7XHJcbn0gY2F0Y2ggKGUpIHtcclxuICBmaWxlTG9nKFwicmVhY3QgaG9vayBGQUlMRURcIiwgU3RyaW5nKGUpKTtcclxufVxyXG5cclxucXVldWVNaWNyb3Rhc2soKCkgPT4ge1xyXG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSBcImxvYWRpbmdcIikge1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgYm9vdCwgeyBvbmNlOiB0cnVlIH0pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBib290KCk7XHJcbiAgfVxyXG59KTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGJvb3QoKSB7XG4gIGZpbGVMb2coXCJib290IHN0YXJ0XCIsIHsgcmVhZHlTdGF0ZTogZG9jdW1lbnQucmVhZHlTdGF0ZSB9KTtcbiAgdHJ5IHtcbiAgICBjb25zdCBjb25maWcgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmdldC1jb25maWdcIikuY2F0Y2goKCkgPT4gbnVsbCkgYXNcbiAgICAgIHwgeyBzZXR0aW5nc0luamVjdG9yPzogYm9vbGVhbiB9XG4gICAgICB8IG51bGw7XG4gICAgc3RhbmRhbG9uZVNldHRpbmdzRW5hYmxlZCA9IGNvbmZpZz8uc2V0dGluZ3NJbmplY3RvciA9PT0gZmFsc2U7XG4gICAgaWYgKHN0YW5kYWxvbmVTZXR0aW5nc0VuYWJsZWQpIHtcbiAgICAgIGZpbGVMb2coXCJzZXR0aW5ncyBpbmplY3RvciBkaXNhYmxlZCBieSBjb25maWdcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXJ0U2V0dGluZ3NJbmplY3RvcigpO1xuICAgICAgZmlsZUxvZyhcInNldHRpbmdzIGluamVjdG9yIHN0YXJ0ZWRcIik7XG4gICAgfVxuICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgZmlsZUxvZyhcInR3ZWFrIGhvc3Qgc3RhcnRlZFwiKTtcbiAgICBhd2FpdCBtb3VudE1hbmFnZXIoKTtcbiAgICBmaWxlTG9nKFwibWFuYWdlciBtb3VudGVkXCIpO1xuICAgIGlmIChzdGFuZGFsb25lU2V0dGluZ3NFbmFibGVkKSB7XG4gICAgICBtb3VudEZsb2F0aW5nU2V0dGluZ3NMYXVuY2hlcigpO1xuICAgICAgZmlsZUxvZyhcInN0YW5kYWxvbmUgc2V0dGluZ3MgbGF1bmNoZXIgbW91bnRlZFwiKTtcbiAgICB9XG4gICAgc3Vic2NyaWJlUmVsb2FkKCk7XG4gICAgZmlsZUxvZyhcImJvb3QgY29tcGxldGVcIik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBmaWxlTG9nKFwiYm9vdCBGQUlMRURcIiwgU3RyaW5nKChlIGFzIEVycm9yKT8uc3RhY2sgPz8gZSkpO1xyXG4gICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gcHJlbG9hZCBib290IGZhaWxlZDpcIiwgZSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBIb3QgcmVsb2FkOiBnYXRlZCBiZWhpbmQgYSBzbWFsbCBpbi1mbGlnaHQgbG9jayBzbyBhIGZsdXJyeSBvZiBmcyBldmVudHNcclxuLy8gZG9lc24ndCByZWVudHJhbnRseSB0ZWFyIGRvd24gdGhlIGhvc3QgbWlkLWxvYWQuXHJcbmxldCByZWxvYWRpbmc6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcclxuZnVuY3Rpb24gc3Vic2NyaWJlUmVsb2FkKCk6IHZvaWQge1xyXG4gIGlwY1JlbmRlcmVyLm9uKFwiY29kZXhwcDp0d2Vha3MtY2hhbmdlZFwiLCAoKSA9PiB7XHJcbiAgICBpZiAocmVsb2FkaW5nKSByZXR1cm47XHJcbiAgICByZWxvYWRpbmcgPSAoYXN5bmMgKCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUuaW5mbyhcIltjb2RleC1wbHVzcGx1c10gaG90LXJlbG9hZGluZyB0d2Vha3NcIik7XG4gICAgICAgIHRlYXJkb3duVHdlYWtIb3N0KCk7XG4gICAgICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgICAgIGF3YWl0IG1vdW50TWFuYWdlcigpO1xuICAgICAgICBpZiAoc3RhbmRhbG9uZVNldHRpbmdzRW5hYmxlZCkgbW91bnRGbG9hdGluZ1NldHRpbmdzTGF1bmNoZXIoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gaG90IHJlbG9hZCBmYWlsZWQ6XCIsIGUpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgcmVsb2FkaW5nID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfSkoKTtcclxuICB9KTtcclxufVxyXG4iLCAiLyoqXHJcbiAqIEluc3RhbGwgYSBtaW5pbWFsIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXy4gUmVhY3QgY2FsbHNcclxuICogYGhvb2suaW5qZWN0KHJlbmRlcmVySW50ZXJuYWxzKWAgZHVyaW5nIGBjcmVhdGVSb290YC9gaHlkcmF0ZVJvb3RgLiBUaGVcclxuICogXCJpbnRlcm5hbHNcIiBvYmplY3QgZXhwb3NlcyBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZSwgd2hpY2ggbGV0cyB1cyB0dXJuIGFcclxuICogRE9NIG5vZGUgaW50byBhIFJlYWN0IGZpYmVyIFx1MjAxNCBuZWNlc3NhcnkgZm9yIG91ciBTZXR0aW5ncyBpbmplY3Rvci5cclxuICpcclxuICogV2UgZG9uJ3Qgd2FudCB0byBicmVhayByZWFsIFJlYWN0IERldlRvb2xzIGlmIHRoZSB1c2VyIG9wZW5zIGl0OyB3ZSBpbnN0YWxsXHJcbiAqIG9ubHkgaWYgbm8gaG9vayBleGlzdHMgeWV0LCBhbmQgd2UgZm9yd2FyZCBjYWxscyB0byBhIGRvd25zdHJlYW0gaG9vayBpZlxyXG4gKiBvbmUgaXMgbGF0ZXIgYXNzaWduZWQuXHJcbiAqL1xyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICBfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18/OiBSZWFjdERldnRvb2xzSG9vaztcclxuICAgIF9fY29kZXhwcF9fPzoge1xyXG4gICAgICBob29rOiBSZWFjdERldnRvb2xzSG9vaztcclxuICAgICAgcmVuZGVyZXJzOiBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz47XHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuaW50ZXJmYWNlIFJlbmRlcmVySW50ZXJuYWxzIHtcclxuICBmaW5kRmliZXJCeUhvc3RJbnN0YW5jZT86IChuOiBOb2RlKSA9PiB1bmtub3duO1xyXG4gIHZlcnNpb24/OiBzdHJpbmc7XHJcbiAgYnVuZGxlVHlwZT86IG51bWJlcjtcclxuICByZW5kZXJlclBhY2thZ2VOYW1lPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUmVhY3REZXZ0b29sc0hvb2sge1xyXG4gIHN1cHBvcnRzRmliZXI6IHRydWU7XHJcbiAgcmVuZGVyZXJzOiBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz47XHJcbiAgb24oZXZlbnQ6IHN0cmluZywgZm46ICguLi5hOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xyXG4gIG9mZihldmVudDogc3RyaW5nLCBmbjogKC4uLmE6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XHJcbiAgZW1pdChldmVudDogc3RyaW5nLCAuLi5hOiB1bmtub3duW10pOiB2b2lkO1xyXG4gIGluamVjdChyZW5kZXJlcjogUmVuZGVyZXJJbnRlcm5hbHMpOiBudW1iZXI7XHJcbiAgb25TY2hlZHVsZUZpYmVyUm9vdD8oKTogdm9pZDtcclxuICBvbkNvbW1pdEZpYmVyUm9vdD8oKTogdm9pZDtcclxuICBvbkNvbW1pdEZpYmVyVW5tb3VudD8oKTogdm9pZDtcclxuICBjaGVja0RDRT8oKTogdm9pZDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxSZWFjdEhvb2soKTogdm9pZCB7XHJcbiAgaWYgKHdpbmRvdy5fX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX18pIHJldHVybjtcclxuICBjb25zdCByZW5kZXJlcnMgPSBuZXcgTWFwPG51bWJlciwgUmVuZGVyZXJJbnRlcm5hbHM+KCk7XHJcbiAgbGV0IG5leHRJZCA9IDE7XHJcbiAgY29uc3QgbGlzdGVuZXJzID0gbmV3IE1hcDxzdHJpbmcsIFNldDwoLi4uYTogdW5rbm93bltdKSA9PiB2b2lkPj4oKTtcclxuXHJcbiAgY29uc3QgaG9vazogUmVhY3REZXZ0b29sc0hvb2sgPSB7XHJcbiAgICBzdXBwb3J0c0ZpYmVyOiB0cnVlLFxyXG4gICAgcmVuZGVyZXJzLFxyXG4gICAgaW5qZWN0KHJlbmRlcmVyKSB7XHJcbiAgICAgIGNvbnN0IGlkID0gbmV4dElkKys7XHJcbiAgICAgIHJlbmRlcmVycy5zZXQoaWQsIHJlbmRlcmVyKTtcclxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgY29uc29sZS5kZWJ1ZyhcclxuICAgICAgICBcIltjb2RleC1wbHVzcGx1c10gUmVhY3QgcmVuZGVyZXIgYXR0YWNoZWQ6XCIsXHJcbiAgICAgICAgcmVuZGVyZXIucmVuZGVyZXJQYWNrYWdlTmFtZSxcclxuICAgICAgICByZW5kZXJlci52ZXJzaW9uLFxyXG4gICAgICApO1xyXG4gICAgICByZXR1cm4gaWQ7XHJcbiAgICB9LFxyXG4gICAgb24oZXZlbnQsIGZuKSB7XHJcbiAgICAgIGxldCBzID0gbGlzdGVuZXJzLmdldChldmVudCk7XHJcbiAgICAgIGlmICghcykgbGlzdGVuZXJzLnNldChldmVudCwgKHMgPSBuZXcgU2V0KCkpKTtcclxuICAgICAgcy5hZGQoZm4pO1xyXG4gICAgfSxcclxuICAgIG9mZihldmVudCwgZm4pIHtcclxuICAgICAgbGlzdGVuZXJzLmdldChldmVudCk/LmRlbGV0ZShmbik7XHJcbiAgICB9LFxyXG4gICAgZW1pdChldmVudCwgLi4uYXJncykge1xyXG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZm9yRWFjaCgoZm4pID0+IGZuKC4uLmFyZ3MpKTtcclxuICAgIH0sXHJcbiAgICBvbkNvbW1pdEZpYmVyUm9vdCgpIHt9LFxyXG4gICAgb25Db21taXRGaWJlclVubW91bnQoKSB7fSxcclxuICAgIG9uU2NoZWR1bGVGaWJlclJvb3QoKSB7fSxcclxuICAgIGNoZWNrRENFKCkge30sXHJcbiAgfTtcclxuXHJcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHdpbmRvdywgXCJfX1JFQUNUX0RFVlRPT0xTX0dMT0JBTF9IT09LX19cIiwge1xyXG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxyXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXHJcbiAgICB3cml0YWJsZTogdHJ1ZSwgLy8gYWxsb3cgcmVhbCBEZXZUb29scyB0byBvdmVyd3JpdGUgaWYgdXNlciBpbnN0YWxscyBpdFxyXG4gICAgdmFsdWU6IGhvb2ssXHJcbiAgfSk7XHJcblxyXG4gIHdpbmRvdy5fX2NvZGV4cHBfXyA9IHsgaG9vaywgcmVuZGVyZXJzIH07XHJcbn1cclxuXHJcbi8qKiBSZXNvbHZlIHRoZSBSZWFjdCBmaWJlciBmb3IgYSBET00gbm9kZSwgaWYgYW55IHJlbmRlcmVyIGhhcyBvbmUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBmaWJlckZvck5vZGUobm9kZTogTm9kZSk6IHVua25vd24gfCBudWxsIHtcclxuICBjb25zdCByZW5kZXJlcnMgPSB3aW5kb3cuX19jb2RleHBwX18/LnJlbmRlcmVycztcclxuICBpZiAocmVuZGVyZXJzKSB7XHJcbiAgICBmb3IgKGNvbnN0IHIgb2YgcmVuZGVyZXJzLnZhbHVlcygpKSB7XHJcbiAgICAgIGNvbnN0IGYgPSByLmZpbmRGaWJlckJ5SG9zdEluc3RhbmNlPy4obm9kZSk7XHJcbiAgICAgIGlmIChmKSByZXR1cm4gZjtcclxuICAgIH1cclxuICB9XHJcbiAgLy8gRmFsbGJhY2s6IHJlYWQgdGhlIFJlYWN0IGludGVybmFsIHByb3BlcnR5IGRpcmVjdGx5IGZyb20gdGhlIERPTSBub2RlLlxyXG4gIC8vIFJlYWN0IHN0b3JlcyBmaWJlcnMgYXMgYSBwcm9wZXJ0eSB3aG9zZSBrZXkgc3RhcnRzIHdpdGggXCJfX3JlYWN0RmliZXJcIi5cclxuICBmb3IgKGNvbnN0IGsgb2YgT2JqZWN0LmtleXMobm9kZSkpIHtcclxuICAgIGlmIChrLnN0YXJ0c1dpdGgoXCJfX3JlYWN0RmliZXJcIikpIHJldHVybiAobm9kZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrXTtcclxuICB9XHJcbiAgcmV0dXJuIG51bGw7XHJcbn1cclxuIiwgIi8qKlxyXG4gKiBTZXR0aW5ncyBpbmplY3RvciBmb3IgQ29kZXgncyBTZXR0aW5ncyBwYWdlLlxyXG4gKlxyXG4gKiBDb2RleCdzIHNldHRpbmdzIGlzIGEgcm91dGVkIHBhZ2UgKFVSTCBzdGF5cyBhdCBgL2luZGV4Lmh0bWw/aG9zdElkPWxvY2FsYClcclxuICogTk9UIGEgbW9kYWwgZGlhbG9nLiBUaGUgc2lkZWJhciBsaXZlcyBpbnNpZGUgYSBgPGRpdiBjbGFzcz1cImZsZXggZmxleC1jb2xcclxuICogZ2FwLTEgZ2FwLTBcIj5gIHdyYXBwZXIgdGhhdCBob2xkcyBvbmUgb3IgbW9yZSBgPGRpdiBjbGFzcz1cImZsZXggZmxleC1jb2xcclxuICogZ2FwLXB4XCI+YCBncm91cHMgb2YgYnV0dG9ucy4gVGhlcmUgYXJlIG5vIHN0YWJsZSBgcm9sZWAgLyBgYXJpYS1sYWJlbGAgL1xyXG4gKiBgZGF0YS10ZXN0aWRgIGhvb2tzIG9uIHRoZSBzaGVsbCBzbyB3ZSBpZGVudGlmeSB0aGUgc2lkZWJhciBieSB0ZXh0LWNvbnRlbnRcclxuICogbWF0Y2ggYWdhaW5zdCBrbm93biBpdGVtIGxhYmVscyAoR2VuZXJhbCwgQXBwZWFyYW5jZSwgQ29uZmlndXJhdGlvbiwgXHUyMDI2KS5cclxuICpcclxuICogTGF5b3V0IHdlIGluamVjdDpcclxuICpcclxuICogICBHRU5FUkFMICAgICAgICAgICAgICAgICAgICAgICAodXBwZXJjYXNlIGdyb3VwIGxhYmVsKVxyXG4gKiAgIFtDb2RleCdzIGV4aXN0aW5nIGl0ZW1zIGdyb3VwXVxyXG4gKiAgIENPREVYKysgICAgICAgICAgICAgICAgICAgICAgICh1cHBlcmNhc2UgZ3JvdXAgbGFiZWwpXHJcbiAqICAgXHUyNEQ4IENvbmZpZ1xyXG4gKiAgIFx1MjYzMCBUd2Vha3NcclxuICogICBcdTI1QzcgVHdlYWsgU3RvcmVcclxuICpcclxuICogQ2xpY2tpbmcgQ29uZmlnIC8gVHdlYWtzIC8gVHdlYWsgU3RvcmUgaGlkZXMgQ29kZXgncyBjb250ZW50IHBhbmVsIGNoaWxkcmVuIGFuZCByZW5kZXJzXHJcbiAqIG91ciBvd24gYG1haW4tc3VyZmFjZWAgcGFuZWwgaW4gdGhlaXIgcGxhY2UuIENsaWNraW5nIGFueSBvZiBDb2RleCdzXHJcbiAqIHNpZGViYXIgaXRlbXMgcmVzdG9yZXMgdGhlIG9yaWdpbmFsIHZpZXcuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIFNldHRpbmdzU2VjdGlvbixcclxuICBTZXR0aW5nc1BhZ2UsXHJcbiAgU2V0dGluZ3NIYW5kbGUsXHJcbiAgVHdlYWtNYW5pZmVzdCxcclxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xyXG5pbXBvcnQge1xyXG4gIGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwsXHJcbiAgdHlwZSBUd2Vha1N0b3JlRW50cnksXHJcbiAgdHlwZSBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb24sXHJcbn0gZnJvbSBcIi4uL3R3ZWFrLXN0b3JlXCI7XHJcblxyXG4vLyBNaXJyb3JzIHRoZSBydW50aW1lJ3MgbWFpbi1zaWRlIExpc3RlZFR3ZWFrIHNoYXBlIChrZXB0IGluIHN5bmMgbWFudWFsbHkpLlxyXG5pbnRlcmZhY2UgTGlzdGVkVHdlYWsge1xyXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xyXG4gIGVudHJ5OiBzdHJpbmc7XHJcbiAgZGlyOiBzdHJpbmc7XHJcbiAgZW50cnlFeGlzdHM6IGJvb2xlYW47XHJcbiAgZW5hYmxlZDogYm9vbGVhbjtcclxuICB1cGRhdGU6IFR3ZWFrVXBkYXRlQ2hlY2sgfCBudWxsO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVHdlYWtVcGRhdGVDaGVjayB7XHJcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XHJcbiAgcmVwbzogc3RyaW5nO1xyXG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XHJcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcclxuICBsYXRlc3RUYWc6IHN0cmluZyB8IG51bGw7XHJcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcclxuICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XHJcbiAgZXJyb3I/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2RleFBsdXNQbHVzQ29uZmlnIHtcclxuICB2ZXJzaW9uOiBzdHJpbmc7XHJcbiAgYXV0b1VwZGF0ZTogYm9vbGVhbjtcclxuICB1cGRhdGVDaGFubmVsOiBTZWxmVXBkYXRlQ2hhbm5lbDtcclxuICB1cGRhdGVSZXBvOiBzdHJpbmc7XHJcbiAgdXBkYXRlUmVmOiBzdHJpbmc7XHJcbiAgdXBkYXRlQ2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB8IG51bGw7XHJcbiAgc2VsZlVwZGF0ZTogU2VsZlVwZGF0ZVN0YXRlIHwgbnVsbDtcclxuICBpbnN0YWxsYXRpb25Tb3VyY2U6IEluc3RhbGxhdGlvblNvdXJjZTtcclxufVxyXG5cclxuaW50ZXJmYWNlIENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB7XHJcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XHJcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcclxuICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xyXG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XHJcbiAgcmVsZWFzZU5vdGVzOiBzdHJpbmcgfCBudWxsO1xyXG4gIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcclxuICBlcnJvcj86IHN0cmluZztcclxufVxyXG5cclxudHlwZSBTZWxmVXBkYXRlQ2hhbm5lbCA9IFwic3RhYmxlXCIgfCBcInByZXJlbGVhc2VcIiB8IFwiY3VzdG9tXCI7XHJcbnR5cGUgU2VsZlVwZGF0ZVN0YXR1cyA9IFwiY2hlY2tpbmdcIiB8IFwidXAtdG8tZGF0ZVwiIHwgXCJ1cGRhdGVkXCIgfCBcImZhaWxlZFwiIHwgXCJkaXNhYmxlZFwiO1xyXG5cclxuaW50ZXJmYWNlIFNlbGZVcGRhdGVTdGF0ZSB7XHJcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XHJcbiAgY29tcGxldGVkQXQ/OiBzdHJpbmc7XHJcbiAgc3RhdHVzOiBTZWxmVXBkYXRlU3RhdHVzO1xyXG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XHJcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcclxuICB0YXJnZXRSZWY6IHN0cmluZyB8IG51bGw7XHJcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcclxuICByZXBvOiBzdHJpbmc7XHJcbiAgY2hhbm5lbDogU2VsZlVwZGF0ZUNoYW5uZWw7XHJcbiAgc291cmNlUm9vdDogc3RyaW5nO1xyXG4gIGluc3RhbGxhdGlvblNvdXJjZT86IEluc3RhbGxhdGlvblNvdXJjZTtcclxuICBlcnJvcj86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEluc3RhbGxhdGlvblNvdXJjZSB7XHJcbiAga2luZDogXCJnaXRodWItc291cmNlXCIgfCBcImhvbWVicmV3XCIgfCBcImxvY2FsLWRldlwiIHwgXCJzb3VyY2UtYXJjaGl2ZVwiIHwgXCJ1bmtub3duXCI7XHJcbiAgbGFiZWw6IHN0cmluZztcclxuICBkZXRhaWw6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFdhdGNoZXJIZWFsdGgge1xyXG4gIGNoZWNrZWRBdDogc3RyaW5nO1xyXG4gIHN0YXR1czogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCI7XHJcbiAgdGl0bGU6IHN0cmluZztcclxuICBzdW1tYXJ5OiBzdHJpbmc7XHJcbiAgd2F0Y2hlcjogc3RyaW5nO1xyXG4gIGNoZWNrczogV2F0Y2hlckhlYWx0aENoZWNrW107XHJcbn1cclxuXHJcbmludGVyZmFjZSBXYXRjaGVySGVhbHRoQ2hlY2sge1xyXG4gIG5hbWU6IHN0cmluZztcclxuICBzdGF0dXM6IFwib2tcIiB8IFwid2FyblwiIHwgXCJlcnJvclwiO1xyXG4gIGRldGFpbDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldyB7XHJcbiAgc2NoZW1hVmVyc2lvbjogMTtcclxuICBnZW5lcmF0ZWRBdD86IHN0cmluZztcclxuICBzb3VyY2VVcmw6IHN0cmluZztcclxuICBmZXRjaGVkQXQ6IHN0cmluZztcclxuICBlbnRyaWVzOiBUd2Vha1N0b3JlRW50cnlWaWV3W107XHJcbn1cclxuXHJcbmludGVyZmFjZSBUd2Vha1N0b3JlRW50cnlWaWV3IGV4dGVuZHMgVHdlYWtTdG9yZUVudHJ5IHtcclxuICBpbnN0YWxsZWQ6IHtcclxuICAgIHZlcnNpb246IHN0cmluZztcclxuICAgIGVuYWJsZWQ6IGJvb2xlYW47XHJcbiAgfSB8IG51bGw7XHJcbiAgcGxhdGZvcm0/OiB7XHJcbiAgICBjdXJyZW50OiBzdHJpbmc7XHJcbiAgICBzdXBwb3J0ZWQ6IHN0cmluZ1tdIHwgbnVsbDtcclxuICAgIGNvbXBhdGlibGU6IGJvb2xlYW47XHJcbiAgICByZWFzb246IHN0cmluZyB8IG51bGw7XHJcbiAgfTtcclxuICBydW50aW1lPzoge1xyXG4gICAgY3VycmVudDogc3RyaW5nO1xyXG4gICAgcmVxdWlyZWQ6IHN0cmluZyB8IG51bGw7XHJcbiAgICBjb21wYXRpYmxlOiBib29sZWFuO1xyXG4gICAgcmVhc29uOiBzdHJpbmcgfCBudWxsO1xyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHR3ZWFrLXJlZ2lzdGVyZWQgcGFnZS4gV2UgY2FycnkgdGhlIG93bmluZyB0d2VhaydzIG1hbmlmZXN0IHNvIHdlIGNhblxyXG4gKiByZXNvbHZlIHJlbGF0aXZlIGljb25VcmxzIGFuZCBzaG93IGF1dGhvcnNoaXAgaW4gdGhlIHBhZ2UgaGVhZGVyLlxyXG4gKi9cclxuaW50ZXJmYWNlIFJlZ2lzdGVyZWRQYWdlIHtcclxuICAvKiogRnVsbHktcXVhbGlmaWVkIGlkOiBgPHR3ZWFrSWQ+OjxwYWdlSWQ+YC4gKi9cclxuICBpZDogc3RyaW5nO1xyXG4gIHR3ZWFrSWQ6IHN0cmluZztcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICBwYWdlOiBTZXR0aW5nc1BhZ2U7XHJcbiAgLyoqIFBlci1wYWdlIERPTSB0ZWFyZG93biByZXR1cm5lZCBieSBgcGFnZS5yZW5kZXJgLCBpZiBhbnkuICovXHJcbiAgdGVhcmRvd24/OiAoKCkgPT4gdm9pZCkgfCBudWxsO1xyXG4gIC8qKiBUaGUgaW5qZWN0ZWQgc2lkZWJhciBidXR0b24gKHNvIHdlIGNhbiB1cGRhdGUgaXRzIGFjdGl2ZSBzdGF0ZSkuICovXHJcbiAgbmF2QnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xyXG59XHJcblxyXG4vKiogV2hhdCBwYWdlIGlzIGN1cnJlbnRseSBzZWxlY3RlZCBpbiBvdXIgaW5qZWN0ZWQgbmF2LiAqL1xyXG50eXBlIEFjdGl2ZVBhZ2UgPVxyXG4gIHwgeyBraW5kOiBcImNvbmZpZ1wiIH1cclxuICB8IHsga2luZDogXCJzdG9yZVwiIH1cclxuICB8IHsga2luZDogXCJ0d2Vha3NcIiB9XHJcbiAgfCB7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiOyBpZDogc3RyaW5nIH07XHJcblxyXG5pbnRlcmZhY2UgSW5qZWN0b3JTdGF0ZSB7XHJcbiAgc2VjdGlvbnM6IE1hcDxzdHJpbmcsIFNldHRpbmdzU2VjdGlvbj47XHJcbiAgcGFnZXM6IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRQYWdlPjtcclxuICBsaXN0ZWRUd2Vha3M6IExpc3RlZFR3ZWFrW107XHJcbiAgLyoqIE91dGVyIHdyYXBwZXIgdGhhdCBob2xkcyBDb2RleCdzIGl0ZW1zIGdyb3VwICsgb3VyIGluamVjdGVkIGdyb3Vwcy4gKi9cclxuICBvdXRlcldyYXBwZXI6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAvKiogT3VyIFwiR2VuZXJhbFwiIGxhYmVsIGZvciBDb2RleCdzIG5hdGl2ZSBzZXR0aW5ncyBncm91cC4gKi9cclxuICBuYXRpdmVOYXZIZWFkZXI6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAvKiogT3VyIFwiQ29kZXgrK1wiIG5hdiBncm91cCAoQ29uZmlnL1R3ZWFrcykuICovXHJcbiAgbmF2R3JvdXA6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICBuYXZCdXR0b25zOiB7IGNvbmZpZzogSFRNTEJ1dHRvbkVsZW1lbnQ7IHR3ZWFrczogSFRNTEJ1dHRvbkVsZW1lbnQ7IHN0b3JlOiBIVE1MQnV0dG9uRWxlbWVudCB9IHwgbnVsbDtcclxuICAvKiogT3VyIFwiVHdlYWtzXCIgbmF2IGdyb3VwIChwZXItdHdlYWsgcGFnZXMpLiBDcmVhdGVkIGxhemlseS4gKi9cclxuICBwYWdlc0dyb3VwOiBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgcGFnZXNHcm91cEtleTogc3RyaW5nIHwgbnVsbDtcclxuICBwYW5lbEhvc3Q6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGw7XHJcbiAgZmluZ2VycHJpbnQ6IHN0cmluZyB8IG51bGw7XHJcbiAgc2lkZWJhckR1bXBlZDogYm9vbGVhbjtcclxuICBhY3RpdmVQYWdlOiBBY3RpdmVQYWdlIHwgbnVsbDtcclxuICBzaWRlYmFyUm9vdDogSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIHNpZGViYXJSZXN0b3JlSGFuZGxlcjogKChlOiBFdmVudCkgPT4gdm9pZCkgfCBudWxsO1xyXG4gIHNldHRpbmdzU3VyZmFjZVZpc2libGU6IGJvb2xlYW47XHJcbiAgc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGw7XHJcbiAgdHdlYWtTdG9yZTogVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldyB8IG51bGw7XHJcbiAgdHdlYWtTdG9yZVByb21pc2U6IFByb21pc2U8VHdlYWtTdG9yZVJlZ2lzdHJ5Vmlldz4gfCBudWxsO1xyXG4gIHR3ZWFrU3RvcmVFcnJvcjogdW5rbm93bjtcclxufVxyXG5cclxuY29uc3Qgc3RhdGU6IEluamVjdG9yU3RhdGUgPSB7XG4gIHNlY3Rpb25zOiBuZXcgTWFwKCksXG4gIHBhZ2VzOiBuZXcgTWFwKCksXG4gIGxpc3RlZFR3ZWFrczogW10sXG4gIG91dGVyV3JhcHBlcjogbnVsbCxcclxuICBuYXRpdmVOYXZIZWFkZXI6IG51bGwsXHJcbiAgbmF2R3JvdXA6IG51bGwsXHJcbiAgbmF2QnV0dG9uczogbnVsbCxcclxuICBwYWdlc0dyb3VwOiBudWxsLFxyXG4gIHBhZ2VzR3JvdXBLZXk6IG51bGwsXHJcbiAgcGFuZWxIb3N0OiBudWxsLFxyXG4gIG9ic2VydmVyOiBudWxsLFxyXG4gIGZpbmdlcnByaW50OiBudWxsLFxyXG4gIHNpZGViYXJEdW1wZWQ6IGZhbHNlLFxyXG4gIGFjdGl2ZVBhZ2U6IG51bGwsXHJcbiAgc2lkZWJhclJvb3Q6IG51bGwsXHJcbiAgc2lkZWJhclJlc3RvcmVIYW5kbGVyOiBudWxsLFxyXG4gIHNldHRpbmdzU3VyZmFjZVZpc2libGU6IGZhbHNlLFxyXG4gIHNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcjogbnVsbCxcclxuICB0d2Vha1N0b3JlOiBudWxsLFxyXG4gIHR3ZWFrU3RvcmVQcm9taXNlOiBudWxsLFxyXG4gIHR3ZWFrU3RvcmVFcnJvcjogbnVsbCxcbn07XG5cbmxldCBzdGFuZGFsb25lTGF1bmNoZXI6IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3RhbmRhbG9uZU92ZXJsYXk6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3RhbmRhbG9uZU5hdlJvb3Q6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc3RhbmRhbG9uZVBhbmVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xubGV0IHN0YW5kYWxvbmVOYXZCdXR0b25zOiB7IGNvbmZpZzogSFRNTEJ1dHRvbkVsZW1lbnQ7IHR3ZWFrczogSFRNTEJ1dHRvbkVsZW1lbnQ7IHN0b3JlOiBIVE1MQnV0dG9uRWxlbWVudCB9IHwgbnVsbCA9IG51bGw7XG5sZXQgc3RhbmRhbG9uZVBhZ2VCdXR0b25zID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxCdXR0b25FbGVtZW50PigpO1xubGV0IHN0YW5kYWxvbmVLZXlIYW5kbGVyOiAoKGU6IEtleWJvYXJkRXZlbnQpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbmZ1bmN0aW9uIHBsb2cobXNnOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xuICBpcGNSZW5kZXJlci5zZW5kKFxyXG4gICAgXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsXHJcbiAgICBcImluZm9cIixcclxuICAgIGBbc2V0dGluZ3MtaW5qZWN0b3JdICR7bXNnfSR7ZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpfWAsXHJcbiAgKTtcclxufVxyXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogSlNPTi5zdHJpbmdpZnkodik7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHYpO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHB1YmxpYyBBUEkgXHUyNTAwXHUyNTAwXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRTZXR0aW5nc0luamVjdG9yKCk6IHZvaWQge1xyXG4gIGlmIChzdGF0ZS5vYnNlcnZlcikgcmV0dXJuO1xyXG5cclxuICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XHJcbiAgICB0cnlJbmplY3QoKTtcclxuICAgIG1heWJlRHVtcERvbSgpO1xyXG4gIH0pO1xyXG4gIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XHJcbiAgc3RhdGUub2JzZXJ2ZXIgPSBvYnM7XHJcblxyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicG9wc3RhdGVcIiwgb25OYXYpO1xyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiaGFzaGNoYW5nZVwiLCBvbk5hdik7XHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIG9uRG9jdW1lbnRDbGljaywgdHJ1ZSk7XHJcbiAgZm9yIChjb25zdCBtIG9mIFtcInB1c2hTdGF0ZVwiLCBcInJlcGxhY2VTdGF0ZVwiXSBhcyBjb25zdCkge1xyXG4gICAgY29uc3Qgb3JpZyA9IGhpc3RvcnlbbV07XHJcbiAgICBoaXN0b3J5W21dID0gZnVuY3Rpb24gKHRoaXM6IEhpc3RvcnksIC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIG9yaWc+KSB7XHJcbiAgICAgIGNvbnN0IHIgPSBvcmlnLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoYGNvZGV4cHAtJHttfWApKTtcclxuICAgICAgcmV0dXJuIHI7XHJcbiAgICB9IGFzIHR5cGVvZiBvcmlnO1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoYGNvZGV4cHAtJHttfWAsIG9uTmF2KTtcclxuICB9XHJcblxyXG4gIHRyeUluamVjdCgpO1xyXG4gIG1heWJlRHVtcERvbSgpO1xyXG4gIGxldCB0aWNrcyA9IDA7XHJcbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICB0aWNrcysrO1xyXG4gICAgdHJ5SW5qZWN0KCk7XHJcbiAgICBtYXliZUR1bXBEb20oKTtcclxuICAgIGlmICh0aWNrcyA+IDYwKSBjbGVhckludGVydmFsKGludGVydmFsKTtcclxuICB9LCA1MDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBvbk5hdigpOiB2b2lkIHtcclxuICBzdGF0ZS5maW5nZXJwcmludCA9IG51bGw7XHJcbiAgdHJ5SW5qZWN0KCk7XHJcbiAgbWF5YmVEdW1wRG9tKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uRG9jdW1lbnRDbGljayhlOiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZS50YXJnZXQgOiBudWxsO1xyXG4gIGNvbnN0IGNvbnRyb2wgPSB0YXJnZXQ/LmNsb3Nlc3QoXCJbcm9sZT0nbGluayddLGJ1dHRvbixhXCIpO1xyXG4gIGlmICghKGNvbnRyb2wgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHJldHVybjtcclxuICBpZiAoY29tcGFjdFNldHRpbmdzVGV4dChjb250cm9sLnRleHRDb250ZW50IHx8IFwiXCIpICE9PSBcIkJhY2sgdG8gYXBwXCIpIHJldHVybjtcclxuICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUoZmFsc2UsIFwiYmFjay10by1hcHBcIik7XHJcbiAgfSwgMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNlY3Rpb24oc2VjdGlvbjogU2V0dGluZ3NTZWN0aW9uKTogU2V0dGluZ3NIYW5kbGUge1xyXG4gIHN0YXRlLnNlY3Rpb25zLnNldChzZWN0aW9uLmlkLCBzZWN0aW9uKTtcclxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVyZW5kZXIoKTtcclxuICByZXR1cm4ge1xyXG4gICAgdW5yZWdpc3RlcjogKCkgPT4ge1xyXG4gICAgICBzdGF0ZS5zZWN0aW9ucy5kZWxldGUoc2VjdGlvbi5pZCk7XHJcbiAgICAgIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTZWN0aW9ucygpOiB2b2lkIHtcclxuICBzdGF0ZS5zZWN0aW9ucy5jbGVhcigpO1xyXG4gIC8vIERyb3AgcmVnaXN0ZXJlZCBwYWdlcyB0b28gXHUyMDE0IHRoZXkncmUgb3duZWQgYnkgdHdlYWtzIHRoYXQganVzdCBnb3RcclxuICAvLyB0b3JuIGRvd24gYnkgdGhlIGhvc3QuIFJ1biBhbnkgdGVhcmRvd25zIGJlZm9yZSBmb3JnZXR0aW5nIHRoZW0uXHJcbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBwLnRlYXJkb3duPy4oKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgcGxvZyhcInBhZ2UgdGVhcmRvd24gZmFpbGVkXCIsIHsgaWQ6IHAuaWQsIGVycjogU3RyaW5nKGUpIH0pO1xyXG4gICAgfVxyXG4gIH1cbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcbiAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgcmVmcmVzaFN0YW5kYWxvbmVOYXYoKTtcbiAgLy8gSWYgd2Ugd2VyZSBvbiBhIHJlZ2lzdGVyZWQgcGFnZSB0aGF0IG5vIGxvbmdlciBleGlzdHMsIGZhbGwgYmFjayB0b1xuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxuICBpZiAoXG4gICAgc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiZcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXG4gICkge1xuICAgIGZhbGxiYWNrQWZ0ZXJSZWdpc3RlcmVkUGFnZVJlbW92ZWQoKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XG4gICAgcmVyZW5kZXIoKTtcbiAgfVxufVxuXHJcbi8qKlxyXG4gKiBSZWdpc3RlciBhIHR3ZWFrLW93bmVkIHNldHRpbmdzIHBhZ2UuIFRoZSBydW50aW1lIGluamVjdHMgYSBzaWRlYmFyIGVudHJ5XHJcbiAqIHVuZGVyIGEgXCJUV0VBS1NcIiBncm91cCBoZWFkZXIgKHdoaWNoIGFwcGVhcnMgb25seSB3aGVuIGF0IGxlYXN0IG9uZSBwYWdlXHJcbiAqIGlzIHJlZ2lzdGVyZWQpIGFuZCByb3V0ZXMgY2xpY2tzIHRvIHRoZSBwYWdlJ3MgYHJlbmRlcihyb290KWAuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQYWdlKFxyXG4gIHR3ZWFrSWQ6IHN0cmluZyxcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdCxcclxuICBwYWdlOiBTZXR0aW5nc1BhZ2UsXHJcbik6IFNldHRpbmdzSGFuZGxlIHtcclxuICBjb25zdCBpZCA9IHBhZ2UuaWQ7IC8vIGFscmVhZHkgbmFtZXNwYWNlZCBieSB0d2Vhay1ob3N0IGFzIGAke3R3ZWFrSWR9OiR7cGFnZS5pZH1gXHJcbiAgY29uc3QgZW50cnk6IFJlZ2lzdGVyZWRQYWdlID0geyBpZCwgdHdlYWtJZCwgbWFuaWZlc3QsIHBhZ2UgfTtcbiAgc3RhdGUucGFnZXMuc2V0KGlkLCBlbnRyeSk7XG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XG4gIHN5bmNQYWdlc0dyb3VwKCk7XG4gIHJlZnJlc2hTdGFuZGFsb25lTmF2KCk7XG4gIC8vIElmIHRoZSB1c2VyIHdhcyBhbHJlYWR5IG9uIHRoaXMgcGFnZSAoaG90IHJlbG9hZCksIHJlLW1vdW50IGl0cyBib2R5LlxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICByZXJlbmRlcigpO1xuICB9XHJcbiAgcmV0dXJuIHtcclxuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcclxuICAgICAgY29uc3QgZSA9IHN0YXRlLnBhZ2VzLmdldChpZCk7XHJcbiAgICAgIGlmICghZSkgcmV0dXJuO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGUudGVhcmRvd24/LigpO1xyXG4gICAgICB9IGNhdGNoIHt9XG4gICAgICBzdGF0ZS5wYWdlcy5kZWxldGUoaWQpO1xuICAgICAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgICAgIHJlZnJlc2hTdGFuZGFsb25lTmF2KCk7XG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICAgICAgZmFsbGJhY2tBZnRlclJlZ2lzdGVyZWRQYWdlUmVtb3ZlZCgpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cclxuLyoqIENhbGxlZCBieSB0aGUgdHdlYWsgaG9zdCBhZnRlciBmZXRjaGluZyB0aGUgdHdlYWsgbGlzdCBmcm9tIG1haW4uICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMaXN0ZWRUd2Vha3MobGlzdDogTGlzdGVkVHdlYWtbXSk6IHZvaWQge1xuICBzdGF0ZS5saXN0ZWRUd2Vha3MgPSBsaXN0O1xuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVyZW5kZXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50RmxvYXRpbmdTZXR0aW5nc0xhdW5jaGVyKCk6IHZvaWQge1xuICBpZiAoc3RhbmRhbG9uZUxhdW5jaGVyPy5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuXG4gIGNvbnN0IG1vdW50ID0gKCkgPT4ge1xuICAgIGlmICghZG9jdW1lbnQuYm9keSkgcmV0dXJuO1xuICAgIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXG4gICAgICBcIltkYXRhLWNvZGV4cHAtc3RhbmRhbG9uZS1sYXVuY2hlcj0ndHJ1ZSddXCIsXG4gICAgKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHN0YW5kYWxvbmVMYXVuY2hlciA9IGV4aXN0aW5nO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGJ0bi5kYXRhc2V0LmNvZGV4cHBTdGFuZGFsb25lTGF1bmNoZXIgPSBcInRydWVcIjtcbiAgICBidG4udGl0bGUgPSBcIkNvZGV4KysgU2V0dGluZ3NcIjtcbiAgICBidG4udGV4dENvbnRlbnQgPSBcIisrXCI7XG4gICAgYnRuLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICBcInBvc2l0aW9uOmZpeGVkXCIsXG4gICAgICBcInJpZ2h0OjE2cHhcIixcbiAgICAgIFwiYm90dG9tOjE2cHhcIixcbiAgICAgIFwiei1pbmRleDoyMTQ3NDgzNjQ1XCIsXG4gICAgICBcIndpZHRoOjM4cHhcIixcbiAgICAgIFwiaGVpZ2h0OjM4cHhcIixcbiAgICAgIFwiYm9yZGVyLXJhZGl1czoxMHB4XCIsXG4gICAgICBcImJvcmRlcjoxcHggc29saWQgdmFyKC0tY29sb3ItdG9rZW4tYm9yZGVyLCByZ2JhKDEyNywxMjcsMTI3LDAuMzUpKVwiLFxuICAgICAgXCJiYWNrZ3JvdW5kOnZhcigtLWNvbG9yLXRva2VuLW1haW4tc3VyZmFjZS1wcmltYXJ5LCByZ2JhKDI0LDI0LDI0LDAuOTIpKVwiLFxuICAgICAgXCJjb2xvcjp2YXIoLS1jb2xvci10b2tlbi10ZXh0LXByaW1hcnksIGN1cnJlbnRDb2xvcilcIixcbiAgICAgIFwiYm94LXNoYWRvdzowIDEwcHggMjhweCByZ2JhKDAsMCwwLDAuMjgpXCIsXG4gICAgICBcImZvbnQ6NzAwIDE0cHggc3lzdGVtLXVpLCBzYW5zLXNlcmlmXCIsXG4gICAgICBcImxldHRlci1zcGFjaW5nOjBcIixcbiAgICAgIFwiY3Vyc29yOnBvaW50ZXJcIixcbiAgICBdLmpvaW4oXCI7XCIpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCAoKSA9PiB7XG4gICAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCByZ2JhKDEyNywxMjcsMTI3LDAuMTgpKVwiO1xuICAgIH0pO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XG4gICAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidmFyKC0tY29sb3ItdG9rZW4tbWFpbi1zdXJmYWNlLXByaW1hcnksIHJnYmEoMjQsMjQsMjQsMC45MikpXCI7XG4gICAgfSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIG9wZW5TdGFuZGFsb25lU2V0dGluZ3NQYW5lbCgpO1xuICAgIH0pO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICBzdGFuZGFsb25lTGF1bmNoZXIgPSBidG47XG4gICAgcGxvZyhcInN0YW5kYWxvbmUgbGF1bmNoZXIgbW91bnRlZFwiKTtcbiAgfTtcblxuICBpZiAoZG9jdW1lbnQuYm9keSkgbW91bnQoKTtcbiAgZWxzZSBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBtb3VudCwgeyBvbmNlOiB0cnVlIH0pO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaW5qZWN0aW9uIFx1MjUwMFx1MjUwMFxuXHJcbmZ1bmN0aW9uIHRyeUluamVjdCgpOiB2b2lkIHtcclxuICByZW1vdmVNaXNwbGFjZWRTZXR0aW5nc0dyb3VwcygpO1xyXG5cclxuICBjb25zdCBpdGVtc0dyb3VwID0gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk7XHJcbiAgaWYgKCFpdGVtc0dyb3VwKSB7XHJcbiAgICBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpO1xyXG4gICAgcGxvZyhcInNpZGViYXIgbm90IGZvdW5kXCIpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBpZiAoc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyKSB7XHJcbiAgICBjbGVhclRpbWVvdXQoc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyKTtcclxuICAgIHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lciA9IG51bGw7XHJcbiAgfVxyXG4gIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUodHJ1ZSwgXCJzaWRlYmFyLWZvdW5kXCIpO1xyXG4gIC8vIENvZGV4J3MgaXRlbXMgZ3JvdXAgbGl2ZXMgaW5zaWRlIGFuIG91dGVyIHdyYXBwZXIgdGhhdCdzIGFscmVhZHkgc3R5bGVkXHJcbiAgLy8gdG8gaG9sZCBtdWx0aXBsZSBncm91cHMgKGBmbGV4IGZsZXgtY29sIGdhcC0xIGdhcC0wYCkuIFdlIGluamVjdCBvdXJcclxuICAvLyBncm91cCBhcyBhIHNpYmxpbmcgc28gdGhlIG5hdHVyYWwgZ2FwLTEgYWN0cyBhcyBvdXIgdmlzdWFsIHNlcGFyYXRvci5cclxuICBjb25zdCBvdXRlciA9IGl0ZW1zR3JvdXAucGFyZW50RWxlbWVudCA/PyBpdGVtc0dyb3VwO1xyXG4gIGlmICghaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUoaXRlbXNHcm91cCkgfHwgIWlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKG91dGVyKSkge1xyXG4gICAgc2NoZWR1bGVTZXR0aW5nc1N1cmZhY2VIaWRkZW4oKTtcclxuICAgIHBsb2coXCJyZWplY3RlZCBub24tc2V0dGluZ3Mgc2lkZWJhciBjYW5kaWRhdGVcIiwge1xyXG4gICAgICBpdGVtc0dyb3VwOiBkZXNjcmliZShpdGVtc0dyb3VwKSxcclxuICAgICAgb3V0ZXI6IGRlc2NyaWJlKG91dGVyKSxcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG91dGVyO1xyXG4gIHN5bmNOYXRpdmVTZXR0aW5nc0hlYWRlcihpdGVtc0dyb3VwLCBvdXRlcik7XHJcblxyXG4gIGlmIChzdGF0ZS5uYXZHcm91cCAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5uYXZHcm91cCkpIHtcclxuICAgIHN5bmNQYWdlc0dyb3VwKCk7XHJcbiAgICAvLyBDb2RleCByZS1yZW5kZXJzIGl0cyBuYXRpdmUgc2lkZWJhciBidXR0b25zIG9uIGl0cyBvd24gc3RhdGUgY2hhbmdlcy5cclxuICAgIC8vIElmIG9uZSBvZiBvdXIgcGFnZXMgaXMgYWN0aXZlLCByZS1zdHJpcCBDb2RleCdzIGFjdGl2ZSBzdHlsaW5nIHNvXHJcbiAgICAvLyBHZW5lcmFsIGRvZXNuJ3QgcmVhcHBlYXIgYXMgc2VsZWN0ZWQuXHJcbiAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZSAhPT0gbnVsbCkgc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKHRydWUpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgLy8gU2lkZWJhciB3YXMgZWl0aGVyIGZyZXNobHkgbW91bnRlZCAoU2V0dGluZ3MganVzdCBvcGVuZWQpIG9yIHJlLW1vdW50ZWRcclxuICAvLyAoY2xvc2VkIGFuZCByZS1vcGVuZWQsIG9yIG5hdmlnYXRlZCBhd2F5IGFuZCBiYWNrKS4gSW4gYWxsIG9mIHRob3NlXHJcbiAgLy8gY2FzZXMgQ29kZXggcmVzZXRzIHRvIGl0cyBkZWZhdWx0IHBhZ2UgKEdlbmVyYWwpLCBidXQgb3VyIGluLW1lbW9yeVxyXG4gIC8vIGBhY3RpdmVQYWdlYCBtYXkgc3RpbGwgcmVmZXJlbmNlIHRoZSBsYXN0IHR3ZWFrL3BhZ2UgdGhlIHVzZXIgaGFkIG9wZW5cclxuICAvLyBcdTIwMTQgd2hpY2ggd291bGQgY2F1c2UgdGhhdCBuYXYgYnV0dG9uIHRvIHJlbmRlciB3aXRoIHRoZSBhY3RpdmUgc3R5bGluZ1xyXG4gIC8vIGV2ZW4gdGhvdWdoIENvZGV4IGlzIHNob3dpbmcgR2VuZXJhbC4gQ2xlYXIgaXQgc28gYHN5bmNQYWdlc0dyb3VwYCAvXHJcbiAgLy8gYHNldE5hdkFjdGl2ZWAgc3RhcnQgZnJvbSBhIG5ldXRyYWwgc3RhdGUuIFRoZSBwYW5lbEhvc3QgcmVmZXJlbmNlIGlzXHJcbiAgLy8gYWxzbyBzdGFsZSAoaXRzIERPTSB3YXMgZGlzY2FyZGVkIHdpdGggdGhlIHByZXZpb3VzIGNvbnRlbnQgYXJlYSkuXHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwgfHwgc3RhdGUucGFuZWxIb3N0ICE9PSBudWxsKSB7XHJcbiAgICBwbG9nKFwic2lkZWJhciByZS1tb3VudCBkZXRlY3RlZDsgY2xlYXJpbmcgc3RhbGUgYWN0aXZlIHN0YXRlXCIsIHtcclxuICAgICAgcHJldkFjdGl2ZTogc3RhdGUuYWN0aXZlUGFnZSxcclxuICAgIH0pO1xyXG4gICAgc3RhdGUuYWN0aXZlUGFnZSA9IG51bGw7XHJcbiAgICBzdGF0ZS5wYW5lbEhvc3QgPSBudWxsO1xyXG4gIH1cclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIEdyb3VwIGNvbnRhaW5lciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBjb25zdCBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZ3JvdXAuZGF0YXNldC5jb2RleHBwID0gXCJuYXYtZ3JvdXBcIjtcclxuICBncm91cC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLXB4XCI7XHJcblxyXG4gIGdyb3VwLmFwcGVuZENoaWxkKHNpZGViYXJHcm91cEhlYWRlcihcIkNvZGV4KytcIiwgXCJwdC0zXCIpKTtcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFNpZGViYXIgaXRlbXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3QgY29uZmlnQnRuID0gbWFrZVNpZGViYXJJdGVtKFwiQ29uZmlnXCIsIGNvbmZpZ0ljb25TdmcoKSk7XHJcbiAgY29uc3QgdHdlYWtzQnRuID0gbWFrZVNpZGViYXJJdGVtKFwiVHdlYWtzXCIsIHR3ZWFrc0ljb25TdmcoKSk7XHJcbiAgY29uc3Qgc3RvcmVCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJUd2VhayBTdG9yZVwiLCBzdG9yZUljb25TdmcoKSk7XHJcblxyXG4gIGNvbmZpZ0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcImNvbmZpZ1wiIH0pO1xyXG4gIH0pO1xyXG4gIHR3ZWFrc0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcInR3ZWFrc1wiIH0pO1xyXG4gIH0pO1xyXG4gIHN0b3JlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwic3RvcmVcIiB9KTtcclxuICB9KTtcclxuXHJcbiAgZ3JvdXAuYXBwZW5kQ2hpbGQoY29uZmlnQnRuKTtcclxuICBncm91cC5hcHBlbmRDaGlsZCh0d2Vha3NCdG4pO1xyXG4gIGdyb3VwLmFwcGVuZENoaWxkKHN0b3JlQnRuKTtcclxuICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XHJcblxyXG4gIHN0YXRlLm5hdkdyb3VwID0gZ3JvdXA7XHJcbiAgc3RhdGUubmF2QnV0dG9ucyA9IHsgY29uZmlnOiBjb25maWdCdG4sIHR3ZWFrczogdHdlYWtzQnRuLCBzdG9yZTogc3RvcmVCdG4gfTtcclxuICBwbG9nKFwibmF2IGdyb3VwIGluamVjdGVkXCIsIHsgb3V0ZXJUYWc6IG91dGVyLnRhZ05hbWUgfSk7XHJcbiAgc3luY1BhZ2VzR3JvdXAoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3luY05hdGl2ZVNldHRpbmdzSGVhZGVyKGl0ZW1zR3JvdXA6IEhUTUxFbGVtZW50LCBvdXRlcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICBpZiAoc3RhdGUubmF0aXZlTmF2SGVhZGVyICYmIG91dGVyLmNvbnRhaW5zKHN0YXRlLm5hdGl2ZU5hdkhlYWRlcikpIHJldHVybjtcclxuICBpZiAob3V0ZXIgPT09IGl0ZW1zR3JvdXApIHJldHVybjtcclxuXHJcbiAgY29uc3QgaGVhZGVyID0gc2lkZWJhckdyb3VwSGVhZGVyKFwiR2VuZXJhbFwiKTtcclxuICBoZWFkZXIuZGF0YXNldC5jb2RleHBwID0gXCJuYXRpdmUtbmF2LWhlYWRlclwiO1xyXG4gIG91dGVyLmluc2VydEJlZm9yZShoZWFkZXIsIGl0ZW1zR3JvdXApO1xyXG4gIHN0YXRlLm5hdGl2ZU5hdkhlYWRlciA9IGhlYWRlcjtcclxufVxyXG5cclxuZnVuY3Rpb24gc2lkZWJhckdyb3VwSGVhZGVyKHRleHQ6IHN0cmluZywgdG9wUGFkZGluZyA9IFwicHQtMlwiKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyLmNsYXNzTmFtZSA9XHJcbiAgICBgcHgtcm93LXggJHt0b3BQYWRkaW5nfSBwYi0xIHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmQgc2VsZWN0LW5vbmVgO1xyXG4gIGhlYWRlci50ZXh0Q29udGVudCA9IHRleHQ7XHJcbiAgcmV0dXJuIGhlYWRlcjtcclxufVxyXG5cclxuZnVuY3Rpb24gc2NoZWR1bGVTZXR0aW5nc1N1cmZhY2VIaWRkZW4oKTogdm9pZCB7XHJcbiAgaWYgKCFzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlIHx8IHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcikgcmV0dXJuO1xyXG4gIHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyID0gbnVsbDtcclxuICAgIGlmIChmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKSkgcmV0dXJuO1xyXG4gICAgaWYgKGlzU2V0dGluZ3NUZXh0VmlzaWJsZSgpKSByZXR1cm47XHJcbiAgICBzZXRTZXR0aW5nc1N1cmZhY2VWaXNpYmxlKGZhbHNlLCBcInNpZGViYXItbm90LWZvdW5kXCIpO1xyXG4gIH0sIDE1MDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1NldHRpbmdzVGV4dFZpc2libGUoKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgdGV4dCA9IGNvbXBhY3RTZXR0aW5nc1RleHQoZG9jdW1lbnQuYm9keT8udGV4dENvbnRlbnQgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICByZXR1cm4gKFxyXG4gICAgdGV4dC5pbmNsdWRlcyhcImJhY2sgdG8gYXBwXCIpICYmXHJcbiAgICB0ZXh0LmluY2x1ZGVzKFwiZ2VuZXJhbFwiKSAmJlxyXG4gICAgdGV4dC5pbmNsdWRlcyhcImFwcGVhcmFuY2VcIikgJiZcclxuICAgICh0ZXh0LmluY2x1ZGVzKFwiY29uZmlndXJhdGlvblwiKSB8fCB0ZXh0LmluY2x1ZGVzKFwiZGVmYXVsdCBwZXJtaXNzaW9uc1wiKSlcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb21wYWN0U2V0dGluZ3NUZXh0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiBTdHJpbmcodmFsdWUgfHwgXCJcIikucmVwbGFjZSgvXFxzKy9nLCBcIiBcIikudHJpbSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRTZXR0aW5nc1N1cmZhY2VWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4sIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XHJcbiAgaWYgKHN0YXRlLnNldHRpbmdzU3VyZmFjZVZpc2libGUgPT09IHZpc2libGUpIHJldHVybjtcclxuICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlID0gdmlzaWJsZTtcclxuICBpZiAodmlzaWJsZSkgd2FybVR3ZWFrU3RvcmUoKTtcclxuICB0cnkge1xyXG4gICAgKHdpbmRvdyBhcyBXaW5kb3cgJiB7IF9fY29kZXhwcFNldHRpbmdzU3VyZmFjZVZpc2libGU/OiBib29sZWFuIH0pLl9fY29kZXhwcFNldHRpbmdzU3VyZmFjZVZpc2libGUgPSB2aXNpYmxlO1xyXG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmRhdGFzZXQuY29kZXhwcFNldHRpbmdzU3VyZmFjZSA9IHZpc2libGUgPyBcInRydWVcIiA6IFwiZmFsc2VcIjtcclxuICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KFxyXG4gICAgICBuZXcgQ3VzdG9tRXZlbnQoXCJjb2RleHBwOnNldHRpbmdzLXN1cmZhY2VcIiwge1xyXG4gICAgICAgIGRldGFpbDogeyB2aXNpYmxlLCByZWFzb24gfSxcclxuICAgICAgfSksXHJcbiAgICApO1xyXG4gIH0gY2F0Y2gge31cclxuICBwbG9nKFwic2V0dGluZ3Mgc3VyZmFjZVwiLCB7IHZpc2libGUsIHJlYXNvbiwgdXJsOiBsb2NhdGlvbi5ocmVmIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogUmVuZGVyIChvciByZS1yZW5kZXIpIHRoZSBzZWNvbmQgc2lkZWJhciBncm91cCBvZiBwZXItdHdlYWsgcGFnZXMuIFRoZVxyXG4gKiBncm91cCBpcyBjcmVhdGVkIGxhemlseSBhbmQgcmVtb3ZlZCB3aGVuIHRoZSBsYXN0IHBhZ2UgdW5yZWdpc3RlcnMsIHNvXHJcbiAqIHVzZXJzIHdpdGggbm8gcGFnZS1yZWdpc3RlcmluZyB0d2Vha3MgbmV2ZXIgc2VlIGFuIGVtcHR5IFwiVHdlYWtzXCIgaGVhZGVyLlxyXG4gKi9cclxuZnVuY3Rpb24gc3luY1BhZ2VzR3JvdXAoKTogdm9pZCB7XHJcbiAgY29uc3Qgb3V0ZXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcclxuICBpZiAoIW91dGVyKSByZXR1cm47XHJcbiAgaWYgKCFpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShvdXRlcikpIHtcclxuICAgIHN0YXRlLnNpZGViYXJSb290ID0gbnVsbDtcclxuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xyXG4gICAgc3RhdGUucGFnZXNHcm91cEtleSA9IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgY29uc3QgcGFnZXMgPSBbLi4uc3RhdGUucGFnZXMudmFsdWVzKCldO1xyXG5cclxuICAvLyBCdWlsZCBhIGRldGVybWluaXN0aWMgZmluZ2VycHJpbnQgb2YgdGhlIGRlc2lyZWQgZ3JvdXAgc3RhdGUuIElmIHRoZVxyXG4gIC8vIGN1cnJlbnQgRE9NIGdyb3VwIGFscmVhZHkgbWF0Y2hlcywgdGhpcyBpcyBhIG5vLW9wIFx1MjAxNCBjcml0aWNhbCwgYmVjYXVzZVxyXG4gIC8vIHN5bmNQYWdlc0dyb3VwIGlzIGNhbGxlZCBvbiBldmVyeSBNdXRhdGlvbk9ic2VydmVyIHRpY2sgYW5kIGFueSBET01cclxuICAvLyB3cml0ZSB3b3VsZCByZS10cmlnZ2VyIHRoYXQgb2JzZXJ2ZXIgKGluZmluaXRlIGxvb3AsIGFwcCBmcmVlemUpLlxyXG4gIGNvbnN0IGRlc2lyZWRLZXkgPSBwYWdlcy5sZW5ndGggPT09IDBcclxuICAgID8gXCJFTVBUWVwiXHJcbiAgICA6IHBhZ2VzLm1hcCgocCkgPT4gYCR7cC5pZH18JHtwLnBhZ2UudGl0bGV9fCR7cC5wYWdlLmljb25TdmcgPz8gXCJcIn1gKS5qb2luKFwiXFxuXCIpO1xyXG4gIGNvbnN0IGdyb3VwQXR0YWNoZWQgPSAhIXN0YXRlLnBhZ2VzR3JvdXAgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUucGFnZXNHcm91cCk7XHJcbiAgaWYgKHN0YXRlLnBhZ2VzR3JvdXBLZXkgPT09IGRlc2lyZWRLZXkgJiYgKHBhZ2VzLmxlbmd0aCA9PT0gMCA/ICFncm91cEF0dGFjaGVkIDogZ3JvdXBBdHRhY2hlZCkpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGlmIChwYWdlcy5sZW5ndGggPT09IDApIHtcclxuICAgIGlmIChzdGF0ZS5wYWdlc0dyb3VwKSB7XHJcbiAgICAgIHN0YXRlLnBhZ2VzR3JvdXAucmVtb3ZlKCk7XHJcbiAgICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSBwLm5hdkJ1dHRvbiA9IG51bGw7XHJcbiAgICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGxldCBncm91cCA9IHN0YXRlLnBhZ2VzR3JvdXA7XHJcbiAgaWYgKCFncm91cCB8fCAhb3V0ZXIuY29udGFpbnMoZ3JvdXApKSB7XHJcbiAgICBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBncm91cC5kYXRhc2V0LmNvZGV4cHAgPSBcInBhZ2VzLWdyb3VwXCI7XHJcbiAgICBncm91cC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLXB4XCI7XHJcbiAgICBncm91cC5hcHBlbmRDaGlsZChzaWRlYmFyR3JvdXBIZWFkZXIoXCJUd2Vha3NcIiwgXCJwdC0zXCIpKTtcclxuICAgIG91dGVyLmFwcGVuZENoaWxkKGdyb3VwKTtcclxuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBncm91cDtcclxuICB9IGVsc2Uge1xyXG4gICAgLy8gU3RyaXAgcHJpb3IgYnV0dG9ucyAoa2VlcCB0aGUgaGVhZGVyIGF0IGluZGV4IDApLlxyXG4gICAgd2hpbGUgKGdyb3VwLmNoaWxkcmVuLmxlbmd0aCA+IDEpIGdyb3VwLnJlbW92ZUNoaWxkKGdyb3VwLmxhc3RDaGlsZCEpO1xyXG4gIH1cclxuXHJcbiAgZm9yIChjb25zdCBwIG9mIHBhZ2VzKSB7XHJcbiAgICBjb25zdCBpY29uID0gcC5wYWdlLmljb25TdmcgPz8gZGVmYXVsdFBhZ2VJY29uU3ZnKCk7XHJcbiAgICBjb25zdCBidG4gPSBtYWtlU2lkZWJhckl0ZW0ocC5wYWdlLnRpdGxlLCBpY29uKTtcclxuICAgIGJ0bi5kYXRhc2V0LmNvZGV4cHAgPSBgbmF2LXBhZ2UtJHtwLmlkfWA7XHJcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgYWN0aXZhdGVQYWdlKHsga2luZDogXCJyZWdpc3RlcmVkXCIsIGlkOiBwLmlkIH0pO1xyXG4gICAgfSk7XHJcbiAgICBwLm5hdkJ1dHRvbiA9IGJ0bjtcclxuICAgIGdyb3VwLmFwcGVuZENoaWxkKGJ0bik7XHJcbiAgfVxyXG4gIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBkZXNpcmVkS2V5O1xyXG4gIHBsb2coXCJwYWdlcyBncm91cCBzeW5jZWRcIiwge1xyXG4gICAgY291bnQ6IHBhZ2VzLmxlbmd0aCxcclxuICAgIGlkczogcGFnZXMubWFwKChwKSA9PiBwLmlkKSxcclxuICB9KTtcclxuICAvLyBSZWZsZWN0IGN1cnJlbnQgYWN0aXZlIHN0YXRlIGFjcm9zcyB0aGUgcmVidWlsdCBidXR0b25zLlxyXG4gIHNldE5hdkFjdGl2ZShzdGF0ZS5hY3RpdmVQYWdlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbWFrZVNpZGViYXJJdGVtKGxhYmVsOiBzdHJpbmcsIGljb25Tdmc6IHN0cmluZyk6IEhUTUxCdXR0b25FbGVtZW50IHtcclxuICAvLyBDbGFzcyBzdHJpbmcgY29waWVkIHZlcmJhdGltIGZyb20gQ29kZXgncyBzaWRlYmFyIGJ1dHRvbnMgKEdlbmVyYWwgZXRjKS5cclxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi0ke2xhYmVsLnRvTG93ZXJDYXNlKCl9YDtcclxuICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBsYWJlbCk7XHJcbiAgYnRuLmNsYXNzTmFtZSA9XHJcbiAgICBcImZvY3VzLXZpc2libGU6b3V0bGluZS10b2tlbi1ib3JkZXIgcmVsYXRpdmUgcHgtcm93LXggcHktcm93LXkgY3Vyc29yLWludGVyYWN0aW9uIHNocmluay0wIGl0ZW1zLWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyB0ZXh0LWxlZnQgdGV4dC1zbSBmb2N1cy12aXNpYmxlOm91dGxpbmUgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLTIgZm9jdXMtdmlzaWJsZTpvdXRsaW5lLW9mZnNldC0yIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTUwIGdhcC0yIGZsZXggdy1mdWxsIGhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBmb250LW5vcm1hbFwiO1xyXG5cclxuICBjb25zdCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaW5uZXIuY2xhc3NOYW1lID1cclxuICAgIFwiZmxleCBtaW4tdy0wIGl0ZW1zLWNlbnRlciB0ZXh0LWJhc2UgZ2FwLTIgZmxleC0xIHRleHQtdG9rZW4tZm9yZWdyb3VuZFwiO1xyXG4gIGlubmVyLmlubmVySFRNTCA9IGAke2ljb25Tdmd9PHNwYW4gY2xhc3M9XCJ0cnVuY2F0ZVwiPiR7bGFiZWx9PC9zcGFuPmA7XHJcbiAgYnRuLmFwcGVuZENoaWxkKGlubmVyKTtcclxuICByZXR1cm4gYnRuO1xyXG59XHJcblxyXG4vKiogSW50ZXJuYWwga2V5IGZvciB0aGUgYnVpbHQtaW4gbmF2IGJ1dHRvbnMuICovXHJcbnR5cGUgQnVpbHRpblBhZ2UgPSBcImNvbmZpZ1wiIHwgXCJ0d2Vha3NcIiB8IFwic3RvcmVcIjtcclxuXHJcbmZ1bmN0aW9uIHNldE5hdkFjdGl2ZShhY3RpdmU6IEFjdGl2ZVBhZ2UgfCBudWxsKTogdm9pZCB7XHJcbiAgLy8gQnVpbHQtaW4gKENvbmZpZy9Ud2Vha3MpIGJ1dHRvbnMuXHJcbiAgaWYgKHN0YXRlLm5hdkJ1dHRvbnMpIHtcclxuICAgIGNvbnN0IGJ1aWx0aW46IEJ1aWx0aW5QYWdlIHwgbnVsbCA9XHJcbiAgICAgIGFjdGl2ZT8ua2luZCA9PT0gXCJjb25maWdcIiA/IFwiY29uZmlnXCIgOlxyXG4gICAgICBhY3RpdmU/LmtpbmQgPT09IFwidHdlYWtzXCIgPyBcInR3ZWFrc1wiIDpcclxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInN0b3JlXCIgPyBcInN0b3JlXCIgOiBudWxsO1xyXG4gICAgZm9yIChjb25zdCBba2V5LCBidG5dIG9mIE9iamVjdC5lbnRyaWVzKHN0YXRlLm5hdkJ1dHRvbnMpIGFzIFtCdWlsdGluUGFnZSwgSFRNTEJ1dHRvbkVsZW1lbnRdW10pIHtcclxuICAgICAgYXBwbHlOYXZBY3RpdmUoYnRuLCBrZXkgPT09IGJ1aWx0aW4pO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyBQZXItcGFnZSByZWdpc3RlcmVkIGJ1dHRvbnMuXHJcbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XHJcbiAgICBpZiAoIXAubmF2QnV0dG9uKSBjb250aW51ZTtcclxuICAgIGNvbnN0IGlzQWN0aXZlID0gYWN0aXZlPy5raW5kID09PSBcInJlZ2lzdGVyZWRcIiAmJiBhY3RpdmUuaWQgPT09IHAuaWQ7XHJcbiAgICBhcHBseU5hdkFjdGl2ZShwLm5hdkJ1dHRvbiwgaXNBY3RpdmUpO1xyXG4gIH1cclxuICAvLyBDb2RleCdzIG93biBzaWRlYmFyIGJ1dHRvbnMgKEdlbmVyYWwsIEFwcGVhcmFuY2UsIGV0YykuIFdoZW4gb25lIG9mXHJcbiAgLy8gb3VyIHBhZ2VzIGlzIGFjdGl2ZSwgQ29kZXggc3RpbGwgaGFzIGFyaWEtY3VycmVudD1cInBhZ2VcIiBhbmQgdGhlXHJcbiAgLy8gYWN0aXZlLWJnIGNsYXNzIG9uIHdoaWNoZXZlciBpdGVtIGl0IGNvbnNpZGVyZWQgdGhlIHJvdXRlIFx1MjAxNCB0eXBpY2FsbHlcclxuICAvLyBHZW5lcmFsLiBUaGF0IG1ha2VzIGJvdGggYnV0dG9ucyBsb29rIHNlbGVjdGVkLiBTdHJpcCBDb2RleCdzIGFjdGl2ZVxyXG4gIC8vIHN0eWxpbmcgd2hpbGUgb25lIG9mIG91cnMgaXMgYWN0aXZlOyByZXN0b3JlIGl0IHdoZW4gbm9uZSBpcy5cclxuICBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUoYWN0aXZlICE9PSBudWxsKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIE11dGUgQ29kZXgncyBvd24gYWN0aXZlLXN0YXRlIHN0eWxpbmcgb24gaXRzIHNpZGViYXIgYnV0dG9ucy4gV2UgZG9uJ3RcclxuICogdG91Y2ggQ29kZXgncyBSZWFjdCBzdGF0ZSBcdTIwMTQgd2hlbiB0aGUgdXNlciBjbGlja3MgYSBuYXRpdmUgaXRlbSwgQ29kZXhcclxuICogcmUtcmVuZGVycyB0aGUgYnV0dG9ucyBhbmQgcmUtYXBwbGllcyBpdHMgb3duIGNvcnJlY3Qgc3RhdGUsIHRoZW4gb3VyXHJcbiAqIHNpZGViYXItY2xpY2sgbGlzdGVuZXIgZmlyZXMgYHJlc3RvcmVDb2RleFZpZXdgICh3aGljaCBjYWxscyBiYWNrIGludG9cclxuICogYHNldE5hdkFjdGl2ZShudWxsKWAgYW5kIGxldHMgQ29kZXgncyBzdHlsaW5nIHN0YW5kKS5cclxuICpcclxuICogYG11dGU9dHJ1ZWAgIFx1MjE5MiBzdHJpcCBhcmlhLWN1cnJlbnQgYW5kIHN3YXAgYWN0aXZlIGJnIFx1MjE5MiBob3ZlciBiZ1xyXG4gKiBgbXV0ZT1mYWxzZWAgXHUyMTkyIG5vLW9wIChDb2RleCdzIG93biByZS1yZW5kZXIgYWxyZWFkeSByZXN0b3JlZCB0aGluZ3MpXHJcbiAqL1xyXG5mdW5jdGlvbiBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUobXV0ZTogYm9vbGVhbik6IHZvaWQge1xyXG4gIGlmICghbXV0ZSkgcmV0dXJuO1xyXG4gIGNvbnN0IHJvb3QgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcclxuICBpZiAoIXJvb3QpIHJldHVybjtcclxuICBjb25zdCBidXR0b25zID0gQXJyYXkuZnJvbShyb290LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiYnV0dG9uXCIpKTtcclxuICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XHJcbiAgICAvLyBTa2lwIG91ciBvd24gYnV0dG9ucy5cclxuICAgIGlmIChidG4uZGF0YXNldC5jb2RleHBwKSBjb250aW51ZTtcclxuICAgIGlmIChidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpID09PSBcInBhZ2VcIikge1xyXG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJ0bi5jbGFzc0xpc3QuY29udGFpbnMoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIikpIHtcclxuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYXBwbHlOYXZBY3RpdmUoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCwgYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG4gIGNvbnN0IGlubmVyID0gYnRuLmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgaWYgKGFjdGl2ZSkge1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIiwgXCJmb250LW5vcm1hbFwiKTtcbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiLCBcInBhZ2VcIik7XHJcbiAgICAgIGlmIChpbm5lcikge1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZChcInRleHQtdG9rZW4tbGlzdC1hY3RpdmUtc2VsZWN0aW9uLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXJcclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXHJcbiAgICAgICAgICA/LmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1pY29uLWZvcmVncm91bmRcIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xyXG4gICAgICBpZiAoaW5uZXIpIHtcclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyXHJcbiAgICAgICAgICAucXVlcnlTZWxlY3RvcihcInN2Z1wiKVxyXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBvcGVuU3RhbmRhbG9uZVNldHRpbmdzUGFuZWwocGFnZT86IEFjdGl2ZVBhZ2UpOiB2b2lkIHtcbiAgaWYgKCFkb2N1bWVudC5ib2R5KSByZXR1cm47XG5cbiAgaWYgKCFzdGFuZGFsb25lT3ZlcmxheT8uaXNDb25uZWN0ZWQpIHtcbiAgICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBvdmVybGF5LmRhdGFzZXQuY29kZXhwcFN0YW5kYWxvbmVPdmVybGF5ID0gXCJ0cnVlXCI7XG4gICAgb3ZlcmxheS5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgXCJwb3NpdGlvbjpmaXhlZFwiLFxuICAgICAgXCJpbnNldDowXCIsXG4gICAgICBcInotaW5kZXg6MjE0NzQ4MzY0NlwiLFxuICAgICAgXCJkaXNwbGF5OmZsZXhcIixcbiAgICAgIFwiYWxpZ24taXRlbXM6Y2VudGVyXCIsXG4gICAgICBcImp1c3RpZnktY29udGVudDpjZW50ZXJcIixcbiAgICAgIFwicGFkZGluZzoyNHB4XCIsXG4gICAgICBcImJhY2tncm91bmQ6cmdiYSgwLDAsMCwwLjM4KVwiLFxuICAgIF0uam9pbihcIjtcIik7XG5cbiAgICBjb25zdCBkaWFsb2cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGRpYWxvZy5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwiZGlhbG9nXCIpO1xuICAgIGRpYWxvZy5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwiQ29kZXgrKyBTZXR0aW5nc1wiKTtcbiAgICBkaWFsb2cuY2xhc3NOYW1lID1cbiAgICAgIFwiYmctdG9rZW4tbWFpbi1zdXJmYWNlLXByaW1hcnkgdGV4dC10b2tlbi10ZXh0LXByaW1hcnkgYm9yZGVyLXRva2VuLWJvcmRlclwiO1xuICAgIGRpYWxvZy5zdHlsZS5jc3NUZXh0ID0gW1xuICAgICAgXCJkaXNwbGF5OmZsZXhcIixcbiAgICAgIFwiZmxleC1kaXJlY3Rpb246Y29sdW1uXCIsXG4gICAgICBcIndpZHRoOm1pbigxMDAwcHgsIGNhbGMoMTAwdncgLSAzMnB4KSlcIixcbiAgICAgIFwiaGVpZ2h0Om1pbig3NjBweCwgY2FsYygxMDB2aCAtIDMycHgpKVwiLFxuICAgICAgXCJvdmVyZmxvdzpoaWRkZW5cIixcbiAgICAgIFwiYm9yZGVyOjFweCBzb2xpZCB2YXIoLS1jb2xvci10b2tlbi1ib3JkZXIsIHJnYmEoMTI3LDEyNywxMjcsMC4zNSkpXCIsXG4gICAgICBcImJvcmRlci1yYWRpdXM6MTJweFwiLFxuICAgICAgXCJiYWNrZ3JvdW5kOnZhcigtLWNvbG9yLXRva2VuLW1haW4tc3VyZmFjZS1wcmltYXJ5LCB2YXIoLS1jb2xvci1iYWNrZ3JvdW5kLCAjMTExKSlcIixcbiAgICAgIFwiY29sb3I6dmFyKC0tY29sb3ItdG9rZW4tdGV4dC1wcmltYXJ5LCBpbmhlcml0KVwiLFxuICAgICAgXCJib3gtc2hhZG93OjAgMjRweCA4MHB4IHJnYmEoMCwwLDAsMC40NSlcIixcbiAgICBdLmpvaW4oXCI7XCIpO1xuICAgIGRpYWxvZy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpO1xuICAgIG92ZXJsYXkuYXBwZW5kQ2hpbGQoZGlhbG9nKTtcblxuICAgIGNvbnN0IGNocm9tZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY2hyb21lLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICBcImRpc3BsYXk6ZmxleFwiLFxuICAgICAgXCJhbGlnbi1pdGVtczpjZW50ZXJcIixcbiAgICAgIFwianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW5cIixcbiAgICAgIFwiZ2FwOjEycHhcIixcbiAgICAgIFwibWluLWhlaWdodDo1MnB4XCIsXG4gICAgICBcInBhZGRpbmc6MCAxNnB4XCIsXG4gICAgICBcImJvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWNvbG9yLXRva2VuLWJvcmRlciwgcmdiYSgxMjcsMTI3LDEyNywwLjIyKSlcIixcbiAgICBdLmpvaW4oXCI7XCIpO1xuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0aXRsZS50ZXh0Q29udGVudCA9IFwiQ29kZXgrK1wiO1xuICAgIHRpdGxlLnN0eWxlLmNzc1RleHQgPSBcImZvbnQ6NjAwIDE1cHggc3lzdGVtLXVpLCBzYW5zLXNlcmlmO2xldHRlci1zcGFjaW5nOjA7XCI7XG4gICAgY2hyb21lLmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgICBjaHJvbWUuYXBwZW5kQ2hpbGQoc3RhbmRhbG9uZUNocm9tZUJ1dHRvbihcIkNsb3NlXCIsIGNsb3NlU3RhbmRhbG9uZVNldHRpbmdzUGFuZWwpKTtcbiAgICBkaWFsb2cuYXBwZW5kQ2hpbGQoY2hyb21lKTtcblxuICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGJvZHkuc3R5bGUuY3NzVGV4dCA9IFwiZGlzcGxheTpmbGV4O21pbi1oZWlnaHQ6MDtmbGV4OjE7XCI7XG4gICAgZGlhbG9nLmFwcGVuZENoaWxkKGJvZHkpO1xuXG4gICAgY29uc3QgbmF2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm5hdlwiKTtcbiAgICBuYXYuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIkNvZGV4KysgU2V0dGluZ3NcIik7XG4gICAgbmF2LnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICBcIndpZHRoOjIyMHB4XCIsXG4gICAgICBcImZsZXg6MCAwIDIyMHB4XCIsXG4gICAgICBcIm92ZXJmbG93OmF1dG9cIixcbiAgICAgIFwicGFkZGluZzoxMnB4XCIsXG4gICAgICBcImJvcmRlci1yaWdodDoxcHggc29saWQgdmFyKC0tY29sb3ItdG9rZW4tYm9yZGVyLCByZ2JhKDEyNywxMjcsMTI3LDAuMjIpKVwiLFxuICAgIF0uam9pbihcIjtcIik7XG4gICAgYm9keS5hcHBlbmRDaGlsZChuYXYpO1xuXG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibWFpblwiKTtcbiAgICBwYW5lbC5kYXRhc2V0LmNvZGV4cHAgPSBcInN0YW5kYWxvbmUtcGFuZWxcIjtcbiAgICBwYW5lbC5zdHlsZS5jc3NUZXh0ID0gXCJtaW4td2lkdGg6MDttaW4taGVpZ2h0OjA7ZmxleDoxO292ZXJmbG93OmhpZGRlbjtcIjtcbiAgICBib2R5LmFwcGVuZENoaWxkKHBhbmVsKTtcblxuICAgIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIGNsb3NlU3RhbmRhbG9uZVNldHRpbmdzUGFuZWwoKTtcbiAgICB9KTtcbiAgICBzdGFuZGFsb25lS2V5SGFuZGxlciA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICBpZiAoZS5rZXkgPT09IFwiRXNjYXBlXCIpIGNsb3NlU3RhbmRhbG9uZVNldHRpbmdzUGFuZWwoKTtcbiAgICB9O1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHN0YW5kYWxvbmVLZXlIYW5kbGVyLCB0cnVlKTtcblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG4gICAgc3RhbmRhbG9uZU92ZXJsYXkgPSBvdmVybGF5O1xuICAgIHN0YW5kYWxvbmVOYXZSb290ID0gbmF2O1xuICAgIHN0YW5kYWxvbmVQYW5lbCA9IHBhbmVsO1xuICB9XG5cbiAgc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZSh0cnVlLCBcInN0YW5kYWxvbmUtb3BlblwiKTtcbiAgcmVmcmVzaFN0YW5kYWxvbmVOYXYoKTtcbiAgYWN0aXZhdGVTdGFuZGFsb25lUGFnZShub3JtYWxpemVTdGFuZGFsb25lUGFnZShwYWdlID8/IHN0YXRlLmFjdGl2ZVBhZ2UpID8/IHsga2luZDogXCJ0d2Vha3NcIiB9KTtcbn1cblxuZnVuY3Rpb24gY2xvc2VTdGFuZGFsb25lU2V0dGluZ3NQYW5lbCgpOiB2b2lkIHtcbiAgY29uc3QgcGFuZWwgPSBzdGFuZGFsb25lUGFuZWw7XG4gIGNvbnN0IGFjdGl2ZSA9IHN0YXRlLmFjdGl2ZVBhZ2U7XG4gIGlmIChhY3RpdmU/LmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiKSB7XG4gICAgY29uc3QgZW50cnkgPSBzdGF0ZS5wYWdlcy5nZXQoYWN0aXZlLmlkKTtcbiAgICB0cnkge1xuICAgICAgZW50cnk/LnRlYXJkb3duPy4oKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBwbG9nKFwic3RhbmRhbG9uZSBwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBhY3RpdmUuaWQsIGVycjogU3RyaW5nKGUpIH0pO1xuICAgIH1cbiAgICBpZiAoZW50cnkpIGVudHJ5LnRlYXJkb3duID0gbnVsbDtcbiAgfVxuXG4gIHN0YW5kYWxvbmVPdmVybGF5Py5yZW1vdmUoKTtcbiAgc3RhbmRhbG9uZU92ZXJsYXkgPSBudWxsO1xuICBzdGFuZGFsb25lTmF2Um9vdCA9IG51bGw7XG4gIHN0YW5kYWxvbmVQYW5lbCA9IG51bGw7XG4gIHN0YW5kYWxvbmVOYXZCdXR0b25zID0gbnVsbDtcbiAgc3RhbmRhbG9uZVBhZ2VCdXR0b25zID0gbmV3IE1hcCgpO1xuXG4gIGlmIChzdGFuZGFsb25lS2V5SGFuZGxlcikge1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHN0YW5kYWxvbmVLZXlIYW5kbGVyLCB0cnVlKTtcbiAgICBzdGFuZGFsb25lS2V5SGFuZGxlciA9IG51bGw7XG4gIH1cbiAgaWYgKHBhbmVsICYmIHN0YXRlLnBhbmVsSG9zdCA9PT0gcGFuZWwpIHtcbiAgICBzdGF0ZS5wYW5lbEhvc3QgPSBudWxsO1xuICAgIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xuICB9XG4gIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUoZmFsc2UsIFwic3RhbmRhbG9uZS1jbG9zZWRcIik7XG59XG5cbmZ1bmN0aW9uIGFjdGl2YXRlU3RhbmRhbG9uZVBhZ2UocGFnZTogQWN0aXZlUGFnZSk6IHZvaWQge1xuICBpZiAoIXN0YW5kYWxvbmVQYW5lbD8uaXNDb25uZWN0ZWQpIHtcbiAgICBvcGVuU3RhbmRhbG9uZVNldHRpbmdzUGFuZWwocGFnZSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVTdGFuZGFsb25lUGFnZShwYWdlKSA/PyB7IGtpbmQ6IFwidHdlYWtzXCIgfTtcbiAgc3RhdGUuYWN0aXZlUGFnZSA9IG5vcm1hbGl6ZWQ7XG4gIHN0YXRlLnBhbmVsSG9zdCA9IHN0YW5kYWxvbmVQYW5lbDtcbiAgcGxvZyhcInN0YW5kYWxvbmUgYWN0aXZhdGVcIiwgeyBwYWdlOiBub3JtYWxpemVkIH0pO1xuICByZXJlbmRlcigpO1xuICBzeW5jU3RhbmRhbG9uZU5hdkFjdGl2ZSgpO1xufVxuXG5mdW5jdGlvbiBmYWxsYmFja0FmdGVyUmVnaXN0ZXJlZFBhZ2VSZW1vdmVkKCk6IHZvaWQge1xuICBpZiAoc3RhbmRhbG9uZVBhbmVsPy5pc0Nvbm5lY3RlZCkge1xuICAgIGFjdGl2YXRlU3RhbmRhbG9uZVBhZ2UoeyBraW5kOiBcInR3ZWFrc1wiIH0pO1xuICB9IGVsc2Uge1xuICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTdGFuZGFsb25lUGFnZShwYWdlOiBBY3RpdmVQYWdlIHwgbnVsbCB8IHVuZGVmaW5lZCk6IEFjdGl2ZVBhZ2UgfCBudWxsIHtcbiAgaWYgKCFwYWdlKSByZXR1cm4gbnVsbDtcbiAgaWYgKHBhZ2Uua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgIXN0YXRlLnBhZ2VzLmhhcyhwYWdlLmlkKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiBwYWdlO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU3RhbmRhbG9uZU5hdigpOiB2b2lkIHtcbiAgY29uc3Qgcm9vdCA9IHN0YW5kYWxvbmVOYXZSb290O1xuICBpZiAoIXJvb3Q/LmlzQ29ubmVjdGVkKSByZXR1cm47XG5cbiAgcm9vdC50ZXh0Q29udGVudCA9IFwiXCI7XG4gIHN0YW5kYWxvbmVQYWdlQnV0dG9ucyA9IG5ldyBNYXAoKTtcblxuICBjb25zdCBidWlsdGlucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGJ1aWx0aW5zLnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjNweDtcIjtcbiAgYnVpbHRpbnMuYXBwZW5kQ2hpbGQoc3RhbmRhbG9uZU5hdkhlYWRlcihcIkNvZGV4KytcIikpO1xuXG4gIGNvbnN0IGNvbmZpZ0J0biA9IG1ha2VTdGFuZGFsb25lTmF2QnV0dG9uKFwiQ29uZmlnXCIsIGNvbmZpZ0ljb25TdmcoKSwgKCkgPT4ge1xuICAgIGFjdGl2YXRlU3RhbmRhbG9uZVBhZ2UoeyBraW5kOiBcImNvbmZpZ1wiIH0pO1xuICB9KTtcbiAgY29uc3QgdHdlYWtzQnRuID0gbWFrZVN0YW5kYWxvbmVOYXZCdXR0b24oXCJUd2Vha3NcIiwgdHdlYWtzSWNvblN2ZygpLCAoKSA9PiB7XG4gICAgYWN0aXZhdGVTdGFuZGFsb25lUGFnZSh7IGtpbmQ6IFwidHdlYWtzXCIgfSk7XG4gIH0pO1xuICBjb25zdCBzdG9yZUJ0biA9IG1ha2VTdGFuZGFsb25lTmF2QnV0dG9uKFwiVHdlYWsgU3RvcmVcIiwgc3RvcmVJY29uU3ZnKCksICgpID0+IHtcbiAgICBhY3RpdmF0ZVN0YW5kYWxvbmVQYWdlKHsga2luZDogXCJzdG9yZVwiIH0pO1xuICB9KTtcbiAgYnVpbHRpbnMuYXBwZW5kKGNvbmZpZ0J0biwgdHdlYWtzQnRuLCBzdG9yZUJ0bik7XG4gIHJvb3QuYXBwZW5kQ2hpbGQoYnVpbHRpbnMpO1xuICBzdGFuZGFsb25lTmF2QnV0dG9ucyA9IHsgY29uZmlnOiBjb25maWdCdG4sIHR3ZWFrczogdHdlYWtzQnRuLCBzdG9yZTogc3RvcmVCdG4gfTtcblxuICBjb25zdCBwYWdlcyA9IFsuLi5zdGF0ZS5wYWdlcy52YWx1ZXMoKV07XG4gIGlmIChwYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgcGFnZUdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBwYWdlR3JvdXAuc3R5bGUuY3NzVGV4dCA9IFwiZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6M3B4O21hcmdpbi10b3A6MTRweDtcIjtcbiAgICBwYWdlR3JvdXAuYXBwZW5kQ2hpbGQoc3RhbmRhbG9uZU5hdkhlYWRlcihcIlR3ZWFrIFBhZ2VzXCIpKTtcbiAgICBmb3IgKGNvbnN0IHAgb2YgcGFnZXMpIHtcbiAgICAgIGNvbnN0IGJ0biA9IG1ha2VTdGFuZGFsb25lTmF2QnV0dG9uKFxuICAgICAgICBwLnBhZ2UudGl0bGUsXG4gICAgICAgIHAucGFnZS5pY29uU3ZnID8/IGRlZmF1bHRQYWdlSWNvblN2ZygpLFxuICAgICAgICAoKSA9PiBhY3RpdmF0ZVN0YW5kYWxvbmVQYWdlKHsga2luZDogXCJyZWdpc3RlcmVkXCIsIGlkOiBwLmlkIH0pLFxuICAgICAgKTtcbiAgICAgIHN0YW5kYWxvbmVQYWdlQnV0dG9ucy5zZXQocC5pZCwgYnRuKTtcbiAgICAgIHBhZ2VHcm91cC5hcHBlbmRDaGlsZChidG4pO1xuICAgIH1cbiAgICByb290LmFwcGVuZENoaWxkKHBhZ2VHcm91cCk7XG4gIH1cblxuICBzeW5jU3RhbmRhbG9uZU5hdkFjdGl2ZSgpO1xufVxuXG5mdW5jdGlvbiBzdGFuZGFsb25lTmF2SGVhZGVyKHRleHQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyLnRleHRDb250ZW50ID0gdGV4dDtcbiAgaGVhZGVyLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgXCJwYWRkaW5nOjZweCAxMHB4IDRweFwiLFxuICAgIFwiZm9udDo2MDAgMTFweCBzeXN0ZW0tdWksIHNhbnMtc2VyaWZcIixcbiAgICBcImxldHRlci1zcGFjaW5nOjBcIixcbiAgICBcInRleHQtdHJhbnNmb3JtOnVwcGVyY2FzZVwiLFxuICAgIFwiY29sb3I6dmFyKC0tY29sb3ItdG9rZW4tdGV4dC1zZWNvbmRhcnksIHJnYmEoMTI3LDEyNywxMjcsMC45KSlcIixcbiAgXS5qb2luKFwiO1wiKTtcbiAgcmV0dXJuIGhlYWRlcjtcbn1cblxuZnVuY3Rpb24gbWFrZVN0YW5kYWxvbmVOYXZCdXR0b24oXG4gIGxhYmVsOiBzdHJpbmcsXG4gIGljb25Tdmc6IHN0cmluZyxcbiAgb25DbGljazogKCkgPT4gdm9pZCxcbik6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uc3R5bGUuY3NzVGV4dCA9IFtcbiAgICBcIndpZHRoOjEwMCVcIixcbiAgICBcImRpc3BsYXk6ZmxleFwiLFxuICAgIFwiYWxpZ24taXRlbXM6Y2VudGVyXCIsXG4gICAgXCJnYXA6OXB4XCIsXG4gICAgXCJib3JkZXI6MFwiLFxuICAgIFwiYm9yZGVyLXJhZGl1czo4cHhcIixcbiAgICBcImJhY2tncm91bmQ6dHJhbnNwYXJlbnRcIixcbiAgICBcImNvbG9yOnZhcigtLWNvbG9yLXRva2VuLXRleHQtcHJpbWFyeSwgaW5oZXJpdClcIixcbiAgICBcInBhZGRpbmc6OHB4IDEwcHhcIixcbiAgICBcInRleHQtYWxpZ246bGVmdFwiLFxuICAgIFwiZm9udDo0MDAgMTNweCBzeXN0ZW0tdWksIHNhbnMtc2VyaWZcIixcbiAgICBcImN1cnNvcjpwb2ludGVyXCIsXG4gICAgXCJsZXR0ZXItc3BhY2luZzowXCIsXG4gIF0uam9pbihcIjtcIik7XG5cbiAgY29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBpY29uLnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6aW5saW5lLWZsZXg7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtmbGV4OjAgMCAyMHB4O1wiO1xuICBpY29uLmlubmVySFRNTCA9IGljb25Tdmc7XG4gIGJ0bi5hcHBlbmRDaGlsZChpY29uKTtcblxuICBjb25zdCB0ZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIHRleHQudGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgdGV4dC5zdHlsZS5jc3NUZXh0ID0gXCJtaW4td2lkdGg6MDtvdmVyZmxvdzpoaWRkZW47dGV4dC1vdmVyZmxvdzplbGxpcHNpczt3aGl0ZS1zcGFjZTpub3dyYXA7XCI7XG4gIGJ0bi5hcHBlbmRDaGlsZCh0ZXh0KTtcblxuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4ge1xuICAgIGlmIChidG4uZGF0YXNldC5hY3RpdmUgIT09IFwidHJ1ZVwiKSB7XG4gICAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCByZ2JhKDEyNywxMjcsMTI3LDAuMTApKVwiO1xuICAgIH1cbiAgfSk7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XG4gICAgaWYgKGJ0bi5kYXRhc2V0LmFjdGl2ZSAhPT0gXCJ0cnVlXCIpIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gXCJ0cmFuc3BhcmVudFwiO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIG9uQ2xpY2soKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIHN0YW5kYWxvbmVDaHJvbWVCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgYnRuLnN0eWxlLmNzc1RleHQgPSBbXG4gICAgXCJoZWlnaHQ6MzJweFwiLFxuICAgIFwiYm9yZGVyLXJhZGl1czo4cHhcIixcbiAgICBcImJvcmRlcjoxcHggc29saWQgdmFyKC0tY29sb3ItdG9rZW4tYm9yZGVyLCByZ2JhKDEyNywxMjcsMTI3LDAuMzUpKVwiLFxuICAgIFwiYmFja2dyb3VuZDp0cmFuc3BhcmVudFwiLFxuICAgIFwiY29sb3I6dmFyKC0tY29sb3ItdG9rZW4tdGV4dC1wcmltYXJ5LCBpbmhlcml0KVwiLFxuICAgIFwicGFkZGluZzowIDEwcHhcIixcbiAgICBcImZvbnQ6NTAwIDEycHggc3lzdGVtLXVpLCBzYW5zLXNlcmlmXCIsXG4gICAgXCJjdXJzb3I6cG9pbnRlclwiLFxuICAgIFwibGV0dGVyLXNwYWNpbmc6MFwiLFxuICBdLmpvaW4oXCI7XCIpO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gc3luY1N0YW5kYWxvbmVOYXZBY3RpdmUoKTogdm9pZCB7XG4gIGNvbnN0IGFjdGl2ZSA9IHN0YXRlLmFjdGl2ZVBhZ2U7XG4gIGlmIChzdGFuZGFsb25lTmF2QnV0dG9ucykge1xuICAgIHNldFN0YW5kYWxvbmVCdXR0b25BY3RpdmUoc3RhbmRhbG9uZU5hdkJ1dHRvbnMuY29uZmlnLCBhY3RpdmU/LmtpbmQgPT09IFwiY29uZmlnXCIpO1xuICAgIHNldFN0YW5kYWxvbmVCdXR0b25BY3RpdmUoc3RhbmRhbG9uZU5hdkJ1dHRvbnMudHdlYWtzLCBhY3RpdmU/LmtpbmQgPT09IFwidHdlYWtzXCIpO1xuICAgIHNldFN0YW5kYWxvbmVCdXR0b25BY3RpdmUoc3RhbmRhbG9uZU5hdkJ1dHRvbnMuc3RvcmUsIGFjdGl2ZT8ua2luZCA9PT0gXCJzdG9yZVwiKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtpZCwgYnRuXSBvZiBzdGFuZGFsb25lUGFnZUJ1dHRvbnMpIHtcbiAgICBzZXRTdGFuZGFsb25lQnV0dG9uQWN0aXZlKFxuICAgICAgYnRuLFxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInJlZ2lzdGVyZWRcIiAmJiBhY3RpdmUuaWQgPT09IGlkLFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0U3RhbmRhbG9uZUJ1dHRvbkFjdGl2ZShidG46IEhUTUxCdXR0b25FbGVtZW50LCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgYnRuLmRhdGFzZXQuYWN0aXZlID0gYWN0aXZlID8gXCJ0cnVlXCIgOiBcImZhbHNlXCI7XG4gIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gYWN0aXZlXG4gICAgPyBcInZhcigtLWNvbG9yLXRva2VuLWJnLWZvZywgcmdiYSgxMjcsMTI3LDEyNywwLjE2KSlcIlxuICAgIDogXCJ0cmFuc3BhcmVudFwiO1xuICBidG4uc3R5bGUuZm9udFdlaWdodCA9IGFjdGl2ZSA/IFwiNjAwXCIgOiBcIjQwMFwiO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgYWN0aXZhdGlvbiBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gYWN0aXZhdGVQYWdlKHBhZ2U6IEFjdGl2ZVBhZ2UpOiB2b2lkIHtcbiAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xuICBpZiAoIWNvbnRlbnQpIHtcbiAgICBpZiAoc3RhbmRhbG9uZVBhbmVsPy5pc0Nvbm5lY3RlZCkge1xuICAgICAgYWN0aXZhdGVTdGFuZGFsb25lUGFnZShwYWdlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcGxvZyhcImFjdGl2YXRlOiBjb250ZW50IGFyZWEgbm90IGZvdW5kXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBzdGF0ZS5hY3RpdmVQYWdlID0gcGFnZTtcclxuICBwbG9nKFwiYWN0aXZhdGVcIiwgeyBwYWdlIH0pO1xyXG5cclxuICAvLyBIaWRlIENvZGV4J3MgY29udGVudCBjaGlsZHJlbiwgc2hvdyBvdXJzLlxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XHJcbiAgICBpZiAoY2hpbGQuZGF0YXNldC5jb2RleHBwID09PSBcInR3ZWFrcy1wYW5lbFwiKSBjb250aW51ZTtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gPSBjaGlsZC5zdHlsZS5kaXNwbGF5IHx8IFwiXCI7XHJcbiAgICB9XHJcbiAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgfVxyXG4gIGxldCBwYW5lbCA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ1tkYXRhLWNvZGV4cHA9XCJ0d2Vha3MtcGFuZWxcIl0nKTtcclxuICBpZiAoIXBhbmVsKSB7XHJcbiAgICBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBwYW5lbC5kYXRhc2V0LmNvZGV4cHAgPSBcInR3ZWFrcy1wYW5lbFwiO1xyXG4gICAgcGFuZWwuc3R5bGUuY3NzVGV4dCA9IFwid2lkdGg6MTAwJTtoZWlnaHQ6MTAwJTtvdmVyZmxvdzphdXRvO1wiO1xyXG4gICAgY29udGVudC5hcHBlbmRDaGlsZChwYW5lbCk7XHJcbiAgfVxyXG4gIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XHJcbiAgc3RhdGUucGFuZWxIb3N0ID0gcGFuZWw7XHJcbiAgcmVyZW5kZXIoKTtcclxuICBzZXROYXZBY3RpdmUocGFnZSk7XHJcbiAgLy8gcmVzdG9yZSBDb2RleCdzIHZpZXcuIFJlLXJlZ2lzdGVyIGlmIG5lZWRlZC5cclxuICBjb25zdCBzaWRlYmFyID0gc3RhdGUuc2lkZWJhclJvb3Q7XHJcbiAgaWYgKHNpZGViYXIpIHtcclxuICAgIGlmIChzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIpIHtcclxuICAgICAgc2lkZWJhci5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyLCB0cnVlKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGhhbmRsZXIgPSAoZTogRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xyXG4gICAgICBpZiAoc3RhdGUubmF2R3JvdXA/LmNvbnRhaW5zKHRhcmdldCkpIHJldHVybjsgLy8gb3VyIGJ1dHRvbnNcclxuICAgICAgaWYgKHN0YXRlLnBhZ2VzR3JvdXA/LmNvbnRhaW5zKHRhcmdldCkpIHJldHVybjsgLy8gb3VyIHBhZ2UgYnV0dG9uc1xyXG4gICAgICBpZiAodGFyZ2V0LmNsb3Nlc3QoXCJbZGF0YS1jb2RleHBwLXNldHRpbmdzLXNlYXJjaF1cIikpIHJldHVybjtcclxuICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xyXG4gICAgfTtcclxuICAgIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlciA9IGhhbmRsZXI7XHJcbiAgICBzaWRlYmFyLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVyLCB0cnVlKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc3RvcmVDb2RleFZpZXcoKTogdm9pZCB7XHJcbiAgcGxvZyhcInJlc3RvcmUgY29kZXggdmlld1wiKTtcclxuICBjb25zdCBjb250ZW50ID0gZmluZENvbnRlbnRBcmVhKCk7XHJcbiAgaWYgKCFjb250ZW50KSByZXR1cm47XHJcbiAgaWYgKHN0YXRlLnBhbmVsSG9zdCkgc3RhdGUucGFuZWxIb3N0LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oY29udGVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xyXG4gICAgaWYgKGNoaWxkID09PSBzdGF0ZS5wYW5lbEhvc3QpIGNvbnRpbnVlO1xyXG4gICAgaWYgKGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNoaWxkLnN0eWxlLmRpc3BsYXkgPSBjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW47XHJcbiAgICAgIGRlbGV0ZSBjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW47XHJcbiAgICB9XHJcbiAgfVxyXG4gIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xyXG4gIHNldE5hdkFjdGl2ZShudWxsKTtcclxuICBpZiAoc3RhdGUuc2lkZWJhclJvb3QgJiYgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyKSB7XHJcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdC5yZW1vdmVFdmVudExpc3RlbmVyKFxyXG4gICAgICBcImNsaWNrXCIsXHJcbiAgICAgIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcixcclxuICAgICAgdHJ1ZSxcclxuICAgICk7XHJcbiAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIgPSBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVyZW5kZXIoKTogdm9pZCB7XHJcbiAgaWYgKCFzdGF0ZS5hY3RpdmVQYWdlKSByZXR1cm47XHJcbiAgY29uc3QgaG9zdCA9IHN0YXRlLnBhbmVsSG9zdDtcclxuICBpZiAoIWhvc3QpIHJldHVybjtcclxuICBob3N0LmlubmVySFRNTCA9IFwiXCI7XHJcblxyXG4gIGNvbnN0IGFwID0gc3RhdGUuYWN0aXZlUGFnZTtcclxuICBpZiAoYXAua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIpIHtcclxuICAgIGNvbnN0IGVudHJ5ID0gc3RhdGUucGFnZXMuZ2V0KGFwLmlkKTtcclxuICAgIGlmICghZW50cnkpIHtcclxuICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCByb290ID0gcGFuZWxTaGVsbChlbnRyeS5wYWdlLnRpdGxlLCBlbnRyeS5wYWdlLmRlc2NyaXB0aW9uKTtcclxuICAgIGhvc3QuYXBwZW5kQ2hpbGQocm9vdC5vdXRlcik7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBUZWFyIGRvd24gYW55IHByaW9yIHJlbmRlciBiZWZvcmUgcmUtcmVuZGVyaW5nIChob3QgcmVsb2FkKS5cclxuICAgICAgdHJ5IHsgZW50cnkudGVhcmRvd24/LigpOyB9IGNhdGNoIHt9XHJcbiAgICAgIGVudHJ5LnRlYXJkb3duID0gbnVsbDtcclxuICAgICAgY29uc3QgcmV0ID0gZW50cnkucGFnZS5yZW5kZXIocm9vdC5zZWN0aW9uc1dyYXApO1xyXG4gICAgICBpZiAodHlwZW9mIHJldCA9PT0gXCJmdW5jdGlvblwiKSBlbnRyeS50ZWFyZG93biA9IHJldDtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc3QgZXJyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZXJyLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi1jaGFydHMtcmVkIHRleHQtc21cIjtcclxuICAgICAgZXJyLnRleHRDb250ZW50ID0gYEVycm9yIHJlbmRlcmluZyBwYWdlOiAkeyhlIGFzIEVycm9yKS5tZXNzYWdlfWA7XHJcbiAgICAgIHJvb3Quc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKGVycik7XHJcbiAgICB9XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCB0aXRsZSA9XHJcbiAgICBhcC5raW5kID09PSBcInR3ZWFrc1wiID8gXCJUd2Vha3NcIiA6XHJcbiAgICBhcC5raW5kID09PSBcInN0b3JlXCIgPyBcIlR3ZWFrIFN0b3JlXCIgOiBcIkNvbmZpZ1wiO1xyXG4gIGNvbnN0IHN1YnRpdGxlID1cclxuICAgIGFwLmtpbmQgPT09IFwidHdlYWtzXCJcclxuICAgICAgPyBcIk1hbmFnZSB5b3VyIGluc3RhbGxlZCBDb2RleCsrIHR3ZWFrcy5cIlxyXG4gICAgICA6IGFwLmtpbmQgPT09IFwic3RvcmVcIlxyXG4gICAgICAgID8gXCJJbnN0YWxsIHJldmlld2VkIHR3ZWFrcyBwaW5uZWQgdG8gYXBwcm92ZWQgR2l0SHViIGNvbW1pdHMuXCJcclxuICAgICAgICA6IFwiQ2hlY2tpbmcgaW5zdGFsbGVkIENvZGV4KysgdmVyc2lvbi5cIjtcclxuICBjb25zdCByb290ID0gcGFuZWxTaGVsbCh0aXRsZSwgc3VidGl0bGUpO1xyXG4gIGhvc3QuYXBwZW5kQ2hpbGQocm9vdC5vdXRlcik7XHJcbiAgaWYgKGFwLmtpbmQgPT09IFwidHdlYWtzXCIpIHJlbmRlclR3ZWFrc1BhZ2Uocm9vdC5zZWN0aW9uc1dyYXApO1xyXG4gIGVsc2UgaWYgKGFwLmtpbmQgPT09IFwic3RvcmVcIikgcmVuZGVyVHdlYWtTdG9yZVBhZ2Uocm9vdC5zZWN0aW9uc1dyYXAsIHJvb3QuaGVhZGVyQWN0aW9ucyk7XHJcbiAgZWxzZSByZW5kZXJDb25maWdQYWdlKHJvb3Quc2VjdGlvbnNXcmFwLCByb290LnN1YnRpdGxlKTtcclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHBhZ2VzIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gcmVuZGVyQ29uZmlnUGFnZShzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50LCBzdWJ0aXRsZT86IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XHJcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJDb2RleCsrIFVwZGF0ZXNcIikpO1xyXG4gIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xyXG4gIGNhcmQuZGF0YXNldC5jb2RleHBwQ29uZmlnQ2FyZCA9IFwidHJ1ZVwiO1xyXG4gIGNvbnN0IGxvYWRpbmcgPSByb3dTaW1wbGUoXCJMb2FkaW5nIHVwZGF0ZSBzZXR0aW5nc1wiLCBcIkNoZWNraW5nIGN1cnJlbnQgQ29kZXgrKyBjb25maWd1cmF0aW9uLlwiKTtcclxuICBjYXJkLmFwcGVuZENoaWxkKGxvYWRpbmcpO1xyXG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoY2FyZCk7XHJcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xyXG5cclxuICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAuaW52b2tlKFwiY29kZXhwcDpnZXQtY29uZmlnXCIpXHJcbiAgICAudGhlbigoY29uZmlnKSA9PiB7XHJcbiAgICAgIGlmIChzdWJ0aXRsZSkge1xyXG4gICAgICAgIHN1YnRpdGxlLnRleHRDb250ZW50ID0gYFlvdSBoYXZlIENvZGV4KysgJHsoY29uZmlnIGFzIENvZGV4UGx1c1BsdXNDb25maWcpLnZlcnNpb259IGluc3RhbGxlZC5gO1xyXG4gICAgICB9XHJcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xyXG4gICAgICByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQsIGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKGUpID0+IHtcclxuICAgICAgaWYgKHN1YnRpdGxlKSBzdWJ0aXRsZS50ZXh0Q29udGVudCA9IFwiQ291bGQgbm90IGxvYWQgaW5zdGFsbGVkIENvZGV4KysgdmVyc2lvbi5cIjtcclxuICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XHJcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IGxvYWQgdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xyXG4gICAgfSk7XHJcblxyXG4gIGNvbnN0IHdhdGNoZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICB3YXRjaGVyLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xyXG4gIHdhdGNoZXIuYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiQXV0by1SZXBhaXIgV2F0Y2hlclwiKSk7XHJcbiAgY29uc3Qgd2F0Y2hlckNhcmQgPSByb3VuZGVkQ2FyZCgpO1xyXG4gIHdhdGNoZXJDYXJkLmFwcGVuZENoaWxkKHJvd1NpbXBsZShcIkNoZWNraW5nIHdhdGNoZXJcIiwgXCJWZXJpZnlpbmcgdGhlIHVwZGF0ZXIgcmVwYWlyIHNlcnZpY2UuXCIpKTtcclxuICB3YXRjaGVyLmFwcGVuZENoaWxkKHdhdGNoZXJDYXJkKTtcclxuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod2F0Y2hlcik7XHJcbiAgcmVuZGVyV2F0Y2hlckhlYWx0aENhcmQod2F0Y2hlckNhcmQpO1xyXG5cclxuICBjb25zdCBtYWludGVuYW5jZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIG1haW50ZW5hbmNlLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xyXG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIk1haW50ZW5hbmNlXCIpKTtcclxuICBjb25zdCBtYWludGVuYW5jZUNhcmQgPSByb3VuZGVkQ2FyZCgpO1xyXG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZCh1bmluc3RhbGxSb3coKSk7XHJcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKHJlcG9ydEJ1Z1JvdygpKTtcclxuICBtYWludGVuYW5jZS5hcHBlbmRDaGlsZChtYWludGVuYW5jZUNhcmQpO1xyXG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChtYWludGVuYW5jZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlckNvZGV4UGx1c1BsdXNDb25maWcoY2FyZDogSFRNTEVsZW1lbnQsIGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IHZvaWQge1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQoYXV0b1VwZGF0ZVJvdyhjb25maWcpKTtcclxuICBjYXJkLmFwcGVuZENoaWxkKHVwZGF0ZUNoYW5uZWxSb3coY29uZmlnKSk7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChpbnN0YWxsYXRpb25Tb3VyY2VSb3coY29uZmlnLmluc3RhbGxhdGlvblNvdXJjZSkpO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQoc2VsZlVwZGF0ZVN0YXR1c1Jvdyhjb25maWcuc2VsZlVwZGF0ZSkpO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQoY2hlY2tGb3JVcGRhdGVzUm93KGNvbmZpZykpO1xyXG4gIGlmIChjb25maWcudXBkYXRlQ2hlY2spIGNhcmQuYXBwZW5kQ2hpbGQocmVsZWFzZU5vdGVzUm93KGNvbmZpZy51cGRhdGVDaGVjaykpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhdXRvVXBkYXRlUm93KGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcclxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XHJcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIkF1dG9tYXRpY2FsbHkgcmVmcmVzaCBDb2RleCsrXCI7XHJcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZGVzYy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgbWluLXctMCB0ZXh0LXNtXCI7XHJcbiAgZGVzYy50ZXh0Q29udGVudCA9IGBJbnN0YWxsZWQgdmVyc2lvbiB2JHtjb25maWcudmVyc2lvbn0uIFRoZSB3YXRjaGVyIGNoZWNrcyBob3VybHkgYW5kIGNhbiByZWZyZXNoIHRoZSBDb2RleCsrIHJ1bnRpbWUgYXV0b21hdGljYWxseS5gO1xyXG4gIGxlZnQuYXBwZW5kQ2hpbGQodGl0bGUpO1xyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoZGVzYyk7XHJcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChcclxuICAgIHN3aXRjaENvbnRyb2woY29uZmlnLmF1dG9VcGRhdGUsIGFzeW5jIChuZXh0KSA9PiB7XHJcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6c2V0LWF1dG8tdXBkYXRlXCIsIG5leHQpO1xyXG4gICAgfSksXHJcbiAgKTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGVDaGFubmVsUm93KGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXCJSZWxlYXNlIGNoYW5uZWxcIiwgdXBkYXRlQ2hhbm5lbFN1bW1hcnkoY29uZmlnKSk7XHJcbiAgY29uc3QgYWN0aW9uID0gcm93LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1yb3ctYWN0aW9uc11cIik7XHJcbiAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlbGVjdFwiKTtcclxuICBzZWxlY3QuY2xhc3NOYW1lID1cclxuICAgIFwiaC04IHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdHJhbnNwYXJlbnQgcHgtMiB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGZvY3VzOm91dGxpbmUtbm9uZVwiO1xyXG4gIGZvciAoY29uc3QgW3ZhbHVlLCBsYWJlbF0gb2YgW1xyXG4gICAgW1wic3RhYmxlXCIsIFwiU3RhYmxlXCJdLFxyXG4gICAgW1wicHJlcmVsZWFzZVwiLCBcIlByZXJlbGVhc2VcIl0sXHJcbiAgICBbXCJjdXN0b21cIiwgXCJDdXN0b21cIl0sXHJcbiAgXSBhcyBjb25zdCkge1xyXG4gICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9wdGlvblwiKTtcclxuICAgIG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xyXG4gICAgb3B0aW9uLnRleHRDb250ZW50ID0gbGFiZWw7XHJcbiAgICBvcHRpb24uc2VsZWN0ZWQgPSBjb25maWcudXBkYXRlQ2hhbm5lbCA9PT0gdmFsdWU7XHJcbiAgICBzZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcclxuICB9XHJcbiAgc2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xyXG4gICAgdm9pZCBpcGNSZW5kZXJlclxyXG4gICAgICAuaW52b2tlKFwiY29kZXhwcDpzZXQtdXBkYXRlLWNvbmZpZ1wiLCB7IHVwZGF0ZUNoYW5uZWw6IHNlbGVjdC52YWx1ZSB9KVxyXG4gICAgICAudGhlbigoKSA9PiByZWZyZXNoQ29uZmlnQ2FyZChyb3cpKVxyXG4gICAgICAuY2F0Y2goKGUpID0+IHBsb2coXCJzZXQgdXBkYXRlIGNoYW5uZWwgZmFpbGVkXCIsIFN0cmluZyhlKSkpO1xyXG4gIH0pO1xyXG4gIGFjdGlvbj8uYXBwZW5kQ2hpbGQoc2VsZWN0KTtcclxuICBpZiAoY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IFwiY3VzdG9tXCIpIHtcclxuICAgIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXHJcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJFZGl0XCIsICgpID0+IHtcclxuICAgICAgICBjb25zdCByZXBvID0gd2luZG93LnByb21wdChcIkdpdEh1YiByZXBvXCIsIGNvbmZpZy51cGRhdGVSZXBvIHx8IFwiYi1ubmV0dC9jb2RleC1wbHVzcGx1c1wiKTtcclxuICAgICAgICBpZiAocmVwbyA9PT0gbnVsbCkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHJlZiA9IHdpbmRvdy5wcm9tcHQoXCJHaXQgcmVmXCIsIGNvbmZpZy51cGRhdGVSZWYgfHwgXCJtYWluXCIpO1xyXG4gICAgICAgIGlmIChyZWYgPT09IG51bGwpIHJldHVybjtcclxuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpzZXQtdXBkYXRlLWNvbmZpZ1wiLCB7XHJcbiAgICAgICAgICAgIHVwZGF0ZUNoYW5uZWw6IFwiY3VzdG9tXCIsXHJcbiAgICAgICAgICAgIHVwZGF0ZVJlcG86IHJlcG8sXHJcbiAgICAgICAgICAgIHVwZGF0ZVJlZjogcmVmLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC50aGVuKCgpID0+IHJlZnJlc2hDb25maWdDYXJkKHJvdykpXHJcbiAgICAgICAgICAuY2F0Y2goKGUpID0+IHBsb2coXCJzZXQgY3VzdG9tIHVwZGF0ZSBzb3VyY2UgZmFpbGVkXCIsIFN0cmluZyhlKSkpO1xyXG4gICAgICB9KSxcclxuICAgICk7XHJcbiAgfVxyXG4gIHJldHVybiByb3c7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGluc3RhbGxhdGlvblNvdXJjZVJvdyhzb3VyY2U6IEluc3RhbGxhdGlvblNvdXJjZSk6IEhUTUxFbGVtZW50IHtcclxuICByZXR1cm4gcm93U2ltcGxlKFwiSW5zdGFsbGF0aW9uIHNvdXJjZVwiLCBgJHtzb3VyY2UubGFiZWx9OiAke3NvdXJjZS5kZXRhaWx9YCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlbGZVcGRhdGVTdGF0dXNSb3coc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gcm93U2ltcGxlKFwiTGFzdCBDb2RleCsrIHVwZGF0ZVwiLCBzZWxmVXBkYXRlU3VtbWFyeShzdGF0ZSkpO1xyXG4gIGNvbnN0IGxlZnQgPSByb3cuZmlyc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIGlmIChsZWZ0ICYmIHN0YXRlKSBsZWZ0LnByZXBlbmQoc3RhdHVzQmFkZ2Uoc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdGUuc3RhdHVzKSwgc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXRlLnN0YXR1cykpKTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja0ZvclVwZGF0ZXNSb3coY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGNoZWNrID0gY29uZmlnLnVwZGF0ZUNoZWNrO1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPyBcIkNvZGV4KysgdXBkYXRlIGF2YWlsYWJsZVwiIDogXCJDaGVjayBmb3IgQ29kZXgrKyB1cGRhdGVzXCI7XHJcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZGVzYy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgbWluLXctMCB0ZXh0LXNtXCI7XHJcbiAgZGVzYy50ZXh0Q29udGVudCA9IHVwZGF0ZVN1bW1hcnkoY2hlY2spO1xyXG4gIGxlZnQuYXBwZW5kQ2hpbGQodGl0bGUpO1xyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoZGVzYyk7XHJcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xyXG5cclxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcclxuICBpZiAoY2hlY2s/LnJlbGVhc2VVcmwpIHtcclxuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXHJcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlIE5vdGVzXCIsICgpID0+IHtcclxuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCBjaGVjay5yZWxlYXNlVXJsKTtcclxuICAgICAgfSksXHJcbiAgICApO1xyXG4gIH1cclxuICBhY3Rpb25zLmFwcGVuZENoaWxkKFxyXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XHJcbiAgICAgIHJvdy5zdHlsZS5vcGFjaXR5ID0gXCIwLjY1XCI7XHJcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXJcclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKVxyXG4gICAgICAgIC50aGVuKCgpID0+IHJlZnJlc2hDb25maWdDYXJkKHJvdykpXHJcbiAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwiQ29kZXgrKyByZWxlYXNlIGNoZWNrIGZhaWxlZFwiLCBTdHJpbmcoZSkpKVxyXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcclxuICAgICAgICAgIHJvdy5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcclxuICAgICAgICB9KTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChcclxuICAgIGNvbXBhY3RCdXR0b24oXCJEb3dubG9hZCBVcGRhdGVcIiwgKCkgPT4ge1xyXG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xyXG4gICAgICBjb25zdCBidXR0b25zID0gYWN0aW9ucy5xdWVyeVNlbGVjdG9yQWxsKFwiYnV0dG9uXCIpO1xyXG4gICAgICBidXR0b25zLmZvckVhY2goKGJ1dHRvbikgPT4gKGJ1dHRvbi5kaXNhYmxlZCA9IHRydWUpKTtcclxuICAgICAgdm9pZCBpcGNSZW5kZXJlclxyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOnJ1bi1jb2RleHBwLXVwZGF0ZVwiKVxyXG4gICAgICAgIC50aGVuKCgpID0+IHJlZnJlc2hDb25maWdDYXJkKHJvdykpXHJcbiAgICAgICAgLmNhdGNoKChlKSA9PiB7XHJcbiAgICAgICAgICBwbG9nKFwiQ29kZXgrKyBzZWxmLXVwZGF0ZSBmYWlsZWRcIiwgU3RyaW5nKGUpKTtcclxuICAgICAgICAgIHZvaWQgcmVmcmVzaENvbmZpZ0NhcmQocm93KTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcclxuICAgICAgICAgIHJvdy5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcclxuICAgICAgICAgIGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiAoYnV0dG9uLmRpc2FibGVkID0gZmFsc2UpKTtcclxuICAgICAgICB9KTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xyXG4gIHJldHVybiByb3c7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbGVhc2VOb3Rlc1JvdyhjaGVjazogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMiBwLTNcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIkxhdGVzdCByZWxlYXNlIG5vdGVzXCI7XHJcbiAgcm93LmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBib2R5LmNsYXNzTmFtZSA9XHJcbiAgICBcIm1heC1oLTYwIG92ZXJmbG93LWF1dG8gcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcC0zIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xyXG4gIGJvZHkuYXBwZW5kQ2hpbGQocmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oY2hlY2sucmVsZWFzZU5vdGVzPy50cmltKCkgfHwgY2hlY2suZXJyb3IgfHwgXCJObyByZWxlYXNlIG5vdGVzIGF2YWlsYWJsZS5cIikpO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChib2R5KTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJSZWxlYXNlTm90ZXNNYXJrZG93bihtYXJrZG93bjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJvb3QuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XHJcbiAgY29uc3QgbGluZXMgPSBtYXJrZG93bi5yZXBsYWNlKC9cXHJcXG4/L2csIFwiXFxuXCIpLnNwbGl0KFwiXFxuXCIpO1xyXG4gIGxldCBwYXJhZ3JhcGg6IHN0cmluZ1tdID0gW107XHJcbiAgbGV0IGxpc3Q6IEhUTUxPTGlzdEVsZW1lbnQgfCBIVE1MVUxpc3RFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgbGV0IGNvZGVMaW5lczogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgY29uc3QgZmx1c2hQYXJhZ3JhcGggPSAoKSA9PiB7XHJcbiAgICBpZiAocGFyYWdyYXBoLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xyXG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xyXG4gICAgcC5jbGFzc05hbWUgPSBcIm0tMCBsZWFkaW5nLTVcIjtcclxuICAgIGFwcGVuZElubGluZU1hcmtkb3duKHAsIHBhcmFncmFwaC5qb2luKFwiIFwiKS50cmltKCkpO1xyXG4gICAgcm9vdC5hcHBlbmRDaGlsZChwKTtcclxuICAgIHBhcmFncmFwaCA9IFtdO1xyXG4gIH07XHJcbiAgY29uc3QgZmx1c2hMaXN0ID0gKCkgPT4ge1xyXG4gICAgaWYgKCFsaXN0KSByZXR1cm47XHJcbiAgICByb290LmFwcGVuZENoaWxkKGxpc3QpO1xyXG4gICAgbGlzdCA9IG51bGw7XHJcbiAgfTtcclxuICBjb25zdCBmbHVzaENvZGUgPSAoKSA9PiB7XHJcbiAgICBpZiAoIWNvZGVMaW5lcykgcmV0dXJuO1xyXG4gICAgY29uc3QgcHJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInByZVwiKTtcclxuICAgIHByZS5jbGFzc05hbWUgPVxyXG4gICAgICBcIm0tMCBvdmVyZmxvdy1hdXRvIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC8xMCBwLTIgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gICAgY29uc3QgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjb2RlXCIpO1xyXG4gICAgY29kZS50ZXh0Q29udGVudCA9IGNvZGVMaW5lcy5qb2luKFwiXFxuXCIpO1xyXG4gICAgcHJlLmFwcGVuZENoaWxkKGNvZGUpO1xyXG4gICAgcm9vdC5hcHBlbmRDaGlsZChwcmUpO1xyXG4gICAgY29kZUxpbmVzID0gbnVsbDtcclxuICB9O1xyXG5cclxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcclxuICAgIGlmIChsaW5lLnRyaW0oKS5zdGFydHNXaXRoKFwiYGBgXCIpKSB7XHJcbiAgICAgIGlmIChjb2RlTGluZXMpIGZsdXNoQ29kZSgpO1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBmbHVzaFBhcmFncmFwaCgpO1xyXG4gICAgICAgIGZsdXNoTGlzdCgpO1xyXG4gICAgICAgIGNvZGVMaW5lcyA9IFtdO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKGNvZGVMaW5lcykge1xyXG4gICAgICBjb2RlTGluZXMucHVzaChsaW5lKTtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xyXG4gICAgaWYgKCF0cmltbWVkKSB7XHJcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XHJcbiAgICAgIGZsdXNoTGlzdCgpO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBoZWFkaW5nID0gL14oI3sxLDN9KVxccysoLispJC8uZXhlYyh0cmltbWVkKTtcclxuICAgIGlmIChoZWFkaW5nKSB7XHJcbiAgICAgIGZsdXNoUGFyYWdyYXBoKCk7XHJcbiAgICAgIGZsdXNoTGlzdCgpO1xyXG4gICAgICBjb25zdCBoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChoZWFkaW5nWzFdLmxlbmd0aCA9PT0gMSA/IFwiaDNcIiA6IFwiaDRcIik7XHJcbiAgICAgIGguY2xhc3NOYW1lID0gXCJtLTAgdGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gICAgICBhcHBlbmRJbmxpbmVNYXJrZG93bihoLCBoZWFkaW5nWzJdKTtcclxuICAgICAgcm9vdC5hcHBlbmRDaGlsZChoKTtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdW5vcmRlcmVkID0gL15bLSpdXFxzKyguKykkLy5leGVjKHRyaW1tZWQpO1xyXG4gICAgY29uc3Qgb3JkZXJlZCA9IC9eXFxkK1suKV1cXHMrKC4rKSQvLmV4ZWModHJpbW1lZCk7XHJcbiAgICBpZiAodW5vcmRlcmVkIHx8IG9yZGVyZWQpIHtcclxuICAgICAgZmx1c2hQYXJhZ3JhcGgoKTtcclxuICAgICAgY29uc3Qgd2FudE9yZGVyZWQgPSBCb29sZWFuKG9yZGVyZWQpO1xyXG4gICAgICBpZiAoIWxpc3QgfHwgKHdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJPTFwiKSB8fCAoIXdhbnRPcmRlcmVkICYmIGxpc3QudGFnTmFtZSAhPT0gXCJVTFwiKSkge1xyXG4gICAgICAgIGZsdXNoTGlzdCgpO1xyXG4gICAgICAgIGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHdhbnRPcmRlcmVkID8gXCJvbFwiIDogXCJ1bFwiKTtcclxuICAgICAgICBsaXN0LmNsYXNzTmFtZSA9IHdhbnRPcmRlcmVkXHJcbiAgICAgICAgICA/IFwibS0wIGxpc3QtZGVjaW1hbCBzcGFjZS15LTEgcGwtNSBsZWFkaW5nLTVcIlxyXG4gICAgICAgICAgOiBcIm0tMCBsaXN0LWRpc2Mgc3BhY2UteS0xIHBsLTUgbGVhZGluZy01XCI7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XHJcbiAgICAgIGFwcGVuZElubGluZU1hcmtkb3duKGxpLCAodW5vcmRlcmVkID8/IG9yZGVyZWQpPy5bMV0gPz8gXCJcIik7XHJcbiAgICAgIGxpc3QuYXBwZW5kQ2hpbGQobGkpO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBxdW90ZSA9IC9ePlxccz8oLispJC8uZXhlYyh0cmltbWVkKTtcclxuICAgIGlmIChxdW90ZSkge1xyXG4gICAgICBmbHVzaFBhcmFncmFwaCgpO1xyXG4gICAgICBmbHVzaExpc3QoKTtcclxuICAgICAgY29uc3QgYmxvY2txdW90ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJibG9ja3F1b3RlXCIpO1xyXG4gICAgICBibG9ja3F1b3RlLmNsYXNzTmFtZSA9IFwibS0wIGJvcmRlci1sLTIgYm9yZGVyLXRva2VuLWJvcmRlciBwbC0zIGxlYWRpbmctNVwiO1xyXG4gICAgICBhcHBlbmRJbmxpbmVNYXJrZG93bihibG9ja3F1b3RlLCBxdW90ZVsxXSk7XHJcbiAgICAgIHJvb3QuYXBwZW5kQ2hpbGQoYmxvY2txdW90ZSk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHBhcmFncmFwaC5wdXNoKHRyaW1tZWQpO1xyXG4gIH1cclxuXHJcbiAgZmx1c2hQYXJhZ3JhcGgoKTtcclxuICBmbHVzaExpc3QoKTtcclxuICBmbHVzaENvZGUoKTtcclxuICByZXR1cm4gcm9vdDtcclxufVxyXG5cclxuZnVuY3Rpb24gYXBwZW5kSW5saW5lTWFya2Rvd24ocGFyZW50OiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nKTogdm9pZCB7XHJcbiAgY29uc3QgcGF0dGVybiA9IC8oYChbXmBdKylgfFxcWyhbXlxcXV0rKVxcXVxcKChodHRwcz86XFwvXFwvW15cXHMpXSspXFwpfFxcKlxcKihbXipdKylcXCpcXCp8XFwqKFteKl0rKVxcKikvZztcclxuICBsZXQgbGFzdEluZGV4ID0gMDtcclxuICBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHQubWF0Y2hBbGwocGF0dGVybikpIHtcclxuICAgIGlmIChtYXRjaC5pbmRleCA9PT0gdW5kZWZpbmVkKSBjb250aW51ZTtcclxuICAgIGFwcGVuZFRleHQocGFyZW50LCB0ZXh0LnNsaWNlKGxhc3RJbmRleCwgbWF0Y2guaW5kZXgpKTtcclxuICAgIGlmIChtYXRjaFsyXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNvbnN0IGNvZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY29kZVwiKTtcclxuICAgICAgY29kZS5jbGFzc05hbWUgPVxyXG4gICAgICAgIFwicm91bmRlZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzEwIHB4LTEgcHktMC41IHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICAgICAgY29kZS50ZXh0Q29udGVudCA9IG1hdGNoWzJdO1xyXG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoY29kZSk7XHJcbiAgICB9IGVsc2UgaWYgKG1hdGNoWzNdICE9PSB1bmRlZmluZWQgJiYgbWF0Y2hbNF0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XHJcbiAgICAgIGEuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSB1bmRlcmxpbmUgdW5kZXJsaW5lLW9mZnNldC0yXCI7XHJcbiAgICAgIGEuaHJlZiA9IG1hdGNoWzRdO1xyXG4gICAgICBhLnRhcmdldCA9IFwiX2JsYW5rXCI7XHJcbiAgICAgIGEucmVsID0gXCJub29wZW5lciBub3JlZmVycmVyXCI7XHJcbiAgICAgIGEudGV4dENvbnRlbnQgPSBtYXRjaFszXTtcclxuICAgICAgcGFyZW50LmFwcGVuZENoaWxkKGEpO1xyXG4gICAgfSBlbHNlIGlmIChtYXRjaFs1XSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNvbnN0IHN0cm9uZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHJvbmdcIik7XHJcbiAgICAgIHN0cm9uZy5jbGFzc05hbWUgPSBcImZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgICAgIHN0cm9uZy50ZXh0Q29udGVudCA9IG1hdGNoWzVdO1xyXG4gICAgICBwYXJlbnQuYXBwZW5kQ2hpbGQoc3Ryb25nKTtcclxuICAgIH0gZWxzZSBpZiAobWF0Y2hbNl0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBjb25zdCBlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJlbVwiKTtcclxuICAgICAgZW0udGV4dENvbnRlbnQgPSBtYXRjaFs2XTtcclxuICAgICAgcGFyZW50LmFwcGVuZENoaWxkKGVtKTtcclxuICAgIH1cclxuICAgIGxhc3RJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gIH1cclxuICBhcHBlbmRUZXh0KHBhcmVudCwgdGV4dC5zbGljZShsYXN0SW5kZXgpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYXBwZW5kVGV4dChwYXJlbnQ6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcclxuICBpZiAodGV4dCkgcGFyZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyV2F0Y2hlckhlYWx0aENhcmQoY2FyZDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAuaW52b2tlKFwiY29kZXhwcDpnZXQtd2F0Y2hlci1oZWFsdGhcIilcclxuICAgIC50aGVuKChoZWFsdGgpID0+IHtcclxuICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XHJcbiAgICAgIHJlbmRlcldhdGNoZXJIZWFsdGgoY2FyZCwgaGVhbHRoIGFzIFdhdGNoZXJIZWFsdGgpO1xyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoZSkgPT4ge1xyXG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcclxuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDb3VsZCBub3QgY2hlY2sgd2F0Y2hlclwiLCBTdHJpbmcoZSkpKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJXYXRjaGVySGVhbHRoKGNhcmQ6IEhUTUxFbGVtZW50LCBoZWFsdGg6IFdhdGNoZXJIZWFsdGgpOiB2b2lkIHtcclxuICBjYXJkLmFwcGVuZENoaWxkKHdhdGNoZXJTdW1tYXJ5Um93KGhlYWx0aCkpO1xyXG4gIGZvciAoY29uc3QgY2hlY2sgb2YgaGVhbHRoLmNoZWNrcykge1xyXG4gICAgaWYgKGNoZWNrLnN0YXR1cyA9PT0gXCJva1wiKSBjb250aW51ZTtcclxuICAgIGNhcmQuYXBwZW5kQ2hpbGQod2F0Y2hlckNoZWNrUm93KGNoZWNrKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3YXRjaGVyU3VtbWFyeVJvdyhoZWFsdGg6IFdhdGNoZXJIZWFsdGgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XHJcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBpdGVtcy1zdGFydCBnYXAtM1wiO1xyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2UoaGVhbHRoLnN0YXR1cywgaGVhbHRoLndhdGNoZXIpKTtcclxuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IGhlYWx0aC50aXRsZTtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gYCR7aGVhbHRoLnN1bW1hcnl9IENoZWNrZWQgJHtuZXcgRGF0ZShoZWFsdGguY2hlY2tlZEF0KS50b0xvY2FsZVN0cmluZygpfS5gO1xyXG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcclxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XHJcblxyXG4gIGNvbnN0IGFjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYWN0aW9uLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcclxuICBhY3Rpb24uYXBwZW5kQ2hpbGQoXHJcbiAgICBjb21wYWN0QnV0dG9uKFwiQ2hlY2sgTm93XCIsICgpID0+IHtcclxuICAgICAgY29uc3QgY2FyZCA9IHJvdy5wYXJlbnRFbGVtZW50O1xyXG4gICAgICBpZiAoIWNhcmQpIHJldHVybjtcclxuICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XHJcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ2hlY2tpbmcgd2F0Y2hlclwiLCBcIlZlcmlmeWluZyB0aGUgdXBkYXRlciByZXBhaXIgc2VydmljZS5cIikpO1xyXG4gICAgICByZW5kZXJXYXRjaGVySGVhbHRoQ2FyZChjYXJkKTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbik7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gd2F0Y2hlckNoZWNrUm93KGNoZWNrOiBXYXRjaGVySGVhbHRoQ2hlY2spOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gcm93U2ltcGxlKGNoZWNrLm5hbWUsIGNoZWNrLmRldGFpbCk7XHJcbiAgY29uc3QgbGVmdCA9IHJvdy5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgaWYgKGxlZnQpIGxlZnQucHJlcGVuZChzdGF0dXNCYWRnZShjaGVjay5zdGF0dXMpKTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdGF0dXNCYWRnZShzdGF0dXM6IFwib2tcIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCBsYWJlbD86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGNvbnN0IHRvbmUgPVxyXG4gICAgc3RhdHVzID09PSBcIm9rXCJcclxuICAgICAgPyBcImJvcmRlci10b2tlbi1jaGFydHMtZ3JlZW4gdGV4dC10b2tlbi1jaGFydHMtZ3JlZW5cIlxyXG4gICAgICA6IHN0YXR1cyA9PT0gXCJ3YXJuXCJcclxuICAgICAgICA/IFwiYm9yZGVyLXRva2VuLWNoYXJ0cy15ZWxsb3cgdGV4dC10b2tlbi1jaGFydHMteWVsbG93XCJcclxuICAgICAgICA6IFwiYm9yZGVyLXRva2VuLWNoYXJ0cy1yZWQgdGV4dC10b2tlbi1jaGFydHMtcmVkXCI7XHJcbiAgYmFkZ2UuY2xhc3NOYW1lID0gYGlubGluZS1mbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciByb3VuZGVkLWZ1bGwgYm9yZGVyIHB4LTIgcHktMC41IHRleHQteHMgZm9udC1tZWRpdW0gJHt0b25lfWA7XHJcbiAgYmFkZ2UudGV4dENvbnRlbnQgPSBsYWJlbCB8fCAoc3RhdHVzID09PSBcIm9rXCIgPyBcIk9LXCIgOiBzdGF0dXMgPT09IFwid2FyblwiID8gXCJSZXZpZXdcIiA6IFwiRXJyb3JcIik7XHJcbiAgcmV0dXJuIGJhZGdlO1xyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGVTdW1tYXJ5KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogc3RyaW5nIHtcclxuICBpZiAoIWNoZWNrKSByZXR1cm4gXCJObyB1cGRhdGUgY2hlY2sgaGFzIHJ1biB5ZXQuXCI7XHJcbiAgY29uc3QgbGF0ZXN0ID0gY2hlY2subGF0ZXN0VmVyc2lvbiA/IGBMYXRlc3QgdiR7Y2hlY2subGF0ZXN0VmVyc2lvbn0uIGAgOiBcIlwiO1xyXG4gIGNvbnN0IGNoZWNrZWQgPSBgQ2hlY2tlZCAke25ldyBEYXRlKGNoZWNrLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKX0uYDtcclxuICBpZiAoY2hlY2suZXJyb3IpIHJldHVybiBgJHtsYXRlc3R9JHtjaGVja2VkfSAke2NoZWNrLmVycm9yfWA7XHJcbiAgcmV0dXJuIGAke2xhdGVzdH0ke2NoZWNrZWR9YDtcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlQ2hhbm5lbFN1bW1hcnkoY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogc3RyaW5nIHtcclxuICBpZiAoY29uZmlnLnVwZGF0ZUNoYW5uZWwgPT09IFwiY3VzdG9tXCIpIHtcclxuICAgIHJldHVybiBgJHtjb25maWcudXBkYXRlUmVwbyB8fCBcImItbm5ldHQvY29kZXgtcGx1c3BsdXNcIn0gJHtjb25maWcudXBkYXRlUmVmIHx8IFwiKG5vIHJlZiBzZXQpXCJ9YDtcclxuICB9XHJcbiAgaWYgKGNvbmZpZy51cGRhdGVDaGFubmVsID09PSBcInByZXJlbGVhc2VcIikge1xyXG4gICAgcmV0dXJuIFwiVXNlIHRoZSBuZXdlc3QgcHVibGlzaGVkIEdpdEh1YiByZWxlYXNlLCBpbmNsdWRpbmcgcHJlcmVsZWFzZXMuXCI7XHJcbiAgfVxyXG4gIHJldHVybiBcIlVzZSB0aGUgbGF0ZXN0IHN0YWJsZSBHaXRIdWIgcmVsZWFzZS5cIjtcclxufVxyXG5cclxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN1bW1hcnkoc3RhdGU6IFNlbGZVcGRhdGVTdGF0ZSB8IG51bGwpOiBzdHJpbmcge1xyXG4gIGlmICghc3RhdGUpIHJldHVybiBcIk5vIGF1dG9tYXRpYyBDb2RleCsrIHVwZGF0ZSBoYXMgcnVuIHlldC5cIjtcclxuICBjb25zdCBjaGVja2VkID0gbmV3IERhdGUoc3RhdGUuY29tcGxldGVkQXQgPz8gc3RhdGUuY2hlY2tlZEF0KS50b0xvY2FsZVN0cmluZygpO1xyXG4gIGNvbnN0IHRhcmdldCA9IHN0YXRlLmxhdGVzdFZlcnNpb24gPyBgIFRhcmdldCB2JHtzdGF0ZS5sYXRlc3RWZXJzaW9ufS5gIDogc3RhdGUudGFyZ2V0UmVmID8gYCBUYXJnZXQgJHtzdGF0ZS50YXJnZXRSZWZ9LmAgOiBcIlwiO1xyXG4gIGNvbnN0IHNvdXJjZSA9IHN0YXRlLmluc3RhbGxhdGlvblNvdXJjZT8ubGFiZWwgPz8gXCJ1bmtub3duIHNvdXJjZVwiO1xyXG4gIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwiZmFpbGVkXCIpIHJldHVybiBgRmFpbGVkICR7Y2hlY2tlZH0uJHt0YXJnZXR9ICR7c3RhdGUuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCJ9YDtcclxuICBpZiAoc3RhdGUuc3RhdHVzID09PSBcInVwZGF0ZWRcIikgcmV0dXJuIGBVcGRhdGVkICR7Y2hlY2tlZH0uJHt0YXJnZXR9IFNvdXJjZTogJHtzb3VyY2V9LmA7XHJcbiAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJ1cC10by1kYXRlXCIpIHJldHVybiBgVXAgdG8gZGF0ZSAke2NoZWNrZWR9LiR7dGFyZ2V0fSBTb3VyY2U6ICR7c291cmNlfS5gO1xyXG4gIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwiZGlzYWJsZWRcIikgcmV0dXJuIGBTa2lwcGVkICR7Y2hlY2tlZH07IGF1dG9tYXRpYyByZWZyZXNoIGlzIGRpc2FibGVkLmA7XHJcbiAgcmV0dXJuIGBDaGVja2luZyBmb3IgdXBkYXRlcy4gU291cmNlOiAke3NvdXJjZX0uYDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c1RvbmUoc3RhdHVzOiBTZWxmVXBkYXRlU3RhdHVzKTogXCJva1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIge1xyXG4gIGlmIChzdGF0dXMgPT09IFwiZmFpbGVkXCIpIHJldHVybiBcImVycm9yXCI7XHJcbiAgaWYgKHN0YXR1cyA9PT0gXCJkaXNhYmxlZFwiIHx8IHN0YXR1cyA9PT0gXCJjaGVja2luZ1wiKSByZXR1cm4gXCJ3YXJuXCI7XHJcbiAgcmV0dXJuIFwib2tcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gc2VsZlVwZGF0ZVN0YXR1c0xhYmVsKHN0YXR1czogU2VsZlVwZGF0ZVN0YXR1cyk6IHN0cmluZyB7XHJcbiAgaWYgKHN0YXR1cyA9PT0gXCJ1cC10by1kYXRlXCIpIHJldHVybiBcIlVwIHRvIGRhdGVcIjtcclxuICBpZiAoc3RhdHVzID09PSBcInVwZGF0ZWRcIikgcmV0dXJuIFwiVXBkYXRlZFwiO1xyXG4gIGlmIChzdGF0dXMgPT09IFwiZmFpbGVkXCIpIHJldHVybiBcIkZhaWxlZFwiO1xyXG4gIGlmIChzdGF0dXMgPT09IFwiZGlzYWJsZWRcIikgcmV0dXJuIFwiRGlzYWJsZWRcIjtcclxuICByZXR1cm4gXCJDaGVja2luZ1wiO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWZyZXNoQ29uZmlnQ2FyZChyb3c6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgY29uc3QgY2FyZCA9IHJvdy5jbG9zZXN0KFwiW2RhdGEtY29kZXhwcC1jb25maWctY2FyZF1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIGlmICghY2FyZCkgcmV0dXJuO1xyXG4gIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiUmVmcmVzaGluZ1wiLCBcIkxvYWRpbmcgY3VycmVudCBDb2RleCsrIHVwZGF0ZSBzdGF0dXMuXCIpKTtcclxuICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAuaW52b2tlKFwiY29kZXhwcDpnZXQtY29uZmlnXCIpXHJcbiAgICAudGhlbigoY29uZmlnKSA9PiB7XHJcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xyXG4gICAgICByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQsIGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKGUpID0+IHtcclxuICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XHJcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiQ291bGQgbm90IHJlZnJlc2ggdXBkYXRlIHNldHRpbmdzXCIsIFN0cmluZyhlKSkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVuaW5zdGFsbFJvdygpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gYWN0aW9uUm93KFxyXG4gICAgXCJVbmluc3RhbGwgQ29kZXgrK1wiLFxyXG4gICAgXCJDb3BpZXMgdGhlIHVuaW5zdGFsbCBjb21tYW5kLiBSdW4gaXQgZnJvbSBhIHRlcm1pbmFsIGFmdGVyIHF1aXR0aW5nIENvZGV4LlwiLFxyXG4gICk7XHJcbiAgY29uc3QgYWN0aW9uID0gcm93LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1yb3ctYWN0aW9uc11cIik7XHJcbiAgYWN0aW9uPy5hcHBlbmRDaGlsZChcclxuICAgIGNvbXBhY3RCdXR0b24oXCJDb3B5IENvbW1hbmRcIiwgKCkgPT4ge1xyXG4gICAgICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAgICAgLmludm9rZShcImNvZGV4cHA6Y29weS10ZXh0XCIsIFwibm9kZSB+Ly5jb2RleC1wbHVzcGx1cy9zb3VyY2UvcGFja2FnZXMvaW5zdGFsbGVyL2Rpc3QvY2xpLmpzIHVuaW5zdGFsbFwiKVxyXG4gICAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcImNvcHkgdW5pbnN0YWxsIGNvbW1hbmQgZmFpbGVkXCIsIFN0cmluZyhlKSkpO1xyXG4gICAgfSksXHJcbiAgKTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXBvcnRCdWdSb3coKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGFjdGlvblJvdyhcclxuICAgIFwiUmVwb3J0IGEgYnVnXCIsXHJcbiAgICBcIk9wZW4gYSBHaXRIdWIgaXNzdWUgd2l0aCBydW50aW1lLCBpbnN0YWxsZXIsIG9yIHR3ZWFrLW1hbmFnZXIgZGV0YWlscy5cIixcclxuICApO1xyXG4gIGNvbnN0IGFjdGlvbiA9IHJvdy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtcm93LWFjdGlvbnNdXCIpO1xyXG4gIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXHJcbiAgICBjb21wYWN0QnV0dG9uKFwiT3BlbiBJc3N1ZVwiLCAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHRpdGxlID0gZW5jb2RlVVJJQ29tcG9uZW50KFwiW0J1Z106IFwiKTtcclxuICAgICAgY29uc3QgYm9keSA9IGVuY29kZVVSSUNvbXBvbmVudChcclxuICAgICAgICBbXHJcbiAgICAgICAgICBcIiMjIFdoYXQgaGFwcGVuZWQ/XCIsXHJcbiAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICAgXCIjIyBTdGVwcyB0byByZXByb2R1Y2VcIixcclxuICAgICAgICAgIFwiMS4gXCIsXHJcbiAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICAgXCIjIyBFbnZpcm9ubWVudFwiLFxyXG4gICAgICAgICAgXCItIENvZGV4KysgdmVyc2lvbjogXCIsXHJcbiAgICAgICAgICBcIi0gQ29kZXggYXBwIHZlcnNpb246IFwiLFxyXG4gICAgICAgICAgXCItIE9TOiBcIixcclxuICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICBcIiMjIExvZ3NcIixcclxuICAgICAgICAgIFwiQXR0YWNoIHJlbGV2YW50IGxpbmVzIGZyb20gdGhlIENvZGV4KysgbG9nIGRpcmVjdG9yeS5cIixcclxuICAgICAgICBdLmpvaW4oXCJcXG5cIiksXHJcbiAgICAgICk7XHJcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFxyXG4gICAgICAgIFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsXHJcbiAgICAgICAgYGh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXc/dGl0bGU9JHt0aXRsZX0mYm9keT0ke2JvZHl9YCxcclxuICAgICAgKTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gYWN0aW9uUm93KHRpdGxlVGV4dDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IHRpdGxlVGV4dDtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XHJcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XHJcbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XHJcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xyXG4gIHJldHVybiByb3c7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlclR3ZWFrU3RvcmVQYWdlKFxyXG4gIHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQsXHJcbiAgaGVhZGVyQWN0aW9ucz86IEhUTUxFbGVtZW50LFxyXG4pOiB2b2lkIHtcclxuICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgc2VjdGlvbi5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTRcIjtcclxuXHJcbiAgY29uc3Qgc291cmNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgc291cmNlLmhpZGRlbiA9IHRydWU7XHJcbiAgc291cmNlLmRhdGFzZXQuY29kZXhwcFN0b3JlU291cmNlID0gXCJ0cnVlXCI7XHJcbiAgc291cmNlLnRleHRDb250ZW50ID0gXCJMb2FkaW5nIGxpdmUgcmVnaXN0cnlcIjtcclxuXHJcbiAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYWN0aW9ucy5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgY29uc3QgcmVmcmVzaEJ0biA9IHN0b3JlSWNvbkJ1dHRvbihyZWZyZXNoSWNvblN2ZygpLCBcIlJlZnJlc2ggdHdlYWsgc3RvcmVcIiwgKCkgPT4ge1xyXG4gICAgcmVmcmVzaEJ0bi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICBncmlkLnRleHRDb250ZW50ID0gXCJcIjtcclxuICAgIHJlbmRlclR3ZWFrU3RvcmVHaG9zdEdyaWQoZ3JpZCk7XHJcbiAgICByZWZyZXNoVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlLCByZWZyZXNoQnRuLCB0cnVlKTtcclxuICB9KTtcclxuICBhY3Rpb25zLmFwcGVuZENoaWxkKHJlZnJlc2hCdG4pO1xyXG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVUb29sYmFyQnV0dG9uKFwiUHVibGlzaCBUd2Vha1wiLCBvcGVuUHVibGlzaFR3ZWFrRGlhbG9nLCBcInByaW1hcnlcIikpO1xyXG4gIGlmIChoZWFkZXJBY3Rpb25zKSB7XHJcbiAgICBoZWFkZXJBY3Rpb25zLnJlcGxhY2VDaGlsZHJlbihhY3Rpb25zKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGdyaWQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGdyaWQuZGF0YXNldC5jb2RleHBwU3RvcmVHcmlkID0gXCJ0cnVlXCI7XHJcbiAgZ3JpZC5jbGFzc05hbWUgPSBcImdyaWQgZ2FwLTRcIjtcclxuICBpZiAoc3RhdGUudHdlYWtTdG9yZSkge1xyXG4gICAgZ3JpZC5kYXRhc2V0LmNvZGV4cHBTdG9yZSA9IEpTT04uc3RyaW5naWZ5KHN0YXRlLnR3ZWFrU3RvcmUpO1xyXG4gICAgcmVuZGVyVHdlYWtTdG9yZUdyaWQoZ3JpZCwgc291cmNlKTtcclxuICB9IGVsc2Uge1xyXG4gICAgcmVuZGVyVHdlYWtTdG9yZUdob3N0R3JpZChncmlkKTtcclxuICB9XHJcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChzb3VyY2UpO1xyXG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoZ3JpZCk7XHJcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xyXG4gIHJlZnJlc2hUd2Vha1N0b3JlR3JpZChncmlkLCBzb3VyY2UsIHJlZnJlc2hCdG4pO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWZyZXNoVHdlYWtTdG9yZUdyaWQoXHJcbiAgZ3JpZDogSFRNTEVsZW1lbnQsXHJcbiAgc291cmNlOiBIVE1MRWxlbWVudCxcclxuICByZWZyZXNoQnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQsXHJcbiAgZm9yY2UgPSBmYWxzZSxcclxuKTogdm9pZCB7XHJcbiAgdm9pZCBnZXRUd2Vha1N0b3JlKGZvcmNlKVxyXG4gICAgLnRoZW4oKHN0b3JlKSA9PiB7XHJcbiAgICAgIGdyaWQuZGF0YXNldC5jb2RleHBwU3RvcmUgPSBKU09OLnN0cmluZ2lmeShzdG9yZSk7XHJcbiAgICAgIHJlbmRlclR3ZWFrU3RvcmVHcmlkKGdyaWQsIHNvdXJjZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlKSA9PiB7XHJcbiAgICAgIGdyaWQuZGF0YXNldC5jb2RleHBwU3RvcmUgPSBcIlwiO1xyXG4gICAgICBncmlkLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcclxuICAgICAgc291cmNlLnRleHRDb250ZW50ID0gXCJMaXZlIHJlZ2lzdHJ5IHVuYXZhaWxhYmxlXCI7XHJcbiAgICAgIGdyaWQudGV4dENvbnRlbnQgPSBcIlwiO1xyXG4gICAgICBncmlkLmFwcGVuZENoaWxkKHN0b3JlTWVzc2FnZUNhcmQoXCJDb3VsZCBub3QgbG9hZCB0d2VhayBzdG9yZVwiLCBTdHJpbmcoZSkpKTtcclxuICAgIH0pXHJcbiAgICAuZmluYWxseSgoKSA9PiB7XHJcbiAgICAgIGlmIChyZWZyZXNoQnRuKSByZWZyZXNoQnRuLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gd2FybVR3ZWFrU3RvcmUoKTogdm9pZCB7XHJcbiAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUgfHwgc3RhdGUudHdlYWtTdG9yZVByb21pc2UpIHJldHVybjtcclxuICB2b2lkIGdldFR3ZWFrU3RvcmUoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0VHdlYWtTdG9yZShmb3JjZSA9IGZhbHNlKTogUHJvbWlzZTxUd2Vha1N0b3JlUmVnaXN0cnlWaWV3PiB7XHJcbiAgaWYgKCFmb3JjZSkge1xyXG4gICAgaWYgKHN0YXRlLnR3ZWFrU3RvcmUpIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3RhdGUudHdlYWtTdG9yZSk7XHJcbiAgICBpZiAoc3RhdGUudHdlYWtTdG9yZVByb21pc2UpIHJldHVybiBzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZTtcclxuICB9XHJcbiAgc3RhdGUudHdlYWtTdG9yZUVycm9yID0gbnVsbDtcclxuICBjb25zdCBwcm9taXNlID0gaXBjUmVuZGVyZXJcclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC10d2Vhay1zdG9yZVwiKVxyXG4gICAgLnRoZW4oKHN0b3JlKSA9PiB7XHJcbiAgICAgIHN0YXRlLnR3ZWFrU3RvcmUgPSBzdG9yZSBhcyBUd2Vha1N0b3JlUmVnaXN0cnlWaWV3O1xyXG4gICAgICByZXR1cm4gc3RhdGUudHdlYWtTdG9yZTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKGUpID0+IHtcclxuICAgICAgc3RhdGUudHdlYWtTdG9yZUVycm9yID0gZTtcclxuICAgICAgdGhyb3cgZTtcclxuICAgIH0pXHJcbiAgICAuZmluYWxseSgoKSA9PiB7XHJcbiAgICAgIGlmIChzdGF0ZS50d2Vha1N0b3JlUHJvbWlzZSA9PT0gcHJvbWlzZSkgc3RhdGUudHdlYWtTdG9yZVByb21pc2UgPSBudWxsO1xyXG4gICAgfSk7XHJcbiAgc3RhdGUudHdlYWtTdG9yZVByb21pc2UgPSBwcm9taXNlO1xyXG4gIHJldHVybiBwcm9taXNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJUd2Vha1N0b3JlR3JpZChncmlkOiBIVE1MRWxlbWVudCwgc291cmNlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gIGNvbnN0IHN0b3JlID0gcGFyc2VTdG9yZURhdGFzZXQoZ3JpZCk7XHJcbiAgaWYgKCFzdG9yZSkgcmV0dXJuO1xyXG4gIGNvbnN0IGVudHJpZXMgPSBzdG9yZS5lbnRyaWVzO1xyXG4gIGdyaWQucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1idXN5XCIpO1xyXG4gIHNvdXJjZS50ZXh0Q29udGVudCA9IGBSZWZyZXNoZWQgJHtuZXcgRGF0ZShzdG9yZS5mZXRjaGVkQXQpLnRvTG9jYWxlU3RyaW5nKCl9YDtcclxuICBncmlkLnRleHRDb250ZW50ID0gXCJcIjtcclxuICBpZiAoc3RvcmUuZW50cmllcy5sZW5ndGggPT09IDApIHtcclxuICAgIGdyaWQuYXBwZW5kQ2hpbGQoc3RvcmVNZXNzYWdlQ2FyZChcIk5vIHR3ZWFrcyB5ZXRcIiwgXCJVc2UgUHVibGlzaCBUd2VhayB0byBzdWJtaXQgdGhlIGZpcnN0IG9uZS5cIikpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIGdyaWQuYXBwZW5kQ2hpbGQodHdlYWtTdG9yZUNhcmQoZW50cnkpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VTdG9yZURhdGFzZXQoZ3JpZDogSFRNTEVsZW1lbnQpOiBUd2Vha1N0b3JlUmVnaXN0cnlWaWV3IHwgbnVsbCB7XHJcbiAgY29uc3QgcmF3ID0gZ3JpZC5kYXRhc2V0LmNvZGV4cHBTdG9yZTtcclxuICBpZiAoIXJhdykgcmV0dXJuIG51bGw7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiBKU09OLnBhcnNlKHJhdykgYXMgVHdlYWtTdG9yZVJlZ2lzdHJ5VmlldztcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtTdG9yZUNhcmQoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeVZpZXcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgc2hlbGwgPSB0d2Vha1N0b3JlQ2FyZFNoZWxsKCk7XHJcbiAgY29uc3QgeyBjYXJkLCBsZWZ0LCBzdGFjaywgdmVyc2lvbnMsIGFjdGlvbnMgfSA9IHNoZWxsO1xyXG5cclxuICBsZWZ0Lmluc2VydEJlZm9yZShzdG9yZUF2YXRhcihlbnRyeSksIHN0YWNrKTtcclxuXHJcbiAgY29uc3QgdGl0bGVSb3cgPSB0d2Vha1N0b3JlVGl0bGVSb3coKTtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtbGcgZm9udC1zZW1pYm9sZCBsZWFkaW5nLTcgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCI7XHJcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBlbnRyeS5tYW5pZmVzdC5uYW1lO1xyXG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh2ZXJpZmllZFNhZmVCYWRnZSgpKTtcclxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XHJcblxyXG4gIGlmIChlbnRyeS5tYW5pZmVzdC5kZXNjcmlwdGlvbikge1xyXG4gICAgY29uc3QgZGVzYyA9IHR3ZWFrU3RvcmVEZXNjcmlwdGlvbigpO1xyXG4gICAgZGVzYy50ZXh0Q29udGVudCA9IGVudHJ5Lm1hbmlmZXN0LmRlc2NyaXB0aW9uO1xyXG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZGVzYyk7XHJcbiAgfVxyXG5cclxuICBzdGFjay5hcHBlbmRDaGlsZCh0d2Vha1N0b3JlUmVhZE1vcmVCdXR0b24oZW50cnkucmVwbykpO1xyXG4gIHZlcnNpb25zLmFwcGVuZENoaWxkKHR3ZWFrU3RvcmVWZXJzaW9uQmFkZ2UoZW50cnkpKTtcclxuXHJcbiAgaWYgKGVudHJ5LnJlbGVhc2VVcmwpIHtcclxuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXHJcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlXCIsICgpID0+IHtcclxuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCBlbnRyeS5yZWxlYXNlVXJsKTtcclxuICAgICAgfSksXHJcbiAgICApO1xyXG4gIH1cclxuICBpZiAoZW50cnkuaW5zdGFsbGVkICYmIGVudHJ5Lmluc3RhbGxlZC52ZXJzaW9uID09PSBlbnRyeS5tYW5pZmVzdC52ZXJzaW9uKSB7XHJcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XHJcbiAgfSBlbHNlIGlmIChlbnRyeS5wbGF0Zm9ybSAmJiAhZW50cnkucGxhdGZvcm0uY29tcGF0aWJsZSkge1xyXG4gICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwib3BhY2l0eS03MFwiKTtcclxuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNQaWxsKHBsYXRmb3JtTG9ja2VkTGFiZWwoZW50cnkucGxhdGZvcm0pKSk7XHJcbiAgfSBlbHNlIGlmIChlbnRyeS5ydW50aW1lICYmICFlbnRyeS5ydW50aW1lLmNvbXBhdGlibGUpIHtcclxuICAgIGNhcmQuY2xhc3NMaXN0LmFkZChcIm9wYWNpdHktNzBcIik7XHJcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHN0b3JlU3RhdHVzUGlsbChydW50aW1lTG9ja2VkTGFiZWwoZW50cnkucnVudGltZSkpKTtcclxuICB9IGVsc2Uge1xyXG4gICAgY29uc3QgaW5zdGFsbExhYmVsID0gZW50cnkuaW5zdGFsbGVkID8gXCJVcGRhdGVcIiA6IFwiSW5zdGFsbFwiO1xyXG4gICAgY29uc3QgaW5zdGFsbEJ1dHRvbiA9IHN0b3JlSW5zdGFsbEJ1dHRvbihpbnN0YWxsTGFiZWwsIChidXR0b24pID0+IHtcclxuICAgICAgY29uc3QgZ3JpZCA9IGNhcmQuY2xvc2VzdChcIltkYXRhLWNvZGV4cHAtc3RvcmUtZ3JpZF1cIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gICAgICBjb25zdCBzb3VyY2UgPSBncmlkPy5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtY29kZXhwcC1zdG9yZS1zb3VyY2VdXCIpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAgICAgc2hvd1N0b3JlQnV0dG9uTG9hZGluZyhidXR0b24sIGVudHJ5Lmluc3RhbGxlZCA/IFwiVXBkYXRpbmdcIiA6IFwiSW5zdGFsbGluZ1wiKTtcclxuICAgICAgYWN0aW9ucy5xdWVyeVNlbGVjdG9yQWxsKFwiYnV0dG9uXCIpLmZvckVhY2goKGJ1dHRvbikgPT4gKGJ1dHRvbi5kaXNhYmxlZCA9IHRydWUpKTtcclxuICAgICAgdm9pZCBpcGNSZW5kZXJlclxyXG4gICAgICAgIC5pbnZva2UoXCJjb2RleHBwOmluc3RhbGwtc3RvcmUtdHdlYWtcIiwgZW50cnkuaWQpXHJcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgc2hvd1N0b3JlVG9hc3QoYCR7ZW50cnkubWFuaWZlc3QubmFtZX0gaW5zdGFsbGVkLmApO1xyXG4gICAgICAgICAgc2hvd1N0b3JlQnV0dG9uSW5zdGFsbGVkKGJ1dHRvbik7XHJcbiAgICAgICAgICB2ZXJzaW9ucy5yZXBsYWNlQ2hpbGRyZW4odHdlYWtTdG9yZVZlcnNpb25CYWRnZShlbnRyeSwgZW50cnkubWFuaWZlc3QudmVyc2lvbikpO1xyXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGFjdGlvbnMucmVwbGFjZUNoaWxkcmVuKHN0b3JlU3RhdHVzUGlsbChcIkluc3RhbGxlZFwiKSk7XHJcbiAgICAgICAgICAgIGlmIChncmlkICYmIHNvdXJjZSkgcmVmcmVzaFR3ZWFrU3RvcmVHcmlkKGdyaWQsIHNvdXJjZSwgdW5kZWZpbmVkLCB0cnVlKTtcclxuICAgICAgICAgIH0sIDkwMCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goKGUpID0+IHtcclxuICAgICAgICAgIHJlc2V0U3RvcmVJbnN0YWxsQnV0dG9uKGJ1dHRvbiwgaW5zdGFsbExhYmVsKTtcclxuICAgICAgICAgIGFjdGlvbnMucXVlcnlTZWxlY3RvckFsbChcImJ1dHRvblwiKS5mb3JFYWNoKChidXR0b24pID0+IChidXR0b24uZGlzYWJsZWQgPSBmYWxzZSkpO1xyXG4gICAgICAgICAgc2hvd1N0b3JlQ2FyZE1lc3NhZ2UoY2FyZCwgU3RyaW5nKChlIGFzIEVycm9yKS5tZXNzYWdlID8/IGUpKTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChpbnN0YWxsQnV0dG9uKTtcclxuICB9XHJcbiAgcmV0dXJuIGNhcmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBsYXRmb3JtTG9ja2VkTGFiZWwocGxhdGZvcm06IE5vbk51bGxhYmxlPFR3ZWFrU3RvcmVFbnRyeVZpZXdbXCJwbGF0Zm9ybVwiXT4pOiBzdHJpbmcge1xyXG4gIGNvbnN0IHN1cHBvcnRlZCA9IHBsYXRmb3JtLnN1cHBvcnRlZCA/PyBbXTtcclxuICBpZiAoc3VwcG9ydGVkLmluY2x1ZGVzKFwid2luMzJcIikpIHJldHVybiBcIldpbmRvd3Mgb25seVwiO1xyXG4gIGlmIChzdXBwb3J0ZWQuaW5jbHVkZXMoXCJkYXJ3aW5cIikpIHJldHVybiBcIm1hY09TIG9ubHlcIjtcclxuICBpZiAoc3VwcG9ydGVkLmluY2x1ZGVzKFwibGludXhcIikpIHJldHVybiBcIkxpbnV4IG9ubHlcIjtcclxuICByZXR1cm4gXCJVbmF2YWlsYWJsZVwiO1xyXG59XHJcblxyXG5mdW5jdGlvbiBydW50aW1lTG9ja2VkTGFiZWwocnVudGltZTogTm9uTnVsbGFibGU8VHdlYWtTdG9yZUVudHJ5Vmlld1tcInJ1bnRpbWVcIl0+KTogc3RyaW5nIHtcclxuICByZXR1cm4gcnVudGltZS5yZXF1aXJlZCA/IGBSZXF1aXJlcyBDb2RleCsrICR7cnVudGltZS5yZXF1aXJlZH1gIDogXCJSZXF1aXJlcyBuZXdlciBDb2RleCsrXCI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3dTdG9yZUNhcmRNZXNzYWdlKGNhcmQ6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICBjYXJkLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1jb2RleHBwLXN0b3JlLWNhcmQtbWVzc2FnZV1cIik/LnJlbW92ZSgpO1xyXG4gIGNvbnN0IG5vdGljZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbm90aWNlLmRhdGFzZXQuY29kZXhwcFN0b3JlQ2FyZE1lc3NhZ2UgPSBcInRydWVcIjtcclxuICBub3RpY2UuY2xhc3NOYW1lID1cclxuICAgIFwicm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci81MCBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcHgtMyBweS0yIHRleHQtc20gbGVhZGluZy01IHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xyXG4gIG5vdGljZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XHJcbiAgY29uc3QgYWN0aW9ucyA9IGNhcmQubGFzdEVsZW1lbnRDaGlsZDtcclxuICBpZiAoYWN0aW9ucykgY2FyZC5pbnNlcnRCZWZvcmUobm90aWNlLCBhY3Rpb25zKTtcclxuICBlbHNlIGNhcmQuYXBwZW5kQ2hpbGQobm90aWNlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtTdG9yZUNhcmRTaGVsbCgpOiB7XHJcbiAgY2FyZDogSFRNTEVsZW1lbnQ7XHJcbiAgbGVmdDogSFRNTEVsZW1lbnQ7XHJcbiAgc3RhY2s6IEhUTUxFbGVtZW50O1xyXG4gIHZlcnNpb25zOiBIVE1MRWxlbWVudDtcclxuICBhY3Rpb25zOiBIVE1MRWxlbWVudDtcclxufSB7XHJcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY2FyZC5jbGFzc05hbWUgPVxyXG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyLzQwIGZsZXggbWluLWgtWzE5MHB4XSBmbGV4LWNvbCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcm91bmRlZC0yeGwgYm9yZGVyIHAtNCB0cmFuc2l0aW9uLWNvbG9ycyBob3ZlcjpiZy10b2tlbi1mb3JlZ3JvdW5kLzVcIjtcclxuXHJcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtc3RhcnQgZ2FwLTNcIjtcclxuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC0xIGZsZXgtY29sIGdhcC0yXCI7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChsZWZ0KTtcclxuXHJcbiAgY29uc3QgZm9vdGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBmb290ZXIuY2xhc3NOYW1lID0gXCJtdC1hdXRvIGZsZXggbWluLXctMCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtMlwiO1xyXG4gIGNvbnN0IHZlcnNpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB2ZXJzaW9ucy5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgZm9vdGVyLmFwcGVuZENoaWxkKHZlcnNpb25zKTtcclxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1lbmQgZ2FwLTJcIjtcclxuICBmb290ZXIuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChmb290ZXIpO1xyXG5cclxuICByZXR1cm4geyBjYXJkLCBsZWZ0LCBzdGFjaywgdmVyc2lvbnMsIGFjdGlvbnMgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtTdG9yZVRpdGxlUm93KCk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCB0aXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC0zXCI7XHJcbiAgcmV0dXJuIHRpdGxlUm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiB0d2Vha1N0b3JlRGVzY3JpcHRpb24oKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGRlc2MuY2xhc3NOYW1lID0gXCJsaW5lLWNsYW1wLTMgbWluLXctMCB0ZXh0LXNtIGxlYWRpbmctNSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XHJcbiAgcmV0dXJuIGRlc2M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR3ZWFrU3RvcmVSZWFkTW9yZUJ1dHRvbihyZXBvOiBzdHJpbmcpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgY29uc3QgcmVhZE1vcmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIHJlYWRNb3JlLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIHJlYWRNb3JlLmNsYXNzTmFtZSA9XHJcbiAgICBcImlubGluZS1mbGV4IHctZml0IGl0ZW1zLWNlbnRlciBnYXAtMSB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XHJcbiAgcmVhZE1vcmUuaW5uZXJIVE1MID1cclxuICAgIGBSZWFkIE1vcmVgICtcclxuICAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMTYgMTZcIiBmaWxsPVwibm9uZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNiAzLjVoNi41VjEwTTEyLjI1IDMuNzUgNCAxMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNDVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICBgPC9zdmc+YDtcclxuICByZWFkTW9yZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb31gKTtcclxuICB9KTtcclxuICByZXR1cm4gcmVhZE1vcmU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlclR3ZWFrU3RvcmVHaG9zdEdyaWQoZ3JpZDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICBncmlkLnNldEF0dHJpYnV0ZShcImFyaWEtYnVzeVwiLCBcInRydWVcIik7XHJcbiAgZ3JpZC50ZXh0Q29udGVudCA9IFwiXCI7XHJcbiAgZ3JpZC5hcHBlbmRDaGlsZCh0d2Vha1N0b3JlR2hvc3RDYXJkKCkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0d2Vha1N0b3JlR2hvc3RDYXJkKCk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCB7IGNhcmQsIGxlZnQsIHN0YWNrLCB2ZXJzaW9ucywgYWN0aW9ucyB9ID0gdHdlYWtTdG9yZUNhcmRTaGVsbCgpO1xyXG4gIGNhcmQuY2xhc3NMaXN0LmFkZChcInBvaW50ZXItZXZlbnRzLW5vbmVcIik7XHJcbiAgY2FyZC5zZXRBdHRyaWJ1dGUoXCJhcmlhLWhpZGRlblwiLCBcInRydWVcIik7XHJcblxyXG4gIGxlZnQuaW5zZXJ0QmVmb3JlKHN0b3JlQXZhdGFyR2hvc3QoKSwgc3RhY2spO1xyXG5cclxuICBjb25zdCB0aXRsZVJvdyA9IHR3ZWFrU3RvcmVUaXRsZVJvdygpO1xyXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1sZyBmb250LXNlbWlib2xkIGxlYWRpbmctNyB0ZXh0LXRva2VuLWZvcmVncm91bmRcIjtcclxuICB0aXRsZS5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXktMSBoLTUgdy00NCByb3VuZGVkLW1kXCIpKTtcclxuICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodmVyaWZpZWRTYWZlR2hvc3RCYWRnZSgpKTtcclxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XHJcblxyXG4gIGNvbnN0IGRlc2MgPSB0d2Vha1N0b3JlRGVzY3JpcHRpb24oKTtcclxuICBkZXNjLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJtdC0xIGgtMyB3LWZ1bGwgcm91bmRlZFwiKSk7XHJcbiAgZGVzYy5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwibXQtMiBoLTMgdy0xMS8xMiByb3VuZGVkXCIpKTtcclxuICBkZXNjLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJtdC0yIGgtMyB3LTcvMTIgcm91bmRlZFwiKSk7XHJcbiAgc3RhY2suYXBwZW5kQ2hpbGQoZGVzYyk7XHJcblxyXG4gIGNvbnN0IHJlYWRNb3JlID0gdHdlYWtTdG9yZVJlYWRNb3JlQnV0dG9uKFwiXCIpO1xyXG4gIHJlYWRNb3JlLnJlcGxhY2VDaGlsZHJlbihnaG9zdEJsb2NrKFwiaC01IHctMjQgcm91bmRlZFwiKSk7XHJcbiAgc3RhY2suYXBwZW5kQ2hpbGQocmVhZE1vcmUpO1xyXG5cclxuICB2ZXJzaW9ucy5hcHBlbmRDaGlsZChzdG9yZVZlcnNpb25HaG9zdEJhZGdlKCkpO1xyXG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3RvcmVTdGF0dXNHaG9zdFBpbGwoKSk7XHJcbiAgcmV0dXJuIGNhcmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0b3JlQXZhdGFyR2hvc3QoKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGF2YXRhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggaC0xMCB3LTEwIHNocmluay0wIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci1kZWZhdWx0IGJnLXRyYW5zcGFyZW50IHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xyXG4gIGF2YXRhci5hcHBlbmRDaGlsZChnaG9zdEJsb2NrKFwiaC1mdWxsIHctZnVsbFwiKSk7XHJcbiAgcmV0dXJuIGF2YXRhcjtcclxufVxyXG5cclxuZnVuY3Rpb24gdmVyaWZpZWRTYWZlR2hvc3RCYWRnZSgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgYmFkZ2UgPSB2ZXJpZmllZFNhZmVCYWRnZSgpO1xyXG4gIGJhZGdlLnJlcGxhY2VDaGlsZHJlbihnaG9zdEJsb2NrKFwiaC1bMTNweF0gdy1bMTNweF0gcm91bmRlZC1zbVwiKSwgZ2hvc3RCbG9jayhcImgtMyB3LTIwIHJvdW5kZWRcIikpO1xyXG4gIHJldHVybiBiYWRnZTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVTdGF0dXNHaG9zdFBpbGwoKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHBpbGwgPSBzdG9yZVN0YXR1c1BpbGwoXCJJbnN0YWxsZWRcIik7XHJcbiAgcGlsbC5jbGFzc0xpc3QuYWRkKFwiYW5pbWF0ZS1wdWxzZVwiKTtcclxuICBwaWxsLnN0eWxlLmNvbG9yID0gXCJ0cmFuc3BhcmVudFwiO1xyXG4gIHJldHVybiBwaWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZVZlcnNpb25HaG9zdEJhZGdlKCk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBiYWRnZSA9IHN0b3JlVmVyc2lvbkJhZGdlU2hlbGwoZmFsc2UpO1xyXG4gIGJhZGdlLmFwcGVuZENoaWxkKGdob3N0QmxvY2soXCJoLTMgdy0zNiByb3VuZGVkXCIpKTtcclxuICByZXR1cm4gYmFkZ2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdob3N0QmxvY2soY2xhc3NOYW1lOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgYmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGJsb2NrLmNsYXNzTmFtZSA9IGBhbmltYXRlLXB1bHNlIGJnLXRva2VuLWZvcmVncm91bmQvMTAgJHtjbGFzc05hbWV9YDtcclxuICBibG9jay5zZXRBdHRyaWJ1dGUoXCJhcmlhLWhpZGRlblwiLCBcInRydWVcIik7XHJcbiAgcmV0dXJuIGJsb2NrO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZUF2YXRhcihlbnRyeTogVHdlYWtTdG9yZUVudHJ5Vmlldyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBhdmF0YXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGF2YXRhci5jbGFzc05hbWUgPVxyXG4gICAgXCJmbGV4IGgtMTAgdy0xMCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXItZGVmYXVsdCBiZy10cmFuc3BhcmVudCB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcclxuICBjb25zdCBpbml0aWFsID0gKGVudHJ5Lm1hbmlmZXN0Lm5hbWU/LlswXSA/PyBcIj9cIikudG9VcHBlckNhc2UoKTtcclxuICBjb25zdCBmYWxsYmFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGZhbGxiYWNrLnRleHRDb250ZW50ID0gaW5pdGlhbDtcclxuICBhdmF0YXIuYXBwZW5kQ2hpbGQoZmFsbGJhY2spO1xyXG4gIGNvbnN0IGljb25VcmwgPSBzdG9yZUVudHJ5SWNvblVybChlbnRyeSk7XHJcbiAgaWYgKGljb25VcmwpIHtcclxuICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XHJcbiAgICBpbWcuYWx0ID0gXCJcIjtcclxuICAgIGltZy5jbGFzc05hbWUgPSBcImgtZnVsbCB3LWZ1bGwgb2JqZWN0LWNvdmVyXCI7XHJcbiAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgaW1nLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsICgpID0+IHtcclxuICAgICAgZmFsbGJhY2sucmVtb3ZlKCk7XHJcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgIH0pO1xyXG4gICAgaW1nLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoKSA9PiB7XHJcbiAgICAgIGltZy5yZW1vdmUoKTtcclxuICAgIH0pO1xyXG4gICAgaW1nLnNyYyA9IGljb25Vcmw7XHJcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoaW1nKTtcclxuICB9XHJcbiAgcmV0dXJuIGF2YXRhcjtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVFbnRyeUljb25VcmwoZW50cnk6IFR3ZWFrU3RvcmVFbnRyeVZpZXcpOiBzdHJpbmcgfCBudWxsIHtcclxuICBjb25zdCBpY29uVXJsID0gZW50cnkubWFuaWZlc3QuaWNvblVybD8udHJpbSgpO1xyXG4gIGlmICghaWNvblVybCkgcmV0dXJuIG51bGw7XHJcbiAgaWYgKC9eKGh0dHBzPzp8ZGF0YTopL2kudGVzdChpY29uVXJsKSkgcmV0dXJuIGljb25Vcmw7XHJcbiAgY29uc3QgcmVsID0gaWNvblVybC5yZXBsYWNlKC9eXFwuP1xcLy8sIFwiXCIpO1xyXG4gIGlmICghcmVsIHx8IHJlbC5zdGFydHNXaXRoKFwiLi4vXCIpKSByZXR1cm4gbnVsbDtcclxuICByZXR1cm4gYGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS8ke2VudHJ5LnJlcG99LyR7ZW50cnkuYXBwcm92ZWRDb21taXRTaGF9LyR7cmVsfWA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0b3JlVG9vbGJhckJ1dHRvbihcclxuICBsYWJlbDogc3RyaW5nLFxyXG4gIG9uQ2xpY2s6ICgpID0+IHZvaWQsXHJcbiAgdmFyaWFudDogXCJwcmltYXJ5XCIgfCBcInNlY29uZGFyeVwiID0gXCJzZWNvbmRhcnlcIixcclxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xyXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGJ0bi5jbGFzc05hbWUgPVxyXG4gICAgdmFyaWFudCA9PT0gXCJwcmltYXJ5XCJcclxuICAgICAgPyBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGgtOCBpdGVtcy1jZW50ZXIgZ2FwLTEgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1iZy1mb2cgcHgtMiBweS0wIHRleHQtc20gdGV4dC10b2tlbi1idXR0b24tdGVydGlhcnktZm9yZWdyb3VuZCBlbmFibGVkOmhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiXHJcbiAgICAgIDogXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggaXRlbXMtY2VudGVyIGdhcC0xIHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10cmFuc3BhcmVudCBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcHgtMiBweS0wIHRleHQtc20gdGV4dC10b2tlbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tZm9yZWdyb3VuZC8xMCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xyXG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xyXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICBvbkNsaWNrKCk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGJ0bjtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVJY29uQnV0dG9uKFxyXG4gIGljb25Tdmc6IHN0cmluZyxcclxuICBsYWJlbDogc3RyaW5nLFxyXG4gIG9uQ2xpY2s6ICgpID0+IHZvaWQsXHJcbik6IEhUTUxCdXR0b25FbGVtZW50IHtcclxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBidG4uY2xhc3NOYW1lID1cclxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGZsZXggaC04IHctOCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLXRyYW5zcGFyZW50IGJnLXRva2VuLWZvcmVncm91bmQvNSBwLTAgdGV4dC10b2tlbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tZm9yZWdyb3VuZC8xMCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xyXG4gIGJ0bi5pbm5lckhUTUwgPSBpY29uU3ZnO1xyXG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIGxhYmVsKTtcclxuICBidG4udGl0bGUgPSBsYWJlbDtcclxuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgb25DbGljaygpO1xyXG4gIH0pO1xyXG4gIHJldHVybiBidG47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZnJlc2hJY29uU3ZnKCk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIChcclxuICAgIGA8c3ZnIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIGNsYXNzPVwiaWNvbi14c1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNC40IDkuMzVBNS42NSA1LjY1IDAgMCAxIDE0IDUuM0wxNS43NSA3TTE1Ljc1IDMuNzVWN2gtMy4yNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcclxuICAgIGA8cGF0aCBkPVwiTTE1LjYgMTAuNjVBNS42NSA1LjY1IDAgMCAxIDYgMTQuN0w0LjI1IDEzTTQuMjUgMTYuMjVWMTNINy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDwvc3ZnPmBcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiB2ZXJpZmllZFNhZmVCYWRnZSgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBiYWRnZS5jbGFzc05hbWUgPVxyXG4gICAgXCJpbmxpbmUtZmxleCBoLTYgc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0xLjUgcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlci8zMCBiZy10cmFuc3BhcmVudCBweC0yIHRleHQteHMgZm9udC1tZWRpdW0gdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XHJcbiAgYmFkZ2UuaW5uZXJIVE1MID1cclxuICAgIGA8c3ZnIHdpZHRoPVwiMTNcIiBoZWlnaHQ9XCIxM1wiIHZpZXdCb3g9XCIwIDAgMTQgMTRcIiBmaWxsPVwibm9uZVwiIGNsYXNzPVwidGV4dC1ibHVlLTUwMFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNyAxLjc1IDExLjI1IDMuNHYzLjJjMCAyLjYtMS42NSA0LjI1LTQuMjUgNS40LTIuNi0xLjE1LTQuMjUtMi44LTQuMjUtNS40VjMuNEw3IDEuNzVaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS4xNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNC44NSA3LjA1IDYuMyA4LjQ1bDIuODUtMy4wNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuMjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICBgPC9zdmc+YCArXHJcbiAgICBgPHNwYW4+VmVyaWZpZWQgYXMgc2FmZTwvc3Bhbj5gO1xyXG4gIHJldHVybiBiYWRnZTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtTdG9yZVZlcnNpb25CYWRnZShlbnRyeTogVHdlYWtTdG9yZUVudHJ5VmlldywgaW5zdGFsbGVkT3ZlcnJpZGU/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgaW5zdGFsbGVkID0gaW5zdGFsbGVkT3ZlcnJpZGUgPz8gZW50cnkuaW5zdGFsbGVkPy52ZXJzaW9uID8/IG51bGw7XHJcbiAgY29uc3QgbGF0ZXN0ID0gZW50cnkubWFuaWZlc3QudmVyc2lvbjtcclxuICBjb25zdCBoYXNVcGRhdGUgPSAhIWluc3RhbGxlZCAmJiBpbnN0YWxsZWQgIT09IGxhdGVzdDtcclxuICBjb25zdCBiYWRnZSA9IHN0b3JlVmVyc2lvbkJhZGdlU2hlbGwoaGFzVXBkYXRlKTtcclxuICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJ1bmNhdGVcIjtcclxuICBsYWJlbC50ZXh0Q29udGVudCA9IGluc3RhbGxlZFxyXG4gICAgPyBgSW5zdGFsbGVkIHYke2luc3RhbGxlZH0gXHUwMEI3IExhdGVzdCB2JHtsYXRlc3R9YFxyXG4gICAgOiBgTGF0ZXN0IHYke2xhdGVzdH1gO1xyXG4gIGJhZGdlLnRpdGxlID0gaW5zdGFsbGVkXHJcbiAgICA/IGBJbnN0YWxsZWQgdmVyc2lvbiAke2luc3RhbGxlZH0uIExhdGVzdCBhcHByb3ZlZCB2ZXJzaW9uICR7bGF0ZXN0fS5gXHJcbiAgICA6IGBMYXRlc3QgYXBwcm92ZWQgdmVyc2lvbiAke2xhdGVzdH0uYDtcclxuICBiYWRnZS5hcHBlbmRDaGlsZChsYWJlbCk7XHJcbiAgcmV0dXJuIGJhZGdlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZVZlcnNpb25CYWRnZVNoZWxsKGhhc1VwZGF0ZTogYm9vbGVhbik6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGJhZGdlLmNsYXNzTmFtZSA9IFtcclxuICAgIFwiaW5saW5lLWZsZXggaC04IG1pbi13LTAgbWF4LXctZnVsbCBpdGVtcy1jZW50ZXIgcm91bmRlZC1sZyBib3JkZXIgcHgtMi41IHRleHQteHMgZm9udC1tZWRpdW1cIixcclxuICAgIGhhc1VwZGF0ZVxyXG4gICAgICA/IFwiYm9yZGVyLWJsdWUtNTAwLzMwIGJnLWJsdWUtNTAwLzEwIHRleHQtdG9rZW4tZm9yZWdyb3VuZFwiXHJcbiAgICAgIDogXCJib3JkZXItdG9rZW4tYm9yZGVyLzQwIGJnLXRva2VuLWZvcmVncm91bmQvNSB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIixcclxuICBdLmpvaW4oXCIgXCIpO1xyXG4gIHJldHVybiBiYWRnZTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVTdGF0dXNQaWxsKGxhYmVsOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIHBpbGwuY2xhc3NOYW1lID1cclxuICAgIFwiaW5saW5lLWZsZXggaC04IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLWxnIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0zIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XHJcbiAgcGlsbC50ZXh0Q29udGVudCA9IGxhYmVsO1xyXG4gIHJldHVybiBwaWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZUluc3RhbGxCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLmNsYXNzTmFtZSA9XHJcbiAgICBzdG9yZUluc3RhbGxCdXR0b25DbGFzcygpO1xyXG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xyXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICBvbkNsaWNrKGJ0bik7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGJ0bjtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoZXh0cmEgPSBcIlwiKTogc3RyaW5nIHtcclxuICByZXR1cm4gW1xyXG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBoLTggbWluLXctWzgycHhdIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBnYXAtMS41IHdoaXRlc3BhY2Utbm93cmFwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci1ibHVlLTUwMC80MCBiZy1ibHVlLTUwMCBweC0zIHB5LTAgdGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLWZvcmVncm91bmQgc2hhZG93LXNtIHRyYW5zaXRpb24tY29sb3JzIGVuYWJsZWQ6aG92ZXI6YmctYmx1ZS02MDAgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkIGRpc2FibGVkOm9wYWNpdHktODBcIixcclxuICAgIGV4dHJhLFxyXG4gIF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCIgXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG93U3RvcmVCdXR0b25Mb2FkaW5nKGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQsIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcclxuICBidXR0b24uY2xhc3NOYW1lID0gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoKTtcclxuICBidXR0b24uZGlzYWJsZWQgPSB0cnVlO1xyXG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWJ1c3lcIiwgXCJ0cnVlXCIpO1xyXG4gIGJ1dHRvbi5pbm5lckhUTUwgPVxyXG4gICAgYDxzdmcgY2xhc3M9XCJhbmltYXRlLXNwaW5cIiB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgZmlsbD1cIm5vbmVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcclxuICAgIGA8Y2lyY2xlIGN4PVwiOFwiIGN5PVwiOFwiIHI9XCI1LjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgb3BhY2l0eT1cIi4yNVwiLz5gICtcclxuICAgIGA8cGF0aCBkPVwiTTEzLjUgOEE1LjUgNS41IDAgMCAwIDggMi41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXHJcbiAgICBgPC9zdmc+YCArXHJcbiAgICBgPHNwYW4+JHtsYWJlbH08L3NwYW4+YDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvd1N0b3JlQnV0dG9uSW5zdGFsbGVkKGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcclxuICBidXR0b24uY2xhc3NOYW1lID0gc3RvcmVJbnN0YWxsQnV0dG9uQ2xhc3MoXCJib3JkZXItYmx1ZS01MDAgYmctYmx1ZS01MDBcIik7XHJcbiAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcclxuICBidXR0b24ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1idXN5XCIpO1xyXG4gIGJ1dHRvbi5pbm5lckhUTUwgPVxyXG4gICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNiAxNlwiIGZpbGw9XCJub25lXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICBgPHBhdGggZD1cIk0zLjc1IDguMTUgNi42NSAxMSAxMi4yNSA1XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS44XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDwvc3ZnPmAgK1xyXG4gICAgYDxzcGFuPkluc3RhbGxlZDwvc3Bhbj5gO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXNldFN0b3JlSW5zdGFsbEJ1dHRvbihidXR0b246IEhUTUxCdXR0b25FbGVtZW50LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XHJcbiAgYnV0dG9uLmNsYXNzTmFtZSA9IHN0b3JlSW5zdGFsbEJ1dHRvbkNsYXNzKCk7XHJcbiAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgYnV0dG9uLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtYnVzeVwiKTtcclxuICBidXR0b24udGV4dENvbnRlbnQgPSBsYWJlbDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvd1N0b3JlVG9hc3QobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgbGV0IGhvc3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtc3RvcmUtdG9hc3QtaG9zdF1cIik7XHJcbiAgaWYgKCFob3N0KSB7XHJcbiAgICBob3N0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGhvc3QuZGF0YXNldC5jb2RleHBwU3RvcmVUb2FzdEhvc3QgPSBcInRydWVcIjtcclxuICAgIGhvc3QuY2xhc3NOYW1lID0gXCJwb2ludGVyLWV2ZW50cy1ub25lIGZpeGVkIGJvdHRvbS01IHJpZ2h0LTUgei1bOTk5OV0gZmxleCBmbGV4LWNvbCBpdGVtcy1lbmQgZ2FwLTJcIjtcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaG9zdCk7XHJcbiAgfVxyXG4gIGNvbnN0IHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0b2FzdC5jbGFzc05hbWUgPVxyXG4gICAgXCJ0cmFuc2xhdGUteS0yIHJvdW5kZWQteGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIvNTAgYmctdG9rZW4tbWFpbi1zdXJmYWNlLXByaW1hcnkgcHgtMyBweS0yIHRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi1mb3JlZ3JvdW5kIG9wYWNpdHktMCBzaGFkb3ctbGcgdHJhbnNpdGlvbi1hbGwgZHVyYXRpb24tMjAwXCI7XHJcbiAgdG9hc3QudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xyXG4gIGhvc3QuYXBwZW5kQ2hpbGQodG9hc3QpO1xyXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICB0b2FzdC5jbGFzc0xpc3QucmVtb3ZlKFwidHJhbnNsYXRlLXktMlwiLCBcIm9wYWNpdHktMFwiKTtcclxuICB9KTtcclxuICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgIHRvYXN0LmNsYXNzTGlzdC5hZGQoXCJ0cmFuc2xhdGUteS0yXCIsIFwib3BhY2l0eS0wXCIpO1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRvYXN0LnJlbW92ZSgpO1xyXG4gICAgICBpZiAoaG9zdCAmJiBob3N0LmNoaWxkRWxlbWVudENvdW50ID09PSAwKSBob3N0LnJlbW92ZSgpO1xyXG4gICAgfSwgMjIwKTtcclxuICB9LCAyNjAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcmVNZXNzYWdlQ2FyZCh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBjYXJkLmNsYXNzTmFtZSA9XHJcbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIvNDAgZmxleCBtaW4taC1bODRweF0gZmxleC1jb2wganVzdGlmeS1jZW50ZXIgZ2FwLTEgcm91bmRlZC0yeGwgYm9yZGVyIHAtNCB0ZXh0LXNtXCI7XHJcbiAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdC5jbGFzc05hbWUgPSBcImZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdC50ZXh0Q29udGVudCA9IHRpdGxlO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQodCk7XHJcbiAgaWYgKGRlc2NyaXB0aW9uKSB7XHJcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGQuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XHJcbiAgICBkLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XHJcbiAgICBjYXJkLmFwcGVuZENoaWxkKGQpO1xyXG4gIH1cclxuICByZXR1cm4gY2FyZDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvcnRTaGEodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHZhbHVlLnNsaWNlKDAsIDcpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJUd2Vha3NQYWdlKHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICBjb25zdCBvcGVuQnRuID0gb3BlbkluUGxhY2VCdXR0b24oXCJPcGVuIFR3ZWFrcyBGb2xkZXJcIiwgKCkgPT4ge1xyXG4gICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnJldmVhbFwiLCB0d2Vha3NQYXRoKCkpO1xyXG4gIH0pO1xyXG4gIGNvbnN0IHJlbG9hZEJ0biA9IG9wZW5JblBsYWNlQnV0dG9uKFwiRm9yY2UgUmVsb2FkXCIsICgpID0+IHtcclxuICAgIC8vIEZ1bGwgcGFnZSByZWZyZXNoIFx1MjAxNCBzYW1lIGFzIERldlRvb2xzIENtZC1SIC8gb3VyIENEUCBQYWdlLnJlbG9hZC5cclxuICAgIC8vIE1haW4gcmUtZGlzY292ZXJzIHR3ZWFrcyBmaXJzdCBzbyB0aGUgbmV3IHJlbmRlcmVyIGNvbWVzIHVwIHdpdGggYVxyXG4gICAgLy8gZnJlc2ggdHdlYWsgc2V0OyB0aGVuIGxvY2F0aW9uLnJlbG9hZCByZXN0YXJ0cyB0aGUgcmVuZGVyZXIgc28gdGhlXHJcbiAgICAvLyBwcmVsb2FkIHJlLWluaXRpYWxpemVzIGFnYWluc3QgaXQuXHJcbiAgICB2b2lkIGlwY1JlbmRlcmVyXHJcbiAgICAgIC5pbnZva2UoXCJjb2RleHBwOnJlbG9hZC10d2Vha3NcIilcclxuICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwiZm9yY2UgcmVsb2FkIChtYWluKSBmYWlsZWRcIiwgU3RyaW5nKGUpKSlcclxuICAgICAgLmZpbmFsbHkoKCkgPT4ge1xyXG4gICAgICAgIGxvY2F0aW9uLnJlbG9hZCgpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxuICAvLyBEcm9wIHRoZSBkaWFnb25hbC1hcnJvdyBpY29uIGZyb20gdGhlIHJlbG9hZCBidXR0b24gXHUyMDE0IGl0IGltcGxpZXMgXCJvcGVuXHJcbiAgLy8gb3V0IG9mIGFwcFwiIHdoaWNoIGRvZXNuJ3QgZml0LiBSZXBsYWNlIGl0cyB0cmFpbGluZyBzdmcgd2l0aCBhIHJlZnJlc2guXHJcbiAgY29uc3QgcmVsb2FkU3ZnID0gcmVsb2FkQnRuLnF1ZXJ5U2VsZWN0b3IoXCJzdmdcIik7XHJcbiAgaWYgKHJlbG9hZFN2Zykge1xyXG4gICAgcmVsb2FkU3ZnLm91dGVySFRNTCA9XHJcbiAgICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tMnhzXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICAgIGA8cGF0aCBkPVwiTTQgMTBhNiA2IDAgMCAxIDEwLjI0LTQuMjRMMTYgNy41TTE2IDR2My41aC0zLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICAgIGA8cGF0aCBkPVwiTTE2IDEwYTYgNiAwIDAgMS0xMC4yNCA0LjI0TDQgMTIuNU00IDE2di0zLjVoMy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgICBgPC9zdmc+YDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHRyYWlsaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0cmFpbGluZy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgdHJhaWxpbmcuYXBwZW5kQ2hpbGQocmVsb2FkQnRuKTtcclxuICB0cmFpbGluZy5hcHBlbmRDaGlsZChvcGVuQnRuKTtcclxuXHJcbiAgaWYgKHN0YXRlLmxpc3RlZFR3ZWFrcy5sZW5ndGggPT09IDApIHtcclxuICAgIGNvbnN0IHNlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICAgIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XHJcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIkluc3RhbGxlZCBUd2Vha3NcIiwgdHJhaWxpbmcpKTtcclxuICAgIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xyXG4gICAgY2FyZC5hcHBlbmRDaGlsZChcclxuICAgICAgcm93U2ltcGxlKFxyXG4gICAgICAgIFwiTm8gdHdlYWtzIGluc3RhbGxlZFwiLFxyXG4gICAgICAgIGBEcm9wIGEgdHdlYWsgZm9sZGVyIGludG8gJHt0d2Vha3NQYXRoKCl9IGFuZCByZWxvYWQuYCxcclxuICAgICAgKSxcclxuICAgICk7XHJcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKGNhcmQpO1xyXG4gICAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgLy8gR3JvdXAgcmVnaXN0ZXJlZCBTZXR0aW5nc1NlY3Rpb25zIGJ5IHR3ZWFrIGlkIChwcmVmaXggc3BsaXQgYXQgXCI6XCIpLlxyXG4gIGNvbnN0IHNlY3Rpb25zQnlUd2VhayA9IG5ldyBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb25bXT4oKTtcclxuICBmb3IgKGNvbnN0IHMgb2Ygc3RhdGUuc2VjdGlvbnMudmFsdWVzKCkpIHtcclxuICAgIGNvbnN0IHR3ZWFrSWQgPSBzLmlkLnNwbGl0KFwiOlwiKVswXTtcclxuICAgIGlmICghc2VjdGlvbnNCeVR3ZWFrLmhhcyh0d2Vha0lkKSkgc2VjdGlvbnNCeVR3ZWFrLnNldCh0d2Vha0lkLCBbXSk7XHJcbiAgICBzZWN0aW9uc0J5VHdlYWsuZ2V0KHR3ZWFrSWQpIS5wdXNoKHMpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcGFnZXNCeVR3ZWFrID0gbmV3IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRQYWdlW10+KCk7XHJcbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XHJcbiAgICBpZiAoIXBhZ2VzQnlUd2Vhay5oYXMocC50d2Vha0lkKSkgcGFnZXNCeVR3ZWFrLnNldChwLnR3ZWFrSWQsIFtdKTtcclxuICAgIHBhZ2VzQnlUd2Vhay5nZXQocC50d2Vha0lkKSEucHVzaChwKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICB3cmFwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xyXG4gIHdyYXAuYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiSW5zdGFsbGVkIFR3ZWFrc1wiLCB0cmFpbGluZykpO1xyXG5cclxuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcclxuICBmb3IgKGNvbnN0IHQgb2Ygc3RhdGUubGlzdGVkVHdlYWtzKSB7XHJcbiAgICBjYXJkLmFwcGVuZENoaWxkKFxyXG4gICAgICB0d2Vha1JvdyhcclxuICAgICAgICB0LFxyXG4gICAgICAgIHNlY3Rpb25zQnlUd2Vhay5nZXQodC5tYW5pZmVzdC5pZCkgPz8gW10sXHJcbiAgICAgICAgcGFnZXNCeVR3ZWFrLmdldCh0Lm1hbmlmZXN0LmlkKSA/PyBbXSxcclxuICAgICAgKSxcclxuICAgICk7XHJcbiAgfVxyXG4gIHdyYXAuYXBwZW5kQ2hpbGQoY2FyZCk7XHJcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHdyYXApO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0d2Vha1JvdyhcclxuICB0OiBMaXN0ZWRUd2VhayxcclxuICBzZWN0aW9uczogU2V0dGluZ3NTZWN0aW9uW10sXHJcbiAgcGFnZXM6IFJlZ2lzdGVyZWRQYWdlW10sXHJcbik6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBtID0gdC5tYW5pZmVzdDtcclxuXHJcbiAgLy8gT3V0ZXIgY2VsbCB3cmFwcyB0aGUgaGVhZGVyIHJvdyArIChvcHRpb25hbCkgbmVzdGVkIHNlY3Rpb25zIHNvIHRoZVxyXG4gIC8vIHBhcmVudCBjYXJkJ3MgZGl2aWRlciBzdGF5cyBiZXR3ZWVuICp0d2Vha3MqLCBub3QgYmV0d2VlbiBoZWFkZXIgYW5kXHJcbiAgLy8gYm9keSBvZiB0aGUgc2FtZSB0d2Vhay5cclxuICBjb25zdCBjZWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBjZWxsLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbFwiO1xyXG4gIGlmICghdC5lbmFibGVkKSBjZWxsLnN0eWxlLm9wYWNpdHkgPSBcIjAuN1wiO1xyXG5cclxuICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRlci5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG5cclxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBpdGVtcy1zdGFydCBnYXAtM1wiO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgQXZhdGFyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGNvbnN0IGF2YXRhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgb3ZlcmZsb3ctaGlkZGVuIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBhdmF0YXIuc3R5bGUud2lkdGggPSBcIjU2cHhcIjtcclxuICBhdmF0YXIuc3R5bGUuaGVpZ2h0ID0gXCI1NnB4XCI7XHJcbiAgYXZhdGFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCB0cmFuc3BhcmVudClcIjtcclxuICBpZiAobS5pY29uVXJsKSB7XHJcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgaW1nLmFsdCA9IFwiXCI7XHJcbiAgICBpbWcuY2xhc3NOYW1lID0gXCJzaXplLWZ1bGwgb2JqZWN0LWNvbnRhaW5cIjtcclxuICAgIC8vIEluaXRpYWw6IHNob3cgZmFsbGJhY2sgaW5pdGlhbCBpbiBjYXNlIHRoZSBpY29uIGZhaWxzIHRvIGxvYWQuXHJcbiAgICBjb25zdCBpbml0aWFsID0gKG0ubmFtZT8uWzBdID8/IFwiP1wiKS50b1VwcGVyQ2FzZSgpO1xyXG4gICAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIGZhbGxiYWNrLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGZhbGxiYWNrKTtcclxuICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgKCkgPT4ge1xyXG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcclxuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgfSk7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcclxuICAgICAgaW1nLnJlbW92ZSgpO1xyXG4gICAgfSk7XHJcbiAgICB2b2lkIHJlc29sdmVJY29uVXJsKG0uaWNvblVybCwgdC5kaXIpLnRoZW4oKHVybCkgPT4ge1xyXG4gICAgICBpZiAodXJsKSBpbWcuc3JjID0gdXJsO1xyXG4gICAgICBlbHNlIGltZy5yZW1vdmUoKTtcclxuICAgIH0pO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGltZyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IGluaXRpYWwgPSAobS5uYW1lPy5bMF0gPz8gXCI/XCIpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICBzcGFuLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGluaXRpYWw7XHJcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgfVxyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoYXZhdGFyKTtcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFRleHQgc3RhY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0wLjVcIjtcclxuXHJcbiAgY29uc3QgdGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlUm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcclxuICBjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBuYW1lLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgbmFtZS50ZXh0Q29udGVudCA9IG0ubmFtZTtcclxuICB0aXRsZVJvdy5hcHBlbmRDaGlsZChuYW1lKTtcclxuICBpZiAobS52ZXJzaW9uKSB7XHJcbiAgICBjb25zdCB2ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIHZlci5jbGFzc05hbWUgPVxyXG4gICAgICBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgdGV4dC14cyBmb250LW5vcm1hbCB0YWJ1bGFyLW51bXNcIjtcclxuICAgIHZlci50ZXh0Q29udGVudCA9IGB2JHttLnZlcnNpb259YDtcclxuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHZlcik7XHJcbiAgfVxyXG4gIGlmICh0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlKSB7XHJcbiAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgYmFkZ2UuY2xhc3NOYW1lID1cclxuICAgICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgICBiYWRnZS50ZXh0Q29udGVudCA9IFwiVXBkYXRlIEF2YWlsYWJsZVwiO1xyXG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQoYmFkZ2UpO1xyXG4gIH1cclxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XHJcblxyXG4gIGlmIChtLmRlc2NyaXB0aW9uKSB7XHJcbiAgICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xyXG4gICAgZGVzYy50ZXh0Q29udGVudCA9IG0uZGVzY3JpcHRpb247XHJcbiAgICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IG1ldGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG1ldGEuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiB0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBjb25zdCBhdXRob3JFbCA9IHJlbmRlckF1dGhvcihtLmF1dGhvcik7XHJcbiAgaWYgKGF1dGhvckVsKSBtZXRhLmFwcGVuZENoaWxkKGF1dGhvckVsKTtcclxuICBpZiAobS5naXRodWJSZXBvKSB7XHJcbiAgICBpZiAobWV0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSBtZXRhLmFwcGVuZENoaWxkKGRvdCgpKTtcclxuICAgIGNvbnN0IHJlcG8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgcmVwby50eXBlID0gXCJidXR0b25cIjtcclxuICAgIHJlcG8uY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xyXG4gICAgcmVwby50ZXh0Q29udGVudCA9IG0uZ2l0aHViUmVwbztcclxuICAgIHJlcG8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgYGh0dHBzOi8vZ2l0aHViLmNvbS8ke20uZ2l0aHViUmVwb31gKTtcclxuICAgIH0pO1xyXG4gICAgbWV0YS5hcHBlbmRDaGlsZChyZXBvKTtcclxuICB9XHJcbiAgaWYgKG0uaG9tZXBhZ2UpIHtcclxuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xyXG4gICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gICAgbGluay5ocmVmID0gbS5ob21lcGFnZTtcclxuICAgIGxpbmsudGFyZ2V0ID0gXCJfYmxhbmtcIjtcclxuICAgIGxpbmsucmVsID0gXCJub3JlZmVycmVyXCI7XHJcbiAgICBsaW5rLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcclxuICAgIGxpbmsudGV4dENvbnRlbnQgPSBcIkhvbWVwYWdlXCI7XHJcbiAgICBtZXRhLmFwcGVuZENoaWxkKGxpbmspO1xyXG4gIH1cclxuICBpZiAobWV0YS5jaGlsZHJlbi5sZW5ndGggPiAwKSBzdGFjay5hcHBlbmRDaGlsZChtZXRhKTtcclxuXHJcbiAgLy8gVGFncyByb3cgKGlmIGFueSkgXHUyMDE0IHNtYWxsIHBpbGwgY2hpcHMgYmVsb3cgdGhlIG1ldGEgbGluZS5cclxuICBpZiAobS50YWdzICYmIG0udGFncy5sZW5ndGggPiAwKSB7XHJcbiAgICBjb25zdCB0YWdzUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRhZ3NSb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIgZ2FwLTEgcHQtMC41XCI7XHJcbiAgICBmb3IgKGNvbnN0IHRhZyBvZiBtLnRhZ3MpIHtcclxuICAgICAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgICBwaWxsLmNsYXNzTmFtZSA9XHJcbiAgICAgICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICAgICAgcGlsbC50ZXh0Q29udGVudCA9IHRhZztcclxuICAgICAgdGFnc1Jvdy5hcHBlbmRDaGlsZChwaWxsKTtcclxuICAgIH1cclxuICAgIHN0YWNrLmFwcGVuZENoaWxkKHRhZ3NSb3cpO1xyXG4gIH1cclxuXHJcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxlZnQpO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgVG9nZ2xlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yIHB0LTAuNVwiO1xyXG4gIGlmICh0LmVuYWJsZWQgJiYgcGFnZXMubGVuZ3RoID4gMCkge1xyXG4gICAgY29uc3QgY29uZmlndXJlQnRuID0gY29tcGFjdEJ1dHRvbihcIkNvbmZpZ3VyZVwiLCAoKSA9PiB7XHJcbiAgICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiLCBpZDogcGFnZXNbMF0hLmlkIH0pO1xyXG4gICAgfSk7XHJcbiAgICBjb25maWd1cmVCdG4udGl0bGUgPSBwYWdlcy5sZW5ndGggPT09IDFcclxuICAgICAgPyBgT3BlbiAke3BhZ2VzWzBdIS5wYWdlLnRpdGxlfWBcclxuICAgICAgOiBgT3BlbiAke3BhZ2VzLm1hcCgocCkgPT4gcC5wYWdlLnRpdGxlKS5qb2luKFwiLCBcIil9YDtcclxuICAgIHJpZ2h0LmFwcGVuZENoaWxkKGNvbmZpZ3VyZUJ0bik7XHJcbiAgfVxyXG4gIGlmICh0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlICYmIHQudXBkYXRlLnJlbGVhc2VVcmwpIHtcclxuICAgIHJpZ2h0LmFwcGVuZENoaWxkKFxyXG4gICAgICBjb21wYWN0QnV0dG9uKFwiUmV2aWV3IFJlbGVhc2VcIiwgKCkgPT4ge1xyXG4gICAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIHQudXBkYXRlIS5yZWxlYXNlVXJsKTtcclxuICAgICAgfSksXHJcbiAgICApO1xyXG4gIH1cclxuICByaWdodC5hcHBlbmRDaGlsZChcclxuICAgIHN3aXRjaENvbnRyb2wodC5lbmFibGVkLCBhc3luYyAobmV4dCkgPT4ge1xyXG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnNldC10d2Vhay1lbmFibGVkXCIsIG0uaWQsIG5leHQpO1xyXG4gICAgICAvLyBUaGUgbWFpbiBwcm9jZXNzIGJyb2FkY2FzdHMgYSByZWxvYWQgd2hpY2ggd2lsbCByZS1mZXRjaCB0aGUgbGlzdFxyXG4gICAgICAvLyBhbmQgcmUtcmVuZGVyLiBXZSBkb24ndCBvcHRpbWlzdGljYWxseSB0b2dnbGUgdG8gYXZvaWQgZHJpZnQuXHJcbiAgICB9KSxcclxuICApO1xyXG4gIGhlYWRlci5hcHBlbmRDaGlsZChyaWdodCk7XHJcblxyXG4gIGNlbGwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuXHJcbiAgLy8gSWYgdGhlIHR3ZWFrIGlzIGVuYWJsZWQgYW5kIHJlZ2lzdGVyZWQgc2V0dGluZ3Mgc2VjdGlvbnMsIHJlbmRlciB0aG9zZVxyXG4gIC8vIGJvZGllcyBhcyBuZXN0ZWQgcm93cyBiZW5lYXRoIHRoZSBoZWFkZXIgaW5zaWRlIHRoZSBzYW1lIGNlbGwuXHJcbiAgaWYgKHQuZW5hYmxlZCAmJiBzZWN0aW9ucy5sZW5ndGggPiAwKSB7XHJcbiAgICBjb25zdCBuZXN0ZWQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgbmVzdGVkLmNsYXNzTmFtZSA9XHJcbiAgICAgIFwiZmxleCBmbGV4LWNvbCBkaXZpZGUteS1bMC41cHhdIGRpdmlkZS10b2tlbi1ib3JkZXIgYm9yZGVyLXQtWzAuNXB4XSBib3JkZXItdG9rZW4tYm9yZGVyXCI7XHJcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc2VjdGlvbnMpIHtcclxuICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGJvZHkuY2xhc3NOYW1lID0gXCJwLTNcIjtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBzLnJlbmRlcihib2R5KTtcclxuICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGJvZHkudGV4dENvbnRlbnQgPSBgRXJyb3IgcmVuZGVyaW5nIHR3ZWFrIHNlY3Rpb246ICR7KGUgYXMgRXJyb3IpLm1lc3NhZ2V9YDtcclxuICAgICAgfVxyXG4gICAgICBuZXN0ZWQuYXBwZW5kQ2hpbGQoYm9keSk7XHJcbiAgICB9XHJcbiAgICBjZWxsLmFwcGVuZENoaWxkKG5lc3RlZCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gY2VsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyQXV0aG9yKGF1dGhvcjogVHdlYWtNYW5pZmVzdFtcImF1dGhvclwiXSk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XHJcbiAgaWYgKCFhdXRob3IpIHJldHVybiBudWxsO1xyXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICB3cmFwLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIGdhcC0xXCI7XHJcbiAgaWYgKHR5cGVvZiBhdXRob3IgPT09IFwic3RyaW5nXCIpIHtcclxuICAgIHdyYXAudGV4dENvbnRlbnQgPSBgYnkgJHthdXRob3J9YDtcclxuICAgIHJldHVybiB3cmFwO1xyXG4gIH1cclxuICB3cmFwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiYnkgXCIpKTtcclxuICBpZiAoYXV0aG9yLnVybCkge1xyXG4gICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gICAgYS5ocmVmID0gYXV0aG9yLnVybDtcclxuICAgIGEudGFyZ2V0ID0gXCJfYmxhbmtcIjtcclxuICAgIGEucmVsID0gXCJub3JlZmVycmVyXCI7XHJcbiAgICBhLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcclxuICAgIGEudGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcclxuICAgIHdyYXAuYXBwZW5kQ2hpbGQoYSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIHNwYW4udGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcclxuICAgIHdyYXAuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgfVxyXG4gIHJldHVybiB3cmFwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBvcGVuUHVibGlzaFR3ZWFrRGlhbG9nKCk6IHZvaWQge1xyXG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCJbZGF0YS1jb2RleHBwLXB1Ymxpc2gtZGlhbG9nXVwiKTtcclxuICBleGlzdGluZz8ucmVtb3ZlKCk7XHJcblxyXG4gIGNvbnN0IG92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG92ZXJsYXkuZGF0YXNldC5jb2RleHBwUHVibGlzaERpYWxvZyA9IFwidHJ1ZVwiO1xyXG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJmaXhlZCBpbnNldC0wIHotWzk5OTldIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIGJnLWJsYWNrLzQwIHAtNFwiO1xyXG5cclxuICBjb25zdCBkaWFsb2cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGRpYWxvZy5jbGFzc05hbWUgPVxyXG4gICAgXCJmbGV4IHctZnVsbCBtYXgtdy14bCBmbGV4LWNvbCBnYXAtNCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLW1haW4tc3VyZmFjZS1wcmltYXJ5IHAtNCBzaGFkb3cteGxcIjtcclxuICBvdmVybGF5LmFwcGVuZENoaWxkKGRpYWxvZyk7XHJcblxyXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1zdGFydCBqdXN0aWZ5LWJldHdlZW4gZ2FwLTNcIjtcclxuICBjb25zdCB0aXRsZVN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZVN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XHJcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidGV4dC1iYXNlIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIlB1Ymxpc2ggVHdlYWtcIjtcclxuICBjb25zdCBzdWJ0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc3VidGl0bGUuY2xhc3NOYW1lID0gXCJ0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBzdWJ0aXRsZS50ZXh0Q29udGVudCA9IFwiU3VibWl0IGEgR2l0SHViIHJlcG8gZm9yIGFkbWluIHJldmlldy4gQ29kZXgrKyByZWNvcmRzIHRoZSBleGFjdCBjb21taXQgYWRtaW5zIG11c3QgcmV2aWV3IGFuZCBwaW4uXCI7XHJcbiAgdGl0bGVTdGFjay5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgdGl0bGVTdGFjay5hcHBlbmRDaGlsZChzdWJ0aXRsZSk7XHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKHRpdGxlU3RhY2spO1xyXG4gIGhlYWRlci5hcHBlbmRDaGlsZChjb21wYWN0QnV0dG9uKFwiRGlzbWlzc1wiLCAoKSA9PiBvdmVybGF5LnJlbW92ZSgpKSk7XHJcbiAgZGlhbG9nLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIGNvbnN0IHJlcG9JbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcclxuICByZXBvSW5wdXQudHlwZSA9IFwidGV4dFwiO1xyXG4gIHJlcG9JbnB1dC5wbGFjZWhvbGRlciA9IFwib3duZXIvcmVwbyBvciBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwb1wiO1xyXG4gIHJlcG9JbnB1dC5jbGFzc05hbWUgPVxyXG4gICAgXCJoLTEwIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdHJhbnNwYXJlbnQgcHgtMyB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGZvY3VzOm91dGxpbmUtbm9uZVwiO1xyXG4gIGRpYWxvZy5hcHBlbmRDaGlsZChyZXBvSW5wdXQpO1xyXG5cclxuICBjb25zdCBzdGF0dXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHN0YXR1cy5jbGFzc05hbWUgPSBcIm1pbi1oLTUgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XHJcbiAgc3RhdHVzLnRleHRDb250ZW50ID0gXCJUaGUgbWFuaWZlc3Qgc2hvdWxkIGluY2x1ZGUgYW4gaWNvblVybCBzdWl0YWJsZSBmb3IgdGhlIHN0b3JlLlwiO1xyXG4gIGRpYWxvZy5hcHBlbmRDaGlsZChzdGF0dXMpO1xyXG5cclxuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1lbmQgZ2FwLTJcIjtcclxuICBjb25zdCBzdWJtaXQgPSBjb21wYWN0QnV0dG9uKFwiT3BlbiBSZXZpZXcgSXNzdWVcIiwgKCkgPT4ge1xyXG4gICAgdm9pZCBzdWJtaXRQdWJsaXNoVHdlYWsocmVwb0lucHV0LCBzdGF0dXMpO1xyXG4gIH0pO1xyXG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoc3VibWl0KTtcclxuICBkaWFsb2cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcblxyXG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIG92ZXJsYXkucmVtb3ZlKCk7XHJcbiAgfSk7XHJcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcclxuICByZXBvSW5wdXQuZm9jdXMoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc3VibWl0UHVibGlzaFR3ZWFrKFxyXG4gIHJlcG9JbnB1dDogSFRNTElucHV0RWxlbWVudCxcclxuICBzdGF0dXM6IEhUTUxFbGVtZW50LFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICBzdGF0dXMuY2xhc3NOYW1lID0gXCJtaW4taC01IHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xyXG4gIHN0YXR1cy50ZXh0Q29udGVudCA9IFwiUmVzb2x2aW5nIHRoZSByZXBvIGNvbW1pdCB0byByZXZpZXcuXCI7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHN1Ym1pc3Npb24gPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXHJcbiAgICAgIFwiY29kZXhwcDpwcmVwYXJlLXR3ZWFrLXN0b3JlLXN1Ym1pc3Npb25cIixcclxuICAgICAgcmVwb0lucHV0LnZhbHVlLFxyXG4gICAgKSBhcyBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb247XHJcbiAgICBjb25zdCB1cmwgPSBidWlsZFR3ZWFrUHVibGlzaElzc3VlVXJsKHN1Ym1pc3Npb24pO1xyXG4gICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIHVybCk7XHJcbiAgICBzdGF0dXMudGV4dENvbnRlbnQgPSBgR2l0SHViIHJldmlldyBpc3N1ZSBvcGVuZWQgZm9yICR7c3VibWlzc2lvbi5jb21taXRTaGEuc2xpY2UoMCwgNyl9LmA7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgc3RhdHVzLmNsYXNzTmFtZSA9IFwibWluLWgtNSB0ZXh0LXNtIHRleHQtdG9rZW4tY2hhcnRzLXJlZFwiO1xyXG4gICAgc3RhdHVzLnRleHRDb250ZW50ID0gU3RyaW5nKChlIGFzIEVycm9yKS5tZXNzYWdlID8/IGUpO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGNvbXBvbmVudHMgXHUyNTAwXHUyNTAwXHJcblxyXG4vKiogVGhlIGZ1bGwgcGFuZWwgc2hlbGwgKHRvb2xiYXIgKyBzY3JvbGwgKyBoZWFkaW5nICsgc2VjdGlvbnMgd3JhcCkuICovXHJcbmZ1bmN0aW9uIHBhbmVsU2hlbGwoXHJcbiAgdGl0bGU6IHN0cmluZyxcclxuICBzdWJ0aXRsZT86IHN0cmluZyxcclxuICBvcHRpb25zPzogeyB3aWRlPzogYm9vbGVhbiB9LFxyXG4pOiB7XHJcbiAgb3V0ZXI6IEhUTUxFbGVtZW50O1xyXG4gIHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQ7XHJcbiAgc3VidGl0bGU/OiBIVE1MRWxlbWVudDtcclxuICBoZWFkZXJBY3Rpb25zOiBIVE1MRWxlbWVudDtcclxufSB7XHJcbiAgY29uc3Qgb3V0ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG91dGVyLmNsYXNzTmFtZSA9IFwibWFpbi1zdXJmYWNlIGZsZXggaC1mdWxsIG1pbi1oLTAgZmxleC1jb2xcIjtcclxuXHJcbiAgY29uc3QgdG9vbGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdG9vbGJhci5jbGFzc05hbWUgPVxyXG4gICAgXCJkcmFnZ2FibGUgZmxleCBpdGVtcy1jZW50ZXIgcHgtcGFuZWwgZWxlY3Ryb246aC10b29sYmFyIGV4dGVuc2lvbjpoLXRvb2xiYXItc21cIjtcclxuICBvdXRlci5hcHBlbmRDaGlsZCh0b29sYmFyKTtcclxuXHJcbiAgY29uc3Qgc2Nyb2xsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzY3JvbGwuY2xhc3NOYW1lID0gXCJmbGV4LTEgb3ZlcmZsb3cteS1hdXRvIHAtcGFuZWxcIjtcclxuICBvdXRlci5hcHBlbmRDaGlsZChzY3JvbGwpO1xyXG5cclxuICBjb25zdCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaW5uZXIuY2xhc3NOYW1lID1cclxuICAgIG9wdGlvbnM/LndpZGVcclxuICAgICAgPyBcIm14LWF1dG8gZmxleCB3LWZ1bGwgbWF4LXctNXhsIGZsZXgtY29sIGVsZWN0cm9uOm1pbi13LVtjYWxjKDMyMHB4KnZhcigtLWNvZGV4LXdpbmRvdy16b29tKSldXCJcclxuICAgICAgOiBcIm14LWF1dG8gZmxleCB3LWZ1bGwgZmxleC1jb2wgbWF4LXctMnhsIGVsZWN0cm9uOm1pbi13LVtjYWxjKDMyMHB4KnZhcigtLWNvZGV4LXdpbmRvdy16b29tKSldXCI7XHJcbiAgc2Nyb2xsLmFwcGVuZENoaWxkKGlubmVyKTtcclxuXHJcbiAgY29uc3QgaGVhZGVyV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyV3JhcC5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtMyBwYi1wYW5lbFwiO1xyXG4gIGNvbnN0IGhlYWRlcklubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXJJbm5lci5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTEuNSBwYi1wYW5lbFwiO1xyXG4gIGNvbnN0IGhlYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRpbmcuY2xhc3NOYW1lID0gXCJlbGVjdHJvbjpoZWFkaW5nLWxnIGhlYWRpbmctYmFzZSB0cnVuY2F0ZVwiO1xyXG4gIGhlYWRpbmcudGV4dENvbnRlbnQgPSB0aXRsZTtcclxuICBoZWFkZXJJbm5lci5hcHBlbmRDaGlsZChoZWFkaW5nKTtcclxuICBsZXQgc3VidGl0bGVFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuICBpZiAoc3VidGl0bGUpIHtcclxuICAgIGNvbnN0IHN1YiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBzdWIuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQtc21cIjtcclxuICAgIHN1Yi50ZXh0Q29udGVudCA9IHN1YnRpdGxlO1xyXG4gICAgaGVhZGVySW5uZXIuYXBwZW5kQ2hpbGQoc3ViKTtcclxuICAgIHN1YnRpdGxlRWxlbWVudCA9IHN1YjtcclxuICB9XHJcbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJJbm5lcik7XHJcbiAgY29uc3QgaGVhZGVyQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyQWN0aW9ucy5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJBY3Rpb25zKTtcclxuICBpbm5lci5hcHBlbmRDaGlsZChoZWFkZXJXcmFwKTtcclxuXHJcbiAgY29uc3Qgc2VjdGlvbnNXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzZWN0aW9uc1dyYXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1bdmFyKC0tcGFkZGluZy1wYW5lbCldXCI7XHJcbiAgaW5uZXIuYXBwZW5kQ2hpbGQoc2VjdGlvbnNXcmFwKTtcclxuXHJcbiAgcmV0dXJuIHsgb3V0ZXIsIHNlY3Rpb25zV3JhcCwgc3VidGl0bGU6IHN1YnRpdGxlRWxlbWVudCwgaGVhZGVyQWN0aW9ucyB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZWN0aW9uVGl0bGUodGV4dDogc3RyaW5nLCB0cmFpbGluZz86IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZVJvdy5jbGFzc05hbWUgPVxyXG4gICAgXCJmbGV4IGgtdG9vbGJhciBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0yIHB4LTAgcHktMFwiO1xyXG4gIGNvbnN0IHRpdGxlSW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlSW5uZXIuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC0xIGZsZXgtY29sIGdhcC0xXCI7XHJcbiAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdC5jbGFzc05hbWUgPSBcInRleHQtYmFzZSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gIHQudGV4dENvbnRlbnQgPSB0ZXh0O1xyXG4gIHRpdGxlSW5uZXIuYXBwZW5kQ2hpbGQodCk7XHJcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodGl0bGVJbm5lcik7XHJcbiAgaWYgKHRyYWlsaW5nKSB7XHJcbiAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XHJcbiAgICByaWdodC5hcHBlbmRDaGlsZCh0cmFpbGluZyk7XHJcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZChyaWdodCk7XHJcbiAgfVxyXG4gIHJldHVybiB0aXRsZVJvdztcclxufVxyXG5cclxuLyoqXHJcbiAqIENvZGV4J3MgXCJPcGVuIGNvbmZpZy50b21sXCItc3R5bGUgdHJhaWxpbmcgYnV0dG9uOiBnaG9zdCBib3JkZXIsIG11dGVkXHJcbiAqIGxhYmVsLCB0b3AtcmlnaHQgZGlhZ29uYWwgYXJyb3cgaWNvbi4gTWFya3VwIG1pcnJvcnMgQ29uZmlndXJhdGlvbiBwYW5lbC5cclxuICovXHJcbmZ1bmN0aW9uIG9wZW5JblBsYWNlQnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLmNsYXNzTmFtZSA9XHJcbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMSBib3JkZXIgd2hpdGVzcGFjZS1ub3dyYXAgZm9jdXM6b3V0bGluZS1ub25lIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwIHJvdW5kZWQtbGcgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRhdGEtW3N0YXRlPW9wZW5dOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBib3JkZXItdHJhbnNwYXJlbnQgaC10b2tlbi1idXR0b24tY29tcG9zZXIgcHgtMiBweS0wIHRleHQtYmFzZSBsZWFkaW5nLVsxOHB4XVwiO1xyXG4gIGJ0bi5pbm5lckhUTUwgPVxyXG4gICAgYCR7bGFiZWx9YCArXHJcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLTJ4c1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMTQuMzM0OSAxMy4zMzAxVjYuNjA2NDVMNS40NzA2NSAxNS40NzA3QzUuMjEwOTUgMTUuNzMwNCA0Ljc4ODk1IDE1LjczMDQgNC41MjkyNSAxNS40NzA3QzQuMjY5NTUgMTUuMjExIDQuMjY5NTUgMTQuNzg5IDQuNTI5MjUgMTQuNTI5M0wxMy4zOTM1IDUuNjY1MDRINi42NjAxMUM2LjI5Mjg0IDUuNjY1MDQgNS45OTUwNyA1LjM2NzI3IDUuOTk1MDcgNUM1Ljk5NTA3IDQuNjMyNzMgNi4yOTI4NCA0LjMzNDk2IDYuNjYwMTEgNC4zMzQ5NkgxNC45OTk5TDE1LjEzMzcgNC4zNDg2M0MxNS40MzY5IDQuNDEwNTcgMTUuNjY1IDQuNjc4NTcgMTUuNjY1IDVWMTMuMzMwMUMxNS42NjQ5IDEzLjY5NzMgMTUuMzY3MiAxMy45OTUxIDE0Ljk5OTkgMTMuOTk1MUMxNC42MzI3IDEzLjk5NTEgMTQuMzM1IDEzLjY5NzMgMTQuMzM0OSAxMy4zMzAxWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj48L3BhdGg+YCArXHJcbiAgICBgPC9zdmc+YDtcclxuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgb25DbGljaygpO1xyXG4gIH0pO1xyXG4gIHJldHVybiBidG47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXBhY3RCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcclxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBidG4uY2xhc3NOYW1lID1cclxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGlubGluZS1mbGV4IGgtOCBpdGVtcy1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgcHgtMiB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XHJcbiAgYnRuLnRleHRDb250ZW50ID0gbGFiZWw7XHJcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIG9uQ2xpY2soKTtcclxuICB9KTtcclxuICByZXR1cm4gYnRuO1xyXG59XHJcblxyXG5mdW5jdGlvbiByb3VuZGVkQ2FyZCgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY2FyZC5jbGFzc05hbWUgPVxyXG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIGZsZXggZmxleC1jb2wgZGl2aWRlLXktWzAuNXB4XSBkaXZpZGUtdG9rZW4tYm9yZGVyIHJvdW5kZWQtbGcgYm9yZGVyXCI7XHJcbiAgY2FyZC5zZXRBdHRyaWJ1dGUoXHJcbiAgICBcInN0eWxlXCIsXHJcbiAgICBcImJhY2tncm91bmQtY29sb3I6IHZhcigtLWNvbG9yLWJhY2tncm91bmQtcGFuZWwsIHZhcigtLWNvbG9yLXRva2VuLWJnLWZvZykpO1wiLFxyXG4gICk7XHJcbiAgcmV0dXJuIGNhcmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJvd1NpbXBsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcclxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGl0ZW1zLWNlbnRlciBnYXAtM1wiO1xyXG4gIGNvbnN0IHN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xyXG4gIGlmICh0aXRsZSkge1xyXG4gICAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICB0LmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgICB0LnRleHRDb250ZW50ID0gdGl0bGU7XHJcbiAgICBzdGFjay5hcHBlbmRDaGlsZCh0KTtcclxuICB9XHJcbiAgaWYgKGRlc2NyaXB0aW9uKSB7XHJcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGQuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xyXG4gICAgZC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xyXG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZCk7XHJcbiAgfVxyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoc3RhY2spO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG4vKipcclxuICogQ29kZXgtc3R5bGVkIHRvZ2dsZSBzd2l0Y2guIE1hcmt1cCBtaXJyb3JzIHRoZSBHZW5lcmFsID4gUGVybWlzc2lvbnMgcm93XHJcbiAqIHN3aXRjaCB3ZSBjYXB0dXJlZDogb3V0ZXIgYnV0dG9uIChyb2xlPXN3aXRjaCksIGlubmVyIHBpbGwsIHNsaWRpbmcga25vYi5cclxuICovXHJcbmZ1bmN0aW9uIHN3aXRjaENvbnRyb2woXHJcbiAgaW5pdGlhbDogYm9vbGVhbixcclxuICBvbkNoYW5nZTogKG5leHQ6IGJvb2xlYW4pID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LFxyXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJzd2l0Y2hcIik7XHJcblxyXG4gIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBjb25zdCBrbm9iID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAga25vYi5jbGFzc05hbWUgPVxyXG4gICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci1bY29sb3I6dmFyKC0tZ3JheS0wKV0gYmctW2NvbG9yOnZhcigtLWdyYXktMCldIHNoYWRvdy1zbSB0cmFuc2l0aW9uLXRyYW5zZm9ybSBkdXJhdGlvbi0yMDAgZWFzZS1vdXQgaC00IHctNFwiO1xyXG4gIHBpbGwuYXBwZW5kQ2hpbGQoa25vYik7XHJcblxyXG4gIGNvbnN0IGFwcGx5ID0gKG9uOiBib29sZWFuKTogdm9pZCA9PiB7XHJcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1jaGVja2VkXCIsIFN0cmluZyhvbikpO1xyXG4gICAgYnRuLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcclxuICAgIGJ0bi5jbGFzc05hbWUgPVxyXG4gICAgICBcImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciB0ZXh0LXNtIGZvY3VzLXZpc2libGU6b3V0bGluZS1ub25lIGZvY3VzLXZpc2libGU6cmluZy0yIGZvY3VzLXZpc2libGU6cmluZy10b2tlbi1mb2N1cy1ib3JkZXIgZm9jdXMtdmlzaWJsZTpyb3VuZGVkLWZ1bGwgY3Vyc29yLWludGVyYWN0aW9uXCI7XHJcbiAgICBwaWxsLmNsYXNzTmFtZSA9IGByZWxhdGl2ZSBpbmxpbmUtZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgcm91bmRlZC1mdWxsIHRyYW5zaXRpb24tY29sb3JzIGR1cmF0aW9uLTIwMCBlYXNlLW91dCBoLTUgdy04ICR7XHJcbiAgICAgIG9uID8gXCJiZy10b2tlbi1jaGFydHMtYmx1ZVwiIDogXCJiZy10b2tlbi1mb3JlZ3JvdW5kLzIwXCJcclxuICAgIH1gO1xyXG4gICAgcGlsbC5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XHJcbiAgICBrbm9iLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcclxuICAgIGtub2Iuc3R5bGUudHJhbnNmb3JtID0gb24gPyBcInRyYW5zbGF0ZVgoMTRweClcIiA6IFwidHJhbnNsYXRlWCgycHgpXCI7XHJcbiAgfTtcclxuICBhcHBseShpbml0aWFsKTtcclxuXHJcbiAgYnRuLmFwcGVuZENoaWxkKHBpbGwpO1xyXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICBjb25zdCBuZXh0ID0gYnRuLmdldEF0dHJpYnV0ZShcImFyaWEtY2hlY2tlZFwiKSAhPT0gXCJ0cnVlXCI7XHJcbiAgICBhcHBseShuZXh0KTtcclxuICAgIGJ0bi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBvbkNoYW5nZShuZXh0KTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIGJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG4gIH0pO1xyXG4gIHJldHVybiBidG47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRvdCgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIHMuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcclxuICBzLnRleHRDb250ZW50ID0gXCJcdTAwQjdcIjtcclxuICByZXR1cm4gcztcclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGljb25zIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gY29uZmlnSWNvblN2ZygpOiBzdHJpbmcge1xyXG4gIC8vIFNsaWRlcnMgLyBzZXR0aW5ncyBnbHlwaC4gMjB4MjAgY3VycmVudENvbG9yLlxyXG4gIHJldHVybiAoXHJcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcclxuICAgIGA8cGF0aCBkPVwiTTMgNWg5TTE1IDVoMk0zIDEwaDJNOCAxMGg5TTMgMTVoMTFNMTcgMTVoMFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXHJcbiAgICBgPGNpcmNsZSBjeD1cIjEzXCIgY3k9XCI1XCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXHJcbiAgICBgPGNpcmNsZSBjeD1cIjZcIiBjeT1cIjEwXCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXHJcbiAgICBgPGNpcmNsZSBjeD1cIjE1XCIgY3k9XCIxNVwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xyXG4gICAgYDwvc3ZnPmBcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0d2Vha3NJY29uU3ZnKCk6IHN0cmluZyB7XHJcbiAgLy8gU3BhcmtsZXMgLyBcIisrXCIgZ2x5cGggZm9yIHR3ZWFrcy5cclxuICByZXR1cm4gKFxyXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICBgPHBhdGggZD1cIk0xMCAyLjUgTDExLjQgOC42IEwxNy41IDEwIEwxMS40IDExLjQgTDEwIDE3LjUgTDguNiAxMS40IEwyLjUgMTAgTDguNiA4LjYgWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXHJcbiAgICBgPHBhdGggZD1cIk0xNS41IDMgTDE2IDUgTDE4IDUuNSBMMTYgNiBMMTUuNSA4IEwxNSA2IEwxMyA1LjUgTDE1IDUgWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBvcGFjaXR5PVwiMC43XCIvPmAgK1xyXG4gICAgYDwvc3ZnPmBcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZUljb25TdmcoKTogc3RyaW5nIHtcclxuICByZXR1cm4gKFxyXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICBgPHBhdGggZD1cIk00IDguMiA1LjEgNC41QTEuNSAxLjUgMCAwIDEgNi41NSAzLjRoNi45YTEuNSAxLjUgMCAwIDEgMS40NSAxLjFMMTYgOC4yXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICBgPHBhdGggZD1cIk00LjUgOGgxMXY3LjVBMS41IDEuNSAwIDAgMSAxNCAxN0g2YTEuNSAxLjUgMCAwIDEtMS41LTEuNVY4WlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNy41IDh2MWEyLjUgMi41IDAgMCAwIDUgMFY4XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcclxuICAgIGA8L3N2Zz5gXHJcbiAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVmYXVsdFBhZ2VJY29uU3ZnKCk6IHN0cmluZyB7XHJcbiAgLy8gRG9jdW1lbnQvcGFnZSBnbHlwaCBmb3IgdHdlYWstcmVnaXN0ZXJlZCBwYWdlcyB3aXRob3V0IHRoZWlyIG93biBpY29uLlxyXG4gIHJldHVybiAoXHJcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcclxuICAgIGA8cGF0aCBkPVwiTTUgM2g3bDMgM3YxMWExIDEgMCAwIDEtMSAxSDVhMSAxIDAgMCAxLTEtMVY0YTEgMSAwIDAgMSAxLTFaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICBgPHBhdGggZD1cIk0xMiAzdjNhMSAxIDAgMCAwIDEgMWgyXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXHJcbiAgICBgPHBhdGggZD1cIk03IDExaDZNNyAxNGg0XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcclxuICAgIGA8L3N2Zz5gXHJcbiAgKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUljb25VcmwoXHJcbiAgdXJsOiBzdHJpbmcsXHJcbiAgdHdlYWtEaXI6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgaWYgKC9eKGh0dHBzPzp8ZGF0YTopLy50ZXN0KHVybCkpIHJldHVybiB1cmw7XHJcbiAgLy8gUmVsYXRpdmUgcGF0aCBcdTIxOTIgYXNrIG1haW4gdG8gcmVhZCB0aGUgZmlsZSBhbmQgcmV0dXJuIGEgZGF0YTogVVJMLlxyXG4gIC8vIFJlbmRlcmVyIGlzIHNhbmRib3hlZCBzbyBmaWxlOi8vIHdvbid0IGxvYWQgZGlyZWN0bHkuXHJcbiAgY29uc3QgcmVsID0gdXJsLnN0YXJ0c1dpdGgoXCIuL1wiKSA/IHVybC5zbGljZSgyKSA6IHVybDtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXHJcbiAgICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLWFzc2V0XCIsXHJcbiAgICAgIHR3ZWFrRGlyLFxyXG4gICAgICByZWwsXHJcbiAgICApKSBhcyBzdHJpbmc7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgcGxvZyhcImljb24gbG9hZCBmYWlsZWRcIiwgeyB1cmwsIHR3ZWFrRGlyLCBlcnI6IFN0cmluZyhlKSB9KTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIERPTSBoZXVyaXN0aWNzIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XHJcbiAgLy8gQW5jaG9yIHN0cmF0ZWd5IGZpcnN0ICh3b3VsZCBiZSBpZGVhbCBpZiBDb2RleCBzd2l0Y2hlcyB0byA8YT4pLlxyXG4gIGNvbnN0IGxpbmtzID0gQXJyYXkuZnJvbShcclxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEFuY2hvckVsZW1lbnQ+KFwiYVtocmVmKj0nL3NldHRpbmdzLyddXCIpLFxyXG4gICk7XHJcbiAgaWYgKGxpbmtzLmxlbmd0aCA+PSAyKSB7XHJcbiAgICBsZXQgbm9kZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbGlua3NbMF0ucGFyZW50RWxlbWVudDtcclxuICAgIHdoaWxlIChub2RlKSB7XHJcbiAgICAgIGNvbnN0IGluc2lkZSA9IG5vZGUucXVlcnlTZWxlY3RvckFsbChcImFbaHJlZio9Jy9zZXR0aW5ncy8nXVwiKTtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIGluc2lkZS5sZW5ndGggPj0gTWF0aC5tYXgoMiwgbGlua3MubGVuZ3RoIC0gMSkgJiZcclxuICAgICAgICBpc1NldHRpbmdzU2lkZWJhckNhbmRpZGF0ZShub2RlKVxyXG4gICAgICApIHJldHVybiBub2RlO1xyXG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gVGV4dC1jb250ZW50IG1hdGNoIGFnYWluc3QgQ29kZXgncyBrbm93biBzaWRlYmFyIGxhYmVscy5cclxuICBjb25zdCBLTk9XTiA9IFtcclxuICAgIFwiR2VuZXJhbFwiLFxyXG4gICAgXCJBcHBlYXJhbmNlXCIsXHJcbiAgICBcIkNvbmZpZ3VyYXRpb25cIixcclxuICAgIFwiUGVyc29uYWxpemF0aW9uXCIsXHJcbiAgICBcIk1DUCBzZXJ2ZXJzXCIsXHJcbiAgICBcIk1DUCBTZXJ2ZXJzXCIsXHJcbiAgICBcIkdpdFwiLFxyXG4gICAgXCJFbnZpcm9ubWVudHNcIixcclxuICBdO1xyXG4gIGNvbnN0IG1hdGNoZXM6IEhUTUxFbGVtZW50W10gPSBbXTtcclxuICBjb25zdCBhbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcclxuICAgIFwiYnV0dG9uLCBhLCBbcm9sZT0nYnV0dG9uJ10sIGxpLCBkaXZcIixcclxuICApO1xyXG4gIGZvciAoY29uc3QgZWwgb2YgQXJyYXkuZnJvbShhbGwpKSB7XHJcbiAgICBpZiAoaXNGb3JiaWRkZW5TZXR0aW5nc1NpZGViYXJTdXJmYWNlKGVsKSkgY29udGludWU7XHJcbiAgICBjb25zdCB0ID0gKGVsLnRleHRDb250ZW50ID8/IFwiXCIpLnRyaW0oKTtcclxuICAgIGlmICh0Lmxlbmd0aCA+IDMwKSBjb250aW51ZTtcclxuICAgIGlmIChLTk9XTi5zb21lKChrKSA9PiB0ID09PSBrKSkgbWF0Y2hlcy5wdXNoKGVsKTtcclxuICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDUwKSBicmVhaztcclxuICB9XHJcbiAgaWYgKG1hdGNoZXMubGVuZ3RoID49IDIpIHtcclxuICAgIGxldCBub2RlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBtYXRjaGVzWzBdLnBhcmVudEVsZW1lbnQ7XHJcbiAgICB3aGlsZSAobm9kZSkge1xyXG4gICAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgICBmb3IgKGNvbnN0IG0gb2YgbWF0Y2hlcykgaWYgKG5vZGUuY29udGFpbnMobSkpIGNvdW50Kys7XHJcbiAgICAgIGlmIChjb3VudCA+PSBNYXRoLm1pbigzLCBtYXRjaGVzLmxlbmd0aCkgJiYgaXNTZXR0aW5nc1NpZGViYXJDYW5kaWRhdGUobm9kZSkpIHJldHVybiBub2RlO1xyXG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuY29uc3QgRk9SQklEREVOX1NFVFRJTkdTX1NJREVCQVJfU0VMRUNUT1IgPSBbXHJcbiAgXCJbZGF0YS1jb21wb3Nlci1vdmVybGF5LWZsb2F0aW5nLXVpPSd0cnVlJ11cIixcclxuICBcIltkYXRhLWNvZGV4cHAtc2xhc2gtbWVudT0ndHJ1ZSddXCIsXHJcbiAgXCJbZGF0YS1jb2RleHBwLW92ZXJsYXktbm9pc2U9J3RydWUnXVwiLFxyXG4gIFwiLmNvbXBvc2VyLWhvbWUtdG9wLW1lbnVcIixcclxuICBcIi52ZXJ0aWNhbC1zY3JvbGwtZmFkZS1tYXNrXCIsXHJcbiAgXCJbY2xhc3MqPSdbY29udGFpbmVyLW5hbWU6aG9tZS1tYWluLWNvbnRlbnRdJ11cIixcclxuXS5qb2luKFwiLFwiKTtcclxuXHJcbmZ1bmN0aW9uIGlzRm9yYmlkZGVuU2V0dGluZ3NTaWRlYmFyU3VyZmFjZShub2RlOiBFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xyXG4gIGlmICghbm9kZSkgcmV0dXJuIGZhbHNlO1xyXG4gIGNvbnN0IGVsID0gbm9kZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ID8gbm9kZSA6IG5vZGUucGFyZW50RWxlbWVudDtcclxuICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKGVsLmNsb3Nlc3QoRk9SQklEREVOX1NFVFRJTkdTX1NJREVCQVJfU0VMRUNUT1IpKSByZXR1cm4gdHJ1ZTtcclxuICBpZiAoZWwucXVlcnlTZWxlY3RvcihcIltkYXRhLWxpc3QtbmF2aWdhdGlvbi1pdGVtPSd0cnVlJ10sIFtjbWRrLWl0ZW1dXCIpKSByZXR1cm4gdHJ1ZTtcclxuICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzU2V0dGluZ3NTaWRlYmFyQ2FuZGlkYXRlKG5vZGU6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XHJcbiAgaWYgKGlzRm9yYmlkZGVuU2V0dGluZ3NTaWRlYmFyU3VyZmFjZShub2RlKSkgcmV0dXJuIGZhbHNlO1xyXG4gIGNvbnN0IHJvb3QgPSBub2RlLnBhcmVudEVsZW1lbnQgPz8gbm9kZTtcclxuICBpZiAoaXNGb3JiaWRkZW5TZXR0aW5nc1NpZGViYXJTdXJmYWNlKHJvb3QpKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKHJvb3QucXVlcnlTZWxlY3RvcihcImFbaHJlZio9Jy9zZXR0aW5ncy8nXVwiKSkgcmV0dXJuIHRydWU7XHJcbiAgY29uc3QgdGV4dCA9IGNvbXBhY3RTZXR0aW5nc1RleHQocm9vdC50ZXh0Q29udGVudCA/PyBcIlwiKTtcclxuICByZXR1cm4gKFxyXG4gICAgdGV4dC5pbmNsdWRlcyhcIkJhY2sgdG8gYXBwXCIpICYmXHJcbiAgICB0ZXh0LmluY2x1ZGVzKFwiR2VuZXJhbFwiKSAmJlxyXG4gICAgdGV4dC5pbmNsdWRlcyhcIkFwcGVhcmFuY2VcIilcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW1vdmVNaXNwbGFjZWRTZXR0aW5nc0dyb3VwcygpOiB2b2lkIHtcclxuICBjb25zdCBncm91cHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcclxuICAgIFwiW2RhdGEtY29kZXhwcD0nbmF2LWdyb3VwJ10sIFtkYXRhLWNvZGV4cHA9J3BhZ2VzLWdyb3VwJ10sIFtkYXRhLWNvZGV4cHA9J25hdGl2ZS1uYXYtaGVhZGVyJ11cIixcclxuICApO1xyXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgQXJyYXkuZnJvbShncm91cHMpKSB7XHJcbiAgICBpZiAoIWlzRm9yYmlkZGVuU2V0dGluZ3NTaWRlYmFyU3VyZmFjZShncm91cCkpIGNvbnRpbnVlO1xyXG4gICAgaWYgKHN0YXRlLm5hdkdyb3VwID09PSBncm91cCkgc3RhdGUubmF2R3JvdXAgPSBudWxsO1xyXG4gICAgaWYgKHN0YXRlLnBhZ2VzR3JvdXAgPT09IGdyb3VwKSB7XHJcbiAgICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xyXG4gICAgICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gbnVsbDtcclxuICAgIH1cclxuICAgIGlmIChzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPT09IGdyb3VwKSBzdGF0ZS5uYXRpdmVOYXZIZWFkZXIgPSBudWxsO1xyXG4gICAgZ3JvdXAucmVtb3ZlKCk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kQ29udGVudEFyZWEoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcclxuICBjb25zdCBzaWRlYmFyID0gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk7XHJcbiAgaWYgKCFzaWRlYmFyKSByZXR1cm4gbnVsbDtcclxuICBsZXQgcGFyZW50ID0gc2lkZWJhci5wYXJlbnRFbGVtZW50O1xyXG4gIHdoaWxlIChwYXJlbnQpIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShwYXJlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgICAgaWYgKGNoaWxkID09PSBzaWRlYmFyIHx8IGNoaWxkLmNvbnRhaW5zKHNpZGViYXIpKSBjb250aW51ZTtcclxuICAgICAgY29uc3QgciA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICBpZiAoci53aWR0aCA+IDMwMCAmJiByLmhlaWdodCA+IDIwMCkgcmV0dXJuIGNoaWxkO1xyXG4gICAgfVxyXG4gICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgfVxyXG4gIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtYXliZUR1bXBEb20oKTogdm9pZCB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcclxuICAgIGlmIChzaWRlYmFyICYmICFzdGF0ZS5zaWRlYmFyRHVtcGVkKSB7XHJcbiAgICAgIHN0YXRlLnNpZGViYXJEdW1wZWQgPSB0cnVlO1xyXG4gICAgICBjb25zdCBzYlJvb3QgPSBzaWRlYmFyLnBhcmVudEVsZW1lbnQgPz8gc2lkZWJhcjtcclxuICAgICAgcGxvZyhgY29kZXggc2lkZWJhciBIVE1MYCwgc2JSb290Lm91dGVySFRNTC5zbGljZSgwLCAzMjAwMCkpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xyXG4gICAgaWYgKCFjb250ZW50KSB7XHJcbiAgICAgIGlmIChzdGF0ZS5maW5nZXJwcmludCAhPT0gbG9jYXRpb24uaHJlZikge1xyXG4gICAgICAgIHN0YXRlLmZpbmdlcnByaW50ID0gbG9jYXRpb24uaHJlZjtcclxuICAgICAgICBwbG9nKFwiZG9tIHByb2JlIChubyBjb250ZW50KVwiLCB7XHJcbiAgICAgICAgICB1cmw6IGxvY2F0aW9uLmhyZWYsXHJcbiAgICAgICAgICBzaWRlYmFyOiBzaWRlYmFyID8gZGVzY3JpYmUoc2lkZWJhcikgOiBudWxsLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGxldCBwYW5lbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XHJcbiAgICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoY2hpbGQuc3R5bGUuZGlzcGxheSA9PT0gXCJub25lXCIpIGNvbnRpbnVlO1xyXG4gICAgICBwYW5lbCA9IGNoaWxkO1xyXG4gICAgICBicmVhaztcclxuICAgIH1cclxuICAgIGNvbnN0IGFjdGl2ZU5hdiA9IHNpZGViYXJcclxuICAgICAgPyBBcnJheS5mcm9tKHNpZGViYXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJidXR0b24sIGFcIikpLmZpbmQoXHJcbiAgICAgICAgICAoYikgPT5cclxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiIHx8XHJcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiZGF0YS1hY3RpdmVcIikgPT09IFwidHJ1ZVwiIHx8XHJcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiYXJpYS1zZWxlY3RlZFwiKSA9PT0gXCJ0cnVlXCIgfHxcclxuICAgICAgICAgICAgYi5jbGFzc0xpc3QuY29udGFpbnMoXCJhY3RpdmVcIiksXHJcbiAgICAgICAgKVxyXG4gICAgICA6IG51bGw7XHJcbiAgICBjb25zdCBoZWFkaW5nID0gcGFuZWw/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxyXG4gICAgICBcImgxLCBoMiwgaDMsIFtjbGFzcyo9J2hlYWRpbmcnXVwiLFxyXG4gICAgKTtcclxuICAgIGNvbnN0IGZpbmdlcnByaW50ID0gYCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudCA/PyBcIlwifXwke2hlYWRpbmc/LnRleHRDb250ZW50ID8/IFwiXCJ9fCR7cGFuZWw/LmNoaWxkcmVuLmxlbmd0aCA/PyAwfWA7XHJcbiAgICBpZiAoc3RhdGUuZmluZ2VycHJpbnQgPT09IGZpbmdlcnByaW50KSByZXR1cm47XHJcbiAgICBzdGF0ZS5maW5nZXJwcmludCA9IGZpbmdlcnByaW50O1xyXG4gICAgcGxvZyhcImRvbSBwcm9iZVwiLCB7XHJcbiAgICAgIHVybDogbG9jYXRpb24uaHJlZixcclxuICAgICAgYWN0aXZlTmF2OiBhY3RpdmVOYXY/LnRleHRDb250ZW50Py50cmltKCkgPz8gbnVsbCxcclxuICAgICAgaGVhZGluZzogaGVhZGluZz8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxyXG4gICAgICBjb250ZW50OiBkZXNjcmliZShjb250ZW50KSxcclxuICAgIH0pO1xyXG4gICAgaWYgKHBhbmVsKSB7XHJcbiAgICAgIGNvbnN0IGh0bWwgPSBwYW5lbC5vdXRlckhUTUw7XHJcbiAgICAgIHBsb2coXHJcbiAgICAgICAgYGNvZGV4IHBhbmVsIEhUTUwgKCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IFwiP1wifSlgLFxyXG4gICAgICAgIGh0bWwuc2xpY2UoMCwgMzIwMDApLFxyXG4gICAgICApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIHBsb2coXCJkb20gcHJvYmUgZmFpbGVkXCIsIFN0cmluZyhlKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkZXNjcmliZShlbDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogZWwudGFnTmFtZSxcclxuICAgIGNsczogZWwuY2xhc3NOYW1lLnNsaWNlKDAsIDEyMCksXHJcbiAgICBpZDogZWwuaWQgfHwgdW5kZWZpbmVkLFxyXG4gICAgY2hpbGRyZW46IGVsLmNoaWxkcmVuLmxlbmd0aCxcclxuICAgIHJlY3Q6ICgoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgcmV0dXJuIHsgdzogTWF0aC5yb3VuZChyLndpZHRoKSwgaDogTWF0aC5yb3VuZChyLmhlaWdodCkgfTtcclxuICAgIH0pKCksXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtzUGF0aCgpOiBzdHJpbmcge1xyXG4gIHJldHVybiAoXHJcbiAgICAod2luZG93IGFzIHVua25vd24gYXMgeyBfX2NvZGV4cHBfdHdlYWtzX2Rpcl9fPzogc3RyaW5nIH0pLl9fY29kZXhwcF90d2Vha3NfZGlyX18gPz9cclxuICAgIFwiPHVzZXIgZGlyPi90d2Vha3NcIlxyXG4gICk7XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgVHdlYWtNYW5pZmVzdCB9IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9UV0VBS19TVE9SRV9JTkRFWF9VUkwgPVxyXG4gIFwiaHR0cHM6Ly9iLW5uZXR0LmdpdGh1Yi5pby9jb2RleC1wbHVzcGx1cy9zdG9yZS9pbmRleC5qc29uXCI7XHJcbmV4cG9ydCBjb25zdCBUV0VBS19TVE9SRV9SRVZJRVdfSVNTVUVfVVJMID1cclxuICBcImh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXdcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHdlYWtTdG9yZVJlZ2lzdHJ5IHtcclxuICBzY2hlbWFWZXJzaW9uOiAxO1xyXG4gIGdlbmVyYXRlZEF0Pzogc3RyaW5nO1xyXG4gIGVudHJpZXM6IFR3ZWFrU3RvcmVFbnRyeVtdO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFR3ZWFrU3RvcmVFbnRyeSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICByZXBvOiBzdHJpbmc7XHJcbiAgYXBwcm92ZWRDb21taXRTaGE6IHN0cmluZztcclxuICBhcHByb3ZlZEF0OiBzdHJpbmc7XHJcbiAgYXBwcm92ZWRCeTogc3RyaW5nO1xyXG4gIHBsYXRmb3Jtcz86IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdO1xyXG4gIHJlbGVhc2VVcmw/OiBzdHJpbmc7XHJcbiAgcmV2aWV3VXJsPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgdHlwZSBUd2Vha1N0b3JlUGxhdGZvcm0gPSBcImRhcndpblwiIHwgXCJ3aW4zMlwiIHwgXCJsaW51eFwiO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUd2Vha1N0b3JlUHVibGlzaFN1Ym1pc3Npb24ge1xyXG4gIHJlcG86IHN0cmluZztcclxuICBkZWZhdWx0QnJhbmNoOiBzdHJpbmc7XHJcbiAgY29tbWl0U2hhOiBzdHJpbmc7XHJcbiAgY29tbWl0VXJsOiBzdHJpbmc7XHJcbiAgbWFuaWZlc3Q/OiB7XHJcbiAgICBpZD86IHN0cmluZztcclxuICAgIG5hbWU/OiBzdHJpbmc7XHJcbiAgICB2ZXJzaW9uPzogc3RyaW5nO1xyXG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XHJcbiAgICBpY29uVXJsPzogc3RyaW5nO1xyXG4gIH07XHJcbn1cclxuXHJcbmNvbnN0IEdJVEhVQl9SRVBPX1JFID0gL15bQS1aYS16MC05Xy4tXStcXC9bQS1aYS16MC05Xy4tXSskLztcclxuY29uc3QgRlVMTF9TSEFfUkUgPSAvXlthLWYwLTldezQwfSQvaTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVHaXRIdWJSZXBvKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IHJhdyA9IGlucHV0LnRyaW0oKTtcclxuICBpZiAoIXJhdykgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIHJlcG8gaXMgcmVxdWlyZWRcIik7XHJcblxyXG4gIGNvbnN0IHNzaCA9IC9eZ2l0QGdpdGh1YlxcLmNvbTooW14vXStcXC9bXi9dKz8pKD86XFwuZ2l0KT8kL2kuZXhlYyhyYXcpO1xyXG4gIGlmIChzc2gpIHJldHVybiBub3JtYWxpemVSZXBvUGFydChzc2hbMV0pO1xyXG5cclxuICBpZiAoL15odHRwcz86XFwvXFwvL2kudGVzdChyYXcpKSB7XHJcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJhdyk7XHJcbiAgICBpZiAodXJsLmhvc3RuYW1lICE9PSBcImdpdGh1Yi5jb21cIikgdGhyb3cgbmV3IEVycm9yKFwiT25seSBnaXRodWIuY29tIHJlcG9zaXRvcmllcyBhcmUgc3VwcG9ydGVkXCIpO1xyXG4gICAgY29uc3QgcGFydHMgPSB1cmwucGF0aG5hbWUucmVwbGFjZSgvXlxcLyt8XFwvKyQvZywgXCJcIikuc3BsaXQoXCIvXCIpO1xyXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA8IDIpIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiByZXBvIFVSTCBtdXN0IGluY2x1ZGUgb3duZXIgYW5kIHJlcG9zaXRvcnlcIik7XHJcbiAgICByZXR1cm4gbm9ybWFsaXplUmVwb1BhcnQoYCR7cGFydHNbMF19LyR7cGFydHNbMV19YCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gbm9ybWFsaXplUmVwb1BhcnQocmF3KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVN0b3JlUmVnaXN0cnkoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlUmVnaXN0cnkge1xyXG4gIGNvbnN0IHJlZ2lzdHJ5ID0gaW5wdXQgYXMgUGFydGlhbDxUd2Vha1N0b3JlUmVnaXN0cnk+IHwgbnVsbDtcclxuICBpZiAoIXJlZ2lzdHJ5IHx8IHJlZ2lzdHJ5LnNjaGVtYVZlcnNpb24gIT09IDEgfHwgIUFycmF5LmlzQXJyYXkocmVnaXN0cnkuZW50cmllcykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlVuc3VwcG9ydGVkIHR3ZWFrIHN0b3JlIHJlZ2lzdHJ5XCIpO1xyXG4gIH1cclxuICBjb25zdCBlbnRyaWVzID0gcmVnaXN0cnkuZW50cmllcy5tYXAobm9ybWFsaXplU3RvcmVFbnRyeSk7XHJcbiAgZW50cmllcy5zb3J0KChhLCBiKSA9PiBhLm1hbmlmZXN0Lm5hbWUubG9jYWxlQ29tcGFyZShiLm1hbmlmZXN0Lm5hbWUpKTtcclxuICByZXR1cm4ge1xyXG4gICAgc2NoZW1hVmVyc2lvbjogMSxcclxuICAgIGdlbmVyYXRlZEF0OiB0eXBlb2YgcmVnaXN0cnkuZ2VuZXJhdGVkQXQgPT09IFwic3RyaW5nXCIgPyByZWdpc3RyeS5nZW5lcmF0ZWRBdCA6IHVuZGVmaW5lZCxcclxuICAgIGVudHJpZXMsXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNodWZmbGVTdG9yZUVudHJpZXM8VD4oXHJcbiAgZW50cmllczogcmVhZG9ubHkgVFtdLFxyXG4gIHJhbmRvbUluZGV4OiAoZXhjbHVzaXZlTWF4OiBudW1iZXIpID0+IG51bWJlciA9IChleGNsdXNpdmVNYXgpID0+IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGV4Y2x1c2l2ZU1heCksXHJcbik6IFRbXSB7XHJcbiAgY29uc3Qgc2h1ZmZsZWQgPSBbLi4uZW50cmllc107XHJcbiAgZm9yIChsZXQgaSA9IHNodWZmbGVkLmxlbmd0aCAtIDE7IGkgPiAwOyBpIC09IDEpIHtcclxuICAgIGNvbnN0IGogPSByYW5kb21JbmRleChpICsgMSk7XHJcbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoaikgfHwgaiA8IDAgfHwgaiA+IGkpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBzaHVmZmxlIHJhbmRvbUluZGV4IHJldHVybmVkICR7an07IGV4cGVjdGVkIGFuIGludGVnZXIgZnJvbSAwIHRvICR7aX1gKTtcclxuICAgIH1cclxuICAgIFtzaHVmZmxlZFtpXSwgc2h1ZmZsZWRbal1dID0gW3NodWZmbGVkW2pdLCBzaHVmZmxlZFtpXV07XHJcbiAgfVxyXG4gIHJldHVybiBzaHVmZmxlZDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVN0b3JlRW50cnkoaW5wdXQ6IHVua25vd24pOiBUd2Vha1N0b3JlRW50cnkge1xyXG4gIGNvbnN0IGVudHJ5ID0gaW5wdXQgYXMgUGFydGlhbDxUd2Vha1N0b3JlRW50cnk+IHwgbnVsbDtcclxuICBpZiAoIWVudHJ5IHx8IHR5cGVvZiBlbnRyeSAhPT0gXCJvYmplY3RcIikgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB0d2VhayBzdG9yZSBlbnRyeVwiKTtcclxuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhTdHJpbmcoZW50cnkucmVwbyA/PyBlbnRyeS5tYW5pZmVzdD8uZ2l0aHViUmVwbyA/PyBcIlwiKSk7XHJcbiAgY29uc3QgbWFuaWZlc3QgPSBlbnRyeS5tYW5pZmVzdCBhcyBUd2Vha01hbmlmZXN0IHwgdW5kZWZpbmVkO1xyXG4gIGlmICghbWFuaWZlc3Q/LmlkIHx8ICFtYW5pZmVzdC5uYW1lIHx8ICFtYW5pZmVzdC52ZXJzaW9uKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5IGZvciAke3JlcG99IGlzIG1pc3NpbmcgbWFuaWZlc3QgZmllbGRzYCk7XHJcbiAgfVxyXG4gIGlmIChub3JtYWxpemVHaXRIdWJSZXBvKG1hbmlmZXN0LmdpdGh1YlJlcG8pICE9PSByZXBvKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IHJlcG8gZG9lcyBub3QgbWF0Y2ggbWFuaWZlc3QgZ2l0aHViUmVwb2ApO1xyXG4gIH1cclxuICBpZiAoIWlzRnVsbENvbW1pdFNoYShTdHJpbmcoZW50cnkuYXBwcm92ZWRDb21taXRTaGEgPz8gXCJcIikpKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFN0b3JlIGVudHJ5ICR7bWFuaWZlc3QuaWR9IG11c3QgcGluIGEgZnVsbCBhcHByb3ZlZCBjb21taXQgU0hBYCk7XHJcbiAgfVxyXG4gIHJldHVybiB7XHJcbiAgICBpZDogbWFuaWZlc3QuaWQsXHJcbiAgICBtYW5pZmVzdCxcclxuICAgIHJlcG8sXHJcbiAgICBhcHByb3ZlZENvbW1pdFNoYTogU3RyaW5nKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhKSxcclxuICAgIGFwcHJvdmVkQXQ6IHR5cGVvZiBlbnRyeS5hcHByb3ZlZEF0ID09PSBcInN0cmluZ1wiID8gZW50cnkuYXBwcm92ZWRBdCA6IFwiXCIsXHJcbiAgICBhcHByb3ZlZEJ5OiB0eXBlb2YgZW50cnkuYXBwcm92ZWRCeSA9PT0gXCJzdHJpbmdcIiA/IGVudHJ5LmFwcHJvdmVkQnkgOiBcIlwiLFxyXG4gICAgcGxhdGZvcm1zOiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcygoZW50cnkgYXMgeyBwbGF0Zm9ybXM/OiB1bmtub3duIH0pLnBsYXRmb3JtcyksXHJcbiAgICByZWxlYXNlVXJsOiBvcHRpb25hbEdpdGh1YlVybChlbnRyeS5yZWxlYXNlVXJsKSxcclxuICAgIHJldmlld1VybDogb3B0aW9uYWxHaXRodWJVcmwoZW50cnkucmV2aWV3VXJsKSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RvcmVBcmNoaXZlVXJsKGVudHJ5OiBUd2Vha1N0b3JlRW50cnkpOiBzdHJpbmcge1xyXG4gIGlmICghaXNGdWxsQ29tbWl0U2hhKGVudHJ5LmFwcHJvdmVkQ29tbWl0U2hhKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBTdG9yZSBlbnRyeSAke2VudHJ5LmlkfSBpcyBub3QgcGlubmVkIHRvIGEgZnVsbCBjb21taXQgU0hBYCk7XHJcbiAgfVxyXG4gIHJldHVybiBgaHR0cHM6Ly9jb2RlbG9hZC5naXRodWIuY29tLyR7ZW50cnkucmVwb30vdGFyLmd6LyR7ZW50cnkuYXBwcm92ZWRDb21taXRTaGF9YDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkVHdlYWtQdWJsaXNoSXNzdWVVcmwoc3VibWlzc2lvbjogVHdlYWtTdG9yZVB1Ymxpc2hTdWJtaXNzaW9uKTogc3RyaW5nIHtcclxuICBjb25zdCByZXBvID0gbm9ybWFsaXplR2l0SHViUmVwbyhzdWJtaXNzaW9uLnJlcG8pO1xyXG4gIGlmICghaXNGdWxsQ29tbWl0U2hhKHN1Ym1pc3Npb24uY29tbWl0U2hhKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiU3VibWlzc2lvbiBtdXN0IGluY2x1ZGUgdGhlIGZ1bGwgY29tbWl0IFNIQSB0byByZXZpZXdcIik7XHJcbiAgfVxyXG4gIGNvbnN0IHRpdGxlID0gYFR3ZWFrIHN0b3JlIHJldmlldzogJHtyZXBvfWA7XHJcbiAgY29uc3QgYm9keSA9IFtcclxuICAgIFwiIyMgVHdlYWsgcmVwb1wiLFxyXG4gICAgYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3JlcG99YCxcclxuICAgIFwiXCIsXHJcbiAgICBcIiMjIENvbW1pdCB0byByZXZpZXdcIixcclxuICAgIHN1Ym1pc3Npb24uY29tbWl0U2hhLFxyXG4gICAgc3VibWlzc2lvbi5jb21taXRVcmwsXHJcbiAgICBcIlwiLFxyXG4gICAgXCJEbyBub3QgYXBwcm92ZSBhIGRpZmZlcmVudCBjb21taXQuIElmIHRoZSBhdXRob3IgcHVzaGVzIGNoYW5nZXMsIGFzayB0aGVtIHRvIHJlc3VibWl0LlwiLFxyXG4gICAgXCJcIixcclxuICAgIFwiIyMgTWFuaWZlc3RcIixcclxuICAgIGAtIGlkOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/LmlkID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxyXG4gICAgYC0gbmFtZTogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py5uYW1lID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxyXG4gICAgYC0gdmVyc2lvbjogJHtzdWJtaXNzaW9uLm1hbmlmZXN0Py52ZXJzaW9uID8/IFwiKG5vdCBkZXRlY3RlZClcIn1gLFxyXG4gICAgYC0gZGVzY3JpcHRpb246ICR7c3VibWlzc2lvbi5tYW5pZmVzdD8uZGVzY3JpcHRpb24gPz8gXCIobm90IGRldGVjdGVkKVwifWAsXHJcbiAgICBgLSBpY29uVXJsOiAke3N1Ym1pc3Npb24ubWFuaWZlc3Q/Lmljb25VcmwgPz8gXCIobm90IGRldGVjdGVkKVwifWAsXHJcbiAgICBcIlwiLFxyXG4gICAgXCIjIyBBZG1pbiBjaGVja2xpc3RcIixcclxuICAgIFwiLSBbIF0gbWFuaWZlc3QuanNvbiBpcyB2YWxpZFwiLFxyXG4gICAgXCItIFsgXSBtYW5pZmVzdC5pY29uVXJsIGlzIHVzYWJsZSBhcyB0aGUgc3RvcmUgaWNvblwiLFxyXG4gICAgXCItIFsgXSBzb3VyY2Ugd2FzIHJldmlld2VkIGF0IHRoZSBleGFjdCBjb21taXQgYWJvdmVcIixcclxuICAgIFwiLSBbIF0gYHN0b3JlL2luZGV4Lmpzb25gIGVudHJ5IHBpbnMgYGFwcHJvdmVkQ29tbWl0U2hhYCB0byB0aGUgZXhhY3QgY29tbWl0IGFib3ZlXCIsXHJcbiAgXS5qb2luKFwiXFxuXCIpO1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoVFdFQUtfU1RPUkVfUkVWSUVXX0lTU1VFX1VSTCk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJ0ZW1wbGF0ZVwiLCBcInR3ZWFrLXN0b3JlLXJldmlldy5tZFwiKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcInRpdGxlXCIsIHRpdGxlKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLnNldChcImJvZHlcIiwgYm9keSk7XHJcbiAgcmV0dXJuIHVybC50b1N0cmluZygpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNGdWxsQ29tbWl0U2hhKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICByZXR1cm4gRlVMTF9TSEFfUkUudGVzdCh2YWx1ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZVJlcG9QYXJ0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IHJlcG8gPSB2YWx1ZS50cmltKCkucmVwbGFjZSgvXFwuZ2l0JC9pLCBcIlwiKS5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCBcIlwiKTtcclxuICBpZiAoIUdJVEhVQl9SRVBPX1JFLnRlc3QocmVwbykpIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiByZXBvIG11c3QgYmUgaW4gb3duZXIvcmVwbyBmb3JtXCIpO1xyXG4gIHJldHVybiByZXBvO1xyXG59XHJcblxyXG5mdW5jdGlvbiBub3JtYWxpemVTdG9yZVBsYXRmb3JtcyhpbnB1dDogdW5rbm93bik6IFR3ZWFrU3RvcmVQbGF0Zm9ybVtdIHwgdW5kZWZpbmVkIHtcclxuICBpZiAoaW5wdXQgPT09IHVuZGVmaW5lZCkgcmV0dXJuIHVuZGVmaW5lZDtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkoaW5wdXQpKSB0aHJvdyBuZXcgRXJyb3IoXCJTdG9yZSBlbnRyeSBwbGF0Zm9ybXMgbXVzdCBiZSBhbiBhcnJheVwiKTtcclxuICBjb25zdCBhbGxvd2VkID0gbmV3IFNldDxUd2Vha1N0b3JlUGxhdGZvcm0+KFtcImRhcndpblwiLCBcIndpbjMyXCIsIFwibGludXhcIl0pO1xyXG4gIGNvbnN0IHBsYXRmb3JtcyA9IEFycmF5LmZyb20obmV3IFNldChpbnB1dC5tYXAoKHZhbHVlKSA9PiB7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8ICFhbGxvd2VkLmhhcyh2YWx1ZSBhcyBUd2Vha1N0b3JlUGxhdGZvcm0pKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgc3RvcmUgcGxhdGZvcm06ICR7U3RyaW5nKHZhbHVlKX1gKTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWx1ZSBhcyBUd2Vha1N0b3JlUGxhdGZvcm07XHJcbiAgfSkpKTtcclxuICByZXR1cm4gcGxhdGZvcm1zLmxlbmd0aCA+IDAgPyBwbGF0Zm9ybXMgOiB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9wdGlvbmFsR2l0aHViVXJsKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8ICF2YWx1ZS50cmltKCkpIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7XHJcbiAgaWYgKHVybC5wcm90b2NvbCAhPT0gXCJodHRwczpcIiB8fCB1cmwuaG9zdG5hbWUgIT09IFwiZ2l0aHViLmNvbVwiKSByZXR1cm4gdW5kZWZpbmVkO1xyXG4gIHJldHVybiB1cmwudG9TdHJpbmcoKTtcclxufVxyXG4iLCAiLyoqXHJcbiAqIFJlbmRlcmVyLXNpZGUgdHdlYWsgaG9zdC4gV2U6XHJcbiAqICAgMS4gQXNrIG1haW4gZm9yIHRoZSB0d2VhayBsaXN0ICh3aXRoIHJlc29sdmVkIGVudHJ5IHBhdGgpLlxyXG4gKiAgIDIuIEZvciBlYWNoIHJlbmRlcmVyLXNjb3BlZCAob3IgXCJib3RoXCIpIHR3ZWFrLCBmZXRjaCBpdHMgc291cmNlIHZpYSBJUENcclxuICogICAgICBhbmQgZXhlY3V0ZSBpdCBhcyBhIENvbW1vbkpTLXNoYXBlZCBmdW5jdGlvbi5cclxuICogICAzLiBQcm92aWRlIGl0IHRoZSByZW5kZXJlciBoYWxmIG9mIHRoZSBBUEkuXHJcbiAqXHJcbiAqIENvZGV4IHJ1bnMgdGhlIHJlbmRlcmVyIHdpdGggc2FuZGJveDogdHJ1ZSwgc28gTm9kZSdzIGByZXF1aXJlKClgIGlzXHJcbiAqIHJlc3RyaWN0ZWQgdG8gYSB0aW55IHdoaXRlbGlzdCAoZWxlY3Ryb24gKyBhIGZldyBwb2x5ZmlsbHMpLiBUaGF0IG1lYW5zIHdlXHJcbiAqIGNhbm5vdCBgcmVxdWlyZSgpYCBhcmJpdHJhcnkgdHdlYWsgZmlsZXMgZnJvbSBkaXNrLiBJbnN0ZWFkIHdlIHB1bGwgdGhlXHJcbiAqIHNvdXJjZSBzdHJpbmcgZnJvbSBtYWluIGFuZCBldmFsdWF0ZSBpdCB3aXRoIGBuZXcgRnVuY3Rpb25gIGluc2lkZSB0aGVcclxuICogcHJlbG9hZCBjb250ZXh0LiBUd2VhayBhdXRob3JzIHdobyBuZWVkIG5wbSBkZXBzIG11c3QgYnVuZGxlIHRoZW0gaW4uXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcclxuaW1wb3J0IHsgcmVnaXN0ZXJTZWN0aW9uLCByZWdpc3RlclBhZ2UsIGNsZWFyU2VjdGlvbnMsIHNldExpc3RlZFR3ZWFrcyB9IGZyb20gXCIuL3NldHRpbmdzLWluamVjdG9yXCI7XHJcbmltcG9ydCB7IGZpYmVyRm9yTm9kZSB9IGZyb20gXCIuL3JlYWN0LWhvb2tcIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIFR3ZWFrTWFuaWZlc3QsXHJcbiAgVHdlYWtBcGksXHJcbiAgUmVhY3RGaWJlck5vZGUsXHJcbiAgVHdlYWssXHJcbn0gZnJvbSBcIkBjb2RleC1wbHVzcGx1cy9zZGtcIjtcclxuXHJcbmludGVyZmFjZSBMaXN0ZWRUd2VhayB7XHJcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XHJcbiAgZW50cnk6IHN0cmluZztcclxuICBkaXI6IHN0cmluZztcclxuICBlbnRyeUV4aXN0czogYm9vbGVhbjtcclxuICBlbmFibGVkOiBib29sZWFuO1xyXG4gIHVwZGF0ZToge1xyXG4gICAgY2hlY2tlZEF0OiBzdHJpbmc7XHJcbiAgICByZXBvOiBzdHJpbmc7XHJcbiAgICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gICAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcclxuICAgIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcclxuICAgIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XHJcbiAgICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XHJcbiAgICBlcnJvcj86IHN0cmluZztcclxuICB9IHwgbnVsbDtcclxufVxyXG5cclxuaW50ZXJmYWNlIFVzZXJQYXRocyB7XHJcbiAgdXNlclJvb3Q6IHN0cmluZztcclxuICBydW50aW1lRGlyOiBzdHJpbmc7XHJcbiAgdHdlYWtzRGlyOiBzdHJpbmc7XHJcbiAgbG9nRGlyOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNvbnN0IGxvYWRlZCA9IG5ldyBNYXA8c3RyaW5nLCB7IHN0b3A/OiAoKSA9PiB2b2lkIH0+KCk7XHJcbmxldCBjYWNoZWRQYXRoczogVXNlclBhdGhzIHwgbnVsbCA9IG51bGw7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRUd2Vha0hvc3QoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgdHdlYWtzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIikpIGFzIExpc3RlZFR3ZWFrW107XHJcbiAgY29uc3QgcGF0aHMgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIpKSBhcyBVc2VyUGF0aHM7XHJcbiAgY2FjaGVkUGF0aHMgPSBwYXRocztcclxuICAvLyBQdXNoIHRoZSBsaXN0IHRvIHRoZSBzZXR0aW5ncyBpbmplY3RvciBzbyB0aGUgVHdlYWtzIHBhZ2UgY2FuIHJlbmRlclxyXG4gIC8vIGNhcmRzIGV2ZW4gYmVmb3JlIGFueSB0d2VhaydzIHN0YXJ0KCkgcnVucyAoYW5kIGZvciBkaXNhYmxlZCB0d2Vha3NcclxuICAvLyB0aGF0IHdlIG5ldmVyIGxvYWQpLlxyXG4gIHNldExpc3RlZFR3ZWFrcyh0d2Vha3MpO1xyXG4gIC8vIFN0YXNoIGZvciB0aGUgc2V0dGluZ3MgaW5qZWN0b3IncyBlbXB0eS1zdGF0ZSBtZXNzYWdlLlxyXG4gICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IF9fY29kZXhwcF90d2Vha3NfZGlyX18/OiBzdHJpbmcgfSkuX19jb2RleHBwX3R3ZWFrc19kaXJfXyA9XHJcbiAgICBwYXRocy50d2Vha3NEaXI7XHJcblxyXG4gIGZvciAoY29uc3QgdCBvZiB0d2Vha3MpIHtcclxuICAgIGlmICh0Lm1hbmlmZXN0LnNjb3BlID09PSBcIm1haW5cIikgY29udGludWU7XHJcbiAgICBpZiAoIXQuZW50cnlFeGlzdHMpIGNvbnRpbnVlO1xyXG4gICAgaWYgKCF0LmVuYWJsZWQpIGNvbnRpbnVlO1xyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgbG9hZFR3ZWFrKHQsIHBhdGhzKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gdHdlYWsgbG9hZCBmYWlsZWQ6XCIsIHQubWFuaWZlc3QuaWQsIGUpO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlwY1JlbmRlcmVyLnNlbmQoXHJcbiAgICAgICAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcclxuICAgICAgICAgIFwiZXJyb3JcIixcclxuICAgICAgICAgIFwidHdlYWsgbG9hZCBmYWlsZWQ6IFwiICsgdC5tYW5pZmVzdC5pZCArIFwiOiBcIiArIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpLFxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbnNvbGUuaW5mbyhcclxuICAgIGBbY29kZXgtcGx1c3BsdXNdIHJlbmRlcmVyIGhvc3QgbG9hZGVkICR7bG9hZGVkLnNpemV9IHR3ZWFrKHMpOmAsXHJcbiAgICBbLi4ubG9hZGVkLmtleXMoKV0uam9pbihcIiwgXCIpIHx8IFwiKG5vbmUpXCIsXHJcbiAgKTtcclxuICBpcGNSZW5kZXJlci5zZW5kKFxyXG4gICAgXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsXHJcbiAgICBcImluZm9cIixcclxuICAgIGByZW5kZXJlciBob3N0IGxvYWRlZCAke2xvYWRlZC5zaXplfSB0d2VhayhzKTogJHtbLi4ubG9hZGVkLmtleXMoKV0uam9pbihcIiwgXCIpIHx8IFwiKG5vbmUpXCJ9YCxcclxuICApO1xyXG59XHJcblxyXG4vKipcclxuICogU3RvcCBldmVyeSByZW5kZXJlci1zY29wZSB0d2VhayBzbyBhIHN1YnNlcXVlbnQgYHN0YXJ0VHdlYWtIb3N0KClgIHdpbGxcclxuICogcmUtZXZhbHVhdGUgZnJlc2ggc291cmNlLiBNb2R1bGUgY2FjaGUgaXNuJ3QgcmVsZXZhbnQgc2luY2Ugd2UgZXZhbFxyXG4gKiBzb3VyY2Ugc3RyaW5ncyBkaXJlY3RseSBcdTIwMTQgZWFjaCBsb2FkIGNyZWF0ZXMgYSBmcmVzaCBzY29wZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB0ZWFyZG93blR3ZWFrSG9zdCgpOiB2b2lkIHtcclxuICBmb3IgKGNvbnN0IFtpZCwgdF0gb2YgbG9hZGVkKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICB0LnN0b3A/LigpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oXCJbY29kZXgtcGx1c3BsdXNdIHR3ZWFrIHN0b3AgZmFpbGVkOlwiLCBpZCwgZSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGxvYWRlZC5jbGVhcigpO1xyXG4gIGNsZWFyU2VjdGlvbnMoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZFR3ZWFrKHQ6IExpc3RlZFR3ZWFrLCBwYXRoczogVXNlclBhdGhzKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3Qgc291cmNlID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcclxuICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLXNvdXJjZVwiLFxyXG4gICAgdC5lbnRyeSxcclxuICApKSBhcyBzdHJpbmc7XHJcblxyXG4gIC8vIEV2YWx1YXRlIGFzIENKUy1zaGFwZWQ6IHByb3ZpZGUgbW9kdWxlL2V4cG9ydHMvYXBpLiBUd2VhayBjb2RlIG1heSB1c2VcclxuICAvLyBgbW9kdWxlLmV4cG9ydHMgPSB7IHN0YXJ0LCBzdG9wIH1gIG9yIGBleHBvcnRzLnN0YXJ0ID0gLi4uYCBvciBwdXJlIEVTTVxyXG4gIC8vIGRlZmF1bHQgZXhwb3J0IHNoYXBlICh3ZSBhY2NlcHQgYm90aCkuXHJcbiAgY29uc3QgbW9kdWxlID0geyBleHBvcnRzOiB7fSBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9ICYgVHdlYWsgfTtcclxuICBjb25zdCBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHM7XHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1pbXBsaWVkLWV2YWwsIG5vLW5ldy1mdW5jXHJcbiAgY29uc3QgZm4gPSBuZXcgRnVuY3Rpb24oXHJcbiAgICBcIm1vZHVsZVwiLFxyXG4gICAgXCJleHBvcnRzXCIsXHJcbiAgICBcImNvbnNvbGVcIixcclxuICAgIGAke3NvdXJjZX1cXG4vLyMgc291cmNlVVJMPWNvZGV4cHAtdHdlYWs6Ly8ke2VuY29kZVVSSUNvbXBvbmVudCh0Lm1hbmlmZXN0LmlkKX0vJHtlbmNvZGVVUklDb21wb25lbnQodC5lbnRyeSl9YCxcclxuICApO1xyXG4gIGZuKG1vZHVsZSwgZXhwb3J0cywgY29uc29sZSk7XHJcbiAgY29uc3QgbW9kID0gbW9kdWxlLmV4cG9ydHMgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSAmIFR3ZWFrO1xyXG4gIGNvbnN0IHR3ZWFrOiBUd2VhayA9IChtb2QgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSkuZGVmYXVsdCA/PyAobW9kIGFzIFR3ZWFrKTtcclxuICBpZiAodHlwZW9mIHR3ZWFrPy5zdGFydCAhPT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYHR3ZWFrICR7dC5tYW5pZmVzdC5pZH0gaGFzIG5vIHN0YXJ0KClgKTtcclxuICB9XHJcbiAgY29uc3QgYXBpID0gbWFrZVJlbmRlcmVyQXBpKHQubWFuaWZlc3QsIHBhdGhzKTtcclxuICBhd2FpdCB0d2Vhay5zdGFydChhcGkpO1xyXG4gIGxvYWRlZC5zZXQodC5tYW5pZmVzdC5pZCwgeyBzdG9wOiB0d2Vhay5zdG9wPy5iaW5kKHR3ZWFrKSB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gbWFrZVJlbmRlcmVyQXBpKG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LCBwYXRoczogVXNlclBhdGhzKTogVHdlYWtBcGkge1xyXG4gIGNvbnN0IGlkID0gbWFuaWZlc3QuaWQ7XHJcbiAgY29uc3QgbG9nID0gKGxldmVsOiBcImRlYnVnXCIgfCBcImluZm9cIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCAuLi5hOiB1bmtub3duW10pID0+IHtcclxuICAgIGNvbnN0IGNvbnNvbGVGbiA9XHJcbiAgICAgIGxldmVsID09PSBcImRlYnVnXCIgPyBjb25zb2xlLmRlYnVnXHJcbiAgICAgIDogbGV2ZWwgPT09IFwid2FyblwiID8gY29uc29sZS53YXJuXHJcbiAgICAgIDogbGV2ZWwgPT09IFwiZXJyb3JcIiA/IGNvbnNvbGUuZXJyb3JcclxuICAgICAgOiBjb25zb2xlLmxvZztcclxuICAgIGNvbnNvbGVGbihgW2NvZGV4LXBsdXNwbHVzXVske2lkfV1gLCAuLi5hKTtcclxuICAgIC8vIEFsc28gbWlycm9yIHRvIG1haW4ncyBsb2cgZmlsZSBzbyB3ZSBjYW4gZGlhZ25vc2UgdHdlYWsgYmVoYXZpb3JcclxuICAgIC8vIHdpdGhvdXQgYXR0YWNoaW5nIERldlRvb2xzLiBTdHJpbmdpZnkgZWFjaCBhcmcgZGVmZW5zaXZlbHkuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBwYXJ0cyA9IGEubWFwKCh2KSA9PiB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiKSByZXR1cm4gdjtcclxuICAgICAgICBpZiAodiBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gYCR7di5uYW1lfTogJHt2Lm1lc3NhZ2V9YDtcclxuICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHYpOyB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBpcGNSZW5kZXJlci5zZW5kKFxyXG4gICAgICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxyXG4gICAgICAgIGxldmVsLFxyXG4gICAgICAgIGBbdHdlYWsgJHtpZH1dICR7cGFydHMuam9pbihcIiBcIil9YCxcclxuICAgICAgKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICAvKiBzd2FsbG93IFx1MjAxNCBuZXZlciBsZXQgbG9nZ2luZyBicmVhayBhIHR3ZWFrICovXHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG1hbmlmZXN0LFxyXG4gICAgcHJvY2VzczogXCJyZW5kZXJlclwiLFxyXG4gICAgbG9nOiB7XHJcbiAgICAgIGRlYnVnOiAoLi4uYSkgPT4gbG9nKFwiZGVidWdcIiwgLi4uYSksXHJcbiAgICAgIGluZm86ICguLi5hKSA9PiBsb2coXCJpbmZvXCIsIC4uLmEpLFxyXG4gICAgICB3YXJuOiAoLi4uYSkgPT4gbG9nKFwid2FyblwiLCAuLi5hKSxcclxuICAgICAgZXJyb3I6ICguLi5hKSA9PiBsb2coXCJlcnJvclwiLCAuLi5hKSxcclxuICAgIH0sXHJcbiAgICBzdG9yYWdlOiByZW5kZXJlclN0b3JhZ2UoaWQpLFxyXG4gICAgc2V0dGluZ3M6IHtcclxuICAgICAgcmVnaXN0ZXI6IChzKSA9PiByZWdpc3RlclNlY3Rpb24oeyAuLi5zLCBpZDogYCR7aWR9OiR7cy5pZH1gIH0pLFxyXG4gICAgICByZWdpc3RlclBhZ2U6IChwKSA9PlxyXG4gICAgICAgIHJlZ2lzdGVyUGFnZShpZCwgbWFuaWZlc3QsIHsgLi4ucCwgaWQ6IGAke2lkfToke3AuaWR9YCB9KSxcclxuICAgIH0sXHJcbiAgICByZWFjdDoge1xyXG4gICAgICBnZXRGaWJlcjogKG4pID0+IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGwsXHJcbiAgICAgIGZpbmRPd25lckJ5TmFtZTogKG4sIG5hbWUpID0+IHtcclxuICAgICAgICBsZXQgZiA9IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGw7XHJcbiAgICAgICAgd2hpbGUgKGYpIHtcclxuICAgICAgICAgIGNvbnN0IHQgPSBmLnR5cGUgYXMgeyBkaXNwbGF5TmFtZT86IHN0cmluZzsgbmFtZT86IHN0cmluZyB9IHwgbnVsbDtcclxuICAgICAgICAgIGlmICh0ICYmICh0LmRpc3BsYXlOYW1lID09PSBuYW1lIHx8IHQubmFtZSA9PT0gbmFtZSkpIHJldHVybiBmO1xyXG4gICAgICAgICAgZiA9IGYucmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfSxcclxuICAgICAgd2FpdEZvckVsZW1lbnQ6IChzZWwsIHRpbWVvdXRNcyA9IDUwMDApID0+XHJcbiAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgICAgICBpZiAoZXhpc3RpbmcpIHJldHVybiByZXNvbHZlKGV4aXN0aW5nKTtcclxuICAgICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIHRpbWVvdXRNcztcclxuICAgICAgICAgIGNvbnN0IG9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgICAgICAgIGlmIChlbCkge1xyXG4gICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShlbCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoRGF0ZS5ub3coKSA+IGRlYWRsaW5lKSB7XHJcbiAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGB0aW1lb3V0IHdhaXRpbmcgZm9yICR7c2VsfWApKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xyXG4gICAgICAgIH0pLFxyXG4gICAgfSxcclxuICAgIGlwYzoge1xyXG4gICAgICBvbjogKGMsIGgpID0+IHtcclxuICAgICAgICBjb25zdCB3cmFwcGVkID0gKF9lOiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10pID0+IGgoLi4uYXJncyk7XHJcbiAgICAgICAgaXBjUmVuZGVyZXIub24oYGNvZGV4cHA6JHtpZH06JHtjfWAsIHdyYXBwZWQpO1xyXG4gICAgICAgIHJldHVybiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XHJcbiAgICAgIH0sXHJcbiAgICAgIHNlbmQ6IChjLCAuLi5hcmdzKSA9PiBpcGNSZW5kZXJlci5zZW5kKGBjb2RleHBwOiR7aWR9OiR7Y31gLCAuLi5hcmdzKSxcclxuICAgICAgaW52b2tlOiA8VD4oYzogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+XHJcbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKGBjb2RleHBwOiR7aWR9OiR7Y31gLCAuLi5hcmdzKSBhcyBQcm9taXNlPFQ+LFxyXG4gICAgfSxcclxuICAgIGZzOiByZW5kZXJlckZzKGlkLCBwYXRocyksXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyZXJTdG9yYWdlKGlkOiBzdHJpbmcpIHtcclxuICBjb25zdCBrZXkgPSBgY29kZXhwcDpzdG9yYWdlOiR7aWR9YDtcclxuICBjb25zdCByZWFkID0gKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSkgPz8gXCJ7fVwiKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICByZXR1cm4ge307XHJcbiAgICB9XHJcbiAgfTtcclxuICBjb25zdCB3cml0ZSA9ICh2OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT5cclxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgSlNPTi5zdHJpbmdpZnkodikpO1xyXG4gIHJldHVybiB7XHJcbiAgICBnZXQ6IDxUPihrOiBzdHJpbmcsIGQ/OiBUKSA9PiAoayBpbiByZWFkKCkgPyAocmVhZCgpW2tdIGFzIFQpIDogKGQgYXMgVCkpLFxyXG4gICAgc2V0OiAoazogc3RyaW5nLCB2OiB1bmtub3duKSA9PiB7XHJcbiAgICAgIGNvbnN0IG8gPSByZWFkKCk7XHJcbiAgICAgIG9ba10gPSB2O1xyXG4gICAgICB3cml0ZShvKTtcclxuICAgIH0sXHJcbiAgICBkZWxldGU6IChrOiBzdHJpbmcpID0+IHtcclxuICAgICAgY29uc3QgbyA9IHJlYWQoKTtcclxuICAgICAgZGVsZXRlIG9ba107XHJcbiAgICAgIHdyaXRlKG8pO1xyXG4gICAgfSxcclxuICAgIGFsbDogKCkgPT4gcmVhZCgpLFxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlcmVyRnMoaWQ6IHN0cmluZywgX3BhdGhzOiBVc2VyUGF0aHMpIHtcclxuICAvLyBTYW5kYm94ZWQgcmVuZGVyZXIgY2FuJ3QgdXNlIE5vZGUgZnMgZGlyZWN0bHkgXHUyMDE0IHByb3h5IHRocm91Z2ggbWFpbiBJUEMuXHJcbiAgcmV0dXJuIHtcclxuICAgIGRhdGFEaXI6IGA8cmVtb3RlPi90d2Vhay1kYXRhLyR7aWR9YCxcclxuICAgIHJlYWQ6IChwOiBzdHJpbmcpID0+XHJcbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJyZWFkXCIsIGlkLCBwKSBhcyBQcm9taXNlPHN0cmluZz4sXHJcbiAgICB3cml0ZTogKHA6IHN0cmluZywgYzogc3RyaW5nKSA9PlxyXG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnR3ZWFrLWZzXCIsIFwid3JpdGVcIiwgaWQsIHAsIGMpIGFzIFByb21pc2U8dm9pZD4sXHJcbiAgICBleGlzdHM6IChwOiBzdHJpbmcpID0+XHJcbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJleGlzdHNcIiwgaWQsIHApIGFzIFByb21pc2U8Ym9vbGVhbj4sXHJcbiAgfTtcclxufVxyXG4iLCAiLyoqXHJcbiAqIEJ1aWx0LWluIFwiVHdlYWsgTWFuYWdlclwiIFx1MjAxNCBhdXRvLWluamVjdGVkIGJ5IHRoZSBydW50aW1lLCBub3QgYSB1c2VyIHR3ZWFrLlxyXG4gKiBMaXN0cyBkaXNjb3ZlcmVkIHR3ZWFrcyB3aXRoIGVuYWJsZSB0b2dnbGVzLCBvcGVucyB0aGUgdHdlYWtzIGRpciwgbGlua3NcclxuICogdG8gbG9ncyBhbmQgY29uZmlnLiBMaXZlcyBpbiB0aGUgcmVuZGVyZXIuXHJcbiAqXHJcbiAqIFRoaXMgaXMgaW52b2tlZCBmcm9tIHByZWxvYWQvaW5kZXgudHMgQUZURVIgdXNlciB0d2Vha3MgYXJlIGxvYWRlZCBzbyBpdFxyXG4gKiBjYW4gc2hvdyB1cC10by1kYXRlIHN0YXR1cy5cclxuICovXHJcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XHJcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdGlvbiB9IGZyb20gXCIuL3NldHRpbmdzLWluamVjdG9yXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRNYW5hZ2VyKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IHR3ZWFrcyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmxpc3QtdHdlYWtzXCIpKSBhcyBBcnJheTx7XHJcbiAgICBtYW5pZmVzdDogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHZlcnNpb246IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfTtcclxuICAgIGVudHJ5RXhpc3RzOiBib29sZWFuO1xyXG4gIH0+O1xyXG4gIGNvbnN0IHBhdGhzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dXNlci1wYXRoc1wiKSkgYXMge1xyXG4gICAgdXNlclJvb3Q6IHN0cmluZztcclxuICAgIHR3ZWFrc0Rpcjogc3RyaW5nO1xyXG4gICAgbG9nRGlyOiBzdHJpbmc7XHJcbiAgfTtcclxuXHJcbiAgcmVnaXN0ZXJTZWN0aW9uKHtcclxuICAgIGlkOiBcImNvZGV4LXBsdXNwbHVzOm1hbmFnZXJcIixcclxuICAgIHRpdGxlOiBcIlR3ZWFrIE1hbmFnZXJcIixcclxuICAgIGRlc2NyaXB0aW9uOiBgJHt0d2Vha3MubGVuZ3RofSB0d2VhayhzKSBpbnN0YWxsZWQuIFVzZXIgZGlyOiAke3BhdGhzLnVzZXJSb290fWAsXHJcbiAgICByZW5kZXIocm9vdCkge1xyXG4gICAgICByb290LnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweDtcIjtcclxuXHJcbiAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBhY3Rpb25zLnN0eWxlLmNzc1RleHQgPSBcImRpc3BsYXk6ZmxleDtnYXA6OHB4O2ZsZXgtd3JhcDp3cmFwO1wiO1xyXG4gICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKFxyXG4gICAgICAgIGJ1dHRvbihcIk9wZW4gdHdlYWtzIGZvbGRlclwiLCAoKSA9PlxyXG4gICAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgcGF0aHMudHdlYWtzRGlyKS5jYXRjaCgoKSA9PiB7fSksXHJcbiAgICAgICAgKSxcclxuICAgICAgKTtcclxuICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcclxuICAgICAgICBidXR0b24oXCJPcGVuIGxvZ3NcIiwgKCkgPT5cclxuICAgICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHBhdGhzLmxvZ0RpcikuY2F0Y2goKCkgPT4ge30pLFxyXG4gICAgICAgICksXHJcbiAgICAgICk7XHJcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXHJcbiAgICAgICAgYnV0dG9uKFwiUmVsb2FkIHdpbmRvd1wiLCAoKSA9PiBsb2NhdGlvbi5yZWxvYWQoKSksXHJcbiAgICAgICk7XHJcbiAgICAgIHJvb3QuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcblxyXG4gICAgICBpZiAodHdlYWtzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XHJcbiAgICAgICAgZW1wdHkuc3R5bGUuY3NzVGV4dCA9IFwiY29sb3I6Izg4ODtmb250OjEzcHggc3lzdGVtLXVpO21hcmdpbjo4cHggMDtcIjtcclxuICAgICAgICBlbXB0eS50ZXh0Q29udGVudCA9XHJcbiAgICAgICAgICBcIk5vIHVzZXIgdHdlYWtzIHlldC4gRHJvcCBhIGZvbGRlciB3aXRoIG1hbmlmZXN0Lmpzb24gKyBpbmRleC5qcyBpbnRvIHRoZSB0d2Vha3MgZGlyLCB0aGVuIHJlbG9hZC5cIjtcclxuICAgICAgICByb290LmFwcGVuZENoaWxkKGVtcHR5KTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XHJcbiAgICAgIGxpc3Quc3R5bGUuY3NzVGV4dCA9IFwibGlzdC1zdHlsZTpub25lO21hcmdpbjowO3BhZGRpbmc6MDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7XCI7XHJcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0d2Vha3MpIHtcclxuICAgICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcclxuICAgICAgICBsaS5zdHlsZS5jc3NUZXh0ID1cclxuICAgICAgICAgIFwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtwYWRkaW5nOjhweCAxMHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyLCMyYTJhMmEpO2JvcmRlci1yYWRpdXM6NnB4O1wiO1xyXG4gICAgICAgIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIGxlZnQuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQ6NjAwIDEzcHggc3lzdGVtLXVpO1wiPiR7ZXNjYXBlKHQubWFuaWZlc3QubmFtZSl9IDxzcGFuIHN0eWxlPVwiY29sb3I6Izg4ODtmb250LXdlaWdodDo0MDA7XCI+diR7ZXNjYXBlKHQubWFuaWZlc3QudmVyc2lvbil9PC9zcGFuPjwvZGl2PlxyXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImNvbG9yOiM4ODg7Zm9udDoxMnB4IHN5c3RlbS11aTtcIj4ke2VzY2FwZSh0Lm1hbmlmZXN0LmRlc2NyaXB0aW9uID8/IHQubWFuaWZlc3QuaWQpfTwvZGl2PlxyXG4gICAgICAgIGA7XHJcbiAgICAgICAgY29uc3QgcmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIHJpZ2h0LnN0eWxlLmNzc1RleHQgPSBcImNvbG9yOiM4ODg7Zm9udDoxMnB4IHN5c3RlbS11aTtcIjtcclxuICAgICAgICByaWdodC50ZXh0Q29udGVudCA9IHQuZW50cnlFeGlzdHMgPyBcImxvYWRlZFwiIDogXCJtaXNzaW5nIGVudHJ5XCI7XHJcbiAgICAgICAgbGkuYXBwZW5kKGxlZnQsIHJpZ2h0KTtcclxuICAgICAgICBsaXN0LmFwcGVuZChsaSk7XHJcbiAgICAgIH1cclxuICAgICAgcm9vdC5hcHBlbmQobGlzdCk7XHJcbiAgICB9LFxyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBidXR0b24obGFiZWw6IHN0cmluZywgb25jbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcclxuICBjb25zdCBiID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBiLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGIudGV4dENvbnRlbnQgPSBsYWJlbDtcclxuICBiLnN0eWxlLmNzc1RleHQgPVxyXG4gICAgXCJwYWRkaW5nOjZweCAxMHB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tYm9yZGVyLCMzMzMpO2JvcmRlci1yYWRpdXM6NnB4O2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6aW5oZXJpdDtmb250OjEycHggc3lzdGVtLXVpO2N1cnNvcjpwb2ludGVyO1wiO1xyXG4gIGIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIG9uY2xpY2spO1xyXG4gIHJldHVybiBiO1xyXG59XHJcblxyXG5mdW5jdGlvbiBlc2NhcGUoczogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gcy5yZXBsYWNlKC9bJjw+XCInXS9nLCAoYykgPT5cclxuICAgIGMgPT09IFwiJlwiXHJcbiAgICAgID8gXCImYW1wO1wiXHJcbiAgICAgIDogYyA9PT0gXCI8XCJcclxuICAgICAgICA/IFwiJmx0O1wiXHJcbiAgICAgICAgOiBjID09PSBcIj5cIlxyXG4gICAgICAgICAgPyBcIiZndDtcIlxyXG4gICAgICAgICAgOiBjID09PSAnXCInXHJcbiAgICAgICAgICAgID8gXCImcXVvdDtcIlxyXG4gICAgICAgICAgICA6IFwiJiMzOTtcIixcclxuICApO1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQVdBLElBQUFBLG1CQUE0Qjs7O0FDNkJyQixTQUFTLG1CQUF5QjtBQUN2QyxNQUFJLE9BQU8sK0JBQWdDO0FBQzNDLFFBQU0sWUFBWSxvQkFBSSxJQUErQjtBQUNyRCxNQUFJLFNBQVM7QUFDYixRQUFNLFlBQVksb0JBQUksSUFBNEM7QUFFbEUsUUFBTSxPQUEwQjtBQUFBLElBQzlCLGVBQWU7QUFBQSxJQUNmO0FBQUEsSUFDQSxPQUFPLFVBQVU7QUFDZixZQUFNLEtBQUs7QUFDWCxnQkFBVSxJQUFJLElBQUksUUFBUTtBQUUxQixjQUFRO0FBQUEsUUFDTjtBQUFBLFFBQ0EsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLE1BQ1g7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsR0FBRyxPQUFPLElBQUk7QUFDWixV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UTtBQUNOLFdBQU8sT0FBTyxDQUFDO0FBQUEsRUFDakI7QUFDRjtBQUVBLFFBQVEsaUJBQWlCLEVBQUUsS0FBSyxTQUFTLEtBQUssQ0FBQztBQUUvQyxJQUFJLDRCQUE0QjtBQUdoQyxJQUFJO0FBQ0YsbUJBQWlCO0FBQ2pCLFVBQVEsc0JBQXNCO0FBQ2hDLFNBQVMsR0FBRztBQUNWLFVBQVEscUJBQXFCLE9BQU8sQ0FBQyxDQUFDO0FBQ3hDO0FBRUEsZUFBZSxNQUFNO0FBQ25CLE1BQUksU0FBUyxlQUFlLFdBQVc7QUFDckMsYUFBUyxpQkFBaUIsb0JBQW9CLE1BQU0sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3BFLE9BQU87QUFDTCxTQUFLO0FBQUEsRUFDUDtBQUNGLENBQUM7QUFFRCxlQUFlLE9BQU87QUFDcEIsVUFBUSxjQUFjLEVBQUUsWUFBWSxTQUFTLFdBQVcsQ0FBQztBQUN6RCxNQUFJO0FBQ0YsVUFBTSxTQUFTLE1BQU0sNkJBQVksT0FBTyxvQkFBb0IsRUFBRSxNQUFNLE1BQU0sSUFBSTtBQUc5RSxnQ0FBNEIsUUFBUSxxQkFBcUI7QUFDekQsUUFBSSwyQkFBMkI7QUFDN0IsY0FBUSxzQ0FBc0M7QUFBQSxJQUNoRCxPQUFPO0FBQ0wsNEJBQXNCO0FBQ3RCLGNBQVEsMkJBQTJCO0FBQUEsSUFDckM7QUFDQSxVQUFNLGVBQWU7QUFDckIsWUFBUSxvQkFBb0I7QUFDNUIsVUFBTSxhQUFhO0FBQ25CLFlBQVEsaUJBQWlCO0FBQ3pCLFFBQUksMkJBQTJCO0FBQzdCLG9DQUE4QjtBQUM5QixjQUFRLHNDQUFzQztBQUFBLElBQ2hEO0FBQ0Esb0JBQWdCO0FBQ2hCLFlBQVEsZUFBZTtBQUFBLEVBQ3pCLFNBQVMsR0FBRztBQUNWLFlBQVEsZUFBZSxPQUFRLEdBQWEsU0FBUyxDQUFDLENBQUM7QUFDdkQsWUFBUSxNQUFNLHlDQUF5QyxDQUFDO0FBQUEsRUFDMUQ7QUFDRjtBQUlBLElBQUksWUFBa0M7QUFDdEMsU0FBUyxrQkFBd0I7QUFDL0IsK0JBQVksR0FBRywwQkFBMEIsTUFBTTtBQUM3QyxRQUFJLFVBQVc7QUFDZixpQkFBYSxZQUFZO0FBQ3ZCLFVBQUk7QUFDRixnQkFBUSxLQUFLLHVDQUF1QztBQUNwRCwwQkFBa0I7QUFDbEIsY0FBTSxlQUFlO0FBQ3JCLGNBQU0sYUFBYTtBQUNuQixZQUFJLDBCQUEyQiwrQkFBOEI7QUFBQSxNQUMvRCxTQUFTLEdBQUc7QUFDVixnQkFBUSxNQUFNLHVDQUF1QyxDQUFDO0FBQUEsTUFDeEQsVUFBRTtBQUNBLG9CQUFZO0FBQUEsTUFDZDtBQUFBLElBQ0YsR0FBRztBQUFBLEVBQ0wsQ0FBQztBQUNIOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfZWxlY3Ryb24iLCAicm9vdCIsICJzdGF0ZSIsICJidXR0b24iLCAiY2FyZCIsICJpbXBvcnRfZWxlY3Ryb24iLCAibW9kdWxlIiwgImV4cG9ydHMiLCAiaW1wb3J0X2VsZWN0cm9uIiwgInNhZmVTdHJpbmdpZnkiXQp9Cg==
