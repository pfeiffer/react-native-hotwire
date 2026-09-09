import { LinkingContext, useRoute, type LinkingOptions } from '@react-navigation/native';
import { useContext } from 'react';

import { useResolveURL } from './useBaseURL';

export type LinkingConfig = LinkingOptions<object>['config'];

function findPath(name: string | undefined, config: LinkingConfig): string | undefined {
  if (!config || !name) return undefined;

  for (const [key, value] of Object.entries(config.screens ?? {})) {
    if (typeof value === 'string') {
      if (key === name) return value;
    } else {
      const path = findPath(name, value as LinkingConfig);
      if (path) return path;
    }
  }
  return undefined;
}

function pathFromParams(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'fullPath' in params) {
    return (params as { fullPath?: string }).fullPath;
  }
  return undefined;
}

/**
 * The URL the current screen should load: the `fullPath` param set by `getLinkingObject`
 * when the screen was reached through a link, otherwise the screen's configured path,
 * resolved against the base URL. Both come from the container's `linking`; pass `config`
 * only when the screen's path lives in a config other than the one linking uses.
 */
export function useCurrentUrl(config?: LinkingConfig): string {
  const route = useRoute();
  const linking = useContext(LinkingContext);
  const resolve = useResolveURL();
  const path = pathFromParams(route.params) ?? findPath(route.name, config ?? (linking.options?.config as LinkingConfig)) ?? '';

  return resolve(path);
}
