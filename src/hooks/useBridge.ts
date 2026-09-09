import { useCallback, useMemo, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { bridgeScript } from '../bridge/bridgeScript';
import type { NativeVisitableViewRef } from '../NativeVisitableView';
import type { BridgeComponentType, BridgeMessage, EventSubscription, MessageEvent, MessageListener } from '../types';

/**
 * The native side of the web bridge for one view: installs the adapter script, advertises
 * the components in the user agent, sends replies, and fans every message from the page
 * out to the components' listeners and the view's `onMessage`.
 */
export function useBridge(
  nativeRef: React.RefObject<NativeVisitableViewRef | null>,
  bridgeComponents: BridgeComponentType[],
  onMessage: MessageListener | undefined
) {
  const componentNames = useMemo(
    () => bridgeComponents.map(({ componentName }) => componentName),
    [bridgeComponents]
  );

  const initializeBridge = useCallback(() => {
    nativeRef.current?.injectJavaScript(bridgeScript(componentNames));
  }, [componentNames, nativeRef]);

  // Advertised in the user agent so the server can tell which components this build supports.
  const bridgeUserAgent = useMemo(
    () => `bridge-components: [${componentNames.join(' ')}]`,
    [componentNames]
  );

  // Injected into whichever page the session shows at that moment. A reply that comes
  // after the user has navigated on reaches the new page, whose web bridge drops it
  // for lack of a matching component; upstream behaves the same.
  const sendToBridge = useCallback(
    (message: BridgeMessage) => {
      nativeRef.current?.injectJavaScript(
        `window.nativeBridge.replyWith(${JSON.stringify(message)})`
      );
    },
    [nativeRef]
  );

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

  const handleMessage = useCallback((e: NativeSyntheticEvent<MessageEvent>) => {
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

  return { initializeBridge, bridgeUserAgent, sendToBridge, registerMessageListener, handleMessage };
}
