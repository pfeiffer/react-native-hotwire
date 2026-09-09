import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { useVisitBuilder, type VisitTarget } from './useVisitBuilder';
import type { VisitAction } from '../types';

/**
 * Turbo's `visit(location, { action })` for the native side, and the counterpart of React
 * Navigation's `useLinkTo`: navigates to the screen for a URL or a path (or a screen),
 * pushing, replacing or updating params as the visit action asks.
 */
export function useVisit() {
  const navigation = useNavigation();
  const { buildAction } = useVisitBuilder();

  return useCallback(
    (to: VisitTarget, visitAction?: VisitAction) => {
      navigation.dispatch(buildAction(to, visitAction).action);
    },
    [buildAction, navigation]
  );
}
