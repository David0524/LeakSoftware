// swift-tools-version: 6.1

import PackageDescription

// The iPhone app (docs/plans/swift-app.md). Libraries build and test on Linux; the app target
// is SwiftUI and builds for iPhone with xtool (cloud sessions) or Xcode (macOS CI).
let package = Package(
    name: "SundeckPro",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        // xtool builds the one library product as the app.
        .library(name: "SundeckPro", targets: ["SundeckApp"])
    ],
    dependencies: [
        .package(url: "https://github.com/skiptools/swift-sqlcipher", exact: "1.13.0"),
        .package(url: "https://github.com/supabase/supabase-swift", exact: "2.55.4"),
        .package(url: "https://github.com/getsentry/sentry-cocoa", exact: "9.30.2"),
        // Tests only: the sync integration tests reach Postgres directly, like packages/sync's.
        .package(url: "https://github.com/vapor/postgres-nio", exact: "1.33.1"),
        .package(url: "https://github.com/apple/swift-log", exact: "1.16.1"),
    ],
    targets: [
        .target(name: "SundeckCore"),
        .target(
            name: "SundeckStorage",
            dependencies: [.product(name: "SQLCipher", package: "swift-sqlcipher")]
        ),
        .target(name: "SundeckSync", dependencies: ["SundeckCore", "SundeckStorage"]),
        // Tests only: a sync transport straight to Postgres, and the two-device test harness.
        .target(
            name: "SundeckSyncPostgres",
            dependencies: [
                "SundeckSync",
                .product(name: "PostgresNIO", package: "postgres-nio"),
                .product(name: "Logging", package: "swift-log"),
            ]
        ),
        // Tests only: a Swift phone that packages/sync's cross-engine test drives over stdin.
        .executableTarget(name: "SundeckSyncDevice", dependencies: ["SundeckSyncPostgres"]),
        .target(
            name: "SundeckApp",
            dependencies: [
                "SundeckCore",
                "SundeckStorage",
                "SundeckSync",
                .product(name: "Supabase", package: "supabase-swift"),
                .product(name: "Sentry", package: "sentry-cocoa", condition: .when(platforms: [.iOS])),
            ]
        ),
        .testTarget(name: "SundeckCoreTests", dependencies: ["SundeckCore"]),
        .testTarget(name: "SundeckSyncTests", dependencies: ["SundeckSync"]),
        .testTarget(
            name: "SundeckSyncIntegrationTests",
            dependencies: [
                "SundeckSyncPostgres",
                .product(name: "PostgresNIO", package: "postgres-nio"),
                .product(name: "Logging", package: "swift-log"),
            ]
        ),
        .testTarget(name: "SundeckStorageTests", dependencies: ["SundeckStorage"]),
        .testTarget(
            name: "SundeckAppTests",
            dependencies: [
                "SundeckApp", "SundeckStorage", "SundeckSync", .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
    ]
)
