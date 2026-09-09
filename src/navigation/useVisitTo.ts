import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { useVisitBuilder, type VisitTarget } from './useVisitBuilder';
import type { VisitAction } from '../types';

/**
 * Like React Navigation's `useLinkTo`, for Turbo visits: navigates to the screen for a URL
 * (or a screen), pushing, replacing or updating params as the visit action asks.
 */
export function useVisitTo() {
  const navigation = useNavigation();
  const { buildAction } = useVisitBuilder();

  return useCallback(
    (to: VisitTarget, visitAction?: VisitAction) => {
      navigation.dispatch(buildAction(to, visitAction).action);
    },
    [buildAction, navigation]
  );
}
