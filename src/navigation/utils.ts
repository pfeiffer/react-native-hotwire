import type { NavigationState, PartialState } from '@react-navigation/core';

type ComparableObject = Readonly<Record<string, unknown> | undefined>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object';

export function isDeepEqual(a: ComparableObject, b: ComparableObject): boolean {
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const valueA = a[key];
    const valueB = b[key];
    const bothObjects = isObject(valueA) && isObject(valueB);

    if (bothObjects ? !isDeepEqual(valueA, valueB) : valueA !== valueB) {
      return false;
    }
  }
  return true;
}

export type AnyState = NavigationState | PartialState<NavigationState>;

/** Descends to the innermost focused state. */
export function unpackState(state: AnyState): AnyState {
  const nested = state.routes[state.index ?? 0]?.state;
  return nested ? unpackState(nested) : state;
}

const escapeRegExp = (value: string) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

/**
 * Strips a matching linking prefix from a URL, leaving the path. Same behaviour as React
 * Navigation's internal `extractPathFromURL` (which is not exported): `*` in a host
 * segment matches any subdomain, repeated slashes collapse.
 */
export function extractPathFromURL(prefixes: string[], url: string): string | undefined {
  for (const prefix of prefixes) {
    const protocol = prefix.match(/^[^:]+:/)?.[0] ?? '';
    const host = prefix
      .replace(new RegExp(`^${escapeRegExp(protocol)}`), '')
      .replace(/\/+/g, '/')
      .replace(/^\//, '');

    const prefixRegex = new RegExp(
      `^${escapeRegExp(protocol)}(/)*${host
        .split('.')
        .map((segment) => (segment === '*' ? '[^/]+' : escapeRegExp(segment)))
        .join('\\.')}`
    );

    const [originAndPath = '', ...searchParams] = url.split('?');
    const normalizedURL = originAndPath
      .replace(/\/+/g, '/')
      .concat(searchParams.length ? `?${searchParams.join('?')}` : '');

    if (prefixRegex.test(normalizedURL)) {
      return normalizedURL.replace(prefixRegex, '');
    }
  }

  return undefined;
}
