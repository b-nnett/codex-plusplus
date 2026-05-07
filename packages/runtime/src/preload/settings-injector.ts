/**
 * Settings injector for Codex's Settings page.
 *
 * Codex's settings is a routed page (URL stays at `/index.html?hostId=local`)
 * NOT a modal dialog. The sidebar lives inside a `<div class="flex flex-col
 * gap-1 gap-0">` wrapper that holds one or more `<div class="flex flex-col
 * gap-px">` groups of buttons. There are no stable `role` / `aria-label` /
 * `data-testid` hooks on the shell so we identify the sidebar by text-content
 * match against known item labels (General, Appearance, Configuration, …).
 *
 * Layout we inject:
 *
 *   GENERAL                       (uppercase group label)
 *   [Codex's existing items group]
 *   CODEX++                       (uppercase group label)
 *   ⓘ Config
 *   ☰ Tweaks
 *
 * Clicking Config / Tweaks hides Codex's content panel children and renders
 * our own `main-surface` panel in their place. Clicking any of Codex's
 * sidebar items restores the original view.
 */

import { ipcRenderer } from "electron";
import type {
  SettingsSection,
  SettingsPage,
  SettingsHandle,
  TweakManifest,
} from "@codex-plusplus/sdk";

// Mirrors the runtime's main-side ListedTweak shape (kept in sync manually).
interface ListedTweak {
  manifest: TweakManifest;
  entry: string;
  dir: string;
  entryExists: boolean;
  enabled: boolean;
  update: TweakUpdateCheck | null;
}

interface TweakUpdateCheck {
  checkedAt: string;
  repo: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface CodexPlusPlusConfig {
  version: string;
  autoUpdate: boolean;
  updateCheck: CodexPlusPlusUpdateCheck | null;
}

interface CodexPlusPlusUpdateCheck {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface CodexCdpStatus {
  enabled: boolean;
  active: boolean;
  configuredPort: number;
  activePort: number | null;
  restartRequired: boolean;
  source: "argv" | "env" | "config" | "off";
  jsonListUrl: string | null;
  jsonVersionUrl: string | null;
  launchCommand: string;
  appRoot: string | null;
}

interface WatcherHealth {
  checkedAt: string;
  status: "ok" | "warn" | "error";
  title: string;
  summary: string;
  watcher: string;
  checks: WatcherHealthCheck[];
}

interface WatcherHealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

/**
 * A tweak-registered page. We carry the owning tweak's manifest so we can
 * resolve relative iconUrls and show authorship in the page header.
 */
interface RegisteredPage {
  /** Fully-qualified id: `<tweakId>:<pageId>`. */
  id: string;
  tweakId: string;
  manifest: TweakManifest;
  page: SettingsPage;
  /** Per-page DOM teardown returned by `page.render`, if any. */
  teardown?: (() => void) | null;
  /** The injected sidebar button (so we can update its active state). */
  navButton?: HTMLButtonElement | null;
}

/** What page is currently selected in our injected nav. */
type ActivePage =
  | { kind: "config" }
  | { kind: "tweaks" }
  | { kind: "registered"; id: string };

interface InjectorState {
  sections: Map<string, SettingsSection>;
  pages: Map<string, RegisteredPage>;
  listedTweaks: ListedTweak[];
  /** Outer wrapper that holds Codex's items group + our injected groups. */
  outerWrapper: HTMLElement | null;
  /** Our "General" label for Codex's native settings group. */
  nativeNavHeader: HTMLElement | null;
  /** Our "Codex++" nav group (Config/Tweaks). */
  navGroup: HTMLElement | null;
  navButtons: { config: HTMLButtonElement; tweaks: HTMLButtonElement } | null;
  /** Our "Tweaks" nav group (per-tweak pages). Created lazily. */
  pagesGroup: HTMLElement | null;
  pagesGroupKey: string | null;
  panelHost: HTMLElement | null;
  observer: MutationObserver | null;
  fingerprint: string | null;
  sidebarDumped: boolean;
  activePage: ActivePage | null;
  sidebarRoot: HTMLElement | null;
  sidebarRestoreHandler: ((e: Event) => void) | null;
  settingsSurfaceVisible: boolean;
  settingsSurfaceHideTimer: ReturnType<typeof setTimeout> | null;
}

const state: InjectorState = {
  sections: new Map(),
  pages: new Map(),
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
};

function plog(msg: string, extra?: unknown): void {
  ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `[settings-injector] ${msg}${extra === undefined ? "" : " " + safeStringify(extra)}`,
  );
}
function safeStringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ───────────────────────────────────────────────────────────── public API ──

export function startSettingsInjector(): void {
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
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m];
    history[m] = function (this: History, ...args: Parameters<typeof orig>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(`codexpp-${m}`));
      return r;
    } as typeof orig;
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

function onNav(): void {
  state.fingerprint = null;
  tryInject();
  maybeDumpDom();
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target instanceof Element ? e.target : null;
  const control = target?.closest("[role='link'],button,a");
  if (!(control instanceof HTMLElement)) return;
  if (compactSettingsText(control.textContent || "") !== "Back to app") return;
  setTimeout(() => {
    setSettingsSurfaceVisible(false, "back-to-app");
  }, 0);
}

export function registerSection(section: SettingsSection): SettingsHandle {
  state.sections.set(section.id, section);
  if (state.activePage?.kind === "tweaks") rerender();
  return {
    unregister: () => {
      state.sections.delete(section.id);
      if (state.activePage?.kind === "tweaks") rerender();
    },
  };
}

export function clearSections(): void {
  state.sections.clear();
  // Drop registered pages too — they're owned by tweaks that just got
  // torn down by the host. Run any teardowns before forgetting them.
  for (const p of state.pages.values()) {
    try {
      p.teardown?.();
    } catch (e) {
      plog("page teardown failed", { id: p.id, err: String(e) });
    }
  }
  state.pages.clear();
  syncPagesGroup();
  // If we were on a registered page that no longer exists, fall back to
  // restoring Codex's view.
  if (
    state.activePage?.kind === "registered" &&
    !state.pages.has(state.activePage.id)
  ) {
    restoreCodexView();
  } else if (state.activePage?.kind === "tweaks") {
    rerender();
  }
}

