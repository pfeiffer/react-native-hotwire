import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useRef } from 'react';
import { LogBox } from 'react-native';
import {
  HotwireProvider,
  HotwireScreen,
  hotwireLinking,
  hotwireScreens,
  type HotwireScreenProps,
  type VisitableViewRef,
} from 'react-native-hotwire';

import { ButtonComponent, EchoComponent, FailingComponent } from './bridge';
import configuration from './path-configuration.json';

// The app the end-to-end flows drive: two tabs of pages from the fixture server in
// ../server, nothing else. The simulator reaches the host as localhost; the runner maps
// the emulator's localhost to the host with adb reverse.
const serverUrl = 'http://localhost:4567';

// The `failing` bridge component throws on purpose; the library reports that as an error,
// which LogBox would otherwise put over the page.
LogBox.ignoreLogs([/react-native-hotwire: failing#boom failed/]);

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// A page the server redirected elsewhere leaves this screen without one. A screen that
// could not be replaced, a tab root, loads its page again when it is next focused, as the
// web would on the way back.
function WebScreen(props: HotwireScreenProps) {
  const ref = useRef<VisitableViewRef>(null);
  const reloadOnFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!reloadOnFocus.current) return;
      reloadOnFocus.current = false;
      ref.current?.reload();
    }, [])
  );

  return (
    <HotwireScreen
      ref={ref}
      {...props}
      onVisitProposal={(proposal) => {
        if (proposal.redirected) reloadOnFocus.current = true;
      }}
      onError={(error, screen) => {
        // The upstream demo's answer to a 401: this screen becomes the sign-in page.
        if (error.statusCode === 401) {
          screen.visit('/session/new', 'replace');
        }
      }}
    />
  );
}

// One stack per tab, each with its own session, as the example app and upstream's demo.
function tabStack(path: string) {
  return function TabStack() {
    // No title in the back button: a flow can then tell the previous page's title from the current one.
    return (
      <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        {hotwireScreens(Stack, { path, component: WebScreen })}
      </Stack.Navigator>
    );
  };
}

const HomeTab = tabStack('/');
const ResourcesTab = tabStack('/resources');

const linking = hotwireLinking(serverUrl);

export default function App() {
  return (
    <HotwireProvider
      pathConfiguration={configuration}
      bridgeComponents={[EchoComponent, ButtonComponent, FailingComponent]}
      webViewDebuggingEnabled>
      <NavigationContainer linking={linking}>
        <Tabs.Navigator screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="Home" component={HomeTab} options={{ tabBarButtonTestID: 'tab-home' }} />
          <Tabs.Screen name="Resources" component={ResourcesTab} options={{ tabBarButtonTestID: 'tab-resources' }} />
        </Tabs.Navigator>
      </NavigationContainer>
    </HotwireProvider>
  );
}
