import { CommonActions, StackActions } from '@react-navigation/native';
import { renderHook } from '@testing-library/react-native';

import { useVisitHandler, type VisitHandlerOptions } from '../useVisitHandler';
import type { VisitProposal } from '../../types';

type Route = { name: string; params?: object };

const mockNavigation = {
  dispatch: jest.fn(),
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  getState: jest.fn(),
  getParent: jest.fn(),
};
let mockRoute: Route = { name: 'web' };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

/** A stack with `routes` on it, inside a parent declaring `parentRouteNames`. */
function stack(routes: Route[], routeNames = ['web', 'webModal', 'webSheet', 'webFullScreen'], parentRouteNames: string[] = []) {
  mockNavigation.getState.mockReturnValue({ routes, index: routes.length - 1, routeNames });
  mockNavigation.getParent.mockReturnValue(
    parentRouteNames.length ? { getState: () => ({ routes: [], index: 0, routeNames: parentRouteNames }), getParent: () => undefined } : undefined
  );
}

function proposal(url: string, properties: Record<string, unknown> = {}, action: VisitProposal['action'] = 'advance'): VisitProposal {
  return { url, action, properties };
}

async function handle(p: VisitProposal, options?: VisitHandlerOptions) {
  const { result } = await renderHook(() => useVisitHandler(options));
  result.current!(p);
}

const params = (url: string, properties = {}) => ({ url, fullPath: new URL(url).pathname + new URL(url).search, properties });

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute = { name: 'web' };
  stack([{ name: 'web', params: { url: 'https://example.com/' } }]);
});

describe('routing by context and modal_style', () => {
  it('pushes on the current stack by default', async () => {
    await handle(proposal('https://example.com/inbox'));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(CommonActions.navigate('web', params('https://example.com/inbox')));
  });

  it('opens the modal route for context modal', async () => {
    await handle(proposal('https://example.com/new', { context: 'modal' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'webModal' }) }));
  });

  it('opens the sheet route for a sheet style', async () => {
    await handle(proposal('https://example.com/new', { context: 'modal', modal_style: 'medium' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'webSheet' }) }));
  });

  it('opens a native route named by the screen property, wherever in the tree it is declared', async () => {
    stack([{ name: 'web' }], ['web', 'webModal'], ['tabs', 'numbers']);
    await handle(proposal('https://example.com/numbers', { screen: 'numbers' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'numbers' }) }));
  });

  it('navigates by the routes table the app gives', async () => {
    stack([{ name: 'pages' }], ['pages', 'sheet']);
    await handle(proposal('https://example.com/new', { context: 'modal', modal_style: 'medium' }), { routes: { default: 'pages', modal: 'pages', medium: 'sheet' } });
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'sheet' }) }));
  });
});

describe('a route the table names but no navigator declares', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('falls back from the sheet to the modal, with a warning', async () => {
    stack([{ name: 'web' }], ['web', 'webModal']);
    await handle(proposal('https://example.com/new', { context: 'modal', modal_style: 'medium' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'webModal' }) }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"webSheet"'));
  });

  it('falls back from the modal to a push', async () => {
    stack([{ name: 'web' }], ['web']);
    await handle(proposal('https://example.com/new', { context: 'modal' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'web' }) }));
  });

  it('falls back from an undeclared native screen to a push', async () => {
    stack([{ name: 'web' }], ['web']);
    await handle(proposal('https://example.com/numbers', { screen: 'numbers' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: 'web' }) }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"numbers"'));
  });
});

describe('presentation', () => {
  it.each([
    ['pop', () => expect(mockNavigation.goBack).toHaveBeenCalled()],
    ['none', () => expect(mockNavigation.dispatch).not.toHaveBeenCalled()],
    ['clear_all', () => expect(mockNavigation.dispatch).toHaveBeenCalledWith(StackActions.popToTop())],
  ])('%s', async (presentation, check) => {
    await handle(proposal('https://example.com/x', { presentation }));
    check();
  });

  it('refresh calls the refresh given', async () => {
    const refresh = jest.fn();
    await handle(proposal('https://example.com/x', { presentation: 'refresh' }), { refresh });
    expect(refresh).toHaveBeenCalled();
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();
  });

  it('replace replaces the current screen', async () => {
    await handle(proposal('https://example.com/x', { presentation: 'replace' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(StackActions.replace('web', params('https://example.com/x', { presentation: 'replace' })));
  });

  it('replace_root resets the stack to the page', async () => {
    await handle(proposal('https://example.com/x', { presentation: 'replace_root' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESET' }));
  });
});

describe("upstream's pushOrReplace", () => {
  it('replaces the page already on top instead of stacking it twice', async () => {
    stack([{ name: 'web', params: { url: 'https://example.com/inbox' } }]);
    await handle(proposal('https://example.com/inbox'));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(StackActions.replace('web', params('https://example.com/inbox')));
  });

  it('pops back to the page beneath instead of pushing it again', async () => {
    stack([{ name: 'web', params: { url: 'https://example.com/' } }, { name: 'web', params: { url: 'https://example.com/inbox' } }]);
    await handle(proposal('https://example.com/'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();
  });

  it('treats a query change as the same page under query_string_presentation replace', async () => {
    stack([{ name: 'web', params: { url: 'https://example.com/inbox?page=1' } }]);
    await handle(proposal('https://example.com/inbox?page=2', { query_string_presentation: 'replace' }));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REPLACE' }));
  });

  it('replaces the modal when a default-context page is proposed from it', async () => {
    mockRoute = { name: 'webModal' };
    stack([{ name: 'web' }, { name: 'webModal', params: { url: 'https://example.com/new' } }]);
    await handle(proposal('https://example.com/done'));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(StackActions.replace('web', params('https://example.com/done')));
  });

  it("replaces on Turbo's replace action", async () => {
    await handle(proposal('https://example.com/x', {}, 'replace'));
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REPLACE' }));
  });
});

describe('the app has the last word', () => {
  it('receives the proposal and what the library resolved', async () => {
    const onVisitProposal = jest.fn();
    const p = proposal('https://example.com/inbox');
    await handle(p, { onVisitProposal });
    expect(onVisitProposal).toHaveBeenCalledWith(p, { kind: 'navigate', action: CommonActions.navigate('web', params('https://example.com/inbox')) });
  });

  it('drops the proposal on null', async () => {
    await handle(proposal('https://example.com/inbox'), { onVisitProposal: () => null });
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches an action it returns instead', async () => {
    const action = CommonActions.navigate('settings');
    await handle(proposal('https://example.com/settings'), { onVisitProposal: () => action });
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });

  it('performs a resolution it returns instead', async () => {
    await handle(proposal('https://example.com/settings'), { onVisitProposal: () => ({ kind: 'pop' }) });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
