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

Point a stack at a Turbo-enabled site:

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HotwireProvider, hotwireLinking, hotwireScreens } from 'react-native-hotwire';
import configuration from './path-configuration.json';

const baseURL = 'https://example.com';
const Stack = createNativeStackNavigator();

export default () => (
  <HotwireProvider pathConfiguration={configuration} pathConfigurationUrl={`${baseURL}/configurations/app.json`}>
    <NavigationContainer linking={hotwireLinking(baseURL)}>
      <Stack.Navigator>{hotwireScreens(Stack)}</Stack.Navigator>
    </NavigationContainer>
  </HotwireProvider>
);
```

`HotwireProvider` carries the app's user agent token, bridge components and path
configuration. `hotwireScreens` is the web routes the app's native stack needs, one per
presentation, each a `HotwireScreen`, with the path configuration deciding which URL opens how, bundled for the
first launch and refreshed from the server after. `hotwireLinking` hands every URL under the
base URL to a web screen, and its prefix is the one place the origin is stated: everything
under the container resolves paths against it, so `hotwireScreens(Stack, { path: '/inbox' })`,
`visit('/inbox')` and `screen.visit('/session/new', 'replace')` all work (`useBaseURL()` reads it). It is the model Hotwire Native itself has, one stack and one modal
layer, and the navigators are yours: tabs, theme, header styling and everything else is
plain React Navigation. `example/` is exactly this against the official demo server, three
tabs each with a stack and a session of their own, with the demo's rules written for this
library in `example/path-configuration.json`.

Native screens sit next to the web ones:

```tsx
<Stack.Navigator>
  {hotwireScreens(Stack)}
  <Stack.Screen name="settings" component={SettingsScreen} />
</Stack.Navigator>
```

`hotwireLinking(baseURL, { settings: 'settings' })` makes the OS open the screen for that
URL; a rule with `screen: settings` in the path configuration makes a page link do the same,
and `onVisitProposal` is the app's last word on any proposal (see "Path configuration"). To
set `onError` or `onVisitProposal` once for every web route, give `hotwireScreens` a
`component` that wraps `HotwireScreen` with them.

### Errors and authentication

A failed visit shows `renderError` in its screen, a message and a Retry that reloads, as
upstream's error presenter does. Anything beyond that is the app's, through
`HotwireScreen`'s `onError(error, screen)`, where `screen` can `retry`, `pop` the screen, or
`visit` a page, with the `replace` action to swap the failed page for it in place. `error.statusCode` is the HTTP
status, or a `SystemStatusCode` for a failure with no response, a network error say. The
upstream demo's answer to a 401 is one line of it, in `example/App.tsx`:
`screen.visit('/session/new', 'replace')`, and the server redirects back once signed in.

### Your own hierarchy

An app whose navigators come from elsewhere, a config document or named modal flows, keeps
them and places `HotwireScreen` in them, or composes `VisitableView` with its own router:

```tsx
import { VisitableView, useCurrentUrl, useVisit, getLinkingObject } from 'react-native-hotwire';

const linking = getLinkingObject(BASE_URL, linkingConfig); // pass to NavigationContainer

function WebScreen() {
  const url = useCurrentUrl();
  const visit = useVisit();

  return <VisitableView url={url} sessionHandle="main" onVisitProposal={({ url, action }) => visit(url, action)} />;
}

<HotwireProvider applicationNameForUserAgent="MyApp/1.0" bridgeComponents={[NavBarComponent]}>
  <NavigationContainer linking={linking}>...</NavigationContainer>
</HotwireProvider>
```

`HotwireProvider` holds what belongs to a session rather than a screen: the user agent token,
the bridge components it advertises, inspectability, and the path configuration. A session is
created by the first view on its handle and keeps its user agent for life, which is why these
are set once, above the navigators, and not per view. One provider per app. The token
defaults to `defaultApplicationNameForUserAgent`, the `Hotwire Native` and `Turbo Native`
tokens a server keys on; an app that adds its own keeps them:
`applicationNameForUserAgent={`${defaultApplicationNameForUserAgent} MyApp/1.0`}`.

| `HotwireProvider` prop | Description |
|---|---|
| `applicationNameForUserAgent` | Appended to every web view's user agent, followed by the bridge component list. Defaults to `defaultApplicationNameForUserAgent`. |
| `bridgeComponents` | The app's bridge components, made with `bridgeComponent`. Their names are advertised in the user agent. |
| `webViewDebuggingEnabled` | Makes the web views inspectable from Safari and Chrome. Default `false`. |
| `pathConfiguration` | The bundled path configuration document, available before the server's arrives. |
| `pathConfigurationUrl` | The server's path configuration, loaded after the bundled one and cached for the next launch. |

### `HotwireScreen`

A React Navigation screen that is a Hotwire page, with the defaults upstream's Navigator
provides: the URL from the route params, the session from the screen's place in the
navigator tree (one per tab, one for modals, one default), proposals routed by
`useVisitHandler` with your `onVisitProposal` as the last word, `pull_to_refresh_enabled`
from the path configuration, and the page title as the screen title. `hotwireScreens`
declares one per presentation; to change one, give it options by presentation, the
path configuration's `context` and `modal_style` words:

```tsx
{hotwireScreens(Stack, { options: { medium: { sheetAllowedDetents: [0.5, 1] } } })}
```

The route names behind them are the app's. Rename them, or add a `modal_style` of your
own for the server to use, and `hotwireScreens` and every screen navigate by the same table:

```tsx
const routes: VisitRoutes<RootRoute, 'inline'> = { ...defaultVisitRoutes, medium: 'sheet', inline: 'inlineWeb' };

