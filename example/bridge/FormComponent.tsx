import { useNavigation } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import { Button } from 'react-native';
import { bridgeComponent, useBridgeMessage } from 'react-native-hotwire';

/** A submit button in the header that submits the page's form; the demo's FormComponent. */
export const FormComponent = bridgeComponent('form', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ title: string; enabled: boolean; submit: () => void }>();

  useBridgeMessage<{ submitTitle: string }>('connect', ({ data }, reply) =>
    setButton({ title: data.submitTitle, enabled: true, submit: () => reply() })
  );
  useBridgeMessage('submitDisabled', () => setButton((b) => b && { ...b, enabled: false }));
  useBridgeMessage('submitEnabled', () => setButton((b) => b && { ...b, enabled: true }));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button
        ? () => <Button title={button.title} disabled={!button.enabled} onPress={button.submit} />
        : undefined,
    });
  }, [button, navigation]);

  return null;
});
