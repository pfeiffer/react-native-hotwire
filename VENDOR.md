# Vendored Hotwire Native

This package embeds the Turbo session implementation from Hotwire Native rather than
depending on the upstream packages: hotwire-native-ios ships as SwiftPM only, and the
Android core cannot be adapted to a React Native view hierarchy without touching a few of
its files. Everything React Native specific lives outside the vendored directories.

`scripts/sync-upstream.sh` reads the tags below and replaces the vendored sources.

ios-tag: 1.3.1
android-tag: 1.3.1
ios-sha: dbc4fc0fec0d2401f0be46015793bfcb29ec07a4
android-sha: a49cb9bf87e095d52c2f9529f951c78f20b2dc23

The vendored trees were verified against clones of these tags on 2026-09-08 (1.1.x) and bumped to 1.3.1 the same day.

## iOS: `ios/Vendor/HotwireNative/`

Copied from `Source/` at the tag:

- `Turbo/Session`, `Turbo/Visit`, `Turbo/Visitable`, `Turbo/WebView`, `Turbo/Networking`,
  `Turbo/Path Configuration`, `Turbo/Errors`, `Turbo/Utils` (verbatim)
- `Turbo/Navigator/Extensions/WKNavigationAction+Utils.swift`, copied to `Turbo/Extensions/`
  (verbatim; the session delegate's policy decisions use it)
- `Logging/`, `ScriptMessageHandler.swift` (verbatim)

Not copied: the rest of `Turbo/Navigator`, `Turbo/ViewControllers`, `Turbo/Models`, `Bridge`,
`NavigationHandler.swift`, `WebView.swift`, `Hotwire.swift`, `HotwireConfig.swift`, Xcode project
and SwiftPM metadata. Navigation is React
Navigation's job and bridge components are implemented in JavaScript.

Replaced by our own files in `ios/`:

- `HotwireConfig.swift`: the vendored code only reads `Hotwire.config.pathConfiguration`,
  `redirectResolutionTimeout` and the logging switch. Also provides the `WebViewPolicyManager.Decision`
  type that `SessionDelegate` uses; the manager itself belongs to the Navigator.
- `Bundle+Module.swift`: provides the `Bundle.module` accessor SwiftPM would generate.

## Android: `android/hotwire-core/`

Copied from `core/src/main` at the tag, built by our own `build.gradle` as the Gradle
project `:hotwire-native-core`.

Not copied: `bridge/` (JavaScript bridge components live in this package's JS),
`assets/js/bridge_components.js`, `assets/json/test-configuration.json`. Dropping
`bridge/` also drops the kotlinx-serialization dependency.

`navigation-fragments` is not used at all. `android/src/main/java/com/reactnativehotwire/HotwiredView.kt`
and `ScreenshotHolder.kt` are ports of its `HotwireView` and `HotwireViewScreenshotHolder`.

Modified files, each marked with a `react-native-hotwire:` comment:

- `config/HotwireConfig.kt`: bridge component registry and JSON converter removed.
- `turbo/webview/HotwireWebView.kt`: `initDayNightTheming()` wrapped in a
  `ClassCastException` guard. Some WebView providers on older Android versions throw from
  `WebSettingsCompat`; this crashed in production. Upstream still lacks the guard.
- `turbo/config/PathConfigurationRepository.kt`: the remote path configuration request runs
  `call.execute()` on the IO dispatcher instead of `executeAsync()`. React Native pins OkHttp 4
  and its cookie jar crashes against OkHttp 5, so `android/hotwire-core/build.gradle` keeps
  OkHttp 4.x, which has no `okhttp-coroutines` artifact.

## Upgrading

1. Bump the tags above, run `yarn sync-upstream`. The script replaces the vendored trees
   wholesale and then fails if any file that carried a `react-native-hotwire:` marker in
   HEAD lost it, listing the files to re-apply.
2. Re-apply the modifications listed above, then `git diff` the rest to review upstream changes.
3. Compare the dependency block printed by the script with `android/hotwire-core/build.gradle`.
4. Fix compile errors in the adapter files under `ios/` and `android/src`, never in vendored files.
5. Build the consuming app on both platforms.
