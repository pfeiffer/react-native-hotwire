import { useCallback, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import type { EventSubscription, MessageEvent, MessageListener } from '../types';

/**
 * Fans every message from the web view out to the registered listeners, one per bridge
 * component, and to the view's `onMessage`. Nothing is buffered: a message can only
 * arrive after the bridge script is injected on load, by which time the components have
 * mounted and subscribed, and on a URL change React flushes their new subscriptions
 * before it processes the next native event.
 */
export function useMessageListeners(onMessage: MessageListener | undefined) {
  const listeners = useRef<MessageListener[]>([]);
  const latestOnMessage = useRef(onMessage);
  latestOnMessage.current = onMessage;

  const registerMessageListener = useCallback((listener: MessageListener): EventSubscription => {
    listeners.current.push(listener);

    return {
      remove: () => {
        listeners.current = listeners.current.filter((l) => l !== listener);
      },
    };
  }, []);

  const handleOnMessage = useCallback((e: NativeSyntheticEvent<MessageEvent>) => {
    let message: object;
    try {
      message = JSON.parse(e.nativeEvent.message);
    } catch (error) {
      console.error('react-native-hotwire: failed to parse message from web view', error);
      return;
    }

    // One component's handler failing must not cost the others the message.
    for (const listener of [latestOnMessage.current, ...listeners.current]) {
      try {
        listener?.(message);
      } catch (error) {
        console.error('react-native-hotwire: a message listener threw', error);
      }
    }
  }, []);

  return { registerMessageListener, handleOnMessage };
}
