# Focus Mode

Press **⌘⇧\\** to toggle Focus Mode. It smoothly collapses the complete left
panel—both the navigation rail and the chat/project sidebar—so the current view
expands to use the full window. The app titlebar fades away and the surface also
expands upward, leaving the same 4 px framed gutter along the top.

The expanded surface keeps the same framed gutter and corner radius on the left
as ChatGPT uses on the right and bottom edges. Both exposed corners use the
surface's border radius so they rasterize identically. The native macOS window
controls are hidden until Focus Mode exits.

Pause at the left edge for 250 ms to temporarily reopen the native outer
navigation rail in its normal layout. Native hover previews for Home and
projects continue to work from that rail. It closes again when the pointer
returns to the main canvas. Opening the complete
sidebar with ChatGPT's own button, menu item, or keyboard shortcut exits Focus
Mode. The native window controls hide immediately and wait until the surface
transition has finished before returning.

The transition uses ChatGPT's own motion duration and spring easing tokens. If
macOS Reduce Motion is enabled, the panel changes immediately.

Install this folder through **Settings → Codex++ → Extensions**, then enable
**Focus Mode**. Disabling the extension while Focus Mode is active restores the
sidebar immediately.

## Compatibility and recovery

Requires Codex++'s reviewed shell v1 adapter (patch v19 or later, which correctly
acknowledges native window controls through the Electron preload). Focus Mode
only initializes in the primary `/index.html` renderer. Detached/browser and
standalone Settings windows are skipped without waiting for a shell they do not
host; a genuinely missing shell in the supported renderer still reports an error.
It uses owned shell roles and the native sidebar command, not translated button
labels, minified CSS classes, React internals, or fixed navigation-rail widths.
The build adapter discovers semantic contracts using an AST and rejects missing,
ambiguous, or already-patched matches before installation. Unknown app builds
still require review; this is deliberately not a promise of automatic support.

Traffic lights use Electron's public `setWindowButtonVisibility` API, never a
fake window zoom. Native acknowledgements and renewable four-second leases
restore controls after renderer failure, navigation, extension pause/removal,
or lost heartbeats. Missing shell capabilities exit focus and restore the UI.

Brief native re-renders get a bounded 400 ms recovery window. Focus Mode stays
active only if the owned shell contract becomes valid again; persistent absence
or ambiguity still exits safely. The one-second heartbeat also checks for a
native sidebar opening when a renderer mutation was missed. Streaming message
text does not trigger shell scans.

Edge dwell is hover-only: touch and dragging do not activate it. Clicking,
pointer cancellation, leaving the edge/window, hiding the document, or losing
window focus cancels a pending dwell. Cleanup cancels recovery/dwell timers so
an old instance cannot affect the replacement after a hot update. The shortcut
accepts the logical backslash/pipe key on British/ISO layouts as well as the
original ANSI physical key, with the same strict modifier checks.
