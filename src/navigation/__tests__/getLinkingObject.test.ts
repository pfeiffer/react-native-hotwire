import { getLinkingObject } from '../getLinkingObject';

describe('getLinkingObject', () => {
  const linking = getLinkingObject('https://example.com', { screens: { web: '*', settings: 'settings' } });

  it('uses the base URL as the prefix', () => {
    expect(linking.prefixes).toEqual(['https://example.com']);
  });

  it('stamps url, baseURL and fullPath on the route a path opens', () => {
    const state = linking.getStateFromPath('/inbox?page=2', linking.config);
    const route = state!.routes[state!.index ?? 0];

    expect(route.name).toBe('web');
    expect(route.params).toMatchObject({
      url: 'https://example.com/inbox?page=2',
      baseURL: 'https://example.com',
      fullPath: '/inbox?page=2',
    });
  });

  it('routes a configured path to its native screen, stamped the same way', () => {
    const state = linking.getStateFromPath('/settings', linking.config);
    const route = state!.routes[state!.index ?? 0];

    expect(route.name).toBe('settings');
    expect(route.params).toMatchObject({ url: 'https://example.com/settings', fullPath: '/settings' });
  });
});
