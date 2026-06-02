"use strict";
/**
 * Settings injector for Codex's Settings page.
 *
 * Codex's settings is a routed page (URL stays at `/index.html?hostId=local`)
 * NOT a modal dialog. The sidebar lives inside a `<div class="flex flex-col
 * gap-1 gap-0">` wrapper that holds one or more `<div class="flex flex-col
 * gap-px">` groups of buttons. There are no stable `role` / `aria-label` /
 * `data-testid` hooks on the shell so we identify the sidebar by text-content
 * match against known item labels (General, Appearance, Configuration, …)
 * across Codex's supported UI languages.
 *
 * Layout we inject:
 *
 *   GENERAL                       (uppercase group label)
 *   [Codex's existing items group]
 *   CODEX++                       (uppercase group label)
 *   ⓘ Config
 *   ☰ Tweaks
 *   ◇ Tweak Store
 *
 * Clicking Config / Tweaks / Tweak Store hides Codex's content panel children and renders
 * our own `main-surface` panel in their place. Clicking any of Codex's
 * sidebar items restores the original view.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSettingsInjector = startSettingsInjector;
exports.registerSection = registerSection;
exports.clearSections = clearSections;
exports.registerPage = registerPage;
exports.setListedTweaks = setListedTweaks;
const electron_1 = require("electron");
const tweak_store_1 = require("../tweak-store");
const CODEX_PLUSPLUS_RELEASES_URL = "https://github.com/b-nnett/codex-plusplus/releases";
const state = {
    sections: new Map(),
    pages: new Map(),
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
    tweakStoreError: null,
};
function plog(msg, extra) {
    electron_1.ipcRenderer.send("codexpp:preload-log", "info", `[settings-injector] ${msg}${extra === undefined ? "" : " " + safeStringify(extra)}`);
}
function safeStringify(v) {
    try {
        return typeof v === "string" ? v : JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
// ───────────────────────────────────────────────────────────── public API ──
function startSettingsInjector() {
    if (state.observer)
        return;
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
        history[m] = function (...args) {
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
        if (ticks > 60)
            clearInterval(interval);
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
    if (!(control instanceof HTMLElement))
        return;
    if (compactSettingsText(control.textContent || "") !== "Back to app")
        return;
    setTimeout(() => {
        setSettingsSurfaceVisible(false, "back-to-app");
    }, 0);
}
function registerSection(section) {
    state.sections.set(section.id, section);
    if (state.activePage?.kind === "tweaks")
        rerender();
    return {
        unregister: () => {
            state.sections.delete(section.id);
            if (state.activePage?.kind === "tweaks")
                rerender();
        },
    };
}
function clearSections() {
    state.sections.clear();
    // Drop registered pages too — they're owned by tweaks that just got
    // torn down by the host. Run any teardowns before forgetting them.
    for (const p of state.pages.values()) {
        try {
            p.teardown?.();
        }
        catch (e) {
            plog("page teardown failed", { id: p.id, err: String(e) });
        }
    }
    state.pages.clear();
    syncPagesGroup();
    // If we were on a registered page that no longer exists, fall back to
    // restoring Codex's view.
    if (state.activePage?.kind === "registered" &&
        !state.pages.has(state.activePage.id)) {
        restoreCodexView();
    }
    else if (state.activePage?.kind === "tweaks") {
        rerender();
    }
}
/**
 * Register a tweak-owned settings page. The runtime injects a sidebar entry
 * under a "TWEAKS" group header (which appears only when at least one page
 * is registered) and routes clicks to the page's `render(root)`.
 */