{hotwireScreens(Stack, { routes, options: { inline: { presentation: 'containedModal' } } })}
<HotwireScreen {...props} routes={routes} />
```

A screen you write yourself keeps its name in `routes` and `hotwireScreenId`, which pops
back to a page already in the stack instead of pushing it again:

```tsx
<Stack.Screen name="sheet" component={SheetScreen} getId={hotwireScreenId} options={{ presentation: 'formSheet' }} />
```

A route the table names but no navigator in the tree declares falls back, sheet to modal
and modal to push, with a warning in development, so a presentation the app left out
degrades instead of dropping the visit. Typed against the app's route names, a name that is
not a route is a compile error. `modal_style` is read under `context: "modal"` only; a
presentation that is not a modal at all is a property of the server's own, handled in
`onVisitProposal`.

| `hotwireScreens(Stack, options)` | Description |
|---|---|
| `Stack` | The app's `createNativeStackNavigator()`. Warns in development if it is not a native stack, whose presentations the screens rely on. |
| `path` | The page the stack starts on, a path under the base URL. Default `/`. |
| `component` | The screen for every web route. Default `HotwireScreen`; wrap it to set `onError` or `onVisitProposal` once for all of them. |
| `routes` | Route names per presentation, the table the screens navigate by. Default `defaultVisitRoutes`. |
| `options` | Navigation options per presentation, merged over the native presentation each gets. A style of the app's own gets `modal` unless its options say otherwise. |

A screen placed by hand, a tab root say, gets `initialParams={{ fullPath: '/inbox' }}`, a path
resolved against the linking prefix; screens reached through proposals or links carry their
URL already. Everything `VisitableView` takes, `renderError` say, passes through, with these
differences:

| `HotwireScreen` prop | Description |
|---|---|
| `sessionHandle` | Default: the chain of tab routes above the screen, `modal` for a modal route, else `default`, so every tab has a session as upstream's Navigators do. |
| `routes` | Route names per presentation; see `VisitRoutes`. Default `defaultVisitRoutes`. |
| `onVisitProposal(proposal, resolution)` | The app's say on every proposal, after `useVisitHandler` resolved it. Return nothing to accept, a resolution or navigation action to substitute, `null` to drop. |
| `titleFromPage` | Sets the screen title from the page title on each load. Default `true`. |
| `pullToRefreshEnabled` | Overrides the path configuration's `pull_to_refresh_enabled`, which defaults to `true`. |
| `onError(error, screen)` | A visit failed. `renderError` shows regardless; `screen` offers `retry()`, `pop()` and `visit(urlOrPath, action)`. |
| `onCrossOriginRedirect` | Default: pop the screen the redirected visit was pushed for, then `onOpenExternalUrl`, as upstream does. |

A URL on another host goes to `onOpenExternalUrl`, whose default `openExternalUrl` is
exported so a handler that takes one scheme for itself, `sms:` say, can hand the rest back
to it. For a hierarchy the flat model cannot express, named modal flows or screens placed
by a config, compose `VisitableView` with your own router instead.

### `VisitableView`

| Prop | Description |
|---|---|
| `url` | Required. The page to show. A new value visits it in the same session. |
| `sessionHandle` | Screens sharing a handle share one web view and Turbo session. Default `"Default"`. |
| `onVisitProposal(proposal)` | Required. Turbo proposed a visit: `{ url, action, properties }`. Navigate with `useVisit`, or route it with `useVisitHandler`. |
| `onLoad(event)` | A page finished loading: `{ url, title }`. |
| `onError(error)` | A visit failed: `{ url, statusCode, description }`, `statusCode` an HTTP status or a `SystemStatusCode`. `renderError` shows regardless. |
| `onOpenExternalUrl(event)` | A link to another host, or a non-http scheme. Default `openExternalUrl`: an in-app browser when `expo-web-browser` is installed, else the system. |
| `onCrossOriginRedirect(event)` | A visit followed a redirect to another origin, so this page never loaded. Default `onOpenExternalUrl`; `HotwireScreen` adds the pop. |
| `onFormSubmissionStart(event)`, `onFormSubmissionEnd(event)` | The page submitted a form and got its response, Turbo's `turbo:submit-start` and `turbo:submit-end`: `{ url }`. |
| `onContentProcessDidTerminate(event)` | The web content process died. Default: reload the view. |
| `onMessage(message)` | Every message the page's bridge components send, before the native components see it. |
| `onAlert(event, respond)`, `onConfirm(event, respond)` | Replace the `Alert` shown for `window.alert` and `window.confirm`. Call `respond` to let the page continue. |
| `onScroll(event)` | The page scrolled. Unlike the other callbacks this is the synthetic event, with React Native's `ScrollView` shape under `nativeEvent`, so `Animated.event` and anything written for a `ScrollView` reads it. For chrome the app draws itself; native headers and tabs collapse on their own. |
| `renderLoading()` | Overlay while a visit loads. Default: a centered spinner. |
| `renderError(error, reload)` | Overlay for a failed visit. Default: a message and a Retry that reloads. |
| `pullToRefreshEnabled` | Pull down to reload the page. Default `true`. |
| `scrollEnabled` | Default `true`. |
| `style`, `testID` | As on any view. |

Ref (`VisitableViewRef`): `reload()` cold-boots the page, `refresh()` refreshes through
Turbo, `injectJavaScript(script)`.

The web view is configured the way Hotwire Native configures it, and these are not props:
mobile pages even on iPad, one process pool for every session, link previews off, media
inline and autoplaying as in Safari and Chrome so the page decides with its markup, and the
pull-to-refresh spinner resting below whatever chrome floats over the top of the page. An
app that needs a web view setting beyond that composes its own `VisitableView` request
rather than a prop.

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
configuration loaded last; `addPathConfigurationListener` reports each load;
`getPathProperties(url)` returns what a proposal for `url` would carry, for the URLs that
never become one, a screen placed by hand or a deep link.

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
    if (proposal.properties.screen === 'settings') return CommonActions.navigate('Settings');
  },
});

<VisitableView onVisitProposal={handleVisitProposal} ... />
```

