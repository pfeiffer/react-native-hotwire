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

Point it at a Turbo-enabled site:

```tsx
import { HotwireApp } from 'react-native-hotwire';

export default () => (
  <HotwireApp
    url="https://hotwire-native-demo.dev"
    pathConfigurationUrl="https://hotwire-native-demo.dev/configurations/ios_v1.json"
  />
);
```

That is the whole app: `HotwireProvider` with the app's user agent token and bridge
components, a stack with a web route per presentation, `HotwireScreen` on each,
the server's path configuration deciding which URL opens how, and every link under the
base URL handed to a web screen. It is the model Hotwire Native itself has, one stack and
one modal layer, and `example/` is exactly this against the official demo server.

Native screens sit next to the web ones:

```tsx
<HotwireApp
  url={baseURL}
  screens={[{ name: 'settings', component: SettingsScreen, path: 'settings' }]}
  onVisitProposal={(proposal) => {
    if (proposal.properties.screen === 'settings') return CommonActions.navigate({ name: 'settings' });
  }}
/>
```

A `path` makes the OS open the screen for that URL; a rule with `screen: settings` in the
path configuration makes a page link do the same, and `onVisitProposal` is the app's last
word on any proposal (see "Path configuration").

### Your own hierarchy

An app whose navigators come from elsewhere, a config document or named modal flows, keeps
them and places `HotwireScreen` in them, or composes `VisitableView` with its own router:

```tsx
import { VisitableView, useCurrentUrl, useVisitTo, getLinkingObject } from 'react-native-hotwire';

const linking = getLinkingObject(BASE_URL, linkingConfig); // pass to NavigationContainer

function WebScreen() {
  const url = useCurrentUrl(BASE_URL, linkingConfig);
  const visitTo = useVisitTo();

  return <VisitableView url={url} sessionHandle="main" onVisitProposal={({ url, action }) => visitTo(url, action)} />;
}

<HotwireProvider applicationNameForUserAgent="MyApp/1.0" bridgeComponents={[NavBarComponent]}>
  <NavigationContainer linking={linking}>...</NavigationContainer>
</HotwireProvider>
```

`HotwireProvider` holds what belongs to a session rather than a screen: the user agent token,
the bridge components it advertises, inspectability, and the path configuration. A session is
created by the first view on its handle and keeps its user agent for life, which is why these
are set once, above the navigators, and not per view. One provider per app.

### `HotwireScreen`

A React Navigation screen that is a Hotwire page, with the defaults upstream's Navigator
provides: the URL from the route params, the session from the screen's place in the
navigator tree (one per tab, one for modals, one default), proposals routed by
`useVisitHandler` with your `onVisitProposal` as the last word, `pull_to_refresh_enabled`
from the path configuration, and the page title as the screen title. Declare it once per
presentation your stack supports and name them in `routes`:

```tsx
<Stack.Screen name="web" component={HotwireScreen} initialParams={{ url: baseURL }} />
<Stack.Screen name="webModal" component={HotwireScreen} options={{ presentation: 'modal' }} />
```

A screen placed by hand, a tab root say, gets `initialParams={{ url }}`; screens reached
through proposals or links carry their URL already. Everything `VisitableView` takes,
`bridgeComponents`, `applicationNameForUserAgent`, `renderError`, passes through. For a
hierarchy the flat model cannot express, named modal flows or screens placed by a config,
compose `VisitableView` with your own router instead.

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
itself.

The values come from the web view's own safe area, read from a provider that is the view
itself, so they are already 0 for any edge a parent padded for. A navigator nested in a
screen with a bar of its own, top tabs say, narrows what the screen publishes instead: wrap
the tab screen in `PublishContentInsets` and read `ContentInsetsContext` in the navigator.

The properties describe floating chrome only. Use them for fixed elements, never for scroll
padding, and read them live rather than caching them. The keyboard is not chrome: the
native view gives up what the keyboard covers (Android), or resizes itself (iOS).

### Path configuration

Hotwire's [path configuration](https://native.hotwired.dev/reference/path-configuration)
decides how a URL is presented, from the server. It is a JSON document of `rules`, each
regex `patterns` plus `properties`, applied in order with later rules overwriting earlier
ones, and a `settings` sandbox for the app's own data. The vendored core matches every
visit against it natively; `loadPathConfiguration` feeds it and every `VisitProposal`
carries the matched `properties`.

```ts
import configuration from './path-configuration.json';

loadPathConfiguration({ document: configuration, url: `${baseURL}/configurations/app.json` });
```

The bundled document is available at once. The URL loads afterwards and is cached on disk,
and on the next launch that cache takes precedence over the bundled copy, so the server's
rules survive a restart. `getPathConfigurationSettings()` returns the `settings` of the
configuration loaded last; `addPathConfigurationListener` reports each load.

React Navigation is not involved in matching. `useVisitHandler` routes the standard
properties the way upstream's Navigator does: `context` and `modal_style` pick a route from
a table you declare once in the stack, `presentation` picks push, replace, pop, refresh,
none, clear_all or replace_root, and a `screen` property names a native route. The app
keeps the last word through `onVisitProposal(proposal, resolution)`: return nothing to
accept, your own resolution or action to substitute, `null` to drop.

```tsx
const handleVisitProposal = useVisitHandler({
  routes: { default: 'web', modal: 'webModal', full: 'webFullScreen' },
  onVisitProposal: (proposal, resolution) => {
    if (proposal.properties.screen === 'settings') return CommonActions.navigate({ name: 'Settings' });
  },
});

<VisitableView onVisitProposal={handleVisitProposal} ... />
```

Routed web screens receive `{ url, fullPath, properties }` as params; `fullPath` is what
`useCurrentUrl` reads.

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

The app's components are given to `HotwireProvider` (or `HotwireApp`) once; the web view's
user agent advertises their names per session, which is why the list is not per view. A
component is a function component made with `bridgeComponent`; it renders inside the screen
showing the page, so `useNavigation` and every other hook work in it. `example/bridge` has
the demo site's `form`, `menu` and `overflow-menu`:

```tsx
export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const reply = useBridgeReply();
  const [title, setTitle] = useState<string>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }) => setTitle(data.submitTitle));

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: title ? () => <Button title={title} onPress={() => reply('connect')} /> : undefined });
  }, [title, navigation, reply]);

  return null;
});
```

`useBridgeMessage(event, handler)` receives, `useBridgeReply()` answers the last message for
an event as upstream's `reply(to:)` does. The class `BridgeComponent` remains for components
written in upstream's shape, `onReceive` and `replyTo`.

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
