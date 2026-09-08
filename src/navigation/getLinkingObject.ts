import { getStateFromPath } from '@react-navigation/native';

import type { LinkingConfig } from './useCurrentUrl';
import { unpackState, type AnyState } from './utils';

type Options = Parameters<typeof getStateFromPath>[1];
type LinkedParams = { baseURL?: string; fullPath?: string };

function paramsOfActiveRoute(state: AnyState): LinkedParams | undefined {
  const activeRoute = state.routes[state.index ?? 0];
  if (!activeRoute) return undefined;

  if (!activeRoute.params) {
    // Route params are typed readonly but the object is ours to mutate here.
    (activeRoute as { params?: object }).params = {};
  }
  return activeRoute.params as LinkedParams;
}

/**
 * Builds the `linking` object for NavigationContainer. Every linked route receives
 * `baseURL` and `fullPath` params so `useCurrentUrl` can load exactly the linked URL.
 */
export function getLinkingObject(baseURL: string, config: LinkingConfig) {
  return {
    prefixes: [baseURL],
    config,
    getStateFromPath(path: string, options?: Options) {
      const state = getStateFromPath(path, options);
      if (state) {
        const params = paramsOfActiveRoute(unpackState(state));
        if (params) {
          params.baseURL = baseURL;
          params.fullPath = path;
        }
      }
      return state;
    },
  };
}
