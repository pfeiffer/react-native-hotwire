import { LinkingContext } from '@react-navigation/native';
import { renderHook } from '@testing-library/react-native';
import React from 'react';

import { useBaseURL, useResolveURL } from '../useBaseURL';

function withLinking(prefixes?: string[]) {
  return ({ children }: { children: React.ReactNode }) => (
    <LinkingContext.Provider value={{ options: prefixes ? { prefixes } : undefined } as any}>{children}</LinkingContext.Provider>
  );
}

describe('useBaseURL', () => {
  it('is the first linking prefix', async () => {
    const { result } = await renderHook(() => useBaseURL(), { wrapper: withLinking(['https://example.com', 'myapp://']) });
    expect(result.current).toBe('https://example.com');
  });

  it('is undefined without linking prefixes', async () => {
    const { result } = await renderHook(() => useBaseURL(), { wrapper: withLinking() });
    expect(result.current).toBeUndefined();
  });
});

describe('useResolveURL', () => {
  it('resolves a path against the base URL', async () => {
    const { result } = await renderHook(() => useResolveURL(), { wrapper: withLinking(['https://example.com']) });
    expect(result.current('/session/new?next=1')).toBe('https://example.com/session/new?next=1');
  });

  it('returns an absolute URL unchanged, whatever its scheme', async () => {
    const { result } = await renderHook(() => useResolveURL(), { wrapper: withLinking(['https://example.com']) });
    expect(result.current('https://other.example/x')).toBe('https://other.example/x');
    expect(result.current('sms:555')).toBe('sms:555');
  });

  it('throws a message naming the fix when a path has no base URL', async () => {
    const { result } = await renderHook(() => useResolveURL(), { wrapper: withLinking() });
    expect(() => result.current('/inbox')).toThrow(/hotwireLinking/);
  });
});
