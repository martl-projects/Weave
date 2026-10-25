// swift-tools-version: 5.9
import Foundation
import PackageDescription

// The WeaveWorker plugin for iOS: bare-kit (ios/BareKit.xcframework, from
// fetch-bare-kit.ts) and the worker's native addons (ios/addons, from
// bare-link in build.ts, named by version, so they're listed from the folder).
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let addons = ((try? FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("ios/addons").path)) ?? [])
    .filter { $0.hasSuffix(".xcframework") }
    .sorted()
let addonTargets = addons.map { name in
    Target.binaryTarget(name: String(name.dropLast(".xcframework".count)).replacingOccurrences(of: ".", with: "_").replacingOccurrences(of: "-", with: "_"), path: "ios/addons/\(name)")
}

let package = Package(
    name: "WeaveCapacitorWorker",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "WeaveCapacitorWorker", targets: ["WeaveWorkerPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(name: "BareKit", path: "ios/BareKit.xcframework"),
        .target(
            name: "WeaveWorkerPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "BareKit",
            ] + addonTargets.map { .target(name: $0.name) },
            path: "ios/Sources/WeaveWorkerPlugin"),
    ] + addonTargets
)
