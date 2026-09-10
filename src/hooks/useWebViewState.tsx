import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Platform, StyleSheet, Text, View } from 'react-native';

import type { ErrorEvent } from '../types';

export type RenderLoading = () => React.ReactNode;
export type RenderError = (error: ErrorEvent, reload: () => void) => React.ReactNode;

const defaultRenderLoading: RenderLoading = () => (
  <View style={styles.wrapper}>
    <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 'large'} />
  </View>
);

const defaultRenderError: RenderError = ({ description = 'Something went wrong...' }, reload) => (
  <View style={styles.wrapper}>
    <Text style={styles.title}>Error loading page</Text>
    <Text style={styles.description}>{description}</Text>
    <Button title="Retry" onPress={reload} />
  </View>
);

/** Loading and error overlays driven by the native onShowLoading / onHideLoading / onError events. */
export function useWebViewState(
  reload: () => void,
  renderLoading: RenderLoading = defaultRenderLoading,
  renderError: RenderError = defaultRenderError
) {
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [error, setError] = useState<ErrorEvent | null>(null);

  const webViewStateComponent = useMemo(
    () => (
      <>
        {loadingVisible && renderLoading()}
        {error && renderError(error, reload)}
      </>
    ),
    [error, loadingVisible, reload, renderError, renderLoading]
  );

  const handleShowLoading = useCallback(() => {
    setError(null);
    setLoadingVisible(true);
  }, []);

  const handleHideLoading = useCallback(() => setLoadingVisible(false), []);

  const handleRenderError = useCallback((errorEvent: ErrorEvent) => setError(errorEvent), []);

  // A page that loaded makes any error stale, however the visit was started: a reload
  // shows the refresh spinner rather than the loading overlay, so it never showed loading.
  const handleLoaded = useCallback(() => setError(null), []);

  return { webViewStateComponent, handleShowLoading, handleHideLoading, handleRenderError, handleLoaded };
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    zIndex: 1,
  },
  title: {
    fontSize: 36,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
    maxWidth: '85%',
    textAlign: 'center',
  },
});
