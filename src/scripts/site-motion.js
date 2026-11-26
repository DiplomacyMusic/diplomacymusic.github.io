// The depth engine for the main site. One loop, no scroll hijacking.
//
// Mark an element with data-depth and it rides the scroll at its own
// speed: positive depth sits nearer the camera and moves faster,
// negative depth sits farther back and lags. The page scrolls natively;
// the layers ease after it, which is where the sense of space comes from.
//
//   data-depth="0.3"            vertical travel, nearer than the page
//   data-depth="-0.2"           farther than the page
//   data-axis="x"               travel sideways instead
//   data-rush="6"               sideways travel speeds up the farther it is from
//                               the middle of the screen: slow at rest, racing as it leaves
//   data-spin="12"              degrees of turn across one screen of scroll
//   data-pointer="0.5"          also leans toward the pointer
//   data-depth-cols="a,b,c,d"   on a grid: each column gets its own depth
//   data-words                  words light up as the block crosses the screen

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function startMotion() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    document.querySelectorAll('[data-words] .w').forEach((w) => w.classList.add('lit'));
    return;
  }

  const items = [];

  const add = (el, extra = {}) => {
    items.push({
      el,
      depth: parseFloat(el.dataset.depth || '0'),
      axis: el.dataset.axis || 'y',
      spin: parseFloat(el.dataset.spin || '0'),
      rush: parseFloat(el.dataset.rush || '0'),
      pointer: parseFloat(el.dataset.pointer || '0'),
      tx: 0,
      ty: 0,
      visible: false,
      ...extra,
    });
  };

  document.querySelectorAll('[data-depth]').forEach((el) => add(el));

  // grids hand a depth to each column, so neighbours slide past each other
  document.querySelectorAll('[data-depth-cols]').forEach((grid) => {
    const depths = grid.dataset.depthCols.split(',').map(Number);
    [...grid.children].forEach((el) => add(el, { grid, depths }));
  });

  const wordBlocks = [...document.querySelectorAll('[data-words]')].map((el) => ({
    el,
    words: [...el.querySelectorAll('.w')],
    lit: -1,
  }));

  const byEl = new Map(items.map((item) => [item.el, item]));
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = byEl.get(entry.target);
        if (item) item.visible = entry.isIntersecting;
      }
    },
    { rootMargin: '30% 0px 30% 0px' }
  );
  items.forEach((item) => watcher.observe(item.el));

  let smooth = window.scrollY;
  let px = 0;
  let py = 0;
  let pxTarget = 0;
  let pyTarget = 0;

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pxTarget = (event.clientX / window.innerWidth) * 2 - 1;
      pyTarget = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );

  const frame = () => {
    const vh = window.innerHeight;
    const wide = window.innerWidth > 720;
    const reach = vh * 0.6;
    smooth += (window.scrollY - smooth) * 0.12;
    const lag = window.scrollY - smooth;
    px += (pxTarget - px) * 0.06;
    py += (pyTarget - py) * 0.06;

    // read everything first, then write, so the browser lays out once
    const writes = [];
    for (const item of items) {
      if (!item.visible) continue;
      const rect = item.el.getBoundingClientRect();
      if (rect.width === 0) continue;
      const mid = rect.top - item.ty + rect.height / 2 + lag;
      const delta = clamp((mid - vh / 2) / vh, -1.5, 1.5);

      let depth = item.depth;
      if (item.grid) {
        if (!wide) {
          depth = 0;
        } else {
          const gridLeft = item.grid.getBoundingClientRect().left;
          const col = Math.round((rect.left - item.tx - gridLeft) / (rect.width * 1.05));
          depth = item.depths[Math.abs(col) % item.depths.length];
        }
      }

      let tx = 0;
      let ty = 0;
      if (item.axis === 'x') {
        // with rush, the pull grows with the cube of the distance from centre.
        // It is held inside the line's own length, so the line can race but
        // never run off its rail (and never drop out of this loop).
        tx = delta * (1 + item.rush * delta * delta) * depth * reach;
        if (item.rush) {
          const rail = item.el.parentElement;
          // a third of the line each way: the rest is slack for a finger pulling it
          const room = Math.max(0, item.el.offsetWidth / 3 - (rail ? rail.clientWidth : 0) / 2 - 40);
          tx = clamp(tx, -room, room);
        }
      }
      else ty = delta * depth * reach;
      if (item.pointer) {
        tx += px * item.pointer * 28;
        ty += py * item.pointer * 18;
      }
      writes.push([item, tx, ty, delta * item.spin]);
    }

    for (const [item, tx, ty, turn] of writes) {
      item.tx = tx;
      item.ty = ty;
      item.el.style.transform =
        `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)` +
        (turn ? ` rotate(${turn.toFixed(2)}deg)` : '');
    }

    for (const block of wordBlocks) {
      const rect = block.el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) continue;
      const progress = clamp((vh * 0.88 - rect.top) / (vh * 0.5), 0, 1);
      const lit = Math.round(progress * block.words.length);
      if (lit !== block.lit) {
        block.lit = lit;
        block.words.forEach((w, i) => w.classList.toggle('lit', i < lit));
      }
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
