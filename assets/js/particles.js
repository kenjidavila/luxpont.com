// Hero particle field — Canvas2D, no WebGL. Three landmarks alternate in
// the same hero, each with its own text alignment: Coliseo (particles
// right, text left), Metropolis (particles left, text right), Castillo
// (particles centered, covering almost the entire hero, text centered on
// top). Each matched point-by-point against its exact reference image
// (see particle-shapes.js header for the extraction method). Every
// extracted point renders, every frame, for whichever landmark is active
// — no thinning, no live-render budget. Rendering that many points with
// individual ctx.arc()+fill() calls (what earlier iterations of this file
// did) is too many draw calls for 60fps well before reaching the full
// count, so this writes directly into a pixel buffer (ImageData) each
// frame — one bounds-checked array write per particle — and blits the
// whole buffer with a single putImageData() call. That's what makes full
// density affordable at 60fps.
//
// Layout: on wide screens the field covers a region of the hero, edge to
// edge, from the bottom of the nav pill down to the bottom of the
// viewport — a "cover" fit (like CSS background-size:cover) against the
// real .hero-content DOM rect (or, for the centered landmark, against the
// full hero width), not a fixed image aspect ratio. .hero-content itself
// is what physically moves — a slow CSS `left` transition toggled by an
// align class (.mirrored / .centered / neither) — and this file
// re-measures its live position every single frame while it's mid-move
// (not the whole time — see the TRANSITION_WINDOW note below) so the
// particle field's cover region continuously tracks the text instead of
// jumping to a final value. That continuous coupling is what makes the
// landmark swap read as one organic motion instead of a cut: text and
// particles move together. On narrow screens there's no room for a side
// split, so it falls back to centered, behind (centered) text, for all
// three landmarks alike.
//
// One continuous cycle per landmark: build (particles fly in from the
// nearest bottom corner/center and assemble), hold (steady), fade (each
// particle detaches on its own stagger and drifts slowly downward as it
// dims, like dust settling, inviting a scroll) — then the next landmark
// takes over the same way.
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !window.LUXPONT_SHAPES || !window.LUXPONT_SHAPES.length) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const navEl = document.getElementById('nav');
  const heroContentEl = document.querySelector('.hero-content');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Coliseo builds on the right (text stays left); Metropolis mirrors to
  // the left (text slides right); Castillo builds centered, covering
  // almost the entire hero (text moves to the middle). Anything not
  // listed defaults to 'normal' (right side, non-mirrored).
  const ALIGN = { metropolis: 'mirrored', castillo: 'centered' };

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

  function buildShapeState(shapeData, seed) {
    const points = shapeData.points;
    const colors = shapeData.colors;
    const totalPts = points.length / 2;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i], y = points[i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    const depth = new Float32Array(totalPts);
    const phase = new Float32Array(totalPts);
    const speed = new Float32Array(totalPts);
    const wobble = new Float32Array(totalPts);
    const size = new Float32Array(totalPts);
    const isGlow = new Uint8Array(totalPts);
    const buildDelay = new Float32Array(totalPts);
    const fallDelay = new Float32Array(totalPts);
    const twinkle = new Float32Array(totalPts);
    const rand = mulberry32(seed);
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
    const order = new Uint32Array(totalPts);
    for (let i = 0; i < totalPts; i++) order[i] = i;
    Array.prototype.sort.call(order, (a, b) => depth[a] - depth[b]);

    return {
      name: shapeData.name, points, colors, totalPts, order,
      shapeCx: (minX + maxX) / 2, shapeCy: (minY + maxY) / 2,
      xSpan: maxX - minX, ySpan: maxY - minY,
      align: ALIGN[shapeData.name] || 'normal',
      depth, phase, speed, wobble, size, isGlow, buildDelay, fallDelay, twinkle,
    };
  }

  const shapeStates = window.LUXPONT_SHAPES.map((s, idx) => buildShapeState(s, 101 + idx * 37));

  function computeLayout(width, height, shape) {
    const small = width < 760;
    if (small) {
      const s = Math.min(width, height) * 0.42;
      return {
        cx: width * 0.5 - shape.shapeCx * s,
        cy: height * 0.56 - shape.shapeCy * s,
        scale: s,
      };
    }
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 90;
    const rect = heroContentEl ? heroContentEl.getBoundingClientRect() : null;
    let left, right;
    if (shape.align === 'mirrored') {
      // particles cover the left side, up to the text block's live edge
      left = 0;
      right = rect ? Math.max(1, rect.left - 24) : width * 0.3;
    } else if (shape.align === 'centered') {
      // covers almost the entire hero — text sits centered on top of it,
      // not beside it, so the region isn't carved around the text rect.
      left = 24;
      right = width - 24;
    } else {
      left = rect ? Math.min(rect.right + 24, width * 0.7) : width * 0.42;
      right = width;
    }
    const top = navBottom + 16;
    const rectW = Math.max(1, right - left);
    // Bottom margin so the shape's bounding box doesn't sit flush against
    // the very edge of the viewport — the source scenes aren't evenly
    // dense along that edge (sparse drifting dust on one side, solid
    // stonework on the other), so a zero-margin crop reads as an uneven,
    // tilted ground line.
    const rectH = Math.max(1, height - top - 44);
    const scale = Math.max(rectW / shape.xSpan, rectH / shape.ySpan);
    return {
      cx: left + rectW / 2 - shape.shapeCx * scale,
      cy: top + rectH / 2 - shape.shapeCy * scale,
      scale,
    };
  }

  const BUILD = 4.2;  // seconds to fly in from the corner and assemble
  const HOLD = 4.4;   // seconds fully formed
  const FADE = 5.8;   // seconds — slow: each particle detaches on its own
                       // stagger and drifts down as it fades, not a flat dim
  const PER_SHAPE = BUILD + HOLD + FADE;
  const TOTAL = PER_SHAPE * shapeStates.length;

  let width = 0, height = 0, dpr = 1;
  let imgData = null;
  let buf = null;
  let dw = 0, dh = 0;
  let lastShapeIdx = -1;
  let cachedLayout = { cx: 0, cy: 0, scale: 1 };
  let transitionEndsAt = -Infinity;
  let needsLayoutRefresh = true; // forces one fresh measurement on first frame and after resize
  // .hero-content is stationary for ~92% of each shape's time on screen —
  // it only physically moves for the ~1.8s CSS transition right after a
  // switch. Querying getBoundingClientRect() (forces a layout read) every
  // single frame regardless was measured to cause real, compounding frame-
  // time growth over a running page; only re-querying while a slide is
  // actually in flight removes that cost for the steady-state 92%.
  const TRANSITION_WINDOW = 1.9;

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
    needsLayoutRefresh = true;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw(time) {
    // time can start marginally negative (a headless/first-frame timestamp
    // quirk where rAF's `now` lands a hair before `start`); JS's `%` keeps
    // the sign of the dividend, so an unclamped negative time would floor
    // to a negative phase and break the build math. Clamp at zero.
    const localT = Math.max(0, time) % TOTAL;
    const shapeIdx = Math.min(shapeStates.length - 1, Math.floor(localT / PER_SHAPE));
    const shape = shapeStates[shapeIdx];
    const t = localT - shapeIdx * PER_SHAPE;

    if (shapeIdx !== lastShapeIdx) {
      lastShapeIdx = shapeIdx;
      if (heroContentEl) {
        heroContentEl.classList.toggle('mirrored', shape.align === 'mirrored');
        heroContentEl.classList.toggle('centered', shape.align === 'centered');
      }
      transitionEndsAt = time + TRANSITION_WINDOW;
    }

    let phaseName, phaseLocal;
    if (t < BUILD) { phaseName = 'build'; phaseLocal = t / BUILD; }
    else if (t < BUILD + HOLD) { phaseName = 'hold'; phaseLocal = 1; }
    else { phaseName = 'fade'; phaseLocal = (t - BUILD - HOLD) / FADE; }

    // Re-measured only while .hero-content is actually mid-slide, so the
    // particle field's cover region tracks it continuously during the
    // transition; the rest of the cycle reuses the last measurement since
    // the text isn't moving.
    if (time < transitionEndsAt || needsLayoutRefresh) {
      cachedLayout = computeLayout(width, height, shape);
      needsLayoutRefresh = false;
    }
    const { cx, cy, scale } = cachedLayout;
    // Each landmark's particles originate from whichever bottom point is
    // nearest its own build region: the left corner for the mirrored
    // (left-side) landmark, bottom-center for the centered/full-bleed one
    // (symmetric convergence suits a shape spanning the whole width), the
    // right corner otherwise.
    const cornerX = shape.align === 'mirrored' ? width * -0.02
      : shape.align === 'centered' ? width * 0.5
      : width * 1.02;
    const cornerY = height * 1.04;

    const { points, colors, order, totalPts } = shape;
    const { depth, phase, speed, wobble, size, isGlow, buildDelay, fallDelay, twinkle } = shape;

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
    draw(BUILD + HOLD * 0.5); // static frame: first landmark, fully assembled
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
