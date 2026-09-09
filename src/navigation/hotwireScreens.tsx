import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';

import { HotwireScreen } from '../HotwireScreen';
import { defaultVisitRoutes, type VisitPresentation, type VisitRoutes } from './useVisitHandler';

// The Screen component is React Navigation's own, the same for every navigator, so
// these elements belong to whichever native stack they are rendered in.
const Stack = createNativeStackNavigator();

// Screens are identified by path: a link to a page already in the stack pops back to it
// and updates its params, and a query change, a filter say, is the same page. React
// Navigation does this on its own through getId.
export const hotwireScreenId = ({ params }: { params?: { url?: string; fullPath?: string } }) => {
  const path = params?.url ? new URL(params.url).pathname : params?.fullPath?.split('?')[0].split('#')[0];
  return path?.replace(/\/+$/, '') || '/';
};

export interface HotwireScreensOptions<Style extends string = never> {
  /** The page the stack starts on, a path under the base URL. Defaults to `/`. */
  path?: string;
  /**
   * The screen for every web route; `HotwireScreen` unless the app wraps it to set
   * `onError`, `onVisitProposal` or the like once for all of them.
   */
  component?: React.ComponentType<any>;
  /**
   * The app's route names per presentation, the same table its screens navigate by.
   * Styles that share a name share a screen, as the three sheet styles do by default.
   */
  routes?: Partial<VisitRoutes<string, Style>>;
  /**
   * Navigation options per presentation, merged over the native presentation each gets.
   * A style of the app's own gets `modal` unless its options say otherwise.
   */
  options?: Partial<Record<VisitPresentation | Style, NativeStackNavigationOptions>>;
}

const nativePresentations: Record<VisitPresentation, NativeStackNavigationOptions['presentation']> = {
  default: undefined,
  modal: 'modal',
  full: 'fullScreenModal',
  medium: 'formSheet',
  page_sheet: 'pageSheet',
  form_sheet: 'formSheet',
};

/**
 * The web routes a stack needs, one per presentation, named from `routes` so that
 * `useVisitHandler` finds them. Render them inside a native stack next to the app's own
 * screens; each stack that shows pages gets its own set, modals included, as every
 * upstream Navigator has its own modal layer. Titles start empty so the route name
 * never shows before the page title does. A screen the app writes itself instead keeps
 * `hotwireScreenId` and its name in `routes`.
 */
export function hotwireScreens<Style extends string = never>({
  path = '/',
  component = HotwireScreen,
  routes: routeOverrides,
  options = {},
}: HotwireScreensOptions<Style> = {}) {
  const routes = { ...defaultVisitRoutes, ...routeOverrides } as Record<string, string | undefined>;
  const styleOptions = options as Partial<Record<string, NativeStackNavigationOptions>>;

  // One screen per route name; the options of every style that maps to it, known
  // presentations first and in table order, merge over its native presentation.
  const screens = new Map<string, NativeStackNavigationOptions>();
  for (const style of [...Object.keys(nativePresentations), ...Object.keys(routes)]) {
    const name = routes[style];
    if (!name) continue;
    const known = style in nativePresentations ? nativePresentations[style as VisitPresentation] : 'modal';
    const current = screens.get(name) ?? { title: '', presentation: known };
    screens.set(name, { ...current, ...styleOptions[style] });
  }

  return (
    <>
      {[...screens].map(([name, screenOptions]) => (
        <Stack.Screen
          key={name}
          name={name}
          component={component}
          getId={hotwireScreenId}
          initialParams={name === routes.default ? { fullPath: path } : undefined}
          options={screenOptions}
        />
      ))}
    </>
  );
}
