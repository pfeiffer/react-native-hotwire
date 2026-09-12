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
  `Turbo/Path Configuration`, `Turbo/Errors`, `Turbo/Utils` (verbatim, except as listed below)
- `Turbo/Navigator/Extensions/WKNavigationAction+Utils.swift`, copied to `Turbo/Extensions/`
  (verbatim; the session delegate's policy decisions use it)
- `Logging/`, `ScriptMessageHandler.swift` (verbatim)

Not copied: the rest of `Turbo/Navigator`, `Turbo/ViewControllers`, `Turbo/Models`, `Bridge`,
`NavigationHandler.swift`, `WebView.swift`, `Hotwire.swift`, `HotwireConfig.swift`, Xcode project
and SwiftPM metadata. Navigation is React
Navigation's job and bridge components are implemented in JavaScript.

Modified files, each marked with a `react-native-hotwire:` comment:

- `Turbo/Visit/ColdBootVisit.swift`, `Turbo/Visit/VisitDelegate.swift`, `Turbo/Session/Session.swift`:
  a redirect during a cold boot cancels the visit and is reported by kind through two new
  `VisitDelegate` requirements. A same-origin redirect becomes a `replace` proposal with
  `redirected: true` in its parameters instead of being followed; upstream iOS follows it
  and leaves the screen with the URL it started from. A cross-origin redirect goes to
  `session(_:didProposeVisitToCrossOriginRedirect:)`, the route a JavaScript visit's
  already takes, instead of arriving as a plain proposal. Only the policy decision after
  the first counts as a redirect: WebKit re-serializes the request URL for the first one.
  The protocol change means step 4 below has an exception: `Session` must implement both
  new `VisitDelegate` requirements.
- `Turbo/Session/Session.swift`, `visitableViewWillAppear`: a current visit that has already
  completed for the appearing visitable counts as the forward navigation. Visits start when
  the screen mounts, before its appearance, so a quick one is complete by then; upstream, whose
  visits start from the appearance, only expected `.started`, and treated the completed one as a
  return to a page beneath, starting a restore visit that fetched the page a second time.
- `Turbo/WebView/turbo.js`: a JavaScript visit whose response came from a redirect is not
  rendered; the visit is cancelled and the redirect location is proposed as a `replace` visit
  carrying the response, so a screen for it renders without a second request. Upstream renders
  first and lets Turbo's `followRedirect` propose afterwards, which leaves the redirected
  page in the screen that asked for another one.

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
- `turbo/config/PathConfiguration.kt` and `turbo/config/PathConfigurationLoader.kt`:
  `Location.bundledJson`, a bundled configuration passed as a JSON string, for a document that
  ships in the JavaScript bundle rather than in the APK's assets.
- `turbo/session/Session.kt` and `turbo/session/SessionCallback.kt`: a main-frame cold boot
  redirect is reported by kind, as the iOS cold boot does. To another host it goes to
  `visitProposedToCrossOriginRedirect`; on the same host to the new
  `visitProposedToRedirectLocation`, so a destination can tell it from a page's own `replace`
  proposal. Upstream proposed both as plain `replace` visits, subframes included.
- `assets/js/turbo.js`: the same redirected-visit change as the iOS adapter script.
- `turbo/session/Session.kt`, `visitLocationAsColdBoot`: a cold boot given a response in its
  options renders it with `loadDataWithBaseURL` instead of fetching the URL, as the iOS
  `ColdBootVisit` does with `loadHTMLString`. Upstream always fetched, so a page opened in
  another session from a form's or a redirect's proposal was requested twice and a flash
  set on the redirect was lost.
- `turbo/visit/VisitResponse.kt`: `redirected`, which Turbo sends and upstream drops, so the
  proposal event can carry it.
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
