import Foundation
import CodexPPCore

struct CDPTarget: Decodable, Sendable {
    let id: String
    let type: String
    let url: String
    let webSocketDebuggerUrl: String?
    var isAppPage: Bool {
        guard type == "page", let parsed = URL(string: url), parsed.scheme == "app", parsed.host == "-" else { return false }
        return ["/index.html", "/detached-window.html", "/settings"].contains(parsed.path) || parsed.path.hasPrefix("/settings/")
    }
}

struct RuntimeState: Decodable, Sendable {
    let id: String
    let state: String
    let error: String?
}

struct CDPClient: Sendable {
    let port: Int
    private var origin: String { "http://127.0.0.1:\(port)" }

    func targets() async throws -> [CDPTarget] {
        var request = URLRequest(url: URL(string: origin + "/json/list")!)
        request.timeoutInterval = 2
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw HelperError.message("The CDP endpoint did not respond.") }
        return try JSONDecoder().decode([CDPTarget].self, from: data).filter(\.isAppPage)
    }

    func synchronize(_ target: CDPTarget, bootstrap: String, extensions: [InstalledExtension]) async throws -> [RuntimeState] {
        let payload = extensions.map { ["id": $0.id, "code": $0.code] }
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        let json = String(decoding: data, as: UTF8.self)
        return try await evaluate(target, expression: "\(bootstrap)\n globalThis.__codexPP.sync(\(json))")
    }

    private func evaluate(_ target: CDPTarget, expression: String) async throws -> [RuntimeState] {
        guard let address = target.webSocketDebuggerUrl, let url = URL(string: address),
              url.scheme == "ws", ["127.0.0.1", "localhost"].contains(url.host ?? ""), url.port == port else {
            throw HelperError.message("Codex returned an unexpected debugger address.")
        }
        let socket = URLSession.shared.webSocketTask(with: url)
        socket.resume()
        let deadline = Task {
            do { try await Task.sleep(for: .seconds(8)); socket.cancel(with: .goingAway, reason: nil) } catch {}
        }
        defer { deadline.cancel(); socket.cancel(with: .normalClosure, reason: nil) }
        let command: [String: Any] = ["id": 1, "method": "Runtime.evaluate", "params": ["expression": expression, "awaitPromise": true, "returnByValue": true, "allowUnsafeEvalBlockedByCSP": true]]
        let commandData = try JSONSerialization.data(withJSONObject: command)
        try await socket.send(.string(String(decoding: commandData, as: UTF8.self)))
        while true {
            let message = try await socket.receive()
            let data: Data
            switch message { case .data(let value): data = value; case .string(let value): data = Data(value.utf8); @unknown default: continue }
            guard let reply = try JSONSerialization.jsonObject(with: data) as? [String: Any], reply["id"] as? Int == 1 else { continue }
            if let error = reply["error"] as? [String: Any] { throw HelperError.message(error["message"] as? String ?? "CDP rejected the extension runtime.") }
            guard let result = reply["result"] as? [String: Any] else { throw HelperError.message("Missing CDP result.") }
            if let exception = result["exceptionDetails"] as? [String: Any] {
                let detail = exception["exception"] as? [String: Any]
                throw HelperError.message(detail?["description"] as? String ?? exception["text"] as? String ?? "Extension runtime failed.")
            }
            guard let remote = result["result"] as? [String: Any], let value = remote["value"] else { throw HelperError.message("Missing extension status.") }
            return try JSONDecoder().decode([RuntimeState].self, from: JSONSerialization.data(withJSONObject: value))
        }
    }
}
