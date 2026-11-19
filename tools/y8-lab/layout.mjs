import { launch, sleep } from './lib.mjs';
const sizes = [[740, 390], [480, 270], [1280, 720], [1920, 1080], [375, 667], [667, 375], [320, 480], [1000, 400], [600, 600]];
const browser = await launch();
for (const build of ['ready', 'new']) for (const [w, h] of sizes) {
  const page = await browser.newPage();
  await page.setViewport({ width: w + 40, height: h + 80 });
  await page.goto(`http://127.0.0.1:8770/index.html?v=${build}&w=${w}&h=${h}`);
  let frame; for (let i = 0; i < 50 && !frame; i++) { frame = page.frames().find(f => f.url().includes(`/${build}/index.html`)); await sleep(100); }
  await frame.waitForSelector('#menu'); await sleep(800);
  const r = await frame.evaluate(build => {
    const stage = document.querySelector('#stage');
    stage.dataset.phase = 'finished';
    document.querySelector('#menu').hidden = true;
    const ids = build === 'ready' ? ['#game-control'] : ['#play-again', '#to-menu'];
    if (build === 'new') document.querySelector('#result-actions').hidden = false; else document.querySelector('#game-control').hidden = false;
    return ids.map(id => { const b = document.querySelector(id).getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      const inside = b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
      return `${id} ${Math.round(b.width)}x${Math.round(b.height)} at ${Math.round(b.x)},${Math.round(b.y)} ${inside ? 'in view' : 'CUT OFF'} top=${top?.closest('button')?.id || top?.id || top?.tagName}`; }).join(' | ');
  }, build);
  console.log(build, `${w}x${h}`, r);
  await page.close();
}
await browser.close();
