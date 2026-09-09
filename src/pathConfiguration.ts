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

/** Called with the new `settings` each time a configuration loads: bundled, cached or remote. */
export function addPathConfigurationListener(
  listener: (settings: Record<string, unknown>) => void
): EventSubscription {
  return Hotwire.addListener('onPathConfigurationUpdate', ({ settings }) => listener(settings));
}
