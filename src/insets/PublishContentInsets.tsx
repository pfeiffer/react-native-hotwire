import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentInsetsContext } from './ContentInsetsContext';
import { useWindowRect } from './useWindowRect';

/**
 * Publishes where a screen's own chrome stops: below the navigation bar above,
 * above the tab bar below. Mount it at the level that can see both, a tab
 * screen; anything nested deeper, a pager page, measures nothing at all. Needs a
 * `SafeAreaProvider` mounted inside the screen, since only that one reports the
 * bars that overlap the screen; the root provider knows the status bar and the
 * home indicator alone.
 *
 * Published in window coordinates, so a screen that doesn't reach a bar can
 * tell that it doesn't. Its own safe area is relative to this screen, so the
 * screen's position in the window converts it.
 */
export function PublishContentInsets({ children }: { children: React.ReactNode }) {
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