function registerPage(tweakId, manifest, page) {
    const id = page.id; // already namespaced by tweak-host as `${tweakId}:${page.id}`
    const entry = { id, tweakId, manifest, page };
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
            if (!e)
                return;
            try {
                e.teardown?.();
            }
            catch { }
            state.pages.delete(id);
            syncPagesGroup();
            if (state.activePage?.kind === "registered" && state.activePage.id === id) {
                restoreCodexView();
            }
        },
    };
}
/** Called by the tweak host after fetching the tweak list from main. */
function setListedTweaks(list) {
    state.listedTweaks = list;
    if (state.activePage?.kind === "tweaks")
        rerender();
}
// ───────────────────────────────────────────────────────────── injection ──
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
    // Codex's items group lives inside an outer wrapper that's already styled
    // to hold multiple groups (`flex flex-col gap-1 gap-0`). We inject our
    // group as a sibling so the natural gap-1 acts as our visual separator.
    const outer = itemsGroup.parentElement ?? itemsGroup;
    if (!isSettingsSidebarCandidate(itemsGroup) || !isSettingsSidebarCandidate(outer)) {
        scheduleSettingsSurfaceHidden();
        plog("rejected non-settings sidebar candidate", {
            itemsGroup: describe(itemsGroup),
            outer: describe(outer),
        });
        return;
    }
    state.sidebarRoot = outer;
    syncNativeSettingsHeader(itemsGroup, outer);
    if (state.navGroup && outer.contains(state.navGroup)) {
        syncPagesGroup();
        // Codex re-renders its native sidebar buttons on its own state changes.
        // If one of our pages is active, re-strip Codex's active styling so
        // General doesn't reappear as selected.
        if (state.activePage !== null)
            syncCodexNativeNavActive(true);
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
    const existingCodexPpNavGroup = outer.querySelector(':scope > [data-codexpp="nav-group"]') ??
        outer.querySelector('[data-codexpp="nav-group"]');
    if (existingCodexPpNavGroup) {
        state.navGroup = existingCodexPpNavGroup;
        state.codexPlusPlusUpdateButton = existingCodexPpNavGroup.querySelector("[data-codexpp-sidebar-update]");
        state.sidebarRoot = outer;
        syncPagesGroup();
        refreshSidebarCodexPlusPlusUpdateButton();
        if (state.activePage !== null)
            syncCodexNativeNavActive(true);
        return;
    }
    // ── Group container ───────────────────────────────────────────────────
    const group = document.createElement("div");
    group.dataset.codexpp = "nav-group";
    group.className = "flex flex-col gap-px";
    const updateButton = sidebarUpdatePillButton();
    state.codexPlusPlusUpdateButton = updateButton;
    group.appendChild(sidebarGroupHeader("Codex++", "pt-3", updateButton));
    refreshSidebarCodexPlusPlusUpdateButton();
    // ── Sidebar items ────────────────────────────────────────────────────
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
    if (state.nativeNavHeader && outer.contains(state.nativeNavHeader))
        return;
    if (outer === itemsGroup)
        return;
    const header = sidebarGroupHeader("General");
    header.dataset.codexpp = "native-nav-header";
    outer.insertBefore(header, itemsGroup);
    state.nativeNavHeader = header;
}
function sidebarGroupHeader(text, topPadding = "pt-2", trailing) {
    const header = document.createElement("div");
    header.className =
        `px-row-x ${topPadding} pb-1 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none`;
    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = text;
    header.appendChild(label);
    if (trailing)
        header.appendChild(trailing);
    return header;
}
function scheduleSettingsSurfaceHidden() {
    if (!state.settingsSurfaceVisible || state.settingsSurfaceHideTimer)
        return;
    state.settingsSurfaceHideTimer = setTimeout(() => {
        state.settingsSurfaceHideTimer = null;
        const sidebar = findSidebarItemsGroup();
        if (sidebar && isSettingsSidebarCandidate(sidebar))
            return;
        if (isSettingsTextVisible())
            return;
        setSettingsSurfaceVisible(false, "sidebar-not-found");
    }, 1500);
}
function isSettingsTextVisible() {
    return isCodexPpSettingsLabelSet(codexPpSettingsLabelsFrom(document));
}
function compactSettingsText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
const CODEXPP_CORE_SETTINGS_LABELS = [
    "General",
    "일반",
    "常规",
    "通用",
    "Appearance",
    "외관",
    "外观",
    "Configuration",
    "구성",
    "配置",
    "Default permissions",
    "기본 권한",
    "默认权限",
    "Personalization",
    "개인화",
    "个性化",
].map(normalizeCodexPpSettingsLabel);
const CODEXPP_EXTENDED_SETTINGS_LABELS = [
    "Account",
    "계정",
    "账户",
    "账号",
    "General",
    "일반",
    "常规",
    "通用",
    "Appearance",
    "외관",
    "外观",
    "Configuration",
    "구성",
    "配置",
    "Default permissions",
    "기본 권한",
    "默认权限",
    "Personalization",
    "개인화",
    "个性化",
    "Keyboard shortcuts",
    "키보드 단축키",
    "Archived chats",
    "보관된 채팅",
    "Usage",
    "사용량",
    "Computer use",
    "컴퓨터 사용",
    "Browser use",
    "브라우저 사용",
    "MCP servers",
    "MCP Servers",
    "MCP 서버",
    "MCP 服务器",
    "Git",
    "Environments",
    "환경",
    "环境",
    "Cloud Environments",
    "클라우드 환경",
    "Worktrees",
    "작업 트리",
    "Connections",
    "연결",
    "Plugins",
    "플러그인",
    "Skills",
    "스킬",
].map(normalizeCodexPpSettingsLabel);
const CODEXPP_SETTINGS_ONLY_LABELS = [
    "General",
    "일반",
    "常规",
    "通用",
    "Appearance",
    "외관",
    "外观",
    "Configuration",
    "구성",
    "配置",
    "Default permissions",
    "기본 권한",
    "默认权限",
    "Personalization",
    "개인화",
    "个性化",
    "Keyboard shortcuts",
    "키보드 단축키",
    "Archived chats",
    "보관된 채팅",
    "Usage",
    "사용량",
    "Computer use",
    "컴퓨터 사용",
    "Browser use",
    "브라우저 사용",
    "MCP servers",
    "MCP Servers",
    "MCP 서버",
    "MCP 服务器",
    "Git",
    "Environments",
    "환경",
    "环境",
    "Cloud Environments",
    "클라우드 환경",
    "Worktrees",
    "작업 트리",
    "Connections",
    "연결",
].map(normalizeCodexPpSettingsLabel);
const CODEXPP_MAIN_APP_NAV_LABELS = [
    "New chat",
    "새 채팅",
    "Quick chat",
    "빠른 채팅",
    "快速对话",
    "Search",
    "검색",
    "搜索",
    "Plugins",
    "플러그인",
    "插件",
    "Automations",
    "Automation",
    "자동화",
    "自动化",
    "Chats",
    "Chat",
    "채팅",
    "对话",
    "Projects",
    "프로젝트",
    "项目",
    "Pinned",
    "고정됨",
    "Settings",
    "설정",
    "设置",
    "Work locally",
    "로컬에서 작업",
].map(normalizeCodexPpSettingsLabel);
function normalizeCodexPpSettingsLabel(value) {
    return compactSettingsText(value)
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’‘`´]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}
function codexPpControlLabel(el) {
    return normalizeCodexPpSettingsLabel(el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.textContent ||
        "");
}
function codexPpSettingsLabelsFrom(root) {
    const controls = Array.from(root.querySelectorAll("button,a,[role='button'],[role='link']"));
    return [
        ...new Set(controls
            .map(codexPpControlLabel)
            .filter(Boolean)),
    ];
}
function codexPpSettingsLabelScore(labels) {
    const core = new Set();
    const total = new Set();
    for (const label of labels) {
        for (const marker of CODEXPP_CORE_SETTINGS_LABELS) {
            if (codexPpLabelMatchesMarker(label, marker))
                core.add(marker);
        }
        for (const marker of CODEXPP_EXTENDED_SETTINGS_LABELS) {
            if (codexPpLabelMatchesMarker(label, marker))
                total.add(marker);
        }
    }
    return { core: core.size, total: total.size };
}
function codexPpLabelMatchesMarker(label, marker) {
    return label === marker || label.includes(marker);
}
function codexPpMarkerCount(labels, markers) {
    const matched = new Set();
    for (const label of labels) {
        for (const marker of markers) {
            if (codexPpLabelMatchesMarker(label, marker))
                matched.add(marker);
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
    if (!el.isConnected)
        return null;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden")
        return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0)
        return null;
    return rect;
}
function setSettingsSurfaceVisible(visible, reason) {
    if (state.settingsSurfaceVisible === visible)
        return;
    state.settingsSurfaceVisible = visible;
    if (visible)
        warmTweakStore();
    try {
        window.__codexppSettingsSurfaceVisible = visible;
        document.documentElement.dataset.codexppSettingsSurface = visible ? "true" : "false";
        window.dispatchEvent(new CustomEvent("codexpp:settings-surface", {
            detail: { visible, reason },
        }));
    }
    catch { }
    plog("settings surface", { visible, reason, url: location.href });
}
/**
 * Render (or re-render) the second sidebar group of per-tweak pages. The
 * group is created lazily and removed when the last page unregisters, so
 * users with no page-registering tweaks never see an empty "Tweaks" header.
 */
function syncPagesGroup() {
    const outer = state.sidebarRoot;
    if (!outer)
        return;
    if (!isSettingsSidebarCandidate(outer)) {
        state.sidebarRoot = null;
        state.pagesGroup = null;
        state.pagesGroupKey = null;
        for (const p of state.pages.values())
            p.navButton = null;
        return;
    }
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
        for (const p of state.pages.values())
            p.navButton = null;
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
    }
    else {
        // Strip prior buttons (keep the header at index 0).
        while (group.children.length > 1)
            group.removeChild(group.lastChild);
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
function makeSidebarItem(label, iconSvg) {
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
function appendSidebarStoreUpdateBadge(btn) {
    const inner = btn.firstElementChild;
    if (!inner)
        return;
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
        zIndex: "1",
    });
    applyStoreUpdateBadgeStyle(badge, null);
    btn.appendChild(badge);
}
function setNavActive(active) {
    // Built-in (Config/Tweaks) buttons.
    if (state.navButtons) {
        const builtin = active?.kind === "config" ? "config" :
            active?.kind === "tweaks" ? "tweaks" :
                active?.kind === "store" ? "store" : null;
        for (const [key, btn] of Object.entries(state.navButtons)) {
            applyNavActive(btn, key === builtin);
        }
    }
    // Per-page registered buttons.
    for (const p of state.pages.values()) {
        if (!p.navButton)
            continue;
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
function syncCodexNativeNavActive(mute) {
    if (!mute)
        return;
    const root = state.sidebarRoot;
    if (!root)
        return;
    const buttons = Array.from(root.querySelectorAll("button"));
    for (const btn of buttons) {
        // Skip our own buttons.
        if (btn.dataset.codexpp)
            continue;
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
            inner
                .querySelector("svg")
                ?.classList.add("text-token-list-active-selection-icon-foreground");
        }
    }
    else {
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
function activatePage(page) {
    const content = findContentArea();
    if (!content) {
        plog("activate: content area not found");
        return;
    }
    state.activePage = page;
    plog("activate", { page });
    // Hide Codex's content children, show ours.
    for (const child of Array.from(content.children)) {
        if (child.dataset.codexpp === "tweaks-panel")
            continue;
        if (child.dataset.codexppHidden === undefined) {
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
    // restore Codex's view. Re-register if needed.
    const sidebar = state.sidebarRoot;
    if (sidebar) {
        if (state.sidebarRestoreHandler) {
            sidebar.removeEventListener("click", state.sidebarRestoreHandler, true);
        }
        const handler = (e) => {
            const target = e.target;
            if (!target)
                return;
            if (state.navGroup?.contains(target))
                return; // our buttons
            if (state.pagesGroup?.contains(target))
                return; // our page buttons
            if (target.closest("[data-codexpp-settings-search]"))
                return;
            restoreCodexView();
        };
        state.sidebarRestoreHandler = handler;
        sidebar.addEventListener("click", handler, true);
    }
}
function restoreCodexView() {
    plog("restore codex view");
    const content = findContentArea();
    if (!content)
        return;
    if (state.panelHost)
        state.panelHost.style.display = "none";
    for (const child of Array.from(content.children)) {
        if (child === state.panelHost)
            continue;
        if (child.dataset.codexppHidden !== undefined) {
            child.style.display = child.dataset.codexppHidden;
            delete child.dataset.codexppHidden;
        }
    }
    state.activePage = null;
    setNavActive(null);
    if (state.sidebarRoot && state.sidebarRestoreHandler) {
        state.sidebarRoot.removeEventListener("click", state.sidebarRestoreHandler, true);
        state.sidebarRestoreHandler = null;
    }
}
function rerender() {
    if (!state.activePage)
        return;
    const host = state.panelHost;
    if (!host)
        return;
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
            try {
                entry.teardown?.();
            }
            catch { }
            entry.teardown = null;
            const ret = entry.page.render(root.sectionsWrap);
            if (typeof ret === "function")
                entry.teardown = ret;
        }
        catch (e) {
            const err = document.createElement("div");
            err.className = "text-token-charts-red text-sm";
            err.textContent = `Error rendering page: ${e.message}`;
            root.sectionsWrap.appendChild(err);
        }
        return;
    }
    const title = ap.kind === "tweaks" ? "Tweaks" :
        ap.kind === "store" ? "Tweak Store" : "Codex++";
    const subtitle = ap.kind === "tweaks"
        ? "Manage your installed Codex++ tweaks."
        : ap.kind === "store"
            ? "Install reviewed tweaks pinned to approved GitHub commits."
            : "Checking installed Codex++ version.";
    const root = panelShell(title, subtitle);
    host.appendChild(root.outer);
    if (ap.kind === "tweaks")
        renderTweaksPage(root.sectionsWrap);
    else if (ap.kind === "store")
        renderTweakStorePage(root.sectionsWrap, root.headerActions);
    else
        renderConfigPage(root.sectionsWrap, root.subtitle);
}
// ───────────────────────────────────────────────────────────── pages ──
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
    void electron_1.ipcRenderer
        .invoke("codexpp:get-config")
        .then((config) => {
        if (subtitle) {
            subtitle.textContent = `You have Codex++ ${config.version} installed.`;
        }
        card.textContent = "";
        renderCodexPlusPlusConfig(card, config);
    })
        .catch((e) => {
        if (subtitle)
            subtitle.textContent = "Could not load installed Codex++ version.";
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
    if (config.updateCheck)
        card.appendChild(releaseNotesRow(config.updateCheck));
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
    row.appendChild(switchControl(config.autoUpdate, async (next) => {
        await electron_1.ipcRenderer.invoke("codexpp:set-auto-update", next);
    }));
    return row;
}
function updateChannelRow(config) {
    const row = actionRow("Release channel", updateChannelSummary(config));
    const action = row.querySelector("[data-codexpp-row-actions]");
    const select = document.createElement("select");
    select.className =
        "h-8 rounded-lg border border-token-border bg-transparent px-2 text-sm text-token-text-primary focus:outline-none";
    for (const [value, label] of [
        ["stable", "Stable"],
        ["prerelease", "Prerelease"],
        ["custom", "Custom"],
    ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = config.updateChannel === value;
        select.appendChild(option);
    }
    select.addEventListener("change", () => {
        void electron_1.ipcRenderer
            .invoke("codexpp:set-update-config", { updateChannel: select.value })
            .then(() => refreshConfigCard(row))
            .catch((e) => plog("set update channel failed", String(e)));
    });
    action?.appendChild(select);
    if (config.updateChannel === "custom") {
        action?.appendChild(compactButton("Edit", () => {
            const repo = window.prompt("GitHub repo", config.updateRepo || "b-nnett/codex-plusplus");
            if (repo === null)
                return;
            const ref = window.prompt("Git ref", config.updateRef || "main");
            if (ref === null)
                return;
            void electron_1.ipcRenderer
                .invoke("codexpp:set-update-config", {
                updateChannel: "custom",
                updateRepo: repo,
                updateRef: ref,
            })
                .then(() => refreshConfigCard(row))
                .catch((e) => plog("set custom update source failed", String(e)));
        }));
    }
    return row;
}
function installationSourceRow(source) {
    return rowSimple("Installation source", `${source.label}: ${source.detail}`);
}
function selfUpdateStatusRow(state) {
    const row = rowSimple("Last Codex++ update", selfUpdateSummary(state));
    const left = row.firstElementChild;
    if (left && state)
        left.prepend(statusBadge(selfUpdateStatusTone(state.status), selfUpdateStatusLabel(state.status)));
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
        actions.appendChild(compactButton("Release Notes", () => {
            void electron_1.ipcRenderer.invoke("codexpp:open-external", check.releaseUrl);
        }));
    }
    actions.appendChild(compactButton("Check Now", () => {
        row.style.opacity = "0.65";
        void electron_1.ipcRenderer
            .invoke("codexpp:check-codexpp-update", true)
            .then((check) => {
            setSidebarCodexPlusPlusUpdateButton(check);
            refreshConfigCard(row);
        })
            .catch((e) => plog("Codex++ release check failed", String(e)))
            .finally(() => {
            row.style.opacity = "";
        });
    }));
    actions.appendChild(compactButton("Download Update", () => {
        row.style.opacity = "0.65";
        const buttons = actions.querySelectorAll("button");
        buttons.forEach((button) => (button.disabled = true));
        void electron_1.ipcRenderer
            .invoke("codexpp:run-codexpp-update")
            .then(() => {
            refreshSidebarCodexPlusPlusUpdateButton(true);
            refreshConfigCard(row);
        })
            .catch((e) => {
            plog("Codex++ self-update failed", String(e));
            void refreshConfigCard(row);
        })
            .finally(() => {
            row.style.opacity = "";
            buttons.forEach((button) => (button.disabled = false));
        });
    }));
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
    body.className =
        "max-h-60 overflow-auto rounded-md border border-token-border bg-token-foreground/5 p-3 text-sm text-token-text-secondary";
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
        if (paragraph.length === 0)
            return;
        const p = document.createElement("p");
        p.className = "m-0 leading-5";
        appendInlineMarkdown(p, paragraph.join(" ").trim());
        root.appendChild(p);
        paragraph = [];
    };
    const flushList = () => {
        if (!list)
            return;
        root.appendChild(list);
        list = null;
    };
    const flushCode = () => {
        if (!codeLines)
            return;
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
            if (codeLines)
                flushCode();
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
function appendInlineMarkdown(parent, text) {
    const pattern = /(`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
        if (match.index === undefined)
            continue;
        appendText(parent, text.slice(lastIndex, match.index));
        if (match[2] !== undefined) {
            const code = document.createElement("code");
            code.className =
                "rounded border border-token-border bg-token-foreground/10 px-1 py-0.5 text-xs text-token-text-primary";
            code.textContent = match[2];
            parent.appendChild(code);
        }
        else if (match[3] !== undefined && match[4] !== undefined) {
            const a = document.createElement("a");
            a.className = "text-token-text-primary underline underline-offset-2";
            a.href = match[4];
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = match[3];
            parent.appendChild(a);
        }
        else if (match[5] !== undefined) {
            const strong = document.createElement("strong");
            strong.className = "font-medium text-token-text-primary";
            strong.textContent = match[5];
            parent.appendChild(strong);
        }
        else if (match[6] !== undefined) {
            const em = document.createElement("em");
            em.textContent = match[6];
            parent.appendChild(em);
        }
        lastIndex = match.index + match[0].length;
    }
    appendText(parent, text.slice(lastIndex));
}
function appendText(parent, text) {
    if (text)
        parent.appendChild(document.createTextNode(text));
}
function renderWatcherHealthCard(card) {
    void electron_1.ipcRenderer
        .invoke("codexpp:get-watcher-health")
        .then((health) => {
        card.textContent = "";
        renderWatcherHealth(card, health);
    })
        .catch((e) => {
        card.textContent = "";
        card.appendChild(rowSimple("Could not check watcher", String(e)));
    });
}
function renderWatcherHealth(card, health) {
    card.appendChild(watcherSummaryRow(health));
    for (const check of health.checks) {
        if (check.status === "ok")
            continue;
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
    action.appendChild(compactButton("Check Now", () => {
        const card = row.parentElement;
        if (!card)
            return;
        card.textContent = "";
        card.appendChild(rowSimple("Checking watcher", "Verifying the updater repair service."));
        renderWatcherHealthCard(card);
    }));
    row.appendChild(action);
    return row;
}
function watcherCheckRow(check) {
    const row = rowSimple(check.name, check.detail);
    const left = row.firstElementChild;
    if (left)
        left.prepend(statusBadge(check.status));
    return row;
}
function statusBadge(status, label) {
    const badge = document.createElement("span");
    const tone = status === "ok"
        ? "border-token-charts-green text-token-charts-green"
        : status === "warn"
            ? "border-token-charts-yellow text-token-charts-yellow"
            : "border-token-charts-red text-token-charts-red";
    badge.className = `inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`;
    badge.textContent = label || (status === "ok" ? "OK" : status === "warn" ? "Review" : "Error");
    return badge;
}
function updateSummary(check) {
    if (!check)
        return "No update check has run yet.";
    const latest = check.latestVersion ? `Latest v${check.latestVersion}. ` : "";
    const checked = `Checked ${new Date(check.checkedAt).toLocaleString()}.`;
    if (check.error)
        return `${latest}${checked} ${check.error}`;
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
function selfUpdateSummary(state) {
    if (!state)
        return "No automatic Codex++ update has run yet.";
    const checked = new Date(state.completedAt ?? state.checkedAt).toLocaleString();
    const target = state.latestVersion ? ` Target v${state.latestVersion}.` : state.targetRef ? ` Target ${state.targetRef}.` : "";
    const source = state.installationSource?.label ?? "unknown source";
    if (state.status === "failed")
        return `Failed ${checked}.${target} ${state.error ?? "Unknown error"}`;
    if (state.status === "updated")
        return `Updated ${checked}.${target} Source: ${source}.`;
    if (state.status === "up-to-date")
        return `Up to date ${checked}.${target} Source: ${source}.`;
    if (state.status === "disabled")
        return `Skipped ${checked}; automatic refresh is disabled.`;
    return `Checking for updates. Source: ${source}.`;
}
function selfUpdateStatusTone(status) {
    if (status === "failed")
        return "error";
    if (status === "disabled" || status === "checking")
        return "warn";
    return "ok";
}
function selfUpdateStatusLabel(status) {
    if (status === "up-to-date")
        return "Up to date";
    if (status === "updated")
        return "Updated";
    if (status === "failed")
        return "Failed";
    if (status === "disabled")
        return "Disabled";
    return "Checking";
}
function refreshConfigCard(row) {
    const card = row.closest("[data-codexpp-config-card]");
    if (!card)
        return;
    card.textContent = "";
    card.appendChild(rowSimple("Refreshing", "Loading current Codex++ update status."));
    void electron_1.ipcRenderer
        .invoke("codexpp:get-config")
        .then((config) => {
        card.textContent = "";
        renderCodexPlusPlusConfig(card, config);
    })
        .catch((e) => {
        card.textContent = "";
        card.appendChild(rowSimple("Could not refresh update settings", String(e)));
    });
}
function uninstallRow() {
    const row = actionRow("Uninstall Codex++", "Copies the uninstall command. Run it from a terminal after quitting Codex.");
    const action = row.querySelector("[data-codexpp-row-actions]");
    action?.appendChild(compactButton("Copy Command", () => {
        void electron_1.ipcRenderer
            .invoke("codexpp:copy-text", "node ~/.codex-plusplus/source/packages/installer/dist/cli.js uninstall")
            .catch((e) => plog("copy uninstall command failed", String(e)));
    }));
    return row;
}
function reportBugRow() {
    const row = actionRow("Report a bug", "Open a GitHub issue with runtime, installer, or tweak-manager details.");
    const action = row.querySelector("[data-codexpp-row-actions]");
    action?.appendChild(compactButton("Open Issue", () => {
        const title = encodeURIComponent("[Bug]: ");
        const body = encodeURIComponent([
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
        ].join("\n"));
        void electron_1.ipcRenderer.invoke("codexpp:open-external", `https://github.com/b-nnett/codex-plusplus/issues/new?title=${title}&body=${body}`);
    }));
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
    }
    else {
        renderTweakStoreGhostGrid(grid);
    }
    section.appendChild(source);
    section.appendChild(grid);
    sectionsWrap.appendChild(section);
    refreshTweakStoreGrid(grid, source, refreshBtn);
}
function refreshTweakStoreGrid(grid, source, refreshBtn, force = false) {
    void getTweakStore(force)
        .then((store) => {
        grid.dataset.codexppStore = JSON.stringify(store);
        renderTweakStoreGrid(grid, source);
    })
        .catch((e) => {
        grid.dataset.codexppStore = "";
        grid.removeAttribute("aria-busy");
        source.textContent = "Live registry unavailable";
        updateStoreUpdateBadge(null);
        grid.textContent = "";
        grid.appendChild(storeMessageCard("Could not load tweak store", String(e)));
    })
        .finally(() => {
        if (refreshBtn)
            refreshBtn.disabled = false;
    });
}
function warmTweakStore() {
    if (state.tweakStore || state.tweakStorePromise)
        return;
    void getTweakStore().then((store) => {
        updateStoreUpdateBadge(outdatedInstalledStoreCount(store.entries));
    });
}
function getTweakStore(force = false) {
    if (!force) {
        if (state.tweakStore)
            return Promise.resolve(state.tweakStore);
        if (state.tweakStorePromise)
            return state.tweakStorePromise;
    }
    state.tweakStoreError = null;
    const promise = electron_1.ipcRenderer
        .invoke("codexpp:get-tweak-store")
        .then((store) => {
        state.tweakStore = store;
        return state.tweakStore;
    })
        .catch((e) => {
        state.tweakStoreError = e;
        throw e;
    })
        .finally(() => {
        if (state.tweakStorePromise === promise)
            state.tweakStorePromise = null;
    });
    state.tweakStorePromise = promise;
    return promise;
}
function renderTweakStoreGrid(grid, source) {
    const store = parseStoreDataset(grid);
    if (!store)
        return;
    const entries = store.entries;
    grid.removeAttribute("aria-busy");
    source.textContent = `Refreshed ${new Date(store.fetchedAt).toLocaleString()}`;
    updateStoreUpdateBadge(outdatedInstalledStoreCount(entries));
    grid.textContent = "";
    if (store.entries.length === 0) {
        grid.appendChild(storeMessageCard("No tweaks yet", "Use Publish Tweak to submit the first one."));
        return;
    }
    for (const entry of entries)
        grid.appendChild(tweakStoreCard(entry));
}
function parseStoreDataset(grid) {
    const raw = grid.dataset.codexppStore;
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
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
        actions.appendChild(compactButton("Release", () => {
            void electron_1.ipcRenderer.invoke("codexpp:open-external", entry.releaseUrl);
        }));
    }
    const hasUpdate = !!entry.installed && entry.installed.version !== entry.manifest.version;
    if (entry.installed && !hasUpdate) {
        actions.appendChild(storeStatusPill("Installed"));
    }
    else if (entry.platform && !entry.platform.compatible) {
        card.classList.add("opacity-70");
        actions.appendChild(storeStatusPill(platformLockedLabel(entry.platform)));
    }
    else if (entry.runtime && !entry.runtime.compatible) {
        card.classList.add("opacity-70");
        actions.appendChild(storeStatusPill(runtimeLockedLabel(entry.runtime)));
    }
    else {
        const installLabel = entry.installed ? "Update" : "Install";
        if (hasUpdate)
            actions.appendChild(storeStatusPill("Update available", "info"));
        const installButton = storeInstallButton(installLabel, (button) => {
            const grid = card.closest("[data-codexpp-store-grid]");
            const source = grid?.parentElement?.querySelector("[data-codexpp-store-source]");
            showStoreButtonLoading(button, entry.installed ? "Updating" : "Installing");
            actions.querySelectorAll("button").forEach((button) => (button.disabled = true));
            void electron_1.ipcRenderer
                .invoke("codexpp:install-store-tweak", entry.id)
                .then(() => {
                showStoreToast(`${entry.manifest.name} installed.`);
                showStoreButtonInstalled(button);
                versions.replaceChildren(tweakStoreVersionBadge(entry, entry.manifest.version));
                updateStoreUpdateBadge(Math.max(0, currentStoreUpdateBadgeCount() - 1));
                setTimeout(() => {
                    actions.replaceChildren(storeStatusPill("Installed"));
                    if (grid && source)
                        refreshTweakStoreGrid(grid, source, undefined, true);
                }, 900);
            })
                .catch((e) => {
                resetStoreInstallButton(button, installLabel);
                actions.querySelectorAll("button").forEach((button) => (button.disabled = false));
                showStoreCardMessage(card, String(e.message ?? e));
            });
        });
        actions.appendChild(installButton);
    }
    return card;
}
function platformLockedLabel(platform) {
    const supported = platform.supported ?? [];
    if (supported.includes("win32"))
        return "Windows only";
    if (supported.includes("darwin"))
        return "macOS only";
    if (supported.includes("linux"))
        return "Linux only";
    return "Unavailable";
}
function runtimeLockedLabel(runtime) {
    return runtime.required ? `Requires Codex++ ${runtime.required}` : "Requires newer Codex++";
}
function showStoreCardMessage(card, message) {
    card.querySelector("[data-codexpp-store-card-message]")?.remove();
    const notice = document.createElement("div");
    notice.dataset.codexppStoreCardMessage = "true";
    notice.className =
        "rounded-lg border border-token-border/50 bg-token-foreground/5 px-3 py-2 text-sm leading-5 text-token-description-foreground";
    notice.textContent = message;
    const actions = card.lastElementChild;
    if (actions)
        card.insertBefore(notice, actions);
    else
        card.appendChild(notice);
}
function tweakStoreCardShell() {
    const card = document.createElement("div");
    card.className =
        "border-token-border/40 flex min-h-[190px] flex-col justify-between gap-4 rounded-2xl border p-4 transition-colors hover:bg-token-foreground/5";
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
    readMore.className =
        "inline-flex w-fit items-center gap-1 text-sm font-medium text-token-text-link-foreground hover:underline";
    readMore.innerHTML =
        `Read More` +
            `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
            `<path d="M6 3.5h6.5V10M12.25 3.75 4 12" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>` +
            `</svg>`;
    readMore.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void electron_1.ipcRenderer.invoke("codexpp:open-external", `https://github.com/${repo}`);
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
    avatar.className =
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-token-border-default bg-transparent text-token-description-foreground";
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
    avatar.className =
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-token-border-default bg-transparent text-token-description-foreground";
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
    if (!iconUrl)
        return null;
    if (/^(https?:|data:)/i.test(iconUrl))
        return iconUrl;
    const rel = iconUrl.replace(/^\.?\//, "");
    if (!rel || rel.startsWith("../"))
        return null;
    return `https://raw.githubusercontent.com/${entry.repo}/${entry.approvedCommitSha}/${rel}`;
}
function sidebarUpdatePillButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.codexppSidebarUpdate = "true";
    btn.className =
        "user-select-none no-drag cursor-interaction inline-flex shrink-0 items-center justify-center whitespace-nowrap";
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
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.18)",
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
        void electron_1.ipcRenderer.invoke("codexpp:open-external", btn.dataset.codexppReleaseUrl || CODEX_PLUSPLUS_RELEASES_URL);
    });
    return btn;
}
function refreshSidebarCodexPlusPlusUpdateButton(force = false) {
    const btn = state.codexPlusPlusUpdateButton;
    if (!btn)
        return;
    void electron_1.ipcRenderer
        .invoke("codexpp:check-codexpp-update", force)
        .then((check) => setSidebarCodexPlusPlusUpdateButton(check))
        .catch((e) => {
        plog("Codex++ sidebar release check failed", String(e));
        setSidebarCodexPlusPlusUpdateButton(null);
    });
}
function setSidebarCodexPlusPlusUpdateButton(check) {
    const btn = state.codexPlusPlusUpdateButton;
    if (!btn)
        return;
    const updateAvailable = check?.updateAvailable === true;
    btn.style.display = updateAvailable ? "inline-flex" : "none";
    btn.hidden = !updateAvailable;
    btn.dataset.codexppReleaseUrl = check?.releaseUrl || CODEX_PLUSPLUS_RELEASES_URL;
    btn.title =
        updateAvailable && check?.latestVersion
            ? `Open Codex++ ${check.latestVersion} update`
            : "Open Codex++ update";
}
function updateStoreUpdateBadge(count) {
    const badge = document.querySelector("[data-codexpp-store-update-badge]");
    if (!badge)
        return;
    badge.dataset.codexppStoreUpdateCount = count === null ? "" : String(count);
    applyStoreUpdateBadgeStyle(badge, count);
    badge.hidden = count === null || count <= 0;
    badge.textContent = count && count > 0 ? String(count) : "";
    badge.title =
        count && count > 0
            ? `${count} installed tweak${count === 1 ? "" : "s"} can be updated`
            : "Installed tweaks are up to date";
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
        boxShadow: hasUpdates ? "0 1px 2px rgba(0, 0, 0, 0.22)" : "none",
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
    btn.className =
        variant === "primary"
            ? "border-token-border user-select-none no-drag cursor-interaction flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-token-border bg-token-bg-fog px-2 py-0 text-sm text-token-button-tertiary-foreground enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40"
            : "border-token-border user-select-none no-drag cursor-interaction flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-transparent bg-token-foreground/5 px-2 py-0 text-sm text-token-foreground enabled:hover:bg-token-foreground/10 disabled:cursor-not-allowed disabled:opacity-40";
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
    btn.className =
        "border-token-border user-select-none no-drag cursor-interaction flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-token-foreground/5 p-0 text-token-foreground enabled:hover:bg-token-foreground/10 disabled:cursor-not-allowed disabled:opacity-40";
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
    return (`<svg width="18" height="18" viewBox="0 0 20 20" fill="none" class="icon-xs" aria-hidden="true">` +
        `<path d="M4.4 9.35A5.65 5.65 0 0 1 14 5.3L15.75 7M15.75 3.75V7h-3.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M15.6 10.65A5.65 5.65 0 0 1 6 14.7L4.25 13M4.25 16.25V13H7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`);
}
function verifiedSafeBadge() {
    const badge = document.createElement("span");
    badge.className =
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-token-border/30 bg-transparent px-2 text-xs font-medium text-token-description-foreground";
    badge.innerHTML =
        `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" class="text-blue-500" aria-hidden="true">` +
            `<path d="M7 1.75 11.25 3.4v3.2c0 2.6-1.65 4.25-4.25 5.4-2.6-1.15-4.25-2.8-4.25-5.4V3.4L7 1.75Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>` +
            `<path d="M4.85 7.05 6.3 8.45l2.85-3.05" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>` +
            `</svg>` +
            `<span>Verified as safe</span>`;
    return badge;
}
function tweakStoreVersionBadge(entry, installedOverride) {
    const installed = installedOverride ?? entry.installed?.version ?? null;
    const latest = entry.manifest.version;
    const hasUpdate = !!installed && installed !== latest;
    const badge = storeVersionBadgeShell(hasUpdate);
    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = installed
        ? `Installed v${installed} · Latest v${latest}`
        : `Latest v${latest}`;
    badge.title = installed
        ? `Installed version ${installed}. Latest approved version ${latest}.`
        : `Latest approved version ${latest}.`;
    badge.appendChild(label);
    return badge;
}
function storeVersionBadgeShell(hasUpdate) {
    const badge = document.createElement("span");
    badge.className = [
        "inline-flex h-8 min-w-0 max-w-full items-center rounded-lg border px-2.5 text-xs font-medium",
        hasUpdate
            ? "border-blue-500/30 bg-blue-500/10 text-token-foreground"
            : "border-token-border/40 bg-token-foreground/5 text-token-description-foreground",
    ].join(" ");
    return badge;
}
function storeStatusPill(label, tone = "neutral") {
    const pill = document.createElement("span");
    pill.className = [
        "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium",
        tone === "info"
            ? "border border-blue-500/30 bg-blue-500/10 text-token-foreground"
            : "bg-token-foreground/5 text-token-description-foreground",
    ].join(" ");
    pill.textContent = label;
    return pill;
}
function storeInstallButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
        storeInstallButtonClass();
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
        extra,
    ].filter(Boolean).join(" ");
}
function showStoreButtonLoading(button, label) {
    button.className = storeInstallButtonClass();
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML =
        `<svg class="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
            `<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2" opacity=".25"/>` +
            `<path d="M13.5 8A5.5 5.5 0 0 0 8 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>` +
            `</svg>` +
            `<span>${label}</span>`;
}
function showStoreButtonInstalled(button) {
    button.className = storeInstallButtonClass("border-blue-500 bg-blue-500");
    button.disabled = true;
    button.removeAttribute("aria-busy");
    button.innerHTML =
        `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
            `<path d="M3.75 8.15 6.65 11 12.25 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
            `</svg>` +
            `<span>Installed</span>`;
}
function resetStoreInstallButton(button, label) {
    button.className = storeInstallButtonClass();
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
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
    toast.className =
        "translate-y-2 rounded-xl border border-token-border/50 bg-token-main-surface-primary px-3 py-2 text-sm font-medium text-token-foreground opacity-0 shadow-lg transition-all duration-200";
    toast.textContent = message;
    host.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    });
    setTimeout(() => {
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => {
            toast.remove();
            if (host && host.childElementCount === 0)
                host.remove();
        }, 220);
    }, 2600);
}
function storeMessageCard(title, description) {
    const card = document.createElement("div");
    card.className =
        "border-token-border/40 flex min-h-[84px] flex-col justify-center gap-1 rounded-2xl border p-4 text-sm";
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
function shortSha(value) {
    return value.slice(0, 7);
}
function renderTweaksPage(sectionsWrap) {
    const openBtn = openInPlaceButton("Open Tweaks Folder", () => {
        void electron_1.ipcRenderer.invoke("codexpp:reveal", tweaksPath());
    });
    const reloadBtn = openInPlaceButton("Force Reload", () => {
        // Full page refresh — same as DevTools Cmd-R / our CDP Page.reload.
        // Main re-discovers tweaks first so the new renderer comes up with a
        // fresh tweak set; then location.reload restarts the renderer so the
        // preload re-initializes against it.
        void electron_1.ipcRenderer
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
        card.appendChild(rowSimple("No tweaks installed", `Drop a tweak folder into ${tweaksPath()} and reload.`));
        section.appendChild(card);
        sectionsWrap.appendChild(section);
        return;
    }
    // Group registered SettingsSections by tweak id (prefix split at ":").
    const sectionsByTweak = new Map();
    for (const s of state.sections.values()) {
        const tweakId = s.id.split(":")[0];
        if (!sectionsByTweak.has(tweakId))
            sectionsByTweak.set(tweakId, []);
        sectionsByTweak.get(tweakId).push(s);
    }
    const pagesByTweak = new Map();
    for (const p of state.pages.values()) {
        if (!pagesByTweak.has(p.tweakId))
            pagesByTweak.set(p.tweakId, []);
        pagesByTweak.get(p.tweakId).push(p);
    }
    const wrap = document.createElement("section");
    wrap.className = "flex flex-col gap-2";
    wrap.appendChild(sectionTitle("Installed Tweaks", trailing));
    const card = roundedCard();
    for (const t of state.listedTweaks) {
        card.appendChild(tweakRow(t, sectionsByTweak.get(t.manifest.id) ?? [], pagesByTweak.get(t.manifest.id) ?? []));
    }
    wrap.appendChild(card);
    sectionsWrap.appendChild(wrap);
}
function tweakRow(t, sections, pages) {
    const m = t.manifest;
    // Outer cell wraps the header row + (optional) nested sections so the
    // parent card's divider stays between *tweaks*, not between header and
    // body of the same tweak.
    const cell = document.createElement("div");
    cell.className = "flex flex-col";
    if (!t.enabled)
        cell.style.opacity = "0.7";
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
            if (url)
                img.src = url;
            else
                img.remove();
        });
        avatar.appendChild(img);
    }
    else {
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
    if (authorEl)
        meta.appendChild(authorEl);
    if (m.githubRepo) {
        if (meta.children.length > 0)
            meta.appendChild(dot());
        const repo = document.createElement("button");
        repo.type = "button";
        repo.className = "inline-flex text-token-text-link-foreground hover:underline";
        repo.textContent = m.githubRepo;
        repo.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void electron_1.ipcRenderer.invoke("codexpp:open-external", `https://github.com/${m.githubRepo}`);
        });
        meta.appendChild(repo);
    }
    if (m.homepage) {
        if (meta.children.length > 0)
            meta.appendChild(dot());
        const link = document.createElement("a");
        link.href = m.homepage;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = "inline-flex text-token-text-link-foreground hover:underline";
        link.textContent = "Homepage";
        meta.appendChild(link);
    }
    if (meta.children.length > 0)
        stack.appendChild(meta);
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
    if (t.enabled && pages.length > 0) {
        const configureBtn = compactButton("Configure", () => {
            activatePage({ kind: "registered", id: pages[0].id });
        });
        configureBtn.title = pages.length === 1
            ? `Open ${pages[0].page.title}`
            : `Open ${pages.map((p) => p.page.title).join(", ")}`;
        right.appendChild(configureBtn);
    }
    if (t.update?.updateAvailable && t.update.releaseUrl) {
        right.appendChild(compactButton("Review Release", () => {
            void electron_1.ipcRenderer.invoke("codexpp:open-external", t.update.releaseUrl);
        }));
    }
    right.appendChild(switchControl(t.enabled, async (next) => {
        await electron_1.ipcRenderer.invoke("codexpp:set-tweak-enabled", m.id, next);
        // The main process broadcasts a reload which will re-fetch the list
        // and re-render. We don't optimistically toggle to avoid drift.
    }));
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
            }
            catch (e) {
                body.textContent = `Error rendering tweak section: ${e.message}`;
            }
            nested.appendChild(body);
        }
        cell.appendChild(nested);
    }
    return cell;
}
function renderAuthor(author) {
    if (!author)
        return null;
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
    }
    else {
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
    dialog.className =
        "flex w-full max-w-xl flex-col gap-4 rounded-lg border border-token-border bg-token-main-surface-primary p-4 shadow-xl";
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
    repoInput.className =
        "h-10 rounded-lg border border-token-border bg-transparent px-3 text-sm text-token-text-primary focus:outline-none";
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
        if (e.target === overlay)
            overlay.remove();
    });
    document.body.appendChild(overlay);
    repoInput.focus();
}
async function submitPublishTweak(repoInput, status) {
    status.className = "min-h-5 text-sm text-token-text-secondary";
    status.textContent = "Resolving the repo commit to review.";
    try {
        const submission = await electron_1.ipcRenderer.invoke("codexpp:prepare-tweak-store-submission", repoInput.value);
        const url = (0, tweak_store_1.buildTweakPublishIssueUrl)(submission);
        await electron_1.ipcRenderer.invoke("codexpp:open-external", url);
        status.textContent = `GitHub review issue opened for ${submission.commitSha.slice(0, 7)}.`;
    }
    catch (e) {
        status.className = "min-h-5 text-sm text-token-charts-red";
        status.textContent = String(e.message ?? e);
    }
}
// ───────────────────────────────────────────────────────────── components ──
/** The full panel shell (toolbar + scroll + heading + sections wrap). */
function panelShell(title, subtitle, options) {
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
        options?.wide
            ? "mx-auto flex w-full max-w-5xl flex-col electron:min-w-[calc(320px*var(--codex-window-zoom))]"
            : "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
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
function openInPlaceButton(label, onClick) {
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
function compactButton(label, onClick) {
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
function roundedCard() {
    const card = document.createElement("div");
    card.className =
        "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
    card.setAttribute("style", "background-color: var(--color-background-panel, var(--color-token-bg-fog));");
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
/**
 * Codex-styled toggle switch. Markup mirrors the General > Permissions row
 * switch we captured: outer button (role=switch), inner pill, sliding knob.
 */
function switchControl(initial, onChange) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "switch");
    const pill = document.createElement("span");
    const knob = document.createElement("span");
    knob.className =
        "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
    pill.appendChild(knob);
    const apply = (on) => {
        btn.setAttribute("aria-checked", String(on));
        btn.dataset.state = on ? "checked" : "unchecked";
        btn.className =
            "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
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
        }
        finally {
            btn.disabled = false;
        }
    });
    return btn;
}
function dot() {
    const s = document.createElement("span");
    s.className = "text-token-description-foreground";
    s.textContent = "·";
    return s;
}
// ──────────────────────────────────────────────────────────────── icons ──
function configIconSvg() {
    // Sliders / settings glyph. 20x20 currentColor.
    return (`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
        `<path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h11M17 15h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
        `<circle cx="13" cy="5" r="1.6" fill="currentColor"/>` +
        `<circle cx="6" cy="10" r="1.6" fill="currentColor"/>` +
        `<circle cx="15" cy="15" r="1.6" fill="currentColor"/>` +
        `</svg>`);
}
function tweaksIconSvg() {
    // Sparkles / "++" glyph for tweaks.
    return (`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
        `<path d="M10 2.5 L11.4 8.6 L17.5 10 L11.4 11.4 L10 17.5 L8.6 11.4 L2.5 10 L8.6 8.6 Z" fill="currentColor"/>` +
        `<path d="M15.5 3 L16 5 L18 5.5 L16 6 L15.5 8 L15 6 L13 5.5 L15 5 Z" fill="currentColor" opacity="0.7"/>` +
        `</svg>`);
}
function storeIconSvg() {
    return (`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
        `<path d="M4 8.2 5.1 4.5A1.5 1.5 0 0 1 6.55 3.4h6.9a1.5 1.5 0 0 1 1.45 1.1L16 8.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M4.5 8h11v7.5A1.5 1.5 0 0 1 14 17H6a1.5 1.5 0 0 1-1.5-1.5V8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M7.5 8v1a2.5 2.5 0 0 0 5 0V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
        `</svg>`);
}
function defaultPageIconSvg() {
    // Document/page glyph for tweak-registered pages without their own icon.
    return (`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
        `<path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M12 3v3a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
        `</svg>`);
}
async function resolveIconUrl(url, tweakDir) {
    if (/^(https?:|data:)/.test(url))
        return url;
    // Relative path → ask main to read the file and return a data: URL.
    // Renderer is sandboxed so file:// won't load directly.
    const rel = url.startsWith("./") ? url.slice(2) : url;
    try {
        return (await electron_1.ipcRenderer.invoke("codexpp:read-tweak-asset", tweakDir, rel));
    }
    catch (e) {
        plog("icon load failed", { url, tweakDir, err: String(e) });
        return null;
    }
}
// ─────────────────────────────────────────────────────── DOM heuristics ──
function findSidebarItemsGroup() {
    const candidates = Array.from(document.querySelectorAll("aside,nav,[role='navigation'],div"));
    let best = null;
    let bestScore = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        if (candidate.dataset.codexpp)
            continue;
        if (!isSettingsSidebarCandidate(candidate))
            continue;
        const labels = codexPpSettingsLabelsFrom(candidate);
        const score = codexPpSettingsLabelScore(labels);
        const rect = candidate.getBoundingClientRect();
        const area = rect.width * rect.height;
        const weighted = score.core * 100 + score.total;
        if (weighted > bestScore || (weighted === bestScore && area < bestArea)) {
            best = candidate;
            bestScore = weighted;
            bestArea = area;
        }
    }
    return best;
}
const FORBIDDEN_SETTINGS_SIDEBAR_SELECTOR = [
    "[data-composer-overlay-floating-ui='true']",
    "[data-codexpp-slash-menu='true']",
    "[data-codexpp-overlay-noise='true']",
    ".composer-home-top-menu",
    ".vertical-scroll-fade-mask",
    "[class*='[container-name:home-main-content]']",
].join(",");
function isForbiddenSettingsSidebarSurface(node) {
    if (!node)
        return false;
    const el = node instanceof HTMLElement ? node : node.parentElement;
    if (!el)
        return false;
    if (el.closest(FORBIDDEN_SETTINGS_SIDEBAR_SELECTOR))
        return true;
    if (el.querySelector("[data-list-navigation-item='true'], [cmdk-item]"))
        return true;
    return false;
}
function isSettingsSidebarCandidate(el) {
    const rect = codexPpVisibleBox(el);
    if (!rect)
        return false;
    // Current Codex Settings sidebar: left column, not the main content panel.
    if (rect.width < 120 || rect.width > 620)
        return false;
    if (rect.height < 80)
        return false;
    if (rect.left > window.innerWidth * 0.65)
        return false;
    const labels = codexPpSettingsLabelsFrom(el);
    if (hasMainAppSidebarSignals(labels) && !hasCodexPpSettingsOnlySignal(labels)) {
        return false;
    }
    return isCodexPpSettingsLabelSet(labels);
}
function removeMisplacedSettingsGroups() {
    const groups = document.querySelectorAll("[data-codexpp='nav-group'], [data-codexpp='pages-group'], [data-codexpp='native-nav-header']");
    for (const group of Array.from(groups)) {
        if (isCodexPpInjectedSettingsGroupPlacementValid(group))
            continue;
        resetCodexPpInjectedSettingsGroupState(group);
        group.remove();
    }
}
function isCodexPpInjectedSettingsGroupPlacementValid(group) {
    if (isForbiddenSettingsSidebarSurface(group))
        return false;
    let node = group.parentElement;
    for (let depth = 0; node && depth < 4; depth++) {
        if (isForbiddenSettingsSidebarSurface(node))
            return false;
        if (isSettingsSidebarCandidate(node))
            return true;
        node = node.parentElement;
    }
    return false;
}
function resetCodexPpInjectedSettingsGroupState(group) {
    if (state.navGroup === group || (state.navGroup && group.contains(state.navGroup))) {
        state.navGroup = null;
        state.navButtons = null;
        state.codexPlusPlusUpdateButton = null;
    }
    if (state.pagesGroup === group || (state.pagesGroup && group.contains(state.pagesGroup))) {
        state.pagesGroup = null;
        state.pagesGroupKey = null;
        for (const p of state.pages.values())
            p.navButton = null;
    }
    if (state.nativeNavHeader === group || (state.nativeNavHeader && group.contains(state.nativeNavHeader))) {
        state.nativeNavHeader = null;
    }
    if (state.sidebarRoot && state.sidebarRoot.contains(group)) {
        state.sidebarRoot = null;
    }
}
function findContentArea() {
    const sidebar = findSidebarItemsGroup();
    if (!sidebar)
        return null;
    let parent = sidebar.parentElement;
    while (parent) {
        for (const child of Array.from(parent.children)) {
            if (child === sidebar || child.contains(sidebar))
                continue;
            const r = child.getBoundingClientRect();
            if (r.width > 300 && r.height > 200)
                return child;
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
        let panel = null;
        for (const child of Array.from(content.children)) {
            if (child.dataset.codexpp === "tweaks-panel")
                continue;
            if (child.style.display === "none")
                continue;
            panel = child;
            break;
        }
        const activeNav = sidebar
            ? Array.from(sidebar.querySelectorAll("button, a")).find((b) => b.getAttribute("aria-current") === "page" ||
                b.getAttribute("data-active") === "true" ||
                b.getAttribute("aria-selected") === "true" ||
                b.classList.contains("active"))
            : null;
        const heading = panel?.querySelector("h1, h2, h3, [class*='heading']");
        const fingerprint = `${activeNav?.textContent ?? ""}|${heading?.textContent ?? ""}|${panel?.children.length ?? 0}`;
        if (state.fingerprint === fingerprint)
            return;
        state.fingerprint = fingerprint;
        plog("dom probe", {
            url: location.href,
            activeNav: activeNav?.textContent?.trim() ?? null,
            heading: heading?.textContent?.trim() ?? null,
            content: describe(content),
        });
        if (panel) {
            const html = panel.outerHTML;
            plog(`codex panel HTML (${activeNav?.textContent?.trim() ?? "?"})`, html.slice(0, 32000));
        }
    }
    catch (e) {
        plog("dom probe failed", String(e));
    }
}
function describe(el) {
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
function tweaksPath() {
    return (window.__codexpp_tweaks_dir__ ??
        "<user dir>/tweaks");
}
//# sourceMappingURL=settings-injector.js.map