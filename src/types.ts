import type React from 'react';

export type VisitAction = 'advance' | 'replace' | 'restore';

/** The merged properties of every path configuration rule matching a URL; `{}` when none. */
export type PathProperties = Record<string, unknown>;

export interface VisitProposal {
  url: string;
  action: VisitAction;
  properties: PathProperties;
  /**
   * The page the screen asked for was redirected here, on a cold boot or a visit, and the
   * screen did not render it. A form submission's redirect is not this: that proposal
   * carries the form's action.
   */
  redirected: boolean;
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

export enum SystemStatusCode {
  NETWORK_FAILURE = 0,
  TIMEOUT_FAILURE = -1,
  CONTENT_TYPE_MISMATCH = -2,
  PAGE_LOAD_FAILURE = -3,
  UNKNOWN = -4,
}

export interface ErrorEvent {
  url: string;
  /** A `SystemStatusCode`, or the HTTP status of the response. */
  statusCode: SystemStatusCode | number;
  description?: string;
}

/** React Native's `ScrollView` scroll event; `velocity` is iOS only. Values are in points. */
export interface ScrollEvent {
  contentInset: { top: number; left: number; bottom: number; right: number };
  contentOffset: { x: number; y: number };
  contentSize: { width: number; height: number };
  layoutMeasurement: { width: number; height: number };
  velocity?: { x: number; y: number };
  zoomScale: number;
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
