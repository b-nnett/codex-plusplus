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
 *   ◇ Tweak Store
 *
 * Clicking Config / Tweaks / Tweak Store hides Codex's content panel children and renders
 * our own `main-surface` panel in their place. Clicking any of Codex's
 * sidebar items restores the original view.
 */
import type { SettingsSection, SettingsPage, SettingsHandle, TweakManifest } from "@codex-plusplus/sdk";
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
export declare function startSettingsInjector(): void;
export declare function registerSection(section: SettingsSection): SettingsHandle;
export declare function clearSections(): void;
/**
 * Register a tweak-owned settings page. The runtime injects a sidebar entry
 * under a "TWEAKS" group header (which appears only when at least one page
 * is registered) and routes clicks to the page's `render(root)`.
 */
export declare function registerPage(tweakId: string, manifest: TweakManifest, page: SettingsPage): SettingsHandle;
/** Called by the tweak host after fetching the tweak list from main. */
export declare function setListedTweaks(list: ListedTweak[]): void;
export declare function mountFloatingSettingsLauncher(): void;
export {};