/**
 * Register a tweak-owned settings page. The runtime injects a sidebar entry
 * under a "TWEAKS" group header (which appears only when at least one page
 * is registered) and routes clicks to the page's `render(root)`.
 */
export function registerPage(
  tweakId: string,
  manifest: TweakManifest,
  page: SettingsPage,
): SettingsHandle {
  const id = page.id; // already namespaced by tweak-host as `${tweakId}:${page.id}`
  const entry: RegisteredPage = { id, tweakId, manifest, page };
  state.pages.set(id, entry);
  plog("registerPage", { id, title: page.title, tweakId });
  syncPagesGroup();
  // If the user was already on this page (hot reload), re-mount its body.
  if (state.activePage?.kind === "registered" && state.activePage.id === id) {
    rerender();
  }
  return {
    unregister: () => {
      const e = state.pages.get(id);
      if (!e) return;
      try {
        e.teardown?.();
      } catch {}
      state.pages.delete(id);
      syncPagesGroup();
      if (state.activePage?.kind === "registered" && state.activePage.id === id) {
        restoreCodexView();
      }
    },
  };
}

/** Called by the tweak host after fetching the tweak list from main. */
export function setListedTweaks(list: ListedTweak[]): void {
  state.listedTweaks = list;
  if (state.activePage?.kind === "tweaks") rerender();
}

// ───────────────────────────────────────────────────────────── injection ──

function tryInject(): void {
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
  // Codex's items group lives inside an outer wrapper that's already styled
  // to hold multiple groups (`flex flex-col gap-1 gap-0`). We inject our
  // group as a sibling so the natural gap-1 acts as our visual separator.
  const outer = itemsGroup.parentElement ?? itemsGroup;
  state.sidebarRoot = outer;
  syncNativeSettingsHeader(itemsGroup, outer);

  if (state.navGroup && outer.contains(state.navGroup)) {
    syncPagesGroup();
    // Codex re-renders its native sidebar buttons on its own state changes.
    // If one of our pages is active, re-strip Codex's active styling so
    // General doesn't reappear as selected.
    if (state.activePage !== null) syncCodexNativeNavActive(true);
    return;
  }

  // Sidebar was either freshly mounted (Settings just opened) or re-mounted
  // (closed and re-opened, or navigated away and back). In all of those
  // cases Codex resets to its default page (General), but our in-memory
  // `activePage` may still reference the last tweak/page the user had open
  // — which would cause that nav button to render with the active styling
  // even though Codex is showing General. Clear it so `syncPagesGroup` /
  // `setNavActive` start from a neutral state. The panelHost reference is
  // also stale (its DOM was discarded with the previous content area).
  if (state.activePage !== null || state.panelHost !== null) {
    plog("sidebar re-mount detected; clearing stale active state", {
      prevActive: state.activePage,
    });
    state.activePage = null;
    state.panelHost = null;
  }

  // ── Group container ───────────────────────────────────────────────────
  const group = document.createElement("div");
  group.dataset.codexpp = "nav-group";
  group.className = "flex flex-col gap-px";

  group.appendChild(sidebarGroupHeader("Codex++", "pt-3"));

  // ── Two sidebar items ────────────────────────────────────────────────
  const configBtn = makeSidebarItem("Config", configIconSvg());
  const tweaksBtn = makeSidebarItem("Tweaks", tweaksIconSvg());

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

function syncNativeSettingsHeader(itemsGroup: HTMLElement, outer: HTMLElement): void {
  if (state.nativeNavHeader && outer.contains(state.nativeNavHeader)) return;
  if (outer === itemsGroup) return;

  const header = sidebarGroupHeader("General");
  header.dataset.codexpp = "native-nav-header";
  outer.insertBefore(header, itemsGroup);
  state.nativeNavHeader = header;
}

function sidebarGroupHeader(text: string, topPadding = "pt-2"): HTMLElement {
  const header = document.createElement("div");
  header.className =
    `px-row-x ${topPadding} pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none`;
  header.textContent = text;
  return header;
}

function scheduleSettingsSurfaceHidden(): void {
  if (!state.settingsSurfaceVisible || state.settingsSurfaceHideTimer) return;
  state.settingsSurfaceHideTimer = setTimeout(() => {
    state.settingsSurfaceHideTimer = null;
    if (findSidebarItemsGroup()) return;
    if (isSettingsTextVisible()) return;
    setSettingsSurfaceVisible(false, "sidebar-not-found");
  }, 1500);
}

function isSettingsTextVisible(): boolean {
  const text = compactSettingsText(document.body?.textContent || "").toLowerCase();
  return (
    text.includes("back to app") &&
    text.includes("general") &&
    text.includes("appearance") &&
    (text.includes("configuration") || text.includes("default permissions"))
  );
}

function compactSettingsText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function setSettingsSurfaceVisible(visible: boolean, reason: string): void {
  if (state.settingsSurfaceVisible === visible) return;
  state.settingsSurfaceVisible = visible;
  try {
    (window as Window & { __codexppSettingsSurfaceVisible?: boolean }).__codexppSettingsSurfaceVisible = visible;
    document.documentElement.dataset.codexppSettingsSurface = visible ? "true" : "false";
    window.dispatchEvent(
      new CustomEvent("codexpp:settings-surface", {
        detail: { visible, reason },
      }),
    );
  } catch {}
  plog("settings surface", { visible, reason, url: location.href });
}

/**
 * Render (or re-render) the second sidebar group of per-tweak pages. The
 * group is created lazily and removed when the last page unregisters, so
 * users with no page-registering tweaks never see an empty "Tweaks" header.
 */
function syncPagesGroup(): void {
  const outer = state.sidebarRoot;
  if (!outer) return;
  const pages = [...state.pages.values()];

  // Build a deterministic fingerprint of the desired group state. If the
  // current DOM group already matches, this is a no-op — critical, because
  // syncPagesGroup is called on every MutationObserver tick and any DOM
  // write would re-trigger that observer (infinite loop, app freeze).
  const desiredKey = pages.length === 0
    ? "EMPTY"
    : pages.map((p) => `${p.id}|${p.page.title}|${p.page.iconSvg ?? ""}`).join("\n");
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
    // Strip prior buttons (keep the header at index 0).
    while (group.children.length > 1) group.removeChild(group.lastChild!);
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
    ids: pages.map((p) => p.id),
  });
  // Reflect current active state across the rebuilt buttons.
  setNavActive(state.activePage);
}

