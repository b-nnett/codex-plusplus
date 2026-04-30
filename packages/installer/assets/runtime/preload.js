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
var state = {
  sections: /* @__PURE__ */ new Map(),
  pages: /* @__PURE__ */ new Map(),
  listedTweaks: [],
  outerWrapper: null,
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
  settingsSurfaceHideTimer: null
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
var DEFAULT_LOCALE = "en";
var TRANSLATIONS = {
  ko: {
    "Config": "\uC124\uC815",
    "Tweaks": "\uD2B8\uC705",
    "Keyboard Shortcuts": "\uD0A4\uBCF4\uB4DC \uB2E8\uCD95\uD0A4",
    "UI Improvements": "UI \uAC1C\uC120",
    "Configure Codex++ itself.": "Codex++ \uC790\uCCB4 \uC124\uC815\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    "Manage your installed Codex++ tweaks.": "\uC124\uCE58\uB41C Codex++ \uD2B8\uC705\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    "Remap or disable Codex's keyboard shortcuts.": "Codex \uD0A4\uBCF4\uB4DC \uB2E8\uCD95\uD0A4\uB97C \uBCC0\uACBD\uD558\uAC70\uB098 \uBE44\uD65C\uC131\uD654\uD569\uB2C8\uB2E4.",
    "Bennett's small quality-of-life tweaks.": "Bennett\uC758 \uC791\uC740 \uC0AC\uC6A9\uC131 \uAC1C\uC120 \uD2B8\uC705\uC785\uB2C8\uB2E4.",
    "Codex++ Updates": "Codex++ \uC5C5\uB370\uC774\uD2B8",
    "Loading update settings": "\uC5C5\uB370\uC774\uD2B8 \uC124\uC815 \uBD88\uB7EC\uC624\uB294 \uC911",
    "Checking current Codex++ configuration.": "\uD604\uC7AC Codex++ \uC124\uC815\uC744 \uD655\uC778\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.",
    "Could not load update settings": "\uC5C5\uB370\uC774\uD2B8 \uC124\uC815\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC74C",
    "Maintenance": "\uC720\uC9C0\uBCF4\uC218",
    "Automatically refresh Codex++": "Codex++ \uC790\uB3D9 \uC0C8\uB85C\uACE0\uCE68",
    "Installed version v{version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.": "\uC124\uCE58\uB41C \uBC84\uC804 v{version}. GitHub installer\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD55C \uB4A4 watcher\uAC00 Codex++ runtime\uC744 \uC0C8\uB85C\uACE0\uCE68\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    "Codex++ update available": "Codex++ \uC5C5\uB370\uC774\uD2B8 \uC0AC\uC6A9 \uAC00\uB2A5",
    "Codex++ is up to date": "Codex++ \uCD5C\uC2E0 \uC0C1\uD0DC",
    "Release Notes": "\uB9B4\uB9AC\uC2A4 \uB178\uD2B8",
    "Check Now": "\uC9C0\uAE08 \uD655\uC778",
    "Latest release notes": "\uCD5C\uC2E0 \uB9B4\uB9AC\uC2A4 \uB178\uD2B8",
    "No release notes available.": "\uB9B4\uB9AC\uC2A4 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    "No update check has run yet.": "\uC544\uC9C1 \uC5C5\uB370\uC774\uD2B8 \uD655\uC778\uC744 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
    "Latest v{version}. ": "\uCD5C\uC2E0 v{version}. ",
    "Checked {date}.": "{date}\uC5D0 \uD655\uC778\uD568.",
    "Uninstall Codex++": "Codex++ \uC81C\uAC70",
    "Copies the uninstall command. Run it from a terminal after quitting Codex.": "\uC81C\uAC70 \uBA85\uB839\uC744 \uBCF5\uC0AC\uD569\uB2C8\uB2E4. Codex\uB97C \uC885\uB8CC\uD55C \uB4A4 \uD130\uBBF8\uB110\uC5D0\uC11C \uC2E4\uD589\uD558\uC138\uC694.",
    "Copy Command": "\uBA85\uB839 \uBCF5\uC0AC",
    "Report a bug": "\uBC84\uADF8 \uC2E0\uACE0",
    "Open a GitHub issue with runtime, installer, or tweak-manager details.": "runtime, installer, tweak-manager \uC815\uBCF4\uB97C \uB2F4\uC544 GitHub \uC774\uC288\uB97C \uC5FD\uB2C8\uB2E4.",
    "Open Issue": "\uC774\uC288 \uC5F4\uAE30",
    "Open Tweaks Folder": "\uD2B8\uC705 \uD3F4\uB354 \uC5F4\uAE30",
    "Force Reload": "\uAC15\uC81C \uC0C8\uB85C\uACE0\uCE68",
    "Installed Tweaks": "\uC124\uCE58\uB41C \uD2B8\uC705",
    "No tweaks installed": "\uC124\uCE58\uB41C \uD2B8\uC705 \uC5C6\uC74C",
    "Drop a tweak folder into {path} and reload.": "{path}\uC5D0 \uD2B8\uC705 \uD3F4\uB354\uB97C \uB123\uACE0 \uC0C8\uB85C\uACE0\uCE68\uD558\uC138\uC694.",
    "Update Available": "\uC5C5\uB370\uC774\uD2B8 \uC788\uC74C",
    "Homepage": "\uD648\uD398\uC774\uC9C0",
    "Review Release": "\uB9B4\uB9AC\uC2A4 \uD655\uC778"
  }
};
function preferredLocale() {
  const candidates = [
    document.documentElement.lang,
    navigator.language,
    ...navigator.languages ?? [],
    Intl.DateTimeFormat().resolvedOptions().locale
  ];
  for (const locale of candidates) {
    const normalized = locale?.toLowerCase();
    if (!normalized) continue;
    if (TRANSLATIONS[normalized]) return normalized;
    const base = normalized.split("-")[0];
    if (TRANSLATIONS[base]) return base;
  }
  return DEFAULT_LOCALE;
}
function localize(text, values) {
  const template = TRANSLATIONS[preferredLocale()]?.[text] ?? text;
  if (!values) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (match, key) => values[key] === void 0 ? match : String(values[key])
  );
}
function localizeOptional(text) {
  return text === void 0 ? void 0 : localize(text);
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
  if (state.navGroup?.contains(control) || state.pagesGroup?.contains(control)) return;
  setTimeout(() => {
    if (!findSidebarItemsGroup()) {
      setSettingsSurfaceVisible(false, "settings-control-left-surface");
    }
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
  state.sidebarRoot = outer;
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
  const header = document.createElement("div");
  header.className = "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
  header.textContent = "Codex Plus Plus";
  group.appendChild(header);
  const configBtn = makeSidebarItem(localize("Config"), configIconSvg(), "config");
  const tweaksBtn = makeSidebarItem(localize("Tweaks"), tweaksIconSvg(), "tweaks");
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
  group.appendChild(configBtn);
  group.appendChild(tweaksBtn);
  outer.appendChild(group);
  state.navGroup = group;
  state.navButtons = { config: configBtn, tweaks: tweaksBtn };
  plog("nav group injected", { outerTag: outer.tagName });
  syncPagesGroup();
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
  return !!document.querySelector('[data-codexpp="nav-group"]');
}
function setSettingsSurfaceVisible(visible, reason) {
  if (state.settingsSurfaceVisible === visible) return;
  state.settingsSurfaceVisible = visible;
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
  const pages = [...state.pages.values()];
  const desiredKey = pages.length === 0 ? "EMPTY" : pages.map((p) => `${p.id}|${localize(p.page.title)}|${p.page.iconSvg ?? ""}`).join("\n");
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
    const header = document.createElement("div");
    header.className = "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
    header.textContent = localize("Tweaks");
    group.appendChild(header);
    outer.appendChild(group);
    state.pagesGroup = group;
  } else {
    while (group.children.length > 1) group.removeChild(group.lastChild);
  }
  for (const p of pages) {
    const icon = p.page.iconSvg ?? defaultPageIconSvg();
    const btn = makeSidebarItem(localize(p.page.title), icon);
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
function makeSidebarItem(label, iconSvg, dataKey = label.toLowerCase()) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexpp = `nav-${dataKey}`;
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
    const builtin = active?.kind === "config" ? "config" : active?.kind === "tweaks" ? "tweaks" : null;
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
    const root2 = panelShell(
      localize(entry.page.title),
      localizeOptional(entry.page.description)
    );
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
  const title = ap.kind === "tweaks" ? localize("Tweaks") : localize("Config");
  const subtitle = ap.kind === "tweaks" ? localize("Manage your installed Codex++ tweaks.") : localize("Configure Codex++ itself.");
  const root = panelShell(title, subtitle);
  host.appendChild(root.outer);
  if (ap.kind === "tweaks") renderTweaksPage(root.sectionsWrap);
  else renderConfigPage(root.sectionsWrap);
}
function renderConfigPage(sectionsWrap) {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
    card.textContent = "";
    renderCodexPlusPlusConfig(card, config);
  }).catch((e) => {
    card.textContent = "";
    card.appendChild(rowSimple("Could not load update settings", String(e)));
  });
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
  card.appendChild(checkForUpdatesRow(config.updateCheck));
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
  desc.textContent = localize(
    "Installed version v{version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.",
    { version: config.version }
  );
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
function checkForUpdatesRow(check) {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = check?.updateAvailable ? "Codex++ update available" : "Codex++ is up to date";
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
      void import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", true).then((next) => {
        const card = row.parentElement;
        if (!card) return;
        card.textContent = "";
        void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
          renderCodexPlusPlusConfig(card, {
            ...config,
            updateCheck: next
          });
        });
      }).catch((e) => plog("Codex++ update check failed", String(e))).finally(() => {
        row.style.opacity = "";
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
  const body = document.createElement("pre");
  body.className = "max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-foreground/5 p-3 text-xs text-token-text-secondary";
  body.textContent = check.releaseNotes?.trim() || check.error || "No release notes available.";
  row.appendChild(body);
  return row;
}
function updateSummary(check) {
  if (!check) return localize("No update check has run yet.");
  const latest = check.latestVersion ? localize("Latest v{version}. ", { version: check.latestVersion }) : "";
  const checked = localize("Checked {date}.", {
    date: new Date(check.checkedAt).toLocaleString()
  });
  if (check.error) return `${latest}${checked} ${check.error}`;
  return `${latest}${checked}`;
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
  title.textContent = localize(titleText);
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = localize(description);
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  const actions = document.createElement("div");
  actions.dataset.codexppRowActions = "true";
  actions.className = "flex shrink-0 items-center gap-2";
  row.appendChild(actions);
  return row;
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
        localize("Drop a tweak folder into {path} and reload.", {
          path: tweaksPath()
        })
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
  const wrap = document.createElement("section");
  wrap.className = "flex flex-col gap-2";
  wrap.appendChild(sectionTitle("Installed Tweaks", trailing));
  const card = roundedCard();
  for (const t of state.listedTweaks) {
    card.appendChild(tweakRow(t, sectionsByTweak.get(t.manifest.id) ?? []));
  }
  wrap.appendChild(card);
  sectionsWrap.appendChild(wrap);
}
function tweakRow(t, sections) {
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
    badge.textContent = localize("Update Available");
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
    link.textContent = localize("Homepage");
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
function panelShell(title, subtitle) {
  const outer = document.createElement("div");
  outer.className = "main-surface flex h-full min-h-0 flex-col";
  const toolbar = document.createElement("div");
  toolbar.className = "draggable flex items-center px-panel electron:h-toolbar extension:h-toolbar-sm";
  outer.appendChild(toolbar);
  const scroll = document.createElement("div");
  scroll.className = "flex-1 overflow-y-auto p-panel";
  outer.appendChild(scroll);
  const inner = document.createElement("div");
  inner.className = "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
  scroll.appendChild(inner);
  const headerWrap = document.createElement("div");
  headerWrap.className = "flex items-center justify-between gap-3 pb-panel";
  const headerInner = document.createElement("div");
  headerInner.className = "flex min-w-0 flex-1 flex-col gap-1.5 pb-panel";
  const heading = document.createElement("div");
  heading.className = "electron:heading-lg heading-base truncate";
  heading.textContent = localize(title);
  headerInner.appendChild(heading);
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "text-token-text-secondary text-sm";
    sub.textContent = localize(subtitle);
    headerInner.appendChild(sub);
  }
  headerWrap.appendChild(headerInner);
  inner.appendChild(headerWrap);
  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "flex flex-col gap-[var(--padding-panel)]";
  inner.appendChild(sectionsWrap);
  return { outer, sectionsWrap };
}
function sectionTitle(text, trailing) {
  const titleRow = document.createElement("div");
  titleRow.className = "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
  const titleInner = document.createElement("div");
  titleInner.className = "flex min-w-0 flex-1 flex-col gap-1";
  const t = document.createElement("div");
  t.className = "text-base font-medium text-token-text-primary";
  t.textContent = localize(text);
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
  const localizedLabel = localize(label);
  btn.innerHTML = `${localizedLabel}<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true"><path d="M14.3349 13.3301V6.60645L5.47065 15.4707C5.21095 15.7304 4.78895 15.7304 4.52925 15.4707C4.26955 15.211 4.26955 14.789 4.52925 14.5293L13.3935 5.66504H6.66011C6.29284 5.66504 5.99507 5.36727 5.99507 5C5.99507 4.63273 6.29284 4.33496 6.66011 4.33496H14.9999L15.1337 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V13.3301C15.6649 13.6973 15.3672 13.9951 14.9999 13.9951C14.6327 13.9951 14.335 13.6973 14.3349 13.3301Z" fill="currentColor"></path></svg>`;
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
  btn.textContent = localize(label);
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
    t.textContent = localize(title);
    stack.appendChild(t);
  }
  if (description) {
    const d = document.createElement("div");
    d.className = "text-token-text-secondary min-w-0 text-sm";
    d.textContent = localize(description);
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
      if (inside.length >= Math.max(2, links.length - 1)) return node;
      node = node.parentElement;
    }
  }
  const structural = findSidebarItemsGroupByStructure();
  if (structural) return structural;
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
      if (count >= Math.min(3, matches.length)) return node;
      node = node.parentElement;
    }
  }
  return null;
}
function findSidebarItemsGroupByStructure() {
  const groups = Array.from(
    document.querySelectorAll("div.flex.flex-col.gap-px")
  );
  for (const group of groups) {
    if (group.dataset.codexpp) continue;
    const items = Array.from(group.children).filter(
      (child) => child instanceof HTMLElement && !child.dataset.codexpp && ["BUTTON", "A"].includes(child.tagName)
    );
    if (items.length >= 3 && items.every(
      (item) => item.classList.contains("px-row-x") && item.classList.contains("py-row-y") && item.classList.contains("w-full")
    )) {
      return group;
    }
  }
  return null;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvcHJlbG9hZC90d2Vhay1ob3N0LnRzIiwgIi4uL3NyYy9wcmVsb2FkL21hbmFnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxuICogUmVuZGVyZXIgcHJlbG9hZCBlbnRyeS4gUnVucyBpbiBhbiBpc29sYXRlZCB3b3JsZCBiZWZvcmUgQ29kZXgncyBwYWdlIEpTLlxuICogUmVzcG9uc2liaWxpdGllczpcbiAqICAgMS4gSW5zdGFsbCBhIFJlYWN0IERldlRvb2xzLXNoYXBlZCBnbG9iYWwgaG9vayB0byBjYXB0dXJlIHRoZSByZW5kZXJlclxuICogICAgICByZWZlcmVuY2Ugd2hlbiBSZWFjdCBtb3VudHMuIFdlIHVzZSB0aGlzIGZvciBmaWJlciB3YWxraW5nLlxuICogICAyLiBBZnRlciBET01Db250ZW50TG9hZGVkLCBraWNrIG9mZiBzZXR0aW5ncy1pbmplY3Rpb24gbG9naWMuXG4gKiAgIDMuIERpc2NvdmVyIHJlbmRlcmVyLXNjb3BlZCB0d2Vha3MgKHZpYSBJUEMgdG8gbWFpbikgYW5kIHN0YXJ0IHRoZW0uXG4gKiAgIDQuIExpc3RlbiBmb3IgYGNvZGV4cHA6dHdlYWtzLWNoYW5nZWRgIGZyb20gbWFpbiAoZmlsZXN5c3RlbSB3YXRjaGVyKSBhbmRcbiAqICAgICAgaG90LXJlbG9hZCB0d2Vha3Mgd2l0aG91dCBkcm9wcGluZyB0aGUgcGFnZS5cbiAqL1xuXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gXCJlbGVjdHJvblwiO1xuaW1wb3J0IHsgaW5zdGFsbFJlYWN0SG9vayB9IGZyb20gXCIuL3JlYWN0LWhvb2tcIjtcbmltcG9ydCB7IHN0YXJ0U2V0dGluZ3NJbmplY3RvciB9IGZyb20gXCIuL3NldHRpbmdzLWluamVjdG9yXCI7XG5pbXBvcnQgeyBzdGFydFR3ZWFrSG9zdCwgdGVhcmRvd25Ud2Vha0hvc3QgfSBmcm9tIFwiLi90d2Vhay1ob3N0XCI7XG5pbXBvcnQgeyBtb3VudE1hbmFnZXIgfSBmcm9tIFwiLi9tYW5hZ2VyXCI7XG5cbi8vIEZpbGUtbG9nIHByZWxvYWQgcHJvZ3Jlc3Mgc28gd2UgY2FuIGRpYWdub3NlIHdpdGhvdXQgRGV2VG9vbHMuIEJlc3QtZWZmb3J0OlxuLy8gZmFpbHVyZXMgaGVyZSBtdXN0IG5ldmVyIHRocm93IGJlY2F1c2Ugd2UnZCB0YWtlIHRoZSBwYWdlIGRvd24gd2l0aCB1cy5cbi8vXG4vLyBDb2RleCdzIHJlbmRlcmVyIGlzIHNhbmRib3hlZCAoc2FuZGJveDogdHJ1ZSksIHNvIGByZXF1aXJlKFwibm9kZTpmc1wiKWAgaXNcbi8vIHVuYXZhaWxhYmxlLiBXZSBmb3J3YXJkIGxvZyBsaW5lcyB0byBtYWluIHZpYSBJUEM7IG1haW4gd3JpdGVzIHRoZSBmaWxlLlxuZnVuY3Rpb24gZmlsZUxvZyhzdGFnZTogc3RyaW5nLCBleHRyYT86IHVua25vd24pOiB2b2lkIHtcbiAgY29uc3QgbXNnID0gYFtjb2RleC1wbHVzcGx1cyBwcmVsb2FkXSAke3N0YWdlfSR7XG4gICAgZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpXG4gIH1gO1xuICB0cnkge1xuICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgfSBjYXRjaCB7fVxuICB0cnkge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsIFwiaW5mb1wiLCBtc2cpO1xuICB9IGNhdGNoIHt9XG59XG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFN0cmluZyh2KTtcbiAgfVxufVxuXG5maWxlTG9nKFwicHJlbG9hZCBlbnRyeVwiLCB7IHVybDogbG9jYXRpb24uaHJlZiB9KTtcblxuLy8gUmVhY3QgaG9vayBtdXN0IGJlIGluc3RhbGxlZCAqYmVmb3JlKiBDb2RleCdzIGJ1bmRsZSBydW5zLlxudHJ5IHtcbiAgaW5zdGFsbFJlYWN0SG9vaygpO1xuICBmaWxlTG9nKFwicmVhY3QgaG9vayBpbnN0YWxsZWRcIik7XG59IGNhdGNoIChlKSB7XG4gIGZpbGVMb2coXCJyZWFjdCBob29rIEZBSUxFRFwiLCBTdHJpbmcoZSkpO1xufVxuXG5xdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSBcImxvYWRpbmdcIikge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIGJvb3QsIHsgb25jZTogdHJ1ZSB9KTtcbiAgfSBlbHNlIHtcbiAgICBib290KCk7XG4gIH1cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBib290KCkge1xuICBmaWxlTG9nKFwiYm9vdCBzdGFydFwiLCB7IHJlYWR5U3RhdGU6IGRvY3VtZW50LnJlYWR5U3RhdGUgfSk7XG4gIHRyeSB7XG4gICAgc3RhcnRTZXR0aW5nc0luamVjdG9yKCk7XG4gICAgZmlsZUxvZyhcInNldHRpbmdzIGluamVjdG9yIHN0YXJ0ZWRcIik7XG4gICAgYXdhaXQgc3RhcnRUd2Vha0hvc3QoKTtcbiAgICBmaWxlTG9nKFwidHdlYWsgaG9zdCBzdGFydGVkXCIpO1xuICAgIGF3YWl0IG1vdW50TWFuYWdlcigpO1xuICAgIGZpbGVMb2coXCJtYW5hZ2VyIG1vdW50ZWRcIik7XG4gICAgc3Vic2NyaWJlUmVsb2FkKCk7XG4gICAgZmlsZUxvZyhcImJvb3QgY29tcGxldGVcIik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBmaWxlTG9nKFwiYm9vdCBGQUlMRURcIiwgU3RyaW5nKChlIGFzIEVycm9yKT8uc3RhY2sgPz8gZSkpO1xuICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIHByZWxvYWQgYm9vdCBmYWlsZWQ6XCIsIGUpO1xuICB9XG59XG5cbi8vIEhvdCByZWxvYWQ6IGdhdGVkIGJlaGluZCBhIHNtYWxsIGluLWZsaWdodCBsb2NrIHNvIGEgZmx1cnJ5IG9mIGZzIGV2ZW50c1xuLy8gZG9lc24ndCByZWVudHJhbnRseSB0ZWFyIGRvd24gdGhlIGhvc3QgbWlkLWxvYWQuXG5sZXQgcmVsb2FkaW5nOiBQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5mdW5jdGlvbiBzdWJzY3JpYmVSZWxvYWQoKTogdm9pZCB7XG4gIGlwY1JlbmRlcmVyLm9uKFwiY29kZXhwcDp0d2Vha3MtY2hhbmdlZFwiLCAoKSA9PiB7XG4gICAgaWYgKHJlbG9hZGluZykgcmV0dXJuO1xuICAgIHJlbG9hZGluZyA9IChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmluZm8oXCJbY29kZXgtcGx1c3BsdXNdIGhvdC1yZWxvYWRpbmcgdHdlYWtzXCIpO1xuICAgICAgICB0ZWFyZG93blR3ZWFrSG9zdCgpO1xuICAgICAgICBhd2FpdCBzdGFydFR3ZWFrSG9zdCgpO1xuICAgICAgICBhd2FpdCBtb3VudE1hbmFnZXIoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gaG90IHJlbG9hZCBmYWlsZWQ6XCIsIGUpO1xuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgcmVsb2FkaW5nID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KSgpO1xuICB9KTtcbn1cbiIsICIvKipcbiAqIEluc3RhbGwgYSBtaW5pbWFsIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXy4gUmVhY3QgY2FsbHNcbiAqIGBob29rLmluamVjdChyZW5kZXJlckludGVybmFscylgIGR1cmluZyBgY3JlYXRlUm9vdGAvYGh5ZHJhdGVSb290YC4gVGhlXG4gKiBcImludGVybmFsc1wiIG9iamVjdCBleHBvc2VzIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlLCB3aGljaCBsZXRzIHVzIHR1cm4gYVxuICogRE9NIG5vZGUgaW50byBhIFJlYWN0IGZpYmVyIFx1MjAxNCBuZWNlc3NhcnkgZm9yIG91ciBTZXR0aW5ncyBpbmplY3Rvci5cbiAqXG4gKiBXZSBkb24ndCB3YW50IHRvIGJyZWFrIHJlYWwgUmVhY3QgRGV2VG9vbHMgaWYgdGhlIHVzZXIgb3BlbnMgaXQ7IHdlIGluc3RhbGxcbiAqIG9ubHkgaWYgbm8gaG9vayBleGlzdHMgeWV0LCBhbmQgd2UgZm9yd2FyZCBjYWxscyB0byBhIGRvd25zdHJlYW0gaG9vayBpZlxuICogb25lIGlzIGxhdGVyIGFzc2lnbmVkLlxuICovXG5kZWNsYXJlIGdsb2JhbCB7XG4gIGludGVyZmFjZSBXaW5kb3cge1xuICAgIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXz86IFJlYWN0RGV2dG9vbHNIb29rO1xuICAgIF9fY29kZXhwcF9fPzoge1xuICAgICAgaG9vazogUmVhY3REZXZ0b29sc0hvb2s7XG4gICAgICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcbiAgICB9O1xuICB9XG59XG5cbmludGVyZmFjZSBSZW5kZXJlckludGVybmFscyB7XG4gIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlPzogKG46IE5vZGUpID0+IHVua25vd247XG4gIHZlcnNpb24/OiBzdHJpbmc7XG4gIGJ1bmRsZVR5cGU/OiBudW1iZXI7XG4gIHJlbmRlcmVyUGFja2FnZU5hbWU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBSZWFjdERldnRvb2xzSG9vayB7XG4gIHN1cHBvcnRzRmliZXI6IHRydWU7XG4gIHJlbmRlcmVyczogTWFwPG51bWJlciwgUmVuZGVyZXJJbnRlcm5hbHM+O1xuICBvbihldmVudDogc3RyaW5nLCBmbjogKC4uLmE6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XG4gIG9mZihldmVudDogc3RyaW5nLCBmbjogKC4uLmE6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XG4gIGVtaXQoZXZlbnQ6IHN0cmluZywgLi4uYTogdW5rbm93bltdKTogdm9pZDtcbiAgaW5qZWN0KHJlbmRlcmVyOiBSZW5kZXJlckludGVybmFscyk6IG51bWJlcjtcbiAgb25TY2hlZHVsZUZpYmVyUm9vdD8oKTogdm9pZDtcbiAgb25Db21taXRGaWJlclJvb3Q/KCk6IHZvaWQ7XG4gIG9uQ29tbWl0RmliZXJVbm1vdW50PygpOiB2b2lkO1xuICBjaGVja0RDRT8oKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbGxSZWFjdEhvb2soKTogdm9pZCB7XG4gIGlmICh3aW5kb3cuX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fKSByZXR1cm47XG4gIGNvbnN0IHJlbmRlcmVycyA9IG5ldyBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz4oKTtcbiAgbGV0IG5leHRJZCA9IDE7XG4gIGNvbnN0IGxpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8KC4uLmE6IHVua25vd25bXSkgPT4gdm9pZD4+KCk7XG5cbiAgY29uc3QgaG9vazogUmVhY3REZXZ0b29sc0hvb2sgPSB7XG4gICAgc3VwcG9ydHNGaWJlcjogdHJ1ZSxcbiAgICByZW5kZXJlcnMsXG4gICAgaW5qZWN0KHJlbmRlcmVyKSB7XG4gICAgICBjb25zdCBpZCA9IG5leHRJZCsrO1xuICAgICAgcmVuZGVyZXJzLnNldChpZCwgcmVuZGVyZXIpO1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICAgIFwiW2NvZGV4LXBsdXNwbHVzXSBSZWFjdCByZW5kZXJlciBhdHRhY2hlZDpcIixcbiAgICAgICAgcmVuZGVyZXIucmVuZGVyZXJQYWNrYWdlTmFtZSxcbiAgICAgICAgcmVuZGVyZXIudmVyc2lvbixcbiAgICAgICk7XG4gICAgICByZXR1cm4gaWQ7XG4gICAgfSxcbiAgICBvbihldmVudCwgZm4pIHtcbiAgICAgIGxldCBzID0gbGlzdGVuZXJzLmdldChldmVudCk7XG4gICAgICBpZiAoIXMpIGxpc3RlbmVycy5zZXQoZXZlbnQsIChzID0gbmV3IFNldCgpKSk7XG4gICAgICBzLmFkZChmbik7XG4gICAgfSxcbiAgICBvZmYoZXZlbnQsIGZuKSB7XG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZGVsZXRlKGZuKTtcbiAgICB9LFxuICAgIGVtaXQoZXZlbnQsIC4uLmFyZ3MpIHtcbiAgICAgIGxpc3RlbmVycy5nZXQoZXZlbnQpPy5mb3JFYWNoKChmbikgPT4gZm4oLi4uYXJncykpO1xuICAgIH0sXG4gICAgb25Db21taXRGaWJlclJvb3QoKSB7fSxcbiAgICBvbkNvbW1pdEZpYmVyVW5tb3VudCgpIHt9LFxuICAgIG9uU2NoZWR1bGVGaWJlclJvb3QoKSB7fSxcbiAgICBjaGVja0RDRSgpIHt9LFxuICB9O1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aW5kb3csIFwiX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fXCIsIHtcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IHRydWUsIC8vIGFsbG93IHJlYWwgRGV2VG9vbHMgdG8gb3ZlcndyaXRlIGlmIHVzZXIgaW5zdGFsbHMgaXRcbiAgICB2YWx1ZTogaG9vayxcbiAgfSk7XG5cbiAgd2luZG93Ll9fY29kZXhwcF9fID0geyBob29rLCByZW5kZXJlcnMgfTtcbn1cblxuLyoqIFJlc29sdmUgdGhlIFJlYWN0IGZpYmVyIGZvciBhIERPTSBub2RlLCBpZiBhbnkgcmVuZGVyZXIgaGFzIG9uZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWJlckZvck5vZGUobm9kZTogTm9kZSk6IHVua25vd24gfCBudWxsIHtcbiAgY29uc3QgcmVuZGVyZXJzID0gd2luZG93Ll9fY29kZXhwcF9fPy5yZW5kZXJlcnM7XG4gIGlmIChyZW5kZXJlcnMpIHtcbiAgICBmb3IgKGNvbnN0IHIgb2YgcmVuZGVyZXJzLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBmID0gci5maW5kRmliZXJCeUhvc3RJbnN0YW5jZT8uKG5vZGUpO1xuICAgICAgaWYgKGYpIHJldHVybiBmO1xuICAgIH1cbiAgfVxuICAvLyBGYWxsYmFjazogcmVhZCB0aGUgUmVhY3QgaW50ZXJuYWwgcHJvcGVydHkgZGlyZWN0bHkgZnJvbSB0aGUgRE9NIG5vZGUuXG4gIC8vIFJlYWN0IHN0b3JlcyBmaWJlcnMgYXMgYSBwcm9wZXJ0eSB3aG9zZSBrZXkgc3RhcnRzIHdpdGggXCJfX3JlYWN0RmliZXJcIi5cbiAgZm9yIChjb25zdCBrIG9mIE9iamVjdC5rZXlzKG5vZGUpKSB7XG4gICAgaWYgKGsuc3RhcnRzV2l0aChcIl9fcmVhY3RGaWJlclwiKSkgcmV0dXJuIChub2RlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tdO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuIiwgIi8qKlxuICogU2V0dGluZ3MgaW5qZWN0b3IgZm9yIENvZGV4J3MgU2V0dGluZ3MgcGFnZS5cbiAqXG4gKiBDb2RleCdzIHNldHRpbmdzIGlzIGEgcm91dGVkIHBhZ2UgKFVSTCBzdGF5cyBhdCBgL2luZGV4Lmh0bWw/aG9zdElkPWxvY2FsYClcbiAqIE5PVCBhIG1vZGFsIGRpYWxvZy4gVGhlIHNpZGViYXIgbGl2ZXMgaW5zaWRlIGEgYDxkaXYgY2xhc3M9XCJmbGV4IGZsZXgtY29sXG4gKiBnYXAtMSBnYXAtMFwiPmAgd3JhcHBlciB0aGF0IGhvbGRzIG9uZSBvciBtb3JlIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxuICogZ2FwLXB4XCI+YCBncm91cHMgb2YgYnV0dG9ucy4gVGhlcmUgYXJlIG5vIHN0YWJsZSBgcm9sZWAgLyBgZGF0YS10ZXN0aWRgXG4gKiBob29rcyBvbiB0aGUgc2hlbGwgc28gd2UgaWRlbnRpZnkgdGhlIHNpZGViYXIgYnkgc3RydWN0dXJlIGluc3RlYWQgb2ZcbiAqIGxvY2FsaXplZCBsYWJlbHMuXG4gKlxuICogTGF5b3V0IHdlIGluamVjdDpcbiAqXG4gKiAgIFtDb2RleCdzIGV4aXN0aW5nIGl0ZW1zIGdyb3VwXVxuICogICBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgKGJvcmRlci10LXRva2VuLWJvcmRlcilcbiAqICAgQ09ERVggUExVUyBQTFVTICAgICAgICAgICAgICAgKHVwcGVyY2FzZSBzdWJ0aXRsZSwgdGV4dC10b2tlbi10ZXh0LXRlcnRpYXJ5KVxuICogICBcdTI0RDggQ29uZmlnXG4gKiAgIFx1MjYzMCBUd2Vha3NcbiAqXG4gKiBDbGlja2luZyBDb25maWcgLyBUd2Vha3MgaGlkZXMgQ29kZXgncyBjb250ZW50IHBhbmVsIGNoaWxkcmVuIGFuZCByZW5kZXJzXG4gKiBvdXIgb3duIGBtYWluLXN1cmZhY2VgIHBhbmVsIGluIHRoZWlyIHBsYWNlLiBDbGlja2luZyBhbnkgb2YgQ29kZXgnc1xuICogc2lkZWJhciBpdGVtcyByZXN0b3JlcyB0aGUgb3JpZ2luYWwgdmlldy5cbiAqL1xuXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gXCJlbGVjdHJvblwiO1xuaW1wb3J0IHR5cGUge1xuICBTZXR0aW5nc1NlY3Rpb24sXG4gIFNldHRpbmdzUGFnZSxcbiAgU2V0dGluZ3NIYW5kbGUsXG4gIFR3ZWFrTWFuaWZlc3QsXG59IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5cbi8vIE1pcnJvcnMgdGhlIHJ1bnRpbWUncyBtYWluLXNpZGUgTGlzdGVkVHdlYWsgc2hhcGUgKGtlcHQgaW4gc3luYyBtYW51YWxseSkuXG5pbnRlcmZhY2UgTGlzdGVkVHdlYWsge1xuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcbiAgZW50cnk6IHN0cmluZztcbiAgZGlyOiBzdHJpbmc7XG4gIGVudHJ5RXhpc3RzOiBib29sZWFuO1xuICBlbmFibGVkOiBib29sZWFuO1xuICB1cGRhdGU6IFR3ZWFrVXBkYXRlQ2hlY2sgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgVHdlYWtVcGRhdGVDaGVjayB7XG4gIGNoZWNrZWRBdDogc3RyaW5nO1xuICByZXBvOiBzdHJpbmc7XG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENvZGV4UGx1c1BsdXNDb25maWcge1xuICB2ZXJzaW9uOiBzdHJpbmc7XG4gIGF1dG9VcGRhdGU6IGJvb2xlYW47XG4gIHVwZGF0ZUNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XG4gIHJlbGVhc2VOb3Rlczogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHR3ZWFrLXJlZ2lzdGVyZWQgcGFnZS4gV2UgY2FycnkgdGhlIG93bmluZyB0d2VhaydzIG1hbmlmZXN0IHNvIHdlIGNhblxuICogcmVzb2x2ZSByZWxhdGl2ZSBpY29uVXJscyBhbmQgc2hvdyBhdXRob3JzaGlwIGluIHRoZSBwYWdlIGhlYWRlci5cbiAqL1xuaW50ZXJmYWNlIFJlZ2lzdGVyZWRQYWdlIHtcbiAgLyoqIEZ1bGx5LXF1YWxpZmllZCBpZDogYDx0d2Vha0lkPjo8cGFnZUlkPmAuICovXG4gIGlkOiBzdHJpbmc7XG4gIHR3ZWFrSWQ6IHN0cmluZztcbiAgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XG4gIHBhZ2U6IFNldHRpbmdzUGFnZTtcbiAgLyoqIFBlci1wYWdlIERPTSB0ZWFyZG93biByZXR1cm5lZCBieSBgcGFnZS5yZW5kZXJgLCBpZiBhbnkuICovXG4gIHRlYXJkb3duPzogKCgpID0+IHZvaWQpIHwgbnVsbDtcbiAgLyoqIFRoZSBpbmplY3RlZCBzaWRlYmFyIGJ1dHRvbiAoc28gd2UgY2FuIHVwZGF0ZSBpdHMgYWN0aXZlIHN0YXRlKS4gKi9cbiAgbmF2QnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xufVxuXG4vKiogV2hhdCBwYWdlIGlzIGN1cnJlbnRseSBzZWxlY3RlZCBpbiBvdXIgaW5qZWN0ZWQgbmF2LiAqL1xudHlwZSBBY3RpdmVQYWdlID1cbiAgfCB7IGtpbmQ6IFwiY29uZmlnXCIgfVxuICB8IHsga2luZDogXCJ0d2Vha3NcIiB9XG4gIHwgeyBraW5kOiBcInJlZ2lzdGVyZWRcIjsgaWQ6IHN0cmluZyB9O1xuXG5pbnRlcmZhY2UgSW5qZWN0b3JTdGF0ZSB7XG4gIHNlY3Rpb25zOiBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb24+O1xuICBwYWdlczogTWFwPHN0cmluZywgUmVnaXN0ZXJlZFBhZ2U+O1xuICBsaXN0ZWRUd2Vha3M6IExpc3RlZFR3ZWFrW107XG4gIC8qKiBPdXRlciB3cmFwcGVyIHRoYXQgaG9sZHMgQ29kZXgncyBpdGVtcyBncm91cCArIG91ciBpbmplY3RlZCBncm91cHMuICovXG4gIG91dGVyV3JhcHBlcjogSFRNTEVsZW1lbnQgfCBudWxsO1xuICAvKiogT3VyIFwiQ29kZXggUGx1cyBQbHVzXCIgbmF2IGdyb3VwIChDb25maWcvVHdlYWtzKS4gKi9cbiAgbmF2R3JvdXA6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgbmF2QnV0dG9uczogeyBjb25maWc6IEhUTUxCdXR0b25FbGVtZW50OyB0d2Vha3M6IEhUTUxCdXR0b25FbGVtZW50IH0gfCBudWxsO1xuICAvKiogT3VyIFwiVHdlYWtzXCIgbmF2IGdyb3VwIChwZXItdHdlYWsgcGFnZXMpLiBDcmVhdGVkIGxhemlseS4gKi9cbiAgcGFnZXNHcm91cDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICBwYWdlc0dyb3VwS2V5OiBzdHJpbmcgfCBudWxsO1xuICBwYW5lbEhvc3Q6IEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgb2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXIgfCBudWxsO1xuICBmaW5nZXJwcmludDogc3RyaW5nIHwgbnVsbDtcbiAgc2lkZWJhckR1bXBlZDogYm9vbGVhbjtcbiAgYWN0aXZlUGFnZTogQWN0aXZlUGFnZSB8IG51bGw7XG4gIHNpZGViYXJSb290OiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHNpZGViYXJSZXN0b3JlSGFuZGxlcjogKChlOiBFdmVudCkgPT4gdm9pZCkgfCBudWxsO1xuICBzZXR0aW5nc1N1cmZhY2VWaXNpYmxlOiBib29sZWFuO1xuICBzZXR0aW5nc1N1cmZhY2VIaWRlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbDtcbn1cblxuY29uc3Qgc3RhdGU6IEluamVjdG9yU3RhdGUgPSB7XG4gIHNlY3Rpb25zOiBuZXcgTWFwKCksXG4gIHBhZ2VzOiBuZXcgTWFwKCksXG4gIGxpc3RlZFR3ZWFrczogW10sXG4gIG91dGVyV3JhcHBlcjogbnVsbCxcbiAgbmF2R3JvdXA6IG51bGwsXG4gIG5hdkJ1dHRvbnM6IG51bGwsXG4gIHBhZ2VzR3JvdXA6IG51bGwsXG4gIHBhZ2VzR3JvdXBLZXk6IG51bGwsXG4gIHBhbmVsSG9zdDogbnVsbCxcbiAgb2JzZXJ2ZXI6IG51bGwsXG4gIGZpbmdlcnByaW50OiBudWxsLFxuICBzaWRlYmFyRHVtcGVkOiBmYWxzZSxcbiAgYWN0aXZlUGFnZTogbnVsbCxcbiAgc2lkZWJhclJvb3Q6IG51bGwsXG4gIHNpZGViYXJSZXN0b3JlSGFuZGxlcjogbnVsbCxcbiAgc2V0dGluZ3NTdXJmYWNlVmlzaWJsZTogZmFsc2UsXG4gIHNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcjogbnVsbCxcbn07XG5cbmZ1bmN0aW9uIHBsb2cobXNnOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xuICBpcGNSZW5kZXJlci5zZW5kKFxuICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgIFwiaW5mb1wiLFxuICAgIGBbc2V0dGluZ3MtaW5qZWN0b3JdICR7bXNnfSR7ZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpfWAsXG4gICk7XG59XG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFN0cmluZyh2KTtcbiAgfVxufVxuXG5jb25zdCBERUZBVUxUX0xPQ0FMRSA9IFwiZW5cIjtcblxuLy8gQWRkIGEgbGFuZ3VhZ2UgYnkgYWRkaW5nIGFub3RoZXIgdG9wLWxldmVsIGxvY2FsZSBjb2RlIGhlcmUsIGUuZy4gYGphYCBvciBgemhgLlxuY29uc3QgVFJBTlNMQVRJT05TOiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcbiAga286IHtcbiAgICBcIkNvbmZpZ1wiOiBcIlx1QzEyNFx1QzgxNVwiLFxuICAgIFwiVHdlYWtzXCI6IFwiXHVEMkI4XHVDNzA1XCIsXG4gICAgXCJLZXlib2FyZCBTaG9ydGN1dHNcIjogXCJcdUQwQTRcdUJDRjRcdUI0REMgXHVCMkU4XHVDRDk1XHVEMEE0XCIsXG4gICAgXCJVSSBJbXByb3ZlbWVudHNcIjogXCJVSSBcdUFDMUNcdUMxMjBcIixcbiAgICBcIkNvbmZpZ3VyZSBDb2RleCsrIGl0c2VsZi5cIjogXCJDb2RleCsrIFx1Qzc5MFx1Q0NCNCBcdUMxMjRcdUM4MTVcdUM3NDQgXHVBRDAwXHVCOUFDXHVENTY5XHVCMkM4XHVCMkU0LlwiLFxuICAgIFwiTWFuYWdlIHlvdXIgaW5zdGFsbGVkIENvZGV4KysgdHdlYWtzLlwiOiBcIlx1QzEyNFx1Q0U1OFx1QjQxQyBDb2RleCsrIFx1RDJCOFx1QzcwNVx1Qzc0NCBcdUFEMDBcdUI5QUNcdUQ1NjlcdUIyQzhcdUIyRTQuXCIsXG4gICAgXCJSZW1hcCBvciBkaXNhYmxlIENvZGV4J3Mga2V5Ym9hcmQgc2hvcnRjdXRzLlwiOiBcIkNvZGV4IFx1RDBBNFx1QkNGNFx1QjREQyBcdUIyRThcdUNEOTVcdUQwQTRcdUI5N0MgXHVCQ0MwXHVBQ0JEXHVENTU4XHVBQzcwXHVCMDk4IFx1QkU0NFx1RDY1Q1x1QzEzMVx1RDY1NFx1RDU2OVx1QjJDOFx1QjJFNC5cIixcbiAgICBcIkJlbm5ldHQncyBzbWFsbCBxdWFsaXR5LW9mLWxpZmUgdHdlYWtzLlwiOiBcIkJlbm5ldHRcdUM3NTggXHVDNzkxXHVDNzQwIFx1QzBBQ1x1QzZBOVx1QzEzMSBcdUFDMUNcdUMxMjAgXHVEMkI4XHVDNzA1XHVDNzg1XHVCMkM4XHVCMkU0LlwiLFxuICAgIFwiQ29kZXgrKyBVcGRhdGVzXCI6IFwiQ29kZXgrKyBcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjhcIixcbiAgICBcIkxvYWRpbmcgdXBkYXRlIHNldHRpbmdzXCI6IFwiXHVDNUM1XHVCMzcwXHVDNzc0XHVEMkI4IFx1QzEyNFx1QzgxNSBcdUJEODhcdUI3RUNcdUM2MjRcdUIyOTQgXHVDOTExXCIsXG4gICAgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIjogXCJcdUQ2MDRcdUM3QUMgQ29kZXgrKyBcdUMxMjRcdUM4MTVcdUM3NDQgXHVENjU1XHVDNzc4XHVENTU4XHVCMjk0IFx1QzkxMVx1Qzc4NVx1QjJDOFx1QjJFNC5cIixcbiAgICBcIkNvdWxkIG5vdCBsb2FkIHVwZGF0ZSBzZXR0aW5nc1wiOiBcIlx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOCBcdUMxMjRcdUM4MTVcdUM3NDQgXHVCRDg4XHVCN0VDXHVDNjJDIFx1QzIxOCBcdUM1QzZcdUM3NENcIixcbiAgICBcIk1haW50ZW5hbmNlXCI6IFwiXHVDNzIwXHVDOUMwXHVCQ0Y0XHVDMjE4XCIsXG4gICAgXCJBdXRvbWF0aWNhbGx5IHJlZnJlc2ggQ29kZXgrK1wiOiBcIkNvZGV4KysgXHVDNzkwXHVCM0Q5IFx1QzBDOFx1Qjg1Q1x1QUNFMFx1Q0U2OFwiLFxuICAgIFwiSW5zdGFsbGVkIHZlcnNpb24gdnt2ZXJzaW9ufS4gVGhlIHdhdGNoZXIgY2FuIHJlZnJlc2ggdGhlIENvZGV4KysgcnVudGltZSBhZnRlciB5b3UgcmVydW4gdGhlIEdpdEh1YiBpbnN0YWxsZXIuXCI6IFwiXHVDMTI0XHVDRTU4XHVCNDFDIFx1QkM4NFx1QzgwNCB2e3ZlcnNpb259LiBHaXRIdWIgaW5zdGFsbGVyXHVCOTdDIFx1QjJFNFx1QzJEQyBcdUMyRTRcdUQ1ODlcdUQ1NUMgXHVCNEE0IHdhdGNoZXJcdUFDMDAgQ29kZXgrKyBydW50aW1lXHVDNzQ0IFx1QzBDOFx1Qjg1Q1x1QUNFMFx1Q0U2OFx1RDU2MCBcdUMyMTggXHVDNzg4XHVDMkI1XHVCMkM4XHVCMkU0LlwiLFxuICAgIFwiQ29kZXgrKyB1cGRhdGUgYXZhaWxhYmxlXCI6IFwiQ29kZXgrKyBcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjggXHVDMEFDXHVDNkE5IFx1QUMwMFx1QjJBNVwiLFxuICAgIFwiQ29kZXgrKyBpcyB1cCB0byBkYXRlXCI6IFwiQ29kZXgrKyBcdUNENUNcdUMyRTAgXHVDMEMxXHVEMERDXCIsXG4gICAgXCJSZWxlYXNlIE5vdGVzXCI6IFwiXHVCOUI0XHVCOUFDXHVDMkE0IFx1QjE3OFx1RDJCOFwiLFxuICAgIFwiQ2hlY2sgTm93XCI6IFwiXHVDOUMwXHVBRTA4IFx1RDY1NVx1Qzc3OFwiLFxuICAgIFwiTGF0ZXN0IHJlbGVhc2Ugbm90ZXNcIjogXCJcdUNENUNcdUMyRTAgXHVCOUI0XHVCOUFDXHVDMkE0IFx1QjE3OFx1RDJCOFwiLFxuICAgIFwiTm8gcmVsZWFzZSBub3RlcyBhdmFpbGFibGUuXCI6IFwiXHVCOUI0XHVCOUFDXHVDMkE0IFx1QjE3OFx1RDJCOFx1QUMwMCBcdUM1QzZcdUMyQjVcdUIyQzhcdUIyRTQuXCIsXG4gICAgXCJObyB1cGRhdGUgY2hlY2sgaGFzIHJ1biB5ZXQuXCI6IFwiXHVDNTQ0XHVDOUMxIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOCBcdUQ2NTVcdUM3NzhcdUM3NDQgXHVDMkU0XHVENTg5XHVENTU4XHVDOUMwIFx1QzU0QVx1QzU1OFx1QzJCNVx1QjJDOFx1QjJFNC5cIixcbiAgICBcIkxhdGVzdCB2e3ZlcnNpb259LiBcIjogXCJcdUNENUNcdUMyRTAgdnt2ZXJzaW9ufS4gXCIsXG4gICAgXCJDaGVja2VkIHtkYXRlfS5cIjogXCJ7ZGF0ZX1cdUM1RDAgXHVENjU1XHVDNzc4XHVENTY4LlwiLFxuICAgIFwiVW5pbnN0YWxsIENvZGV4KytcIjogXCJDb2RleCsrIFx1QzgxQ1x1QUM3MFwiLFxuICAgIFwiQ29waWVzIHRoZSB1bmluc3RhbGwgY29tbWFuZC4gUnVuIGl0IGZyb20gYSB0ZXJtaW5hbCBhZnRlciBxdWl0dGluZyBDb2RleC5cIjogXCJcdUM4MUNcdUFDNzAgXHVCQTg1XHVCODM5XHVDNzQ0IFx1QkNGNVx1QzBBQ1x1RDU2OVx1QjJDOFx1QjJFNC4gQ29kZXhcdUI5N0MgXHVDODg1XHVCOENDXHVENTVDIFx1QjRBNCBcdUQxMzBcdUJCRjhcdUIxMTBcdUM1RDBcdUMxMUMgXHVDMkU0XHVENTg5XHVENTU4XHVDMTM4XHVDNjk0LlwiLFxuICAgIFwiQ29weSBDb21tYW5kXCI6IFwiXHVCQTg1XHVCODM5IFx1QkNGNVx1QzBBQ1wiLFxuICAgIFwiUmVwb3J0IGEgYnVnXCI6IFwiXHVCQzg0XHVBREY4IFx1QzJFMFx1QUNFMFwiLFxuICAgIFwiT3BlbiBhIEdpdEh1YiBpc3N1ZSB3aXRoIHJ1bnRpbWUsIGluc3RhbGxlciwgb3IgdHdlYWstbWFuYWdlciBkZXRhaWxzLlwiOiBcInJ1bnRpbWUsIGluc3RhbGxlciwgdHdlYWstbWFuYWdlciBcdUM4MTVcdUJDRjRcdUI5N0MgXHVCMkY0XHVDNTQ0IEdpdEh1YiBcdUM3NzRcdUMyODhcdUI5N0MgXHVDNUZEXHVCMkM4XHVCMkU0LlwiLFxuICAgIFwiT3BlbiBJc3N1ZVwiOiBcIlx1Qzc3NFx1QzI4OCBcdUM1RjRcdUFFMzBcIixcbiAgICBcIk9wZW4gVHdlYWtzIEZvbGRlclwiOiBcIlx1RDJCOFx1QzcwNSBcdUQzRjRcdUIzNTQgXHVDNUY0XHVBRTMwXCIsXG4gICAgXCJGb3JjZSBSZWxvYWRcIjogXCJcdUFDMTVcdUM4MUMgXHVDMEM4XHVCODVDXHVBQ0UwXHVDRTY4XCIsXG4gICAgXCJJbnN0YWxsZWQgVHdlYWtzXCI6IFwiXHVDMTI0XHVDRTU4XHVCNDFDIFx1RDJCOFx1QzcwNVwiLFxuICAgIFwiTm8gdHdlYWtzIGluc3RhbGxlZFwiOiBcIlx1QzEyNFx1Q0U1OFx1QjQxQyBcdUQyQjhcdUM3MDUgXHVDNUM2XHVDNzRDXCIsXG4gICAgXCJEcm9wIGEgdHdlYWsgZm9sZGVyIGludG8ge3BhdGh9IGFuZCByZWxvYWQuXCI6IFwie3BhdGh9XHVDNUQwIFx1RDJCOFx1QzcwNSBcdUQzRjRcdUIzNTRcdUI5N0MgXHVCMTIzXHVBQ0UwIFx1QzBDOFx1Qjg1Q1x1QUNFMFx1Q0U2OFx1RDU1OFx1QzEzOFx1QzY5NC5cIixcbiAgICBcIlVwZGF0ZSBBdmFpbGFibGVcIjogXCJcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjggXHVDNzg4XHVDNzRDXCIsXG4gICAgXCJIb21lcGFnZVwiOiBcIlx1RDY0OFx1RDM5OFx1Qzc3NFx1QzlDMFwiLFxuICAgIFwiUmV2aWV3IFJlbGVhc2VcIjogXCJcdUI5QjRcdUI5QUNcdUMyQTQgXHVENjU1XHVDNzc4XCIsXG4gIH0sXG59O1xuXG5mdW5jdGlvbiBwcmVmZXJyZWRMb2NhbGUoKTogc3RyaW5nIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQubGFuZyxcbiAgICBuYXZpZ2F0b3IubGFuZ3VhZ2UsXG4gICAgLi4uKG5hdmlnYXRvci5sYW5ndWFnZXMgPz8gW10pLFxuICAgIEludGwuRGF0ZVRpbWVGb3JtYXQoKS5yZXNvbHZlZE9wdGlvbnMoKS5sb2NhbGUsXG4gIF07XG4gIGZvciAoY29uc3QgbG9jYWxlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbG9jYWxlPy50b0xvd2VyQ2FzZSgpO1xuICAgIGlmICghbm9ybWFsaXplZCkgY29udGludWU7XG4gICAgaWYgKFRSQU5TTEFUSU9OU1tub3JtYWxpemVkXSkgcmV0dXJuIG5vcm1hbGl6ZWQ7XG4gICAgY29uc3QgYmFzZSA9IG5vcm1hbGl6ZWQuc3BsaXQoXCItXCIpWzBdO1xuICAgIGlmIChUUkFOU0xBVElPTlNbYmFzZV0pIHJldHVybiBiYXNlO1xuICB9XG4gIHJldHVybiBERUZBVUxUX0xPQ0FMRTtcbn1cblxuZnVuY3Rpb24gbG9jYWxpemUodGV4dDogc3RyaW5nLCB2YWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXI+KTogc3RyaW5nIHtcbiAgY29uc3QgdGVtcGxhdGUgPSBUUkFOU0xBVElPTlNbcHJlZmVycmVkTG9jYWxlKCldPy5bdGV4dF0gPz8gdGV4dDtcbiAgaWYgKCF2YWx1ZXMpIHJldHVybiB0ZW1wbGF0ZTtcbiAgcmV0dXJuIHRlbXBsYXRlLnJlcGxhY2UoL1xceyhcXHcrKVxcfS9nLCAobWF0Y2gsIGtleSkgPT5cbiAgICB2YWx1ZXNba2V5XSA9PT0gdW5kZWZpbmVkID8gbWF0Y2ggOiBTdHJpbmcodmFsdWVzW2tleV0pLFxuICApO1xufVxuXG5mdW5jdGlvbiBsb2NhbGl6ZU9wdGlvbmFsKHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiB0ZXh0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSh0ZXh0KTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHB1YmxpYyBBUEkgXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydFNldHRpbmdzSW5qZWN0b3IoKTogdm9pZCB7XG4gIGlmIChzdGF0ZS5vYnNlcnZlcikgcmV0dXJuO1xuXG4gIGNvbnN0IG9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICB0cnlJbmplY3QoKTtcbiAgICBtYXliZUR1bXBEb20oKTtcbiAgfSk7XG4gIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gIHN0YXRlLm9ic2VydmVyID0gb2JzO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicG9wc3RhdGVcIiwgb25OYXYpO1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImhhc2hjaGFuZ2VcIiwgb25OYXYpO1xuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgb25Eb2N1bWVudENsaWNrLCB0cnVlKTtcbiAgZm9yIChjb25zdCBtIG9mIFtcInB1c2hTdGF0ZVwiLCBcInJlcGxhY2VTdGF0ZVwiXSBhcyBjb25zdCkge1xuICAgIGNvbnN0IG9yaWcgPSBoaXN0b3J5W21dO1xuICAgIGhpc3RvcnlbbV0gPSBmdW5jdGlvbiAodGhpczogSGlzdG9yeSwgLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2Ygb3JpZz4pIHtcbiAgICAgIGNvbnN0IHIgPSBvcmlnLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGBjb2RleHBwLSR7bX1gKSk7XG4gICAgICByZXR1cm4gcjtcbiAgICB9IGFzIHR5cGVvZiBvcmlnO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKGBjb2RleHBwLSR7bX1gLCBvbk5hdik7XG4gIH1cblxuICB0cnlJbmplY3QoKTtcbiAgbWF5YmVEdW1wRG9tKCk7XG4gIGxldCB0aWNrcyA9IDA7XG4gIGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIHRpY2tzKys7XG4gICAgdHJ5SW5qZWN0KCk7XG4gICAgbWF5YmVEdW1wRG9tKCk7XG4gICAgaWYgKHRpY2tzID4gNjApIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICB9LCA1MDApO1xufVxuXG5mdW5jdGlvbiBvbk5hdigpOiB2b2lkIHtcbiAgc3RhdGUuZmluZ2VycHJpbnQgPSBudWxsO1xuICB0cnlJbmplY3QoKTtcbiAgbWF5YmVEdW1wRG9tKCk7XG59XG5cbmZ1bmN0aW9uIG9uRG9jdW1lbnRDbGljayhlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG4gIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCA/IGUudGFyZ2V0IDogbnVsbDtcbiAgY29uc3QgY29udHJvbCA9IHRhcmdldD8uY2xvc2VzdChcIltyb2xlPSdsaW5rJ10sYnV0dG9uLGFcIik7XG4gIGlmICghKGNvbnRyb2wgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHJldHVybjtcbiAgaWYgKHN0YXRlLm5hdkdyb3VwPy5jb250YWlucyhjb250cm9sKSB8fCBzdGF0ZS5wYWdlc0dyb3VwPy5jb250YWlucyhjb250cm9sKSkgcmV0dXJuO1xuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBpZiAoIWZpbmRTaWRlYmFySXRlbXNHcm91cCgpKSB7XG4gICAgICBzZXRTZXR0aW5nc1N1cmZhY2VWaXNpYmxlKGZhbHNlLCBcInNldHRpbmdzLWNvbnRyb2wtbGVmdC1zdXJmYWNlXCIpO1xuICAgIH1cbiAgfSwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNlY3Rpb24oc2VjdGlvbjogU2V0dGluZ3NTZWN0aW9uKTogU2V0dGluZ3NIYW5kbGUge1xuICBzdGF0ZS5zZWN0aW9ucy5zZXQoc2VjdGlvbi5pZCwgc2VjdGlvbik7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICByZXR1cm4ge1xuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcbiAgICAgIHN0YXRlLnNlY3Rpb25zLmRlbGV0ZShzZWN0aW9uLmlkKTtcbiAgICAgIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xuICAgIH0sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclNlY3Rpb25zKCk6IHZvaWQge1xuICBzdGF0ZS5zZWN0aW9ucy5jbGVhcigpO1xuICAvLyBEcm9wIHJlZ2lzdGVyZWQgcGFnZXMgdG9vIFx1MjAxNCB0aGV5J3JlIG93bmVkIGJ5IHR3ZWFrcyB0aGF0IGp1c3QgZ290XG4gIC8vIHRvcm4gZG93biBieSB0aGUgaG9zdC4gUnVuIGFueSB0ZWFyZG93bnMgYmVmb3JlIGZvcmdldHRpbmcgdGhlbS5cbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHAudGVhcmRvd24/LigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHBsb2coXCJwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBwLmlkLCBlcnI6IFN0cmluZyhlKSB9KTtcbiAgICB9XG4gIH1cbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcbiAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgLy8gSWYgd2Ugd2VyZSBvbiBhIHJlZ2lzdGVyZWQgcGFnZSB0aGF0IG5vIGxvbmdlciBleGlzdHMsIGZhbGwgYmFjayB0b1xuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxuICBpZiAoXG4gICAgc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiZcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXG4gICkge1xuICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XG4gICAgcmVyZW5kZXIoKTtcbiAgfVxufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdHdlYWstb3duZWQgc2V0dGluZ3MgcGFnZS4gVGhlIHJ1bnRpbWUgaW5qZWN0cyBhIHNpZGViYXIgZW50cnlcbiAqIHVuZGVyIGEgXCJUV0VBS1NcIiBncm91cCBoZWFkZXIgKHdoaWNoIGFwcGVhcnMgb25seSB3aGVuIGF0IGxlYXN0IG9uZSBwYWdlXG4gKiBpcyByZWdpc3RlcmVkKSBhbmQgcm91dGVzIGNsaWNrcyB0byB0aGUgcGFnZSdzIGByZW5kZXIocm9vdClgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQYWdlKFxuICB0d2Vha0lkOiBzdHJpbmcsXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LFxuICBwYWdlOiBTZXR0aW5nc1BhZ2UsXG4pOiBTZXR0aW5nc0hhbmRsZSB7XG4gIGNvbnN0IGlkID0gcGFnZS5pZDsgLy8gYWxyZWFkeSBuYW1lc3BhY2VkIGJ5IHR3ZWFrLWhvc3QgYXMgYCR7dHdlYWtJZH06JHtwYWdlLmlkfWBcbiAgY29uc3QgZW50cnk6IFJlZ2lzdGVyZWRQYWdlID0geyBpZCwgdHdlYWtJZCwgbWFuaWZlc3QsIHBhZ2UgfTtcbiAgc3RhdGUucGFnZXMuc2V0KGlkLCBlbnRyeSk7XG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XG4gIHN5bmNQYWdlc0dyb3VwKCk7XG4gIC8vIElmIHRoZSB1c2VyIHdhcyBhbHJlYWR5IG9uIHRoaXMgcGFnZSAoaG90IHJlbG9hZCksIHJlLW1vdW50IGl0cyBib2R5LlxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICByZXJlbmRlcigpO1xuICB9XG4gIHJldHVybiB7XG4gICAgdW5yZWdpc3RlcjogKCkgPT4ge1xuICAgICAgY29uc3QgZSA9IHN0YXRlLnBhZ2VzLmdldChpZCk7XG4gICAgICBpZiAoIWUpIHJldHVybjtcbiAgICAgIHRyeSB7XG4gICAgICAgIGUudGVhcmRvd24/LigpO1xuICAgICAgfSBjYXRjaCB7fVxuICAgICAgc3RhdGUucGFnZXMuZGVsZXRlKGlkKTtcbiAgICAgIHN5bmNQYWdlc0dyb3VwKCk7XG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcbiAgICAgICAgcmVzdG9yZUNvZGV4VmlldygpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBDYWxsZWQgYnkgdGhlIHR3ZWFrIGhvc3QgYWZ0ZXIgZmV0Y2hpbmcgdGhlIHR3ZWFrIGxpc3QgZnJvbSBtYWluLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldExpc3RlZFR3ZWFrcyhsaXN0OiBMaXN0ZWRUd2Vha1tdKTogdm9pZCB7XG4gIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IGxpc3Q7XG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSByZXJlbmRlcigpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaW5qZWN0aW9uIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiB0cnlJbmplY3QoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zR3JvdXAgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcbiAgaWYgKCFpdGVtc0dyb3VwKSB7XG4gICAgc2NoZWR1bGVTZXR0aW5nc1N1cmZhY2VIaWRkZW4oKTtcbiAgICBwbG9nKFwic2lkZWJhciBub3QgZm91bmRcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIpIHtcbiAgICBjbGVhclRpbWVvdXQoc3RhdGUuc2V0dGluZ3NTdXJmYWNlSGlkZVRpbWVyKTtcbiAgICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBudWxsO1xuICB9XG4gIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUodHJ1ZSwgXCJzaWRlYmFyLWZvdW5kXCIpO1xuICAvLyBDb2RleCdzIGl0ZW1zIGdyb3VwIGxpdmVzIGluc2lkZSBhbiBvdXRlciB3cmFwcGVyIHRoYXQncyBhbHJlYWR5IHN0eWxlZFxuICAvLyB0byBob2xkIG11bHRpcGxlIGdyb3VwcyAoYGZsZXggZmxleC1jb2wgZ2FwLTEgZ2FwLTBgKS4gV2UgaW5qZWN0IG91clxuICAvLyBncm91cCBhcyBhIHNpYmxpbmcgc28gdGhlIG5hdHVyYWwgZ2FwLTEgYWN0cyBhcyBvdXIgdmlzdWFsIHNlcGFyYXRvci5cbiAgY29uc3Qgb3V0ZXIgPSBpdGVtc0dyb3VwLnBhcmVudEVsZW1lbnQgPz8gaXRlbXNHcm91cDtcbiAgc3RhdGUuc2lkZWJhclJvb3QgPSBvdXRlcjtcblxuICBpZiAoc3RhdGUubmF2R3JvdXAgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUubmF2R3JvdXApKSB7XG4gICAgc3luY1BhZ2VzR3JvdXAoKTtcbiAgICAvLyBDb2RleCByZS1yZW5kZXJzIGl0cyBuYXRpdmUgc2lkZWJhciBidXR0b25zIG9uIGl0cyBvd24gc3RhdGUgY2hhbmdlcy5cbiAgICAvLyBJZiBvbmUgb2Ygb3VyIHBhZ2VzIGlzIGFjdGl2ZSwgcmUtc3RyaXAgQ29kZXgncyBhY3RpdmUgc3R5bGluZyBzb1xuICAgIC8vIEdlbmVyYWwgZG9lc24ndCByZWFwcGVhciBhcyBzZWxlY3RlZC5cbiAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZSAhPT0gbnVsbCkgc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKHRydWUpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFNpZGViYXIgd2FzIGVpdGhlciBmcmVzaGx5IG1vdW50ZWQgKFNldHRpbmdzIGp1c3Qgb3BlbmVkKSBvciByZS1tb3VudGVkXG4gIC8vIChjbG9zZWQgYW5kIHJlLW9wZW5lZCwgb3IgbmF2aWdhdGVkIGF3YXkgYW5kIGJhY2spLiBJbiBhbGwgb2YgdGhvc2VcbiAgLy8gY2FzZXMgQ29kZXggcmVzZXRzIHRvIGl0cyBkZWZhdWx0IHBhZ2UgKEdlbmVyYWwpLCBidXQgb3VyIGluLW1lbW9yeVxuICAvLyBgYWN0aXZlUGFnZWAgbWF5IHN0aWxsIHJlZmVyZW5jZSB0aGUgbGFzdCB0d2Vhay9wYWdlIHRoZSB1c2VyIGhhZCBvcGVuXG4gIC8vIFx1MjAxNCB3aGljaCB3b3VsZCBjYXVzZSB0aGF0IG5hdiBidXR0b24gdG8gcmVuZGVyIHdpdGggdGhlIGFjdGl2ZSBzdHlsaW5nXG4gIC8vIGV2ZW4gdGhvdWdoIENvZGV4IGlzIHNob3dpbmcgR2VuZXJhbC4gQ2xlYXIgaXQgc28gYHN5bmNQYWdlc0dyb3VwYCAvXG4gIC8vIGBzZXROYXZBY3RpdmVgIHN0YXJ0IGZyb20gYSBuZXV0cmFsIHN0YXRlLiBUaGUgcGFuZWxIb3N0IHJlZmVyZW5jZSBpc1xuICAvLyBhbHNvIHN0YWxlIChpdHMgRE9NIHdhcyBkaXNjYXJkZWQgd2l0aCB0aGUgcHJldmlvdXMgY29udGVudCBhcmVhKS5cbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwgfHwgc3RhdGUucGFuZWxIb3N0ICE9PSBudWxsKSB7XG4gICAgcGxvZyhcInNpZGViYXIgcmUtbW91bnQgZGV0ZWN0ZWQ7IGNsZWFyaW5nIHN0YWxlIGFjdGl2ZSBzdGF0ZVwiLCB7XG4gICAgICBwcmV2QWN0aXZlOiBzdGF0ZS5hY3RpdmVQYWdlLFxuICAgIH0pO1xuICAgIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xuICAgIHN0YXRlLnBhbmVsSG9zdCA9IG51bGw7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgR3JvdXAgY29udGFpbmVyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBjb25zdCBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwibmF2LWdyb3VwXCI7XG4gIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcblxuICAvLyBcdTI1MDBcdTI1MDAgU2VjdGlvbiBoZWFkZXIgLyBzdWJ0aXRsZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgLy8gQ29kZXggZG9lc24ndCAoY3VycmVudGx5KSBzaGlwIGEgc2lkZWJhciBncm91cCBoZWFkZXIsIHNvIHdlIG1pcnJvciB0aGVcbiAgLy8gdmlzdWFsIHdlaWdodCBvZiBgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kYCB1cHBlcmNhc2UgbGFiZWxzXG4gIC8vIHVzZWQgZWxzZXdoZXJlIGluIHRoZWlyIFVJLiBQYWRkaW5nIG1hdGNoZXMgdGhlIGBweC1yb3cteGAgb2YgaXRlbXMuXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlci5jbGFzc05hbWUgPVxuICAgIFwicHgtcm93LXggcHQtMiBwYi0xIHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmQgc2VsZWN0LW5vbmVcIjtcbiAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJDb2RleCBQbHVzIFBsdXNcIjtcbiAgZ3JvdXAuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgVHdvIHNpZGViYXIgaXRlbXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IGNvbmZpZ0J0biA9IG1ha2VTaWRlYmFySXRlbShsb2NhbGl6ZShcIkNvbmZpZ1wiKSwgY29uZmlnSWNvblN2ZygpLCBcImNvbmZpZ1wiKTtcbiAgY29uc3QgdHdlYWtzQnRuID0gbWFrZVNpZGViYXJJdGVtKGxvY2FsaXplKFwiVHdlYWtzXCIpLCB0d2Vha3NJY29uU3ZnKCksIFwidHdlYWtzXCIpO1xuXG4gIGNvbmZpZ0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcImNvbmZpZ1wiIH0pO1xuICB9KTtcbiAgdHdlYWtzQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwidHdlYWtzXCIgfSk7XG4gIH0pO1xuXG4gIGdyb3VwLmFwcGVuZENoaWxkKGNvbmZpZ0J0bik7XG4gIGdyb3VwLmFwcGVuZENoaWxkKHR3ZWFrc0J0bik7XG4gIG91dGVyLmFwcGVuZENoaWxkKGdyb3VwKTtcblxuICBzdGF0ZS5uYXZHcm91cCA9IGdyb3VwO1xuICBzdGF0ZS5uYXZCdXR0b25zID0geyBjb25maWc6IGNvbmZpZ0J0biwgdHdlYWtzOiB0d2Vha3NCdG4gfTtcbiAgcGxvZyhcIm5hdiBncm91cCBpbmplY3RlZFwiLCB7IG91dGVyVGFnOiBvdXRlci50YWdOYW1lIH0pO1xuICBzeW5jUGFnZXNHcm91cCgpO1xufVxuXG5mdW5jdGlvbiBzY2hlZHVsZVNldHRpbmdzU3VyZmFjZUhpZGRlbigpOiB2b2lkIHtcbiAgaWYgKCFzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlIHx8IHN0YXRlLnNldHRpbmdzU3VyZmFjZUhpZGVUaW1lcikgcmV0dXJuO1xuICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VIaWRlVGltZXIgPSBudWxsO1xuICAgIGlmIChmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKSkgcmV0dXJuO1xuICAgIGlmIChpc1NldHRpbmdzVGV4dFZpc2libGUoKSkgcmV0dXJuO1xuICAgIHNldFNldHRpbmdzU3VyZmFjZVZpc2libGUoZmFsc2UsIFwic2lkZWJhci1ub3QtZm91bmRcIik7XG4gIH0sIDE1MDApO1xufVxuXG5mdW5jdGlvbiBpc1NldHRpbmdzVGV4dFZpc2libGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiAhIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWNvZGV4cHA9XCJuYXYtZ3JvdXBcIl0nKTtcbn1cblxuZnVuY3Rpb24gc2V0U2V0dGluZ3NTdXJmYWNlVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuLCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuICBpZiAoc3RhdGUuc2V0dGluZ3NTdXJmYWNlVmlzaWJsZSA9PT0gdmlzaWJsZSkgcmV0dXJuO1xuICBzdGF0ZS5zZXR0aW5nc1N1cmZhY2VWaXNpYmxlID0gdmlzaWJsZTtcbiAgdHJ5IHtcbiAgICAod2luZG93IGFzIFdpbmRvdyAmIHsgX19jb2RleHBwU2V0dGluZ3NTdXJmYWNlVmlzaWJsZT86IGJvb2xlYW4gfSkuX19jb2RleHBwU2V0dGluZ3NTdXJmYWNlVmlzaWJsZSA9IHZpc2libGU7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmRhdGFzZXQuY29kZXhwcFNldHRpbmdzU3VyZmFjZSA9IHZpc2libGUgPyBcInRydWVcIiA6IFwiZmFsc2VcIjtcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBDdXN0b21FdmVudChcImNvZGV4cHA6c2V0dGluZ3Mtc3VyZmFjZVwiLCB7XG4gICAgICAgIGRldGFpbDogeyB2aXNpYmxlLCByZWFzb24gfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2gge31cbiAgcGxvZyhcInNldHRpbmdzIHN1cmZhY2VcIiwgeyB2aXNpYmxlLCByZWFzb24sIHVybDogbG9jYXRpb24uaHJlZiB9KTtcbn1cblxuLyoqXG4gKiBSZW5kZXIgKG9yIHJlLXJlbmRlcikgdGhlIHNlY29uZCBzaWRlYmFyIGdyb3VwIG9mIHBlci10d2VhayBwYWdlcy4gVGhlXG4gKiBncm91cCBpcyBjcmVhdGVkIGxhemlseSBhbmQgcmVtb3ZlZCB3aGVuIHRoZSBsYXN0IHBhZ2UgdW5yZWdpc3RlcnMsIHNvXG4gKiB1c2VycyB3aXRoIG5vIHBhZ2UtcmVnaXN0ZXJpbmcgdHdlYWtzIG5ldmVyIHNlZSBhbiBlbXB0eSBcIlR3ZWFrc1wiIGhlYWRlci5cbiAqL1xuZnVuY3Rpb24gc3luY1BhZ2VzR3JvdXAoKTogdm9pZCB7XG4gIGNvbnN0IG91dGVyID0gc3RhdGUuc2lkZWJhclJvb3Q7XG4gIGlmICghb3V0ZXIpIHJldHVybjtcbiAgY29uc3QgcGFnZXMgPSBbLi4uc3RhdGUucGFnZXMudmFsdWVzKCldO1xuXG4gIC8vIEJ1aWxkIGEgZGV0ZXJtaW5pc3RpYyBmaW5nZXJwcmludCBvZiB0aGUgZGVzaXJlZCBncm91cCBzdGF0ZS4gSWYgdGhlXG4gIC8vIGN1cnJlbnQgRE9NIGdyb3VwIGFscmVhZHkgbWF0Y2hlcywgdGhpcyBpcyBhIG5vLW9wIFx1MjAxNCBjcml0aWNhbCwgYmVjYXVzZVxuICAvLyBzeW5jUGFnZXNHcm91cCBpcyBjYWxsZWQgb24gZXZlcnkgTXV0YXRpb25PYnNlcnZlciB0aWNrIGFuZCBhbnkgRE9NXG4gIC8vIHdyaXRlIHdvdWxkIHJlLXRyaWdnZXIgdGhhdCBvYnNlcnZlciAoaW5maW5pdGUgbG9vcCwgYXBwIGZyZWV6ZSkuXG4gIGNvbnN0IGRlc2lyZWRLZXkgPSBwYWdlcy5sZW5ndGggPT09IDBcbiAgICA/IFwiRU1QVFlcIlxuICAgIDogcGFnZXMubWFwKChwKSA9PiBgJHtwLmlkfXwke2xvY2FsaXplKHAucGFnZS50aXRsZSl9fCR7cC5wYWdlLmljb25TdmcgPz8gXCJcIn1gKS5qb2luKFwiXFxuXCIpO1xuICBjb25zdCBncm91cEF0dGFjaGVkID0gISFzdGF0ZS5wYWdlc0dyb3VwICYmIG91dGVyLmNvbnRhaW5zKHN0YXRlLnBhZ2VzR3JvdXApO1xuICBpZiAoc3RhdGUucGFnZXNHcm91cEtleSA9PT0gZGVzaXJlZEtleSAmJiAocGFnZXMubGVuZ3RoID09PSAwID8gIWdyb3VwQXR0YWNoZWQgOiBncm91cEF0dGFjaGVkKSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwYWdlcy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoc3RhdGUucGFnZXNHcm91cCkge1xuICAgICAgc3RhdGUucGFnZXNHcm91cC5yZW1vdmUoKTtcbiAgICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcbiAgICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgZ3JvdXAgPSBzdGF0ZS5wYWdlc0dyb3VwO1xuICBpZiAoIWdyb3VwIHx8ICFvdXRlci5jb250YWlucyhncm91cCkpIHtcbiAgICBncm91cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JvdXAuZGF0YXNldC5jb2RleHBwID0gXCJwYWdlcy1ncm91cFwiO1xuICAgIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcbiAgICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGhlYWRlci5jbGFzc05hbWUgPVxuICAgICAgXCJweC1yb3cteCBwdC0yIHBiLTEgdGV4dC1bMTFweF0gZm9udC1tZWRpdW0gdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVyIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBzZWxlY3Qtbm9uZVwiO1xuICAgIGhlYWRlci50ZXh0Q29udGVudCA9IGxvY2FsaXplKFwiVHdlYWtzXCIpO1xuICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XG4gICAgb3V0ZXIuYXBwZW5kQ2hpbGQoZ3JvdXApO1xuICAgIHN0YXRlLnBhZ2VzR3JvdXAgPSBncm91cDtcbiAgfSBlbHNlIHtcbiAgICAvLyBTdHJpcCBwcmlvciBidXR0b25zIChrZWVwIHRoZSBoZWFkZXIgYXQgaW5kZXggMCkuXG4gICAgd2hpbGUgKGdyb3VwLmNoaWxkcmVuLmxlbmd0aCA+IDEpIGdyb3VwLnJlbW92ZUNoaWxkKGdyb3VwLmxhc3RDaGlsZCEpO1xuICB9XG5cbiAgZm9yIChjb25zdCBwIG9mIHBhZ2VzKSB7XG4gICAgY29uc3QgaWNvbiA9IHAucGFnZS5pY29uU3ZnID8/IGRlZmF1bHRQYWdlSWNvblN2ZygpO1xuICAgIGNvbnN0IGJ0biA9IG1ha2VTaWRlYmFySXRlbShsb2NhbGl6ZShwLnBhZ2UudGl0bGUpLCBpY29uKTtcbiAgICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi1wYWdlLSR7cC5pZH1gO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBhY3RpdmF0ZVBhZ2UoeyBraW5kOiBcInJlZ2lzdGVyZWRcIiwgaWQ6IHAuaWQgfSk7XG4gICAgfSk7XG4gICAgcC5uYXZCdXR0b24gPSBidG47XG4gICAgZ3JvdXAuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgfVxuICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcbiAgcGxvZyhcInBhZ2VzIGdyb3VwIHN5bmNlZFwiLCB7XG4gICAgY291bnQ6IHBhZ2VzLmxlbmd0aCxcbiAgICBpZHM6IHBhZ2VzLm1hcCgocCkgPT4gcC5pZCksXG4gIH0pO1xuICAvLyBSZWZsZWN0IGN1cnJlbnQgYWN0aXZlIHN0YXRlIGFjcm9zcyB0aGUgcmVidWlsdCBidXR0b25zLlxuICBzZXROYXZBY3RpdmUoc3RhdGUuYWN0aXZlUGFnZSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VTaWRlYmFySXRlbShcbiAgbGFiZWw6IHN0cmluZyxcbiAgaWNvblN2Zzogc3RyaW5nLFxuICBkYXRhS2V5ID0gbGFiZWwudG9Mb3dlckNhc2UoKSxcbik6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgLy8gQ2xhc3Mgc3RyaW5nIGNvcGllZCB2ZXJiYXRpbSBmcm9tIENvZGV4J3Mgc2lkZWJhciBidXR0b25zIChHZW5lcmFsIGV0YykuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmRhdGFzZXQuY29kZXhwcCA9IGBuYXYtJHtkYXRhS2V5fWA7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIGxhYmVsKTtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJmb2N1cy12aXNpYmxlOm91dGxpbmUtdG9rZW4tYm9yZGVyIHJlbGF0aXZlIHB4LXJvdy14IHB5LXJvdy15IGN1cnNvci1pbnRlcmFjdGlvbiBzaHJpbmstMCBpdGVtcy1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgdGV4dC1sZWZ0IHRleHQtc20gZm9jdXMtdmlzaWJsZTpvdXRsaW5lIGZvY3VzLXZpc2libGU6b3V0bGluZS0yIGZvY3VzLXZpc2libGU6b3V0bGluZS1vZmZzZXQtMiBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS01MCBnYXAtMiBmbGV4IHctZnVsbCBob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZm9udC1ub3JtYWxcIjtcblxuICBjb25zdCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGlubmVyLmNsYXNzTmFtZSA9XG4gICAgXCJmbGV4IG1pbi13LTAgaXRlbXMtY2VudGVyIHRleHQtYmFzZSBnYXAtMiBmbGV4LTEgdGV4dC10b2tlbi1mb3JlZ3JvdW5kXCI7XG4gIGlubmVyLmlubmVySFRNTCA9IGAke2ljb25Tdmd9PHNwYW4gY2xhc3M9XCJ0cnVuY2F0ZVwiPiR7bGFiZWx9PC9zcGFuPmA7XG4gIGJ0bi5hcHBlbmRDaGlsZChpbm5lcik7XG4gIHJldHVybiBidG47XG59XG5cbi8qKiBJbnRlcm5hbCBrZXkgZm9yIHRoZSBidWlsdC1pbiBuYXYgYnV0dG9ucy4gKi9cbnR5cGUgQnVpbHRpblBhZ2UgPSBcImNvbmZpZ1wiIHwgXCJ0d2Vha3NcIjtcblxuZnVuY3Rpb24gc2V0TmF2QWN0aXZlKGFjdGl2ZTogQWN0aXZlUGFnZSB8IG51bGwpOiB2b2lkIHtcbiAgLy8gQnVpbHQtaW4gKENvbmZpZy9Ud2Vha3MpIGJ1dHRvbnMuXG4gIGlmIChzdGF0ZS5uYXZCdXR0b25zKSB7XG4gICAgY29uc3QgYnVpbHRpbjogQnVpbHRpblBhZ2UgfCBudWxsID1cbiAgICAgIGFjdGl2ZT8ua2luZCA9PT0gXCJjb25maWdcIiA/IFwiY29uZmlnXCIgOlxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInR3ZWFrc1wiID8gXCJ0d2Vha3NcIiA6IG51bGw7XG4gICAgZm9yIChjb25zdCBba2V5LCBidG5dIG9mIE9iamVjdC5lbnRyaWVzKHN0YXRlLm5hdkJ1dHRvbnMpIGFzIFtCdWlsdGluUGFnZSwgSFRNTEJ1dHRvbkVsZW1lbnRdW10pIHtcbiAgICAgIGFwcGx5TmF2QWN0aXZlKGJ0biwga2V5ID09PSBidWlsdGluKTtcbiAgICB9XG4gIH1cbiAgLy8gUGVyLXBhZ2UgcmVnaXN0ZXJlZCBidXR0b25zLlxuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcbiAgICBpZiAoIXAubmF2QnV0dG9uKSBjb250aW51ZTtcbiAgICBjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgYWN0aXZlLmlkID09PSBwLmlkO1xuICAgIGFwcGx5TmF2QWN0aXZlKHAubmF2QnV0dG9uLCBpc0FjdGl2ZSk7XG4gIH1cbiAgLy8gQ29kZXgncyBvd24gc2lkZWJhciBidXR0b25zIChHZW5lcmFsLCBBcHBlYXJhbmNlLCBldGMpLiBXaGVuIG9uZSBvZlxuICAvLyBvdXIgcGFnZXMgaXMgYWN0aXZlLCBDb2RleCBzdGlsbCBoYXMgYXJpYS1jdXJyZW50PVwicGFnZVwiIGFuZCB0aGVcbiAgLy8gYWN0aXZlLWJnIGNsYXNzIG9uIHdoaWNoZXZlciBpdGVtIGl0IGNvbnNpZGVyZWQgdGhlIHJvdXRlIFx1MjAxNCB0eXBpY2FsbHlcbiAgLy8gR2VuZXJhbC4gVGhhdCBtYWtlcyBib3RoIGJ1dHRvbnMgbG9vayBzZWxlY3RlZC4gU3RyaXAgQ29kZXgncyBhY3RpdmVcbiAgLy8gc3R5bGluZyB3aGlsZSBvbmUgb2Ygb3VycyBpcyBhY3RpdmU7IHJlc3RvcmUgaXQgd2hlbiBub25lIGlzLlxuICBzeW5jQ29kZXhOYXRpdmVOYXZBY3RpdmUoYWN0aXZlICE9PSBudWxsKTtcbn1cblxuLyoqXG4gKiBNdXRlIENvZGV4J3Mgb3duIGFjdGl2ZS1zdGF0ZSBzdHlsaW5nIG9uIGl0cyBzaWRlYmFyIGJ1dHRvbnMuIFdlIGRvbid0XG4gKiB0b3VjaCBDb2RleCdzIFJlYWN0IHN0YXRlIFx1MjAxNCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIG5hdGl2ZSBpdGVtLCBDb2RleFxuICogcmUtcmVuZGVycyB0aGUgYnV0dG9ucyBhbmQgcmUtYXBwbGllcyBpdHMgb3duIGNvcnJlY3Qgc3RhdGUsIHRoZW4gb3VyXG4gKiBzaWRlYmFyLWNsaWNrIGxpc3RlbmVyIGZpcmVzIGByZXN0b3JlQ29kZXhWaWV3YCAod2hpY2ggY2FsbHMgYmFjayBpbnRvXG4gKiBgc2V0TmF2QWN0aXZlKG51bGwpYCBhbmQgbGV0cyBDb2RleCdzIHN0eWxpbmcgc3RhbmQpLlxuICpcbiAqIGBtdXRlPXRydWVgICBcdTIxOTIgc3RyaXAgYXJpYS1jdXJyZW50IGFuZCBzd2FwIGFjdGl2ZSBiZyBcdTIxOTIgaG92ZXIgYmdcbiAqIGBtdXRlPWZhbHNlYCBcdTIxOTIgbm8tb3AgKENvZGV4J3Mgb3duIHJlLXJlbmRlciBhbHJlYWR5IHJlc3RvcmVkIHRoaW5ncylcbiAqL1xuZnVuY3Rpb24gc3luY0NvZGV4TmF0aXZlTmF2QWN0aXZlKG11dGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKCFtdXRlKSByZXR1cm47XG4gIGNvbnN0IHJvb3QgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKCFyb290KSByZXR1cm47XG4gIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXCJidXR0b25cIikpO1xuICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XG4gICAgLy8gU2tpcCBvdXIgb3duIGJ1dHRvbnMuXG4gICAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xuICAgIGlmIChidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpID09PSBcInBhZ2VcIikge1xuICAgICAgYnRuLnJlbW92ZUF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiKTtcbiAgICB9XG4gICAgaWYgKGJ0bi5jbGFzc0xpc3QuY29udGFpbnMoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIikpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5TmF2QWN0aXZlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIGlmIChhY3RpdmUpIHtcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcbiAgICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIiwgXCJwYWdlXCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiLCBcImZvbnQtbm9ybWFsXCIpO1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgICBpbm5lclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xuICAgICAgfVxuICAgIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGFjdGl2YXRpb24gXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIGFjdGl2YXRlUGFnZShwYWdlOiBBY3RpdmVQYWdlKTogdm9pZCB7XG4gIGNvbnN0IGNvbnRlbnQgPSBmaW5kQ29udGVudEFyZWEoKTtcbiAgaWYgKCFjb250ZW50KSB7XG4gICAgcGxvZyhcImFjdGl2YXRlOiBjb250ZW50IGFyZWEgbm90IGZvdW5kXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBzdGF0ZS5hY3RpdmVQYWdlID0gcGFnZTtcbiAgcGxvZyhcImFjdGl2YXRlXCIsIHsgcGFnZSB9KTtcblxuICAvLyBIaWRlIENvZGV4J3MgY29udGVudCBjaGlsZHJlbiwgc2hvdyBvdXJzLlxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oY29udGVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuID0gY2hpbGQuc3R5bGUuZGlzcGxheSB8fCBcIlwiO1xuICAgIH1cbiAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIH1cbiAgbGV0IHBhbmVsID0gY29udGVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtY29kZXhwcD1cInR3ZWFrcy1wYW5lbFwiXScpO1xuICBpZiAoIXBhbmVsKSB7XG4gICAgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHBhbmVsLmRhdGFzZXQuY29kZXhwcCA9IFwidHdlYWtzLXBhbmVsXCI7XG4gICAgcGFuZWwuc3R5bGUuY3NzVGV4dCA9IFwid2lkdGg6MTAwJTtoZWlnaHQ6MTAwJTtvdmVyZmxvdzphdXRvO1wiO1xuICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICB9XG4gIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gIHN0YXRlLnBhbmVsSG9zdCA9IHBhbmVsO1xuICByZXJlbmRlcigpO1xuICBzZXROYXZBY3RpdmUocGFnZSk7XG4gIC8vIHJlc3RvcmUgQ29kZXgncyB2aWV3LiBSZS1yZWdpc3RlciBpZiBuZWVkZWQuXG4gIGNvbnN0IHNpZGViYXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcbiAgaWYgKHNpZGViYXIpIHtcbiAgICBpZiAoc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyKSB7XG4gICAgICBzaWRlYmFyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsIHRydWUpO1xuICAgIH1cbiAgICBjb25zdCBoYW5kbGVyID0gKGU6IEV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuICAgICAgaWYgKHN0YXRlLm5hdkdyb3VwPy5jb250YWlucyh0YXJnZXQpKSByZXR1cm47IC8vIG91ciBidXR0b25zXG4gICAgICBpZiAoc3RhdGUucGFnZXNHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgcGFnZSBidXR0b25zXG4gICAgICByZXN0b3JlQ29kZXhWaWV3KCk7XG4gICAgfTtcbiAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIgPSBoYW5kbGVyO1xuICAgIHNpZGViYXIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZXIsIHRydWUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlc3RvcmVDb2RleFZpZXcoKTogdm9pZCB7XG4gIHBsb2coXCJyZXN0b3JlIGNvZGV4IHZpZXdcIik7XG4gIGNvbnN0IGNvbnRlbnQgPSBmaW5kQ29udGVudEFyZWEoKTtcbiAgaWYgKCFjb250ZW50KSByZXR1cm47XG4gIGlmIChzdGF0ZS5wYW5lbEhvc3QpIHN0YXRlLnBhbmVsSG9zdC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XG4gICAgaWYgKGNoaWxkID09PSBzdGF0ZS5wYW5lbEhvc3QpIGNvbnRpbnVlO1xuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY2hpbGQuc3R5bGUuZGlzcGxheSA9IGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbjtcbiAgICAgIGRlbGV0ZSBjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW47XG4gICAgfVxuICB9XG4gIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xuICBzZXROYXZBY3RpdmUobnVsbCk7XG4gIGlmIChzdGF0ZS5zaWRlYmFyUm9vdCAmJiBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIpIHtcbiAgICBzdGF0ZS5zaWRlYmFyUm9vdC5yZW1vdmVFdmVudExpc3RlbmVyKFxuICAgICAgXCJjbGlja1wiLFxuICAgICAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyLFxuICAgICAgdHJ1ZSxcbiAgICApO1xuICAgIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlciA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVyZW5kZXIoKTogdm9pZCB7XG4gIGlmICghc3RhdGUuYWN0aXZlUGFnZSkgcmV0dXJuO1xuICBjb25zdCBob3N0ID0gc3RhdGUucGFuZWxIb3N0O1xuICBpZiAoIWhvc3QpIHJldHVybjtcbiAgaG9zdC5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIGNvbnN0IGFwID0gc3RhdGUuYWN0aXZlUGFnZTtcbiAgaWYgKGFwLmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiKSB7XG4gICAgY29uc3QgZW50cnkgPSBzdGF0ZS5wYWdlcy5nZXQoYXAuaWQpO1xuICAgIGlmICghZW50cnkpIHtcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgcm9vdCA9IHBhbmVsU2hlbGwoXG4gICAgICBsb2NhbGl6ZShlbnRyeS5wYWdlLnRpdGxlKSxcbiAgICAgIGxvY2FsaXplT3B0aW9uYWwoZW50cnkucGFnZS5kZXNjcmlwdGlvbiksXG4gICAgKTtcbiAgICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICAgIHRyeSB7XG4gICAgICAvLyBUZWFyIGRvd24gYW55IHByaW9yIHJlbmRlciBiZWZvcmUgcmUtcmVuZGVyaW5nIChob3QgcmVsb2FkKS5cbiAgICAgIHRyeSB7IGVudHJ5LnRlYXJkb3duPy4oKTsgfSBjYXRjaCB7fVxuICAgICAgZW50cnkudGVhcmRvd24gPSBudWxsO1xuICAgICAgY29uc3QgcmV0ID0gZW50cnkucGFnZS5yZW5kZXIocm9vdC5zZWN0aW9uc1dyYXApO1xuICAgICAgaWYgKHR5cGVvZiByZXQgPT09IFwiZnVuY3Rpb25cIikgZW50cnkudGVhcmRvd24gPSByZXQ7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGVyci5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tY2hhcnRzLXJlZCB0ZXh0LXNtXCI7XG4gICAgICBlcnIudGV4dENvbnRlbnQgPSBgRXJyb3IgcmVuZGVyaW5nIHBhZ2U6ICR7KGUgYXMgRXJyb3IpLm1lc3NhZ2V9YDtcbiAgICAgIHJvb3Quc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKGVycik7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHRpdGxlID0gYXAua2luZCA9PT0gXCJ0d2Vha3NcIiA/IGxvY2FsaXplKFwiVHdlYWtzXCIpIDogbG9jYWxpemUoXCJDb25maWdcIik7XG4gIGNvbnN0IHN1YnRpdGxlID0gYXAua2luZCA9PT0gXCJ0d2Vha3NcIlxuICAgID8gbG9jYWxpemUoXCJNYW5hZ2UgeW91ciBpbnN0YWxsZWQgQ29kZXgrKyB0d2Vha3MuXCIpXG4gICAgOiBsb2NhbGl6ZShcIkNvbmZpZ3VyZSBDb2RleCsrIGl0c2VsZi5cIik7XG4gIGNvbnN0IHJvb3QgPSBwYW5lbFNoZWxsKHRpdGxlLCBzdWJ0aXRsZSk7XG4gIGhvc3QuYXBwZW5kQ2hpbGQocm9vdC5vdXRlcik7XG4gIGlmIChhcC5raW5kID09PSBcInR3ZWFrc1wiKSByZW5kZXJUd2Vha3NQYWdlKHJvb3Quc2VjdGlvbnNXcmFwKTtcbiAgZWxzZSByZW5kZXJDb25maWdQYWdlKHJvb3Quc2VjdGlvbnNXcmFwKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHBhZ2VzIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiByZW5kZXJDb25maWdQYWdlKHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICBzZWN0aW9uLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMlwiO1xuICBzZWN0aW9uLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIkNvZGV4KysgVXBkYXRlc1wiKSk7XG4gIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICBjb25zdCBsb2FkaW5nID0gcm93U2ltcGxlKFwiTG9hZGluZyB1cGRhdGUgc2V0dGluZ3NcIiwgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIik7XG4gIGNhcmQuYXBwZW5kQ2hpbGQobG9hZGluZyk7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoY2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblxuICB2b2lkIGlwY1JlbmRlcmVyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKVxuICAgIC50aGVuKChjb25maWcpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkLCBjb25maWcgYXMgQ29kZXhQbHVzUGx1c0NvbmZpZyk7XG4gICAgfSlcbiAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJDb3VsZCBub3QgbG9hZCB1cGRhdGUgc2V0dGluZ3NcIiwgU3RyaW5nKGUpKSk7XG4gICAgfSk7XG5cbiAgY29uc3QgbWFpbnRlbmFuY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgbWFpbnRlbmFuY2UuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIk1haW50ZW5hbmNlXCIpKTtcbiAgY29uc3QgbWFpbnRlbmFuY2VDYXJkID0gcm91bmRlZENhcmQoKTtcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKHVuaW5zdGFsbFJvdygpKTtcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKHJlcG9ydEJ1Z1JvdygpKTtcbiAgbWFpbnRlbmFuY2UuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2VDYXJkKTtcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKG1haW50ZW5hbmNlKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkOiBIVE1MRWxlbWVudCwgY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogdm9pZCB7XG4gIGNhcmQuYXBwZW5kQ2hpbGQoYXV0b1VwZGF0ZVJvdyhjb25maWcpKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChjaGVja0ZvclVwZGF0ZXNSb3coY29uZmlnLnVwZGF0ZUNoZWNrKSk7XG4gIGlmIChjb25maWcudXBkYXRlQ2hlY2spIGNhcmQuYXBwZW5kQ2hpbGQocmVsZWFzZU5vdGVzUm93KGNvbmZpZy51cGRhdGVDaGVjaykpO1xufVxuXG5mdW5jdGlvbiBhdXRvVXBkYXRlUm93KGNvbmZpZzogQ29kZXhQbHVzUGx1c0NvbmZpZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gIHRpdGxlLnRleHRDb250ZW50ID0gXCJBdXRvbWF0aWNhbGx5IHJlZnJlc2ggQ29kZXgrK1wiO1xuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgZGVzYy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgbWluLXctMCB0ZXh0LXNtXCI7XG4gIGRlc2MudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcbiAgICBcIkluc3RhbGxlZCB2ZXJzaW9uIHZ7dmVyc2lvbn0uIFRoZSB3YXRjaGVyIGNhbiByZWZyZXNoIHRoZSBDb2RleCsrIHJ1bnRpbWUgYWZ0ZXIgeW91IHJlcnVuIHRoZSBHaXRIdWIgaW5zdGFsbGVyLlwiLFxuICAgIHsgdmVyc2lvbjogY29uZmlnLnZlcnNpb24gfSxcbiAgKTtcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIGxlZnQuYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcbiAgcm93LmFwcGVuZENoaWxkKFxuICAgIHN3aXRjaENvbnRyb2woY29uZmlnLmF1dG9VcGRhdGUsIGFzeW5jIChuZXh0KSA9PiB7XG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnNldC1hdXRvLXVwZGF0ZVwiLCBuZXh0KTtcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzUm93KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0xXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBjaGVjaz8udXBkYXRlQXZhaWxhYmxlID8gXCJDb2RleCsrIHVwZGF0ZSBhdmFpbGFibGVcIiA6IFwiQ29kZXgrKyBpcyB1cCB0byBkYXRlXCI7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IHVwZGF0ZVN1bW1hcnkoY2hlY2spO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcbiAgaWYgKGNoZWNrPy5yZWxlYXNlVXJsKSB7XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJSZWxlYXNlIE5vdGVzXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgY2hlY2sucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIkNoZWNrIE5vd1wiLCAoKSA9PiB7XG4gICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiMC42NVwiO1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKVxuICAgICAgICAudGhlbigobmV4dCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGNhcmQgPSByb3cucGFyZW50RWxlbWVudDtcbiAgICAgICAgICBpZiAoIWNhcmQpIHJldHVybjtcbiAgICAgICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKS50aGVuKChjb25maWcpID0+IHtcbiAgICAgICAgICAgIHJlbmRlckNvZGV4UGx1c1BsdXNDb25maWcoY2FyZCwge1xuICAgICAgICAgICAgICAuLi4oY29uZmlnIGFzIENvZGV4UGx1c1BsdXNDb25maWcpLFxuICAgICAgICAgICAgICB1cGRhdGVDaGVjazogbmV4dCBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2ssXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKChlKSA9PiBwbG9nKFwiQ29kZXgrKyB1cGRhdGUgY2hlY2sgZmFpbGVkXCIsIFN0cmluZyhlKSkpXG4gICAgICAgIC5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICByb3cuc3R5bGUub3BhY2l0eSA9IFwiXCI7XG4gICAgICAgIH0pO1xuICAgIH0pLFxuICApO1xuICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlbGVhc2VOb3Rlc1JvdyhjaGVjazogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yIHAtM1wiO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwidGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiTGF0ZXN0IHJlbGVhc2Ugbm90ZXNcIjtcbiAgcm93LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwcmVcIik7XG4gIGJvZHkuY2xhc3NOYW1lID1cbiAgICBcIm1heC1oLTQ4IG92ZXJmbG93LWF1dG8gd2hpdGVzcGFjZS1wcmUtd3JhcCByb3VuZGVkLW1kIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBwLTMgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIGJvZHkudGV4dENvbnRlbnQgPSBjaGVjay5yZWxlYXNlTm90ZXM/LnRyaW0oKSB8fCBjaGVjay5lcnJvciB8fCBcIk5vIHJlbGVhc2Ugbm90ZXMgYXZhaWxhYmxlLlwiO1xuICByb3cuYXBwZW5kQ2hpbGQoYm9keSk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN1bW1hcnkoY2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB8IG51bGwpOiBzdHJpbmcge1xuICBpZiAoIWNoZWNrKSByZXR1cm4gbG9jYWxpemUoXCJObyB1cGRhdGUgY2hlY2sgaGFzIHJ1biB5ZXQuXCIpO1xuICBjb25zdCBsYXRlc3QgPSBjaGVjay5sYXRlc3RWZXJzaW9uXG4gICAgPyBsb2NhbGl6ZShcIkxhdGVzdCB2e3ZlcnNpb259LiBcIiwgeyB2ZXJzaW9uOiBjaGVjay5sYXRlc3RWZXJzaW9uIH0pXG4gICAgOiBcIlwiO1xuICBjb25zdCBjaGVja2VkID0gbG9jYWxpemUoXCJDaGVja2VkIHtkYXRlfS5cIiwge1xuICAgIGRhdGU6IG5ldyBEYXRlKGNoZWNrLmNoZWNrZWRBdCkudG9Mb2NhbGVTdHJpbmcoKSxcbiAgfSk7XG4gIGlmIChjaGVjay5lcnJvcikgcmV0dXJuIGAke2xhdGVzdH0ke2NoZWNrZWR9ICR7Y2hlY2suZXJyb3J9YDtcbiAgcmV0dXJuIGAke2xhdGVzdH0ke2NoZWNrZWR9YDtcbn1cblxuZnVuY3Rpb24gdW5pbnN0YWxsUm93KCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gYWN0aW9uUm93KFxuICAgIFwiVW5pbnN0YWxsIENvZGV4KytcIixcbiAgICBcIkNvcGllcyB0aGUgdW5pbnN0YWxsIGNvbW1hbmQuIFJ1biBpdCBmcm9tIGEgdGVybWluYWwgYWZ0ZXIgcXVpdHRpbmcgQ29kZXguXCIsXG4gICk7XG4gIGNvbnN0IGFjdGlvbiA9IHJvdy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIltkYXRhLWNvZGV4cHAtcm93LWFjdGlvbnNdXCIpO1xuICBhY3Rpb24/LmFwcGVuZENoaWxkKFxuICAgIGNvbXBhY3RCdXR0b24oXCJDb3B5IENvbW1hbmRcIiwgKCkgPT4ge1xuICAgICAgdm9pZCBpcGNSZW5kZXJlclxuICAgICAgICAuaW52b2tlKFwiY29kZXhwcDpjb3B5LXRleHRcIiwgXCJub2RlIH4vLmNvZGV4LXBsdXNwbHVzL3NvdXJjZS9wYWNrYWdlcy9pbnN0YWxsZXIvZGlzdC9jbGkuanMgdW5pbnN0YWxsXCIpXG4gICAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcImNvcHkgdW5pbnN0YWxsIGNvbW1hbmQgZmFpbGVkXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pLFxuICApO1xuICByZXR1cm4gcm93O1xufVxuXG5mdW5jdGlvbiByZXBvcnRCdWdSb3coKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBhY3Rpb25Sb3coXG4gICAgXCJSZXBvcnQgYSBidWdcIixcbiAgICBcIk9wZW4gYSBHaXRIdWIgaXNzdWUgd2l0aCBydW50aW1lLCBpbnN0YWxsZXIsIG9yIHR3ZWFrLW1hbmFnZXIgZGV0YWlscy5cIixcbiAgKTtcbiAgY29uc3QgYWN0aW9uID0gcm93LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiW2RhdGEtY29kZXhwcC1yb3ctYWN0aW9uc11cIik7XG4gIGFjdGlvbj8uYXBwZW5kQ2hpbGQoXG4gICAgY29tcGFjdEJ1dHRvbihcIk9wZW4gSXNzdWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgdGl0bGUgPSBlbmNvZGVVUklDb21wb25lbnQoXCJbQnVnXTogXCIpO1xuICAgICAgY29uc3QgYm9keSA9IGVuY29kZVVSSUNvbXBvbmVudChcbiAgICAgICAgW1xuICAgICAgICAgIFwiIyMgV2hhdCBoYXBwZW5lZD9cIixcbiAgICAgICAgICBcIlwiLFxuICAgICAgICAgIFwiIyMgU3RlcHMgdG8gcmVwcm9kdWNlXCIsXG4gICAgICAgICAgXCIxLiBcIixcbiAgICAgICAgICBcIlwiLFxuICAgICAgICAgIFwiIyMgRW52aXJvbm1lbnRcIixcbiAgICAgICAgICBcIi0gQ29kZXgrKyB2ZXJzaW9uOiBcIixcbiAgICAgICAgICBcIi0gQ29kZXggYXBwIHZlcnNpb246IFwiLFxuICAgICAgICAgIFwiLSBPUzogXCIsXG4gICAgICAgICAgXCJcIixcbiAgICAgICAgICBcIiMjIExvZ3NcIixcbiAgICAgICAgICBcIkF0dGFjaCByZWxldmFudCBsaW5lcyBmcm9tIHRoZSBDb2RleCsrIGxvZyBkaXJlY3RvcnkuXCIsXG4gICAgICAgIF0uam9pbihcIlxcblwiKSxcbiAgICAgICk7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIixcbiAgICAgICAgYGh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXc/dGl0bGU9JHt0aXRsZX0mYm9keT0ke2JvZHl9YCxcbiAgICAgICk7XG4gICAgfSksXG4gICk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIGFjdGlvblJvdyh0aXRsZVRleHQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gIHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUodGl0bGVUZXh0KTtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICBkZXNjLnRleHRDb250ZW50ID0gbG9jYWxpemUoZGVzY3JpcHRpb24pO1xuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclR3ZWFrc1BhZ2Uoc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBvcGVuQnRuID0gb3BlbkluUGxhY2VCdXR0b24oXCJPcGVuIFR3ZWFrcyBGb2xkZXJcIiwgKCkgPT4ge1xuICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgdHdlYWtzUGF0aCgpKTtcbiAgfSk7XG4gIGNvbnN0IHJlbG9hZEJ0biA9IG9wZW5JblBsYWNlQnV0dG9uKFwiRm9yY2UgUmVsb2FkXCIsICgpID0+IHtcbiAgICAvLyBGdWxsIHBhZ2UgcmVmcmVzaCBcdTIwMTQgc2FtZSBhcyBEZXZUb29scyBDbWQtUiAvIG91ciBDRFAgUGFnZS5yZWxvYWQuXG4gICAgLy8gTWFpbiByZS1kaXNjb3ZlcnMgdHdlYWtzIGZpcnN0IHNvIHRoZSBuZXcgcmVuZGVyZXIgY29tZXMgdXAgd2l0aCBhXG4gICAgLy8gZnJlc2ggdHdlYWsgc2V0OyB0aGVuIGxvY2F0aW9uLnJlbG9hZCByZXN0YXJ0cyB0aGUgcmVuZGVyZXIgc28gdGhlXG4gICAgLy8gcHJlbG9hZCByZS1pbml0aWFsaXplcyBhZ2FpbnN0IGl0LlxuICAgIHZvaWQgaXBjUmVuZGVyZXJcbiAgICAgIC5pbnZva2UoXCJjb2RleHBwOnJlbG9hZC10d2Vha3NcIilcbiAgICAgIC5jYXRjaCgoZSkgPT4gcGxvZyhcImZvcmNlIHJlbG9hZCAobWFpbikgZmFpbGVkXCIsIFN0cmluZyhlKSkpXG4gICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgIGxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgfSk7XG4gIH0pO1xuICAvLyBEcm9wIHRoZSBkaWFnb25hbC1hcnJvdyBpY29uIGZyb20gdGhlIHJlbG9hZCBidXR0b24gXHUyMDE0IGl0IGltcGxpZXMgXCJvcGVuXG4gIC8vIG91dCBvZiBhcHBcIiB3aGljaCBkb2Vzbid0IGZpdC4gUmVwbGFjZSBpdHMgdHJhaWxpbmcgc3ZnIHdpdGggYSByZWZyZXNoLlxuICBjb25zdCByZWxvYWRTdmcgPSByZWxvYWRCdG4ucXVlcnlTZWxlY3RvcihcInN2Z1wiKTtcbiAgaWYgKHJlbG9hZFN2Zykge1xuICAgIHJlbG9hZFN2Zy5vdXRlckhUTUwgPVxuICAgICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi0yeHNcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICAgIGA8cGF0aCBkPVwiTTQgMTBhNiA2IDAgMCAxIDEwLjI0LTQuMjRMMTYgNy41TTE2IDR2My41aC0zLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgICBgPHBhdGggZD1cIk0xNiAxMGE2IDYgMCAwIDEtMTAuMjQgNC4yNEw0IDEyLjVNNCAxNnYtMy41aDMuNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcbiAgICAgIGA8L3N2Zz5gO1xuICB9XG5cbiAgY29uc3QgdHJhaWxpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0cmFpbGluZy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIHRyYWlsaW5nLmFwcGVuZENoaWxkKHJlbG9hZEJ0bik7XG4gIHRyYWlsaW5nLmFwcGVuZENoaWxkKG9wZW5CdG4pO1xuXG4gIGlmIChzdGF0ZS5saXN0ZWRUd2Vha3MubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3Qgc2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xuICAgIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gICAgc2VjdGlvbi5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJJbnN0YWxsZWQgVHdlYWtzXCIsIHRyYWlsaW5nKSk7XG4gICAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChcbiAgICAgIHJvd1NpbXBsZShcbiAgICAgICAgXCJObyB0d2Vha3MgaW5zdGFsbGVkXCIsXG4gICAgICAgIGxvY2FsaXplKFwiRHJvcCBhIHR3ZWFrIGZvbGRlciBpbnRvIHtwYXRofSBhbmQgcmVsb2FkLlwiLCB7XG4gICAgICAgICAgcGF0aDogdHdlYWtzUGF0aCgpLFxuICAgICAgICB9KSxcbiAgICAgICksXG4gICAgKTtcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKGNhcmQpO1xuICAgIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBHcm91cCByZWdpc3RlcmVkIFNldHRpbmdzU2VjdGlvbnMgYnkgdHdlYWsgaWQgKHByZWZpeCBzcGxpdCBhdCBcIjpcIikuXG4gIGNvbnN0IHNlY3Rpb25zQnlUd2VhayA9IG5ldyBNYXA8c3RyaW5nLCBTZXR0aW5nc1NlY3Rpb25bXT4oKTtcbiAgZm9yIChjb25zdCBzIG9mIHN0YXRlLnNlY3Rpb25zLnZhbHVlcygpKSB7XG4gICAgY29uc3QgdHdlYWtJZCA9IHMuaWQuc3BsaXQoXCI6XCIpWzBdO1xuICAgIGlmICghc2VjdGlvbnNCeVR3ZWFrLmhhcyh0d2Vha0lkKSkgc2VjdGlvbnNCeVR3ZWFrLnNldCh0d2Vha0lkLCBbXSk7XG4gICAgc2VjdGlvbnNCeVR3ZWFrLmdldCh0d2Vha0lkKSEucHVzaChzKTtcbiAgfVxuXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgd3JhcC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgd3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJJbnN0YWxsZWQgVHdlYWtzXCIsIHRyYWlsaW5nKSk7XG5cbiAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gIGZvciAoY29uc3QgdCBvZiBzdGF0ZS5saXN0ZWRUd2Vha3MpIHtcbiAgICBjYXJkLmFwcGVuZENoaWxkKHR3ZWFrUm93KHQsIHNlY3Rpb25zQnlUd2Vhay5nZXQodC5tYW5pZmVzdC5pZCkgPz8gW10pKTtcbiAgfVxuICB3cmFwLmFwcGVuZENoaWxkKGNhcmQpO1xuICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod3JhcCk7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrUm93KHQ6IExpc3RlZFR3ZWFrLCBzZWN0aW9uczogU2V0dGluZ3NTZWN0aW9uW10pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IG0gPSB0Lm1hbmlmZXN0O1xuXG4gIC8vIE91dGVyIGNlbGwgd3JhcHMgdGhlIGhlYWRlciByb3cgKyAob3B0aW9uYWwpIG5lc3RlZCBzZWN0aW9ucyBzbyB0aGVcbiAgLy8gcGFyZW50IGNhcmQncyBkaXZpZGVyIHN0YXlzIGJldHdlZW4gKnR3ZWFrcyosIG5vdCBiZXR3ZWVuIGhlYWRlciBhbmRcbiAgLy8gYm9keSBvZiB0aGUgc2FtZSB0d2Vhay5cbiAgY29uc3QgY2VsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGNlbGwuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sXCI7XG4gIGlmICghdC5lbmFibGVkKSBjZWxsLnN0eWxlLm9wYWNpdHkgPSBcIjAuN1wiO1xuXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlci5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xuXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBpdGVtcy1zdGFydCBnYXAtM1wiO1xuXG4gIC8vIFx1MjUwMFx1MjUwMCBBdmF0YXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IGF2YXRhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGF2YXRhci5jbGFzc05hbWUgPVxuICAgIFwiZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBvdmVyZmxvdy1oaWRkZW4gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBhdmF0YXIuc3R5bGUud2lkdGggPSBcIjU2cHhcIjtcbiAgYXZhdGFyLnN0eWxlLmhlaWdodCA9IFwiNTZweFwiO1xuICBhdmF0YXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJ2YXIoLS1jb2xvci10b2tlbi1iZy1mb2csIHRyYW5zcGFyZW50KVwiO1xuICBpZiAobS5pY29uVXJsKSB7XG4gICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICBpbWcuYWx0ID0gXCJcIjtcbiAgICBpbWcuY2xhc3NOYW1lID0gXCJzaXplLWZ1bGwgb2JqZWN0LWNvbnRhaW5cIjtcbiAgICAvLyBJbml0aWFsOiBzaG93IGZhbGxiYWNrIGluaXRpYWwgaW4gY2FzZSB0aGUgaWNvbiBmYWlscyB0byBsb2FkLlxuICAgIGNvbnN0IGluaXRpYWwgPSAobS5uYW1lPy5bMF0gPz8gXCI/XCIpLnRvVXBwZXJDYXNlKCk7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICBmYWxsYmFjay5jbGFzc05hbWUgPSBcInRleHQteGwgZm9udC1tZWRpdW1cIjtcbiAgICBmYWxsYmFjay50ZXh0Q29udGVudCA9IGluaXRpYWw7XG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGZhbGxiYWNrKTtcbiAgICBpbWcuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIGltZy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcbiAgICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB9KTtcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcbiAgICAgIGltZy5yZW1vdmUoKTtcbiAgICB9KTtcbiAgICB2b2lkIHJlc29sdmVJY29uVXJsKG0uaWNvblVybCwgdC5kaXIpLnRoZW4oKHVybCkgPT4ge1xuICAgICAgaWYgKHVybCkgaW1nLnNyYyA9IHVybDtcbiAgICAgIGVsc2UgaW1nLnJlbW92ZSgpO1xuICAgIH0pO1xuICAgIGF2YXRhci5hcHBlbmRDaGlsZChpbWcpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGluaXRpYWwgPSAobS5uYW1lPy5bMF0gPz8gXCI/XCIpLnRvVXBwZXJDYXNlKCk7XG4gICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgIHNwYW4uY2xhc3NOYW1lID0gXCJ0ZXh0LXhsIGZvbnQtbWVkaXVtXCI7XG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGluaXRpYWw7XG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKHNwYW4pO1xuICB9XG4gIGxlZnQuYXBwZW5kQ2hpbGQoYXZhdGFyKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgVGV4dCBzdGFjayBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMC41XCI7XG5cbiAgY29uc3QgdGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZVJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBuYW1lLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gIG5hbWUudGV4dENvbnRlbnQgPSBtLm5hbWU7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKG5hbWUpO1xuICBpZiAobS52ZXJzaW9uKSB7XG4gICAgY29uc3QgdmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgdmVyLmNsYXNzTmFtZSA9XG4gICAgICBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgdGV4dC14cyBmb250LW5vcm1hbCB0YWJ1bGFyLW51bXNcIjtcbiAgICB2ZXIudGV4dENvbnRlbnQgPSBgdiR7bS52ZXJzaW9ufWA7XG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQodmVyKTtcbiAgfVxuICBpZiAodC51cGRhdGU/LnVwZGF0ZUF2YWlsYWJsZSkge1xuICAgIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgYmFkZ2UuY2xhc3NOYW1lID1cbiAgICAgIFwicm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0yIHB5LTAuNSB0ZXh0LVsxMXB4XSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICAgIGJhZGdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoXCJVcGRhdGUgQXZhaWxhYmxlXCIpO1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKGJhZGdlKTtcbiAgfVxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XG5cbiAgaWYgKG0uZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgICBkZXNjLnRleHRDb250ZW50ID0gbS5kZXNjcmlwdGlvbjtcbiAgICBzdGFjay5hcHBlbmRDaGlsZChkZXNjKTtcbiAgfVxuXG4gIGNvbnN0IG1ldGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBtZXRhLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gIGNvbnN0IGF1dGhvckVsID0gcmVuZGVyQXV0aG9yKG0uYXV0aG9yKTtcbiAgaWYgKGF1dGhvckVsKSBtZXRhLmFwcGVuZENoaWxkKGF1dGhvckVsKTtcbiAgaWYgKG0uZ2l0aHViUmVwbykge1xuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xuICAgIGNvbnN0IHJlcG8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIHJlcG8udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgcmVwby5jbGFzc05hbWUgPSBcImlubGluZS1mbGV4IHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XG4gICAgcmVwby50ZXh0Q29udGVudCA9IG0uZ2l0aHViUmVwbztcbiAgICByZXBvLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGBodHRwczovL2dpdGh1Yi5jb20vJHttLmdpdGh1YlJlcG99YCk7XG4gICAgfSk7XG4gICAgbWV0YS5hcHBlbmRDaGlsZChyZXBvKTtcbiAgfVxuICBpZiAobS5ob21lcGFnZSkge1xuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xuICAgIGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbiAgICBsaW5rLmhyZWYgPSBtLmhvbWVwYWdlO1xuICAgIGxpbmsudGFyZ2V0ID0gXCJfYmxhbmtcIjtcbiAgICBsaW5rLnJlbCA9IFwibm9yZWZlcnJlclwiO1xuICAgIGxpbmsuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xuICAgIGxpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcIkhvbWVwYWdlXCIpO1xuICAgIG1ldGEuYXBwZW5kQ2hpbGQobGluayk7XG4gIH1cbiAgaWYgKG1ldGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkgc3RhY2suYXBwZW5kQ2hpbGQobWV0YSk7XG5cbiAgLy8gVGFncyByb3cgKGlmIGFueSkgXHUyMDE0IHNtYWxsIHBpbGwgY2hpcHMgYmVsb3cgdGhlIG1ldGEgbGluZS5cbiAgaWYgKG0udGFncyAmJiBtLnRhZ3MubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRhZ3NSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhZ3NSb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIgZ2FwLTEgcHQtMC41XCI7XG4gICAgZm9yIChjb25zdCB0YWcgb2YgbS50YWdzKSB7XG4gICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBwaWxsLmNsYXNzTmFtZSA9XG4gICAgICAgIFwicm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0yIHB5LTAuNSB0ZXh0LVsxMXB4XSB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XG4gICAgICBwaWxsLnRleHRDb250ZW50ID0gdGFnO1xuICAgICAgdGFnc1Jvdy5hcHBlbmRDaGlsZChwaWxsKTtcbiAgICB9XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQodGFnc1Jvdyk7XG4gIH1cblxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxlZnQpO1xuXG4gIC8vIFx1MjUwMFx1MjUwMCBUb2dnbGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcmlnaHQuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMiBwdC0wLjVcIjtcbiAgaWYgKHQudXBkYXRlPy51cGRhdGVBdmFpbGFibGUgJiYgdC51cGRhdGUucmVsZWFzZVVybCkge1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKFxuICAgICAgY29tcGFjdEJ1dHRvbihcIlJldmlldyBSZWxlYXNlXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgdC51cGRhdGUhLnJlbGVhc2VVcmwpO1xuICAgICAgfSksXG4gICAgKTtcbiAgfVxuICByaWdodC5hcHBlbmRDaGlsZChcbiAgICBzd2l0Y2hDb250cm9sKHQuZW5hYmxlZCwgYXN5bmMgKG5leHQpID0+IHtcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6c2V0LXR3ZWFrLWVuYWJsZWRcIiwgbS5pZCwgbmV4dCk7XG4gICAgICAvLyBUaGUgbWFpbiBwcm9jZXNzIGJyb2FkY2FzdHMgYSByZWxvYWQgd2hpY2ggd2lsbCByZS1mZXRjaCB0aGUgbGlzdFxuICAgICAgLy8gYW5kIHJlLXJlbmRlci4gV2UgZG9uJ3Qgb3B0aW1pc3RpY2FsbHkgdG9nZ2xlIHRvIGF2b2lkIGRyaWZ0LlxuICAgIH0pLFxuICApO1xuICBoZWFkZXIuYXBwZW5kQ2hpbGQocmlnaHQpO1xuXG4gIGNlbGwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICAvLyBJZiB0aGUgdHdlYWsgaXMgZW5hYmxlZCBhbmQgcmVnaXN0ZXJlZCBzZXR0aW5ncyBzZWN0aW9ucywgcmVuZGVyIHRob3NlXG4gIC8vIGJvZGllcyBhcyBuZXN0ZWQgcm93cyBiZW5lYXRoIHRoZSBoZWFkZXIgaW5zaWRlIHRoZSBzYW1lIGNlbGwuXG4gIGlmICh0LmVuYWJsZWQgJiYgc2VjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG5lc3RlZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbmVzdGVkLmNsYXNzTmFtZSA9XG4gICAgICBcImZsZXggZmxleC1jb2wgZGl2aWRlLXktWzAuNXB4XSBkaXZpZGUtdG9rZW4tYm9yZGVyIGJvcmRlci10LVswLjVweF0gYm9yZGVyLXRva2VuLWJvcmRlclwiO1xuICAgIGZvciAoY29uc3QgcyBvZiBzZWN0aW9ucykge1xuICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBib2R5LmNsYXNzTmFtZSA9IFwicC0zXCI7XG4gICAgICB0cnkge1xuICAgICAgICBzLnJlbmRlcihib2R5KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgYm9keS50ZXh0Q29udGVudCA9IGBFcnJvciByZW5kZXJpbmcgdHdlYWsgc2VjdGlvbjogJHsoZSBhcyBFcnJvcikubWVzc2FnZX1gO1xuICAgICAgfVxuICAgICAgbmVzdGVkLmFwcGVuZENoaWxkKGJvZHkpO1xuICAgIH1cbiAgICBjZWxsLmFwcGVuZENoaWxkKG5lc3RlZCk7XG4gIH1cblxuICByZXR1cm4gY2VsbDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQXV0aG9yKGF1dGhvcjogVHdlYWtNYW5pZmVzdFtcImF1dGhvclwiXSk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIGlmICghYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICB3cmFwLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIGdhcC0xXCI7XG4gIGlmICh0eXBlb2YgYXV0aG9yID09PSBcInN0cmluZ1wiKSB7XG4gICAgd3JhcC50ZXh0Q29udGVudCA9IGBieSAke2F1dGhvcn1gO1xuICAgIHJldHVybiB3cmFwO1xuICB9XG4gIHdyYXAuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJieSBcIikpO1xuICBpZiAoYXV0aG9yLnVybCkge1xuICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbiAgICBhLmhyZWYgPSBhdXRob3IudXJsO1xuICAgIGEudGFyZ2V0ID0gXCJfYmxhbmtcIjtcbiAgICBhLnJlbCA9IFwibm9yZWZlcnJlclwiO1xuICAgIGEuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xuICAgIGEudGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcbiAgICB3cmFwLmFwcGVuZENoaWxkKGEpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICBzcGFuLnRleHRDb250ZW50ID0gYXV0aG9yLm5hbWU7XG4gICAgd3JhcC5hcHBlbmRDaGlsZChzcGFuKTtcbiAgfVxuICByZXR1cm4gd3JhcDtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGNvbXBvbmVudHMgXHUyNTAwXHUyNTAwXG5cbi8qKiBUaGUgZnVsbCBwYW5lbCBzaGVsbCAodG9vbGJhciArIHNjcm9sbCArIGhlYWRpbmcgKyBzZWN0aW9ucyB3cmFwKS4gKi9cbmZ1bmN0aW9uIHBhbmVsU2hlbGwoXG4gIHRpdGxlOiBzdHJpbmcsXG4gIHN1YnRpdGxlPzogc3RyaW5nLFxuKTogeyBvdXRlcjogSFRNTEVsZW1lbnQ7IHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQgfSB7XG4gIGNvbnN0IG91dGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgb3V0ZXIuY2xhc3NOYW1lID0gXCJtYWluLXN1cmZhY2UgZmxleCBoLWZ1bGwgbWluLWgtMCBmbGV4LWNvbFwiO1xuXG4gIGNvbnN0IHRvb2xiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0b29sYmFyLmNsYXNzTmFtZSA9XG4gICAgXCJkcmFnZ2FibGUgZmxleCBpdGVtcy1jZW50ZXIgcHgtcGFuZWwgZWxlY3Ryb246aC10b29sYmFyIGV4dGVuc2lvbjpoLXRvb2xiYXItc21cIjtcbiAgb3V0ZXIuYXBwZW5kQ2hpbGQodG9vbGJhcik7XG5cbiAgY29uc3Qgc2Nyb2xsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2Nyb2xsLmNsYXNzTmFtZSA9IFwiZmxleC0xIG92ZXJmbG93LXktYXV0byBwLXBhbmVsXCI7XG4gIG91dGVyLmFwcGVuZENoaWxkKHNjcm9sbCk7XG5cbiAgY29uc3QgaW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBpbm5lci5jbGFzc05hbWUgPVxuICAgIFwibXgtYXV0byBmbGV4IHctZnVsbCBmbGV4LWNvbCBtYXgtdy0yeGwgZWxlY3Ryb246bWluLXctW2NhbGMoMzIwcHgqdmFyKC0tY29kZXgtd2luZG93LXpvb20pKV1cIjtcbiAgc2Nyb2xsLmFwcGVuZENoaWxkKGlubmVyKTtcblxuICBjb25zdCBoZWFkZXJXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyV3JhcC5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtMyBwYi1wYW5lbFwiO1xuICBjb25zdCBoZWFkZXJJbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGhlYWRlcklubmVyLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBmbGV4LWNvbCBnYXAtMS41IHBiLXBhbmVsXCI7XG4gIGNvbnN0IGhlYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBoZWFkaW5nLmNsYXNzTmFtZSA9IFwiZWxlY3Ryb246aGVhZGluZy1sZyBoZWFkaW5nLWJhc2UgdHJ1bmNhdGVcIjtcbiAgaGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKHRpdGxlKTtcbiAgaGVhZGVySW5uZXIuYXBwZW5kQ2hpbGQoaGVhZGluZyk7XG4gIGlmIChzdWJ0aXRsZSkge1xuICAgIGNvbnN0IHN1YiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgc3ViLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSB0ZXh0LXNtXCI7XG4gICAgc3ViLnRleHRDb250ZW50ID0gbG9jYWxpemUoc3VidGl0bGUpO1xuICAgIGhlYWRlcklubmVyLmFwcGVuZENoaWxkKHN1Yik7XG4gIH1cbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJJbm5lcik7XG4gIGlubmVyLmFwcGVuZENoaWxkKGhlYWRlcldyYXApO1xuXG4gIGNvbnN0IHNlY3Rpb25zV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHNlY3Rpb25zV3JhcC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLVt2YXIoLS1wYWRkaW5nLXBhbmVsKV1cIjtcbiAgaW5uZXIuYXBwZW5kQ2hpbGQoc2VjdGlvbnNXcmFwKTtcblxuICByZXR1cm4geyBvdXRlciwgc2VjdGlvbnNXcmFwIH07XG59XG5cbmZ1bmN0aW9uIHNlY3Rpb25UaXRsZSh0ZXh0OiBzdHJpbmcsIHRyYWlsaW5nPzogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID1cbiAgICBcImZsZXggaC10b29sYmFyIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTIgcHgtMCBweS0wXCI7XG4gIGNvbnN0IHRpdGxlSW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZUlubmVyLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBmbGV4LWNvbCBnYXAtMVwiO1xuICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdC5jbGFzc05hbWUgPSBcInRleHQtYmFzZSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0LnRleHRDb250ZW50ID0gbG9jYWxpemUodGV4dCk7XG4gIHRpdGxlSW5uZXIuYXBwZW5kQ2hpbGQodCk7XG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlSW5uZXIpO1xuICBpZiAodHJhaWxpbmcpIHtcbiAgICBjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcmlnaHQuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKHRyYWlsaW5nKTtcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZChyaWdodCk7XG4gIH1cbiAgcmV0dXJuIHRpdGxlUm93O1xufVxuXG4vKipcbiAqIENvZGV4J3MgXCJPcGVuIGNvbmZpZy50b21sXCItc3R5bGUgdHJhaWxpbmcgYnV0dG9uOiBnaG9zdCBib3JkZXIsIG11dGVkXG4gKiBsYWJlbCwgdG9wLXJpZ2h0IGRpYWdvbmFsIGFycm93IGljb24uIE1hcmt1cCBtaXJyb3JzIENvbmZpZ3VyYXRpb24gcGFuZWwuXG4gKi9cbmZ1bmN0aW9uIG9wZW5JblBsYWNlQnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTEgYm9yZGVyIHdoaXRlc3BhY2Utbm93cmFwIGZvY3VzOm91dGxpbmUtbm9uZSBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MCByb3VuZGVkLWxnIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBlbmFibGVkOmhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBkYXRhLVtzdGF0ZT1vcGVuXTpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgYm9yZGVyLXRyYW5zcGFyZW50IGgtdG9rZW4tYnV0dG9uLWNvbXBvc2VyIHB4LTIgcHktMCB0ZXh0LWJhc2UgbGVhZGluZy1bMThweF1cIjtcbiAgY29uc3QgbG9jYWxpemVkTGFiZWwgPSBsb2NhbGl6ZShsYWJlbCk7XG4gIGJ0bi5pbm5lckhUTUwgPVxuICAgIGAke2xvY2FsaXplZExhYmVsfWAgK1xuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tMnhzXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTQuMzM0OSAxMy4zMzAxVjYuNjA2NDVMNS40NzA2NSAxNS40NzA3QzUuMjEwOTUgMTUuNzMwNCA0Ljc4ODk1IDE1LjczMDQgNC41MjkyNSAxNS40NzA3QzQuMjY5NTUgMTUuMjExIDQuMjY5NTUgMTQuNzg5IDQuNTI5MjUgMTQuNTI5M0wxMy4zOTM1IDUuNjY1MDRINi42NjAxMUM2LjI5Mjg0IDUuNjY1MDQgNS45OTUwNyA1LjM2NzI3IDUuOTk1MDcgNUM1Ljk5NTA3IDQuNjMyNzMgNi4yOTI4NCA0LjMzNDk2IDYuNjYwMTEgNC4zMzQ5NkgxNC45OTk5TDE1LjEzMzcgNC4zNDg2M0MxNS40MzY5IDQuNDEwNTcgMTUuNjY1IDQuNjc4NTcgMTUuNjY1IDVWMTMuMzMwMUMxNS42NjQ5IDEzLjY5NzMgMTUuMzY3MiAxMy45OTUxIDE0Ljk5OTkgMTMuOTk1MUMxNC42MzI3IDEzLjk5NTEgMTQuMzM1IDEzLjY5NzMgMTQuMzM0OSAxMy4zMzAxWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj48L3BhdGg+YCArXG4gICAgYDwvc3ZnPmA7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBvbkNsaWNrKCk7XG4gIH0pO1xuICByZXR1cm4gYnRuO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0QnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gaW5saW5lLWZsZXggaC04IGl0ZW1zLWNlbnRlciB3aGl0ZXNwYWNlLW5vd3JhcCByb3VuZGVkLWxnIGJvcmRlciBweC0yIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnkgZW5hYmxlZDpob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkIGRpc2FibGVkOm9wYWNpdHktNDBcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gbG9jYWxpemUobGFiZWwpO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgb25DbGljaygpO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gcm91bmRlZENhcmQoKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY2FyZC5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciBmbGV4IGZsZXgtY29sIGRpdmlkZS15LVswLjVweF0gZGl2aWRlLXRva2VuLWJvcmRlciByb3VuZGVkLWxnIGJvcmRlclwiO1xuICBjYXJkLnNldEF0dHJpYnV0ZShcbiAgICBcInN0eWxlXCIsXG4gICAgXCJiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS1jb2xvci1iYWNrZ3JvdW5kLXBhbmVsLCB2YXIoLS1jb2xvci10b2tlbi1iZy1mb2cpKTtcIixcbiAgKTtcbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIHJvd1NpbXBsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgZ2FwLTNcIjtcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xuICBpZiAodGl0bGUpIHtcbiAgICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0LmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gICAgdC50ZXh0Q29udGVudCA9IGxvY2FsaXplKHRpdGxlKTtcbiAgICBzdGFjay5hcHBlbmRDaGlsZCh0KTtcbiAgfVxuICBpZiAoZGVzY3JpcHRpb24pIHtcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgICBkLnRleHRDb250ZW50ID0gbG9jYWxpemUoZGVzY3JpcHRpb24pO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKGQpO1xuICB9XG4gIGxlZnQuYXBwZW5kQ2hpbGQoc3RhY2spO1xuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XG4gIHJldHVybiByb3c7XG59XG5cbi8qKlxuICogQ29kZXgtc3R5bGVkIHRvZ2dsZSBzd2l0Y2guIE1hcmt1cCBtaXJyb3JzIHRoZSBHZW5lcmFsID4gUGVybWlzc2lvbnMgcm93XG4gKiBzd2l0Y2ggd2UgY2FwdHVyZWQ6IG91dGVyIGJ1dHRvbiAocm9sZT1zd2l0Y2gpLCBpbm5lciBwaWxsLCBzbGlkaW5nIGtub2IuXG4gKi9cbmZ1bmN0aW9uIHN3aXRjaENvbnRyb2woXG4gIGluaXRpYWw6IGJvb2xlYW4sXG4gIG9uQ2hhbmdlOiAobmV4dDogYm9vbGVhbikgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJzd2l0Y2hcIik7XG5cbiAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjb25zdCBrbm9iID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGtub2IuY2xhc3NOYW1lID1cbiAgICBcInJvdW5kZWQtZnVsbCBib3JkZXIgYm9yZGVyLVtjb2xvcjp2YXIoLS1ncmF5LTApXSBiZy1bY29sb3I6dmFyKC0tZ3JheS0wKV0gc2hhZG93LXNtIHRyYW5zaXRpb24tdHJhbnNmb3JtIGR1cmF0aW9uLTIwMCBlYXNlLW91dCBoLTQgdy00XCI7XG4gIHBpbGwuYXBwZW5kQ2hpbGQoa25vYik7XG5cbiAgY29uc3QgYXBwbHkgPSAob246IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1jaGVja2VkXCIsIFN0cmluZyhvbikpO1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XG4gICAgYnRuLmNsYXNzTmFtZSA9XG4gICAgICBcImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciB0ZXh0LXNtIGZvY3VzLXZpc2libGU6b3V0bGluZS1ub25lIGZvY3VzLXZpc2libGU6cmluZy0yIGZvY3VzLXZpc2libGU6cmluZy10b2tlbi1mb2N1cy1ib3JkZXIgZm9jdXMtdmlzaWJsZTpyb3VuZGVkLWZ1bGwgY3Vyc29yLWludGVyYWN0aW9uXCI7XG4gICAgcGlsbC5jbGFzc05hbWUgPSBgcmVsYXRpdmUgaW5saW5lLWZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIHJvdW5kZWQtZnVsbCB0cmFuc2l0aW9uLWNvbG9ycyBkdXJhdGlvbi0yMDAgZWFzZS1vdXQgaC01IHctOCAke1xuICAgICAgb24gPyBcImJnLXRva2VuLWNoYXJ0cy1ibHVlXCIgOiBcImJnLXRva2VuLWZvcmVncm91bmQvMjBcIlxuICAgIH1gO1xuICAgIHBpbGwuZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xuICAgIGtub2IuZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xuICAgIGtub2Iuc3R5bGUudHJhbnNmb3JtID0gb24gPyBcInRyYW5zbGF0ZVgoMTRweClcIiA6IFwidHJhbnNsYXRlWCgycHgpXCI7XG4gIH07XG4gIGFwcGx5KGluaXRpYWwpO1xuXG4gIGJ0bi5hcHBlbmRDaGlsZChwaWxsKTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnN0IG5leHQgPSBidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jaGVja2VkXCIpICE9PSBcInRydWVcIjtcbiAgICBhcHBseShuZXh0KTtcbiAgICBidG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBvbkNoYW5nZShuZXh0KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgYnRuLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gZG90KCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBzLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XG4gIHMudGV4dENvbnRlbnQgPSBcIlx1MDBCN1wiO1xuICByZXR1cm4gcztcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGljb25zIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBjb25maWdJY29uU3ZnKCk6IHN0cmluZyB7XG4gIC8vIFNsaWRlcnMgLyBzZXR0aW5ncyBnbHlwaC4gMjB4MjAgY3VycmVudENvbG9yLlxuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTMgNWg5TTE1IDVoMk0zIDEwaDJNOCAxMGg5TTMgMTVoMTFNMTcgMTVoMFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXG4gICAgYDxjaXJjbGUgY3g9XCIxM1wiIGN5PVwiNVwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xuICAgIGA8Y2lyY2xlIGN4PVwiNlwiIGN5PVwiMTBcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcbiAgICBgPGNpcmNsZSBjeD1cIjE1XCIgY3k9XCIxNVwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrc0ljb25TdmcoKTogc3RyaW5nIHtcbiAgLy8gU3BhcmtsZXMgLyBcIisrXCIgZ2x5cGggZm9yIHR3ZWFrcy5cbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk0xMCAyLjUgTDExLjQgOC42IEwxNy41IDEwIEwxMS40IDExLjQgTDEwIDE3LjUgTDguNiAxMS40IEwyLjUgMTAgTDguNiA4LjYgWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTUuNSAzIEwxNiA1IEwxOCA1LjUgTDE2IDYgTDE1LjUgOCBMMTUgNiBMMTMgNS41IEwxNSA1IFpcIiBmaWxsPVwiY3VycmVudENvbG9yXCIgb3BhY2l0eT1cIjAuN1wiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0UGFnZUljb25TdmcoKTogc3RyaW5nIHtcbiAgLy8gRG9jdW1lbnQvcGFnZSBnbHlwaCBmb3IgdHdlYWstcmVnaXN0ZXJlZCBwYWdlcyB3aXRob3V0IHRoZWlyIG93biBpY29uLlxuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTUgM2g3bDMgM3YxMWExIDEgMCAwIDEtMSAxSDVhMSAxIDAgMCAxLTEtMVY0YTEgMSAwIDAgMSAxLTFaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTIgM3YzYTEgMSAwIDAgMCAxIDFoMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTcgMTFoNk03IDE0aDRcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVJY29uVXJsKFxuICB1cmw6IHN0cmluZyxcbiAgdHdlYWtEaXI6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICBpZiAoL14oaHR0cHM/OnxkYXRhOikvLnRlc3QodXJsKSkgcmV0dXJuIHVybDtcbiAgLy8gUmVsYXRpdmUgcGF0aCBcdTIxOTIgYXNrIG1haW4gdG8gcmVhZCB0aGUgZmlsZSBhbmQgcmV0dXJuIGEgZGF0YTogVVJMLlxuICAvLyBSZW5kZXJlciBpcyBzYW5kYm94ZWQgc28gZmlsZTovLyB3b24ndCBsb2FkIGRpcmVjdGx5LlxuICBjb25zdCByZWwgPSB1cmwuc3RhcnRzV2l0aChcIi4vXCIpID8gdXJsLnNsaWNlKDIpIDogdXJsO1xuICB0cnkge1xuICAgIHJldHVybiAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgICAgXCJjb2RleHBwOnJlYWQtdHdlYWstYXNzZXRcIixcbiAgICAgIHR3ZWFrRGlyLFxuICAgICAgcmVsLFxuICAgICkpIGFzIHN0cmluZztcbiAgfSBjYXRjaCAoZSkge1xuICAgIHBsb2coXCJpY29uIGxvYWQgZmFpbGVkXCIsIHsgdXJsLCB0d2Vha0RpciwgZXJyOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIERPTSBoZXVyaXN0aWNzIFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgLy8gQW5jaG9yIHN0cmF0ZWd5IGZpcnN0ICh3b3VsZCBiZSBpZGVhbCBpZiBDb2RleCBzd2l0Y2hlcyB0byA8YT4pLlxuICBjb25zdCBsaW5rcyA9IEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MQW5jaG9yRWxlbWVudD4oXCJhW2hyZWYqPScvc2V0dGluZ3MvJ11cIiksXG4gICk7XG4gIGlmIChsaW5rcy5sZW5ndGggPj0gMikge1xuICAgIGxldCBub2RlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBsaW5rc1swXS5wYXJlbnRFbGVtZW50O1xuICAgIHdoaWxlIChub2RlKSB7XG4gICAgICBjb25zdCBpbnNpZGUgPSBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJhW2hyZWYqPScvc2V0dGluZ3MvJ11cIik7XG4gICAgICBpZiAoaW5zaWRlLmxlbmd0aCA+PSBNYXRoLm1heCgyLCBsaW5rcy5sZW5ndGggLSAxKSkgcmV0dXJuIG5vZGU7XG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHN0cnVjdHVyYWwgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXBCeVN0cnVjdHVyZSgpO1xuICBpZiAoc3RydWN0dXJhbCkgcmV0dXJuIHN0cnVjdHVyYWw7XG5cbiAgLy8gTGFzdC1yZXNvcnQgY29tcGF0aWJpbGl0eSBmYWxsYmFjayBmb3Igb2xkZXIgRW5nbGlzaC1vbmx5IGJ1aWxkcy5cbiAgY29uc3QgS05PV04gPSBbXG4gICAgXCJHZW5lcmFsXCIsXG4gICAgXCJBcHBlYXJhbmNlXCIsXG4gICAgXCJDb25maWd1cmF0aW9uXCIsXG4gICAgXCJQZXJzb25hbGl6YXRpb25cIixcbiAgICBcIk1DUCBzZXJ2ZXJzXCIsXG4gICAgXCJNQ1AgU2VydmVyc1wiLFxuICAgIFwiR2l0XCIsXG4gICAgXCJFbnZpcm9ubWVudHNcIixcbiAgXTtcbiAgY29uc3QgbWF0Y2hlczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuICBjb25zdCBhbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICBcImJ1dHRvbiwgYSwgW3JvbGU9J2J1dHRvbiddLCBsaSwgZGl2XCIsXG4gICk7XG4gIGZvciAoY29uc3QgZWwgb2YgQXJyYXkuZnJvbShhbGwpKSB7XG4gICAgY29uc3QgdCA9IChlbC50ZXh0Q29udGVudCA/PyBcIlwiKS50cmltKCk7XG4gICAgaWYgKHQubGVuZ3RoID4gMzApIGNvbnRpbnVlO1xuICAgIGlmIChLTk9XTi5zb21lKChrKSA9PiB0ID09PSBrKSkgbWF0Y2hlcy5wdXNoKGVsKTtcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGggPiA1MCkgYnJlYWs7XG4gIH1cbiAgaWYgKG1hdGNoZXMubGVuZ3RoID49IDIpIHtcbiAgICBsZXQgbm9kZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbWF0Y2hlc1swXS5wYXJlbnRFbGVtZW50O1xuICAgIHdoaWxlIChub2RlKSB7XG4gICAgICBsZXQgY291bnQgPSAwO1xuICAgICAgZm9yIChjb25zdCBtIG9mIG1hdGNoZXMpIGlmIChub2RlLmNvbnRhaW5zKG0pKSBjb3VudCsrO1xuICAgICAgaWYgKGNvdW50ID49IE1hdGgubWluKDMsIG1hdGNoZXMubGVuZ3RoKSkgcmV0dXJuIG5vZGU7XG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZmluZFNpZGViYXJJdGVtc0dyb3VwQnlTdHJ1Y3R1cmUoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcImRpdi5mbGV4LmZsZXgtY29sLmdhcC1weFwiKSxcbiAgKTtcbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICBpZiAoZ3JvdXAuZGF0YXNldC5jb2RleHBwKSBjb250aW51ZTtcbiAgICBjb25zdCBpdGVtcyA9IEFycmF5LmZyb20oZ3JvdXAuY2hpbGRyZW4pLmZpbHRlcihcbiAgICAgIChjaGlsZCk6IGNoaWxkIGlzIEhUTUxFbGVtZW50ID0+XG4gICAgICAgIGNoaWxkIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgJiZcbiAgICAgICAgIWNoaWxkLmRhdGFzZXQuY29kZXhwcCAmJlxuICAgICAgICBbXCJCVVRUT05cIiwgXCJBXCJdLmluY2x1ZGVzKGNoaWxkLnRhZ05hbWUpLFxuICAgICk7XG4gICAgaWYgKFxuICAgICAgaXRlbXMubGVuZ3RoID49IDMgJiZcbiAgICAgIGl0ZW1zLmV2ZXJ5KChpdGVtKSA9PlxuICAgICAgICBpdGVtLmNsYXNzTGlzdC5jb250YWlucyhcInB4LXJvdy14XCIpICYmXG4gICAgICAgIGl0ZW0uY2xhc3NMaXN0LmNvbnRhaW5zKFwicHktcm93LXlcIikgJiZcbiAgICAgICAgaXRlbS5jbGFzc0xpc3QuY29udGFpbnMoXCJ3LWZ1bGxcIiksXG4gICAgICApXG4gICAgKSB7XG4gICAgICByZXR1cm4gZ3JvdXA7XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBmaW5kQ29udGVudEFyZWEoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgY29uc3Qgc2lkZWJhciA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xuICBpZiAoIXNpZGViYXIpIHJldHVybiBudWxsO1xuICBsZXQgcGFyZW50ID0gc2lkZWJhci5wYXJlbnRFbGVtZW50O1xuICB3aGlsZSAocGFyZW50KSB7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKHBhcmVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xuICAgICAgaWYgKGNoaWxkID09PSBzaWRlYmFyIHx8IGNoaWxkLmNvbnRhaW5zKHNpZGViYXIpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHIgPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmIChyLndpZHRoID4gMzAwICYmIHIuaGVpZ2h0ID4gMjAwKSByZXR1cm4gY2hpbGQ7XG4gICAgfVxuICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBtYXliZUR1bXBEb20oKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2lkZWJhciA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xuICAgIGlmIChzaWRlYmFyICYmICFzdGF0ZS5zaWRlYmFyRHVtcGVkKSB7XG4gICAgICBzdGF0ZS5zaWRlYmFyRHVtcGVkID0gdHJ1ZTtcbiAgICAgIGNvbnN0IHNiUm9vdCA9IHNpZGViYXIucGFyZW50RWxlbWVudCA/PyBzaWRlYmFyO1xuICAgICAgcGxvZyhgY29kZXggc2lkZWJhciBIVE1MYCwgc2JSb290Lm91dGVySFRNTC5zbGljZSgwLCAzMjAwMCkpO1xuICAgIH1cbiAgICBjb25zdCBjb250ZW50ID0gZmluZENvbnRlbnRBcmVhKCk7XG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBpZiAoc3RhdGUuZmluZ2VycHJpbnQgIT09IGxvY2F0aW9uLmhyZWYpIHtcbiAgICAgICAgc3RhdGUuZmluZ2VycHJpbnQgPSBsb2NhdGlvbi5ocmVmO1xuICAgICAgICBwbG9nKFwiZG9tIHByb2JlIChubyBjb250ZW50KVwiLCB7XG4gICAgICAgICAgdXJsOiBsb2NhdGlvbi5ocmVmLFxuICAgICAgICAgIHNpZGViYXI6IHNpZGViYXIgPyBkZXNjcmliZShzaWRlYmFyKSA6IG51bGwsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgcGFuZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcbiAgICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xuICAgICAgaWYgKGNoaWxkLnN0eWxlLmRpc3BsYXkgPT09IFwibm9uZVwiKSBjb250aW51ZTtcbiAgICAgIHBhbmVsID0gY2hpbGQ7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY29uc3QgYWN0aXZlTmF2ID0gc2lkZWJhclxuICAgICAgPyBBcnJheS5mcm9tKHNpZGViYXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJidXR0b24sIGFcIikpLmZpbmQoXG4gICAgICAgICAgKGIpID0+XG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiKSA9PT0gXCJwYWdlXCIgfHxcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiZGF0YS1hY3RpdmVcIikgPT09IFwidHJ1ZVwiIHx8XG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImFyaWEtc2VsZWN0ZWRcIikgPT09IFwidHJ1ZVwiIHx8XG4gICAgICAgICAgICBiLmNsYXNzTGlzdC5jb250YWlucyhcImFjdGl2ZVwiKSxcbiAgICAgICAgKVxuICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGhlYWRpbmcgPSBwYW5lbD8ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICBcImgxLCBoMiwgaDMsIFtjbGFzcyo9J2hlYWRpbmcnXVwiLFxuICAgICk7XG4gICAgY29uc3QgZmluZ2VycHJpbnQgPSBgJHthY3RpdmVOYXY/LnRleHRDb250ZW50ID8/IFwiXCJ9fCR7aGVhZGluZz8udGV4dENvbnRlbnQgPz8gXCJcIn18JHtwYW5lbD8uY2hpbGRyZW4ubGVuZ3RoID8/IDB9YDtcbiAgICBpZiAoc3RhdGUuZmluZ2VycHJpbnQgPT09IGZpbmdlcnByaW50KSByZXR1cm47XG4gICAgc3RhdGUuZmluZ2VycHJpbnQgPSBmaW5nZXJwcmludDtcbiAgICBwbG9nKFwiZG9tIHByb2JlXCIsIHtcbiAgICAgIHVybDogbG9jYXRpb24uaHJlZixcbiAgICAgIGFjdGl2ZU5hdjogYWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IG51bGwsXG4gICAgICBoZWFkaW5nOiBoZWFkaW5nPy50ZXh0Q29udGVudD8udHJpbSgpID8/IG51bGwsXG4gICAgICBjb250ZW50OiBkZXNjcmliZShjb250ZW50KSxcbiAgICB9KTtcbiAgICBpZiAocGFuZWwpIHtcbiAgICAgIGNvbnN0IGh0bWwgPSBwYW5lbC5vdXRlckhUTUw7XG4gICAgICBwbG9nKFxuICAgICAgICBgY29kZXggcGFuZWwgSFRNTCAoJHthY3RpdmVOYXY/LnRleHRDb250ZW50Py50cmltKCkgPz8gXCI/XCJ9KWAsXG4gICAgICAgIGh0bWwuc2xpY2UoMCwgMzIwMDApLFxuICAgICAgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBwbG9nKFwiZG9tIHByb2JlIGZhaWxlZFwiLCBTdHJpbmcoZSkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRlc2NyaWJlKGVsOiBIVE1MRWxlbWVudCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHtcbiAgICB0YWc6IGVsLnRhZ05hbWUsXG4gICAgY2xzOiBlbC5jbGFzc05hbWUuc2xpY2UoMCwgMTIwKSxcbiAgICBpZDogZWwuaWQgfHwgdW5kZWZpbmVkLFxuICAgIGNoaWxkcmVuOiBlbC5jaGlsZHJlbi5sZW5ndGgsXG4gICAgcmVjdDogKCgpID0+IHtcbiAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIHJldHVybiB7IHc6IE1hdGgucm91bmQoci53aWR0aCksIGg6IE1hdGgucm91bmQoci5oZWlnaHQpIH07XG4gICAgfSkoKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdHdlYWtzUGF0aCgpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IF9fY29kZXhwcF90d2Vha3NfZGlyX18/OiBzdHJpbmcgfSkuX19jb2RleHBwX3R3ZWFrc19kaXJfXyA/P1xuICAgIFwiPHVzZXIgZGlyPi90d2Vha3NcIlxuICApO1xufVxuIiwgIi8qKlxuICogUmVuZGVyZXItc2lkZSB0d2VhayBob3N0LiBXZTpcbiAqICAgMS4gQXNrIG1haW4gZm9yIHRoZSB0d2VhayBsaXN0ICh3aXRoIHJlc29sdmVkIGVudHJ5IHBhdGgpLlxuICogICAyLiBGb3IgZWFjaCByZW5kZXJlci1zY29wZWQgKG9yIFwiYm90aFwiKSB0d2VhaywgZmV0Y2ggaXRzIHNvdXJjZSB2aWEgSVBDXG4gKiAgICAgIGFuZCBleGVjdXRlIGl0IGFzIGEgQ29tbW9uSlMtc2hhcGVkIGZ1bmN0aW9uLlxuICogICAzLiBQcm92aWRlIGl0IHRoZSByZW5kZXJlciBoYWxmIG9mIHRoZSBBUEkuXG4gKlxuICogQ29kZXggcnVucyB0aGUgcmVuZGVyZXIgd2l0aCBzYW5kYm94OiB0cnVlLCBzbyBOb2RlJ3MgYHJlcXVpcmUoKWAgaXNcbiAqIHJlc3RyaWN0ZWQgdG8gYSB0aW55IHdoaXRlbGlzdCAoZWxlY3Ryb24gKyBhIGZldyBwb2x5ZmlsbHMpLiBUaGF0IG1lYW5zIHdlXG4gKiBjYW5ub3QgYHJlcXVpcmUoKWAgYXJiaXRyYXJ5IHR3ZWFrIGZpbGVzIGZyb20gZGlzay4gSW5zdGVhZCB3ZSBwdWxsIHRoZVxuICogc291cmNlIHN0cmluZyBmcm9tIG1haW4gYW5kIGV2YWx1YXRlIGl0IHdpdGggYG5ldyBGdW5jdGlvbmAgaW5zaWRlIHRoZVxuICogcHJlbG9hZCBjb250ZXh0LiBUd2VhayBhdXRob3JzIHdobyBuZWVkIG5wbSBkZXBzIG11c3QgYnVuZGxlIHRoZW0gaW4uXG4gKi9cblxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdGlvbiwgcmVnaXN0ZXJQYWdlLCBjbGVhclNlY3Rpb25zLCBzZXRMaXN0ZWRUd2Vha3MgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgZmliZXJGb3JOb2RlIH0gZnJvbSBcIi4vcmVhY3QtaG9va1wiO1xuaW1wb3J0IHR5cGUge1xuICBUd2Vha01hbmlmZXN0LFxuICBUd2Vha0FwaSxcbiAgUmVhY3RGaWJlck5vZGUsXG4gIFR3ZWFrLFxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuXG5pbnRlcmZhY2UgTGlzdGVkVHdlYWsge1xuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcbiAgZW50cnk6IHN0cmluZztcbiAgZGlyOiBzdHJpbmc7XG4gIGVudHJ5RXhpc3RzOiBib29sZWFuO1xuICBlbmFibGVkOiBib29sZWFuO1xuICB1cGRhdGU6IHtcbiAgICBjaGVja2VkQXQ6IHN0cmluZztcbiAgICByZXBvOiBzdHJpbmc7XG4gICAgY3VycmVudFZlcnNpb246IHN0cmluZztcbiAgICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xuICAgIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcbiAgICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xuICAgIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcbiAgICBlcnJvcj86IHN0cmluZztcbiAgfSB8IG51bGw7XG59XG5cbmludGVyZmFjZSBVc2VyUGF0aHMge1xuICB1c2VyUm9vdDogc3RyaW5nO1xuICBydW50aW1lRGlyOiBzdHJpbmc7XG4gIHR3ZWFrc0Rpcjogc3RyaW5nO1xuICBsb2dEaXI6IHN0cmluZztcbn1cblxuY29uc3QgbG9hZGVkID0gbmV3IE1hcDxzdHJpbmcsIHsgc3RvcD86ICgpID0+IHZvaWQgfT4oKTtcbmxldCBjYWNoZWRQYXRoczogVXNlclBhdGhzIHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFR3ZWFrSG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgdHdlYWtzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIikpIGFzIExpc3RlZFR3ZWFrW107XG4gIGNvbnN0IHBhdGhzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dXNlci1wYXRoc1wiKSkgYXMgVXNlclBhdGhzO1xuICBjYWNoZWRQYXRocyA9IHBhdGhzO1xuICAvLyBQdXNoIHRoZSBsaXN0IHRvIHRoZSBzZXR0aW5ncyBpbmplY3RvciBzbyB0aGUgVHdlYWtzIHBhZ2UgY2FuIHJlbmRlclxuICAvLyBjYXJkcyBldmVuIGJlZm9yZSBhbnkgdHdlYWsncyBzdGFydCgpIHJ1bnMgKGFuZCBmb3IgZGlzYWJsZWQgdHdlYWtzXG4gIC8vIHRoYXQgd2UgbmV2ZXIgbG9hZCkuXG4gIHNldExpc3RlZFR3ZWFrcyh0d2Vha3MpO1xuICAvLyBTdGFzaCBmb3IgdGhlIHNldHRpbmdzIGluamVjdG9yJ3MgZW1wdHktc3RhdGUgbWVzc2FnZS5cbiAgKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgX19jb2RleHBwX3R3ZWFrc19kaXJfXz86IHN0cmluZyB9KS5fX2NvZGV4cHBfdHdlYWtzX2Rpcl9fID1cbiAgICBwYXRocy50d2Vha3NEaXI7XG5cbiAgZm9yIChjb25zdCB0IG9mIHR3ZWFrcykge1xuICAgIGlmICh0Lm1hbmlmZXN0LnNjb3BlID09PSBcIm1haW5cIikgY29udGludWU7XG4gICAgaWYgKCF0LmVudHJ5RXhpc3RzKSBjb250aW51ZTtcbiAgICBpZiAoIXQuZW5hYmxlZCkgY29udGludWU7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGxvYWRUd2Vhayh0LCBwYXRocyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gdHdlYWsgbG9hZCBmYWlsZWQ6XCIsIHQubWFuaWZlc3QuaWQsIGUpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUuaW5mbyhcbiAgICBgW2NvZGV4LXBsdXNwbHVzXSByZW5kZXJlciBob3N0IGxvYWRlZCAke2xvYWRlZC5zaXplfSB0d2VhayhzKTpgLFxuICAgIFsuLi5sb2FkZWQua2V5cygpXS5qb2luKFwiLCBcIikgfHwgXCIobm9uZSlcIixcbiAgKTtcbiAgaXBjUmVuZGVyZXIuc2VuZChcbiAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcbiAgICBcImluZm9cIixcbiAgICBgcmVuZGVyZXIgaG9zdCBsb2FkZWQgJHtsb2FkZWQuc2l6ZX0gdHdlYWsocyk6ICR7Wy4uLmxvYWRlZC5rZXlzKCldLmpvaW4oXCIsIFwiKSB8fCBcIihub25lKVwifWAsXG4gICk7XG59XG5cbi8qKlxuICogU3RvcCBldmVyeSByZW5kZXJlci1zY29wZSB0d2VhayBzbyBhIHN1YnNlcXVlbnQgYHN0YXJ0VHdlYWtIb3N0KClgIHdpbGxcbiAqIHJlLWV2YWx1YXRlIGZyZXNoIHNvdXJjZS4gTW9kdWxlIGNhY2hlIGlzbid0IHJlbGV2YW50IHNpbmNlIHdlIGV2YWxcbiAqIHNvdXJjZSBzdHJpbmdzIGRpcmVjdGx5IFx1MjAxNCBlYWNoIGxvYWQgY3JlYXRlcyBhIGZyZXNoIHNjb3BlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdGVhcmRvd25Ud2Vha0hvc3QoKTogdm9pZCB7XG4gIGZvciAoY29uc3QgW2lkLCB0XSBvZiBsb2FkZWQpIHtcbiAgICB0cnkge1xuICAgICAgdC5zdG9wPy4oKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJbY29kZXgtcGx1c3BsdXNdIHR3ZWFrIHN0b3AgZmFpbGVkOlwiLCBpZCwgZSk7XG4gICAgfVxuICB9XG4gIGxvYWRlZC5jbGVhcigpO1xuICBjbGVhclNlY3Rpb25zKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRUd2Vhayh0OiBMaXN0ZWRUd2VhaywgcGF0aHM6IFVzZXJQYXRocyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzb3VyY2UgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxuICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLXNvdXJjZVwiLFxuICAgIHQuZW50cnksXG4gICkpIGFzIHN0cmluZztcblxuICAvLyBFdmFsdWF0ZSBhcyBDSlMtc2hhcGVkOiBwcm92aWRlIG1vZHVsZS9leHBvcnRzL2FwaS4gVHdlYWsgY29kZSBtYXkgdXNlXG4gIC8vIGBtb2R1bGUuZXhwb3J0cyA9IHsgc3RhcnQsIHN0b3AgfWAgb3IgYGV4cG9ydHMuc3RhcnQgPSAuLi5gIG9yIHB1cmUgRVNNXG4gIC8vIGRlZmF1bHQgZXhwb3J0IHNoYXBlICh3ZSBhY2NlcHQgYm90aCkuXG4gIGNvbnN0IG1vZHVsZSA9IHsgZXhwb3J0czoge30gYXMgeyBkZWZhdWx0PzogVHdlYWsgfSAmIFR3ZWFrIH07XG4gIGNvbnN0IGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cztcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1pbXBsaWVkLWV2YWwsIG5vLW5ldy1mdW5jXG4gIGNvbnN0IGZuID0gbmV3IEZ1bmN0aW9uKFxuICAgIFwibW9kdWxlXCIsXG4gICAgXCJleHBvcnRzXCIsXG4gICAgXCJjb25zb2xlXCIsXG4gICAgYCR7c291cmNlfVxcbi8vIyBzb3VyY2VVUkw9Y29kZXhwcC10d2VhazovLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHQubWFuaWZlc3QuaWQpfS8ke2VuY29kZVVSSUNvbXBvbmVudCh0LmVudHJ5KX1gLFxuICApO1xuICBmbihtb2R1bGUsIGV4cG9ydHMsIGNvbnNvbGUpO1xuICBjb25zdCBtb2QgPSBtb2R1bGUuZXhwb3J0cyBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9ICYgVHdlYWs7XG4gIGNvbnN0IHR3ZWFrOiBUd2VhayA9IChtb2QgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSkuZGVmYXVsdCA/PyAobW9kIGFzIFR3ZWFrKTtcbiAgaWYgKHR5cGVvZiB0d2Vhaz8uc3RhcnQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgIHRocm93IG5ldyBFcnJvcihgdHdlYWsgJHt0Lm1hbmlmZXN0LmlkfSBoYXMgbm8gc3RhcnQoKWApO1xuICB9XG4gIGNvbnN0IGFwaSA9IG1ha2VSZW5kZXJlckFwaSh0Lm1hbmlmZXN0LCBwYXRocyk7XG4gIGF3YWl0IHR3ZWFrLnN0YXJ0KGFwaSk7XG4gIGxvYWRlZC5zZXQodC5tYW5pZmVzdC5pZCwgeyBzdG9wOiB0d2Vhay5zdG9wPy5iaW5kKHR3ZWFrKSB9KTtcbn1cblxuZnVuY3Rpb24gbWFrZVJlbmRlcmVyQXBpKG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LCBwYXRoczogVXNlclBhdGhzKTogVHdlYWtBcGkge1xuICBjb25zdCBpZCA9IG1hbmlmZXN0LmlkO1xuICBjb25zdCBsb2cgPSAobGV2ZWw6IFwiZGVidWdcIiB8IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIC4uLmE6IHVua25vd25bXSkgPT4ge1xuICAgIGNvbnN0IGNvbnNvbGVGbiA9XG4gICAgICBsZXZlbCA9PT0gXCJkZWJ1Z1wiID8gY29uc29sZS5kZWJ1Z1xuICAgICAgOiBsZXZlbCA9PT0gXCJ3YXJuXCIgPyBjb25zb2xlLndhcm5cbiAgICAgIDogbGV2ZWwgPT09IFwiZXJyb3JcIiA/IGNvbnNvbGUuZXJyb3JcbiAgICAgIDogY29uc29sZS5sb2c7XG4gICAgY29uc29sZUZuKGBbY29kZXgtcGx1c3BsdXNdWyR7aWR9XWAsIC4uLmEpO1xuICAgIC8vIEFsc28gbWlycm9yIHRvIG1haW4ncyBsb2cgZmlsZSBzbyB3ZSBjYW4gZGlhZ25vc2UgdHdlYWsgYmVoYXZpb3JcbiAgICAvLyB3aXRob3V0IGF0dGFjaGluZyBEZXZUb29scy4gU3RyaW5naWZ5IGVhY2ggYXJnIGRlZmVuc2l2ZWx5LlxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGEubWFwKCh2KSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIHY7XG4gICAgICAgIGlmICh2IGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiBgJHt2Lm5hbWV9OiAke3YubWVzc2FnZX1gO1xuICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHYpOyB9XG4gICAgICB9KTtcbiAgICAgIGlwY1JlbmRlcmVyLnNlbmQoXG4gICAgICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxuICAgICAgICBsZXZlbCxcbiAgICAgICAgYFt0d2VhayAke2lkfV0gJHtwYXJ0cy5qb2luKFwiIFwiKX1gLFxuICAgICAgKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIHN3YWxsb3cgXHUyMDE0IG5ldmVyIGxldCBsb2dnaW5nIGJyZWFrIGEgdHdlYWsgKi9cbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBtYW5pZmVzdCxcbiAgICBwcm9jZXNzOiBcInJlbmRlcmVyXCIsXG4gICAgbG9nOiB7XG4gICAgICBkZWJ1ZzogKC4uLmEpID0+IGxvZyhcImRlYnVnXCIsIC4uLmEpLFxuICAgICAgaW5mbzogKC4uLmEpID0+IGxvZyhcImluZm9cIiwgLi4uYSksXG4gICAgICB3YXJuOiAoLi4uYSkgPT4gbG9nKFwid2FyblwiLCAuLi5hKSxcbiAgICAgIGVycm9yOiAoLi4uYSkgPT4gbG9nKFwiZXJyb3JcIiwgLi4uYSksXG4gICAgfSxcbiAgICBzdG9yYWdlOiByZW5kZXJlclN0b3JhZ2UoaWQpLFxuICAgIHNldHRpbmdzOiB7XG4gICAgICByZWdpc3RlcjogKHMpID0+IHJlZ2lzdGVyU2VjdGlvbih7IC4uLnMsIGlkOiBgJHtpZH06JHtzLmlkfWAgfSksXG4gICAgICByZWdpc3RlclBhZ2U6IChwKSA9PlxuICAgICAgICByZWdpc3RlclBhZ2UoaWQsIG1hbmlmZXN0LCB7IC4uLnAsIGlkOiBgJHtpZH06JHtwLmlkfWAgfSksXG4gICAgfSxcbiAgICByZWFjdDoge1xuICAgICAgZ2V0RmliZXI6IChuKSA9PiBmaWJlckZvck5vZGUobikgYXMgUmVhY3RGaWJlck5vZGUgfCBudWxsLFxuICAgICAgZmluZE93bmVyQnlOYW1lOiAobiwgbmFtZSkgPT4ge1xuICAgICAgICBsZXQgZiA9IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGw7XG4gICAgICAgIHdoaWxlIChmKSB7XG4gICAgICAgICAgY29uc3QgdCA9IGYudHlwZSBhcyB7IGRpc3BsYXlOYW1lPzogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0gfCBudWxsO1xuICAgICAgICAgIGlmICh0ICYmICh0LmRpc3BsYXlOYW1lID09PSBuYW1lIHx8IHQubmFtZSA9PT0gbmFtZSkpIHJldHVybiBmO1xuICAgICAgICAgIGYgPSBmLnJldHVybjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH0sXG4gICAgICB3YWl0Rm9yRWxlbWVudDogKHNlbCwgdGltZW91dE1zID0gNTAwMCkgPT5cbiAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xuICAgICAgICAgIGlmIChleGlzdGluZykgcmV0dXJuIHJlc29sdmUoZXhpc3RpbmcpO1xuICAgICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIHRpbWVvdXRNcztcbiAgICAgICAgICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcbiAgICAgICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgICBvYnMuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICByZXNvbHZlKGVsKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoRGF0ZS5ub3coKSA+IGRlYWRsaW5lKSB7XG4gICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYHRpbWVvdXQgd2FpdGluZyBmb3IgJHtzZWx9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgICAgIH0pLFxuICAgIH0sXG4gICAgaXBjOiB7XG4gICAgICBvbjogKGMsIGgpID0+IHtcbiAgICAgICAgY29uc3Qgd3JhcHBlZCA9IChfZTogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiBoKC4uLmFyZ3MpO1xuICAgICAgICBpcGNSZW5kZXJlci5vbihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XG4gICAgICAgIHJldHVybiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XG4gICAgICB9LFxuICAgICAgc2VuZDogKGMsIC4uLmFyZ3MpID0+IGlwY1JlbmRlcmVyLnNlbmQoYGNvZGV4cHA6JHtpZH06JHtjfWAsIC4uLmFyZ3MpLFxuICAgICAgaW52b2tlOiA8VD4oYzogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShgY29kZXhwcDoke2lkfToke2N9YCwgLi4uYXJncykgYXMgUHJvbWlzZTxUPixcbiAgICB9LFxuICAgIGZzOiByZW5kZXJlckZzKGlkLCBwYXRocyksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyU3RvcmFnZShpZDogc3RyaW5nKSB7XG4gIGNvbnN0IGtleSA9IGBjb2RleHBwOnN0b3JhZ2U6JHtpZH1gO1xuICBjb25zdCByZWFkID0gKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KSA/PyBcInt9XCIpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgfTtcbiAgY29uc3Qgd3JpdGUgPSAodjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBKU09OLnN0cmluZ2lmeSh2KSk7XG4gIHJldHVybiB7XG4gICAgZ2V0OiA8VD4oazogc3RyaW5nLCBkPzogVCkgPT4gKGsgaW4gcmVhZCgpID8gKHJlYWQoKVtrXSBhcyBUKSA6IChkIGFzIFQpKSxcbiAgICBzZXQ6IChrOiBzdHJpbmcsIHY6IHVua25vd24pID0+IHtcbiAgICAgIGNvbnN0IG8gPSByZWFkKCk7XG4gICAgICBvW2tdID0gdjtcbiAgICAgIHdyaXRlKG8pO1xuICAgIH0sXG4gICAgZGVsZXRlOiAoazogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBvID0gcmVhZCgpO1xuICAgICAgZGVsZXRlIG9ba107XG4gICAgICB3cml0ZShvKTtcbiAgICB9LFxuICAgIGFsbDogKCkgPT4gcmVhZCgpLFxuICB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJlckZzKGlkOiBzdHJpbmcsIF9wYXRoczogVXNlclBhdGhzKSB7XG4gIC8vIFNhbmRib3hlZCByZW5kZXJlciBjYW4ndCB1c2UgTm9kZSBmcyBkaXJlY3RseSBcdTIwMTQgcHJveHkgdGhyb3VnaCBtYWluIElQQy5cbiAgcmV0dXJuIHtcbiAgICBkYXRhRGlyOiBgPHJlbW90ZT4vdHdlYWstZGF0YS8ke2lkfWAsXG4gICAgcmVhZDogKHA6IHN0cmluZykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJyZWFkXCIsIGlkLCBwKSBhcyBQcm9taXNlPHN0cmluZz4sXG4gICAgd3JpdGU6IChwOiBzdHJpbmcsIGM6IHN0cmluZykgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJ3cml0ZVwiLCBpZCwgcCwgYykgYXMgUHJvbWlzZTx2b2lkPixcbiAgICBleGlzdHM6IChwOiBzdHJpbmcpID0+XG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnR3ZWFrLWZzXCIsIFwiZXhpc3RzXCIsIGlkLCBwKSBhcyBQcm9taXNlPGJvb2xlYW4+LFxuICB9O1xufVxuIiwgIi8qKlxuICogQnVpbHQtaW4gXCJUd2VhayBNYW5hZ2VyXCIgXHUyMDE0IGF1dG8taW5qZWN0ZWQgYnkgdGhlIHJ1bnRpbWUsIG5vdCBhIHVzZXIgdHdlYWsuXG4gKiBMaXN0cyBkaXNjb3ZlcmVkIHR3ZWFrcyB3aXRoIGVuYWJsZSB0b2dnbGVzLCBvcGVucyB0aGUgdHdlYWtzIGRpciwgbGlua3NcbiAqIHRvIGxvZ3MgYW5kIGNvbmZpZy4gTGl2ZXMgaW4gdGhlIHJlbmRlcmVyLlxuICpcbiAqIFRoaXMgaXMgaW52b2tlZCBmcm9tIHByZWxvYWQvaW5kZXgudHMgQUZURVIgdXNlciB0d2Vha3MgYXJlIGxvYWRlZCBzbyBpdFxuICogY2FuIHNob3cgdXAtdG8tZGF0ZSBzdGF0dXMuXG4gKi9cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XG5pbXBvcnQgeyByZWdpc3RlclNlY3Rpb24gfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW91bnRNYW5hZ2VyKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB0d2Vha3MgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpsaXN0LXR3ZWFrc1wiKSkgYXMgQXJyYXk8e1xuICAgIG1hbmlmZXN0OiB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgdmVyc2lvbjogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9O1xuICAgIGVudHJ5RXhpc3RzOiBib29sZWFuO1xuICB9PjtcbiAgY29uc3QgcGF0aHMgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIpKSBhcyB7XG4gICAgdXNlclJvb3Q6IHN0cmluZztcbiAgICB0d2Vha3NEaXI6IHN0cmluZztcbiAgICBsb2dEaXI6IHN0cmluZztcbiAgfTtcblxuICByZWdpc3RlclNlY3Rpb24oe1xuICAgIGlkOiBcImNvZGV4LXBsdXNwbHVzOm1hbmFnZXJcIixcbiAgICB0aXRsZTogXCJUd2VhayBNYW5hZ2VyXCIsXG4gICAgZGVzY3JpcHRpb246IGAke3R3ZWFrcy5sZW5ndGh9IHR3ZWFrKHMpIGluc3RhbGxlZC4gVXNlciBkaXI6ICR7cGF0aHMudXNlclJvb3R9YCxcbiAgICByZW5kZXIocm9vdCkge1xuICAgICAgcm9vdC5zdHlsZS5jc3NUZXh0ID0gXCJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo4cHg7XCI7XG5cbiAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgYWN0aW9ucy5zdHlsZS5jc3NUZXh0ID0gXCJkaXNwbGF5OmZsZXg7Z2FwOjhweDtmbGV4LXdyYXA6d3JhcDtcIjtcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgICAgIGJ1dHRvbihcIk9wZW4gdHdlYWtzIGZvbGRlclwiLCAoKSA9PlxuICAgICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHBhdGhzLnR3ZWFrc0RpcikuY2F0Y2goKCkgPT4ge30pLFxuICAgICAgICApLFxuICAgICAgKTtcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgICAgIGJ1dHRvbihcIk9wZW4gbG9nc1wiLCAoKSA9PlxuICAgICAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHBhdGhzLmxvZ0RpcikuY2F0Y2goKCkgPT4ge30pLFxuICAgICAgICApLFxuICAgICAgKTtcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgICAgIGJ1dHRvbihcIlJlbG9hZCB3aW5kb3dcIiwgKCkgPT4gbG9jYXRpb24ucmVsb2FkKCkpLFxuICAgICAgKTtcbiAgICAgIHJvb3QuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XG5cbiAgICAgIGlmICh0d2Vha3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gICAgICAgIGVtcHR5LnN0eWxlLmNzc1RleHQgPSBcImNvbG9yOiM4ODg7Zm9udDoxM3B4IHN5c3RlbS11aTttYXJnaW46OHB4IDA7XCI7XG4gICAgICAgIGVtcHR5LnRleHRDb250ZW50ID1cbiAgICAgICAgICBcIk5vIHVzZXIgdHdlYWtzIHlldC4gRHJvcCBhIGZvbGRlciB3aXRoIG1hbmlmZXN0Lmpzb24gKyBpbmRleC5qcyBpbnRvIHRoZSB0d2Vha3MgZGlyLCB0aGVuIHJlbG9hZC5cIjtcbiAgICAgICAgcm9vdC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJ1bFwiKTtcbiAgICAgIGxpc3Quc3R5bGUuY3NzVGV4dCA9IFwibGlzdC1zdHlsZTpub25lO21hcmdpbjowO3BhZGRpbmc6MDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo2cHg7XCI7XG4gICAgICBmb3IgKGNvbnN0IHQgb2YgdHdlYWtzKSB7XG4gICAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgICBsaS5zdHlsZS5jc3NUZXh0ID1cbiAgICAgICAgICBcImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47cGFkZGluZzo4cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJvcmRlciwjMmEyYTJhKTtib3JkZXItcmFkaXVzOjZweDtcIjtcbiAgICAgICAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGxlZnQuaW5uZXJIVE1MID0gYFxuICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250OjYwMCAxM3B4IHN5c3RlbS11aTtcIj4ke2VzY2FwZSh0Lm1hbmlmZXN0Lm5hbWUpfSA8c3BhbiBzdHlsZT1cImNvbG9yOiM4ODg7Zm9udC13ZWlnaHQ6NDAwO1wiPnYke2VzY2FwZSh0Lm1hbmlmZXN0LnZlcnNpb24pfTwvc3Bhbj48L2Rpdj5cbiAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6Izg4ODtmb250OjEycHggc3lzdGVtLXVpO1wiPiR7ZXNjYXBlKHQubWFuaWZlc3QuZGVzY3JpcHRpb24gPz8gdC5tYW5pZmVzdC5pZCl9PC9kaXY+XG4gICAgICAgIGA7XG4gICAgICAgIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgcmlnaHQuc3R5bGUuY3NzVGV4dCA9IFwiY29sb3I6Izg4ODtmb250OjEycHggc3lzdGVtLXVpO1wiO1xuICAgICAgICByaWdodC50ZXh0Q29udGVudCA9IHQuZW50cnlFeGlzdHMgPyBcImxvYWRlZFwiIDogXCJtaXNzaW5nIGVudHJ5XCI7XG4gICAgICAgIGxpLmFwcGVuZChsZWZ0LCByaWdodCk7XG4gICAgICAgIGxpc3QuYXBwZW5kKGxpKTtcbiAgICAgIH1cbiAgICAgIHJvb3QuYXBwZW5kKGxpc3QpO1xuICAgIH0sXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidXR0b24obGFiZWw6IHN0cmluZywgb25jbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGIudHlwZSA9IFwiYnV0dG9uXCI7XG4gIGIudGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgYi5zdHlsZS5jc3NUZXh0ID1cbiAgICBcInBhZGRpbmc6NnB4IDEwcHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1ib3JkZXIsIzMzMyk7Ym9yZGVyLXJhZGl1czo2cHg7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O2ZvbnQ6MTJweCBzeXN0ZW0tdWk7Y3Vyc29yOnBvaW50ZXI7XCI7XG4gIGIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIG9uY2xpY2spO1xuICByZXR1cm4gYjtcbn1cblxuZnVuY3Rpb24gZXNjYXBlKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzLnJlcGxhY2UoL1smPD5cIiddL2csIChjKSA9PlxuICAgIGMgPT09IFwiJlwiXG4gICAgICA/IFwiJmFtcDtcIlxuICAgICAgOiBjID09PSBcIjxcIlxuICAgICAgICA/IFwiJmx0O1wiXG4gICAgICAgIDogYyA9PT0gXCI+XCJcbiAgICAgICAgICA/IFwiJmd0O1wiXG4gICAgICAgICAgOiBjID09PSAnXCInXG4gICAgICAgICAgICA/IFwiJnF1b3Q7XCJcbiAgICAgICAgICAgIDogXCImIzM5O1wiLFxuICApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBV0EsSUFBQUEsbUJBQTRCOzs7QUM2QnJCLFNBQVMsbUJBQXlCO0FBQ3ZDLE1BQUksT0FBTywrQkFBZ0M7QUFDM0MsUUFBTSxZQUFZLG9CQUFJLElBQStCO0FBQ3JELE1BQUksU0FBUztBQUNiLFFBQU0sWUFBWSxvQkFBSSxJQUE0QztBQUVsRSxRQUFNLE9BQTBCO0FBQUEsSUFDOUIsZUFBZTtBQUFBLElBQ2Y7QUFBQSxJQUNBLE9BQU8sVUFBVTtBQUNmLFlBQU0sS0FBSztBQUNYLGdCQUFVLElBQUksSUFBSSxRQUFRO0FBRTFCLGNBQVE7QUFBQSxRQUNOO0FBQUEsUUFDQSxTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsTUFDWDtBQUNBLGFBQU87QUFBQSxJQUNUO0FBQUEsSUFDQSxHQUFHLE9BQU8sSUFBSTtBQUNaLFVBQUksSUFBSSxVQUFVLElBQUksS0FBSztBQUMzQixVQUFJLENBQUMsRUFBRyxXQUFVLElBQUksT0FBUSxJQUFJLG9CQUFJLElBQUksQ0FBRTtBQUM1QyxRQUFFLElBQUksRUFBRTtBQUFBLElBQ1Y7QUFBQSxJQUNBLElBQUksT0FBTyxJQUFJO0FBQ2IsZ0JBQVUsSUFBSSxLQUFLLEdBQUcsT0FBTyxFQUFFO0FBQUEsSUFDakM7QUFBQSxJQUNBLEtBQUssVUFBVSxNQUFNO0FBQ25CLGdCQUFVLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxPQUFPLEdBQUcsR0FBRyxJQUFJLENBQUM7QUFBQSxJQUNuRDtBQUFBLElBQ0Esb0JBQW9CO0FBQUEsSUFBQztBQUFBLElBQ3JCLHVCQUF1QjtBQUFBLElBQUM7QUFBQSxJQUN4QixzQkFBc0I7QUFBQSxJQUFDO0FBQUEsSUFDdkIsV0FBVztBQUFBLElBQUM7QUFBQSxFQUNkO0FB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QUEsRUFBQztBQUNULE1BQUk7QUFDRixpQ0FBWSxLQUFLLHVCQUF1QixRQUFRLEdBQUc7QUFBQSxFQUNyRCxRQUFRO0FBQUEsRUFBQztBQUNYO0FBQ0EsU0FBU0EsZUFBYyxHQUFvQjtBQUN6QyxNQUFJO0FBQ0YsV0FBTyxPQUFPLE1BQU0sV0FBVyxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQUEsRUFDckQsUUFBUTtBQUNOLFdBQU8sT0FBTyxDQUFDO0FBQUEsRUFDakI7QUFDRjtBQUVBLFFBQVEsaUJBQWlCLEVBQUUsS0FBSyxTQUFTLEtBQUssQ0FBQztBQUcvQyxJQUFJO0FBQ0YsbUJBQWlCO0FBQ2pCLFVBQVEsc0JBQXNCO0FBQ2hDLFNBQVMsR0FBRztBQUNWLFVBQVEscUJBQXFCLE9BQU8sQ0FBQyxDQUFDO0FBQ3hDO0FBRUEsZUFBZSxNQUFNO0FBQ25CLE1BQUksU0FBUyxlQUFlLFdBQVc7QUFDckMsYUFBUyxpQkFBaUIsb0JBQW9CLE1BQU0sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3BFLE9BQU87QUFDTCxTQUFLO0FBQUEsRUFDUDtBQUNGLENBQUM7QUFFRCxlQUFlLE9BQU87QUFDcEIsVUFBUSxjQUFjLEVBQUUsWUFBWSxTQUFTLFdBQVcsQ0FBQztBQUN6RCxNQUFJO0FBQ0YsMEJBQXNCO0FBQ3RCLFlBQVEsMkJBQTJCO0FBQ25DLFVBQU0sZUFBZTtBQUNyQixZQUFRLG9CQUFvQjtBQUM1QixVQUFNLGFBQWE7QUFDbkIsWUFBUSxpQkFBaUI7QUFDekIsb0JBQWdCO0FBQ2hCLFlBQVEsZUFBZTtBQUFBLEVBQ3pCLFNBQVMsR0FBRztBQUNWLFlBQVEsZUFBZSxPQUFRLEdBQWEsU0FBUyxDQUFDLENBQUM7QUFDdkQsWUFBUSxNQUFNLHlDQUF5QyxDQUFDO0FBQUEsRUFDMUQ7QUFDRjtBQUlBLElBQUksWUFBa0M7QUFDdEMsU0FBUyxrQkFBd0I7QUFDL0IsK0JBQVksR0FBRywwQkFBMEIsTUFBTTtBQUM3QyxRQUFJLFVBQVc7QUFDZixpQkFBYSxZQUFZO0FBQ3ZCLFVBQUk7QUFDRixnQkFBUSxLQUFLLHVDQUF1QztBQUNwRCwwQkFBa0I7QUFDbEIsY0FBTSxlQUFlO0FBQ3JCLGNBQU0sYUFBYTtBQUFBLE1BQ3JCLFNBQVMsR0FBRztBQUNWLGdCQUFRLE1BQU0sdUNBQXVDLENBQUM7QUFBQSxNQUN4RCxVQUFFO0FBQ0Esb0JBQVk7QUFBQSxNQUNkO0FBQUEsSUFDRixHQUFHO0FBQUEsRUFDTCxDQUFDO0FBQ0g7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJyb290IiwgImNhcmQiLCAiaW1wb3J0X2VsZWN0cm9uIiwgIm1vZHVsZSIsICJleHBvcnRzIiwgImltcG9ydF9lbGVjdHJvbiIsICJzYWZlU3RyaW5naWZ5Il0KfQo=
