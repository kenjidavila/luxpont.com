// Hero particle field — Canvas2D, no WebGL. One landmark only: the
// Coliseo, matched point-by-point against the exact reference image
// "Coliseo en particulas.png" (see particle-shapes.js header for the
// extraction method) — nothing cropped out of that reference, and every
// particle carries the real RGB sampled from its source pixel.
//
// Every one of the ~188k extracted points renders, every frame — no
// thinning, no live-render budget, no separate "full detail" render path
// for a resting state. Rendering that many points with individual
// ctx.arc()+fill() calls (what earlier iterations of this file did) is
// too many draw calls for 60fps well before reaching the full count, so
// this writes directly into a pixel buffer (ImageData) each frame — one
// bounds-checked array write per particle — and blits the whole buffer
// with a single putImageData() call. That's what makes full density
// affordable at 60fps, and it's also why build/hold/fade can all read
// from the exact same point set: there's no "thin it for the animated
// phases, use everything for the static one" split left to cause a seam.
//
// Layout: on wide screens the field fully covers the right side of the
// hero, edge to edge, from the bottom of the nav pill down to the bottom
// of the viewport — a "cover" fit (like CSS background-size:cover)
// against the real nav/.hero-content DOM rects, not a fixed image aspect
// ratio, so it stays full-bleed at any viewport size instead of
// letterboxing. On narrow screens it falls back to centered, behind the
// (centered) text.
//
// One continuous cycle: build (particles fly in and assemble), hold
// (steady), fade (each particle detaches on its own stagger and drifts
// slowly downward as it dims, like dust settling, inviting a scroll) are
// three windows of the same position/opacity curve over the same array.
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !window.LUXPONT_SHAPES) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const shapeData = window.LUXPONT_SHAPES[0];
  if (!shapeData) return;

  const navEl = document.getElementById('nav');
  const heroContentEl = document.querySelector('.hero-content');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(seed) {
    let s = seed;
    return function () {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); }

  const totalPts = shapeData.points.length / 2;
  const points = shapeData.points;
  const colors = shapeData.colors;

  // Real extent of the point cloud in its own normalized units (computed
  // once from the actual data instead of assumed, so this keeps working
  // if the extraction ever changes).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const shapeCx = (minX + maxX) / 2;
  const shapeCy = (minY + maxY) / 2;
  const xSpan = maxX - minX;
  const ySpan = maxY - minY;

  function computeLayout(width, height) {
    const small = width < 760;
    if (small) {
      return {
        cx: width * 0.5 - shapeCx * (Math.min(width, height) * 0.42),
        cy: height * 0.56 - shapeCy * (Math.min(width, height) * 0.42),
        scale: Math.min(width, height) * 0.42,
      };
    }
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 90;
    const contentRight = heroContentEl ? heroContentEl.getBoundingClientRect().right : width * 0.42;
    const left = Math.min(contentRight + 24, width * 0.7);
    const top = navBottom + 16;
    const rectW = Math.max(1, width - left);
    const rectH = Math.max(1, height - top);
    // "cover" fit: scale so the shape fills the whole target rect on
    // both axes (cropping whichever axis overflows), instead of
    // "contain" fit, which would letterbox to preserve the source
    // image's own aspect ratio.
    const scale = Math.max(rectW / xSpan, rectH / ySpan);
    return {
      cx: left + rectW / 2 - shapeCx * scale,
      cy: top + rectH / 2 - shapeCy * scale,
      scale,
    };
  }

  // Per-point static properties, precomputed once for the full ~188k-point
  // set (typed arrays, not one JS object per particle — keeps this cheap
  // in both memory and per-frame iteration cost).
  const depth = new Float32Array(totalPts);
  const phase = new Float32Array(totalPts);
  const speed = new Float32Array(totalPts);
  const wobble = new Float32Array(totalPts);
  const size = new Float32Array(totalPts);
  const isGlow = new Uint8Array(totalPts);
  const buildDelay = new Float32Array(totalPts);
  const fallDelay = new Float32Array(totalPts);
  const twinkle = new Float32Array(totalPts);
  {
    const rand = mulberry32(101);
    for (let i = 0; i < totalPts; i++) {
      const r = colors[i * 3], g = colors[i * 3 + 1], b = colors[i * 3 + 2];
      const d = rand();
      depth[i] = d;
      phase[i] = rand() * Math.PI * 2;
      speed[i] = 0.12 + rand() * 0.3;
      wobble[i] = 0.01 + rand() * 0.026;
      size[i] = (0.75 + rand() * 1.6) * (0.6 + d * 0.7);
      isGlow[i] = (r > 232 && g > 220 && b > 195 && rand() < 0.35) ? 1 : 0;
      buildDelay[i] = rand() * 0.6;
      fallDelay[i] = rand() * 0.55;
      twinkle[i] = rand() * Math.PI * 2;
    }
  }
  // Depth-sorted paint order once, so writing pixels in this order gives
  // back-to-front layering "for free" (a later write at the same pixel
  // simply wins, which is correct front-to-back precedence here).
  const order = new Uint32Array(totalPts);
  for (let i = 0; i < totalPts; i++) order[i] = i;
  Array.prototype.sort.call(order, (a, b) => depth[a] - depth[b]);

  const BUILD = 4.2;  // seconds to fly in from the corner and assemble
  const HOLD = 4.4;   // seconds fully formed
  const FADE = 5.8;   // seconds — slow: each particle detaches on its own
                       // stagger and drifts down as it fades, not a flat dim
  const TOTAL = BUILD + HOLD + FADE;

  let width = 0, height = 0, dpr = 1;
  let currentLayout = { cx: 0, cy: 0, scale: 1 };
  let imgData = null;
  let buf = null;
  let dw = 0, dh = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    dw = Math.max(1, Math.round(width * dpr));
    dh = Math.max(1, Math.round(height * dpr));
    canvas.width = dw;
    canvas.height = dh;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    imgData = ctx.createImageData(dw, dh);
    buf = imgData.data;
    currentLayout = computeLayout(width, height);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw(time) {
    // time can start marginally negative (a headless/first-frame timestamp
    // quirk where rAF's `now` lands a hair before `start`); JS's `%` keeps
    // the sign of the dividend, so an unclamped negative time would floor
    // to a negative phase and break the build math. Clamp at zero.
    const localT = Math.max(0, time) % TOTAL;

    let phaseName, phaseLocal;
    if (localT < BUILD) { phaseName = 'build'; phaseLocal = localT / BUILD; }
    else if (localT < BUILD + HOLD) { phaseName = 'hold'; phaseLocal = 1; }
    else { phaseName = 'fade'; phaseLocal = (localT - BUILD - HOLD) / FADE; }

    const { cx, cy, scale } = currentLayout;
    const cornerX = width * 1.02;
    const cornerY = height * 1.04;

    buf.fill(255); // reset the whole buffer to opaque white

    for (let k = 0; k < totalPts; k++) {
      const i = order[k];
      const tScreenX = cx + points[i * 2] * scale;
      const tScreenY = cy + points[i * 2 + 1] * scale;

      let buildBlend = 1;
      if (phaseName === 'build') {
        const bd = buildDelay[i];
        const staggered = Math.max(0, Math.min(1, (phaseLocal - bd) / (1 - bd)));
        buildBlend = smooth(staggered * 2.1);
      }

      let x = lerp(cornerX, tScreenX, buildBlend);
      let y = lerp(cornerY, tScreenY, buildBlend);

      const ph = phase[i] + time * speed[i];
      const wob = wobble[i] * (0.4 + 0.6 * (1 - buildBlend)) * scale * 0.15;
      x += Math.sin(ph) * wob;
      y += Math.cos(ph * 1.17) * wob;

      let opacity = Math.min(1, buildBlend * 3); // soft pop-in as each particle starts moving

      if (phaseName === 'fade') {
        // each particle detaches on its own stagger, then drifts slowly
        // down and out as it dims — not a uniform fade in place.
        const fd = fallDelay[i];
        const fallLocal = Math.max(0, Math.min(1, (phaseLocal - fd) / (1 - fd)));
        y += fallLocal * fallLocal * height * 0.55;
        opacity *= 1 - smooth(fallLocal);
      }
      if (opacity <= 0.02) continue;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const px = (x * dpr) | 0;
      const py = (y * dpr) | 0;
      if (px < 0 || px >= dw || py < 0 || py >= dh) continue;

      let r = colors[i * 3], g = colors[i * 3 + 1], b = colors[i * 3 + 2];
      if (isGlow[i]) {
        const bright = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(time * 2.2 + twinkle[i]);
        const boost = bright * 0.6;
        r = r + (255 - r) * boost;
        g = g + (255 - g) * boost;
        b = b + (255 - b) * boost;
      }
      // blend toward the white background by (1 - opacity) — direct pixel
      // writes don't get automatic alpha compositing, so the fade has to
      // be baked into the written colour itself.
      const fr = 255 + (r - 255) * opacity;
      const fg = 255 + (g - 255) * opacity;
      const fb = 255 + (b - 255) * opacity;

      const rad = size[i] > 1.8 ? 1 : 0; // most points are a single device
                                          // pixel; only the largest few get
                                          // a 3x3 stamp
      const x0 = Math.max(0, px - rad), x1 = Math.min(dw - 1, px + rad);
      const y0 = Math.max(0, py - rad), y1 = Math.min(dh - 1, py + rad);
      for (let yy = y0; yy <= y1; yy++) {
        let o = (yy * dw + x0) * 4;
        for (let xx = x0; xx <= x1; xx++) {
          buf[o] = fr; buf[o + 1] = fg; buf[o + 2] = fb; buf[o + 3] = 255;
          o += 4;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  if (reduceMotion) {
    draw(BUILD + HOLD * 0.5); // static frame: fully assembled
    return;
  }

  let raf = 0;
  const start = performance.now();
  function frame(now) {
    draw((now - start) / 1000);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(frame);
  });
})();
