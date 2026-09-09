import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import type { BridgeComponentProps, BridgeComponentType, BridgeMessage } from '../types';

interface BridgeContextValue {
  name: string;
  registerMessageListener: BridgeComponentProps['registerMessageListener'];
  sendToBridge: BridgeComponentProps['sendToBridge'];
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
 * useState for what the page last sent, any context. Receive with useBridgeMessage.
 */
export function bridgeComponent(name: string, Component: React.ComponentType<{}>): BridgeComponentType {
  function Bridged(props: BridgeComponentProps) {
    const value = useMemo<BridgeContextValue>(
      () => ({ name, registerMessageListener: props.registerMessageListener, sendToBridge: props.sendToBridge }),
      [props.registerMessageListener, props.sendToBridge]
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

/** Answers the message a handler received, merging `data` into its payload. */
export type BridgeReply = (data?: object) => void;

/**
 * Calls `handler` with every message the web component sends for `event`, and a `reply`
 * bound to that message. The reply can happen later, after an await or from a button the
 * handler set up, and still answers the message that asked.
 */
export function useBridgeMessage<Data extends object = Record<string, unknown>>(
  event: string,
  handler: (message: BridgeMessage & { data: Data }, reply: BridgeReply) => void
) {
  const { name, registerMessageListener, sendToBridge } = useBridgeContext();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const subscription = registerMessageListener((e: object) => {
      const message = e as BridgeMessage & { data: Data };
      if (message?.component !== name || message.event !== event) {
        return;
      }
      const reply: BridgeReply = (data) => sendToBridge({ ...message, data: { ...message.data, ...data } });
      latest.current(message, reply);
    });
    return () => subscription.remove();
  }, [event, name, registerMessageListener, sendToBridge]);
}
