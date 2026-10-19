# react-native-hotwire

[![CI](https://github.com/pfeiffer/react-native-hotwire/actions/workflows/ci.yml/badge.svg)](https://github.com/pfeiffer/react-native-hotwire/actions/workflows/ci.yml)

Hotwire Native for React Native and Expo.

Your Turbo-enabled website as React Navigation screens, with path configuration, native
screens and bridge components written in JavaScript.

Expo Module, New Architecture, vendored Hotwire Native core (`VENDOR.md`). Migrating from
`react-native-turbo`? See [MIGRATING.md](MIGRATING.md).

## Getting started

### Install

The package is not on npm. Install it from a git tag, using the latest one from the
[releases](https://github.com/pfeiffer/react-native-hotwire/tags):

```sh
yarn add react-native-hotwire@github:pfeiffer/react-native-hotwire#v0.1.5
npx expo prebuild
```

Requires Expo SDK 57+, React Native 0.86+, React Navigation 7 and the New Architecture.

### Minimal example

Point a native stack at your site:

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

`hotwireScreens(Stack)` adds the push, modal and sheet web screens. `hotwireLinking(baseURL)`
routes every URL under the base URL to them.

### Path configuration

Bundle a [path configuration](https://native.hotwired.dev/reference/path-configuration)
and point at the server's:

```tsx
import configuration from './path-configuration.json';

<HotwireProvider
  pathConfiguration={configuration}
  pathConfigurationUrl={`${baseURL}/configurations/app.json`}
>
```

Supported properties: `context`, `modal_style`, `presentation`, `pull_to_refresh_enabled`,
`query_string_presentation`, and `screen` to open a native screen by route name. See
`example/path-configuration.json`.

The document's `settings` object is yours: `getPathConfigurationSettings()` reads it and
`addPathConfigurationListener(listener)` reports each load.

### Adding a native screen

A native screen is a normal React Navigation screen:

```tsx
<Stack.Navigator>
  {hotwireScreens(Stack)}
  <Stack.Screen name="Settings" component={SettingsScreen} />
</Stack.Navigator>
```

To open it from a link in a page, add a rule to `path-configuration.json` naming the route.
Links to `/account/settings` now open the native screen instead of a web one:

```json
{ "patterns": ["/account/settings$"], "properties": { "screen": "Settings" } }
```

The example app does this with its `numbers` screen.

If the app should also open the screen from a deep link, a universal link or
`myapp://account/settings`, map the path to the route in linking as well:

```tsx
<NavigationContainer linking={hotwireLinking(baseURL, { Settings: '/account/settings' })}>
  <Stack.Navigator>
    {hotwireScreens(Stack)}
    <Stack.Screen name="Settings" component={SettingsScreen} />
  </Stack.Navigator>
</NavigationContainer>
```

### Bridge components

Function components, registered on the provider:

```tsx
import { bridgeComponent, useBridgeMessage } from 'react-native-hotwire';

export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ title: string; submit: () => void }>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }, reply) =>
    setButton({ title: data.submitTitle, submit: () => reply() })
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button ? () => <Button title={button.title} onPress={button.submit} /> : undefined,
    });
  }, [button, navigation]);

  return null;
});

<HotwireProvider bridgeComponents={[FormComponent]}>
```

`reply(data)` answers the message, or return a value from the handler.

## Example app

`example/` runs against the official demo server, `https://hotwire-native-demo.dev`, and
shows:

- Tabs, each with its own stack and session
- Authentication: a 401 replaces the screen with the sign-in page
- Path configuration with modals and a native screen
- Bridge components: `form`, `menu`, `overflow-menu`
- Forms, redirects and external links

```sh
cd example && npm install
npm run ios   # or npm run android
```

## Sessions

Screens sharing a session handle share one web view. `HotwireScreen` uses one handle per
tab, `modal` for modals and `main` otherwise. `useSessionHandle()` returns the current
screen's handle; `reloadSession(handle)` and `refreshSession(handle)` reload its page.

## `HotwireProvider`

Wraps the app once, above the navigators.

| Prop | Description |
|---|---|
| `bridgeComponents` | The app's bridge components, made with `bridgeComponent`. |
| `pathConfiguration` | The bundled path configuration document. |
| `pathConfigurationUrl` | The server's path configuration, loaded after the bundled one and cached for the next launch. |
| `applicationNameForUserAgent` | Appended to the web view's user agent. Default `defaultApplicationNameForUserAgent`, which servers key on to detect the app. Keep it if you add your own: `` `${defaultApplicationNameForUserAgent} MyApp/1.0` ``. |
| `webViewDebuggingEnabled` | Makes the web views inspectable from Safari and Chrome. Default `false`. |

## `HotwireScreen`

The screen behind every web route. Takes every `VisitableView` prop plus:

| Prop | Description |
|---|---|
| `onError(error, screen)` | A visit failed. `error.statusCode` is the HTTP status or a `SystemStatusCode`. `screen.retry()` reloads, `screen.pop()` removes the screen, `screen.visit(path, action)` loads another page. |
| `onVisitProposal(proposal, resolution)` | Your say on every proposal after the path configuration resolved it. Return nothing to accept, a navigation action to substitute, or `null` to drop it. |
| `sessionHandle` | Default: from the screen's place in the navigator. See [Sessions](#sessions). |
| `titleFromPage` | Set the screen title from the page title. Default `true`. |
| `pullToRefreshEnabled` | Overrides the path configuration's `pull_to_refresh_enabled`. |
| `routes` | Route names per presentation, if you renamed the ones `hotwireScreens` declares. |

To set props on every web screen, wrap it and pass the wrapper to `hotwireScreens`:

```tsx
function WebScreen(props: HotwireScreenProps) {
  return (
    <HotwireScreen
      {...props}
      onError={(error, screen) => {
        if (error.statusCode === 401) {
          screen.visit('/session/new', 'replace');
        }
      }}
    />
  );
}

{hotwireScreens(Stack, { component: WebScreen })}
```

`hotwireScreens` also takes `path`, the page the stack starts on, and `options`, navigation
options per presentation:

```tsx
{hotwireScreens(Stack, {
  path: '/inbox',
  options: { medium: { sheetAllowedDetents: [0.5, 1] } },
})}
```

## `VisitableView`

The view that shows a page. Use it directly to compose your own screen.

```tsx
<VisitableView
  url={url}
  sessionHandle="main"
  onVisitProposal={({ url, action }) => visit(url, action)}
/>
```

| Prop | Description |
|---|---|
| `url` | **Required.** The page to show. A new value visits it in the same session. |
| `onVisitProposal(proposal)` | **Required.** Turbo proposed a visit: `{ url, action, properties, redirected }`. Navigate with `useVisit()` or route it with `useVisitHandler()`. |
| `sessionHandle` | Screens sharing a handle share one web view. Default `main`. |
| `onLoad(event)` | A page finished loading: `{ url, title }`. |
| `onError(error)` | A visit failed: `{ url, statusCode, description }`. |
| `onOpenExternalUrl(event)` | A link to another host or a non-http scheme. Default opens an in-app browser, or the system browser without `expo-web-browser`. |
| `onCrossOriginRedirect(event)` | A visit was redirected to another origin. Default `onOpenExternalUrl`; `HotwireScreen` pops the screen first. |
| `onFormSubmissionStart(event)`, `onFormSubmissionEnd(event)` | Turbo's `turbo:submit-start` and `turbo:submit-end`. |
| `onMessage(message)` | Every message from the page's bridge components. |
| `onAlert(event, respond)`, `onConfirm(event, respond)` | Replace the alerts shown for `window.alert` and `window.confirm`. |
| `onScroll(event)` | Same event shape as `ScrollView`. |
| `onContentProcessDidTerminate(event)` | The web content process died. |
| `renderLoading()` | Overlay while a visit loads. Default: a spinner. |
| `renderError(error, reload)` | Overlay for a failed visit. Default: a message and a Retry button. |
| `pullToRefreshEnabled` | Default `true`. |
| `scrollEnabled` | Default `true`. |
| `style`, `testID` | As on any view. |

The ref exposes `reload()`, `refresh()` and `injectJavaScript(script)`.

## Content insets

Floating bars on iOS 26 cover the page. These CSS custom properties on `<html>` say by how
much, for `position: fixed` elements. They are 0 where the chrome is opaque.

- `--hotwire-inset-top`
- `--hotwire-inset-right`
- `--hotwire-inset-bottom`
- `--hotwire-inset-left`

## Further reading

- [MIGRATING.md](MIGRATING.md): moving from `react-native-turbo`.
- [VENDOR.md](VENDOR.md): what is vendored from Hotwire Native and how to update it.

## Development

Run `cd example && npm install`, then from the root:

- `yarn typecheck` and `yarn test` run the TypeScript check and Jest.
- `yarn test:ios` runs the XCTest package in `ios/` on a simulator.
- `yarn e2e:ios` and `yarn e2e:android` run the Maestro flows; see `e2e/README.md`.