Routed web screens receive `{ url, fullPath, properties }` as params; `fullPath` is what
`useCurrentUrl` reads. A proposal for the page on top replaces it and one for the page
beneath pops, as upstream does; `query_string_presentation: replace` in a rule makes a
query change count as the same page. `hotwireScreens` also keys its screens by path through
`getId`, so React Navigation pops back to a page already in the stack instead of pushing it
again.

### Bridge components

The injected adapter talks to `@hotwired/hotwire-native-bridge` (`window.HotwireNative`)
and to the older `@hotwired/strada` (`window.Strada`).

The app's components are given to `HotwireProvider` once; the web view's
user agent advertises their names per session, which is why the list is not per view. A
component is a function component made with `bridgeComponent`; it renders inside the screen
showing the page, so `useNavigation` and every other hook work in it. `example/bridge` has
the demo site's `form`, `menu` and `overflow-menu`:

```tsx
export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ title: string; submit: () => void }>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }, reply) =>
    setButton({ title: data.submitTitle, submit: () => reply() })
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: button ? () => <Button title={button.title} onPress={button.submit} /> : undefined });
  }, [button, navigation]);

  return null;
});
```

`useBridgeMessage(event, handler)` calls the handler with each message for `event` and a
`reply` bound to that message, merging the data given into the message's own. The reply can
come later, after an await or from a button the handler set up, and still answers the
message that asked.

### Navigation

- `hotwireLinking(baseURL, screens?)`: the `linking` prop for a container whose web screens
  are the catch-all. Every URL under `baseURL` opens the `web` route with the URL as params
  unless `screens` maps its path to a native route.
- `getLinkingObject(baseURL, config)`: the same for a `config` of your own. Linked
  routes receive `baseURL` and `fullPath` params.
- `useBaseURL()`: the linking prefix, what paths resolve against.
- `useCurrentUrl(config?)`: the URL the current screen should load, its `fullPath` param or
  its configured path resolved against the base URL. Both come from the container's
  linking; `config` is for a path config other than the one linking uses.
- `useVisit()`: `visit(urlOrPath, visitAction)`, Turbo's `visit` and the counterpart of React
  Navigation's `useLinkTo`: the URL is matched through the container's linking, so it lands
  wherever a deep link to it would.
- `useVisitBuilder()`: `buildAction(urlOrTarget, visitAction)` returns the navigation action
  and `willChangeTopmostNavigator` without dispatching, for a handler that adjusts it first.

## Migrating from react-native-turbo / react-native-web-screen

1. `package.json`: remove `react-native-turbo` and `react-native-web-screen`, add
   `react-native-hotwire` (git URL above). Remove the `scripts.postinstall` override in the
   old URL; nothing is built at install time any more.
2. Imports: everything comes from `react-native-hotwire`.
   `useWebviewNavigate` became `useVisit` and `useVisitBuilder`; `useCurrentUrl`,
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
