import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, StyleSheet, View, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBridge } from './hooks/useBridge';
import { useMessageQueue } from './hooks/useMessageQueue';
import { useWebViewDialogs, type OnAlert, type OnConfirm } from './hooks/useWebViewDialogs';
import { useWebViewState, type RenderError, type RenderLoading } from './hooks/useWebViewState';
import { useContentInsets } from './insets/useContentInsets';
import { useWindowRect } from './insets/useWindowRect';
import { useHotwireConfig } from './HotwireProvider';
import { NativeVisitableView, type NativeVisitableViewRef } from './NativeVisitableView';
import type {
  ContentInset,
  ContentProcessDidTerminateEvent,
  ErrorEvent,
  FormSubmissionEvent,
  LoadEvent,
  MessageListener,
  OnErrorCallback,
  OpenExternalUrlEvent,
  PathProperties,
  ProgressViewOffset,
  VisitProposal,
} from './types';

export interface VisitableViewProps {
  url: string;
  /**
   * Screens sharing a handle share one web view and Turbo session. Defaults to "Default".
   * The web view's user agent and bridge components come from HotwireProvider, once per app.
   */
  sessionHandle?: string;
  pullToRefreshEnabled?: boolean;
  scrollEnabled?: boolean;
  /** iOS only. */
  contentInset?: ContentInset;
  /** Android only: position of the pull-to-refresh spinner. */
  progressViewOffset?: ProgressViewOffset;
  renderLoading?: RenderLoading;
  renderError?: RenderError;
  onVisitProposal: (proposal: VisitProposal) => void;
  onLoad?: (event: LoadEvent) => void;
  /** Defaults to opening the URL with `Linking`. */
  onOpenExternalUrl?: (event: OpenExternalUrlEvent) => void;
  /**
   * A visit followed a redirect to another origin, so the page this view was pushed for
   * never loaded. Upstream pops the screen and opens the URL; this defaults to
   * `onOpenExternalUrl` alone, and `HotwireScreen` adds the pop.
   */
  onCrossOriginRedirect?: (event: OpenExternalUrlEvent) => void;
  onFormSubmissionStarted?: (event: FormSubmissionEvent) => void;
  onFormSubmissionFinished?: (event: FormSubmissionEvent) => void;
  /** Defaults to reloading the view. */
  onContentProcessDidTerminate?: (event: ContentProcessDidTerminateEvent) => void;
  onError?: OnErrorCallback;
  /** Raw messages from the page, already JSON-parsed. Bridge components use this channel. */
  onMessage?: MessageListener;
  onAlert?: OnAlert;
  onConfirm?: OnConfirm;
  style?: StyleProp<ViewStyle>;
}

export interface VisitableViewRef {
  injectJavaScript: (script: string) => void;
  /** Cold-boots the current page. */
  reload: () => void;
  /** Refreshes the current page through Turbo. */
  refresh: () => void;
}

// The Android core reports its enum-valued properties upper case (`POP`, `DEFAULT`), iOS
// lower case as written in the document. Apps read one spelling.
const ENUM_PROPERTIES = ['context', 'presentation', 'modal_style', 'query_string_presentation'];

function normalizeProperties(properties: PathProperties | undefined): PathProperties {
  const normalized: PathProperties = { ...properties };
  for (const key of ENUM_PROPERTIES) {
    const value = normalized[key];
    if (typeof value === 'string') {
      normalized[key] = value.toLowerCase();
    }
  }
  return normalized;
}

async function openExternalUrl({ url }: OpenExternalUrlEvent) {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    console.error(`react-native-hotwire: don't know how to open ${url}`);
  }
}

/**
 * The safe area the view hands to the page (see useContentInsets) has to be read from a
 * provider that is the view itself, and a component cannot consume the context it renders,
 * so the provider is mounted here and the view proper is its child.
 */
export const VisitableView = forwardRef<VisitableViewRef, VisitableViewProps>((props, ref) => (
  <SafeAreaProvider style={props.style ?? styles.container}>
    <VisitableViewContent {...props} ref={ref} style={styles.container} />
  </SafeAreaProvider>
));

