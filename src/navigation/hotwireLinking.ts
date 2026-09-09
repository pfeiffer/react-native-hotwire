import { getLinkingObject } from './getLinkingObject';
import type { LinkingConfig } from './useCurrentUrl';

/**
 * The `linking` for a NavigationContainer whose web screens are the catch-all: every URL
 * under `baseURL` the OS hands the app opens the `web` route with the URL as params,
 * unless `screens` names a route for its path, the React Navigation way to say a URL is
 * native. Proposals from pages never go through linking; see useVisitHandler.
 */
export function hotwireLinking(baseURL: string, screens: Record<string, string> = {}) {
  const config: LinkingConfig = {
    screens: {
      ...screens,
      web: '*',
    },
  };
  return getLinkingObject(baseURL, config);
}
