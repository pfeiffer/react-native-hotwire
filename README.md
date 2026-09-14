# react-native-hotwire

[![CI](https://github.com/pfeiffer/react-native-hotwire/actions/workflows/ci.yml/badge.svg)](https://github.com/pfeiffer/react-native-hotwire/actions/workflows/ci.yml)

Hotwire Native for React Native and Expo.

- `VisitableView` shows a server-rendered page. Screens that share a session handle share
  one web view and one Turbo session, like a Hotwire Native navigator.
- Turbo visit proposals become React Navigation actions. Links push screens, forms and
  redirects work, screen titles come from the pages.
- Bridge components are written in JavaScript.

The library is an Expo Module and supports the New Architecture. The Turbo session code is
vendored from Hotwire Native; see `VENDOR.md`. The package is not on npm. Install it from a
git tag.

**Contents**

- [Getting started](#getting-started): [Install](#install), [A minimal app](#a-minimal-app),
  [Path configuration](#path-configuration), [Native screens](#native-screens),
  [Paths and the base URL](#paths-and-the-base-url)
- [Guides](#guides): [Path configuration in depth](#path-configuration-in-depth),
  [Bridge components](#bridge-components), [Sessions](#sessions),
  [Errors and authentication](#errors-and-authentication),
  [Redirects and external links](#redirects-and-external-links),
  [Content insets](#content-insets), [Your own navigation hierarchy](#your-own-navigation-hierarchy)
- [Reference](#reference): [`HotwireProvider`](#hotwireprovider), [`hotwireScreens`](#hotwirescreens),
  [`HotwireScreen`](#hotwirescreen), [`VisitableView`](#visitableview),
  [Linking and navigation](#linking-and-navigation), [Session functions](#session-functions)
- [Migrating from react-native-turbo](MIGRATING.md)
- [Development](#development)

## Getting started

### Install

```sh
yarn add react-native-hotwire@github:pfeiffer/react-native-hotwire#v0.1.5
npx expo prebuild
```

Use the latest tag from the [releases](https://github.com/pfeiffer/react-native-hotwire/tags).

Requirements: Expo SDK 57 or later, React Native 0.86 or later, React Navigation 7, and
the New Architecture.

### A minimal app

Point a native stack at a Turbo-enabled site:

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HotwireProvider, hotwireLinking, hotwireScreens } from 'react-native-hotwire';

const baseURL = 'https://example.com';
const Stack = createNativeStackNavigator();

export default () => (
  <HotwireProvider>
    <NavigationContainer linking={hotwireLinking(baseURL)}>
      <Stack.Navigator>{hotwireScreens(Stack)}</Stack.Navigator>
    </NavigationContainer>
  </HotwireProvider>
);
```

This is a working app:

- Every link pushes a screen.
- Forms and redirects work.
- Screen titles come from the pages.
- Pull to refresh is on.
- Links to other hosts open in the browser.
- A failed visit shows an error with a Retry button.

`hotwireScreens(Stack)` adds one screen per presentation: push, modal, sheet. Each is a
`HotwireScreen`. `hotwireLinking(baseURL)` sends every URL under the base URL to those
screens. This is the model Hotwire Native itself has, one stack and one modal layer. The
navigators are yours: tabs, themes and header styling are plain React Navigation.

`example/` is this app against the official demo server, with three tabs. Look there for a
complete setup.

### Path configuration

The server decides how a URL is presented, as a push, a modal or a native screen, through a
path configuration document. Give the provider a bundled copy and the URL of the server's:

```tsx
import configuration from './path-configuration.json';

<HotwireProvider
  pathConfiguration={configuration}
  pathConfigurationUrl={`${baseURL}/configurations/app.json`}
>
```

The bundled document applies at once. The server's loads afterwards and is cached, so its
rules apply from the start on the next launch. `example/path-configuration.json` has the
demo server's rules. More in [Path configuration in depth](#path-configuration-in-depth).

### Native screens

Native screens sit next to the web ones:

```tsx
<Stack.Navigator>
  {hotwireScreens(Stack)}
  <Stack.Screen name="settings" component={SettingsScreen} />
</Stack.Navigator>
```

Three ways lead to it:

- A deep link. `hotwireLinking(baseURL, { settings: 'settings' })` opens the screen for that
  URL.
- A page link. A path configuration rule with `"screen": "settings"` does the same.
- Your own code. `onVisitProposal` on a `HotwireScreen` can answer any proposal with a
  navigation action.

To set `onError` or `onVisitProposal` once for every web screen, give `hotwireScreens` a
`component` that wraps `HotwireScreen` with them.

### Paths and the base URL

The base URL is stated once, as the prefix of the container's linking. Everything under the
container resolves paths against it:

- `hotwireScreens(Stack, { path: '/inbox' })`
- `visit('/inbox')` from `useVisit()`
- `screen.visit('/session/new', 'replace')` in an error handler
- `initialParams={{ fullPath: '/inbox' }}` on a screen you place yourself

`useBaseURL()` returns it.

## Guides

### Path configuration in depth

Hotwire's [path configuration](https://native.hotwired.dev/reference/path-configuration) is
a JSON document with `rules`. Each rule has regex `patterns` and `properties`. Rules apply
in order, and later rules overwrite earlier ones. A `settings` object holds whatever the
app wants from the server.

The vendored core matches every visit against the document natively. Each `VisitProposal`
carries the matched `properties`.

**Loading.** The provider props are the usual way. `loadPathConfiguration` is the function
behind them:

```ts
import configuration from './path-configuration.json';

loadPathConfiguration({
  document: configuration,
  url: `${baseURL}/configurations/app.json`,
});
```

The bundled document is available immediately. The URL loads afterwards and is cached on
disk. On the next launch the cache takes precedence over the bundled copy, so the server's
rules survive a restart.

**Reading.** `getPathConfigurationSettings()` returns the `settings` of the document loaded
last. `addPathConfigurationListener` reports each load. `getPathProperties(url)` returns what
a proposal for `url` would carry, for URLs that never become one: a screen placed by hand,
or a deep link.

**Routing.** React Navigation is not involved in matching. `useVisitHandler` turns the
standard properties into navigation actions the way Hotwire Native's navigator does:

- `context` and `modal_style` pick a route from a table you declare once.
- `presentation` picks push, replace, pop, refresh, none, clear_all or replace_root.
- `screen` names a native route.

Your `onVisitProposal(proposal, resolution)` has the last word. Return nothing to accept the
resolution, return a resolution or navigation action to substitute it, or return `null` to
drop the proposal.

```tsx
const handleVisitProposal = useVisitHandler({
  routes: { default: 'web', modal: 'webModal', full: 'webFullScreen' },
  onVisitProposal: (proposal) => {
    if (proposal.properties.screen === 'settings') {
      return CommonActions.navigate('Settings');
    }
  },
});

<VisitableView onVisitProposal={handleVisitProposal} />
```

**Params.** Routed web screens receive `{ url, fullPath, properties }`. `fullPath` is what
`useCurrentUrl` reads. A proposal for the page on top replaces it; a proposal for the page
beneath pops back to it. `query_string_presentation: replace` in a rule makes a query
change count as the same page. `hotwireScreens` keys its screens by path through `getId`, so
a page already in the stack is popped back to instead of pushed again.

### Bridge components

Give the app's bridge components to `HotwireProvider`. The web view's user agent lists their
names per session, which is why they are not a per-view prop.

A component is a function component made with `bridgeComponent`. It renders inside the screen
that shows the page, so `useNavigation` and every other hook work in it. `example/bridge` has
the demo site's `form`, `menu` and `overflow-menu` components. This is `form`:

```tsx
export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ title: string; submit: () => void }>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }, reply) =>
    setButton({ title: data.submitTitle, submit: () => reply() })
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button
        ? () => <Button title={button.title} onPress={button.submit} />
        : undefined,
    });
  }, [button, navigation]);

  return null;
});
```

`useBridgeMessage(event, handler)` calls the handler with each message for `event` and a
`reply` function bound to that message.

- `reply(data)` answers the message. `data` is merged into the message's own data. The
  reply can come later, after an `await` or from a button the handler set up.
- A value the handler returns, or resolves to, is the reply if the handler did not reply
  itself. So `async ({ data }) => fetchThing(data.id)` is a complete handler.
- A throw or a rejection replies `{ error }`, with `code` and `message` always set.
  `bridgeError(error)` builds that object. The page never waits on a failure.

The adapter the view injects talks to `@hotwired/hotwire-native-bridge`
(`window.HotwireNative`) and to the older `@hotwired/strada` (`window.Strada`).

### Sessions

Every session handle owns one web view and one Turbo session. The first `VisitableView`
mounted with a handle creates them; later views with the same handle reuse them. The web
view's user agent, the provider's token plus the bridge component list, is fixed at creation.

Give every tab its own handle, as Hotwire Native does. `HotwireScreen` does this by default
through `useSessionHandle()`: the chain of tab routes above the screen, `modal` for a modal
route, else `main`. A screen of your own can call the hook too. What is modal is the
caller's to know: `HotwireScreen` answers `modal` for its modal routes before using the
hook's value, and your screen does the same with its own test, so the handles line up.

Off screen, a page keeps its web view, and the session leaves it alone when the page comes
back. A tab switch is therefore instant. Only a page popped off a stack gives its web view
up, and only a page without one asks the session to restore it. A handle shared across tabs
would show a stale screenshot on return.

### Errors and authentication

A failed visit shows `renderError` in its screen: a message and a Retry button that
reloads, like Hotwire Native's error presenter. Everything beyond that goes through
`onError(error, screen)` on `HotwireScreen`:

- `error.statusCode` is the HTTP status, or a `SystemStatusCode` when there was no
  response, a network error for instance.
- `screen.retry()` reloads, `screen.pop()` removes the screen, and
  `screen.visit(urlOrPath, action)` loads another page. With the `replace` action the new
  page takes the failed page's place.

The demo's answer to a 401, from `example/App.tsx`:

```tsx
onError={(error, screen) => {
  if (error.statusCode === 401) {
    screen.visit('/session/new', 'replace');
  }
}}
```

The server redirects back once the user has signed in.

### Redirects and external links

**Same host.** A redirect is never followed inside the screen that asked. It arrives as a
`replace` proposal with `redirected: true`, whether the redirect happened on a cold boot or
on a visit, and the app routes it like any other proposal. A screen that cannot be replaced,
a tab root, stays on its own page and can `reload()` when it is next focused.

A form submission's redirect is a different thing: it is the submission's result. Its
proposal carries the form's action, and `redirected` is false.

**Another host.** A redirect to another host goes to `onCrossOriginRedirect`. The default
pops the screen the redirected visit was pushed for, then calls `onOpenExternalUrl`, as
Hotwire Native does.

A link to another host goes to `onOpenExternalUrl`. The default, `openExternalUrl`, opens an
in-app browser when `expo-web-browser` is installed and the system browser otherwise. It is
exported, so a handler that takes one scheme for itself, `sms:` for instance, can hand the
rest to it.

### Content insets

On iOS 26 the navigation and tab bars are translucent and float over the page. A page's
fixed elements have to clear them. The library tells the page how much, as CSS custom
properties on `<html>`:

- `--hotwire-inset-top`
- `--hotwire-inset-right`
- `--hotwire-inset-bottom`
- `--hotwire-inset-left`

They are the siblings of `env(safe-area-inset-*)`. Wherever the chrome is opaque and takes
layout they are 0, so a page needs no platform checks. They are re-applied after every
Turbo render. `VisitableView` does all this by itself.

The values come from the web view's own safe area. They are already 0 for any edge a parent
padded for. A navigator nested in a screen with a bar of its own, top tabs for instance,
narrows what the screen publishes: wrap the tab screen in `PublishContentInsets` and read
`ContentInsetsContext` in the navigator.

The properties describe floating chrome only. Use them for fixed elements, never for scroll
padding, and read them live rather than caching them. The keyboard is not chrome. The native
view gives up what the keyboard covers on Android, and resizes itself on iOS.

### Your own navigation hierarchy

An app whose navigators come from elsewhere, a config document or named modal flows, keeps
them and places `HotwireScreen` in them. Or it composes `VisitableView` with its own router:

```tsx
import {
  VisitableView,
  getLinkingObject,
  useCurrentUrl,
  useVisit,
} from 'react-native-hotwire';

// Pass to NavigationContainer.
const linking = getLinkingObject(BASE_URL, linkingConfig);

function WebScreen() {
  const url = useCurrentUrl();
  const visit = useVisit();

  return (
    <VisitableView
      url={url}
      sessionHandle="main"
      onVisitProposal={({ url, action }) => visit(url, action)}
    />
  );
}
```

`HotwireProvider` still wraps the container. `useVisitHandler` is available to route
proposals by the path configuration inside a hierarchy of your own.

## Reference

### `HotwireProvider`

Holds what belongs to a session rather than a screen. A session is created by the first
view on its handle and keeps its user agent for life, so these are set once, above the
navigators. One provider per app.

| Prop | Description |
|---|---|
| `applicationNameForUserAgent` | Appended to every web view's user agent, followed by the bridge component list. Default `defaultApplicationNameForUserAgent`. |
| `bridgeComponents` | The app's bridge components, made with `bridgeComponent`. |
| `webViewDebuggingEnabled` | Makes the web views inspectable from Safari and Chrome. Default `false`. |
| `pathConfiguration` | The bundled path configuration document. |
| `pathConfigurationUrl` | The server's path configuration, loaded after the bundled one and cached for the next launch. |

The default token contains `Hotwire Native` and `Turbo Native`, which servers key on. An
app that adds its own token keeps them:

```tsx
<HotwireProvider
  applicationNameForUserAgent={`${defaultApplicationNameForUserAgent} MyApp/1.0`}
>
```

### `hotwireScreens`

`hotwireScreens(Stack, options)` declares a `HotwireScreen` per presentation.

| Option | Description |
|---|---|
| `Stack` | The app's `createNativeStackNavigator()`. Warns in development if it is not a native stack. |
| `path` | The page the stack starts on, a path under the base URL. Default `/`. |
| `component` | The screen for every web route. Default `HotwireScreen`. Wrap it to set `onError` or `onVisitProposal` once. |
| `routes` | Route names per presentation, the table the screens navigate by. Default `defaultVisitRoutes`. |
| `options` | Navigation options per presentation, merged over the native presentation each gets. |

Presentations are the path configuration's `context` and `modal_style` words: `default`,
`modal`, `full`, `medium`, `page_sheet`, `form_sheet`. To change one, give it options:

```tsx
{hotwireScreens(Stack, {
  options: { medium: { sheetAllowedDetents: [0.5, 1] } },
})}
```

The route names behind the presentations are the app's. Rename them, or add a `modal_style`
of your own for the server to use. `hotwireScreens` and every screen then navigate by the
same table:

```tsx
const routes: VisitRoutes<RootRoute, 'inline'> = {
  ...defaultVisitRoutes,
  medium: 'sheet',
  inline: 'inlineWeb',
};

{hotwireScreens(Stack, {
  routes,
  options: { inline: { presentation: 'containedModal' } },
})}

<HotwireScreen {...props} routes={routes} />
```

A screen you write yourself keeps its name in `routes` and uses `hotwireScreenId`, which
pops back to a page already in the stack instead of pushing it again:

```tsx
<Stack.Screen
  name="sheet"
  component={SheetScreen}
  getId={hotwireScreenId}
  options={{ presentation: 'formSheet' }}
/>
```

Two rules apply. A route the table names but no navigator declares falls back, sheet to
modal and modal to push, with a warning in development, so a presentation the app left out
degrades instead of dropping the visit. And the table is typed against the app's route
names, so a name that is not a route is a compile error. `modal_style` is only read under
`context: "modal"`. A style of the app's own gets `modal` unless its options say otherwise.

### `HotwireScreen`

A React Navigation screen that is a Hotwire page, with the defaults Hotwire Native's
navigator provides: the URL from the route params, the session from the screen's place in
the navigator tree, proposals routed by `useVisitHandler`, pull to refresh from the path
configuration, and the page title as the screen title.

A screen placed by hand, a tab root for instance, gets `initialParams={{ fullPath: '/inbox' }}`.
Screens reached through proposals or links carry their URL already. Everything `VisitableView`
takes passes through, with these additions and changed defaults:

| Prop | Description |
|---|---|
| `sessionHandle` | Default `useSessionHandle()`; see [Sessions](#sessions). |
| `routes` | Route names per presentation. Default `defaultVisitRoutes`. |
| `onVisitProposal(proposal, resolution)` | Your say on every proposal, after `useVisitHandler` resolved it. |
| `titleFromPage` | Sets the screen title from the page title on each load. Default `true`. |
| `pullToRefreshEnabled` | Overrides the path configuration's `pull_to_refresh_enabled`, which defaults to `true`. |
| `onError(error, screen)` | A visit failed; see [Errors and authentication](#errors-and-authentication). |
| `onCrossOriginRedirect` | Default: pop the screen, then `onOpenExternalUrl`; see [Redirects](#redirects-and-external-links). |

### `VisitableView`

The view that shows a page. Two props are required.

- `url`. The page to show. A new value visits it in the same session.
- `onVisitProposal(proposal)`. Turbo proposed a visit: `{ url, action, properties, redirected }`.
  Navigate with `useVisit`, or route it with `useVisitHandler`.

Events:

- `onLoad(event)`. A page finished loading: `{ url, title }`.
- `onError(error)`. A visit failed: `{ url, statusCode, description }`. `statusCode` is an
  HTTP status or a `SystemStatusCode`. `renderError` shows regardless.
- `onOpenExternalUrl(event)`. A link to another host, or a non-http scheme. Default
  `openExternalUrl`.
- `onCrossOriginRedirect(event)`. A cold boot or a visit was redirected to another origin,
  so this page never loaded. Default `onOpenExternalUrl`.
- `onFormSubmissionStart(event)`, `onFormSubmissionEnd(event)`. Turbo's `turbo:submit-start`
  and `turbo:submit-end`: `{ url }`.
- `onContentProcessDidTerminate(event)`. The web content process died. Default: reload.
- `onMessage(message)`. Every message the page's bridge components send, before the native
  components see it.
- `onAlert(event, respond)`, `onConfirm(event, respond)`. Replace the `Alert` shown for
  `window.alert` and `window.confirm`. Call `respond` to let the page continue.
- `onScroll(event)`. The page scrolled. This one is the synthetic event, with React Native's
  `ScrollView` shape under `nativeEvent`, so `Animated.event` and anything written for a
  `ScrollView` reads it. Native headers and tabs collapse on their own; this is for chrome
  the app draws itself.

Rendering and behavior:

- `sessionHandle`. Screens sharing a handle share one web view and Turbo session. Default
  `main`.
- `renderLoading()`. Overlay while a visit loads. Default: a centered spinner.
- `renderError(error, reload)`. Overlay for a failed visit. Default: a message and a Retry
  button.
- `pullToRefreshEnabled`. Default `true`.
- `scrollEnabled`. Default `true`.
- `style`, `testID`. As on any view.

Ref, `VisitableViewRef`: `reload()` cold-boots the page, `refresh()` refreshes through
Turbo, `injectJavaScript(script)` runs a script.

The web view is configured the way Hotwire Native configures it, and these are not props:
mobile pages even on iPad, one process pool for every session, link previews off, media
inline and autoplaying as in Safari and Chrome so the page decides with its markup, and the
pull-to-refresh spinner resting below whatever chrome floats over the top of the page. A
setting beyond these is a change to the library.

On Android the view gives up whatever the software keyboard covers of it, measured from its
own bottom edge and updated on every frame of the keyboard animation. The page reflows to
the visible area and scrolls its focused field into view. Edge-to-edge apps get no window
resize for the keyboard; this replaces it, the way Hotwire Native's
`applyDefaultImeWindowInsets` does. iOS resizes the web view itself.

### Linking and navigation

- `hotwireLinking(baseURL, screens?)`. The `linking` prop for a container whose web screens
  are the catch-all. Every URL under `baseURL` opens the `web` route with the URL as params,
  unless `screens` maps its path to a native route.
- `getLinkingObject(baseURL, config)`. The same for a linking `config` of your own. Linked
  routes receive `baseURL` and `fullPath` params.
- `useBaseURL()`. The linking prefix, what paths resolve against.
- `useCurrentUrl(config?)`. The URL the current screen should load: its `fullPath` param, or
  its configured path resolved against the base URL. Pass `config` only for a path config
  other than the one linking uses.
- `useVisit()`. Returns `visit(urlOrPath, visitAction)`, Turbo's `visit` and the counterpart
  of React Navigation's `useLinkTo`. The URL is matched through the container's linking, so
  it lands wherever a deep link to it would.
- `useVisitBuilder()`. Returns `buildAction(urlOrTarget, visitAction)`, which gives the
  navigation action and `willChangeTopmostNavigator` without dispatching, for a handler that
  adjusts the action first.
- `useVisitHandler(options)`. Routes proposals by the path configuration; see
  [Path configuration in depth](#path-configuration-in-depth).

### Session functions

- `useSessionHandle()`. The session handle for the calling screen; see [Sessions](#sessions).
- `getSessionHandles()`. The handles of the sessions that exist.
- `reloadSession(handle)`. Cold-boots the session's current page.
- `refreshSession(handle)`. Refreshes the session's current page through Turbo.
- `clearSessionSnapshotCache(handle)`. Drops the session's snapshot cache.
- `MAIN_SESSION_HANDLE`, `MODAL_SESSION_HANDLE`. The `main` and `modal` handles.

## Development

**Setup.** The library resolves its development dependencies through the example app: `cd
example && npm install`. The library must never have a `node_modules` of its own. A `file:`
install would copy the directory wholesale, and Metro would then resolve React Native from
inside it.

**Tests.** From the root:

- `yarn typecheck` and `yarn test`. Jest covers the visit routing, the fallback to declared
  routes, `hotwireScreens`, path resolution, linking params and the bridge hooks.
- `yarn test:ios`. An XCTest package in `ios/` builds the vendored Hotwire sources and the
  view controller without Expo and runs them on a simulator against a real session and web
  view. It covers the session appearance rules, the view controller's location tracking,
  the pop hand-over and the scroll view registration.
- `yarn e2e:ios` and `yarn e2e:android`. Maestro flows against a fixture server, one per
  behavior; see `e2e/README.md`.

The rest of the native code is compiled by the consuming app. There is no standalone build.

**Example app.** `example/` builds for both platforms against `https://hotwire-native-demo.dev`,
with Metro on port 8084.

**CI.** GitHub Actions runs the typecheck, Jest and the iOS tests on every push to `main` and
every pull request.
