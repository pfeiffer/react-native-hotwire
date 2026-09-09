import { requireNativeModule } from 'expo-modules-core';

import type { EventSubscription, PathProperties } from './types';

/** One rule of a Hotwire path configuration: regex patterns and the properties they set. */
export interface PathRule {
  patterns: string[];
  properties: PathProperties;
}

/**
 * Hotwire's path configuration document. `settings` is the app's own sandbox and
 * `rules` are applied in order, later rules overwriting earlier properties, so the first
 * rule usually matches everything and sets the defaults.
 */
export interface PathConfigurationDocument {
  settings?: Record<string, unknown>;
  rules: PathRule[];
}

interface HotwireModule {
  loadPathConfiguration(document: PathConfigurationDocument | null, url: string | null): Promise<void>;
  getPathConfigurationSettings(): Promise<Record<string, unknown>>;
  getPathProperties(url: string): Promise<PathProperties>;
  addListener(event: 'onPathConfigurationUpdate', listener: (event: { settings: Record<string, unknown> }) => void): EventSubscription;
}

const Hotwire = requireNativeModule<HotwireModule>('Hotwire');

/**
 * Loads the path configuration the sessions match visits against. `document` is the
 * bundled copy, available at once; `url` is the server copy, loaded afterwards and cached
 * on disk for the next launch, where it takes precedence over the bundled one. Every
 * proposal from then on carries the matched `properties`.
 */
export function loadPathConfiguration(options: { document?: PathConfigurationDocument; url?: string }): Promise<void> {
  return Hotwire.loadPathConfiguration(options.document ?? null, options.url ?? null);
}

/** The `settings` of the configuration loaded last, `{}` before any load. */
export function getPathConfigurationSettings(): Promise<Record<string, unknown>> {
  return Hotwire.getPathConfigurationSettings();
}

// The Android core reports its enum-valued properties upper case (`POP`, `DEFAULT`), iOS
// lower case as written in the document. Apps read one spelling.
const ENUM_PROPERTIES = ['context', 'presentation', 'modal_style', 'query_string_presentation'];

export function normalizeProperties(properties: PathProperties | undefined): PathProperties {
  const normalized: PathProperties = { ...properties };
  for (const key of ENUM_PROPERTIES) {
    const value = normalized[key];
    if (typeof value === 'string') {
      normalized[key] = value.toLowerCase();
    }
  }
  return normalized;
}

/**
 * The properties the loaded configuration gives `url`, what a proposal for it would
 * carry. For the URLs that never become proposals: a screen placed by hand, a deep link.
 */
export async function getPathProperties(url: string): Promise<PathProperties> {
  return normalizeProperties(await Hotwire.getPathProperties(url));
}

/** Called with the new `settings` each time a configuration loads: bundled, cached or remote. */
export function addPathConfigurationListener(
  listener: (settings: Record<string, unknown>) => void
): EventSubscription {
  return Hotwire.addListener('onPathConfigurationUpdate', ({ settings }) => listener(settings));
}
