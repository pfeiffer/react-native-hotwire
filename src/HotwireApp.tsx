import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React, { useEffect, useMemo } from 'react';

import { HotwireScreen, type HotwireScreenProps } from './HotwireScreen';
import { hotwireLinking } from './navigation/hotwireLinking';
import { loadPathConfiguration, type PathConfigurationDocument } from './pathConfiguration';

/** A native screen next to the web ones: a route, its component, and the path that opens it. */
export interface HotwireNativeScreen {
  name: string;
  component: React.ComponentType<any>;
  /** URL path under the base URL that opens this screen instead of a page, e.g. `settings`. */
  path?: string;
  options?: NativeStackNavigationOptions;
}

export interface HotwireAppProps extends Omit<HotwireScreenProps, 'baseURL' | 'routes'> {
  /** The page the app starts on; its origin is the base URL. */
  url: string;
  /** The server's path configuration, loaded after the bundled one and cached for the next launch. */
  pathConfigurationUrl?: string;
  /** The bundled path configuration, available before the server's arrives. */
  pathConfiguration?: PathConfigurationDocument;
  /** Native screens beside the web ones. Reach them from a rule's `screen` or a `path`. */
  screens?: HotwireNativeScreen[];
}

const Stack = createNativeStackNavigator();

const webRouteId = ({ params }: { params?: { url?: string } }) => params?.url;

/**
 * A whole Hotwire app in one component: a stack with the web routes each presentation
 * needs, HotwireScreen on all of them, the path configuration loaded, and linking that
 * sends every URL under the base URL to a web screen. The flat model, which is upstream's:
 * one stack, one modal layer. For a hierarchy of your own, compose HotwireScreen into
 * your navigators instead.
 */
export function HotwireApp(props: HotwireAppProps) {
  const { url, pathConfigurationUrl, pathConfiguration, screens = [], ...screenProps } = props;
  const baseURL = useMemo(() => new URL(url).origin, [url]);

  useEffect(() => {
    if (pathConfiguration || pathConfigurationUrl) {
      loadPathConfiguration({ document: pathConfiguration, url: pathConfigurationUrl });
    }
  }, [pathConfiguration, pathConfigurationUrl]);

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

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        <Stack.Screen name="web" component={WebScreen} getId={webRouteId} initialParams={{ url }} />
        <Stack.Screen name="webModal" component={WebScreen} getId={webRouteId} options={{ presentation: 'modal' }} />
        <Stack.Screen name="webSheet" component={WebScreen} getId={webRouteId} options={{ presentation: 'formSheet' }} />
        <Stack.Screen
          name="webFullScreen"
          component={WebScreen}
          getId={webRouteId}
          options={{ presentation: 'fullScreenModal' }}
        />
        {screens.map((screen) => (
          <Stack.Screen key={screen.name} name={screen.name} component={screen.component} options={screen.options} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
