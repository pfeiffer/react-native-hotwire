import Ionicons from '@expo/vector-icons/Ionicons';
import { CommonActions } from '@react-navigation/native';
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
      webViewDebuggingEnabled
      screens={[{ name: 'numbers', component: NumbersScreen, options: { title: 'Numbers' } }]}
      onVisitProposal={(proposal) => {
        // The demo's rule names an iOS view controller; here that is a route.
        if (proposal.properties.view_controller === 'numbers') {
          return CommonActions.navigate({ name: 'numbers' });
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  number: { fontSize: 17 },
});
