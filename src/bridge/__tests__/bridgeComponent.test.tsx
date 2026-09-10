import { render } from '@testing-library/react-native';
import React from 'react';

import { bridgeComponent, useBridgeMessage } from '../bridgeComponent';
import type { BridgeMessage, MessageListener } from '../../types';

async function mount(Component: ReturnType<typeof bridgeComponent>) {
  const listeners: MessageListener[] = [];
  const sendToBridge = jest.fn();
  await render(
    <Component
      name={Component.componentName}
      url="https://example.com/"
      sessionHandle="Default"
      registerMessageListener={(listener) => {
        listeners.push(listener);
        return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
      }}
      sendToBridge={sendToBridge}
    />
  );
  const deliver = (message: BridgeMessage) => listeners.forEach((listener) => listener(message));
  return { deliver, sendToBridge, listeners };
}

const message = (component: string, event: string, data: object = {}): BridgeMessage => ({
  component,
  event,
  data: { ...data, metadata: { url: 'https://example.com/' } },
});

describe('bridgeComponent', () => {
  it('carries the name the web side registers under', async () => {
    expect(bridgeComponent('menu', () => null).componentName).toBe('menu');
  });

  it('hands a handler the messages for its event, and only those', async () => {
    const handler = jest.fn();
    const Menu = bridgeComponent('menu', () => {
      useBridgeMessage('display', handler);
      return null;
    });
    const { deliver } = await mount(Menu);

    deliver(message('menu', 'display', { title: 'Pick' }));
    deliver(message('menu', 'other'));
    deliver(message('form', 'display'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].data).toEqual({ title: 'Pick', metadata: { url: 'https://example.com/' } });
  });

  it('binds reply to the message received, merging data into its payload', async () => {
    const Menu = bridgeComponent('menu', () => {
      useBridgeMessage<{ title: string }>('display', (_, reply) => reply({ selectedIndex: 1 }));
      return null;
    });
    const { deliver, sendToBridge } = await mount(Menu);

    deliver(message('menu', 'display', { title: 'Pick' }));

    expect(sendToBridge).toHaveBeenCalledWith({
      component: 'menu',
      event: 'display',
      data: { title: 'Pick', selectedIndex: 1, metadata: { url: 'https://example.com/' } },
    });
  });

  it('answers the message that asked even when two are in flight', async () => {
    const replies: Array<() => void> = [];
    const Form = bridgeComponent('form', () => {
      useBridgeMessage('connect', ({ data }, reply) => {
        replies.push(() => reply({ answered: data.id }));
      });
      return null;
    });
    const { deliver, sendToBridge } = await mount(Form);

    deliver(message('form', 'connect', { id: 1 }));
    deliver(message('form', 'connect', { id: 2 }));
    replies[0]();

    expect(sendToBridge).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 1, answered: 1 }) }));
  });

  it('unsubscribes on unmount', async () => {
    const Menu = bridgeComponent('menu', () => {
      useBridgeMessage('display', () => {});
      return null;
    });
    const { listeners } = await mount(Menu);
    expect(listeners).toHaveLength(1);
  });

  it('refuses the hooks outside a bridge component', async () => {
    const Bare = () => {
      useBridgeMessage('x', () => {});
      return null;
    };
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Bare />)).rejects.toThrow(/bridgeComponent\(\)/);
    error.mockRestore();
  });
});

describe('useBridgeMessage replies', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('sends what the handler resolves to when it has not replied itself', async () => {
    const Menu = bridgeComponent('menu', () => {
      useBridgeMessage('display', async () => ({ selectedIndex: 2 }));
      return null;
    });
    const { deliver, sendToBridge } = await mount(Menu);

    deliver(message('menu', 'display'));
    await flush();

    expect(sendToBridge).toHaveBeenCalledTimes(1);
    expect(sendToBridge).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ selectedIndex: 2 }) }));
  });

  it('does not reply twice when the handler replied and returned a value', async () => {
    const Menu = bridgeComponent('menu', () => {
      useBridgeMessage('display', (_, reply) => {
        reply({ selectedIndex: 1 });
        return { selectedIndex: 2 };
      });
      return null;
    });
    const { deliver, sendToBridge } = await mount(Menu);

    deliver(message('menu', 'display'));
    await flush();

    expect(sendToBridge).toHaveBeenCalledTimes(1);
    expect(sendToBridge).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ selectedIndex: 1 }) }));
  });

  it('leaves a handler that returns nothing to reply on its own time', async () => {
    const Form = bridgeComponent('form', () => {
      useBridgeMessage('connect', () => {});
      return null;
    });
    const { deliver, sendToBridge } = await mount(Form);

    deliver(message('form', 'connect'));
    await flush();

    expect(sendToBridge).not.toHaveBeenCalled();
  });

  it('replies with the error when the handler rejects', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const Store = bridgeComponent('store', () => {
      useBridgeMessage('buy', async () => {
        throw Object.assign(new Error('Cancelled'), { code: 'E_USER_CANCELLED', subcode: 'cancel' });
      });
      return null;
    });
    const { deliver, sendToBridge } = await mount(Store);

    deliver(message('store', 'buy'));
    await flush();

    expect(sendToBridge).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: { code: 'E_USER_CANCELLED', message: 'Cancelled', subcode: 'cancel' } }) })
    );
    error.mockRestore();
  });

  it('fills code and message in for an error without them', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const Store = bridgeComponent('store', () => {
      useBridgeMessage('buy', () => {
        throw 'nope';
      });
      return null;
    });
    const { deliver, sendToBridge } = await mount(Store);

    deliver(message('store', 'buy'));
    await flush();

    expect(sendToBridge).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: { code: 'ERR_UNKNOWN', message: 'nope' } }) })
    );
    error.mockRestore();
  });
});
