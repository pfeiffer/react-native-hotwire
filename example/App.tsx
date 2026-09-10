import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { HotwireProvider, HotwireScreen, hotwireLinking, hotwireScreens, type HotwireScreenProps } from 'react-native-hotwire';

import { FormComponent } from './bridge/FormComponent';
import { MenuComponent } from './bridge/MenuComponent';
import { OverflowMenuComponent } from './bridge/OverflowMenuComponent';
import configuration from './path-configuration.json';

// The official Hotwire Native demo server: pushes, modals, forms, bridge components. Its own
// path configurations are written for its iOS and Android apps; path-configuration.json is
// the same rules written for this one, `screen: numbers` where the iOS document names a view
// controller. A consumer serves such a document from its server (`pathConfigurationUrl`) and
// bundles a copy, as here.
const demoUrl = 'https://hotwire-native-demo.dev';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// Every web route is this screen. The upstream demo's handling of a 401: the screen that
// got it is empty, so it becomes the sign-in page instead; the server sends the user back
// once signed in.
function WebScreen(props: HotwireScreenProps) {
  return (
    <HotwireScreen
      {...props}
      onError={(error, screen) => {
        if (error.statusCode === 401) {
          screen.visit('/session/new', 'replace');
        }
      }}
    />
  );
}

// One stack per tab, as upstream has one Navigator per tab: a push stays in its tab, and
// the tab's screens share the session named after it.
function tabStack(path: string) {
  return function TabStack() {
    return <Stack.Navigator>{hotwireScreens(Stack, { path, component: WebScreen })}</Stack.Navigator>;
  };
}

const NavigationTab = tabStack('/');
const ComponentsTab = tabStack('/components');
const ResourcesTab = tabStack('/resources');

function TabsScreen() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Navigation" component={NavigationTab} options={{ tabBarIcon: icon('swap-horizontal') }} />
      <Tabs.Screen name="Bridge Components" component={ComponentsTab} options={{ tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="Resources" component={ResourcesTab} options={{ tabBarIcon: icon('book') }} />
    </Tabs.Navigator>
  );
}

const icon =
  (name: React.ComponentProps<typeof Ionicons>['name']) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

// The counterpart of the demo's NumbersViewController.
function NumbersScreen() {
  return (
    <FlatList
      data={Array.from({ length: 100 }, (_, i) => i + 1)}
      keyExtractor={(n) => String(n)}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.number}>Row {item}</Text>
        </View>
      )}
    />
  );
}

const linking = hotwireLinking(demoUrl);

export default function App() {
  // The web view follows the system appearance on both platforms; the chrome must too.
  const colorScheme = useColorScheme();

  return (
    <HotwireProvider
      pathConfiguration={configuration}
      bridgeComponents={[FormComponent, MenuComponent, OverflowMenuComponent]}
      webViewDebuggingEnabled>
      <NavigationContainer linking={linking} theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack.Navigator>
          <Stack.Screen name="tabs" component={TabsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="numbers" component={NumbersScreen} options={{ title: 'Numbers' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </HotwireProvider>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  number: { fontSize: 17 },
});
