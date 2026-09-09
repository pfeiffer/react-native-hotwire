import { requireNativeModule } from 'expo-modules-core';

interface HotwiredModule {
  getSessionHandles(): Promise<string[]>;
  reloadSession(sessionHandle: string): Promise<void>;
  refreshSession(sessionHandle: string): Promise<void>;
  clearSessionSnapshotCache(sessionHandle: string): Promise<void>;
  discardProposedVisit(url: string): Promise<void>;
}

const Hotwired = requireNativeModule<HotwiredModule>('Hotwire');

/** Handles of every session created so far, one per shared web view. */
export function getSessionHandles(): Promise<string[]> {
  return Hotwired.getSessionHandles();
}

/** Cold-boots the session's current page (full reload). */
export function reloadSession(sessionHandle: string): Promise<void> {
  return Hotwired.reloadSession(sessionHandle);
}

/** Refreshes the session's current page through Turbo (keeps scroll position and the web view). */
export function refreshSession(sessionHandle: string): Promise<void> {
  return Hotwired.refreshSession(sessionHandle);
}

export function clearSessionSnapshotCache(sessionHandle: string): Promise<void> {
  return Hotwired.clearSessionSnapshotCache(sessionHandle);
}

/** Tells native the app dropped a proposal, so the options it carried are not kept for a later visit. */
export function discardProposedVisit(url: string): Promise<void> {
  return Hotwired.discardProposedVisit(url);
}
