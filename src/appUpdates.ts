export const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function watchForAppUpdates(registration: ServiceWorkerRegistration) {
  let checking = false;
  let stopped = false;

  async function check() {
    if (stopped || checking || !navigator.onLine || document.visibilityState === 'hidden'
      || registration.installing) return;
    checking = true;
    try {
      await registration.update();
    } catch {
      // A failed connection leaves the current offline-capable app in place.
    } finally {
      checking = false;
    }
  }

  const interval = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  void check();

  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener('focus', check);
    window.removeEventListener('online', check);
    window.removeEventListener('pageshow', check);
    document.removeEventListener('visibilitychange', check);
  };
}
