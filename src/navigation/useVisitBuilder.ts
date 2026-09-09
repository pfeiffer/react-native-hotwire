import type { NavigationState, PartialState } from '@react-navigation/core';
import {
  CommonActions,
  LinkingContext,
  StackActions,
  getActionFromState,
  getStateFromPath,
  useNavigation,
  useRoute,
  type NavigationAction,
} from '@react-navigation/native';
import { useCallback, useContext } from 'react';

import type { VisitAction } from '../types';
import { extractPathFromURL, isDeepEqual } from './utils';

type NavigatePayload = {
  name: string;
  params?: { screen?: string; params?: unknown; path?: string } & Record<string, unknown>;
  path?: string;
};

type NavigateAction = { type: 'NAVIGATE'; payload: NavigatePayload };

type StateAction = ReturnType<typeof getActionFromState>;

export type VisitTarget = string | { screen: string; params?: object };

export interface BuiltVisitAction {
  action: NavigationAction;
  /** True when the action lands in a different top-level navigator than the current one. */
  willChangeTopmostNavigator: boolean | undefined;
}

function asNavigateAction(action: StateAction): NavigateAction | undefined {
  return action?.type === 'NAVIGATE' ? (action as NavigateAction) : undefined;
}

function toStackAction(action: NavigateAction, visitAction: VisitAction | undefined, routeName: string) {
  const { name, params } = action.payload;

  if (visitAction === 'replace') {
    if (name === routeName && params) {
      // Replacing the same route: update params instead of re-pushing, which skips the animation.
      return CommonActions.setParams(params);
    }
    return StackActions.replace(name, params);
  }

  return CommonActions.navigate(name, params);
}

const IGNORED_PARAMS: Record<string, undefined> = {
  path: undefined,
  params: undefined,
  pop: undefined, // added by React Navigation 7
  state: undefined, // drilled down manually
  initial: undefined, // React Navigation internal
  merge: undefined, // navigation action flag
};

function areParamsSimilar(
  visitAction: VisitAction | undefined,
  existing: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
) {
  const ignored = visitAction === 'replace' ? { ...IGNORED_PARAMS, screen: undefined } : IGNORED_PARAMS;
  return isDeepEqual({ ...existing, ...ignored }, { ...next, ...ignored });
}

/**
 * Walks down from the root while the nested target matches the already-focused route,
 * so the dispatched action is the smallest one that changes something.
 */
function getMinimalAction(
  action: NavigateAction,
  rootState: NavigationState,
  visitAction: VisitAction | undefined
): NavigateAction {
  let current = action;
  let state: NavigationState | PartialState<NavigationState> | undefined = rootState;

  while (
    current.payload.params?.screen &&
    state?.routes[state.index ?? -1]?.name === current.payload.name &&
    areParamsSimilar(
      visitAction,
      state.routes[state.index ?? -1]?.params as Record<string, unknown> | undefined,
      current.payload.params
    )
  ) {
    const { screen, params, path } = current.payload.params;
    current = {
      type: 'NAVIGATE',
      payload: { name: screen, params: params as NavigatePayload['params'], path },
    };
    state = state.routes[state.index ?? -1]?.state;
  }

  return current;
}

/**
 * Like React Navigation's `useLinkBuilder`, for Turbo visits: turns a URL (or a screen) and a
 * visit action into the navigation action that gets there, without dispatching it. For a
 * handler that adjusts the action first; `useVisit` covers the common case.
 */
export function useVisitBuilder() {
  const navigation = useNavigation();
  const linking = useContext(LinkingContext);
  const route = useRoute();

  const buildAction = useCallback(
    (to: VisitTarget, visitAction?: VisitAction): BuiltVisitAction => {
      if (typeof to !== 'string') {
        return {
          action: CommonActions.navigate(to.screen, to.params),
          willChangeTopmostNavigator: undefined,
        };
      }

      const { options } = linking;

      let path = to;
      if (options?.prefixes && /^https?:\/\//.test(to)) {
        path = extractPathFromURL(options.prefixes, to) ?? '';
      }

      const state = options?.getStateFromPath
        ? options.getStateFromPath(path, options.config)
        : getStateFromPath(path, options?.config);

      if (!state) {
        throw new Error(`react-native-hotwire: no navigation state for path "${path}"`);
      }

      const action = asNavigateAction(getActionFromState(state, options?.config));

      if (!action) {
        return { action: CommonActions.reset(state), willChangeTopmostNavigator: undefined };
      }

      let root = navigation;
      while (root.getParent()) {
        root = root.getParent();
      }
      const rootState = root.getState();
      const currentScreenName = rootState?.routes[rootState.index ?? -1]?.name;

      const willChangeTopmostNavigator =
        !!currentScreenName && action.payload.name !== currentScreenName && navigation.canGoBack();

      const minimalAction = rootState ? getMinimalAction(action, rootState, visitAction) : action;

      return {
        action: toStackAction(minimalAction, visitAction, route.name),
        willChangeTopmostNavigator,
      };
    },
    [linking, navigation, route.name]
  );

  return { buildAction };
}
