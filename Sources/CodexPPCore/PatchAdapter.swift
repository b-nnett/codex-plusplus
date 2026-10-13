import Foundation

public struct PatchAdapter: Codable, Sendable {
    public let id: String
    public let version: String
    public let build: String
    public let main: String
    public let mainHash: String
    public let headerHash: String
    public let frameworkPath: String?
    public let frameworkHash: String?
    public let integrityOffset: Int?
    public let vendorAuthenticated: Bool?
    /// Bump whenever the bootstrap, runtimes or renderer patches change, so
    /// installed receipts from an older revision are restored and repatched.
    public static let revision = 106
    public static func id(build: String) -> String { "chatgpt-macos-\(build)-v\(revision)" }
    /// Receipts this adapter may replace: any revision of the same build.
    func accepts(receiptAdapter id: String) -> Bool {
        guard let match = id.wholeMatch(of: /chatgpt-macos-([0-9]+)-v([0-9]+)/),
              String(match.1) == build, let revision = Int(match.2) else { return id == self.id }
        return (1...Self.revision).contains(revision)
    }
    public static let current = PatchAdapter(id: id(build: "20052"), version: "26.1007.21159", build: "20052", main: ".vite/build/early-bootstrap.js", mainHash: "24286bb6b5fe449e6d4f1b8cfc061c35be57e54fe4ea0802b3e257f32c45fc33", headerHash: "c497f508930f223a999ec4c436a7526252914d380339db9e229cb023d200b41f", frameworkPath: "Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.40/Codex Framework", frameworkHash: "156ac7655cf758be69a3a441aeb3ef488a4d8b77c30b2a3f3fed6c26f7e6bc8b", integrityOffset: 267257136)
    public static let previous = PatchAdapter(id: id(build: "13536"), version: "26.1002.52244", build: "13536", main: ".vite/build/early-bootstrap.js", mainHash: "47fe797c40b015b19546b10cd5bf993be67ba76fa5648c6d652c7bb9149fb226", headerHash: "b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0", frameworkPath: "Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.27/Codex Framework", frameworkHash: "d987a157c88c5b8a7f1694261d40ced166cdd5544b28f5ff397d1783fc47ccbc", integrityOffset: 267156240)
    public static let reviewed: [PatchAdapter] = [.current, .previous]
    public var isReviewed: Bool { vendorAuthenticated == true || Self.reviewed.contains { $0.id == id } }
    public static func forBundle(_ app: URL) throws -> PatchAdapter {
        let data = try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist"))
        let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        if let adapter = reviewed.first(where: { $0.build == info?["CFBundleVersion"] as? String && $0.version == info?["CFBundleShortVersionString"] as? String }) { return adapter }
        let receiptURL = app.appendingPathComponent("Contents/Resources/codexpp-patch.json")
        let source: URL
        if FileManager.default.fileExists(atPath: receiptURL.path) {
            let receipt = try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: receiptURL))
            source = URL(fileURLWithPath: receipt.backupPath).resolvingSymlinksInPath()
        } else { source = app }
        let sourceInfo = try PropertyListSerialization.propertyList(from: Data(contentsOf: source.appendingPathComponent("Contents/Info.plist")), format: nil) as? [String: Any] ?? [:]
        guard sourceInfo["CFBundleVersion"] as? String == info?["CFBundleVersion"] as? String,
              sourceInfo["CFBundleShortVersionString"] as? String == info?["CFBundleShortVersionString"] as? String else {
            throw PatchError.invalid("The update backup version does not match the installed app.")
        }
        return try VendorUpdateAdapter.discover(source, info: sourceInfo)
    }
    public static func approveArchive(_ archive: AsarArchive) throws {
        if reviewed.contains(where: { $0.headerHash == archive.headerHash }) { return }
        let app = archive.url.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        try VendorUpdateAdapter.authenticate(app)
    }
    public init(id: String, version: String, build: String, main: String, mainHash: String, headerHash: String, frameworkPath: String? = nil, frameworkHash: String? = nil, integrityOffset: Int? = nil, vendorAuthenticated: Bool = false) {
        self.id = id; self.version = version; self.build = build; self.main = main; self.mainHash = mainHash; self.headerHash = headerHash
        self.frameworkPath = frameworkPath; self.frameworkHash = frameworkHash; self.integrityOffset = integrityOffset; self.vendorAuthenticated = vendorAuthenticated ? true : nil
    }
    public func validate(version: String, build: String, archive: AsarArchive) throws -> Data {
        guard version == self.version, build == self.build, archive.headerHash == headerHash else { throw PatchError.invalid("Unsupported ChatGPT build \(version) (\(build)). A reviewed patch adapter is required; the app has been left untouched.") }
        let package = try JSONSerialization.jsonObject(with: archive.data(at: "package.json")) as? [String: Any]
        guard package?["name"] as? String == "openai-codex-electron", package?["main"] as? String == main else { throw PatchError.invalid("Unexpected ChatGPT entry point.") }
        let source = try archive.data(at: main)
        guard sha256(source) == mainHash else { throw PatchError.invalid("The ChatGPT bootstrap does not match the reviewed adapter.") }
        return source
    }
    public func bootstrap(original: Data, port: Int, helper: URL, support: URL) throws -> Data {
        guard (1024...65535).contains(port), helper.pathExtension == "app", helper.path.hasPrefix("/"), support.path.hasPrefix("/") else { throw PatchError.invalid("Invalid bootstrap configuration.") }
        func literal(_ text: String) throws -> String { String(decoding: try JSONSerialization.data(withJSONObject: text, options: [.fragmentsAllowed, .withoutEscapingSlashes]), as: UTF8.self) }
        guard let browserURL = Bundle.module.url(forResource: "native-browser", withExtension: "js") else {
            throw PatchError.invalid("The native browser bridge is missing.")
        }
        let browserRuntime = try String(contentsOf: browserURL, encoding: .utf8)
        guard let shellURL = Bundle.module.url(forResource: "native-shell", withExtension: "js") else {
            throw PatchError.invalid("The native shell bridge is missing.")
        }
        let shellRuntime = try String(contentsOf: shellURL, encoding: .utf8)
        guard let captureURL = Bundle.module.url(forResource: "native-capture", withExtension: "js") else {
            throw PatchError.invalid("The native capture bridge is missing.")
        }
        let captureRuntime = try String(contentsOf: captureURL, encoding: .utf8)
        guard let hostURL = Bundle.module.url(forResource: "native-runtime", withExtension: "js"),
              let rendererURL = Bundle.module.url(forResource: "renderer-runtime", withExtension: "js"),
              let bridgeURL = Bundle.module.url(forResource: "renderer-bridge", withExtension: "js") else {
            throw PatchError.invalid("The native extension runtime is missing.")
        }
        let hostRuntime = try String(contentsOf: hostURL, encoding: .utf8)
        let rendererRuntime = try String(contentsOf: rendererURL, encoding: .utf8)
        let rendererBridge = try String(contentsOf: bridgeURL, encoding: .utf8)
        guard let bookmarksURL = Bundle.module.url(forResource: "native-bookmarks", withExtension: "js") else { throw PatchError.invalid("The native bookmarks bridge is missing.") }
        let bookmarksRuntime = try String(contentsOf: bookmarksURL, encoding: .utf8)
        guard let traceURL = Bundle.module.url(forResource: "native-trace", withExtension: "js") else { throw PatchError.invalid("The startup tracer is missing.") }
        let traceRuntime = try String(contentsOf: traceURL, encoding: .utf8)
        guard let appToolsParentURL = Bundle.module.url(forResource: "app-tools-parent", withExtension: "mjs") else { throw PatchError.invalid("The app-tools parent launcher is missing.") }
        let code = """
        /* Codex++ bootstrap schema 2; adapter \(id). */
        {
          const ppElectron = require('electron');
          const ppProbe = process.argv.includes('--codexpp-probe');
          let ppTrace;
          try { ppTrace = \(traceRuntime)(\(try literal(support.path)), \(try literal(id)), ppElectron); }
          catch (error) { console.error('[Codex++] trace:', error); ppTrace = {enabled:false, span:(_n, f) => f(), async:(_n, f) => f(), collector() {}, start() {}, flush() {}}; }
          const ppBootstrapStart = ppTrace.enabled ? ppTrace.now() : 0;
          try {
            const ppBrowserNative = ppTrace.span('bootstrap.nativeAddon', () => require(require('path').join(\(try literal(helper.path)), 'Contents', 'Resources', 'browser-native.node')));
            if (ppBrowserNative.protocol !== 1 || typeof ppBrowserNative.prepare !== 'function' || typeof ppBrowserNative.configureUpdates !== 'function') throw Error('Codex++ native addon contract changed.');
            if (ppBrowserNative.keychainInteractionAllowed !== false) throw Error('Codex++ noninteractive Keychain policy is unavailable.');
            ppElectron.app.commandLine.removeSwitch('remote-debugging-port');
            ppElectron.app.commandLine.removeSwitch('remote-debugging-address');
            ppElectron.app.whenReady().then(() => {
              const fs = require('fs'), path = require('path');
              const dir = path.join(\(try literal(support.path)), 'Diagnostics');
              fs.mkdirSync(dir, {recursive:true, mode:0o700});
              const file = path.join(dir, ppProbe ? 'probe.json' : 'boot.json');
              const temp = file + '.' + process.pid;
              fs.writeFileSync(temp, JSON.stringify({schema:1, adapter:\(try literal(id)), pid:process.pid, app:ppElectron.app.getAppPath(), port:\(port), electron:process.versions.electron, keychainInteractionAllowed:ppBrowserNative.keychainInteractionAllowed, time:new Date().toISOString()}), {mode:0o600});
              fs.renameSync(temp, file);
              if (ppProbe) ppElectron.app.exit(0);
            }).catch(error => { console.error('[Codex++] boot:', error); if (ppProbe) ppElectron.app.exit(1); });
            if (!ppProbe) {
              void ppElectron.app.whenReady().then(() => ppTrace.start(ppElectron));
              // Startup experiments, off unless Diagnostics/experiments.json enables
              // them; read once, before the app registers anything.
              let ppExperiments = {};
              try { ppExperiments = JSON.parse(require('fs').readFileSync(require('path').join(\(try literal(support.path)), 'Diagnostics', 'experiments.json'), 'utf8')) ?? {}; } catch {}
              // Node's on-disk compile cache for the app's main-process bundles,
              // keyed to this adapter; flushed once startup has settled. On by
              // default (about 0.1 s per launch); experiments can turn it off.
              if (ppExperiments.compileCache !== false) {
                try {
                  const ppModule = require('module');
                  if (typeof ppModule.enableCompileCache === 'function') {
                    ppModule.enableCompileCache(require('path').join(\(try literal(support.path)), 'CompileCache', \(try literal(id))));
                    void ppElectron.app.whenReady().then(() => { const ppFlush = setTimeout(() => { try { ppModule.flushCompileCache?.(); } catch {} }, 15000); ppFlush.unref?.(); });
                  }
                } catch (error) { console.error('[Codex++] compile cache:', error); }
              }
              // Experimental V8 flags for renderers (e.g. a larger young generation).
              if (typeof ppExperiments.jsFlags === 'string' && /^(--[a-z0-9-]+(=[\\w.]+)?\\s*)+$/.test(ppExperiments.jsFlags.trim())) {
                const ppFlags = [ppElectron.app.commandLine.getSwitchValue('js-flags'), ppExperiments.jsFlags.trim()].filter(Boolean).join(' ');
                ppElectron.app.commandLine.appendSwitch('js-flags', ppFlags);
              }
              if (ppExperiments.opaqueWindows === true) globalThis.__codexPPOpaqueWindows = true;
              // Experimental stylesheet for app windows (A/B tests of rendering costs).
              if (typeof ppExperiments.css === 'string' && ppExperiments.css.length <= 4096) {
                const ppCss = ppExperiments.css;
                ppElectron.app.on('web-contents-created', (_event, contents) => {
                  contents.on('did-finish-load', () => { if (contents.getURL().startsWith('app://')) contents.insertCSS(ppCss).catch(() => {}); });
                });
              }
              if (ppExperiments.codeCache === true) {
                const ppRegisterSchemes = ppElectron.protocol.registerSchemesAsPrivileged.bind(ppElectron.protocol);
                ppElectron.protocol.registerSchemesAsPrivileged = schemes => ppRegisterSchemes(Array.isArray(schemes)
                  ? schemes.map(entry => entry?.scheme === 'app' && entry.privileges?.standard === true && entry.privileges.codeCache === undefined
                    ? {...entry, privileges: {...entry.privileges, codeCache: true}} : entry)
                  : schemes);
              }
              Object.defineProperty(globalThis, '__codexPPWrapAppToolsConfig', {value: config => {
                if (process.platform !== 'darwin') return config;
                const parent = \(try literal(appToolsParentURL.path));
                if (typeof config?.command !== 'string' || !Array.isArray(config?.args) ||
                    !config.command.endsWith('/scripts/launch_codex_app_tools_mcp') ||
                    config.args.length < 1 || !config.args[0].endsWith('/server.mjs') && config.args[0] !== './server.mjs') {
                  throw Error('Codex app-tools launch contract changed.');
                }
                return {...config, args:[parent, ...config.args]};
              }, configurable:false, enumerable:false, writable:false});
              // Sparkle loads its addon later. Configure its delegate before init
              // can start a check, without changing download/signature validation.
              const ppModule = require('module'), ppLoad = ppModule._load;
              ppModule._load = function(request, parent, isMain) {
                const loaded = ppLoad.apply(this, arguments);
                if (typeof request === 'string' && request.endsWith('/native/sparkle.node')) {
                  if (!ppBrowserNative?.configureUpdates(\(try literal(helper.path)), \(try literal(support.path)), \(try literal(String(decoding: JSONEncoder().encode(PatchAdapter.reviewed.map(\.build)), as: UTF8.self))))) {
                    throw Error('Codex++ update handoff is unavailable.');
                  }
                }
                return loaded;
              };
              const ppNativeBrowser = ppTrace.span('bootstrap.browser', () => \(browserRuntime)(ppElectron, \(try literal(support.path)), ppBrowserNative));
              const ppNativeBookmarks = ppTrace.span('bootstrap.bookmarks', () => \(bookmarksRuntime)(ppElectron, \(try literal(support.path))));
              const ppNativeShell = ppTrace.span('bootstrap.shell', () => \(shellRuntime)(ppElectron, \(try literal(support.path))));
              const ppCaptureRequestChannel = 'codex_desktop:message-from-view';
              const ppCaptureResponseChannel = 'codex_desktop:message-for-view';
              const ppNativeCapture = ppTrace.span('bootstrap.capture', () => \(captureRuntime)(ppElectron, ppTrace));
              const ppNativeRuntime = ppTrace.span('bootstrap.runtime', () => \(hostRuntime)(ppElectron, \(try literal(support.path)), \(try literal(rendererRuntime)), \(try literal(rendererBridge)), ppTrace));

              const ppHandle = ppElectron.ipcMain.handle.bind(ppElectron.ipcMain);
              ppElectron.ipcMain.handle = (channel, listener) => ppHandle(channel, channel === ppCaptureRequestChannel
                ? (event, request) => ppTrace.span(`ipc.${typeof request?.type === 'string' ? request.type.slice(0, 48) : 'unknown'}`, () => {
                    if (ppNativeBookmarks.handles(request)) { ppNativeBookmarks.handle(event, request); return; }
                    if (ppNativeRuntime.handles(request)) { ppNativeRuntime.handle(event, request); return; }
                    if (request?.type === 'codexpp-shell-shortcut') {
                      try { ppNativeShell.shortcut(event, request); } catch {}
                      return;
                    }
                    if (request?.type === 'codexpp-shell-controls') {
                      let result;
                      try { result = ppNativeShell.controls(event, request); }
                      catch { result = {supported:false, hidden:false}; }
                      if (typeof request.requestId === 'string' && request.requestId.length <= 128) {
                        event.sender.send(ppCaptureResponseChannel, {type:'codexpp-shell-controls-result', requestId:request.requestId, ...result});
                      }
                      return;
                    }
                    if (request?.type === 'codexpp-browser-autofill') {
                      const result = ppNativeBrowser.setEnabled(event, request.enabled);
                      if (typeof request.requestId === 'string' && request.requestId.length <= 128) {
                        event.sender.send(ppCaptureResponseChannel, {type:'codexpp-browser-autofill-result', requestId:request.requestId, ...result});
                      }
                      return;
                    }
                    if (ppNativeCapture.handles(request)) {
                      void ppNativeCapture.relay(event, request).catch(error => console.error('[Codex++] rejected Appshot request:', error));
                      return;
                    }
                    return listener(event, request);
                  })
                : listener);
              // Warm the Appshot runtime after startup settles, not while the first window loads.
              void ppElectron.app.whenReady().then(() => ppNativeCapture.warmup(15000)).catch(error => console.error('[Codex++] headless Appshot warmup:', error));
              ppElectron.app.on('before-quit', () => { ppNativeCapture.dispose(); ppNativeRuntime.dispose(); });

              ppTrace.span('bootstrap.helper', () => {
                const child = require('child_process').spawn('/usr/bin/open', ['-g', \(try literal(helper.path))], {detached:true, stdio:'ignore'});
                child.on('error', error => console.error('[Codex++] helper:', error)); child.unref();
              });
              if (ppTrace.enabled) ppTrace.measure('bootstrap.total', ppBootstrapStart);
            }
          } catch (error) { console.error('[Codex++] bootstrap:', error); if (ppProbe) ppElectron.app.exit(1); }
          if (ppProbe) return;
        }
        """
        var result = Data(code.utf8); result.append(Data("\n".utf8)); result.append(original); return result
    }
}
