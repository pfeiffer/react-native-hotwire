import Ionicons from '@expo/vector-icons/Ionicons';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { HotwireApp } from 'react-native-hotwire';

import { FormComponent } from './bridge/FormComponent';
import { MenuComponent } from './bridge/MenuComponent';
import { OverflowMenuComponent } from './bridge/OverflowMenuComponent';

// The official Hotwire Native demo server: pushes, modals, forms, bridge components, and a
// path configuration whose `/numbers$` rule asks for a native screen.
const demo = 'https://hotwire-native-demo.dev';

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

export default function App() {
  return (
    <HotwireApp
      url={demo}
      pathConfigurationUrl={`${demo}/configurations/ios_v1.json`}
      tabs={[
        { title: 'Navigation', url: demo, icon: ({ color, size }) => <Ionicons name="swap-horizontal" color={color} size={size} /> },
        { title: 'Bridge Components', url: `${demo}/components`, icon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> },
        { title: 'Resources', url: `${demo}/resources`, icon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> },
      ]}
      bridgeComponents={[FormComponent, MenuComponent, OverflowMenuComponent]}
      onError={(error, screen) => {
        // The upstream demo's handling of a 401: the screen that got it is empty, so it
        // becomes the sign-in page instead; the server sends the user back once signed in.
        if (error.statusCode === 401) {
          screen.replace(`${demo}/session/new`);
        }
      }}
      webViewDebuggingEnabled
      // The demo's `/numbers$` rule says `view_controller: numbers`; that is this route.
      screens={[{ name: 'numbers', component: NumbersScreen, options: { title: 'Numbers' } }]}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  number: { fontSize: 17 },
});
