# Vendored Hotwire Native

This package embeds the Turbo session implementation from Hotwire Native rather than
depending on the upstream packages: hotwire-native-ios ships as SwiftPM only, and the
Android core cannot be adapted to a React Native view hierarchy without touching two of
its files. Everything React Native specific lives outside the vendored directories.

`scripts/sync-upstream.sh` reads the tags below and replaces the vendored sources.

ios-tag: 1.1.3
android-tag: 1.1.1
ios-sha: (record after first sync from a real clone)
android-sha: (record after first sync from a real clone)

Initial import was reconstructed from the react-native-turbo fork's vendored copies with
that fork's patches reverse-applied, because the upstream repos could not be cloned from
the authoring session. Run the sync script once against the real tags and confirm
`git diff` is empty apart from the deviations listed here.

## iOS: `ios/Vendor/HotwireNative/`

Copied from `Source/` at the tag:

- `Turbo/Session`, `Turbo/Visit`, `Turbo/Visitable`, `Turbo/WebView`, `Turbo/Networking`,
  `Turbo/Path Configuration`, `Turbo/TurboError.swift` (verbatim)
- `HotwireLogger.swift`, `ScriptMessageHandler.swift` (verbatim)

Not copied: `Turbo/Navigator`, `Bridge`, `HotwireNavigationController.swift`,
`HotwireWebViewController.swift`, `Router.swift`, `WebView.swift`, `Hotwire.swift`,
`HotwireConfig.swift`, Xcode project and SwiftPM metadata. Navigation is React
Navigation's job and bridge components are implemented in JavaScript.

Replaced by our own files in `ios/`:

- `HotwireConfig.swift`: the vendored code only reads `Hotwire.config.pathConfiguration`.
- `Bundle+Module.swift`: provides the `Bundle.module` accessor SwiftPM would generate.

## Android: `android/hotwire-core/`

Copied from `core/src/main` at the tag, built by our own `build.gradle` as the Gradle
project `:hotwire-native-core`.

Not copied: `bridge/` (JavaScript bridge components live in this package's JS),
`assets/js/bridge_components.js`, `assets/json/test-configuration.json`. Dropping
`bridge/` also drops the kotlinx-serialization dependency.

`navigation-fragments` is not used at all. `android/src/main/java/com/reactnativehotwired/HotwiredView.kt`
and `ScreenshotHolder.kt` are ports of its `HotwireView` and `HotwireViewScreenshotHolder`.

Modified files, each marked with a `react-native-hotwired:` comment:

- `config/HotwireConfig.kt`: bridge component registry and JSON converter removed.
- `turbo/webview/HotwireWebView.kt`: `initDayNightTheming()` wrapped in a
  `ClassCastException` guard. Some WebView providers on older Android versions throw from
  `WebSettingsCompat`; this crashed in production. Upstream still lacks the guard.

## Upgrading

1. Bump the tags above, run `yarn sync-upstream`.
2. Re-apply the two Android modifications if the sync overwrote them (the script replaces
   `src/main` wholesale), then `git diff` the rest to review upstream changes.
3. Compare the dependency block printed by the script with `android/hotwire-core/build.gradle`.
4. Fix compile errors in the adapter files under `ios/` and `android/src`, never in vendored files.
5. Build the consuming app on both platforms.
