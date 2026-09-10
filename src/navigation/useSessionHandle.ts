import { useNavigation, useRoute, type NavigationState, type PartialState } from '@react-navigation/native';

type State = NavigationState | PartialState<NavigationState>;

/** The session of every screen outside a tab navigator, upstream's main Navigator. Also `VisitableView`'s default. */
export const MAIN_SESSION_HANDLE = 'main';

/** The session every modal screen shares, upstream's modal Navigator. */
export const MODAL_SESSION_HANDLE = 'modal';

/**
 * The session handle for the screen calling it: the chain of tab routes the screen sits
 * under, outermost first, else `main`. One session per tab, as Hotwire Native's Navigator
 * per tab: every tab keeps its own web view, so a tab switch is instant and needs no
 * restore visit. A nested tab named the same in two outer tabs still gets its own session,
 * and everything outside a tab shares `main`, as upstream's main Navigator does. Modal
 * screens are the caller's to know: it answers MODAL_SESSION_HANDLE for those instead.
 */
export function useSessionHandle(): string {
  const navigation = useNavigation();
  const route = useRoute();

  const tabRoutes: string[] = [];
  let current: typeof navigation | undefined = navigation;
  // The route that holds this screen at each level: our own route at the nearest
  // navigator, then the parent route whose nested state is the level below. The focused
  // route is not it: an unfocused tab that is still mounted renders too.
  let routeName: string | undefined = route.name;
  let childState: State | undefined;

  while (current) {
    const state: State | undefined = current.getState();
    if (!state) {
      break;
    }
    if (childState) {
      const key = (childState as NavigationState).key;
      routeName = state.routes.find((r) => r.state?.key === key)?.name ?? state.routes[state.index ?? 0]?.name;
    }
    if (state.type === 'tab' && routeName) {
      tabRoutes.unshift(routeName);
    }
    childState = state;
    current = current.getParent();
  }

  return tabRoutes.length > 0 ? tabRoutes.join('/') : MAIN_SESSION_HANDLE;
}
