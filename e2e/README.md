# End-to-end tests

Maestro flows that drive a small app, `app/`, against a fixture server, `server/`, on a
simulator or emulator. They test the real vendored native code, the real WebView and the
real Turbo, one flow per behaviour: pushes, redirects of every kind, forms, replaces.

- `server/server.js`: plain Node, no dependencies. Every page is a Turbo page and counts
  how often it was fetched, printed in the page, so a flow can tell a render from a fetch.
  Scenario flags set over HTTP decide which pages redirect. A redirect sets a `flash`
  cookie the next page shows once, as Rails' session flash does. Document titles differ
  from headings, "Home title" over "Home page", so the screen title can be told from the
  page. `127.0.0.1` is the same server under another host name, which is what the app
  treats as another origin. The bridge page has three web bridge components, on Stimulus
  and Strada served from here: one replied to at once, one when a native button is
  pressed, one with an error.
- `app/`: an Expo app with two tabs of pages from the server, `hotwireScreens` per tab,
  the native side of the three bridge components, the upstream demo's 401 handling, and
  the reload-when-focused pattern for a screen whose page was redirected away. It points
  at `http://localhost:4567`; the runner maps the emulator's localhost to the host.
- `flows/`: one Maestro flow per behaviour. `flows/lib` holds the scripts that reset the
  server, set a scenario and read the fetch counts. The first wait after a launch is long
  because the dev client's cold start on an emulator can take half a minute.

## Running

Once per machine: `brew install mobile-dev-inc/tap/maestro`, then in `e2e/app`:
`npm install`, `npx expo prebuild`, and `npx expo run:ios --no-bundler` on a booted
simulator or `npx expo run:android --no-bundler` on a booted emulator.

Then from the repo root, with the simulator or emulator booted:

```sh
yarn e2e:ios
yarn e2e:android
```

The runner starts the server and the app's Metro on 8081, which the dev client requires,
runs every flow, and stops both. Pass Maestro arguments after the platform, for one flow
say: `e2e/run.sh ios e2e/flows/push.yaml`.

## Known issues

`known-issues/` holds flows that reproduce an open defect and are not run by `yarn e2e`.
Run one with `e2e/run.sh android e2e/known-issues/<flow>.yaml`.

- `redirect-chain-modal-to-page.yaml` and `modal-replaced-by-card.yaml` (Android): a
  default-context page proposed from inside a modal resolves to `StackActions.replace` of
  the modal with a card screen, and react-native-screens does not render a card that
  replaces a modally-presented screen on Android, so the screen never attaches or visits and
  the page is never fetched. iOS renders it. Confirmed with both a redirect chain and a
  fully rendered modal, so the bug is broad, not limited to an unrendered modal. Attempted
  and reverted: `StackActions.replace`, `goBack` + `navigate` in one tick (does not compose
  against React Navigation's batched state), and `CommonActions.reset` to the stack without
  the modal. None render the target on Android: the limitation is transitioning away from a
  modally-presented screen at all in a single state update. Only a sequenced dismiss (let
  the modal fully dismiss) then a push on a later tick would work, a fragile timing hack,
  so it is left unfixed by decision.
