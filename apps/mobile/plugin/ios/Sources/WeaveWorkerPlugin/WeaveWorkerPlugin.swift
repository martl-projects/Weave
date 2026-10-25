import BareKit
import Capacitor
import Foundation
import UIKit

/// Runs the phone app's worker (worklet/main.ts, packed into
/// public/worklet.ios.bundle) on Bare and carries its lines: post() sends one
/// to it, and each line it writes arrives in the WebView as a "message" event.
/// Going to the background suspends the worker; coming back resumes it.
@objc(WeaveWorkerPlugin)
public class WeaveWorkerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeaveWorkerPlugin"
    public let jsName = "WeaveWorker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "post", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hold", returnType: CAPPluginReturnPromise)
    ]

    private var worklet: BareWorklet?
    private var ipc: BareIPC?
    private var partial = Data()
    private var outbox: [Data] = []
    private var writing = false
    /// IPC callbacks come on bare-kit's own queue; everything here goes through this one.
    private let queue = DispatchQueue(label: "app.weave.worker")

    override public func load() {
        guard let url = Bundle.main.url(forResource: "worklet.ios", withExtension: "bundle", subdirectory: "public"),
              let source = try? Data(contentsOf: url),
              let worklet = BareWorklet(configuration: nil)
        else {
            CAPLog.print("WeaveWorker: the worker's bundle is missing")
            return
        }
        // The name's extension tells Bare that this is a bundle.
        worklet.start("/worklet.bundle", source: source, arguments: [])
        guard let ipc = BareIPC(worklet: worklet) else { return }
        self.worklet = worklet
        self.ipc = ipc
        ipc.readable = { [weak self] _ in self?.queue.async { self?.drain() } }

        // First: where the worker keeps its file (the phone's key and its computer).
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("weave").path
        let start = try? JSONSerialization.data(withJSONObject: ["op": "start", "dir": dir])
        send((start ?? Data()) + Data("\n".utf8))

        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in self?.worklet?.suspend() }
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { [weak self] _ in self?.worklet?.resume() }
    }

    @objc func post(_ call: CAPPluginCall) {
        guard let message = call.getString("message"), ipc != nil else {
            call.reject(ipc == nil ? "the worker didn't start" : "nothing to send")
            return
        }
        send(Data((message + "\n").utf8))
        call.resolve()
    }

    /// Android keeps the worker running under a room's browser tab; here the
    /// browser opens inside the app, which stays in front, so nothing to do.
    @objc func hold(_ call: CAPPluginCall) {
        call.resolve()
    }

    /// Whole lines from the worker, each to the WebView.
    private func drain() {
        guard let ipc else { return }
        while let data = ipc.read() {
            if data.isEmpty {
                // The worker closed its end.
                ipc.readable = nil
                return
            }
            partial.append(data)
            while let end = partial.firstIndex(of: UInt8(ascii: "\n")) {
                let line = String(decoding: partial[partial.startIndex..<end], as: UTF8.self)
                partial.removeSubrange(partial.startIndex...end)
                notifyListeners("message", data: ["message": line])
            }
        }
    }

    /// Writes go out one at a time: a write may be partial and finish later.
    private func send(_ data: Data) {
        queue.async {
            self.outbox.append(data)
            if !self.writing { self.next() }
        }
    }

    private func next() {
        guard let ipc, !outbox.isEmpty else {
            writing = false
            return
        }
        writing = true
        ipc.write(outbox.removeFirst()) { [weak self] error in
            if let error { CAPLog.print("WeaveWorker: couldn't write to the worker: \(error)") }
            self?.queue.async { self?.next() }
        }
    }
}
