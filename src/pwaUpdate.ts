import { registerSW } from 'virtual:pwa-register'

// A home-screen "installed" PWA is usually resumed from a suspended
// background tab on mobile, not reloaded — so the browser's own service-
// worker update check (which only runs on a fresh registration/navigation)
// may never fire on its own. Ask explicitly whenever the app comes back to
// the foreground instead of waiting for that.
export function initPwaUpdate() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update()
      })
    },
  })

  // registerType: 'autoUpdate' has the new service worker skip waiting and
  // claim open clients as soon as it installs, but that only swaps which
  // worker answers future requests — the page already has the old bundle
  // loaded in memory. Reload once to actually pick up the new code. This
  // only fires once an update was found (via the visibility check above),
  // so in practice it lands right as the player reopens the app rather
  // than yanking the page out from under an active session.
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}
