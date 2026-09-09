import type React from 'react';

export type VisitAction = 'advance' | 'replace' | 'restore';

/** The merged properties of every path configuration rule matching a URL; `{}` when none. */
export type PathProperties = Record<string, unknown>;

export interface VisitProposal {
  url: string;
  action: VisitAction;
  properties: PathProperties;
}

export interface LoadEvent {
  title: string;
  url: string;
}

export interface OpenExternalUrlEvent {
  url: string;
}

export interface FormSubmissionEvent {
  url: string;
}

export interface ContentProcessDidTerminateEvent {
  url: string;
}

export interface MessageEvent {
  message: string;
}

export interface DialogEvent {
  message: string;
}

export type HTTPStatusCode = number;

export enum SystemStatusCode {
  NETWORK_FAILURE = 0,
  TIMEOUT_FAILURE = -1,
  CONTENT_TYPE_MISMATCH = -2,
  PAGE_LOAD_FAILURE = -3,
  UNKNOWN = -4,
}

export interface ErrorEvent {
  url: string;
  statusCode: SystemStatusCode | HTTPStatusCode;
  description?: string;
}

export type OnErrorCallback = (error: ErrorEvent) => void;

export interface ContentInset {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
}

export interface BridgeMessage {
  component: string;
  event: string;
  data: {
    metadata: {
      url: string;
    };
    [key: string]: unknown;
  };
}

export type BridgeMessages = Record<string, BridgeMessage>;

export type MessageListener = (message: object) => void;

export interface EventSubscription {
  remove: () => void;
}

export interface BridgeComponentProps {
  sessionHandle: string;
  url: string;
  name: string;
  registerMessageListener: (listener: MessageListener) => EventSubscription;
  sendToBridge: (message: BridgeMessage) => void;
}

/** A React component class registered with the web bridge under `componentName`. */
export type BridgeComponentType = React.ComponentType<BridgeComponentProps> & {
  componentName: string;
};
