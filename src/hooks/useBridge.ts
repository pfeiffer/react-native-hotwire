import { useCallback, useMemo } from 'react';

import { bridgeScript } from '../bridge/bridgeScript';
import type { NativeVisitableViewRef } from '../NativeVisitableView';
import type { BridgeComponentType, BridgeMessage } from '../types';

export function useBridge(
  nativeRef: React.RefObject<NativeVisitableViewRef | null>,
  bridgeComponents?: BridgeComponentType[]
) {
  const componentNames = useMemo(
    () => bridgeComponents?.map(({ componentName }) => componentName) ?? [],
    [bridgeComponents]
  );

  const initializeBridge = useCallback(() => {
    nativeRef.current?.injectJavaScript(bridgeScript(componentNames));
  }, [componentNames, nativeRef]);

  // Advertised in the user agent so the server can tell which components this build supports.
  const bridgeUserAgent = useMemo(
    () => (bridgeComponents ? `bridge-components: [${componentNames.join(' ')}]` : ''),
    [bridgeComponents, componentNames]
  );

  const sendToBridge = useCallback(
    (message: BridgeMessage) => {
      nativeRef.current?.injectJavaScript(
        `window.nativeBridge.replyWith(${JSON.stringify(message)})`
      );
    },
    [nativeRef]
  );

  return { initializeBridge, bridgeUserAgent, sendToBridge };
}
