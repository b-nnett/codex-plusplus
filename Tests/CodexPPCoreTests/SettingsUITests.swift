import XCTest
import WebKit

@MainActor
private final class NavigationWaiter: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Error>?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { continuation?.resume(); continuation = nil }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { continuation?.resume(throwing: error); continuation = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { continuation?.resume(throwing: error); continuation = nil }
}

final class SettingsUITests: XCTestCase {
    @MainActor private func evaluate(_ source: String, in view: WKWebView) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            view.evaluateJavaScript(source) { result, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: result as? String ?? "") }
            }
        }
    }
    @MainActor private func fixture(explicitContent: Bool = true) async throws -> WKWebView {
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 600))
        let waiter = NavigationWaiter()
        view.navigationDelegate = waiter
        try await withCheckedThrowingContinuation { continuation in
            waiter.continuation = continuation
            view.loadHTMLString("""
            <style>body{margin:0;display:flex;height:600px}nav{width:240px}section{width:600px;height:600px}</style>
            <nav class="sidebar-navigation"><div class="overflow-y-auto"><button data-settings-panel-slug="general">General</button></div></nav>
            <section \(explicitContent ? "data-settings-content" : "")><h1>General</h1><input value="preserve me"></section>
            """, baseURL: URL(string: "https://example.test"))
        }
        withExtendedLifetime(waiter) {}
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let resources = root.appendingPathComponent("Sources/CodexPP/Resources")
        let bridge = try String(contentsOf: root.appendingPathComponent("Sources/CodexPPCore/Resources/renderer-bridge.js"), encoding: .utf8)
        let settings = try String(contentsOf: resources.appendingPathComponent("settings.js"), encoding: .utf8)
        _ = try await evaluate("""
        globalThis.calls = [];
        globalThis.electronBridge = {sendMessageFromView(request) {
            calls.push(request);
            if (request.action === 'set-enabled') state.extensions[0].enabled = request.enabled;
            else if (request.action === 'remove') state.extensions = [];
            else if (request.action === 'pause' || request.action === 'resume') state.extensionsPaused = request.action === 'pause';
            queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {data:{type:'codexpp-settings-result',requestId:request.requestId,ok:true,data:state}})));
        }};
        globalThis.state = {extensions:[{id:'one',name:'<img src=x onerror=bad()>',description:'Example',version:'1.0',enabled:true}],extensionsPaused:false,intent:1};
        \(bridge)
        \(settings)
        __codexPPSettings.update(state);
        """, in: view)
        return view
    }
    @MainActor func testSettingsSelectionRestoresNativeContentAndDoesNotInjectMetadataHTML() async throws {
        let view = try await fixture()
        let initial = try await evaluate("JSON.stringify({hidden:document.querySelector('[data-settings-content]').hidden, checked:document.querySelector('[data-codexpp-settings-content] input').checked, imgs:document.querySelectorAll('img').length, groups:document.querySelectorAll('[data-codexpp-settings-nav]').length})", in: view)
        let data = try XCTUnwrap(initial.data(using: .utf8))
        let values = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(values["hidden"] as? Bool, true)
        XCTAssertEqual(values["checked"] as? Bool, true)
        XCTAssertEqual(values["imgs"] as? Int, 0)
        XCTAssertEqual(values["groups"] as? Int, 1)
        _ = try await evaluate("document.querySelector('[data-settings-panel-slug=general]').click()", in: view)
        let restored = try await evaluate("String(!document.querySelector('[data-settings-content]').hidden && !document.querySelector('[data-codexpp-settings-content]') && document.querySelector('section input').value === 'preserve me')", in: view)
        XCTAssertEqual(restored, "true")
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
    }
    @MainActor func testToggleAndRemovalUseOneAuthenticatedHelperBridge() async throws {
        let view = try await fixture()
        _ = try await evaluate("const checkbox=document.querySelector('[data-codexpp-settings-content] input'); checkbox.checked=false; checkbox.dispatchEvent(new Event('change'));", in: view)
        let updated = try await evaluate("String(!state.extensions[0].enabled && calls[0].type === 'codexpp-settings' && calls[0].action === 'set-enabled' && calls[0].extensionId === 'one')", in: view)
        XCTAssertEqual(updated, "true")
        _ = try await evaluate("document.querySelector('[data-codexpp-settings-content] button[aria-label]').click()", in: view)
        let removed = try await evaluate("String(state.extensions.length === 0 && !document.querySelector('[data-codexpp-settings-content] input'))", in: view)
        XCTAssertEqual(removed, "true")
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
    }
    @MainActor func testUnchangedPollingPreservesControls() async throws {
        let view = try await fixture()
        let preserved = try await evaluate("""
        globalThis.originalToggle = document.querySelector('[data-codexpp-settings-content] input');
        __codexPPSettings.update(JSON.parse(JSON.stringify(state)));
        String(originalToggle === document.querySelector('[data-codexpp-settings-content] input'));
        """, in: view)
        XCTAssertEqual(preserved, "true")
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
    }
    @MainActor func testExtensionSelectionFocusesRequestedRowAndPauseResumes() async throws {
        let view = try await fixture()
        let selected = try await evaluate("""
        state.extensions.push({id:'two',name:'Second',version:'1.0',enabled:false});
        state.intent = 2; state.selectedExtensionId = 'two';
        __codexPPSettings.update(state);
        String(document.activeElement.dataset.extensionId === 'two');
        """, in: view)
        XCTAssertEqual(selected, "true")
        _ = try await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Pause Extensions').click()", in: view)
        let paused = try await evaluate("String(state.extensionsPaused && calls.at(-1).action === 'pause' && state.extensions[0].enabled)", in: view)
        XCTAssertEqual(paused, "true")
        _ = try await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Resume Extensions').click()", in: view)
        let resumed = try await evaluate("String(!state.extensionsPaused && calls.at(-1).action === 'resume' && state.extensions[0].enabled)", in: view)
        XCTAssertEqual(resumed, "true")
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
    }
    @MainActor func testNativeLayoutHeuristicAndCleanup() async throws {
        let view = try await fixture(explicitContent: false)
        let selected = try await evaluate("String(document.querySelector('section').hidden && !!document.querySelector('[data-codexpp-settings-content]'))", in: view)
        XCTAssertEqual(selected, "true")
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
        let cleaned = try await evaluate("String(!document.querySelector('section').hidden && !document.querySelector('[data-codexpp-settings-nav]') && !document.querySelector('[data-codexpp-settings-content]'))", in: view)
        XCTAssertEqual(cleaned, "true")
    }
    @MainActor func testNativeSettingsUsesRouterAndSubscriptionWithoutDOMOverlay() async throws {
        let view = try await fixture()
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let runtime = try String(contentsOf: root.appendingPathComponent("Sources/CodexPP/Resources/native-settings.js"), encoding: .utf8)
        let settings = try String(contentsOf: root.appendingPathComponent("Sources/CodexPP/Resources/settings.js"), encoding: .utf8)
        let result = try await evaluate("""
        \(runtime)
        \(settings)
        globalThis.routes=[]; globalThis.notifications=0;
        const native=__codexPPNativeSettings;
        const unsubscribe=native.subscribe(()=>notifications++);
        __codexPPSettings.update(state);
        const detach=native.attachNavigate(path=>routes.push(path));
        __codexPPSettings.update(JSON.parse(JSON.stringify(state)));
        state.intent=2;__codexPPSettings.update(state);
        detach();state.intent=3;__codexPPSettings.update(state);
        unsubscribe();
        JSON.stringify({routes,notifications,overlay:!!document.querySelector('[data-codexpp-settings-content]'),injectedNav:!!document.querySelector('[data-codexpp-settings-nav]'),native:__codexPPSettings.native});
        """, in: view)
        let values = try JSONSerialization.jsonObject(with: Data(result.utf8)) as! [String: Any]
        XCTAssertEqual(values["routes"] as? [String], ["/settings/codexpp-extensions", "/settings/codexpp-extensions"])
        XCTAssertEqual(values["notifications"] as? Int, 3)
        XCTAssertEqual(values["overlay"] as? Bool, false)
        XCTAssertEqual(values["injectedNav"] as? Bool, false)
        XCTAssertEqual(values["native"] as? Bool, true)
        _ = try await evaluate("__codexPPSettings.stop();__codexPPBridge.stop()", in: view)
    }
}