function makeSidebarItem(label: string, iconSvg: string): HTMLButtonElement {
  // Class string copied verbatim from Codex's sidebar buttons (General etc).
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexpp = `nav-${label.toLowerCase()}`;
  btn.setAttribute("aria-label", label);
  btn.className =
    "focus-visible:outline-token-border relative px-row-x py-row-y cursor-interaction shrink-0 items-center overflow-hidden rounded-lg text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full hover:bg-token-list-hover-background font-normal";

  const inner = document.createElement("div");
  inner.className =
    "flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground";
  inner.innerHTML = `${iconSvg}<span class="truncate">${label}</span>`;
  btn.appendChild(inner);
  return btn;
}

/** Internal key for the built-in nav buttons. */
type BuiltinPage = "config" | "tweaks";

function setNavActive(active: ActivePage | null): void {
  // Built-in (Config/Tweaks) buttons.
  if (state.navButtons) {
    const builtin: BuiltinPage | null =
      active?.kind === "config" ? "config" :
      active?.kind === "tweaks" ? "tweaks" : null;
    for (const [key, btn] of Object.entries(state.navButtons) as [BuiltinPage, HTMLButtonElement][]) {
      applyNavActive(btn, key === builtin);
    }
  }
  // Per-page registered buttons.
  for (const p of state.pages.values()) {
    if (!p.navButton) continue;
    const isActive = active?.kind === "registered" && active.id === p.id;
    applyNavActive(p.navButton, isActive);
  }
  // Codex's own sidebar buttons (General, Appearance, etc). When one of
  // our pages is active, Codex still has aria-current="page" and the
  // active-bg class on whichever item it considered the route — typically
  // General. That makes both buttons look selected. Strip Codex's active
  // styling while one of ours is active; restore it when none is.
  syncCodexNativeNavActive(active !== null);
}

/**
 * Mute Codex's own active-state styling on its sidebar buttons. We don't
 * touch Codex's React state — when the user clicks a native item, Codex
 * re-renders the buttons and re-applies its own correct state, then our
 * sidebar-click listener fires `restoreCodexView` (which calls back into
 * `setNavActive(null)` and lets Codex's styling stand).
 *
 * `mute=true`  → strip aria-current and swap active bg → hover bg
 * `mute=false` → no-op (Codex's own re-render already restored things)
 */
function syncCodexNativeNavActive(mute: boolean): void {
  if (!mute) return;
  const root = state.sidebarRoot;
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of buttons) {
    // Skip our own buttons.
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

function applyNavActive(btn: HTMLButtonElement, active: boolean): void {
  const inner = btn.firstElementChild as HTMLElement | null;
  if (active) {
      btn.classList.remove("hover:bg-token-list-hover-background", "font-normal");
      btn.classList.add("bg-token-list-hover-background");
      btn.setAttribute("aria-current", "page");
      if (inner) {
        inner.classList.remove("text-token-foreground");
        inner.classList.add("text-token-list-active-selection-foreground");
        inner
          .querySelector("svg")
          ?.classList.add("text-token-list-active-selection-icon-foreground");
      }
    } else {
      btn.classList.add("hover:bg-token-list-hover-background", "font-normal");
      btn.classList.remove("bg-token-list-hover-background");
      btn.removeAttribute("aria-current");
      if (inner) {
        inner.classList.add("text-token-foreground");
        inner.classList.remove("text-token-list-active-selection-foreground");
        inner
          .querySelector("svg")
          ?.classList.remove("text-token-list-active-selection-icon-foreground");
      }
    }
}

// ─────────────────────────────────────────────────────────── activation ──

function activatePage(page: ActivePage): void {
  const content = findContentArea();
  if (!content) {
    plog("activate: content area not found");
    return;
  }
  state.activePage = page;
  plog("activate", { page });

  // Hide Codex's content children, show ours.
  for (const child of Array.from(content.children) as HTMLElement[]) {
    if (child.dataset.codexpp === "tweaks-panel") continue;
    if (child.dataset.codexppHidden === undefined) {
      child.dataset.codexppHidden = child.style.display || "";
    }
    child.style.display = "none";
  }
  let panel = content.querySelector<HTMLElement>('[data-codexpp="tweaks-panel"]');
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
  // restore Codex's view. Re-register if needed.
  const sidebar = state.sidebarRoot;
  if (sidebar) {
    if (state.sidebarRestoreHandler) {
      sidebar.removeEventListener("click", state.sidebarRestoreHandler, true);
    }
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (state.navGroup?.contains(target)) return; // our buttons
      if (state.pagesGroup?.contains(target)) return; // our page buttons
      if (target.closest("[data-codexpp-settings-search]")) return;
      restoreCodexView();
    };
    state.sidebarRestoreHandler = handler;
    sidebar.addEventListener("click", handler, true);
  }
}

function restoreCodexView(): void {
  plog("restore codex view");
  const content = findContentArea();
  if (!content) return;
  if (state.panelHost) state.panelHost.style.display = "none";
  for (const child of Array.from(content.children) as HTMLElement[]) {
    if (child === state.panelHost) continue;
    if (child.dataset.codexppHidden !== undefined) {
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
      true,
    );
    state.sidebarRestoreHandler = null;
  }
}

