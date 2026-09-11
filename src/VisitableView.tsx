import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBridge } from './hooks/useBridge';
import { useWebViewDialogs, type OnAlert, type OnConfirm } from './hooks/useWebViewDialogs';
import { useWebViewState, type RenderError, type RenderLoading } from './hooks/useWebViewState';
import { useContentInsets } from './insets/useContentInsets';
import { useWindowRect } from './insets/useWindowRect';
import { useHotwireConfig } from './HotwireProvider';
import { NativeVisitableView, type NativeVisitableViewRef } from './NativeVisitableView';
import { MAIN_SESSION_HANDLE } from './navigation/useSessionHandle';
import { openExternalUrl } from './openExternalUrl';
import { normalizeProperties } from './pathConfiguration';
import type {
  BridgeMessage,
  ContentProcessDidTerminateEvent,
  ErrorEvent,
  FormSubmissionEvent,
  LoadEvent,
  OpenExternalUrlEvent,
  ScrollEvent,
  VisitProposal,
} from './types';

export interface VisitableViewProps {
  /** The page to show. A new value visits it in the same session. */
  url: string;
  /**
   * Screens sharing a handle share one web view and Turbo session. Defaults to `main`, the
   * session `useSessionHandle` gives a screen outside every tab.
   * The web view's user agent and bridge components come from HotwireProvider, once per app.
   */
  sessionHandle?: string;
  /** Pull down to reload the page. Defaults to true. */
  pullToRefreshEnabled?: boolean;
  /** Defaults to true. */
  scrollEnabled?: boolean;
  /** Overlay while a visit loads; the default is a centered spinner. */
  renderLoading?: RenderLoading;
  /** Overlay for a failed visit; the default is a message and a Retry that reloads. */
  renderError?: RenderError;
  /** Turbo proposed a visit; navigate with `useVisit`, or route it with `useVisitHandler`. */
  onVisitProposal: (proposal: VisitProposal) => void;
  /** A page finished loading, with its title. */
  onLoad?: (event: LoadEvent) => void;
  /** Defaults to `openExternalUrl`: an in-app browser if expo-web-browser is installed, else the system. */
  onOpenExternalUrl?: (event: OpenExternalUrlEvent) => void;
  /**
   * A cold boot or a visit was redirected to another origin, so the page this view was
   * pushed for never loaded. Upstream pops the screen and opens the URL; this defaults to
   * `onOpenExternalUrl` alone, and `HotwireScreen` adds the pop.
   */
  onCrossOriginRedirect?: (event: OpenExternalUrlEvent) => void;
  /** The page submitted a form; Turbo's `turbo:submit-start`. */
  onFormSubmissionStart?: (event: FormSubmissionEvent) => void;
  /** The submission got its response; Turbo's `turbo:submit-end`. */
  onFormSubmissionEnd?: (event: FormSubmissionEvent) => void;
  /** The web content process died. Defaults to reloading the view. */
  onContentProcessDidTerminate?: (event: ContentProcessDidTerminateEvent) => void;
  /** A visit failed: no response, or an HTTP error status. `renderError` shows regardless. */
  onError?: (error: ErrorEvent) => void;
  /** Every message the page's bridge components send, before the native components see it. */
  onMessage?: (message: BridgeMessage) => void;
  /** Replaces the `Alert` shown for `window.alert`. */
  onAlert?: OnAlert;
  /** Replaces the `Alert` shown for `window.confirm`. */
  onConfirm?: OnConfirm;
  /**
   * The page scrolled. Unlike the other callbacks this receives the synthetic event, with
   * React Native's `ScrollView` shape under `nativeEvent`, so `Animated.event` and anything
   * written for a `ScrollView` or react-native-webview reads it unchanged.
   */
  onScroll?: (event: NativeSyntheticEvent<ScrollEvent>) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface VisitableViewRef {
  injectJavaScript: (script: string) => void;
  /** Cold-boots the current page. */
  reload: () => void;
  /** Refreshes the current page through Turbo. */
  refresh: () => void;
}

/**
 * The safe area the view hands to the page (see useContentInsets) has to be read from a
 * provider that is the view itself, and a component cannot consume the context it renders,
 * so the provider is mounted here and the view proper is its child. The bridge components
 * render beside it, not under it: they belong to the screen and read the screen's safe
 * area and contexts, as a native bridge component would.
 */
export const VisitableView = forwardRef<VisitableViewRef, VisitableViewProps>((props, ref) => {
  const { url, sessionHandle = MAIN_SESSION_HANDLE, onMessage } = props;
  const { bridgeComponents } = useHotwireConfig();
  const nativeRef = useRef<NativeVisitableViewRef>(null);
  const bridge = useBridge(nativeRef, bridgeComponents, onMessage as ((message: object) => void) | undefined);

  return (
    <>
      {/* Keyed by URL: a component belongs to a page, so a replace visit starts it over.
          Upstream scopes components to the screen instead; this is the stricter reading. */}
      {bridgeComponents.map((BridgeComponent, i) => (
        <BridgeComponent
          key={`${url}-${i}`}
          url={url}
          sessionHandle={sessionHandle}
          name={BridgeComponent.componentName}
          registerMessageListener={bridge.registerMessageListener}
          sendToBridge={bridge.sendToBridge}
        />
      ))}
      <SafeAreaProvider style={props.style ?? styles.container}>
        <VisitableViewContent {...props} ref={ref} nativeRef={nativeRef} bridge={bridge} style={styles.container} />
      </SafeAreaProvider>
    </>
  );
});

VisitableView.displayName = 'VisitableView';

interface ContentProps extends VisitableViewProps {
  nativeRef: React.RefObject<NativeVisitableViewRef | null>;
  bridge: ReturnType<typeof useBridge>;
}

const VisitableViewContent = forwardRef<VisitableViewRef, ContentProps>((props, ref) => {
  const {
    nativeRef,
    bridge: { initializeBridge, bridgeUserAgent, handleMessage },
    url,
    sessionHandle = MAIN_SESSION_HANDLE,
    pullToRefreshEnabled = true,
    scrollEnabled = true,
    renderLoading,
    renderError,
    onVisitProposal,
    onLoad,
    onOpenExternalUrl = openExternalUrl,
    onCrossOriginRedirect,
    onFormSubmissionStart,
    onFormSubmissionEnd,
    onContentProcessDidTerminate,
    onError,
    onAlert,
    onConfirm,
    onScroll,
    style = styles.container,
    testID,
  } = props;

  const { applicationNameForUserAgent, webViewDebuggingEnabled } = useHotwireConfig();
  const { handleAlert, handleConfirm } = useWebViewDialogs(nativeRef, onAlert, onConfirm);

  const reload = useCallback(() => {
    nativeRef.current?.reload();
  }, []);

  const { webViewStateComponent, handleShowLoading, handleHideLoading, handleRenderError, handleLoaded } =
    useWebViewState(reload, renderLoading, renderError);

  // Where this view sits in the window decides how much of the chrome overlaps it. The
  // safe area is read from a provider that is this view, so it already knows: a view that
  // stops short of a bar, because a parent padded for it, reports nothing for that edge.
  const { ref: layoutRef, onLayout, rect } = useWindowRect();
  const { applyContentInsets, topInset } = useContentInsets(nativeRef, rect);

  // Token order is part of the contract with the server: "<app identity> bridge-components: [...]".
  const userAgent = useMemo(
    () => [applicationNameForUserAgent, bridgeUserAgent].filter(Boolean).join(' '),
    [applicationNameForUserAgent, bridgeUserAgent]
  );

  useImperativeHandle(
    ref,
    () => ({
      injectJavaScript: (script) => {
        nativeRef.current?.injectJavaScript(script);
      },
      reload,
      refresh: () => {
        nativeRef.current?.refresh();
      },
    }),
    [reload]
  );

  const handleError = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<ErrorEvent>) => {
      onError?.(nativeEvent);
      handleRenderError(nativeEvent);
    },
    [handleRenderError, onError]
  );

