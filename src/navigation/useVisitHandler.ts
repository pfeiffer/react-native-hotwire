import {
  CommonActions,
  StackActions,
  useNavigation,
  useRoute,
  type NavigationAction,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { useCallback } from 'react';

import type { PathProperties, VisitProposal } from '../types';

/**
 * Route names a proposal resolves to, keyed by the path configuration's `context` and
 * `modal_style`. Declare each route once in the stack with the matching `presentation`;
 * the rules pick between them per URL. A style whose route the navigator tree does not
 * declare falls back to `modal`, and `modal` to `default`, with a warning in development,
 * so a route the app left out degrades to a coarser presentation rather than dropping
 * the visit. Type the table against the app's own route names, `VisitRoutes<keyof
 * RootParamList>`, and a typo is a compile error.
 */
export interface VisitRoutes<Name extends string = string> {
  /** `context: "default"`: a push on the current stack. */
  default: Name;
  /** `context: "modal"` with `modal_style: "large"`, the default style. */
  modal: Name;
  /** `modal_style: "full"`, a full-screen modal. */
  full?: Name;
  /** `modal_style: "medium"`, a half sheet. */
  medium?: Name;
  /** `modal_style: "page_sheet"`. */
  page_sheet?: Name;
  /** `modal_style: "form_sheet"`. */
  form_sheet?: Name;
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

// VisitableView normalizes enum-valued properties to lower case; this only fills the default.
function lower(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.toLowerCase() : fallback;
}

function urlOf(route: { params?: object } | undefined): string | undefined {
  const params = route?.params as { url?: string } | undefined;
  return params?.url;
}

function withoutQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0].split('#')[0];
}

type AnyNavigation = NavigationProp<ParamListBase>;

/** The route names declared by this navigator and every navigator above it, where `navigate` can reach. */
function declaredRouteNames(navigation: AnyNavigation): Set<string> {
  const names = new Set<string>();
  for (let nav: AnyNavigation | undefined = navigation; nav; nav = nav.getParent()) {
    nav.getState()?.routeNames?.forEach((name) => names.add(name));
  }
  return names;
}

/**
 * The route for the proposal's `screen`, `context` and `modal_style`: the most specific
 * name the table gives that the navigator tree declares.
 */
function routeFor(properties: PathProperties, routes: VisitRoutes, declared: Set<string>): string {
  const candidates: string[] = [];
  if (typeof properties.screen === 'string') {
    candidates.push(properties.screen);
  }
  if (lower(properties.context, 'default') === 'modal') {
    const style = lower(properties.modal_style, 'large');
    const styled = style in routes ? routes[style as keyof VisitRoutes] : undefined;
    if (styled) candidates.push(styled);
    candidates.push(routes.modal);
  }
  candidates.push(routes.default);

  const name = candidates.find((candidate) => declared.has(candidate)) ?? candidates[0];
  if (__DEV__ && name !== candidates[0]) {
    console.warn(
      `react-native-hotwire: no route named "${candidates[0]}" in this stack or above; showing the page in "${name}". Declare it, or name the route that has it in \`routes\`.`
    );
  }
  return name;
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
      const name = routeFor(properties, routes, declaredRouteNames(navigation as AnyNavigation));
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
          // Upstream's pushOrReplace: the page already on top is replaced rather than
          // stacked twice, the page beneath is popped back to rather than pushed again.
          // `query_string_presentation: replace` makes a query change the same page.
          const samePage = (other: string | undefined) =>
            lower(properties.query_string_presentation, 'default') === 'replace'
              ? withoutQuery(other) === withoutQuery(url)
              : other === url;
          const stack = navigation.getState();
          const current = stack?.routes[stack.index ?? -1];
          const previous = stack?.routes[(stack.index ?? 0) - 1];
          if (samePage(urlOf(current))) {
            return { kind: 'navigate', action: StackActions.replace(name, params) };
          }
          if (previous && samePage(urlOf(previous))) {
            return { kind: 'pop' };
          }
          const leavingModal = modalRoutes.has(route.name) && lower(properties.context, 'default') !== 'modal';
          const action =
            leavingModal || proposal.action === 'replace'
              ? StackActions.replace(name, params)
              : CommonActions.navigate(name, params);
          return { kind: 'navigate', action };
        }
      }
    },
    [navigation, route.name, routes.default, routes.modal, routes.full, routes.medium, routes.page_sheet, routes.form_sheet]
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
