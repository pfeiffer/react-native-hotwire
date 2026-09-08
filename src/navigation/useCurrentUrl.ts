import { useRoute, type LinkingOptions } from '@react-navigation/native';

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
 * when the screen was reached through a link, otherwise the screen's configured path.
 */
export function useCurrentUrl(baseUrl: string, config: LinkingConfig): string {
  const route = useRoute();
  const path = pathFromParams(route.params) ?? findPath(route.name, config) ?? '';

  return new URL(path, baseUrl).toString();
}
