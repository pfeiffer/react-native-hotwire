import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { loadPathConfiguration, type PathConfigurationDocument } from './pathConfiguration';
import type { BridgeComponentType } from './types';

/**
 * Upstream's default token. Servers recognize a native app by it (Rails' `hotwire_native_app?`),
 * and serve the native stylesheet that hides what a bridge component replaces.
 */
export const defaultApplicationNameForUserAgent =
  Platform.OS === 'ios' ? 'Hotwire Native iOS; Turbo Native iOS;' : 'Hotwire Native Android; Turbo Native Android;';

export interface HotwireConfig {
  /**
   * Appended to every web view's user agent, followed by the bridge component list.
   * Defaults to upstream's token; an app with a server contract of its own puts it here.
   */
  applicationNameForUserAgent: string;
  /** The app's bridge components; the user agent advertises their names. */
  bridgeComponents: BridgeComponentType[];
  /** Makes the web views inspectable (Safari, Chrome). */
  webViewDebuggingEnabled: boolean;
  /**
   * iOS: lets a `<video playsinline>` play inline, as Safari does. WKWebView's own default
   * sends every video fullscreen. Defaults to true. Android plays inline regardless.
   */
  allowsInlineMediaPlayback: boolean;
}

export interface HotwireProviderProps extends Partial<HotwireConfig> {
  /** The bundled path configuration, available before the server's arrives. */
  pathConfiguration?: PathConfigurationDocument;
  /** The server's path configuration, loaded after the bundled one and cached for the next launch. */
  pathConfigurationUrl?: string;
  children: React.ReactNode;
}

const HotwireContext = createContext<HotwireConfig | null>(null);

/**
 * Everything that belongs to a session rather than a screen, in one place above the
 * navigators: the user agent token, the bridge components it advertises, inspectability,
 * and the path configuration. A session is created by the first view on its handle and
 * keeps its user agent for life, so these are read from here at mount and no two views
 * can disagree. One per app, as Hotwire Native's config is.
 */
export function HotwireProvider({
  applicationNameForUserAgent = defaultApplicationNameForUserAgent,
  bridgeComponents = [],
  webViewDebuggingEnabled = false,
  allowsInlineMediaPlayback = true,
  pathConfiguration,
  pathConfigurationUrl,
  children,
}: HotwireProviderProps) {
  useEffect(() => {
    if (pathConfiguration || pathConfigurationUrl) {
      loadPathConfiguration({ document: pathConfiguration, url: pathConfigurationUrl });
    }
  }, [pathConfiguration, pathConfigurationUrl]);

  const value = useMemo<HotwireConfig>(
    () => ({ applicationNameForUserAgent, bridgeComponents, webViewDebuggingEnabled, allowsInlineMediaPlayback }),
    [applicationNameForUserAgent, bridgeComponents, webViewDebuggingEnabled, allowsInlineMediaPlayback]
  );

  return <HotwireContext.Provider value={value}>{children}</HotwireContext.Provider>;
}

/** The provider's configuration. Throws outside a provider: a missing user agent token fails silently otherwise. */
export function useHotwireConfig(): HotwireConfig {
  const config = useContext(HotwireContext);
  if (!config) {
    throw new Error('react-native-hotwire: wrap the app in <HotwireProvider>');
  }
  return config;
}
