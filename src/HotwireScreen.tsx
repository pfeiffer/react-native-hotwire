import { useNavigation, useRoute } from '@react-navigation/native';
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';

import { useDefaultSessionHandle } from './navigation/useDefaultSessionHandle';
import { defaultVisitRoutes, useVisitHandler, type VisitHandlerOptions, type VisitParams, type VisitRoutes } from './navigation/useVisitHandler';
import { VisitableView, type VisitableViewProps, type VisitableViewRef } from './VisitableView';
import { openExternalUrl } from './openExternalUrl';
import type { LoadEvent, OpenExternalUrlEvent } from './types';

export interface HotwireScreenProps
  extends Omit<VisitableViewProps, 'url' | 'sessionHandle' | 'onVisitProposal' | 'pullToRefreshEnabled'> {
  /**
   * Origin the page paths resolve against. A screen reached through `useVisitHandler`
   * or a link carries its URL in params and needs none; a screen placed in a navigator
   * by hand, a tab root say, gets `initialParams={{ url }}` or `fullPath` plus this.
   */
  baseURL?: string;
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
}

function readParams(params: unknown): Partial<VisitParams> & { baseURL?: string } {
  return params && typeof params === 'object' ? (params as Partial<VisitParams> & { baseURL?: string }) : {};
}

/**
 * A React Navigation screen that is a Hotwire page: `VisitableView` plus the defaults
 * upstream's Navigator provides. The URL comes from the route params, the session from
 * the screen's place in the navigator tree, proposals go through `useVisitHandler` with
 * the app's `onVisitProposal` as the last word, `pull_to_refresh_enabled` comes from the
 * path configuration, and the page title becomes the screen title.
 *
 * For a hierarchy the flat model cannot express, named modal flows or screens placed by
 * a config, compose `VisitableView` with your own router instead; this screen is the
 * two-line app's building block, not the only one.
 */
export const HotwireScreen = forwardRef<VisitableViewRef, HotwireScreenProps>((props, ref) => {
  const {
    baseURL,
    sessionHandle,
    routes,
    onVisitProposal,
    titleFromPage = true,
    pullToRefreshEnabled,
    onLoad,
    onOpenExternalUrl = openExternalUrl,
    onCrossOriginRedirect,
    ...visitableProps
  } = props;

  const navigation = useNavigation();
  const route = useRoute();
  const params = readParams(route.params);
  const visitableRef = useRef<VisitableViewRef>(null);
  useImperativeHandle(ref, () => visitableRef.current as VisitableViewRef, []);

  const url = useMemo(() => {
    if (params.url) {
      return params.url;
    }
    const origin = params.baseURL ?? baseURL;
    if (!origin) {
      throw new Error('react-native-hotwire: HotwireScreen needs a url param or a baseURL prop');
    }
    return new URL(params.fullPath ?? '/', origin).toString();
  }, [params.url, params.fullPath, params.baseURL, baseURL]);

  const resolvedRoutes: VisitRoutes = { ...defaultVisitRoutes, ...routes };
  const defaultSessionHandle = useDefaultSessionHandle(
    [resolvedRoutes.modal, resolvedRoutes.full, resolvedRoutes.medium, resolvedRoutes.page_sheet, resolvedRoutes.form_sheet].filter(
      Boolean
    ) as string[]
  );

  const refresh = useCallback(() => visitableRef.current?.refresh(), []);
  const handleVisitProposal = useVisitHandler({ routes, onVisitProposal, refresh });

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
    />
  );
});

HotwireScreen.displayName = 'HotwireScreen';
