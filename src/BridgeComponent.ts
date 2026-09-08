import { Component } from 'react';

import type {
  BridgeComponentProps,
  BridgeMessage,
  BridgeMessages,
  EventSubscription,
  MessageListener,
} from './types';

/**
 * Base class for the native side of a Hotwire bridge component. Subclass it, set a
 * static `componentName` matching the web component, override `onReceive`, and reply
 * with `replyTo`. Pass the subclasses to `VisitableView` via `bridgeComponents`.
 */
export class BridgeComponent<
  Props extends BridgeComponentProps = BridgeComponentProps,
  State = object,
> extends Component<Props, State> {
  name: string;
  url: string;
  sessionHandle: string;
  previousMessages: BridgeMessages = {};
  private subscription?: EventSubscription;
  private readonly registerMessageListener: (listener: MessageListener) => EventSubscription;
  private readonly sendToBridge: (message: BridgeMessage) => void;

  constructor(props: Props) {
    super(props);

    this.url = props.url;
    this.name = props.name;
    this.sessionHandle = props.sessionHandle;
    this.registerMessageListener = props.registerMessageListener;
    this.sendToBridge = props.sendToBridge;

    this.onReceive = this.onReceive.bind(this);
    this.replyTo = this.replyTo.bind(this);
  }

  componentDidMount() {
    this.subscription = this.registerMessageListener((e: object) => {
      const message = e as BridgeMessage;
      if (message?.component !== this.name) {
        return;
      }
      this.previousMessages[message.event] = message;
      this.onReceive(message);
    });
  }

  componentWillUnmount() {
    this.subscription?.remove();
  }

  /** Called with every message the web component sends. Override in subclasses. */
  onReceive(_message: BridgeMessage) {}

  /** Replies to the last message received for `event`, merging `data` into its payload. */
  replyTo(event: string, data?: object) {
    const previousMessage = this.previousMessages[event];
    const messageToSend: BridgeMessage = previousMessage
      ? {
          ...previousMessage,
          data: {
            ...previousMessage.data,
            ...data,
          },
        }
      : {
          component: this.name,
          event,
          data: {
            ...data,
            metadata: {
              url: this.url,
            },
          },
        };
    this.sendToBridge(messageToSend);
  }

  render() {
    return null;
  }
}