  const handleLoad = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<LoadEvent>) => {
      handleLoaded();
      initializeBridge();
      applyContentInsets();
      onLoad?.(nativeEvent);
    },
    [applyContentInsets, handleLoaded, initializeBridge, onLoad]
  );

  const handleVisitProposal = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<VisitProposal>) => {
      const proposal = { ...nativeEvent, properties: normalizeProperties(nativeEvent.properties) };
      // Let a pending onFormSubmissionFinished handler run before navigating.
      setTimeout(() => onVisitProposal(proposal), 0);
    },
    [onVisitProposal]
  );

  const handleOpenExternalUrl = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<OpenExternalUrlEvent>) => onOpenExternalUrl(nativeEvent),
    [onOpenExternalUrl]
  );

  const handleCrossOriginRedirect = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<OpenExternalUrlEvent>) =>
      onCrossOriginRedirect ? onCrossOriginRedirect(nativeEvent) : onOpenExternalUrl(nativeEvent),
    [onCrossOriginRedirect, onOpenExternalUrl]
  );

  const handleFormSubmissionStart = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<FormSubmissionEvent>) => onFormSubmissionStart?.(nativeEvent),
    [onFormSubmissionStart]
  );

  const handleFormSubmissionEnd = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<FormSubmissionEvent>) => onFormSubmissionEnd?.(nativeEvent),
    [onFormSubmissionEnd]
  );

  const handleContentProcessDidTerminate = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<ContentProcessDidTerminateEvent>) =>
      onContentProcessDidTerminate ? onContentProcessDidTerminate(nativeEvent) : reload(),
    [onContentProcessDidTerminate, reload]
  );

  return (
    <View ref={layoutRef} onLayout={onLayout} style={style} testID={testID}>
      <NativeVisitableView
        ref={nativeRef}
        url={url}
        sessionHandle={sessionHandle}
        applicationNameForUserAgent={userAgent}
        pullToRefreshEnabled={pullToRefreshEnabled}
        scrollEnabled={scrollEnabled}
        topInset={topInset}
        webViewDebuggingEnabled={webViewDebuggingEnabled}
        onError={handleError}
        onVisitProposal={handleVisitProposal}
        onMessage={handleMessage}
        onOpenExternalUrl={handleOpenExternalUrl}
        onCrossOriginRedirect={handleCrossOriginRedirect}
        onLoad={handleLoad}
        onWebAlert={handleAlert}
        onWebConfirm={handleConfirm}
        onFormSubmissionStart={handleFormSubmissionStart}
        onFormSubmissionEnd={handleFormSubmissionEnd}
        onScroll={onScroll}
        onShowLoading={handleShowLoading}
        onHideLoading={handleHideLoading}
        onContentProcessDidTerminate={handleContentProcessDidTerminate}
        style={styles.container}
      />
      {webViewStateComponent}
    </View>
  );
});

VisitableViewContent.displayName = 'VisitableViewContent';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
