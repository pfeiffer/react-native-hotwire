import { Linking } from 'react-native';

import type { OpenExternalUrlEvent } from './types';

type WebBrowser = { openBrowserAsync(url: string): Promise<unknown> };

// Upstream opens another host in an in-app browser, SFSafariViewController or a Custom
// Tab, and hands other schemes to the system. expo-web-browser is that browser here, but
// it is the app's dependency to add, so it is looked up at runtime.
let webBrowser: WebBrowser | null | undefined;
function inAppBrowser(): WebBrowser | null {
  if (webBrowser === undefined) {
    try {
      webBrowser = require('expo-web-browser') as WebBrowser;
    } catch {
      webBrowser = null;
    }
  }
  return webBrowser;
}

/** HotwireScreen's default for a URL that is not the app's: in-app browser if available, else the system. */
export async function openExternalUrl({ url }: OpenExternalUrlEvent) {
  const browser = inAppBrowser();
  if (browser && /^https?:/.test(url)) {
    await browser.openBrowserAsync(url);
    return;
  }
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    console.error(`react-native-hotwire: don't know how to open ${url}`);
  }
}
