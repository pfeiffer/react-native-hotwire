import { useNavigation, useRoute, type NavigationState, type PartialState } from '@react-navigation/native';

type State = NavigationState | PartialState<NavigationState>;

/**
 * One session per tab, as Hotwire Native's Navigator per tab: every tab keeps its own web
 * view, so a tab switch is instant and needs no restore visit. The handle is the chain of
 * tab routes the screen sits under, outermost first, so a nested tab named the same in two
 * outer tabs still gets its own session. Modal routes share one handle, everything else
 * shares the default, the two sessions upstream's Navigator owns.
 */
export function useDefaultSessionHandle(modalRouteNames: Iterable<string>): string {
  const navigation = useNavigation();
  const route = useRoute();

  if (new Set(modalRouteNames).has(route.name)) {
    return 'modal';
  }

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

  return tabRoutes.length > 0 ? tabRoutes.join('/') : 'default';
}
