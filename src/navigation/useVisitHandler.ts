import {
  CommonActions,
  StackActions,
  useNavigation,
  useRoute,
  type NavigationAction,
} from '@react-navigation/native';
import { useCallback } from 'react';

import type { PathProperties, VisitProposal } from '../types';

/**
 * Route names a proposal resolves to, keyed by the path configuration's `context` and
 * `modal_style`. Declare each route once in the stack with the matching `presentation`;
 * the rules pick between them per URL. A style the table does not name falls back to
 * `modal`, so a server typo degrades rather than breaks.
 */
export interface VisitRoutes {
  /** `context: "default"`: a push on the current stack. */
  default: string;
  /** `context: "modal"` with `modal_style: "large"`, the default style. */
  modal: string;
  /** `modal_style: "full"`, a full-screen modal. */
  full?: string;
  /** `modal_style: "medium"`, a half sheet. */
  medium?: string;
  /** `modal_style: "page_sheet"`. */
  page_sheet?: string;
  /** `modal_style: "form_sheet"`. */
  form_sheet?: string;
}

export const defaultVisitRoutes: VisitRoutes = {
  default: 'web',
  modal: 'webModal',
  full: 'webFullScreen',
  medium: 'webSheet',
  page_sheet: 'webSheet',
  form_sheet: 'webSheet',
};

/** What the library would do with a proposal, before the app has its say. */
export type VisitResolution =
  | { kind: 'navigate'; action: NavigationAction }
  | { kind: 'pop' }
  | { kind: 'refresh' }
  | { kind: 'none' };

/** Params every routed web screen receives. `fullPath` is what `useCurrentUrl` reads. */
export interface VisitParams {
  url: string;
  fullPath: string;
  properties: PathProperties;
}

export interface VisitHandlerOptions {
  routes?: Partial<VisitRoutes>;
  /**
   * The app's say, upstream's NavigatorDelegate. Called with the proposal and what the
   * library resolved it to. Return `undefined` to accept that, another resolution or a
   * navigation action to substitute your own, or `null` to drop the proposal.
   */
  onVisitProposal?: (
    proposal: VisitProposal,
    resolution: VisitResolution
  ) => VisitResolution | NavigationAction | null | undefined | void;
  /** Performs `presentation: "refresh"`: refresh the page proposing it. */
  refresh?: () => void;
}

function fullPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

// The Android core reports its enums upper case (`POP`, `DEFAULT`), iOS lower case.
function lower(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.toLowerCase() : fallback;
}

function routeFor(properties: PathProperties, routes: VisitRoutes): string {
  if (typeof properties.screen === 'string') {
    return properties.screen;
  }
  if (lower(properties.context, 'default') !== 'modal') {
    return routes.default;
  }
  const style = lower(properties.modal_style, 'large');
  const styled = style in routes ? routes[style as keyof VisitRoutes] : undefined;
  return styled ?? routes.modal;
}

/**
 * Turns a visit proposal into what React Navigation should do, the way upstream's
 * Navigator routes one: the path configuration's `context` and `modal_style` choose the
 * route, `presentation` chooses the action, a `screen` property names a native route. Then
 * hands the result to the app's `onVisitProposal`, which can accept, substitute or drop it.
 *
 * A proposal for the default context made from a modal replaces the modal with the target,
 * which is upstream's dismiss-then-push in stack terms. Linking is never consulted:
 * proposals come from pages, linking is for URLs the OS hands the app.
 */
export function useVisitHandler(options: VisitHandlerOptions = {}) {
  const navigation = useNavigation();
  const route = useRoute();
  const routes: VisitRoutes = { ...defaultVisitRoutes, ...options.routes };
  const { onVisitProposal, refresh } = options;
  const modalRoutes = new Set(
    [routes.modal, routes.full, routes.medium, routes.page_sheet, routes.form_sheet].filter(Boolean) as string[]
  );

  const resolve = useCallback(
    (proposal: VisitProposal): VisitResolution => {
      const { url, properties } = proposal;
      const presentation = lower(properties.presentation, 'default');
      const name = routeFor(properties, routes);
      const params: VisitParams = { url, fullPath: fullPath(url), properties };

      switch (presentation) {
        case 'pop':
          return { kind: 'pop' };
        case 'refresh':
          return { kind: 'refresh' };
        case 'none':
          return { kind: 'none' };
        case 'clear_all':
          return { kind: 'navigate', action: StackActions.popToTop() };
        case 'replace_root':
          return { kind: 'navigate', action: CommonActions.reset({ index: 0, routes: [{ name, params }] }) };
        case 'replace':
          return { kind: 'navigate', action: StackActions.replace(name, params) };
        default: {
          const leavingModal = modalRoutes.has(route.name) && lower(properties.context, 'default') !== 'modal';
          const action =
            leavingModal || proposal.action === 'replace'
              ? StackActions.replace(name, params)
              : CommonActions.navigate({ name, params });
          return { kind: 'navigate', action };
        }
      }
    },
    [route.name, routes.default, routes.modal, routes.full, routes.medium, routes.page_sheet, routes.form_sheet]
  );

  return useCallback(
    (proposal: VisitProposal) => {
      const resolved = resolve(proposal);
      const decided = onVisitProposal ? onVisitProposal(proposal, resolved) : undefined;
      if (decided === null) {
        return;
      }
      const resolution: VisitResolution =
        decided === undefined ? resolved : 'kind' in decided ? decided : { kind: 'navigate', action: decided };

      switch (resolution.kind) {
        case 'navigate':
          navigation.dispatch(resolution.action);
          break;
        case 'pop':
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
          break;
        case 'refresh':
          refresh?.();
          break;
        case 'none':
          break;
      }
    },
    [navigation, onVisitProposal, refresh, resolve]
  );
}
