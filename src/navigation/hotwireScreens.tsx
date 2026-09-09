import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';

import { HotwireScreen } from '../HotwireScreen';
import { defaultVisitRoutes, type VisitRoutes } from './useVisitHandler';

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

export interface HotwireScreensOptions {
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
  routes?: Partial<VisitRoutes>;
  /** Navigation options per route name, merged over the presentation each route gets. */
  options?: Record<string, NativeStackNavigationOptions>;
}

type Presentation = NativeStackNavigationOptions['presentation'];

/**
 * The web routes a stack needs, one per presentation, named from `routes` so that
 * `useVisitHandler` finds them. Render them inside a native stack next to the app's own
 * screens; each stack that shows pages gets its own set, modals included, as every
 * upstream Navigator has its own modal layer. Titles start empty so the route name
 * never shows before the page title does. A screen the app writes itself instead keeps
 * `hotwireScreenId` and its name in `routes`.
 */
export function hotwireScreens({
  path = '/',
  component = HotwireScreen,
  routes: routeOverrides,
  options = {},
}: HotwireScreensOptions = {}) {
  const routes: VisitRoutes = { ...defaultVisitRoutes, ...routeOverrides };
  const presentations: [string | undefined, Presentation][] = [
    [routes.default, undefined],
    [routes.modal, 'modal'],
    [routes.full, 'fullScreenModal'],
    [routes.medium, 'formSheet'],
    [routes.page_sheet, 'pageSheet'],
    [routes.form_sheet, 'formSheet'],
  ];
  const seen = new Set<string>();
  return (
    <>
      {presentations.map(([name, presentation]) => {
        if (!name || seen.has(name)) return null;
        seen.add(name);
        return (
          <Stack.Screen
            key={name}
            name={name}
            component={component}
            getId={hotwireScreenId}
            initialParams={name === routes.default ? { fullPath: path } : undefined}
            options={{ title: '', presentation, ...options[name] }}
          />
        );
      })}
    </>
  );
}
