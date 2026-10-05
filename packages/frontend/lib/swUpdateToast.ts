/**
 * Decision helper for the "A new version is available" service-worker toast.
 *
 * next.config.js uses skipWaiting + clientsClaim, so on a first install (fresh profile, cleared
 * site data, redundant worker) the new worker takes control and fires `controllerchange` even
 * though there is no older version to update from. That must not show the toast. The toast is
 * only for a page that already had a controller, and at most once per page load.
 */
export function shouldShowSwUpdateToast(opts: {
  hadController: boolean;
  alreadyNotified: boolean;
}): boolean {
  return opts.hadController && !opts.alreadyNotified;
}
