import { CommonActions } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { HotwireApp } from 'react-native-hotwire';

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
