// Job references belong to one browser tab, not the whole browser profile.
export const MINI_JOB_KEY = 'pendingMiniQuizJob';
export const MAPPER_JOB_KEY = 'pastpaperpal-mapper-job-v1';
const TAB_KEY = 'pastpaperpal-job-tab';

export const jobSession = {
  getItem(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* Generation can still finish without refresh recovery. */ }
  },
  removeItem(key: string) {
    try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  },
};

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A duplicated tab inherits sessionStorage. A live owner keeps its job references;
 * the duplicate clears only its own copies. The browser releases locks on unload.
 */
export async function claimJobTab(store: SessionStore, locks: LockManager | undefined): Promise<void> {
  const id = store.getItem(TAB_KEY) || crypto.randomUUID();
  store.setItem(TAB_KEY, id);
  if (!locks) return; // Per-tab storage still works where Web Locks are unavailable.
  await new Promise<void>(resolve => {
    void locks.request(`pastpaperpal-jobs:${id}`, { ifAvailable: true }, async lock => {
      if (!lock) {
        store.removeItem(MINI_JOB_KEY);
        store.removeItem(MAPPER_JOB_KEY);
        store.setItem(TAB_KEY, crypto.randomUUID());
        await claimJobTab(store, locks);
        resolve();
        return;
      }
      resolve();
      // Keep ownership for this document's lifetime, including route changes.
      await new Promise<void>(() => {});
    }).catch(() => resolve());
  });
}

let ready: Promise<void> | undefined;
export function initializeJobSession(): Promise<void> {
  return ready ??= claimJobTab(jobSession, typeof navigator !== 'undefined' ? navigator.locks : undefined);
}
