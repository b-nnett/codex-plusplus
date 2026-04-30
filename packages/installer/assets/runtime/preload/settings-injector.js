"use strict";
/**
 * Settings injector for Codex's Settings page.
 *
 * Codex's settings is a routed page (URL stays at `/index.html?hostId=local`)
 * NOT a modal dialog. The sidebar lives inside a `<div class="flex flex-col
 * gap-1 gap-0">` wrapper that holds one or more `<div class="flex flex-col
 * gap-px">` groups of buttons. There are no stable `role` / `data-testid`
 * hooks on the shell so we identify the sidebar by structure instead of
 * localized labels.
 *
 * Layout we inject:
 *
 *   [Codex's existing items group]
 *   ───────────────────────────── (border-t-token-border)
 *   CODEX PLUS PLUS               (uppercase subtitle, text-token-text-tertiary)
 *   ⓘ Config
 *   ☰ Tweaks
 *
 * Clicking Config / Tweaks hides Codex's content panel children and renders
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
const state = {
    sections: new Map(),
    pages: new Map(),
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
    settingsSurfaceHideTimer: null,
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
const DEFAULT_LOCALE = "en";
// Add a language by adding another top-level locale code here, e.g. `ja` or `zh`.
const TRANSLATIONS = {
    ko: {
        "Config": "설정",
        "Tweaks": "트윅",
        "Keyboard Shortcuts": "키보드 단축키",
        "UI Improvements": "UI 개선",
        "Configure Codex++ itself.": "Codex++ 자체 설정을 관리합니다.",
        "Manage your installed Codex++ tweaks.": "설치된 Codex++ 트윅을 관리합니다.",
        "Remap or disable Codex's keyboard shortcuts.": "Codex 키보드 단축키를 변경하거나 비활성화합니다.",
        "Bennett's small quality-of-life tweaks.": "Bennett의 작은 사용성 개선 트윅입니다.",
        "Codex++ Updates": "Codex++ 업데이트",
        "Loading update settings": "업데이트 설정 불러오는 중",
        "Checking current Codex++ configuration.": "현재 Codex++ 설정을 확인하는 중입니다.",
        "Could not load update settings": "업데이트 설정을 불러올 수 없음",
        "Maintenance": "유지보수",
        "Automatically refresh Codex++": "Codex++ 자동 새로고침",
        "Installed version v{version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.": "설치된 버전 v{version}. GitHub installer를 다시 실행한 뒤 watcher가 Codex++ runtime을 새로고침할 수 있습니다.",
        "Codex++ update available": "Codex++ 업데이트 사용 가능",
        "Codex++ is up to date": "Codex++ 최신 상태",
        "Release Notes": "릴리스 노트",
        "Check Now": "지금 확인",
        "Latest release notes": "최신 릴리스 노트",
        "No release notes available.": "릴리스 노트가 없습니다.",
        "No update check has run yet.": "아직 업데이트 확인을 실행하지 않았습니다.",
        "Latest v{version}. ": "최신 v{version}. ",
        "Checked {date}.": "{date}에 확인함.",
        "Uninstall Codex++": "Codex++ 제거",
        "Copies the uninstall command. Run it from a terminal after quitting Codex.": "제거 명령을 복사합니다. Codex를 종료한 뒤 터미널에서 실행하세요.",
        "Copy Command": "명령 복사",
        "Report a bug": "버그 신고",
        "Open a GitHub issue with runtime, installer, or tweak-manager details.": "runtime, installer, tweak-manager 정보를 담아 GitHub 이슈를 엽니다.",
        "Open Issue": "이슈 열기",
        "Open Tweaks Folder": "트윅 폴더 열기",
        "Force Reload": "강제 새로고침",
        "Installed Tweaks": "설치된 트윅",
        "No tweaks installed": "설치된 트윅 없음",
        "Drop a tweak folder into {path} and reload.": "{path}에 트윅 폴더를 넣고 새로고침하세요.",
        "Update Available": "업데이트 있음",
        "Homepage": "홈페이지",
        "Review Release": "릴리스 확인",
    },
};
function preferredLocale() {
    const candidates = [
        document.documentElement.lang,
        navigator.language,
        ...(navigator.languages ?? []),
        Intl.DateTimeFormat().resolvedOptions().locale,
    ];
    for (const locale of candidates) {
        const normalized = locale?.toLowerCase();
        if (!normalized)
            continue;
        if (TRANSLATIONS[normalized])
            return normalized;
        const base = normalized.split("-")[0];
        if (TRANSLATIONS[base])
            return base;
    }
    return DEFAULT_LOCALE;
}
function localize(text, values) {
    const template = TRANSLATIONS[preferredLocale()]?.[text] ?? text;
    if (!values)
        return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => values[key] === undefined ? match : String(values[key]));
}
function localizeOptional(text) {
    return text === undefined ? undefined : localize(text);
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
    if (state.navGroup?.contains(control) || state.pagesGroup?.contains(control))
        return;
    setTimeout(() => {
        if (!findSidebarItemsGroup()) {
            setSettingsSurfaceVisible(false, "settings-control-left-surface");
        }
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
    // ── Group container ───────────────────────────────────────────────────
    const group = document.createElement("div");
    group.dataset.codexpp = "nav-group";
    group.className = "flex flex-col gap-px";
    // ── Section header / subtitle ────────────────────────────────────────
    // Codex doesn't (currently) ship a sidebar group header, so we mirror the
    // visual weight of `text-token-description-foreground` uppercase labels
    // used elsewhere in their UI. Padding matches the `px-row-x` of items.
    const header = document.createElement("div");
    header.className =
        "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
    header.textContent = "Codex Plus Plus";
    group.appendChild(header);
    // ── Two sidebar items ────────────────────────────────────────────────
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
    if (!state.settingsSurfaceVisible || state.settingsSurfaceHideTimer)
        return;
    state.settingsSurfaceHideTimer = setTimeout(() => {
        state.settingsSurfaceHideTimer = null;
        if (findSidebarItemsGroup())
            return;
        if (isSettingsTextVisible())
            return;
        setSettingsSurfaceVisible(false, "sidebar-not-found");
    }, 1500);
}
function isSettingsTextVisible() {
    return !!document.querySelector('[data-codexpp="nav-group"]');
}
function setSettingsSurfaceVisible(visible, reason) {
    if (state.settingsSurfaceVisible === visible)
        return;
    state.settingsSurfaceVisible = visible;
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
    const pages = [...state.pages.values()];
    // Build a deterministic fingerprint of the desired group state. If the
    // current DOM group already matches, this is a no-op — critical, because
    // syncPagesGroup is called on every MutationObserver tick and any DOM
    // write would re-trigger that observer (infinite loop, app freeze).
    const desiredKey = pages.length === 0
        ? "EMPTY"
        : pages.map((p) => `${p.id}|${localize(p.page.title)}|${p.page.iconSvg ?? ""}`).join("\n");
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
        const header = document.createElement("div");
        header.className =
            "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
        header.textContent = localize("Tweaks");
        group.appendChild(header);
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
        ids: pages.map((p) => p.id),
    });
    // Reflect current active state across the rebuilt buttons.
    setNavActive(state.activePage);
}
function makeSidebarItem(label, iconSvg, dataKey = label.toLowerCase()) {
    // Class string copied verbatim from Codex's sidebar buttons (General etc).
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.codexpp = `nav-${dataKey}`;
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
function setNavActive(active) {
    // Built-in (Config/Tweaks) buttons.
    if (state.navButtons) {
        const builtin = active?.kind === "config" ? "config" :
            active?.kind === "tweaks" ? "tweaks" : null;
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
        const root = panelShell(localize(entry.page.title), localizeOptional(entry.page.description));
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
    const title = ap.kind === "tweaks" ? localize("Tweaks") : localize("Config");
    const subtitle = ap.kind === "tweaks"
        ? localize("Manage your installed Codex++ tweaks.")
        : localize("Configure Codex++ itself.");
    const root = panelShell(title, subtitle);
    host.appendChild(root.outer);
    if (ap.kind === "tweaks")
        renderTweaksPage(root.sectionsWrap);
    else
        renderConfigPage(root.sectionsWrap);
}
// ───────────────────────────────────────────────────────────── pages ──
function renderConfigPage(sectionsWrap) {
    const section = document.createElement("section");
    section.className = "flex flex-col gap-2";
    section.appendChild(sectionTitle("Codex++ Updates"));
    const card = roundedCard();
    const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
    card.appendChild(loading);
    section.appendChild(card);
    sectionsWrap.appendChild(section);
    void electron_1.ipcRenderer
        .invoke("codexpp:get-config")
        .then((config) => {
        card.textContent = "";
        renderCodexPlusPlusConfig(card, config);
    })
        .catch((e) => {
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
    title.textContent = localize("Automatically refresh Codex++");
    const desc = document.createElement("div");
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = localize("Installed version v{version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.", { version: config.version });
    left.appendChild(title);
    left.appendChild(desc);
    row.appendChild(left);
    row.appendChild(switchControl(config.autoUpdate, async (next) => {
        await electron_1.ipcRenderer.invoke("codexpp:set-auto-update", next);
    }));
    return row;
}
function checkForUpdatesRow(check) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-4 p-3";
    const left = document.createElement("div");
    left.className = "flex min-w-0 flex-col gap-1";
    const title = document.createElement("div");
    title.className = "min-w-0 text-sm text-token-text-primary";
    title.textContent = check?.updateAvailable
        ? localize("Codex++ update available")
        : localize("Codex++ is up to date");
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
            .then((next) => {
            const card = row.parentElement;
            if (!card)
                return;
            card.textContent = "";
            void electron_1.ipcRenderer.invoke("codexpp:get-config").then((config) => {
                renderCodexPlusPlusConfig(card, {
                    ...config,
                    updateCheck: next,
                });
            });
        })
            .catch((e) => plog("Codex++ update check failed", String(e)))
            .finally(() => {
            row.style.opacity = "";
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
    title.textContent = localize("Latest release notes");
    row.appendChild(title);
    const body = document.createElement("pre");
    body.className =
        "max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-foreground/5 p-3 text-xs text-token-text-secondary";
    body.textContent = check.releaseNotes?.trim() || check.error || localize("No release notes available.");
    row.appendChild(body);
    return row;
}
function updateSummary(check) {
    if (!check)
        return localize("No update check has run yet.");
    const latest = check.latestVersion
        ? localize("Latest v{version}. ", { version: check.latestVersion })
        : "";
    const checked = localize("Checked {date}.", {
        date: new Date(check.checkedAt).toLocaleString(),
    });
    if (check.error)
        return `${latest}${checked} ${check.error}`;
    return `${latest}${checked}`;
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
        card.appendChild(rowSimple("No tweaks installed", localize("Drop a tweak folder into {path} and reload.", {
            path: tweaksPath(),
        })));
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
        link.textContent = localize("Homepage");
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
// ───────────────────────────────────────────────────────────── components ──
/** The full panel shell (toolbar + scroll + heading + sections wrap). */
function panelShell(title, subtitle) {
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
    titleRow.className =
        "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
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
/**
 * Codex's "Open config.toml"-style trailing button: ghost border, muted
 * label, top-right diagonal arrow icon. Markup mirrors Configuration panel.
 */
function openInPlaceButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
        "border-token-border user-select-none no-drag cursor-interaction flex items-center gap-1 border whitespace-nowrap focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 rounded-lg text-token-description-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px]";
    const localizedLabel = localize(label);
    btn.innerHTML =
        `${localizedLabel}` +
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
    // Anchor strategy first (would be ideal if Codex switches to <a>).
    const links = Array.from(document.querySelectorAll("a[href*='/settings/']"));
    if (links.length >= 2) {
        let node = links[0].parentElement;
        while (node) {
            const inside = node.querySelectorAll("a[href*='/settings/']");
            if (inside.length >= Math.max(2, links.length - 1))
                return node;
            node = node.parentElement;
        }
    }
    const structural = findSidebarItemsGroupByStructure();
    if (structural)
        return structural;
    // Last-resort compatibility fallback for older English-only builds.
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
    const matches = [];
    const all = document.querySelectorAll("button, a, [role='button'], li, div");
    for (const el of Array.from(all)) {
        const t = (el.textContent ?? "").trim();
        if (t.length > 30)
            continue;
        if (KNOWN.some((k) => t === k))
            matches.push(el);
        if (matches.length > 50)
            break;
    }
    if (matches.length >= 2) {
        let node = matches[0].parentElement;
        while (node) {
            let count = 0;
            for (const m of matches)
                if (node.contains(m))
                    count++;
            if (count >= Math.min(3, matches.length))
                return node;
            node = node.parentElement;
        }
    }
    return null;
}
function findSidebarItemsGroupByStructure() {
    const groups = Array.from(document.querySelectorAll("div.flex.flex-col.gap-px"));
    for (const group of groups) {
        if (group.dataset.codexpp)
            continue;
        const items = Array.from(group.children).filter((child) => child instanceof HTMLElement &&
            !child.dataset.codexpp &&
            ["BUTTON", "A"].includes(child.tagName));
        if (items.length >= 3 &&
            items.every((item) => item.classList.contains("px-row-x") &&
                item.classList.contains("py-row-y") &&
                item.classList.contains("w-full"))) {
            return group;
        }
    }
    return null;
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