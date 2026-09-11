import fs from 'fs';
import path from 'path';
import vm from 'vm';

// The vendored adapter scripts, one per platform, run inside every page. Each is loaded
// into its own context with the globals it reaches for, and driven the way Turbo drives
// it: through the adapter interface with a visit object.

type Platform = 'ios' | 'android';

const scripts: Record<Platform, string> = {
  ios: path.join(__dirname, '../../ios/Vendor/HotwireNative/Turbo/WebView/turbo.js'),
  android: path.join(__dirname, '../../android/hotwire-core/src/main/assets/js/turbo.js'),
};

interface NativeMessage {
  name: string;
  data: Record<string, unknown>;
}

interface Harness {
  adapter: any;
  messages: NativeMessage[];
  navigator: { stop: jest.Mock; location: URL; restorationIdentifier: string };
}

function loadAdapter(platform: Platform): Harness {
  const messages: NativeMessage[] = [];
  const navigator = {
    stop: jest.fn(),
    location: new URL('https://app.example/home'),
    restorationIdentifier: 'r1',
    locationWithActionIsSamePage: () => false,
    view: { scrollToAnchorFromLocation: jest.fn() },
  };
  const turbo = { registerAdapter: jest.fn(), navigator, session: {} };

  // Native's end of the bridge. iOS posts {name, data} to a message handler; Android calls
  // methods on a TurboSession object with positional arguments, JSON for the options.
  const webkit = {
    messageHandlers: {
      turbo: { postMessage: ({ name, data: { timestamp, ...data } }: NativeMessage) => messages.push({ name, data }) },
    },
  };
  const turboSession = new Proxy(
    {},
    {
      get: (_target, name: string) => (...args: unknown[]) => {
        if (name === 'visitProposedToLocation') {
          messages.push({ name: 'visitProposed', data: { location: args[0], options: JSON.parse(args[1] as string) } });
        } else {
          messages.push({ name, data: { args } });
        }
      },
    }
  );

  const listeners: Record<string, () => void> = {};
  const context: Record<string, unknown> = {
    Turbo: turbo,
    URL,
    JSON,
    Date,
    Error,
    document: {
      hidden: true,
      addEventListener: (event: string, fn: () => void) => (listeners[event] = fn),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    },
    addEventListener: jest.fn(),
    setTimeout: jest.fn(),
    requestAnimationFrame: (fn: () => void) => fn(),
    webkit,
    TurboSession: turboSession,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(scripts[platform], 'utf8'), context, { filename: scripts[platform] });
  // Loading registers the adapter and reports the page as loaded; the tests start after that.
  messages.length = 0;

  return { adapter: (context as any).turboNative, messages, navigator };
}

function fakeVisit(overrides: Record<string, unknown> = {}) {
  return {
    identifier: 'v1',
    location: new URL('https://app.example/account'),
    restorationIdentifier: 'r2',
    hasCachedSnapshot: () => false,
    isPageRefresh: false,
    issueRequest: jest.fn(),
    changeHistory: jest.fn(),
    loadCachedSnapshot: jest.fn(),
    loadResponse: jest.fn(),
    cancel: jest.fn(),
    response: { statusCode: 200, responseHTML: '<html></html>', redirected: false },
    redirectedToLocation: undefined as URL | undefined,
    ...overrides,
  };
}

describe.each<Platform>(['ios', 'android'])('%s adapter script', (platform) => {
  test('a response that did not redirect is loaded into the page', () => {
    const { adapter, messages } = loadAdapter(platform);
    const visit = fakeVisit();

    adapter.visitStarted(visit);
    adapter.visitRequestCompleted(visit);

    expect(visit.loadResponse).toHaveBeenCalled();
    expect(messages.map((m) => m.name)).toEqual(['visitStarted', 'visitRequestCompleted']);
  });

  test('a redirected response is proposed for its location and never rendered', () => {
    const { adapter, messages, navigator } = loadAdapter(platform);
    const response = { statusCode: 200, responseHTML: '<html>target</html>', redirected: true };
    const visit = fakeVisit({ response, redirectedToLocation: new URL('https://app.example/verify') });

    adapter.visitStarted(visit);
    adapter.visitRequestCompleted(visit);

    expect(visit.loadResponse).not.toHaveBeenCalled();
    expect(navigator.stop).toHaveBeenCalled();
    expect(messages.map((m) => m.name)).toEqual(['visitStarted', 'visitProposed']);
    expect(messages[1].data).toEqual({
      location: 'https://app.example/verify',
      options: { action: 'replace', response },
    });
  });

  test('a redirect back to the page itself is refreshed in the page, not proposed', () => {
    const { adapter, messages, navigator } = loadAdapter(platform);
    const response = { statusCode: 200, responseHTML: '<html>home</html>', redirected: true };
    const visit = fakeVisit({ response, redirectedToLocation: navigator.location });
    (navigator as any).startVisit = jest.fn();

    adapter.visitStarted(visit);
    adapter.visitRequestCompleted(visit);

    expect(visit.loadResponse).not.toHaveBeenCalled();
    expect(messages.map((m) => m.name)).toEqual(['visitStarted', 'visitProposalRefreshingPage']);
    expect((navigator as any).startVisit).toHaveBeenCalledWith(navigator.location, 'r1', { action: 'replace', response });
  });

  test('a redirected response without a location is loaded like any other', () => {
    // A visit started with a preset response, a form submission's, records the response
    // without a fetch, so Turbo never learns where it came from.
    const { adapter, messages } = loadAdapter(platform);
    const visit = fakeVisit({ response: { statusCode: 200, responseHTML: '<html></html>', redirected: true } });

    adapter.visitStarted(visit);
    adapter.visitRequestCompleted(visit);

    expect(visit.loadResponse).toHaveBeenCalled();
    expect(messages.map((m) => m.name)).toEqual(['visitStarted', 'visitRequestCompleted']);
  });
});
