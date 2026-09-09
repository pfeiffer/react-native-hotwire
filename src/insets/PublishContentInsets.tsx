import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentInsetsContext } from './ContentInsetsContext';
import { useWindowRect } from './useWindowRect';

/**
 * Publishes where a screen's own chrome stops: below the navigation bar above,
 * above the tab bar below. A web view needs none of this for itself, it reads
 * its own safe area; this is for a navigator nested in the screen that narrows
 * the boundaries by a bar of its own, through ContentInsetsContext. Mount it at
 * the level that can see both bars, a tab screen; anything nested deeper, a
 * pager page, measures nothing at all.
 *
 * Carries its own SafeAreaProvider, since only a provider mounted inside the
 * screen reports the bars that overlap it; the root provider knows the status
 * bar and the home indicator alone. Published in window coordinates, so a
 * screen that doesn't reach a bar can tell that it doesn't.
 */
export function PublishContentInsets({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider style={styles.screen}>
      <Publisher>{children}</Publisher>
    </SafeAreaProvider>
  );
}

function Publisher({ children }: { children: React.ReactNode }) {
  const { top, bottom } = useSafeAreaInsets();
  const { ref, onLayout, rect } = useWindowRect();

  const boundaries = React.useMemo(
    () => (rect ? { top: rect.y + top, bottom: rect.y + rect.height - bottom } : undefined),
    [rect, top, bottom]
  );

  return (
    <View ref={ref} onLayout={onLayout} style={styles.screen}>
      <ContentInsetsContext.Provider value={boundaries}>{children}</ContentInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