function rerender(): void {
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
    const root = panelShell(entry.page.title, entry.page.description);
    host.appendChild(root.outer);
    try {
      // Tear down any prior render before re-rendering (hot reload).
      try { entry.teardown?.(); } catch {}
      entry.teardown = null;
      const ret = entry.page.render(root.sectionsWrap);
      if (typeof ret === "function") entry.teardown = ret;
    } catch (e) {
      const err = document.createElement("div");
      err.className = "text-token-charts-red text-sm";
      err.textContent = `Error rendering page: ${(e as Error).message}`;
      root.sectionsWrap.appendChild(err);
    }
    return;
  }

  const title = ap.kind === "tweaks" ? "Tweaks" : "Config";
  const subtitle = ap.kind === "tweaks"
    ? "Manage your installed Codex++ tweaks."
    : "Checking installed Codex++ version.";
  const root = panelShell(title, subtitle);
  host.appendChild(root.outer);
  if (ap.kind === "tweaks") renderTweaksPage(root.sectionsWrap);
  else renderConfigPage(root.sectionsWrap, root.subtitle);
}

// ───────────────────────────────────────────────────────────── pages ──

function renderConfigPage(sectionsWrap: HTMLElement, subtitle?: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);

  void ipcRenderer
    .invoke("codexpp:get-config")
    .then((config) => {
      if (subtitle) {
        subtitle.textContent = `You have Codex++ ${(config as CodexPlusPlusConfig).version} installed.`;
      }
      card.textContent = "";
      renderCodexPlusPlusConfig(card, config as CodexPlusPlusConfig);
    })
    .catch((e) => {
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

  const cdp = document.createElement("section");
  cdp.className = "flex flex-col gap-2";
  cdp.appendChild(sectionTitle("Developer / CDP"));
  const cdpCard = roundedCard();
  cdpCard.appendChild(rowSimple("Checking CDP", "Reading Chrome DevTools Protocol status."));
  cdp.appendChild(cdpCard);
  sectionsWrap.appendChild(cdp);
  renderCdpCard(cdpCard);

  const maintenance = document.createElement("section");
  maintenance.className = "flex flex-col gap-2";
  maintenance.appendChild(sectionTitle("Maintenance"));
  const maintenanceCard = roundedCard();
  maintenanceCard.appendChild(uninstallRow());
  maintenanceCard.appendChild(reportBugRow());
  maintenance.appendChild(maintenanceCard);
  sectionsWrap.appendChild(maintenance);
}

function renderCodexPlusPlusConfig(card: HTMLElement, config: CodexPlusPlusConfig): void {
  card.appendChild(autoUpdateRow(config));
  card.appendChild(checkForUpdatesRow(config.updateCheck));
  if (config.updateCheck) card.appendChild(releaseNotesRow(config.updateCheck));
}

function autoUpdateRow(config: CodexPlusPlusConfig): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = "Automatically refresh Codex++";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = `Installed version v${config.version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.`;
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  row.appendChild(
    switchControl(config.autoUpdate, async (next) => {
      await ipcRenderer.invoke("codexpp:set-auto-update", next);
    }),
  );
  return row;
}

function checkForUpdatesRow(check: CodexPlusPlusUpdateCheck | null): HTMLElement {
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
        void ipcRenderer.invoke("codexpp:open-external", check.releaseUrl);
      }),
    );
  }
  actions.appendChild(
    compactButton("Check Now", () => {
      row.style.opacity = "0.65";
      void ipcRenderer
        .invoke("codexpp:check-codexpp-update", true)
        .then((next) => {
          const card = row.parentElement;
          if (!card) return;
          card.textContent = "";
          void ipcRenderer.invoke("codexpp:get-config").then((config) => {
            renderCodexPlusPlusConfig(card, {
              ...(config as CodexPlusPlusConfig),
              updateCheck: next as CodexPlusPlusUpdateCheck,
            });
          });
        })
        .catch((e) => plog("Codex++ update check failed", String(e)))
        .finally(() => {
          row.style.opacity = "";
        });
    }),
  );
  row.appendChild(actions);
  return row;
}

function releaseNotesRow(check: CodexPlusPlusUpdateCheck): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-2 p-3";
  const title = document.createElement("div");
  title.className = "text-sm text-token-text-primary";
  title.textContent = "Latest release notes";
  row.appendChild(title);
  const body = document.createElement("div");
  body.className =
    "max-h-60 overflow-auto rounded-md border border-token-border bg-token-foreground/5 p-3 text-sm text-token-text-secondary";
  body.appendChild(renderReleaseNotesMarkdown(check.releaseNotes?.trim() || check.error || "No release notes available."));
  row.appendChild(body);
  return row;
}

function renderCdpCard(card: HTMLElement): void {
  void ipcRenderer
    .invoke("codexpp:get-cdp-status")
    .then((status) => {
      card.textContent = "";
      renderCdpStatus(card, status as CodexCdpStatus);
    })
    .catch((e) => {
      card.textContent = "";
      card.appendChild(rowSimple("Could not read CDP status", String(e)));
    });
}

function renderCdpStatus(card: HTMLElement, status: CodexCdpStatus): void {
  card.appendChild(cdpToggleRow(card, status));
  card.appendChild(cdpPortRow(card, status));
  card.appendChild(cdpEndpointRow(status));
  card.appendChild(cdpLaunchRow(status));
  if (status.restartRequired) {
    card.appendChild(
      rowSimple(
        "Restart required",
        status.enabled
          ? "CDP will use the saved port after Codex restarts."
          : "CDP is still active for this process and will turn off after Codex restarts.",
      ),
    );
  }
}

function cdpToggleRow(card: HTMLElement, status: CodexCdpStatus): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";

  const left = document.createElement("div");
  left.className = "flex min-w-0 items-start gap-3";
  left.appendChild(cdpStatusBadge(status));

  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = "Chrome DevTools Protocol";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = cdpStatusSummary(status);
  stack.append(title, desc);
  left.appendChild(stack);
  row.appendChild(left);

  row.appendChild(
    switchControl(status.enabled, async (enabled) => {
      await ipcRenderer.invoke("codexpp:set-cdp-config", {
        enabled,
        port: status.configuredPort,
      });
      refreshCdpCard(card);
    }),
  );

  return row;
}

