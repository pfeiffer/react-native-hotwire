import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import React, { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';

import { useDefaultSessionHandle } from './navigation/useDefaultSessionHandle';
import { defaultVisitRoutes, useVisitHandler, type VisitHandlerOptions, type VisitParams, type VisitRoutes } from './navigation/useVisitHandler';
import { VisitableView, type VisitableViewProps, type VisitableViewRef } from './VisitableView';
import { openExternalUrl } from './openExternalUrl';
import { useVisitTo } from './navigation/useVisitTo';
import { useResolveURL } from './navigation/useBaseURL';
import type { ErrorEvent, LoadEvent, OpenExternalUrlEvent } from './types';

export interface HotwireScreenProps
  extends Omit<VisitableViewProps, 'url' | 'sessionHandle' | 'onVisitProposal' | 'pullToRefreshEnabled' | 'onError'> {
  /** Overrides the default: the chain of tab routes above, `modal`, or `default`. */
  sessionHandle?: string;
  /** Route names per presentation; see `VisitRoutes`. */
  routes?: Partial<VisitRoutes>;
  /** The app's say on every proposal; see `VisitHandlerOptions`. */
  onVisitProposal?: VisitHandlerOptions['onVisitProposal'];
  /** Sets the screen title from the page title on each load. Defaults to true. */
  titleFromPage?: boolean;
  /** Overrides the path configuration's `pull_to_refresh_enabled`, which defaults to true. */
  pullToRefreshEnabled?: boolean;
  /**
   * A visit failed. The screen shows `renderError` with Retry regardless, upstream's
   * default; this is for the cases an app handles itself, a 401 that should go to sign-in.
   */
  onError?: (error: ErrorEvent, screen: HotwireScreenErrorContext) => void;
}

/** What the app's error handler can do about a failed visit; upstream's delegate gets the same. */
export interface HotwireScreenErrorContext {
  /** Reloads the page. */
  retry: () => void;
  /** Pops this screen, without a transition. Nothing dispatched through it afterwards lands. */
  pop: () => void;
  /** Replaces this screen with the page at `url`, a path or a URL, without a transition: a pop and a visit in one. */
  replace: (url: string) => void;
  /** Visits a URL as a page link would. */
  visitTo: ReturnType<typeof useVisitTo>;
}

function readParams(params: unknown): Partial<VisitParams> & { baseURL?: string } {
  return params && typeof params === 'object' ? (params as Partial<VisitParams> & { baseURL?: string }) : {};
}

function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * A React Navigation screen that is a Hotwire page: `VisitableView` plus the defaults
 * upstream's Navigator provides. The URL comes from the route params, `url` or a
 * `fullPath` resolved against the base URL (see useBaseURL), the session from the
 * screen's place in the navigator tree, proposals go through `useVisitHandler` with the
 * app's `onVisitProposal` as the last word, `pull_to_refresh_enabled` comes from the path
 * configuration, and the page title becomes the screen title. A screen placed by hand, a
 * tab root say, gets `initialParams={{ fullPath: '/' }}`; `hotwireScreens` does this.
 *
 * For a hierarchy the flat model cannot express, named modal flows or screens placed by
 * a config, compose `VisitableView` with your own router instead; this screen is the
 * two-line app's building block, not the only one.
 */
export const HotwireScreen = forwardRef<VisitableViewRef, HotwireScreenProps>((props, ref) => {
  const {
    sessionHandle,
    routes,
    onVisitProposal,
    titleFromPage = true,
    pullToRefreshEnabled,
    onLoad,
    onOpenExternalUrl = openExternalUrl,
    onCrossOriginRedirect,
    onError,
    ...visitableProps
  } = props;

  const navigation = useNavigation();
  const route = useRoute();
  const params = readParams(route.params);
  const visitableRef = useRef<VisitableViewRef>(null);
  useImperativeHandle(ref, () => visitableRef.current as VisitableViewRef, []);

  const resolve = useResolveURL();
  const url = useMemo(() => {
    if (params.url) {
      return params.url;
    }
    // Linking stamps `baseURL` on the routes it opens; everything else resolves against
    // the container's prefix.
    const path = params.fullPath ?? '/';
    return params.baseURL ? new URL(path, params.baseURL).toString() : resolve(path);
  }, [params.url, params.fullPath, params.baseURL, resolve]);

  const resolvedRoutes: VisitRoutes = { ...defaultVisitRoutes, ...routes };
  const defaultSessionHandle = useDefaultSessionHandle(
    [resolvedRoutes.modal, resolvedRoutes.full, resolvedRoutes.medium, resolvedRoutes.page_sheet, resolvedRoutes.form_sheet].filter(
      Boolean
    ) as string[]
  );

  const refresh = useCallback(() => visitableRef.current?.refresh(), []);
  const handleVisitProposal = useVisitHandler({ routes, onVisitProposal, refresh });

  // React Navigation shows the route name until the page title arrives. hotwireScreens
  // declares its routes with an empty title; this covers a screen declared without one.
  useLayoutEffect(() => {
    if (titleFromPage) {
      navigation.setOptions({ title: '' });
    }
  }, [navigation, titleFromPage]);

  const visitTo = useVisitTo();
  const handleError = useCallback(
    (error: ErrorEvent) => {
      onError?.(error, {
        retry: () => visitableRef.current?.reload(),
        pop: () => {
          navigation.setOptions({ animation: 'none' });
          if (navigation.canGoBack()) {
            navigation.dispatch(StackActions.pop());
          }
        },
        replace: (urlOrPath) => {
          navigation.setOptions({ animation: 'none' });
          const url = resolve(urlOrPath);
          const params: VisitParams = { url, fullPath: pathOf(url), properties: {} };
          navigation.dispatch(StackActions.replace(route.name, params));
        },
        visitTo,
      });
    },
    [navigation, onError, resolve, route.name, visitTo]
  );

  const handleLoad = useCallback(
    (event: LoadEvent) => {
      if (titleFromPage && event.title) {
        navigation.setOptions({ title: event.title });
      }
      onLoad?.(event);
    },
    [navigation, onLoad, titleFromPage]
  );

  // Upstream pops the screen the redirected visit was pushed for, then routes the URL.
  const handleCrossOriginRedirect = useCallback(
    (event: OpenExternalUrlEvent) => {
      if (onCrossOriginRedirect) {
        onCrossOriginRedirect(event);
        return;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      onOpenExternalUrl(event);
    },
    [navigation, onCrossOriginRedirect, onOpenExternalUrl]
  );

  const pullToRefresh =
    pullToRefreshEnabled ?? (params.properties?.pull_to_refresh_enabled as boolean | undefined) ?? true;

  return (
    <VisitableView
      {...visitableProps}
      ref={visitableRef}
      url={url}
      sessionHandle={sessionHandle ?? defaultSessionHandle}
      pullToRefreshEnabled={pullToRefresh}
      onVisitProposal={handleVisitProposal}
      onLoad={handleLoad}
      onOpenExternalUrl={onOpenExternalUrl}
      onCrossOriginRedirect={handleCrossOriginRedirect}
      onError={handleError}
    />
  );
});

HotwireScreen.displayName = 'HotwireScreen';
