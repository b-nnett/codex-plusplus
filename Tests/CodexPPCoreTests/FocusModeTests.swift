import XCTest
import WebKit

@MainActor
private final class FocusModeNavigationWaiter: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Error>?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume()
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

final class FocusModeTests: XCTestCase {
    @MainActor private func evaluate(_ source: String, in view: WKWebView) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            view.evaluateJavaScript(source) { result, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: result as? String ?? "") }
            }
        }
    }

    @MainActor private func fixture() async throws -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 600), configuration: config)
        let waiter = FocusModeNavigationWaiter()
        view.navigationDelegate = waiter
        try await withCheckedThrowingContinuation { continuation in
            waiter.continuation = continuation
            view.loadHTMLString("""
            <script>
              window.bridgeMessages = [];
              window.electronBridge = {
                sendMessageFromView(message) {
                  bridgeMessages.push(message);
                  // Match the real Electron preload, not window.postMessage.
                  window.dispatchEvent(new MessageEvent('message', {data:{
                    type:'codexpp-shell-controls-result', requestId:message.requestId,
                    supported:true, hidden:message.hidden}}));
                  return Promise.resolve();
                }
              };
            </script>
            <div data-app-shell-frame data-codexpp-shell-role="frame" data-codexpp-shell-sidebar-open="false" data-app-shell-sidebar-open="false" style="width:900px;--app-shell-navigation-rail-width:52px">
              <header data-app-shell-titlebar data-codexpp-shell-role="titlebar" style="height:44px">Titlebar</header>
              <button aria-label="Show sidebar" onclick="
                const frame = document.querySelector('[data-app-shell-frame]');
                const open = frame.getAttribute('data-app-shell-sidebar-open') !== 'true';
                frame.setAttribute('data-app-shell-sidebar-open', String(open));
                frame.setAttribute('data-codexpp-shell-sidebar-open', String(open));
                this.setAttribute('aria-label', open ? 'Hide sidebar' : 'Show sidebar');
              ">Toggle sidebar</button>
              <div data-app-shell-workspace-row style="display:flex;position:relative;height:500px">
                <aside class="app-shell-left-panel" data-codexpp-shell-role="panel" data-codexpp-shell-peeking="false" style="width:326px">
                  <nav aria-label="App navigation">Rail</nav>
                  <nav aria-label="Home">Chats</nav>
                </aside>
                <main data-app-shell-main-surface="default" data-codexpp-shell-role="main" style="flex:1;clip-path:inset(0 0 0 -12px round 12px);margin-top:44px">Conversation</main>
              </div>
            </div>
            """, baseURL: URL(string: "https://focus-mode.example.test/index.html"))
        }
        withExtendedLifetime(waiter) {}

        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let runtime = try String(contentsOf: root.appendingPathComponent("Sources/CodexPP/Resources/runtime.js"), encoding: .utf8)
        let shell = try String(contentsOf: root.appendingPathComponent("Sources/CodexPPCore/Resources/shell-runtime.js"), encoding: .utf8)
        let code = try String(contentsOf: root.appendingPathComponent("extensions/focus-mode/index.js"), encoding: .utf8)
        let package = String(decoding: try JSONSerialization.data(withJSONObject: [["id": "focus-mode", "code": code]]), as: UTF8.self)
        _ = try await evaluate("""
        \(shell)
        __codexPPShell.registerSidebarToggle(() => document.querySelector('button').click());
        \(runtime)
        globalThis.extensionPackage = \(package);
        void __codexPP.sync(extensionPackage);
        """, in: view)
        return view
    }

    @MainActor func testShortcutTogglesWholeLeftPanelAndConsumesEvent() async throws {
        let view = try await fixture()
        let toggled = try await evaluate("""
        const panel = document.querySelector('aside');
        const main = document.querySelector('main');
        const titlebar = document.querySelector('[data-app-shell-titlebar]');
        const transition = getComputedStyle(panel).transitionProperty;
        const frameTransition = getComputedStyle(document.querySelector('[data-app-shell-frame]')).transitionProperty;
        const mainTransition = getComputedStyle(main).transitionProperty;
        const titlebarTransition = getComputedStyle(titlebar).transitionProperty;
        globalThis.focusModeNoMotion = document.createElement('style');
        focusModeNoMotion.textContent = 'aside.app-shell-left-panel, [data-app-shell-frame], main[data-app-shell-main-surface], [data-app-shell-titlebar] { transition: none !important; }';
        document.head.append(focusModeNoMotion);
        const event = new KeyboardEvent('keydown', {
          code: 'Backslash', key: '|', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        });
        document.dispatchEvent(event);
        String(transition.includes('width') && transition.includes('clip-path') &&
          frameTransition.includes('padding-inline-start') &&
          mainTransition.includes('clip-path') && mainTransition.includes('border-radius') && mainTransition.includes('margin-top') &&
          titlebarTransition.includes('opacity') &&
          event.defaultPrevented &&
          document.documentElement.classList.contains('codexpp-focus-mode') &&
          document.documentElement.hasAttribute('data-codexpp-focus-mode') &&
          getComputedStyle(panel).width === '0px' &&
          getComputedStyle(document.querySelector('[data-app-shell-frame]')).paddingLeft === '4px' &&
          getComputedStyle(main).clipPath === 'inset(0px)' &&
          getComputedStyle(main).borderBottomLeftRadius === '12px' &&
          getComputedStyle(main).borderBottomRightRadius === '12px' &&
          getComputedStyle(main).marginTop === '4px' &&
          getComputedStyle(titlebar).opacity === '0' &&
          bridgeMessages.at(-1).hidden === true && !bridgeMessages.some(message => 'windowZoom' in message));
        """, in: view)
        XCTAssertEqual(toggled, "true")

        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', key: '|', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        }));
        """, in: view)
        try await Task.sleep(for: .milliseconds(300))
        let restored = try await evaluate("""
        const result = String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          !document.documentElement.hasAttribute('data-codexpp-focus-mode') &&
          getComputedStyle(document.querySelector('aside')).width === '326px' &&
          bridgeMessages.at(-1).hidden === false);
        focusModeNoMotion.remove();
        result;
        """, in: view)
        XCTAssertEqual(restored, "true")
    }

    @MainActor func testShortcutSupportsBritishISOAndLogicalBackslashKeys() async throws {
        let view = try await fixture()
        let supported = try await evaluate("""
        let handled = true;
        for (const key of [
          {code:'IntlBackslash', key:'|'},
          {code:'IntlBackslash', key:String.fromCharCode(92)},
          {code:'', key:'|'},
          {code:'Backslash', key:'|'}
        ]) {
          const event = new KeyboardEvent('keydown', {...key, metaKey:true,
            shiftKey:true, bubbles:true, cancelable:true});
          document.dispatchEvent(event);
          handled &&= event.defaultPrevented && document.documentElement.classList.contains('codexpp-focus-mode');
          document.dispatchEvent(new KeyboardEvent('keydown', {...key, metaKey:true, shiftKey:true, bubbles:true}));
          handled &&= !document.documentElement.classList.contains('codexpp-focus-mode');
        }
        const unrelated = new KeyboardEvent('keydown', {code:'IntlBackslash', key:'<',
          metaKey:true, shiftKey:true, bubbles:true, cancelable:true});
        document.dispatchEvent(unrelated);
        String(handled && !unrelated.defaultPrevented && !document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(supported, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testNativePreloadAcknowledgementsKeepFocusActiveAcrossHeartbeats() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.querySelector('button').click();
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code:'Backslash', metaKey:true, shiftKey:true, bubbles:true
        }));
        """, in: view)
        try await Task.sleep(for: .milliseconds(2300))
        let sustained = try await evaluate("""
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          __codexPPShell.snapshot().sidebarOpen === false &&
          bridgeMessages.length >= 3 && bridgeMessages.every(message => message.hidden));
        """, in: view)
        XCTAssertEqual(sustained, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testWrongModifiersRepeatAndCleanupDoNotLeaveFocusModeActive() async throws {
        let view = try await fixture()
        let ignored = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', metaKey: true, shiftKey: true, altKey: true,
          bubbles: true, cancelable: true
        }));
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', metaKey: true, shiftKey: true, repeat: true,
          bubbles: true, cancelable: true
        }));
        String(!document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(ignored, "true")

        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        }));
        """, in: view)
        let cleaned = try await evaluate("""
        void __codexPP.sync([]).then(() => {
          globalThis.cleanupResult = String(
            !document.documentElement.classList.contains('codexpp-focus-mode') &&
            !document.documentElement.hasAttribute('data-codexpp-focus-mode') &&
            !document.querySelector('style[data-codexpp="focus-mode"]')
          );
        });
        """, in: view)
        XCTAssertEqual(cleaned, "")

        for _ in 0..<20 {
            let result = try await evaluate("globalThis.cleanupResult || ''", in: view)
            if result == "true" { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Focus Mode cleanup did not complete")
    }

    @MainActor func testOpeningNativeSidebarExitsFocusMode() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        }));
        document.querySelector('button[aria-label="Show sidebar"]').click();
        """, in: view)

        for _ in 0..<20 {
            let result = try await evaluate("""
            String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
              document.querySelector('[data-app-shell-frame]').getAttribute('data-app-shell-sidebar-open') === 'true');
            """, in: view)
            if result == "true" { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Opening the native sidebar did not exit Focus Mode")
    }

    @MainActor func testLocalizedControlsRestorePreviouslyOpenSidebar() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.querySelector('button').click();
        document.querySelector('button').setAttribute('aria-label', 'Seitenleiste ausblenden');
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(20))
        let focused = try await evaluate("""
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          __codexPPShell.snapshot().sidebarOpen === false);
        """, in: view)
        XCTAssertEqual(focused, "true")
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        let restored = try await evaluate("String(__codexPPShell.snapshot().sidebarOpen)", in: view)
        XCTAssertEqual(restored, "true")
    }

    @MainActor func testShellLossAndNativeFailureExitFocusSafely() async throws {
        var views: [WKWebView] = []
        for failure in ["document.querySelector('main').remove()", "electronBridge.sendMessageFromView = () => Promise.reject(Error('Native unavailable'))"] {
            let view = try await fixture()
            views.append(view)
            _ = try await evaluate("""
            document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
            \(failure);
            void 0;
            """, in: view)
            try await Task.sleep(for: .milliseconds(1200))
            let recovered = try await evaluate("String(!document.documentElement.classList.contains('codexpp-focus-mode'))", in: view)
            XCTAssertEqual(recovered, "true")
        }
        withExtendedLifetime(views) {}
    }

    @MainActor func testMissingShellLeavesShortcutAndUIUntouched() async throws {
        let view = try await fixture()
        let untouched = try await evaluate("""
        document.querySelector('main').remove();
        const shortcut = new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true, cancelable:true});
        document.dispatchEvent(shortcut);
        String(!shortcut.defaultPrevented && !document.documentElement.classList.contains('codexpp-focus-mode') && bridgeMessages.length === 0);
        """, in: view)
        XCTAssertEqual(untouched, "true")
    }

    @MainActor func testCleanupWithoutEnteringFocusDoesNotChangeNativeControls() async throws {
        let view = try await fixture()
        _ = try await evaluate("void __codexPP.sync([])", in: view)
        try await Task.sleep(for: .milliseconds(20))
        let untouched = try await evaluate("String(bridgeMessages.length === 0)", in: view)
        XCTAssertEqual(untouched, "true")
    }

    @MainActor func testCachedHiddenSurfacesAreIgnoredButVisibleDuplicatesAreRejected() async throws {
        let view = try await fixture()
        let cached = try await evaluate("""
        globalThis.cachedMain = document.querySelector('main').cloneNode(true);
        cachedMain.style.display = 'none';
        document.body.append(cachedMain);
        String(Boolean(__codexPPShell.snapshot()));
        """, in: view)
        XCTAssertEqual(cached, "true")
        let ambiguous = try await evaluate("""
        cachedMain.style.display = 'block';
        String(__codexPPShell.snapshot() === null);
        """, in: view)
        XCTAssertEqual(ambiguous, "true")
    }

    @MainActor func testRapidReentryCancelsDelayedControlsRestore() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        for (let i=0;i<3;i++) document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(350))
        let focused = try await evaluate("String(document.documentElement.classList.contains('codexpp-focus-mode') && bridgeMessages.every(message => message.hidden))", in: view)
        XCTAssertEqual(focused, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
        try await Task.sleep(for: .milliseconds(20))
        let restored = try await evaluate("String(bridgeMessages.at(-1).hidden === false)", in: view)
        XCTAssertEqual(restored, "true")
    }

    @MainActor func testEdgeDwellShowsOnlyRailUntilPointerReturnsToMain() async throws {
        let view = try await fixture()
        let initial = try await evaluate("""
        globalThis.focusModeDwellNoMotion = document.createElement('style');
        focusModeDwellNoMotion.textContent = 'aside.app-shell-left-panel { transition: none !important; }';
        document.head.append(focusModeDwellNoMotion);
        document.querySelector('[data-app-shell-frame]').style.setProperty('--app-shell-navigation-rail-width', '64px');
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Backslash', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        }));
        globalThis.focusMainWidth = document.querySelector('main').getBoundingClientRect().width;
        document.dispatchEvent(new PointerEvent('pointermove', {clientX: 1, clientY: 100, bubbles: true}));
        String(document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(initial, "true")
        try await Task.sleep(for: .milliseconds(500))

        let opened = try await evaluate("""
        const aside = document.querySelector('aside');
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          document.documentElement.classList.contains('codexpp-focus-mode-dwell') &&
          aside.getBoundingClientRect().width === 64 &&
          getComputedStyle(aside).position !== 'absolute' &&
          document.querySelector('main').getBoundingClientRect().width < focusMainWidth &&
          getComputedStyle(document.querySelector('[data-app-shell-frame]')).paddingLeft === '0px' &&
          document.querySelector('[data-app-shell-frame]').getAttribute('data-app-shell-sidebar-open') === 'false');
        """, in: view)
        XCTAssertEqual(opened, "true")

        let heldForPreview = try await evaluate("""
        globalThis.nativeSidebarPreview = document.querySelector('aside');
        nativeSidebarPreview.setAttribute('data-codexpp-shell-peeking', 'true');
        document.body.dispatchEvent(new PointerEvent('pointermove', {
          clientX: 700, clientY: 200, bubbles: true
        }));
        String(document.documentElement.classList.contains('codexpp-focus-mode-dwell'));
        """, in: view)
        XCTAssertEqual(heldForPreview, "true")

        _ = try await evaluate("nativeSidebarPreview.setAttribute('data-codexpp-shell-peeking', 'false')", in: view)
        try await Task.sleep(for: .milliseconds(10))
        let rehidden = try await evaluate("""
        const result = String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          !document.documentElement.classList.contains('codexpp-focus-mode-dwell') &&
          document.querySelector('[data-app-shell-frame]').getAttribute('data-app-shell-sidebar-open') === 'false');
        focusModeDwellNoMotion.remove();
        result;
        """, in: view)
        XCTAssertEqual(rehidden, "true")
    }
}
