import Foundation
import CodexPPCore

struct SettingsRequest: Decodable, Sendable {
    let requestId: String
    let token: String
    let action: String
    let extensionId: String?
    let enabled: Bool?
}

@MainActor
final class SettingsSession {
    private let socket: URLSessionWebSocketTask
    let token = UUID().uuidString
    private var nextID = 0
    private var pending: [Int: CheckedContinuation<Data, Error>] = [:]
    private var deadlines: [Int: Task<Void, Never>] = [:]
    private var reader: Task<Void, Never>?
    private(set) var closed = false
    var onRequest: (@MainActor (SettingsRequest, Int, SettingsSession) async -> Void)?

    init(target: CDPTarget, port: Int) throws {
        guard let address = target.webSocketDebuggerUrl, let url = URL(string: address),
              url.scheme == "ws", ["127.0.0.1", "localhost"].contains(url.host ?? ""), url.port == port else {
            throw HelperError.message("Unexpected settings debugger address.")
        }
        socket = URLSession.shared.webSocketTask(with: url)
        socket.resume()
        reader = Task { [weak self, socket] in
            do {
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    let data: Data
                    switch message { case .data(let value): data = value; case .string(let value): data = Data(value.utf8); @unknown default: continue }
                    self?.receive(data)
                }
            } catch { self?.close() }
        }
    }
    func prepare() async throws {
        _ = try await request("Runtime.addBinding", ["name": "__codexPPInvoke"])
    }
    func evaluate(_ expression: String, contextID: Int? = nil) async throws {
        var parameters: [String: Any] = ["expression": expression, "returnByValue": true]
        if let contextID { parameters["contextId"] = contextID }
        _ = try await request("Runtime.evaluate", parameters)
    }
    private func request(_ method: String, _ parameters: [String: Any]) async throws -> Data {
        guard !closed else { throw HelperError.message("The settings connection closed.") }
        nextID += 1
        let id = nextID
        let data = try JSONSerialization.data(withJSONObject: ["id": id, "method": method, "params": parameters])
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            deadlines[id] = Task { [weak self] in
                do {
                    try await Task.sleep(for: .seconds(6))
                    self?.fail(id, error: HelperError.message("The desktop app did not respond."))
                    self?.close()
                } catch {}
            }
            Task { [weak self, socket] in
                do { try await socket.send(.string(String(decoding: data, as: UTF8.self))) } catch { self?.fail(id, error: error) }
            }
        }
    }
    private func fail(_ id: Int, error: Error) {
        deadlines.removeValue(forKey: id)?.cancel()
        pending.removeValue(forKey: id)?.resume(throwing: error)
    }
    private func receive(_ data: Data) {
        guard let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let id = value["id"] as? Int {
            if let error = value["error"] as? [String: Any] {
                fail(id, error: HelperError.message(error["message"] as? String ?? "Settings request failed.")); return
            }
            if let result = value["result"] as? [String: Any], let exception = result["exceptionDetails"] as? [String: Any] {
                fail(id, error: HelperError.message(exception["text"] as? String ?? "Settings script failed.")); return
            }
            deadlines.removeValue(forKey: id)?.cancel()
            pending.removeValue(forKey: id)?.resume(returning: data)
        } else if value["method"] as? String == "Runtime.bindingCalled",
                  let parameters = value["params"] as? [String: Any],
                  parameters["name"] as? String == "__codexPPInvoke",
                  let contextID = parameters["executionContextId"] as? Int,
                  let payload = parameters["payload"] as? String, payload.utf8.count < 8192,
                  let request = try? JSONDecoder().decode(SettingsRequest.self, from: Data(payload.utf8)), request.token == token {
            Task { [weak self] in
                guard let self, !self.closed else { return }
                await self.onRequest?(request, contextID, self)
            }
        }
    }
    func shutdown() async {
        try? await evaluate("globalThis.__codexPPSettings?.stop(); globalThis.__codexPPBridge?.stop()")
        close()
    }
    func close() {
        guard !closed else { return }
        closed = true
        reader?.cancel()
        socket.cancel(with: .normalClosure, reason: nil)
        let ids = Array(pending.keys)
        for id in ids { fail(id, error: HelperError.message("The settings connection closed.")) }
    }
}
