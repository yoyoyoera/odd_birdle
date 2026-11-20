// Browser full screen for the game (main site only): one element fills the screen, and the same button leaves it.
// Safari still uses the webkit-prefixed names; iPhones have neither, so the button stays hidden there.
export const fullscreenSupported = (doc = document) =>
  Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
  Boolean(doc.documentElement?.requestFullscreen || doc.documentElement?.webkitRequestFullscreen);

export const fullscreenElement = (doc = document) => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

// Resolves to whether the page is full screen afterwards. A refused request (the browser said no) leaves it as it was.
export async function toggleFullscreen(element, doc = document) {
  try {
    if (fullscreenElement(doc)) await (doc.exitFullscreen ?? doc.webkitExitFullscreen).call(doc);
    else await (element.requestFullscreen ?? element.webkitRequestFullscreen).call(element);
  } catch {
    // Refused or interrupted: nothing to do, the button state follows the real fullscreenchange events.
  }
  return Boolean(fullscreenElement(doc));
}
