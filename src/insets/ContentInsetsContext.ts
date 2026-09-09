import { createContext } from 'react';

export type ContentBoundaries = {
  /** Window Y below which chrome no longer covers the page. */
  top: number;
  /** Window Y above which chrome no longer covers the page. */
  bottom: number;
};

/**
 * Where the native chrome stops, in window coordinates, published by the chrome
 * itself rather than measured at the web view.
 *
 * Boundaries rather than insets, because how much a page has to give up depends
 * on where its web view sits: a screen that stops short of the tab bar has
 * nothing over it and needs no inset at all, while a full-height one does. Only
 * the web view knows its own box, so the chrome publishes the edges and each
 * web view subtracts (see useContentInsets); a bar that collapses would
 * otherwise change a shared inset mid-scroll and reflow every page under the
 * animation.
 *
 * Each layer narrows what it received: a tab screen contributes the navigation
 * and tab bars (see PublishContentInsets), a top-tabs navigator moves the top
 * boundary down by its own bar. Undefined where no chrome has published, and the
 * web view falls back to its own safe area, which is already position-aware,
 * since a provider that stops short of an edge reports no inset for it.
 */
export const ContentInsetsContext = createContext<ContentBoundaries | undefined>(undefined);
