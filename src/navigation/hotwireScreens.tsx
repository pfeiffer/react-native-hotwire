import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { HotwireScreen } from '../HotwireScreen';
import { defaultVisitRoutes, type VisitRoutes } from './useVisitHandler';

// The Screen component is React Navigation's own, the same for every navigator, so
// these elements belong to whichever native stack they are rendered in.
const Stack = createNativeStackNavigator();

// Screens are identified by path: a link to a page already in the stack pops back to it
// and updates its params, and a query change, a filter say, is the same page. React
// Navigation does this on its own through getId.
const webRouteId = ({ params }: { params?: { url?: string; fullPath?: string } }) => {
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
}

/**
 * The web routes a stack needs, one per presentation, named as `useVisitHandler` expects:
 * `web`, `webModal`, `webSheet` and `webFullScreen`. Render them inside a native stack next
 * to the app's own screens; each stack that shows pages gets its own set, modals included,
 * as every upstream Navigator has its own modal layer. Titles start empty so the route name
 * never shows before the page title does.
 */
export function hotwireScreens({ path = '/', component = HotwireScreen }: HotwireScreensOptions = {}) {
  const routes = defaultVisitRoutes as Required<VisitRoutes>;
  return (
    <>
      <Stack.Screen name={routes.default} component={component} getId={webRouteId} initialParams={{ fullPath: path }} options={{ title: '' }} />
      <Stack.Screen name={routes.modal} component={component} getId={webRouteId} options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen name={routes.medium} component={component} getId={webRouteId} options={{ title: '', presentation: 'formSheet' }} />
      <Stack.Screen name={routes.full} component={component} getId={webRouteId} options={{ title: '', presentation: 'fullScreenModal' }} />
    </>
  );
}