function cdpPortRow(card: HTMLElement, status: CodexCdpStatus): HTMLElement {
  const row = actionRow(
    "Remote debugging port",
    status.activePort
      ? `Current process is listening on ${status.activePort}.`
      : `Saved port is ${status.configuredPort}.`,
  );
  const action = row.querySelector<HTMLElement>("[data-codexpp-row-actions]");
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "65535";
  input.step = "1";
  input.value = String(status.configuredPort);
  input.className =
    "h-8 w-24 rounded-lg border border-token-border bg-transparent px-2 text-sm text-token-text-primary focus:outline-none focus:ring-2 focus:ring-token-focus-border";
  action?.appendChild(input);
  action?.appendChild(
    compactButton("Save", () => {
      const port = Number(input.value);
      void ipcRenderer
        .invoke("codexpp:set-cdp-config", {
          enabled: status.enabled,
          port: Number.isInteger(port) ? port : status.configuredPort,
        })
        .then(() => refreshCdpCard(card))
        .catch((e) => plog("CDP port save failed", String(e)));
    }),
  );
  return row;
}

function cdpEndpointRow(status: CodexCdpStatus): HTMLElement {
  const row = actionRow(
    status.active ? "Local CDP endpoints" : "Local CDP endpoints",
    status.active && status.jsonListUrl
      ? `${status.jsonListUrl}`
      : "Not exposed by the current Codex process.",
  );
  const action = row.querySelector<HTMLElement>("[data-codexpp-row-actions]");
  const openTargets = compactButton("Open Targets", () => {
    if (!status.jsonListUrl) return;
    void ipcRenderer.invoke("codexpp:open-cdp-url", status.jsonListUrl);
  });
  openTargets.disabled = !status.jsonListUrl;
  const copyTargets = compactButton("Copy URL", () => {
    if (!status.jsonListUrl) return;
    void ipcRenderer.invoke("codexpp:copy-text", status.jsonListUrl);
  });
  copyTargets.disabled = !status.jsonListUrl;
  const openVersion = compactButton("Version", () => {
    if (!status.jsonVersionUrl) return;
    void ipcRenderer.invoke("codexpp:open-cdp-url", status.jsonVersionUrl);
  });
  openVersion.disabled = !status.jsonVersionUrl;
  action?.append(openTargets, copyTargets, openVersion);
  return row;
}

function cdpLaunchRow(status: CodexCdpStatus): HTMLElement {
  const row = actionRow(
    "Launch command",
    status.appRoot ? status.appRoot : "Codex app path was not found in installer state.",
  );
  const action = row.querySelector<HTMLElement>("[data-codexpp-row-actions]");
  action?.appendChild(
    compactButton("Copy Command", () => {
      void ipcRenderer.invoke("codexpp:copy-text", status.launchCommand);
    }),
  );
  return row;
}

function refreshCdpCard(card: HTMLElement): void {
  card.textContent = "";
  card.appendChild(rowSimple("Checking CDP", "Reading Chrome DevTools Protocol status."));
  renderCdpCard(card);
}

function cdpStatusBadge(status: CodexCdpStatus): HTMLElement {
  if (status.active) return statusBadge(status.restartRequired ? "warn" : "ok", "Active");
  if (status.restartRequired) return statusBadge("warn", "Restart");
  return statusBadge(status.enabled ? "warn" : "warn", status.enabled ? "Saved" : "Off");
}

function cdpStatusSummary(status: CodexCdpStatus): string {
  if (status.activePort) {
    const source = status.source === "argv" ? "launch arg" : status.source;
    return `Active on 127.0.0.1:${status.activePort} from ${source}.`;
  }
  if (status.enabled) {
    return `Enabled for next launch on 127.0.0.1:${status.configuredPort}.`;
  }
  return "Disabled for Codex launches managed by Codex++.";
}

