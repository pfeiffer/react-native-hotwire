// swift-tools-version: 5.9

// The Expo-free part of the iOS module, for XCTest: the vendored Hotwire Native sources
// and the view controller that fits them to React Native screens. The app consumes the
// module through RNHotwire.podspec; this package only serves `xcodebuild test`.
import PackageDescription

let package = Package(
  name: "HotwireCore",
  platforms: [.iOS(.v16)],
  targets: [
    .target(
      name: "HotwireCore",
      path: ".",
      // Turbo/WebView is listed file by file: turbo.js sits there, and SwiftPM will not
      // take a file as both a source-directory member and a resource.
      sources: [
        "Vendor/HotwireNative/Logging",
        "Vendor/HotwireNative/ScriptMessageHandler.swift",
        "Vendor/HotwireNative/Turbo/Errors",
        "Vendor/HotwireNative/Turbo/Extensions",
        "Vendor/HotwireNative/Turbo/Networking",
        "Vendor/HotwireNative/Turbo/Path Configuration",
        "Vendor/HotwireNative/Turbo/Session",
        "Vendor/HotwireNative/Turbo/Utils",
        "Vendor/HotwireNative/Turbo/Visit",
        "Vendor/HotwireNative/Turbo/Visitable",
        "Vendor/HotwireNative/Turbo/WebView/JavaScriptExpression.swift",
        "Vendor/HotwireNative/Turbo/WebView/JSON.swift",
        "Vendor/HotwireNative/Turbo/WebView/ScriptMessage.swift",
        "Vendor/HotwireNative/Turbo/WebView/WebViewBridge.swift",
        "HotwireConfig.swift",
        "HotwiredVisitableViewController.swift",
      ],
      resources: [.copy("Vendor/HotwireNative/Turbo/WebView/turbo.js")]
    ),
    .testTarget(
      name: "HotwireCoreTests",
      dependencies: ["HotwireCore"],
      path: "Tests/HotwireCoreTests"
    ),
  ]
)