VisitableView.displayName = 'VisitableView';

const VisitableViewContent = forwardRef<VisitableViewRef, VisitableViewProps>((props, ref) => {
  const {
    url,
    sessionHandle = 'Default',
    pullToRefreshEnabled = true,
    scrollEnabled = true,
    contentInset,
    progressViewOffset,
    renderLoading,
    renderError,
    onVisitProposal,
    onLoad,
    onOpenExternalUrl = openExternalUrl,
    onCrossOriginRedirect,
    onFormSubmissionStarted,
    onFormSubmissionFinished,
    onContentProcessDidTerminate,
    onError,
    onMessage,
    onAlert,
    onConfirm,
    style = styles.container,
  } = props;

  const { applicationNameForUserAgent, bridgeComponents, webViewDebuggingEnabled } = useHotwireConfig();
  const nativeRef = useRef<NativeVisitableViewRef>(null);

  const { registerMessageListener, handleOnMessage } = useMessageQueue(onMessage);
  const { initializeBridge, bridgeUserAgent, sendToBridge } = useBridge(nativeRef, bridgeComponents);
  const { handleAlert, handleConfirm } = useWebViewDialogs(nativeRef, onAlert, onConfirm);

  const reload = useCallback(() => {
    nativeRef.current?.reload();
  }, []);

  const { webViewStateComponent, handleShowLoading, handleHideLoading, handleRenderError } =
    useWebViewState(reload, renderLoading, renderError);

  // Where this view sits in the window decides how much of the chrome overlaps it. The
  // safe area is read from a provider that is this view, so it already knows: a view that
  // stops short of a bar, because a parent padded for it, reports nothing for that edge.
  const { ref: layoutRef, onLayout, rect } = useWindowRect();
  const applyContentInsets = useContentInsets(nativeRef, rect);

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
      initializeBridge();
      applyContentInsets();
      onLoad?.(nativeEvent);
    },
    [applyContentInsets, initializeBridge, onLoad]
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

  const handleFormSubmissionStarted = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<FormSubmissionEvent>) => onFormSubmissionStarted?.(nativeEvent),
    [onFormSubmissionStarted]
  );

  const handleFormSubmissionFinished = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<FormSubmissionEvent>) => onFormSubmissionFinished?.(nativeEvent),
    [onFormSubmissionFinished]
  );

  const handleContentProcessDidTerminate = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<ContentProcessDidTerminateEvent>) =>
      onContentProcessDidTerminate ? onContentProcessDidTerminate(nativeEvent) : reload(),
    [onContentProcessDidTerminate, reload]
  );

  return (
    <View ref={layoutRef} onLayout={onLayout} style={style}>
      {bridgeComponents.map((BridgeComponent, i) => (
        <BridgeComponent
          key={`${url}-${i}`}
          url={url}
          sessionHandle={sessionHandle}
          name={BridgeComponent.componentName}
          registerMessageListener={registerMessageListener}
          sendToBridge={sendToBridge}
        />
      ))}
      <NativeVisitableView
        ref={nativeRef}
        url={url}
        sessionHandle={sessionHandle}
        applicationNameForUserAgent={userAgent}
        pullToRefreshEnabled={pullToRefreshEnabled}
        scrollEnabled={scrollEnabled}
        contentInset={contentInset}
        progressViewOffset={progressViewOffset}
        webViewDebuggingEnabled={webViewDebuggingEnabled}
        onError={handleError}
        onVisitProposal={handleVisitProposal}
        onMessage={handleOnMessage}
        onOpenExternalUrl={handleOpenExternalUrl}
        onCrossOriginRedirect={handleCrossOriginRedirect}
        onLoad={handleLoad}
        onWebAlert={handleAlert}
        onWebConfirm={handleConfirm}
        onFormSubmissionStarted={handleFormSubmissionStarted}
        onFormSubmissionFinished={handleFormSubmissionFinished}
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
