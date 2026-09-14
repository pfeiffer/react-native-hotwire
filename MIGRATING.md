# Migrating from react-native-turbo and react-native-web-screen

1. In `package.json`, remove `react-native-turbo` and `react-native-web-screen` and add
   `react-native-hotwire` from a git tag (see the README). Nothing is built at install
   time, so these can go too: the `postinstall` override in the old URL,
   `scripts/link-local-turbo.js`, and the `REACT_NATIVE_TURBO_PATH` block in
   `metro.config.js`.
2. Wrap the app in `HotwireProvider`. Settings that were per view move there, once:
   `stradaComponents` becomes `bridgeComponents`; `applicationNameForUserAgent` and
   `webViewDebuggingEnabled` are provider props.
3. Bridge components are function components: `bridgeComponent(name, Component)` with
   `useBridgeMessage(event, (message, reply) => …)`. The `StradaComponent` class and its
   `onReceive` and `replyTo` are gone. `StradaMessage` is now `BridgeMessage`.
4. Import everything from `react-native-hotwire`. `useWebviewNavigate` is now `useVisit`
   and `useVisitBuilder`. `useCurrentUrl` no longer takes a base URL; it and every path
   resolve against the prefix of the container's linking.
5. Check every `VisitableView` prop against the reference in the README. Several were
   renamed or changed shape, among them `onFormSubmissionStart`, `onFormSubmissionEnd`,
   `onAlert` and `onConfirm` (now `(event, respond)`), and `onError` (typed inline). The
   ref type is `VisitableViewRef`. Removed: `Session`, `withSession`, `buildWebScreen`,
   `refreshControlTopAnchor`, `contentInset`, `progressViewOffset`, and the app's own
   keyboard handling on Android, which the view now does itself.
6. Run `npx expo prebuild --clean` and build both platforms.
