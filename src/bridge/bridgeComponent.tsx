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

/** A handler's rejection as the web receives it: the error's own fields, `code` and `message` always set. */
export interface BridgeError {
  code: string;
  message: string;
  [key: string]: unknown;
}

export function bridgeError(error: unknown): BridgeError {
  const fields = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  return {
    ...fields,
    code: typeof fields.code === 'string' ? fields.code : 'ERR_UNKNOWN',
    message: typeof fields.message === 'string' ? fields.message : String(error),
  };
}

/**
 * Calls `handler` with every message the web component sends for `event`, and a `reply`
 * bound to that message. The reply can happen later, after an await or from a button the
 * handler set up, and still answers the message that asked. A value the handler returns
 * (or resolves) is the reply when it has not replied itself; a throw or rejection replies
 * `{ error: { code, message, ...error } }` so the page never waits on a failure.
 */
export function useBridgeMessage<Data extends object = Record<string, unknown>>(
  event: string,
  handler: (message: BridgeMessage & { data: Data }, reply: BridgeReply) => void | object | Promise<void | object>
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
      let replied = false;
      const reply: BridgeReply = (data) => {
        replied = true;
        sendToBridge({ ...message, data: { ...message.data, ...data } });
      };
      const settle = (result: void | object) => {
        if (!replied && result !== undefined) {
          reply(result);
        }
      };
      const fail = (error: unknown) => {
        console.error(`react-native-hotwire: ${name}#${event} failed`, error);
        if (!replied) {
          reply({ error: bridgeError(error) });
        }
      };
      // The handler runs in this tick, so a synchronous reply is sent before it returns.
      try {
        Promise.resolve(latest.current(message, reply)).then(settle, fail);
      } catch (error) {
        fail(error);
      }
    });
    return () => subscription.remove();
  }, [event, name, registerMessageListener, sendToBridge]);
}
