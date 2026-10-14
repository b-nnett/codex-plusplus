import AppKit
import Combine
import CodexPPCore

@main
struct CodexPPApp {
    @MainActor static func main() {
        if PatchCLI.runIfRequested() { return }
        let app = NSApplication.shared
        let delegate = HelperDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
        withExtendedLifetime(delegate) {}
    }
}

@MainActor
final class HelperDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let model = HelperModel()
    private var item: NSStatusItem!
    private let menu = NSMenu()
    private var statusEntry: NSMenuItem?
    private var repairEntry: NSMenuItem?
    private var menuOpen = false
    private var messageSubscription: AnyCancellable?
    private var skipCleanup = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let id = Bundle.main.bundleIdentifier,
           let existing = NSRunningApplication.runningApplications(withBundleIdentifier: id).first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            existing.activate(options: [.activateAllWindows])
            skipCleanup = true
            NSApp.terminate(nil)
            return
        }
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = menuBarIcon()
        item.button?.imagePosition = .imageOnly
        item.button?.setAccessibilityLabel("Codex++ menu")
        item.button?.toolTip = "Codex++"
        menu.autoenablesItems = false
        menu.delegate = self
        item.menu = menu
        model.statusChanged = { [weak self] in self?.rebuildMenu() }
        messageSubscription = model.$message.dropFirst().sink { [weak self] message in
            if let message {
                DispatchQueue.main.async { self?.showError(message) }
            }
        }
        rebuildMenu()
        model.startMonitoring()
        if let message = model.message { DispatchQueue.main.async { [weak self] in self?.showError(message) } }
        if model.isPreview || ProcessInfo.processInfo.arguments.contains("--show-menu") {
            DispatchQueue.main.async { [weak self] in self?.showMenu() }
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // ChatGPT's bootstrap reopens the helper with `open -g` on every launch,
        // which does not activate it. Only a user-initiated open (Finder,
        // Spotlight, Dock) activates the app, so only that shows the menu.
        DispatchQueue.main.async { [weak self] in if NSApp.isActive { self?.showMenu() } }
        return false
    }
    private func menuBarIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSColor.black.setStroke()
            let mark = NSBezierPath()
            mark.lineWidth = 2.7
            mark.lineCapStyle = .round
            for angle in [0.0, Double.pi / 4, Double.pi / 2, 3 * Double.pi / 4] {
                let dx = CGFloat(cos(angle)) * 6.2
                let dy = CGFloat(sin(angle)) * 6.2
                mark.move(to: NSPoint(x: 9 - dx, y: 9 - dy))
                mark.line(to: NSPoint(x: 9 + dx, y: 9 + dy))
            }
            mark.stroke()
            return true
        }
        image.isTemplate = true
        return image
    }
    private func extensionPlaceholderIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 16, height: 16), flipped: false) { _ in
            NSColor.black.setFill()
            for rect in [NSRect(x: 1, y: 1, width: 6, height: 6),
                         NSRect(x: 9, y: 1, width: 6, height: 6),
                         NSRect(x: 1, y: 9, width: 6, height: 6),
                         NSRect(x: 10, y: 10, width: 4, height: 4)] {
                NSBezierPath(roundedRect: rect, xRadius: 1.5, yRadius: 1.5).fill()
            }
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Extension"
        return image
    }
    private func warningIcon() -> NSImage? {
        let image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Extension error")
        image?.isTemplate = true
        return image
    }
    private func menuBarWarningIcon() -> NSImage? {
        let image = NSImage(systemSymbolName: "exclamationmark.triangle.fill", accessibilityDescription: "Codex++ needs attention")?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [.systemRed]))
        image?.isTemplate = false
        return image
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if skipCleanup { return .terminateNow }
        guard !model.busy else { model.message = "Wait for the current operation to finish before quitting."; return .terminateCancel }
        model.prepareToQuit { approved in sender.reply(toApplicationShouldTerminate: approved) }
        return .terminateLater
    }
    func menuWillOpen(_ opened: NSMenu) {
        guard opened === menu else { return }
        try? model.reloadExtensions()
        rebuildMenu()
        menuOpen = true
    }
    func menuDidClose(_ closed: NSMenu) {
        if closed === menu { menuOpen = false; rebuildMenu() }
    }
    @discardableResult
    private func add(_ title: String, to parent: NSMenu, action: Selector? = nil, enabled: Bool = true, representedObject: Any? = nil) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: action, keyEquivalent: "")
        entry.target = self; entry.isEnabled = enabled; entry.representedObject = representedObject
        parent.addItem(entry)
        return entry
    }
    private func submenu(_ title: String, in parent: NSMenu) -> NSMenu {
        let child = NSMenu(title: title)
        child.autoenablesItems = false
        add(title, to: parent).submenu = child
        return child
    }
    private func rebuildMenu() {
        guard item != nil else { return }
        item.button?.toolTip = "Codex++ — \(model.isPreview ? "Preview" : model.status)"
        let needsAttention = !model.busy && model.statusError != nil
        item.length = needsAttention ? NSStatusItem.variableLength : NSStatusItem.squareLength
        item.button?.title = needsAttention ? "Fix" : ""
        item.button?.imagePosition = needsAttention ? .imageLeading : .imageOnly
        item.button?.image = model.busy ? NSImage(systemSymbolName: "arrow.triangle.2.circlepath", accessibilityDescription: model.status) : (needsAttention ? menuBarWarningIcon() : menuBarIcon())
        statusEntry?.title = model.status
        repairEntry?.isEnabled = !model.busy && !model.isPreview
        item.button?.setAccessibilityLabel(model.statusError.map { "Codex++ menu — \($0)" } ?? "Codex++ menu")
        guard !menuOpen else { return }
        menu.removeAllItems()
        repairEntry = nil
        statusEntry = add(model.status, to: menu, enabled: false)
        if case .ready(let version) = model.updater.state {
            add("Restart to Update Codex++ to \(version)", to: menu, action: #selector(installUpdate), enabled: !model.busy && !model.isPreview)
                .image = NSImage(systemSymbolName: "arrow.down.circle", accessibilityDescription: "Update available")
        }
        if let title = model.repairActionTitle {
            repairEntry = add(title, to: menu, action: #selector(repair), enabled: !model.busy && !model.isPreview)
            repairEntry?.image = NSImage(systemSymbolName: "wrench.and.screwdriver", accessibilityDescription: "Repair Extensions support")
        }
        menu.addItem(.separator())
        if let errorStatus = model.extensionErrorStatus {
            add(errorStatus, to: menu, enabled: false).image = warningIcon()
            menu.addItem(.separator())
        }
        let extensions = submenu("Extensions", in: menu)
        if model.extensions.isEmpty { add("No extensions installed", to: extensions, enabled: false) }
        for extensionItem in model.extensions {
            let failed = model.runtimeErrors[extensionItem.id] != nil
            let title = extensionItem.manifest.name + (failed ? " — Error" : "")
            let entry = add(title, to: extensions, action: #selector(openExtension(_:)), enabled: !model.busy, representedObject: extensionItem.id)
            entry.image = failed ? warningIcon() : extensionPlaceholderIcon()
            entry.toolTip = [extensionItem.manifest.description, "Version \(extensionItem.manifest.version)", model.runtimeErrors[extensionItem.id]].compactMap { $0 }.joined(separator: "\n")
        }
        if model.settings.extensionsPaused { add("Extensions paused", to: extensions, enabled: false) }
        extensions.addItem(.separator())
        add("Open in Finder", to: extensions, action: #selector(openExtensionFolder))
        if let startup = model.startupStatus {
            let total = startup.active.count + startup.missing.count
            let speedups = submenu(startup.missing.isEmpty ? "Startup Speed-ups: All \(total) Active" : "Startup Speed-ups: \(startup.active.count) of \(total) Active", in: menu)
            if !startup.missing.isEmpty {
                menu.items.last?.image = warningIcon()
                add("Not matched in this ChatGPT build:", to: speedups, enabled: false)
                for item in startup.missing { add(item.name, to: speedups, enabled: false).toolTip = item.reason }
                speedups.addItem(.separator())
            }
            for name in startup.active { add(name, to: speedups, enabled: false).state = .on }
        }
        menu.addItem(.separator())
        add(model.settings.extensionsPaused ? "Restart ChatGPT with Extensions" : "Restart ChatGPT without Extensions", to: menu, action: #selector(restart), enabled: !model.busy)
        if model.hasPatchedApp {
            let restore = add("Restore Original ChatGPT…", to: menu, action: #selector(restoreOriginal), enabled: !model.busy)
            restore.isAlternate = true
            restore.keyEquivalentModifierMask = .option
        }
        menu.addItem(.separator())
        add("Settings…", to: menu, action: #selector(revealPreferences), enabled: !model.busy)
        let updates = submenu("Codex++ \(model.updater.currentVersion)", in: menu)
        switch model.updater.state {
        case .checking: add("Checking for updates…", to: updates, enabled: false)
        case .building(let version): add("Preparing Codex++ \(version)…", to: updates, enabled: false)
        case .failed(let reason): add("Last update check failed", to: updates, enabled: false).toolTip = reason
        default: break
        }
        add("Check for Updates…", to: updates, action: #selector(checkForUpdates), enabled: !model.isPreview)
        add("Update Automatically", to: updates, action: #selector(toggleAutomaticUpdates), enabled: !model.busy).state = model.settings.checkForUpdates ? .on : .off
        add("GitHub", to: menu, action: #selector(github))
        menu.addItem(.separator())
        add("Quit", to: menu, action: #selector(quitHelper), enabled: !model.busy)
    }
    private func showMenu() {
        guard !menuOpen, let button = item?.button else { return }
        NSApp.activate(ignoringOtherApps: true)
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.minY - 3), in: button)
    }
    private func showError(_ text: String) {
        model.message = nil
        menu.cancelTracking()
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Could not complete the action"
        alert.informativeText = text
        alert.runModal()
    }
    private func extensionItem(_ sender: NSMenuItem) -> InstalledExtension? {
        guard let id = sender.representedObject as? String else { return nil }
        return model.extensions.first { $0.id == id }
    }
    @objc private func openExtension(_ sender: NSMenuItem) {
        if let extensionItem = extensionItem(sender) { model.openSettings(manageExtensions: true, extensionID: extensionItem.id) }
    }
    @objc private func restart() { model.restart(extensionsPaused: !model.settings.extensionsPaused) }
    @objc private func repair() { model.repair() }
    @objc private func restoreOriginal() { model.restoreOriginal() }
    @objc private func revealPreferences() { menu.cancelTracking(); model.openSettings() }
    @objc private func openExtensionFolder() { model.showFiles() }
    @objc private func github() { menu.cancelTracking(); model.openURL(model.github) }
    @objc private func quitHelper() { model.quit() }
    @objc private func installUpdate() { menu.cancelTracking(); model.installUpdate() }
    @objc private func checkForUpdates() { menu.cancelTracking(); model.checkForUpdates() }
    @objc private func toggleAutomaticUpdates() { model.setAutomaticUpdates(!model.settings.checkForUpdates) }
}
