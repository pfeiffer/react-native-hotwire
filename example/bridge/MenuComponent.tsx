import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { bridgeComponent, useBridgeMessage, useBridgeReply } from 'react-native-hotwire';

type Item = { title: string; index: number };

/** A native menu for the page's list of items; the demo's MenuComponent. */
export const MenuComponent = bridgeComponent('menu', () => {
  const reply = useBridgeReply();

  useBridgeMessage<{ title: string; items: Item[] }>('display', ({ data: { title, items } }) => {
    const select = (item: Item) => reply('display', { selectedIndex: item.index });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...items.map((item) => item.title), 'Cancel'], cancelButtonIndex: items.length },
        (index) => {
          if (index < items.length) select(items[index]);
        }
      );
    } else {
      // Alert takes at most three buttons on Android; a real app would use a bottom sheet.
      Alert.alert(title, undefined, [
        ...items.slice(0, 2).map((item) => ({ text: item.title, onPress: () => select(item) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  });

  return null;
});
