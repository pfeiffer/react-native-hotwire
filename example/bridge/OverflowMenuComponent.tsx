import { useNavigation } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import { Button } from 'react-native';
import { bridgeComponent, useBridgeMessage } from 'react-native-hotwire';

/** A header button that opens the page's overflow menu; the demo's OverflowMenuComponent. */
export const OverflowMenuComponent = bridgeComponent('overflow-menu', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ label: string; open: () => void }>();

  useBridgeMessage<{ label: string }>('connect', ({ data }, reply) => setButton({ label: data.label, open: () => reply() }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button ? () => <Button title={button.label} onPress={button.open} /> : undefined,
    });
  }, [button, navigation]);

  return null;
});
