import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import type { BridgeComponentProps, BridgeComponentType, BridgeMessage, BridgeMessages } from '../types';

interface BridgeContextValue {
  name: string;
  url: string;
  sessionHandle: string;
  registerMessageListener: BridgeComponentProps['registerMessageListener'];
  sendToBridge: BridgeComponentProps['sendToBridge'];
  /** The last message per event, what a reply answers. */
  previousMessages: React.MutableRefObject<BridgeMessages>;
}

const BridgeContext = createContext<BridgeContextValue | null>(null);

function useBridgeContext(): BridgeContextValue {
  const context = useContext(BridgeContext);
  if (!context) {
    throw new Error('react-native-hotwire: bridge hooks work inside a component made with bridgeComponent()');
  }
  return context;
}

/**
 * Makes a bridge component out of a function component. It renders inside the screen
 * showing the page, so every hook works in it: useNavigation for a header button,
 * useState for what the page last sent, any context. Receive with useBridgeMessage,
 * answer with useBridgeReply.
 */
export function bridgeComponent(name: string, Component: React.ComponentType<{}>): BridgeComponentType {
  function Bridged(props: BridgeComponentProps) {
    const previousMessages = useRef<BridgeMessages>({});
    const value = useMemo<BridgeContextValue>(
      () => ({
        name,
        url: props.url,
        sessionHandle: props.sessionHandle,
        registerMessageListener: props.registerMessageListener,
        sendToBridge: props.sendToBridge,
        previousMessages,
      }),
      [props.url, props.sessionHandle, props.registerMessageListener, props.sendToBridge]
    );
    return (
      <BridgeContext.Provider value={value}>
        <Component />
      </BridgeContext.Provider>
    );
  }
  Bridged.componentName = name;
  Bridged.displayName = `BridgeComponent(${name})`;
  return Bridged;
}

/** Calls `handler` with every message the web component sends for `event`. */
export function useBridgeMessage<Data extends object = Record<string, unknown>>(
  event: string,
  handler: (message: BridgeMessage & { data: Data }) => void
) {
  const { name, registerMessageListener, previousMessages } = useBridgeContext();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const subscription = registerMessageListener((e: object) => {
      const message = e as BridgeMessage;
      if (message?.component !== name || message.event !== event) {
        return;
      }
      previousMessages.current[event] = message;
      latest.current(message as BridgeMessage & { data: Data });
    });
    return () => subscription.remove();
  }, [event, name, previousMessages, registerMessageListener]);
}

/** Replies to the last message received for `event`, merging `data` into its payload. */
export function useBridgeReply() {
  const { name, url, sendToBridge, previousMessages } = useBridgeContext();

  return useCallback(
    (event: string, data?: object) => {
      const previous = previousMessages.current[event];
      sendToBridge(
        previous
          ? { ...previous, data: { ...previous.data, ...data } }
          : { component: name, event, data: { ...data, metadata: { url } } }
      );
    },
    [name, previousMessages, sendToBridge, url]
  );
}
