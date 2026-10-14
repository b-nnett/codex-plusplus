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

    @MainActor private func fixture(sidebarDelayMs: Int = 0) async throws -> WKWebView {
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
              window.shortcutMessages = [];
              window.electronBridge = {
                sendMessageFromView(message) {
                  if (message.type === 'codexpp-shell-shortcut') {
                    shortcutMessages.push(message); return Promise.resolve();
                  }
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
        __codexPPShell.registerSidebarToggle(() => {
          const toggle = () => document.querySelector('button').click();
          if (\(sidebarDelayMs) > 0) setTimeout(toggle, \(sidebarDelayMs)); else toggle();
        });
        \(runtime)
        globalThis.extensionPackage = \(package);
        void __codexPP.sync(extensionPackage);
        """, in: view)
        return view
    }

    @MainActor func testNormalSidebarResizingDoesNotInheritFocusModeTween() async throws {
        let view = try await fixture()
        let followsWidth = try await evaluate("""
        const panel=document.querySelector('aside');
        panel.style.width='410px';
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          getComputedStyle(panel).transitionDuration.split(',').every(value=>parseFloat(value)===0) &&
          getComputedStyle(panel).width==='410px');
        """, in:view)
        XCTAssertEqual(followsWidth,"true")
    }

    @MainActor func testShortcutTogglesWholeLeftPanelAndConsumesEvent() async throws {
        let view = try await fixture()
        let toggled = try await evaluate("""
        const panel = document.querySelector('aside');
        const main = document.querySelector('main');
        const titlebar = document.querySelector('[data-app-shell-titlebar]');
        globalThis.focusModeNoMotion = document.createElement('style');
        focusModeNoMotion.textContent = 'aside.app-shell-left-panel, [data-app-shell-frame], main[data-app-shell-main-surface], [data-app-shell-titlebar] { transition: none !important; }';
        const event = new KeyboardEvent('keydown', {
          code: 'Backslash', key: '|', metaKey: true, shiftKey: true,
          bubbles: true, cancelable: true
        });
        document.dispatchEvent(event);
        const transition = getComputedStyle(panel).transitionProperty;
        const frameTransition = getComputedStyle(document.querySelector('[data-app-shell-frame]')).transitionProperty;
        const mainTransition = getComputedStyle(main).transitionProperty;
        const titlebarTransition = getComputedStyle(titlebar).transitionProperty;
        document.head.append(focusModeNoMotion);
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

    @MainActor func testFullWidthRightPaneFollowsFocusCanvasDwellAndResize() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        const noMotion = document.createElement('style');
        noMotion.textContent = '[data-codexpp-shell-role] {transition:none !important}';
        document.head.append(noMotion);
        const main = document.querySelector('main');
        main.style.cssText += ';display:flex;flex-direction:column;min-width:0';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;position:relative;flex:1;min-height:0';
        row.innerHTML = '<div data-app-shell-right-panel-full-width="true" style="width:0"></div><aside data-app-shell-focus-area="right-panel" style="position:relative;flex-shrink:0;margin-inline-start:auto;width:calc(100% - 52px);height:100%"><div data-app-shell-pane-frame style="position:absolute;inset-block:0;inset-inline-end:0;min-width:100%;width:100%"><div data-test-browser style="width:100%;height:100%"></div></div></aside>';
        main.replaceChildren(row);
        window.focusPane = row.querySelector('aside');
        window.focusPaneOriginalStyle = focusPane.getAttribute('style');
        window.toggleFocus = () => document.dispatchEvent(new KeyboardEvent('keydown', {
          key:'|', code:'Backslash', metaKey:true, shiftKey:true, bubbles:true, cancelable:true
        }));
        window.paneFillsCanvas = () => {
          const canvas = main.getBoundingClientRect();
          return [focusPane, focusPane.firstElementChild, row.querySelector('[data-test-browser]')].every(node => {
            const bounds = node.getBoundingClientRect();
            return Math.abs(bounds.left - canvas.left) < .1 && Math.abs(bounds.right - canvas.right) < .1;
          });
        };
        void 0;
        """, in: view)
        // Percentage sizing follows the actual canvas, not window dimensions or
        // a guessed rail width. Both inline directions preserve native styles.
        for direction in ["ltr", "rtl"] {
            let follows = try await evaluate("""
            (() => {
            document.documentElement.dir = '\(direction)';
            toggleFocus();
            const expanded = paneFillsCanvas();
            document.documentElement.classList.add('codexpp-focus-mode-dwell');
            const dwelled = paneFillsCanvas() && getComputedStyle(document.querySelector('[data-codexpp-shell-role="panel"]')).width === '52px';
            document.querySelector('[data-app-shell-frame]').style.width = '1100px';
            const resized = paneFillsCanvas();
            return String(expanded && dwelled && resized && focusPane.getAttribute('style') === focusPaneOriginalStyle);
            })();
            """, in: view)
            XCTAssertEqual(follows, "true", direction)
            let restored = try await evaluate("""
            (() => {
            toggleFocus();
            document.querySelector('[data-app-shell-frame]').style.width = '900px';
            const nativeGap = document.querySelector('main').getBoundingClientRect().width - focusPane.getBoundingClientRect().width;
            return Math.abs(nativeGap - 52) < .1 && focusPane.getAttribute('style') === focusPaneOriginalStyle ? 'true' :
              JSON.stringify({nativeGap,classes:document.documentElement.className,panel:getComputedStyle(document.querySelector('[data-codexpp-shell-role="panel"]')).cssText,transition:getComputedStyle(document.querySelector('[data-codexpp-shell-role="panel"]')).transitionProperty});
            })();
            """, in: view)
            XCTAssertEqual(restored, "true", direction)
        }
        _ = try await evaluate("toggleFocus(); void 0;", in: view)
        _ = try await evaluate("void __codexPP.sync([]);", in: view)
        try await Task.sleep(for: .milliseconds(100))
        let cleaned = try await evaluate("""
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          focusPane.getAttribute('style') === focusPaneOriginalStyle &&
          Math.abs(document.querySelector('main').getBoundingClientRect().width - focusPane.getBoundingClientRect().width - 52) < .1);
        """, in: view)
        XCTAssertEqual(cleaned, "true")
    }

    @MainActor func testFullWidthRightPaneRuleDoesNotResizeSplitOrUnrelatedPanes() async throws {
        let view = try await fixture()
        let unaffected = try await evaluate("""
        const main = document.querySelector('main');
        main.innerHTML = '<div data-app-shell-right-panel-full-width="false"></div><aside data-app-shell-focus-area="right-panel" style="width:200px"><div data-app-shell-pane-frame style="width:200px"></div></aside><div data-app-shell-right-panel-full-width="true"></div><div data-app-shell-focus-area="right-panel" style="width:150px"></div>';
        const foreign = document.createElement('div');
        foreign.innerHTML = '<div data-app-shell-right-panel-full-width="true"></div><aside data-app-shell-focus-area="right-panel" style="width:125px"></aside>';
        document.body.append(foreign);
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key:'|', code:'Backslash', metaKey:true, shiftKey:true, bubbles:true, cancelable:true
        }));
        const split = main.querySelector('aside');
        const normal = getComputedStyle(split).width === '200px' && getComputedStyle(split.firstElementChild).width === '200px';
        const unrelated = getComputedStyle(main.querySelector('div[data-app-shell-focus-area]')).width === '150px' && getComputedStyle(foreign.querySelector('aside')).width === '125px';
        // Native layout changes activate/deactivate the rule without polling,
        // changing inline styles, or grabbing another pane's inner frame.
        split.previousElementSibling.setAttribute('data-app-shell-right-panel-full-width', 'true');
        const full = getComputedStyle(split).width !== '200px';
        split.previousElementSibling.setAttribute('data-app-shell-right-panel-full-width', 'false');
        String(normal && unrelated && full && getComputedStyle(split).width === '200px');
        """, in: view)
        XCTAssertEqual(unaffected, "true")
    }

    @MainActor func testBrowserPortalAndScaledCursorOverlayFillActualCanvasAndCleanUp() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        (() => {
          const style = document.createElement('style');
          style.textContent = '[data-codexpp-shell-role] {transition:none !important}';
          document.head.append(style);
          const main = document.querySelector('main');
          main.innerHTML = '<div data-app-shell-right-panel-full-width="true" style="width:0"></div><aside data-app-shell-focus-area="right-panel" style="width:500px;height:400px"></aside>';
          const host = document.createElement('div'); host.setAttribute('data-browser-host-root','');
          host.innerHTML = '<div data-browser-sidebar-webview="active" data-app-shell-focus-area="right-panel" style="position:fixed;left:4px;top:52px;width:500px;height:350px;visibility:visible;pointer-events:auto;opacity:1"><webview style="display:block;width:400px;height:280px;transform:scale(1.25);transform-origin:top left"></webview><div data-browser-sidebar-cursor-overlay-host style="position:absolute;width:400px;height:280px;transform:scale(1.25);transform-origin:top left"></div></div><div data-browser-sidebar-webview="cached" data-app-shell-focus-area="right-panel" style="width:500px;visibility:hidden;pointer-events:none"><webview></webview></div><div data-browser-sidebar-webview="bottom" data-app-shell-focus-area="bottom-panel" style="width:200px;visibility:visible;pointer-events:auto;opacity:1"><webview></webview></div>';
          document.body.append(host);
          window.browserPortal = host.firstElementChild;
          window.browserPortalOriginal = browserPortal.style.cssText;
          window.browserFits = () => {
            const expected = main.querySelector('aside').getBoundingClientRect().width;
            return [browserPortal,...browserPortal.children].every(node => Math.abs(node.getBoundingClientRect().width - expected) < .1);
          };
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'|',metaKey:true,shiftKey:true,bubbles:true}));
        })();
        """, in: view)
        let fills = try await evaluate("""
        String(browserFits() && getComputedStyle(document.querySelector('[data-browser-sidebar-webview="cached"]')).width === '500px' &&
          getComputedStyle(document.querySelector('[data-browser-sidebar-webview="bottom"]')).width === '200px');
        """, in: view)
        XCTAssertEqual(fills, "true")
        _ = try await evaluate("""
        browserPortal.style.width = '550px'; browserPortal.firstElementChild.style.width = '440px';
        document.querySelector('[data-app-shell-frame]').style.width = '1100px';
        void 0;
        """, in: view)
        try await Task.sleep(for: .milliseconds(100))
        let resized = try await evaluate("String(browserFits())", in: view)
        XCTAssertEqual(resized, "true")
        _ = try await evaluate("void __codexPP.sync([]);", in: view)
        try await Task.sleep(for: .milliseconds(100))
        let cleaned = try await evaluate("""
        String(!browserPortal.hasAttribute('data-codexpp-focus-browser-viewport') &&
          browserPortal.style.getPropertyValue('--codexpp-focus-browser-width') === '' &&
          getComputedStyle(browserPortal).width === '550px' && getComputedStyle(browserPortal.firstElementChild).width === '440px');
        """, in: view)
        XCTAssertEqual(cleaned, "true")
    }

    @MainActor func testNativeShortcutRelayAuthenticatesSessionAndStopsAfterCleanup() async throws {
        let view = try await fixture()
        let relayed = try await evaluate("""
        (() => {
          const request = shortcutMessages.at(-1);
          const send = (data, extra = {}) => window.dispatchEvent(new MessageEvent('message', {data,...extra}));
          const message = {type:'codexpp-shell-toggle-focus',protocol:1,requestId:request.requestId};
          send({...message,requestId:'wrong'});
          send({...message,protocol:2});
          send(message,{origin:'https://external.test'});
          const rejected = !document.documentElement.classList.contains('codexpp-focus-mode');
          send(message);
          const entered = document.documentElement.classList.contains('codexpp-focus-mode');
          send(message);
          return String(rejected && entered && !document.documentElement.classList.contains('codexpp-focus-mode'));
        })();
        """, in: view)
        XCTAssertEqual(relayed, "true")
        _ = try await evaluate("void __codexPP.sync([]);", in: view)
        try await Task.sleep(for: .milliseconds(100))
        let cleaned = try await evaluate("""
        (() => {
          const request = shortcutMessages.at(-1);
          window.dispatchEvent(new MessageEvent('message',{data:{type:'codexpp-shell-toggle-focus',protocol:1,requestId:request.requestId}}));
          return String(request.enabled === false && !document.documentElement.classList.contains('codexpp-focus-mode'));
        })();
        """, in: view)
        XCTAssertEqual(cleaned, "true")
    }

    @MainActor func testShorterExitTweenDoesNotLeakIntoReentryOrCleanup() async throws {
        let view = try await fixture()
        let faster = try await evaluate("""
        (() => {
          const toggle = () => document.dispatchEvent(new KeyboardEvent('keydown',{key:'|',metaKey:true,shiftKey:true,bubbles:true}));
          // With Reduce Motion (as on CI runners) every transition is 0 s, by design.
          const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
          toggle(); toggle();
          const exit = getComputedStyle(document.querySelector('aside')).transitionDuration === (reduced ? '0s' : '0.09s');
          toggle();
          return String(exit && !document.documentElement.classList.contains('codexpp-focus-mode-exiting') &&
            (reduced || getComputedStyle(document.querySelector('aside')).transitionDuration !== '0.09s'));
        })();
        """, in: view)
        XCTAssertEqual(faster, "true")
        _ = try await evaluate("void __codexPP.sync([]);", in: view)
        // Teardown is asynchronous; wait for it rather than a fixed delay.
        var cleaned = "false"
        for _ in 0..<30 where cleaned != "true" {
            try await Task.sleep(for: .milliseconds(100))
            cleaned = try await evaluate("String(!document.documentElement.classList.contains('codexpp-focus-mode-exiting'))", in: view)
        }
        XCTAssertEqual(cleaned, "true")
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

    @MainActor func testTransientShellReplacementAndAmbiguityDoNotExitFocus() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.savedMain = document.querySelector('main');
        globalThis.savedParent = savedMain.parentNode;
        savedMain.remove();
        """, in: view)
        try await Task.sleep(for: .milliseconds(100))
        _ = try await evaluate("savedParent.append(savedMain)", in: view)
        try await Task.sleep(for: .milliseconds(500))
        let survivedReplacement = try await evaluate("String(document.documentElement.classList.contains('codexpp-focus-mode'))", in: view)
        XCTAssertEqual(survivedReplacement, "true")
        _ = try await evaluate("""
        globalThis.transitionMain = savedMain.cloneNode(true);
        savedParent.append(transitionMain);
        """, in: view)
        try await Task.sleep(for: .milliseconds(100))
        _ = try await evaluate("transitionMain.remove()", in: view)
        try await Task.sleep(for: .milliseconds(500))
        let survivedAmbiguity = try await evaluate("String(document.documentElement.classList.contains('codexpp-focus-mode'))", in: view)
        XCTAssertEqual(survivedAmbiguity, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testNativeSidebarOpenDuringShellReplacementStillExitsFocus() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.savedMain = document.querySelector('main');
        globalThis.savedParent = savedMain.parentNode;
        savedMain.remove();
        document.querySelector('button').click();
        """, in: view)
        try await Task.sleep(for: .milliseconds(100))
        _ = try await evaluate("savedParent.append(savedMain)", in: view)
        try await Task.sleep(for: .milliseconds(300))
        let exited = try await evaluate("""
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          __codexPPShell.snapshot().sidebarOpen && bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(exited, "true")
    }

    @MainActor func testStreamingContentDoesNotTriggerShellScans() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.originalComputedStyle = window.getComputedStyle;
        globalThis.shellStyleReads = 0;
        window.getComputedStyle = (...args) => {shellStyleReads++; return originalComputedStyle(...args)};
        for (let i=0;i<200;i++) document.querySelector('main').append(document.createElement('span'));
        """, in: view)
        try await Task.sleep(for: .milliseconds(30))
        let untouched = try await evaluate("""
        window.getComputedStyle = originalComputedStyle;
        String(shellStyleReads === 0 && document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(untouched, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testHeartbeatDetectsLayoutLossWithoutOwnedAttributeMutations() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        document.querySelector('main').style.display = 'none';
        """, in: view)
        try await Task.sleep(for: .milliseconds(1600))
        let exited = try await evaluate("""
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(exited, "true")
    }

    @MainActor func testPersistentShellAmbiguityExitsInsteadOfChoosingANode() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        const main = document.querySelector('main');
        main.parentNode.append(main.cloneNode(true));
        """, in: view)
        try await Task.sleep(for: .milliseconds(500))
        let exited = try await evaluate("""
        String(__codexPPShell.snapshot() === null &&
          !document.documentElement.classList.contains('codexpp-focus-mode') &&
          bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(exited, "true")
    }

    @MainActor func testCancelledOrNonHoverPointersNeverOpenDwell() async throws {
        let view = try await fixture()
        _ = try await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}))", in: view)
        for cancellation in [
            "window.dispatchEvent(new Event('blur'))",
            "document.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))",
            "document.dispatchEvent(new PointerEvent('pointercancel', {bubbles:true}))",
            "document.dispatchEvent(new PointerEvent('pointerout', {clientX:500, clientY:200, bubbles:true}))",
            "document.dispatchEvent(new PointerEvent('pointerleave', {bubbles:true}))",
            "document.dispatchEvent(new PointerEvent('pointermove', {pointerType:'touch', clientX:1, clientY:200, bubbles:true}))",
            "document.dispatchEvent(new PointerEvent('pointermove', {buttons:1, clientX:1, clientY:200, bubbles:true}))"
        ] {
            _ = try await evaluate("""
            document.dispatchEvent(new PointerEvent('pointermove', {pointerType:'mouse', clientX:1, clientY:200, bubbles:true}));
            \(cancellation);
            """, in: view)
            try await Task.sleep(for: .milliseconds(300))
            let cancelled = try await evaluate("""
            String(document.documentElement.classList.contains('codexpp-focus-mode') &&
              !document.documentElement.classList.contains('codexpp-focus-mode-dwell'));
            """, in: view)
            XCTAssertEqual(cancelled, "true", cancellation)
        }
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testCleanupCancelsShellRecoveryBeforeHotReload() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.savedMain = document.querySelector('main');
        globalThis.savedParent = savedMain.parentNode;
        savedMain.remove();
        """, in: view)
        try await Task.sleep(for: .milliseconds(30))
        _ = try await evaluate("void __codexPP.sync([])", in: view)
        try await Task.sleep(for: .milliseconds(30))
        _ = try await evaluate("savedParent.append(savedMain); void __codexPP.sync(extensionPackage)", in: view)
        try await Task.sleep(for: .milliseconds(30))
        _ = try await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}))", in: view)
        try await Task.sleep(for: .milliseconds(500))
        let reloaded = try await evaluate("""
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          document.querySelectorAll('style[data-codexpp="focus-mode"]').length === 1 &&
          bridgeMessages.at(-1).hidden === true);
        """, in: view)
        XCTAssertEqual(reloaded, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
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

    @MainActor func testRapidToggleCoalescesAsyncSidebarCommandsAndRestoresOriginalState() async throws {
        for presses in [2, 3, 6, 7] {
            let view = try await fixture(sidebarDelayMs: 80)
            _ = try await evaluate("""
            document.querySelector('button').click();
            for (let i=0;i<\(presses);i++) document.dispatchEvent(new KeyboardEvent('keydown', {
              code:'Backslash', metaKey:true, shiftKey:true, bubbles:true
            }));
            """, in: view)
            try await Task.sleep(for: .milliseconds(400))
            let settled = try await evaluate("""
            String(document.documentElement.classList.contains('codexpp-focus-mode') === \(presses % 2 == 1) &&
              __codexPPShell.snapshot().sidebarOpen === \(presses % 2 == 0));
            """, in: view)
            XCTAssertEqual(settled, "true", "\(presses) rapid presses")
            _ = try await evaluate("void __codexPP.sync([])", in: view)
            try await Task.sleep(for: .milliseconds(150))
            let restored = try await evaluate("String(__codexPPShell.snapshot().sidebarOpen && !document.documentElement.classList.contains('codexpp-focus-mode'))", in: view)
            XCTAssertEqual(restored, "true")
        }
    }

    @MainActor func testCleanupWaitsForAsyncRestorationAndCannotReenter() async throws {
        let view = try await fixture(sidebarDelayMs: 100)
        _ = try await evaluate("""
        document.querySelector('button').click();
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.cleanupDone = false;
        void __codexPP.sync([]).then(() => { cleanupDone = true; });
        """, in: view)
        try await Task.sleep(for: .milliseconds(30))
        let blocked = try await evaluate("""
        const attempt = new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true, cancelable:true});
        document.dispatchEvent(attempt);
        String(!cleanupDone && !attempt.defaultPrevented && !document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(blocked, "true")
        try await Task.sleep(for: .milliseconds(300))
        let restored = try await evaluate("""
        String(cleanupDone && __codexPPShell.snapshot().sidebarOpen &&
          !document.querySelector('style[data-codexpp="focus-mode"]') && bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(restored, "true")
    }

    @MainActor func testExternalClassOrStyleLossRestoresFocusInsteadOfLeavingItHalfActive() async throws {
        for mutation in [
            "document.documentElement.classList.remove('codexpp-focus-mode')",
            "document.querySelector('style[data-codexpp=\"focus-mode\"]').remove()",
            "document.querySelector('style[data-codexpp=\"focus-mode\"]').textContent = 'body {}'",
            "document.querySelector('style[data-codexpp=\"focus-mode\"]').sheet.disabled = true"
        ] {
            let view = try await fixture()
            _ = try await evaluate("""
            document.querySelector('button').click();
            document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
            \(mutation);
            """, in: view)
            try await Task.sleep(for: .milliseconds(1100))
            let restored = try await evaluate("""
            String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
              !document.documentElement.hasAttribute('data-codexpp-focus-mode') &&
              __codexPPShell.snapshot().sidebarOpen && bridgeMessages.at(-1).hidden === false);
            """, in: view)
            XCTAssertEqual(restored, "true", mutation)
            _ = try await evaluate("void __codexPP.sync([])", in: view)
        }
    }

    @MainActor func testRestorationWaitsForSameShellButNeverTouchesReplacementFrame() async throws {
        for replaceFrame in [false, true] {
            let view = try await fixture()
            _ = try await evaluate("""
            document.querySelector('button').click();
            document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
            globalThis.savedMain = document.querySelector('main');
            globalThis.savedParent = savedMain.parentNode;
            savedMain.remove();
            document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
            """, in: view)
            try await Task.sleep(for: .milliseconds(50))
            _ = try await evaluate("""
            savedParent.append(savedMain);
            if (\(replaceFrame)) {
              const old = document.querySelector('[data-app-shell-frame]');
              old.replaceWith(old.cloneNode(true));
            }
            """, in: view)
            try await Task.sleep(for: .milliseconds(250))
            let restored = try await evaluate("""
            String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
              __codexPPShell.snapshot().sidebarOpen === \(!replaceFrame));
            """, in: view)
            XCTAssertEqual(restored, "true", "replacement frame: \(replaceFrame)")
            _ = try await evaluate("void __codexPP.sync([])", in: view)
        }
    }

    @MainActor func testNativeControlsRequestsAreCoalescedAndLateFailureCannotExitNewFocus() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        globalThis.originalInterval = window.setInterval;
        window.setInterval = (fn, ms) => {globalThis.heartbeatTick = fn; return originalInterval(fn, ms)};
        electronBridge.sendMessageFromView = message => {
          bridgeMessages.push(message);
          setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data:{
            type:'codexpp-shell-controls-result', requestId:message.requestId,
            supported:bridgeMessages.indexOf(message) !== 0, hidden:message.hidden
          }})), 200);
          return Promise.resolve();
        };
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        for (let i=0;i<20;i++) heartbeatTick();
        globalThis.coalesced = bridgeMessages.length === 1;
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        window.setInterval = originalInterval;
        void 0;
        """, in: view)
        try await Task.sleep(for: .milliseconds(300))
        let preserved = try await evaluate("""
        String(coalesced && bridgeMessages.length === 2 && document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(preserved, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testComposingShortcutIsIgnoredAndResizeCancelsDwell() async throws {
        let view = try await fixture()
        let ignored = try await evaluate("""
        const event = new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true,
          isComposing:true, bubbles:true, cancelable:true});
        document.dispatchEvent(event);
        String(!event.defaultPrevented && !document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(ignored, "true")
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        document.dispatchEvent(new PointerEvent('pointermove', {clientX:1, clientY:200, bubbles:true}));
        document.querySelector('[data-app-shell-frame]').style.setProperty('--app-shell-navigation-rail-width', '72px');
        window.dispatchEvent(new Event('resize'));
        """, in: view)
        try await Task.sleep(for: .milliseconds(300))
        let resized = try await evaluate("""
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          !document.documentElement.classList.contains('codexpp-focus-mode-dwell') &&
          document.documentElement.style.getPropertyValue('--codexpp-focus-rail-width') === '72px');
        """, in: view)
        XCTAssertEqual(resized, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testNeverSettlingSidebarFailsSafelyAndCleanupRemainsBounded() async throws {
        let view = try await fixture(sidebarDelayMs: 0)
        _ = try await evaluate("""
        document.querySelector('button').click();
        document.querySelector('button').onclick = () => {};
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(1150))
        let safe = try await evaluate("""
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          __codexPPShell.snapshot().sidebarOpen && bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(safe, "true")
        _ = try await evaluate("globalThis.cleanupDone = false; void __codexPP.sync([]).then(() => {cleanupDone = true})", in: view)
        try await Task.sleep(for: .milliseconds(30))
        let finished = try await evaluate("String(cleanupDone)", in: view)
        XCTAssertEqual(finished, "true")
    }

    @MainActor func testExitNeverRestoresSidebarInAlreadyReplacedFrame() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.querySelector('button').click();
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(80))
        _ = try await evaluate("""
        const frame = document.querySelector('[data-app-shell-frame]');
        frame.replaceWith(frame.cloneNode(true));
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(300))
        let preserved = try await evaluate("""
        String(!document.documentElement.classList.contains('codexpp-focus-mode') &&
          __codexPPShell.snapshot().sidebarOpen === false && bridgeMessages.at(-1).hidden === false);
        """, in: view)
        XCTAssertEqual(preserved, "true")
    }

    @MainActor func testMissingOrDisabledStyleLeavesEntryShortcutUntouched() async throws {
        for mutation in [
            "document.querySelector('style[data-codexpp=\"focus-mode\"]').remove()",
            "document.querySelector('style[data-codexpp=\"focus-mode\"]').sheet.disabled = true"
        ] {
            let view = try await fixture()
            let ignored = try await evaluate("""
            \(mutation);
            const event = new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true,
              bubbles:true, cancelable:true});
            document.dispatchEvent(event);
            String(!event.defaultPrevented && !document.documentElement.classList.contains('codexpp-focus-mode') && bridgeMessages.length === 0);
            """, in: view)
            XCTAssertEqual(ignored, "true")
            _ = try await evaluate("void __codexPP.sync([])", in: view)
        }
    }

    @MainActor func testCleanupUsesObservedNativeStateWhenPollingTimersAreThrottled() async throws {
        let view = try await fixture(sidebarDelayMs: 100)
        _ = try await evaluate("""
        globalThis.originalTimeout = window.setTimeout;
        window.setTimeout = (fn, ms, ...args) => ms === 50
          ? originalTimeout(() => {}, 10000) : originalTimeout(fn, ms, ...args);
        document.querySelector('button').click();
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        globalThis.cleanupDone = false;
        void __codexPP.sync([]).then(() => {cleanupDone = true});
        """, in: view)
        try await Task.sleep(for: .milliseconds(300))
        let restored = try await evaluate("""
        window.setTimeout = originalTimeout;
        String(cleanupDone && __codexPPShell.snapshot().sidebarOpen &&
          !document.querySelector('style[data-codexpp="focus-mode"]') && bridgeMessages.at(-1).hidden === false);
        """, in: view)
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

    @MainActor func testIdleFocusModeDoesNoPerMutationWork() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        globalThis.idleScans = 0;
        globalThis.originalMatches = Element.prototype.matches;
        Element.prototype.matches = function(...args) { idleScans++; return originalMatches.apply(this, args); };
        for (let i=0;i<200;i++) {
          const block = document.createElement('div');
          block.append(document.createElement('span'));
          document.querySelector('main').append(block);
          block.className = 'streaming-' + i;
        }
        """, in: view)
        try await Task.sleep(for: .milliseconds(30))
        let idle = try await evaluate("""
        Element.prototype.matches = originalMatches;
        String(idleScans === 0 && !document.documentElement.classList.contains('codexpp-focus-mode'));
        """, in: view)
        XCTAssertEqual(idle, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }

    @MainActor func testBecomingVisibleRenewsHiddenControlsImmediately() async throws {
        let view = try await fixture()
        _ = try await evaluate("""
        document.dispatchEvent(new KeyboardEvent('keydown', {code:'Backslash', metaKey:true, shiftKey:true, bubbles:true}));
        """, in: view)
        try await Task.sleep(for: .milliseconds(50))
        let renewed = try await evaluate("""
        bridgeMessages.length = 0;
        // Offscreen test views report hidden; model the window returning.
        Object.defineProperty(document, 'hidden', {value:false, configurable:true});
        document.dispatchEvent(new Event('visibilitychange'));
        String(document.documentElement.classList.contains('codexpp-focus-mode') &&
          bridgeMessages.length === 1 && bridgeMessages[0].hidden === true);
        """, in: view)
        XCTAssertEqual(renewed, "true")
        _ = try await evaluate("void __codexPP.sync([])", in: view)
    }
}
