// swift-tools-version:5.9
// Platform-neutral core of the iOS (and future watchOS) client: data model v2,
// validation, migration of 0.4.0 files, commands, dose schedule, backup format
// and EN/PL texts. Foundation only, so it also builds and tests on Linux/Windows.
import PackageDescription

let package = Package(
    name: "SymptoPageCore",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [.library(name: "SymptoPageCore", targets: ["SymptoPageCore"])],
    targets: [
        .target(name: "SymptoPageCore"),
        .testTarget(
            name: "SymptoPageCoreTests",
            dependencies: ["SymptoPageCore"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
