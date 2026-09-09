# react-native-hotwire

Hotwire Native for React Native and Expo: a `VisitableView` that renders server-side
pages through a shared Turbo session per navigator, bridge components implemented in
JavaScript, and React Navigation glue that turns Turbo visit proposals into stack actions.

Built as an Expo Module (Fabric-ready). The Turbo session code is vendored from Hotwire
Native, see `VENDOR.md`. Not published to npm; consume it from git.

## Install

```sh
yarn add react-native-hotwire@github:pfeiffer/react-native-hotwire#v1.0.0
npx expo prebuild
```

Requirements: Expo SDK 57+, React Native 0.86+, React Navigation 7, New Architecture.

## Usage

```tsx
import { VisitableView, useCurrentUrl, useVisitTo, getLinkingObject } from 'react-native-hotwire';

const linking = getLinkingObject(BASE_URL, linkingConfig); // pass to NavigationContainer

function WebScreen() {
  const url = useCurrentUrl(BASE_URL, linkingConfig);
  const visitTo = useVisitTo();

  return (
    <VisitableView
      url={url}
      sessionHandle="main"
      bridgeComponents={[NavBarComponent]}
      onVisitProposal={({ url, action }) => visitTo(url, action)}
    />
  );
}
```

### `VisitableView`

| Prop | Description |
|---|---|
| `url` | Page to visit. Changing it visits the new URL in the same session. |
| `sessionHandle` | Screens sharing a handle share one web view and Turbo session. Default `"Default"`. |
| `bridgeComponents` | `BridgeComponent` subclasses. Their names are advertised in the user agent as `bridge-components: [...]`. |
| `applicationNameForUserAgent` | Appended to the user agent. |
| `onVisitProposal` | Required. Turbo proposed a visit; navigate with `useVisitTo`. |
| `onLoad`, `onError`, `onOpenExternalUrl`, `onFormSubmissionStarted/Finished`, `onContentProcessDidTerminate`, `onMessage` | Session events. |
| `onAlert`, `onConfirm` | Replace the default `Alert` dialogs for `window.alert` / `window.confirm`. |
| `renderLoading`, `renderError` | Overlays. |
| `pullToRefreshEnabled`, `scrollEnabled`, `contentInset` (iOS), `progressViewOffset` (Android), `webViewDebuggingEnabled` | Web view configuration. |

Ref (`VisitableViewRef`): `reload()` cold-boots the page, `refresh()` refreshes through
Turbo, `injectJavaScript(script)`.

On Android the view gives up whatever the software keyboard covers of it, measured from its
own bottom edge and updated on every frame of the keyboard animation, so a page reflows to the
visible area and scrolls its focused field into view. Edge-to-edge apps get no window resize
for the keyboard; this replaces it, the way Hotwire Native's `applyDefaultImeWindowInsets`
does. iOS resizes the web view itself.

### Sessions

Every `sessionHandle` owns one web view and one Turbo session, created by the first
`VisitableView` mounted with that handle and reused by the rest. The web view's user agent,
including `applicationNameForUserAgent` and the `bridgeComponents` list, is fixed at
creation, so give every screen on a handle the same values.

Give every tab its own handle, as Hotwire Native does. A page keeps its web view while it
is off screen and the session leaves it alone when it comes back, so a tab return is instant;
only a page popped off a stack gives its web view up, and only a page that lacks one asks the
session to restore it. A handle shared across tabs would show a stale screenshot on return.

`getSessionHandles()`, `reloadSession(handle)`, `refreshSession(handle)`,
`clearSessionSnapshotCache(handle)`.

### Content insets

Translucent chrome, the iOS 26 navigation and tab bars, floats over the page, and a page's
fixed elements have to clear it. The library tells the page how much, as CSS custom
properties on `<html>`: `--hotwire-inset-top`, `--hotwire-inset-right`,
`--hotwire-inset-bottom` and `--hotwire-inset-left`, siblings of `env(safe-area-inset-*)`.
They are 0 wherever the chrome is opaque and takes layout, so a page needs no platform
checks, and they are re-applied after every Turbo render. `VisitableView` does this by
itself; `insetProperties={false}` turns it off.

The values come from the web view's own safe area, read from a provider that is the view
itself, so they are already 0 for any edge a parent padded for. A navigator nested in a
screen with a bar of its own, top tabs say, narrows what the screen publishes instead: wrap
the tab screen in `PublishContentInsets` and read `ContentInsetsContext` in the navigator.

The properties describe floating chrome only. Use them for fixed elements, never for scroll
padding, and read them live rather than caching them. The keyboard is not chrome: the
native view gives up what the keyboard covers (Android), or resizes itself (iOS).

### Bridge components

```ts
import { BridgeComponent } from 'react-native-hotwire';

class NavBarComponent extends BridgeComponent {
  static componentName = 'nav-bar';

  onReceive(message) {
    if (message.event === 'setHeaderRightActions') {
      // ...
      this.replyTo(message.event, { selectedIndex: 0 });
    }
  }
}
```

The injected adapter talks to `@hotwired/hotwire-native-bridge` (`window.HotwireNative`)
and to the older `@hotwired/strada` (`window.Strada`).

### Navigation

- `getLinkingObject(baseURL, config)`: the `linking` prop for `NavigationContainer`. Linked
  routes receive `baseURL` and `fullPath` params.
- `useCurrentUrl(baseURL, config)`: the URL the current screen should load.
- `useVisitTo()`: `visitTo(urlOrTarget, visitAction)`, the counterpart of React Navigation's
  `useLinkTo`. Unmatched URLs resolve to the innermost screen named `Fallback`, so define one
  in each navigator that should catch visits.
- `useVisitBuilder()`: `buildAction(urlOrTarget, visitAction)` returns the navigation action
  and `willChangeTopmostNavigator` without dispatching, for a handler that adjusts it first.

## Migrating from react-native-turbo / react-native-web-screen

1. `package.json`: remove `react-native-turbo` and `react-native-web-screen`, add
   `react-native-hotwire` (git URL above). Remove the `scripts.postinstall` override in the
   old URL; nothing is built at install time any more.
2. Imports: everything comes from `react-native-hotwire`.
   `useWebviewNavigate` became `useVisitTo` and `useVisitBuilder`; `useCurrentUrl`,
   `getLinkingObject` moved here.
3. `stradaComponents` → `bridgeComponents`; `StradaComponent` → `BridgeComponentType`;
   `StradaMessage` → `BridgeMessage`.
4. `useRef<typeof VisitableView>` → `useRef<VisitableViewRef>`.
5. Removed: `Session`, `withSession`, `buildWebScreen`, `refreshControlTopAnchor`.
6. Delete `scripts/link-local-turbo.js`, the `REACT_NATIVE_TURBO_PATH` block in
   `metro.config.js`, and the `postinstall` script entry. For local development use
   `"react-native-hotwire": "file:../path/to/react-native-hotwire"`, or `yarn link`;
   Expo autolinking picks the module up either way.
7. `npx expo prebuild --clean`, then build both platforms.

## Development

`yarn typecheck` (needs the peer dependencies installed, e.g. `ln -s ../app/node_modules`).
Native code is compiled by the consuming app; there is no standalone build.
