// swift-tools-version: 6.2

import PackageDescription

// The corpus's Swift outputs: one test target per design, its path the design's swift/ directory.
let designs = ["concurrency", "continue-as-new", "messages"]

let package = Package(
    name: "Corpus",
    platforms: [.macOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-temporal-sdk.git", exact: "1.5.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.15.0"),
    ],
    targets: designs.map { design in
        .testTarget(
            // continue-as-new is ContinueAsNew.
            name: design.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(),
            dependencies: [
                .product(name: "Temporal", package: "swift-temporal-sdk"),
                .product(name: "TemporalTestKit", package: "swift-temporal-sdk"),
                .product(name: "Logging", package: "swift-log"),
            ],
            path: "\(design)/swift",
            exclude: ["\(design).twf"],
            swiftSettings: [.treatAllWarnings(as: .error)]
        )
    }
)
