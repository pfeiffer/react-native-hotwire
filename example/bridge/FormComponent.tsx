import { useNavigation } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import { Button } from 'react-native';
import { bridgeComponent, useBridgeMessage, useBridgeReply } from 'react-native-hotwire';

/** A submit button in the header that submits the page's form; the demo's FormComponent. */
export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const reply = useBridgeReply();
  const [button, setButton] = useState<{ title: string; enabled: boolean }>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }) => setButton({ title: data.submitTitle, enabled: true }));
  useBridgeMessage('submitDisabled', () => setButton((b) => b && { ...b, enabled: false }));
  useBridgeMessage('submitEnabled', () => setButton((b) => b && { ...b, enabled: true }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button
        ? () => <Button title={button.title} disabled={!button.enabled} onPress={() => reply('connect')} />
        : undefined,
    });
  }, [button, navigation, reply]);

  return null;
});
