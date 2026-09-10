import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { hotwireScreenId, hotwireScreens } from '../hotwireScreens';

const Stack = createNativeStackNavigator();

type ScreenProps = { name: string; options: Record<string, unknown>; getId: unknown; initialParams?: unknown };

function screensOf(element: React.ReactElement<{ children: React.ReactNode }>) {
  return (React.Children.toArray(element.props.children) as React.ReactElement<ScreenProps>[]).map((child) => ({
    type: child.type,
    ...child.props,
  }));
}

describe('hotwireScreens', () => {
  it('declares one screen per presentation, named as useVisitHandler expects', () => {
    const screens = screensOf(hotwireScreens(Stack));

    expect(screens.map((s) => [s.name, s.options.presentation])).toEqual([
      ['web', undefined],
      ['webModal', 'modal'],
      ['webFullScreen', 'fullScreenModal'],
      ['webSheet', 'formSheet'],
    ]);
    expect(screens.every((s) => s.type === Stack.Screen && s.getId === hotwireScreenId && s.options.title === '')).toBe(true);
  });

  it('starts the stack at the given path, and only that route', () => {
    const screens = screensOf(hotwireScreens(Stack, { path: '/inbox' }));

    expect(screens[0].initialParams).toEqual({ fullPath: '/inbox' });
    expect(screens.slice(1).every((s) => s.initialParams === undefined)).toBe(true);
  });

  it('merges options by presentation over the native presentation', () => {
    const screens = screensOf(hotwireScreens(Stack, { options: { medium: { sheetAllowedDetents: [0.5, 1] }, default: { headerShown: false } } }));

    expect(screens.find((s) => s.name === 'webSheet')!.options).toEqual({ title: '', presentation: 'formSheet', sheetAllowedDetents: [0.5, 1] });
    expect(screens.find((s) => s.name === 'web')!.options).toEqual({ title: '', presentation: undefined, headerShown: false });
  });

  it('names screens from the routes table, sharing a screen between styles that share a name', () => {
    const screens = screensOf(hotwireScreens(Stack, { routes: { medium: 'sheet', page_sheet: 'sheet', form_sheet: 'webModal' } }));

    expect(screens.map((s) => s.name)).toEqual(['web', 'webModal', 'webFullScreen', 'sheet']);
  });

  it("renders a style of the app's own as a modal unless its options say otherwise", () => {
    const screens = screensOf(
      hotwireScreens(Stack, { routes: { inline: 'inlineWeb', drawer: 'drawerWeb' }, options: { inline: { presentation: 'containedModal' } } })
    );

    expect(screens.find((s) => s.name === 'inlineWeb')!.options.presentation).toBe('containedModal');
    expect(screens.find((s) => s.name === 'drawerWeb')!.options.presentation).toBe('modal');
  });

  it('warns when given a navigator that is not a native stack', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    hotwireScreens({ Navigator: () => null, Screen: Stack.Screen });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a native stack'));
    warn.mockClear();
    hotwireScreens(Stack);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('hotwireScreenId', () => {
  it('is the path of the page, without query or hash, so the same page is one screen', () => {
    expect(hotwireScreenId({ params: { url: 'https://example.com/inbox?page=2#top' } })).toBe('/inbox');
    expect(hotwireScreenId({ params: { fullPath: '/inbox?page=2' } })).toBe('/inbox');
    expect(hotwireScreenId({ params: { url: 'https://example.com/inbox/' } })).toBe('/inbox');
    expect(hotwireScreenId({ params: { url: 'https://example.com/' } })).toBe('/');
    expect(hotwireScreenId({})).toBe('/');
  });
});