function renderReleaseNotesMarkdown(markdown: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-2";
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: HTMLOListElement | HTMLUListElement | null = null;
  let codeLines: string[] | null = null;

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
    pre.className =
      "m-0 overflow-auto rounded-md border border-token-border bg-token-foreground/10 p-2 text-xs text-token-text-primary";
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
      if (!list || (wantOrdered && list.tagName !== "OL") || (!wantOrdered && list.tagName !== "UL")) {
        flushList();
        list = document.createElement(wantOrdered ? "ol" : "ul");
        list.className = wantOrdered
          ? "m-0 list-decimal space-y-1 pl-5 leading-5"
          : "m-0 list-disc space-y-1 pl-5 leading-5";
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

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const pattern = /(`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    appendText(parent, text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      const code = document.createElement("code");
      code.className =
        "rounded border border-token-border bg-token-foreground/10 px-1 py-0.5 text-xs text-token-text-primary";
      code.textContent = match[2];
      parent.appendChild(code);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const a = document.createElement("a");
      a.className = "text-token-text-primary underline underline-offset-2";
      a.href = match[4];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[3];
      parent.appendChild(a);
    } else if (match[5] !== undefined) {
      const strong = document.createElement("strong");
      strong.className = "font-medium text-token-text-primary";
      strong.textContent = match[5];
      parent.appendChild(strong);
    } else if (match[6] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[6];
      parent.appendChild(em);
    }
    lastIndex = match.index + match[0].length;
  }
  appendText(parent, text.slice(lastIndex));
}

function appendText(parent: HTMLElement, text: string): void {
  if (text) parent.appendChild(document.createTextNode(text));
}

function renderWatcherHealthCard(card: HTMLElement): void {
  void ipcRenderer
    .invoke("codexpp:get-watcher-health")
    .then((health) => {
      card.textContent = "";
      renderWatcherHealth(card, health as WatcherHealth);
    })
    .catch((e) => {
      card.textContent = "";
      card.appendChild(rowSimple("Could not check watcher", String(e)));
    });
}

function renderWatcherHealth(card: HTMLElement, health: WatcherHealth): void {
  card.appendChild(watcherSummaryRow(health));
  for (const check of health.checks) {
    if (check.status === "ok") continue;
    card.appendChild(watcherCheckRow(check));
  }
}

function watcherSummaryRow(health: WatcherHealth): HTMLElement {
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
    }),
  );
  row.appendChild(action);
  return row;
}

function watcherCheckRow(check: WatcherHealthCheck): HTMLElement {
  const row = rowSimple(check.name, check.detail);
  const left = row.firstElementChild as HTMLElement | null;
  if (left) left.prepend(statusBadge(check.status));
  return row;
}

function statusBadge(status: "ok" | "warn" | "error", label?: string): HTMLElement {
  const badge = document.createElement("span");
  const tone =
    status === "ok"
      ? "border-token-charts-green text-token-charts-green"
      : status === "warn"
        ? "border-token-charts-yellow text-token-charts-yellow"
        : "border-token-charts-red text-token-charts-red";
  badge.className = `inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`;
  badge.textContent = label || (status === "ok" ? "OK" : status === "warn" ? "Review" : "Error");
  return badge;
}

function updateSummary(check: CodexPlusPlusUpdateCheck | null): string {
  if (!check) return "No update check has run yet.";
  const latest = check.latestVersion ? `Latest v${check.latestVersion}. ` : "";
  const checked = `Checked ${new Date(check.checkedAt).toLocaleString()}.`;
  if (check.error) return `${latest}${checked} ${check.error}`;
  return `${latest}${checked}`;
}

function uninstallRow(): HTMLElement {
  const row = actionRow(
    "Uninstall Codex++",
    "Copies the uninstall command. Run it from a terminal after quitting Codex.",
  );
  const action = row.querySelector<HTMLElement>("[data-codexpp-row-actions]");
  action?.appendChild(
    compactButton("Copy Command", () => {
      void ipcRenderer
        .invoke("codexpp:copy-text", "node ~/.codex-plusplus/source/packages/installer/dist/cli.js uninstall")
        .catch((e) => plog("copy uninstall command failed", String(e)));
    }),
  );
  return row;
}

function reportBugRow(): HTMLElement {
  const row = actionRow(
    "Report a bug",
    "Open a GitHub issue with runtime, installer, or tweak-manager details.",
  );
  const action = row.querySelector<HTMLElement>("[data-codexpp-row-actions]");
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
          "Attach relevant lines from the Codex++ log directory.",
        ].join("\n"),
      );
      void ipcRenderer.invoke(
        "codexpp:open-external",
        `https://github.com/b-nnett/codex-plusplus/issues/new?title=${title}&body=${body}`,
      );
    }),
  );
  return row;
}

