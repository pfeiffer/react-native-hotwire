import { Platform } from 'react-native';

/**
 * Installed into the page after every load. Implements the "native adapter" that the
 * web side of Hotwire bridge components expects (`@hotwired/hotwire-native-bridge`,
 * or its predecessor `@hotwired/strada`), forwarding messages to native through
 * `webkit.messageHandlers.nativeApp` on iOS and `AndroidInterface` on Android.
 */
export const bridgeScript = (componentNames: string[]) => `
(() => {
  if (window.nativeBridge !== undefined) {
    return;
  }

  class NativeBridge {
    constructor() {
      this.supportedComponents = [];
      this.adapterIsRegistered = false;
    }

    register(component) {
      if (Array.isArray(component)) {
        this.supportedComponents = this.supportedComponents.concat(component);
      } else {
        if (this.supportsComponent(component)) {
          return;
        }
        this.supportedComponents.push(component);
      }

      if (!this.adapterIsRegistered) {
        this.registerAdapter();
      }
      this.notifyBridgeOfSupportedComponentsUpdate();
    }

    unregister(component) {
      const index = this.supportedComponents.indexOf(component);
      if (index != -1) {
        this.supportedComponents.splice(index, 1);
        this.notifyBridgeOfSupportedComponentsUpdate();
      }
    }

    registerAdapter() {
      this.adapterIsRegistered = true;

      if (this.isBridgeAvailable) {
        this.webBridge.setAdapter(this);
      } else {
        document.addEventListener('web-bridge:ready', () =>
          this.webBridge.setAdapter(this)
        );
      }
    }

    notifyBridgeOfSupportedComponentsUpdate() {
      if (this.isBridgeAvailable) {
        this.webBridge.adapterDidUpdateSupportedComponents();
      }
    }

    supportsComponent(component) {
      return this.supportedComponents.includes(component);
    }

    // Native -> web
    replyWith(message) {
      if (this.isBridgeAvailable) {
        this.webBridge.receive(message);
      }
    }

    // Web -> native
    receive(message) {
      this.postMessage(message);
    }

    get platform() {
      return '${Platform.OS}';
    }

    postMessage(message) {
      const messageString = JSON.stringify(message);
      ${Platform.select({
        android: 'AndroidInterface.postMessage(messageString);',
        ios: 'webkit.messageHandlers.nativeApp.postMessage(messageString);',
        default: '',
      })}
    }

    // @hotwired/hotwire-native-bridge exposes window.HotwireNative,
    // @hotwired/strada exposed window.Strada. Both share the same adapter API.
    get webGlobal() {
      return window.HotwireNative || window.Strada;
    }

    get isBridgeAvailable() {
      return this.webGlobal !== undefined;
    }

    get webBridge() {
      return this.webGlobal.web;
    }
  }

  function initializeBridge() {
    window.nativeBridge = new NativeBridge();
    window.nativeBridge.register(${JSON.stringify(componentNames)});
  }

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initializeBridge();
  } else {
    document.addEventListener('DOMContentLoaded', initializeBridge);
  }
})();
`;
