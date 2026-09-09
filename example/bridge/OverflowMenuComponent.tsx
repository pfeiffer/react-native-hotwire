import { useNavigation } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import { Button } from 'react-native';
import { bridgeComponent, useBridgeMessage, useBridgeReply } from 'react-native-hotwire';

/** A header button that opens the page's overflow menu; the demo's OverflowMenuComponent. */
export const OverflowMenuComponent = bridgeComponent('overflow-menu', () => {
  const navigation = useNavigation();
  const reply = useBridgeReply();
  const [label, setLabel] = useState<string>();

  useBridgeMessage<{ label: string }>('connect', ({ data }) => setLabel(data.label));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: label ? () => <Button title={label} onPress={() => reply('connect')} /> : undefined,
    });
  }, [label, navigation, reply]);

  return null;
});
