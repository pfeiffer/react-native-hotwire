import { useCallback, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import type { EventSubscription, MessageEvent, MessageListener } from '../types';

/** Fans every message from the web view out to the registered listeners (one per bridge component). */
export function useMessageQueue(onMessage: MessageListener | undefined) {
  const listeners = useRef<(MessageListener | undefined)[]>([onMessage]);

  const registerMessageListener = useCallback(
    (listener: MessageListener): EventSubscription => {
      listeners.current.push(listener);

      return {
        remove: () => {
          listeners.current = listeners.current.filter((l) => l !== listener);
        },
      };
    },
    []
  );

  const handleOnMessage = useCallback((e: NativeSyntheticEvent<MessageEvent>) => {
    let message: object;
    try {
      message = JSON.parse(e.nativeEvent.message);
    } catch (error) {
      console.error('react-native-hotwired: failed to parse message from web view', error);
      return;
    }

    listeners.current.forEach((listener) => listener?.(message));
  }, []);

  return { registerMessageListener, handleOnMessage };
}
