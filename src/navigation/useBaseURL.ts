import { LinkingContext } from '@react-navigation/native';
import { useCallback, useContext } from 'react';

/**
 * The app's origin, stated once as the prefix of the container's `linking`
 * (`hotwireLinking` or `getLinkingObject`), which is the object that maps URLs to
 * screens. Everything under the container resolves paths against it.
 */
export function useBaseURL(): string | undefined {
  const linking = useContext(LinkingContext);
  return linking.options?.prefixes?.[0];
}

/** Resolves a path against the base URL; an absolute URL is returned as is. */
export function useResolveURL(): (urlOrPath: string) => string {
  const baseURL = useBaseURL();
  return useCallback(
    (urlOrPath: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(urlOrPath)) {
        return urlOrPath;
      }
      if (!baseURL) {
        throw new Error(
          `react-native-hotwire: "${urlOrPath}" is a path, and there is no base URL to resolve it against; give the container's linking a prefix (hotwireLinking)`
        );
      }
      return new URL(urlOrPath, baseURL).toString();
    },
    [baseURL]
  );
}
