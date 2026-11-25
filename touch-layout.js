// How a touch screen is laid out (client.js), as a pure function so the rules can be tested.
//
// Upright phone (touch, clearly taller than wide): the court at the top, under it the menu buttons stacked ('menu') or,
// in a match, the thumb pad ('play'). On its side: the icon column beside the court and the whole screen is the pad.
//
// The app (<html data-orientation="landscape">, scripts/build-portal.mjs app) is landscape only: the OS keeps it on its
// side, so it never uses the upright pad or menu, always shows the TOUCH SPEED button and the sideways first-play guide.
// If its window is ever taller than wide anyway (Android 16 ignores the lock on large screens; the first frame before
// the turn), it still draws the landscape layout, scaled to the width. The website and the other portals have no
// data-orientation and keep both ways exactly as before.
export function landscapeOnly(dataset) {
  return dataset?.orientation === 'landscape';
}

export function touchLayout({ coarse, width, height, mode, landscapeOnly: locked = false }) {
  const playing = mode === 'solo' || mode === 'online';
  const upright = !locked && coarse && height > width * 1.05;
  return {
    upright,
    // The icon column has the TOUCH SPEED button (the upright layout shows the bar itself).
    landscape: locked || (coarse && width > height),
    view: upright && mode === 'menu' ? 'menu' : upright && playing ? 'play' : '',
    // The first-play guide is about the whole screen being the pad, so only for phones on their side.
    sideGuide: locked || (coarse && !upright)
  };
}
