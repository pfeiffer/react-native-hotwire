import { HeaderHeightContext } from '@react-navigation/elements';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentInsetsContext } from './ContentInsetsContext';
import type { WindowRect } from './useWindowRect';

/**
 * Hands the page the space the native chrome takes up, as CSS custom properties
 * on `<html>`: `--hotwire-inset-top`, `--hotwire-inset-right`,
 * `--hotwire-inset-bottom` and `--hotwire-inset-left`, siblings of the browser's
 * `env(safe-area-inset-*)`. A page composes them with its own bars, e.g.
 * `max(var(--main-navigation-height), var(--hotwire-inset-bottom))`.
 *
 * Native content insets can't do this job on their own: they shift scrollable
 * content, and what collides with the translucent iOS 26 bars is the
 * fixed-position content. Values are 0 wherever the chrome is opaque and
 * already occupies layout (Android, and iOS below 26), so pages don't need to
 * know which platform they're on.
 *
 * They cover floating chrome only. The software keyboard is not one of these:
 * it takes room away from the web view itself rather than floating over the
 * page, so the native view gives the covered part up in layout.
 *
 * The values come from the chrome itself where there is any (see
 * ContentInsetsContext); the web view's own safe area is the fallback for
 * screens that carry none. The page re-applies them after every Turbo render,
 * so they survive the renders that never reach `onLoad`.
 *
 * Returns the function to pass as `onLoad` (or call from it): a cold load starts
 * a new document, so the properties have to be written again, and it is the
 * first moment a script can reach the web view at all. Also returns the top
 * inset itself, for the one piece of native chrome that has to agree with the
 * page about it: the pull-to-refresh spinner.
 */
export function useContentInsets(ref: { current: { injectJavaScript(script: string): void } | null }, rect: WindowRect | null) {
  // Chrome publishes where it stops, in window coordinates; what this web view
  // gives up is however much of its own box falls outside those boundaries,
  // which is nothing when no bar is over it. Measuring the chrome here instead
  // only works on a screen that spans the window, which a pager page doesn't.
  const measured = useSafeAreaInsets();
  const boundaries = useContext(ContentInsetsContext);

  // The header is chrome no navigator publishes: UIKit folds a translucent bar
  // into the safe area, but react-native-safe-area-context on Android reports
  // system bars only, so a floating header there is invisible to it. How much of
  // it lands on this web view is the same subtraction as everything else: the
  // bar runs from the top of the screen, so whatever of it sits below this
  // view's own top overlaps it. That is 0 for a header that takes layout, which
  // is why this can be a maximum against the safe area rather than a sum and
  // needs no per-platform flag: adding them would double-count every opaque
  // header, and adding a floating one to the iOS safe area that already
  // includes it would double-count there too.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const headerOverlap = rect ? Math.max(0, headerHeight - rect.y) : 0;
  const { top, bottom } =
    boundaries && rect
      ? {
          top: Math.max(0, boundaries.top - rect.y),
          bottom: Math.max(0, rect.y + rect.height - boundaries.bottom),
        }
      : { top: Math.max(measured.top, headerOverlap), bottom: measured.bottom };
  // No chrome publishes horizontal boundaries; the safe area is all there is.
  const { left, right } = measured;
  const hasLoaded = useRef(false);

  const applyContentInsets = useCallback(() => {
    // The properties live on <html>. A page render replaces <body> and a frame
    // render its frame's children, both leaving them be; a morph reconciles
    // <html> itself and takes them with it, and a custom render may do the
    // same. So the page re-applies them after every render, from values kept
    // in one place so later injections just update them.
    ref.current?.injectJavaScript(`(function () {
      window.__hotwireInsets = { top: '${top}px', right: '${right}px', bottom: '${bottom}px', left: '${left}px' };

      var applyHotwireInsets = function () {
        var style = document.documentElement.style;
        var insets = window.__hotwireInsets;
        style.setProperty('--hotwire-inset-top', insets.top);
        style.setProperty('--hotwire-inset-right', insets.right);
        style.setProperty('--hotwire-inset-bottom', insets.bottom);
        style.setProperty('--hotwire-inset-left', insets.left);
      };

      applyHotwireInsets();

      if (!window.__hotwireInsetsListening) {
        window.__hotwireInsetsListening = true;
        ['turbo:render', 'turbo:morph'].forEach(
          function (event) { document.addEventListener(event, applyHotwireInsets); }
        );
      }
    })();`);
  }, [ref, top, right, bottom, left]);

  const applyContentInsetsOnLoad = useCallback(() => {
    hasLoaded.current = true;
    applyContentInsets();
  }, [applyContentInsets]);

  // Later changes to the insets, a rotation, say, still have to reach a page
  // that has already loaded.
  useEffect(() => {
    if (hasLoaded.current) {
      applyContentInsets();
    }
  }, [applyContentInsets]);

  return { applyContentInsets: applyContentInsetsOnLoad, topInset: top };
}
