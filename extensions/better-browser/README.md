# better-browser

Adds the native macOS **AutoFill** submenu to editable fields in ChatGPT's in-app browser, including inputs, textareas and contenteditable areas. macOS provides Contact…, Passwords… and Credit Card… when available for the field and system configuration.

The extension supplies the clicked frame to the existing native menu; annotation, editing, link and Inspect actions continue to work. Builds exposing a clicked or focused frame use that frame; the reviewed ChatGPT fork falls back to the browser page's outer frame. A signed Node-API module corrects the fork's Cocoa wrapper view to the focused native input for this one popup. It requires the same window, the reviewed view classes, a native input context and a one-second expiry. Other menus keep their original view. macOS may also add Writing Tools and Services through this integration.

Version 0.3 requires patch v27 or later and the signed native module bundled with the helper. Earlier adapters produce a visible extension error instead of silently reporting success. Fields without a native input context retain their original menu, including secure fields where Chromium suppresses input methods.

Browser bookmarks are shared between chats and windows and persist in `CodexPP/bookmarks.json` in Application Support. Open a web page, then choose **Save to bookmarks** in Browser options. Saved pages show **Remove from bookmarks** instead. Empty browser panels show Bookmarks above Suggested; clicking a bookmark opens its full URL in that panel. Bookmark cards use the same native favicon loader as Suggested, including its browser cache; sites without an icon show a star. Existing bookmarks gain icons automatically. Titles and URLs are stored only when you choose Save. Disabling the extension hides bookmark UI and preserves saved pages.

Build the updated Codex++ helper and quit and reopen the helper if it was already running. Restart ChatGPT to install the native patch, then install this folder under **Settings → Codex++ → Extensions** and enable **better-browser**. Older helper patches report that an update and restart are required. New installs start disabled.

To apply the patch while preserving the current pause setting, run the rebuilt helper's CLI:

```sh
dist/Codex++.app/Contents/MacOS/CodexPP --patch-and-restart /Applications/ChatGPT.app
```

Disabling, pausing or removing the extension stops supplying the frame on the next menu opening. Existing open menus close normally. The extension runs only in the app renderer; macOS handles credential selection and insertion. The extension does not read password stores or inject scripts into browser pages.

Requires macOS and the reviewed ChatGPT build supported by Codex++. OS-provided menu availability is controlled by macOS. Native menu support uses Electron's [context-menu frame option](https://www.electronjs.org/docs/latest/tutorial/context-menu#additional-macos-menu-items-eg-writing-tools).

For a manual regression check, serve `Tests/fixtures/browser-autofill` on loopback and open it in the in-app browser. The fixture includes plain text, email, secure text, textarea, contenteditable and nested-frame fields. Right-click eligible fields and check the OS submenu, then disable the extension and confirm the original menu returns.
