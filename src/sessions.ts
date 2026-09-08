import { requireNativeModule } from 'expo-modules-core';

interface HotwiredModule {
  getSessionHandles(): Promise<string[]>;
  reloadSession(sessionHandle: string): Promise<void>;
  refreshSession(sessionHandle: string): Promise<void>;
  clearSessionSnapshotCache(sessionHandle: string): Promise<void>;
}

const Hotwired = requireNativeModule<HotwiredModule>('Hotwired');

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
