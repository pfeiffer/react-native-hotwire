import { useNavigation } from '@react-navigation/native';
import { useLayoutEffect, useState } from 'react';
import { Button } from 'react-native';
import { bridgeComponent, useBridgeMessage } from 'react-native-hotwire';

// The native side of the fixture server's three bridge components (see server.js).

/** Replies at once with what it returns. */
export const EchoComponent = bridgeComponent('echo', () => {
  useBridgeMessage<{ text: string }>('ping', ({ data }) => ({ text: data.text.toUpperCase() }));
  return null;
});

/** Puts a button in the header and replies when it is pressed. */
export const ButtonComponent = bridgeComponent('button', () => {
  const navigation = useNavigation();
  const [button, setButton] = useState<{ title: string; press: () => void }>();

  useBridgeMessage<{ title: string }>('connect', ({ data }, reply) =>
    setButton({ title: data.title, press: () => reply({ pressed: true }) })
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: button ? () => <Button title={button.title} onPress={button.press} /> : undefined,
    });
  }, [button, navigation]);

  return null;
});

/** Throws, so the page gets an error reply instead of waiting. */
export const FailingComponent = bridgeComponent('failing', () => {
  useBridgeMessage('boom', () => {
    throw new Error('nope');
  });
  return null;
});