function actionRow(titleText: string, description: string): HTMLElement {
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

function renderTweaksPage(sectionsWrap: HTMLElement): void {
  const openBtn = openInPlaceButton("Open Tweaks Folder", () => {
    void ipcRenderer.invoke("codexpp:reveal", tweaksPath());
  });
  const reloadBtn = openInPlaceButton("Force Reload", () => {
    // Full page refresh — same as DevTools Cmd-R / our CDP Page.reload.
    // Main re-discovers tweaks first so the new renderer comes up with a
    // fresh tweak set; then location.reload restarts the renderer so the
    // preload re-initializes against it.
    void ipcRenderer
      .invoke("codexpp:reload-tweaks")
      .catch((e) => plog("force reload (main) failed", String(e)))
      .finally(() => {
        location.reload();
      });
  });
  // Drop the diagonal-arrow icon from the reload button — it implies "open
  // out of app" which doesn't fit. Replace its trailing svg with a refresh.
  const reloadSvg = reloadBtn.querySelector("svg");
  if (reloadSvg) {
    reloadSvg.outerHTML =
      `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true">` +
      `<path d="M4 10a6 6 0 0 1 10.24-4.24L16 7.5M16 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M16 10a6 6 0 0 1-10.24 4.24L4 12.5M4 16v-3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`;
  }

  const trailing = document.createElement("div");
  trailing.className = "flex items-center gap-2";
  trailing.appendChild(reloadBtn);
  trailing.appendChild(openBtn);

  if (state.listedTweaks.length === 0) {
    const section = document.createElement("section");
    section.className = "flex flex-col gap-2";
    section.appendChild(sectionTitle("Installed Tweaks", trailing));
    const card = roundedCard();
    card.appendChild(
      rowSimple(
        "No tweaks installed",
        `Drop a tweak folder into ${tweaksPath()} and reload.`,
      ),
    );
    section.appendChild(card);
    sectionsWrap.appendChild(section);
    return;
  }

  // Group registered SettingsSections by tweak id (prefix split at ":").
  const sectionsByTweak = new Map<string, SettingsSection[]>();
  for (const s of state.sections.values()) {
    const tweakId = s.id.split(":")[0];
    if (!sectionsByTweak.has(tweakId)) sectionsByTweak.set(tweakId, []);
    sectionsByTweak.get(tweakId)!.push(s);
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

function tweakRow(t: ListedTweak, sections: SettingsSection[]): HTMLElement {
  const m = t.manifest;

  // Outer cell wraps the header row + (optional) nested sections so the
  // parent card's divider stays between *tweaks*, not between header and
  // body of the same tweak.
  const cell = document.createElement("div");
  cell.className = "flex flex-col";
  if (!t.enabled) cell.style.opacity = "0.7";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-4 p-3";

  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";

  // ── Avatar ─────────────────────────────────────────────────────────────
  const avatar = document.createElement("div");
  avatar.className =
    "flex shrink-0 items-center justify-center rounded-md border border-token-border overflow-hidden text-token-text-secondary";
  avatar.style.width = "56px";
  avatar.style.height = "56px";
  avatar.style.backgroundColor = "var(--color-token-bg-fog, transparent)";
  if (m.iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.className = "size-full object-contain";
    // Initial: show fallback initial in case the icon fails to load.
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

  // ── Text stack ────────────────────────────────────────────────────────
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
    ver.className =
      "text-token-text-secondary text-xs font-normal tabular-nums";
    ver.textContent = `v${m.version}`;
    titleRow.appendChild(ver);
  }
  if (t.update?.updateAvailable) {
    const badge = document.createElement("span");
    badge.className =
      "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] font-medium text-token-text-primary";
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
      void ipcRenderer.invoke("codexpp:open-external", `https://github.com/${m.githubRepo}`);
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

  // Tags row (if any) — small pill chips below the meta line.
  if (m.tags && m.tags.length > 0) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "flex flex-wrap items-center gap-1 pt-0.5";
    for (const tag of m.tags) {
      const pill = document.createElement("span");
      pill.className =
        "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] text-token-text-secondary";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    }
    stack.appendChild(tagsRow);
  }

  left.appendChild(stack);
  header.appendChild(left);

  // ── Toggle ────────────────────────────────────────────────────────────
  const right = document.createElement("div");
  right.className = "flex shrink-0 items-center gap-2 pt-0.5";
  if (t.update?.updateAvailable && t.update.releaseUrl) {
    right.appendChild(
      compactButton("Review Release", () => {
        void ipcRenderer.invoke("codexpp:open-external", t.update!.releaseUrl);
      }),
    );
  }
  right.appendChild(
    switchControl(t.enabled, async (next) => {
      await ipcRenderer.invoke("codexpp:set-tweak-enabled", m.id, next);
      // The main process broadcasts a reload which will re-fetch the list
      // and re-render. We don't optimistically toggle to avoid drift.
    }),
  );
  header.appendChild(right);

  cell.appendChild(header);

  // If the tweak is enabled and registered settings sections, render those
  // bodies as nested rows beneath the header inside the same cell.
  if (t.enabled && sections.length > 0) {
    const nested = document.createElement("div");
    nested.className =
      "flex flex-col divide-y-[0.5px] divide-token-border border-t-[0.5px] border-token-border";
    for (const s of sections) {
      const body = document.createElement("div");
      body.className = "p-3";
      try {
        s.render(body);
      } catch (e) {
        body.textContent = `Error rendering tweak section: ${(e as Error).message}`;
      }
      nested.appendChild(body);
    }
    cell.appendChild(nested);
  }

  return cell;
}

function renderAuthor(author: TweakManifest["author"]): HTMLElement | null {
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

// ───────────────────────────────────────────────────────────── components ──

/** The full panel shell (toolbar + scroll + heading + sections wrap). */
function panelShell(
  title: string,
  subtitle?: string,
): { outer: HTMLElement; sectionsWrap: HTMLElement; subtitle?: HTMLElement } {
  const outer = document.createElement("div");
  outer.className = "main-surface flex h-full min-h-0 flex-col";

  const toolbar = document.createElement("div");
  toolbar.className =
    "draggable flex items-center px-panel electron:h-toolbar extension:h-toolbar-sm";
  outer.appendChild(toolbar);

  const scroll = document.createElement("div");
  scroll.className = "flex-1 overflow-y-auto p-panel";
  outer.appendChild(scroll);

  const inner = document.createElement("div");
  inner.className =
    "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
  scroll.appendChild(inner);

  const headerWrap = document.createElement("div");
  headerWrap.className = "flex items-center justify-between gap-3 pb-panel";
  const headerInner = document.createElement("div");
  headerInner.className = "flex min-w-0 flex-1 flex-col gap-1.5 pb-panel";
  const heading = document.createElement("div");
  heading.className = "electron:heading-lg heading-base truncate";
  heading.textContent = title;
  headerInner.appendChild(heading);
  let subtitleElement: HTMLElement | undefined;
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "text-token-text-secondary text-sm";
    sub.textContent = subtitle;
    headerInner.appendChild(sub);
    subtitleElement = sub;
  }
  headerWrap.appendChild(headerInner);
  inner.appendChild(headerWrap);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "flex flex-col gap-[var(--padding-panel)]";
  inner.appendChild(sectionsWrap);

  return { outer, sectionsWrap, subtitle: subtitleElement };
}

function sectionTitle(text: string, trailing?: HTMLElement): HTMLElement {
  const titleRow = document.createElement("div");
  titleRow.className =
    "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
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

/**
 * Codex's "Open config.toml"-style trailing button: ghost border, muted
 * label, top-right diagonal arrow icon. Markup mirrors Configuration panel.
 */
function openInPlaceButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "border-token-border user-select-none no-drag cursor-interaction flex items-center gap-1 border whitespace-nowrap focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 rounded-lg text-token-description-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px]";
  btn.innerHTML =
    `${label}` +
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true">` +
    `<path d="M14.3349 13.3301V6.60645L5.47065 15.4707C5.21095 15.7304 4.78895 15.7304 4.52925 15.4707C4.26955 15.211 4.26955 14.789 4.52925 14.5293L13.3935 5.66504H6.66011C6.29284 5.66504 5.99507 5.36727 5.99507 5C5.99507 4.63273 6.29284 4.33496 6.66011 4.33496H14.9999L15.1337 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V13.3301C15.6649 13.6973 15.3672 13.9951 14.9999 13.9951C14.6327 13.9951 14.335 13.6973 14.3349 13.3301Z" fill="currentColor"></path>` +
    `</svg>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function compactButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2 text-sm text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function roundedCard(): HTMLElement {
  const card = document.createElement("div");
  card.className =
    "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
  card.setAttribute(
    "style",
    "background-color: var(--color-background-panel, var(--color-token-bg-fog));",
  );
  return card;
}

function rowSimple(title: string | undefined, description?: string): HTMLElement {
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

/**
 * Codex-styled toggle switch. Markup mirrors the General > Permissions row
 * switch we captured: outer button (role=switch), inner pill, sliding knob.
 */
function switchControl(
  initial: boolean,
  onChange: (next: boolean) => void | Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");

  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className =
    "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);

  const apply = (on: boolean): void => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className =
      "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className = `relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out h-5 w-8 ${
      on ? "bg-token-charts-blue" : "bg-token-foreground/20"
    }`;
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

function dot(): HTMLElement {
  const s = document.createElement("span");
  s.className = "text-token-description-foreground";
  s.textContent = "·";
  return s;
}

// ──────────────────────────────────────────────────────────────── icons ──

function configIconSvg(): string {
  // Sliders / settings glyph. 20x20 currentColor.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h11M17 15h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
    `<circle cx="13" cy="5" r="1.6" fill="currentColor"/>` +
    `<circle cx="6" cy="10" r="1.6" fill="currentColor"/>` +
    `<circle cx="15" cy="15" r="1.6" fill="currentColor"/>` +
    `</svg>`
  );
}

function tweaksIconSvg(): string {
  // Sparkles / "++" glyph for tweaks.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M10 2.5 L11.4 8.6 L17.5 10 L11.4 11.4 L10 17.5 L8.6 11.4 L2.5 10 L8.6 8.6 Z" fill="currentColor"/>` +
    `<path d="M15.5 3 L16 5 L18 5.5 L16 6 L15.5 8 L15 6 L13 5.5 L15 5 Z" fill="currentColor" opacity="0.7"/>` +
    `</svg>`
  );
}

function defaultPageIconSvg(): string {
  // Document/page glyph for tweak-registered pages without their own icon.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M12 3v3a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
    `</svg>`
  );
}

async function resolveIconUrl(
  url: string,
  tweakDir: string,
): Promise<string | null> {
  if (/^(https?:|data:)/.test(url)) return url;
  // Relative path → ask main to read the file and return a data: URL.
  // Renderer is sandboxed so file:// won't load directly.
  const rel = url.startsWith("./") ? url.slice(2) : url;
  try {
    return (await ipcRenderer.invoke(
      "codexpp:read-tweak-asset",
      tweakDir,
      rel,
    )) as string;
  } catch (e) {
    plog("icon load failed", { url, tweakDir, err: String(e) });
    return null;
  }
}

// ─────────────────────────────────────────────────────── DOM heuristics ──

function findSidebarItemsGroup(): HTMLElement | null {
  // Anchor strategy first (would be ideal if Codex switches to <a>).
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href*='/settings/']"),
  );
  if (links.length >= 2) {
    let node: HTMLElement | null = links[0].parentElement;
    while (node) {
      const inside = node.querySelectorAll("a[href*='/settings/']");
      if (inside.length >= Math.max(2, links.length - 1)) return node;
      node = node.parentElement;
    }
  }

  // Text-content match against Codex's known sidebar labels.
  const KNOWN = [
    "General",
    "Appearance",
    "Configuration",
    "Personalization",
    "MCP servers",
    "MCP Servers",
    "Git",
    "Environments",
  ];
  const matches: HTMLElement[] = [];
  const all = document.querySelectorAll<HTMLElement>(
    "button, a, [role='button'], li, div",
  );
  for (const el of Array.from(all)) {
    const t = (el.textContent ?? "").trim();
    if (t.length > 30) continue;
    if (KNOWN.some((k) => t === k)) matches.push(el);
    if (matches.length > 50) break;
  }
  if (matches.length >= 2) {
    let node: HTMLElement | null = matches[0].parentElement;
    while (node) {
      let count = 0;
      for (const m of matches) if (node.contains(m)) count++;
      if (count >= Math.min(3, matches.length)) return node;
      node = node.parentElement;
    }
  }
  return null;
}

