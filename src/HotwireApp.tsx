import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';

import { HotwireProvider, type HotwireProviderProps } from './HotwireProvider';
import { HotwireScreen, type HotwireScreenProps } from './HotwireScreen';
import { hotwireLinking } from './navigation/hotwireLinking';

/** A native screen next to the web ones: a route, its component, and the path that opens it. */
export interface HotwireNativeScreen {
  name: string;
  component: React.ComponentType<any>;
  /** URL path under the base URL that opens this screen instead of a page, e.g. `settings`. */
  path?: string;
  options?: NativeStackNavigationOptions;
}

/** A tab: its own stack and session rooted at `url`, as upstream's Navigator per tab. */
export interface HotwireTab {
  title: string;
  url: string;
  /** Route name; defaults to the title. */
  name?: string;
  icon?: (props: { focused: boolean; color: string; size: number }) => React.ReactNode;
}

export interface HotwireAppProps
  extends Omit<HotwireScreenProps, 'baseURL' | 'routes'>,
    Omit<HotwireProviderProps, 'children'> {
  /** The page the app starts on; its origin is the base URL. */
  url: string;
  /** Native screens beside the web ones. Reach them from a rule's `screen` or a `path`. */
  screens?: HotwireNativeScreen[];
  /** Bottom tabs, each a stack rooted at its URL; `url` is then the first tab's fallback. */
  tabs?: HotwireTab[];
}

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const webRouteId = ({ params }: { params?: { url?: string } }) => params?.url;

/**
 * A whole Hotwire app in one component: a stack with the web routes each presentation
 * needs, HotwireScreen on all of them, the path configuration loaded, and linking that
 * sends every URL under the base URL to a web screen. The flat model, which is upstream's:
 * one stack, one modal layer. For a hierarchy of your own, compose HotwireScreen into
 * your navigators instead.
 */
export function HotwireApp(props: HotwireAppProps) {
  const {
    url,
    pathConfigurationUrl,
    pathConfiguration,
    applicationNameForUserAgent,
    bridgeComponents,
    webViewDebuggingEnabled,
    screens = [],
    tabs,
    ...screenProps
  } = props;
  const baseURL = useMemo(() => new URL(url).origin, [url]);

  const linking = useMemo(
    () =>
      hotwireLinking(
        baseURL,
        Object.fromEntries(screens.filter((screen) => screen.path).map((screen) => [screen.name, screen.path as string]))
      ),
    [baseURL, screens]
  );

  // One component identity for every web route, so React Navigation never remounts them.
  const WebScreen = useMemo(
    () =>
      function HotwireWebScreen() {
        return <HotwireScreen baseURL={baseURL} {...screenProps} />;
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseURL]
  );

  // The web routes, one per presentation. Every tab's stack has the full set, modals
  // included, as every upstream Navigator has its own modal layer: a modal opened from a
  // tab lives in that tab's stack, so a proposal made from it finds `web` right there.
  const webRoutes = useMemo(
    () =>
      function renderWebRoutes(initialUrl: string) {
        return (
          <>
            <Stack.Screen
              name="web"
              component={WebScreen}
              getId={webRouteId}
              initialParams={{ url: initialUrl }}
              options={{ title: '' }}
            />
            <Stack.Screen
              name="webModal"
              component={WebScreen}
              getId={webRouteId}
              options={{ title: '', presentation: 'modal' }}
            />
            <Stack.Screen
              name="webSheet"
              component={WebScreen}
              getId={webRouteId}
              options={{ title: '', presentation: 'formSheet' }}
            />
            <Stack.Screen
              name="webFullScreen"
              component={WebScreen}
              getId={webRouteId}
              options={{ title: '', presentation: 'fullScreenModal' }}
            />
          </>
        );
      },
    [WebScreen]
  );

  // One stack per tab: a push from a tab stays in it, and the tab's screens share the
  // session named after it.
  const TabsScreen = useMemo(() => {
    if (!tabs?.length) return null;
    const stacks = tabs.map((tab) => {
      const name = tab.name ?? tab.title;
      const TabStack = () => <Stack.Navigator>{webRoutes(tab.url)}</Stack.Navigator>;
      TabStack.displayName = `HotwireTab(${name})`;
      return { name, tab, TabStack };
    });
    return function HotwireTabs() {
      return (
        <Tabs.Navigator screenOptions={{ headerShown: false }}>
          {stacks.map(({ name, tab, TabStack }) => (
            <Tabs.Screen key={name} name={name} component={TabStack} options={{ title: tab.title, tabBarIcon: tab.icon }} />
          ))}
        </Tabs.Navigator>
      );
    };
  }, [tabs, webRoutes]);

  return (
    <HotwireProvider
      applicationNameForUserAgent={applicationNameForUserAgent}
      bridgeComponents={bridgeComponents}
      webViewDebuggingEnabled={webViewDebuggingEnabled}
      pathConfiguration={pathConfiguration}
      pathConfigurationUrl={pathConfigurationUrl}>
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        {TabsScreen ? (
          <Stack.Screen name="tabs" component={TabsScreen} options={{ headerShown: false }} />
        ) : (
          webRoutes(url)
        )}
        {screens.map((screen) => (
          <Stack.Screen key={screen.name} name={screen.name} component={screen.component} options={screen.options} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
    </HotwireProvider>
  );
}
