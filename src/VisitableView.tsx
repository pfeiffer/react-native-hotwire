import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, StyleSheet, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useBridge } from './hooks/useBridge';
import { useMessageQueue } from './hooks/useMessageQueue';
import { useWebViewDialogs, type OnAlert, type OnConfirm } from './hooks/useWebViewDialogs';
import { useWebViewState, type RenderError, type RenderLoading } from './hooks/useWebViewState';
import { NativeVisitableView, type NativeVisitableViewRef } from './NativeVisitableView';
import type {
  BridgeComponentType,
  ContentInset,
  ContentProcessDidTerminateEvent,
  ErrorEvent,
  FormSubmissionEvent,
  LoadEvent,
  MessageListener,
  OnErrorCallback,
  OpenExternalUrlEvent,
  ProgressViewOffset,
  VisitProposal,
} from './types';

export interface VisitableViewProps {
  url: string;
  /**
   * Screens sharing a handle share one web view and Turbo session. Defaults to "Default".
   * The web view is configured by the first screen on a handle: `applicationNameForUserAgent`
   * and the `bridgeComponents` list in the user agent come from that screen, so give every
   * screen on a handle the same values.
   */
  sessionHandle?: string;
  /** Appended to the web view's user agent, followed by the bridge-components list. */
  applicationNameForUserAgent?: string;
  bridgeComponents?: BridgeComponentType[];
  pullToRefreshEnabled?: boolean;
  scrollEnabled?: boolean;
  /** iOS only. */
  contentInset?: ContentInset;
  /** Android only: position of the pull-to-refresh spinner. */
  progressViewOffset?: ProgressViewOffset;
  webViewDebuggingEnabled?: boolean;
  renderLoading?: RenderLoading;
  renderError?: RenderError;
  onVisitProposal: (proposal: VisitProposal) => void;
  onLoad?: (event: LoadEvent) => void;
  /** Defaults to opening the URL with `Linking`. */
  onOpenExternalUrl?: (event: OpenExternalUrlEvent) => void;
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

async function openExternalUrl({ url }: OpenExternalUrlEvent) {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    console.error(`react-native-hotwire: don't know how to open ${url}`);
  }
}

export const VisitableView = forwardRef<VisitableViewRef, VisitableViewProps>((props, ref) => {
  const {
    url,
    sessionHandle = 'Default',
    applicationNameForUserAgent,
    bridgeComponents,
    pullToRefreshEnabled = true,
    scrollEnabled = true,
    contentInset,
    progressViewOffset,
    webViewDebuggingEnabled = false,
    renderLoading,
    renderError,
    onVisitProposal,
    onLoad,
    onOpenExternalUrl = openExternalUrl,
    onFormSubmissionStarted,
    onFormSubmissionFinished,
    onContentProcessDidTerminate,
    onError,
    onMessage,
    onAlert,
    onConfirm,
    style = styles.container,
  } = props;

  const nativeRef = useRef<NativeVisitableViewRef>(null);

  const { registerMessageListener, handleOnMessage } = useMessageQueue(onMessage);
  const { initializeBridge, bridgeUserAgent, sendToBridge } = useBridge(nativeRef, bridgeComponents);
  const { handleAlert, handleConfirm } = useWebViewDialogs(nativeRef, onAlert, onConfirm);

  const reload = useCallback(() => {
    nativeRef.current?.reload();
  }, []);

  const { webViewStateComponent, handleShowLoading, handleHideLoading, handleRenderError } =
    useWebViewState(reload, renderLoading, renderError);

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
      onLoad?.(nativeEvent);
    },
    [initializeBridge, onLoad]
  );

  const handleVisitProposal = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<VisitProposal>) => {
      // Let a pending onFormSubmissionFinished handler run before navigating.
      setTimeout(() => onVisitProposal(nativeEvent), 0);
    },
    [onVisitProposal]
  );

  const handleOpenExternalUrl = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<OpenExternalUrlEvent>) => onOpenExternalUrl(nativeEvent),
    [onOpenExternalUrl]
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
    <>
      {bridgeComponents?.map((BridgeComponent, i) => (
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
        onLoad={handleLoad}
        onWebAlert={handleAlert}
        onWebConfirm={handleConfirm}
        onFormSubmissionStarted={handleFormSubmissionStarted}
        onFormSubmissionFinished={handleFormSubmissionFinished}
        onShowLoading={handleShowLoading}
        onHideLoading={handleHideLoading}
        onContentProcessDidTerminate={handleContentProcessDidTerminate}
        style={style}
      />
      {webViewStateComponent}
    </>
  );
});

VisitableView.displayName = 'VisitableView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