function findContentArea(): HTMLElement | null {
  const sidebar = findSidebarItemsGroup();
  if (!sidebar) return null;
  let parent = sidebar.parentElement;
  while (parent) {
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      if (child === sidebar || child.contains(sidebar)) continue;
      const r = child.getBoundingClientRect();
      if (r.width > 300 && r.height > 200) return child;
    }
    parent = parent.parentElement;
  }
  return null;
}

function maybeDumpDom(): void {
  try {
    const sidebar = findSidebarItemsGroup();
    if (sidebar && !state.sidebarDumped) {
      state.sidebarDumped = true;
      const sbRoot = sidebar.parentElement ?? sidebar;
      plog(`codex sidebar HTML`, sbRoot.outerHTML.slice(0, 32000));
    }
    const content = findContentArea();
    if (!content) {
      if (state.fingerprint !== location.href) {
        state.fingerprint = location.href;
        plog("dom probe (no content)", {
          url: location.href,
          sidebar: sidebar ? describe(sidebar) : null,
        });
      }
      return;
    }
    let panel: HTMLElement | null = null;
    for (const child of Array.from(content.children) as HTMLElement[]) {
      if (child.dataset.codexpp === "tweaks-panel") continue;
      if (child.style.display === "none") continue;
      panel = child;
      break;
    }
    const activeNav = sidebar
      ? Array.from(sidebar.querySelectorAll<HTMLElement>("button, a")).find(
          (b) =>
            b.getAttribute("aria-current") === "page" ||
            b.getAttribute("data-active") === "true" ||
            b.getAttribute("aria-selected") === "true" ||
            b.classList.contains("active"),
        )
      : null;
    const heading = panel?.querySelector<HTMLElement>(
      "h1, h2, h3, [class*='heading']",
    );
    const fingerprint = `${activeNav?.textContent ?? ""}|${heading?.textContent ?? ""}|${panel?.children.length ?? 0}`;
    if (state.fingerprint === fingerprint) return;
    state.fingerprint = fingerprint;
    plog("dom probe", {
      url: location.href,
      activeNav: activeNav?.textContent?.trim() ?? null,
      heading: heading?.textContent?.trim() ?? null,
      content: describe(content),
    });
    if (panel) {
      const html = panel.outerHTML;
      plog(
        `codex panel HTML (${activeNav?.textContent?.trim() ?? "?"})`,
        html.slice(0, 32000),
      );
    }
  } catch (e) {
    plog("dom probe failed", String(e));
  }
}

function describe(el: HTMLElement): Record<string, unknown> {
  return {
    tag: el.tagName,
    cls: el.className.slice(0, 120),
    id: el.id || undefined,
    children: el.children.length,
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  };
}

function tweaksPath(): string {
  return (
    (window as unknown as { __codexpp_tweaks_dir__?: string }).__codexpp_tweaks_dir__ ??
    "<user dir>/tweaks"
  );
}
