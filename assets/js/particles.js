// Hero particle field — Canvas2D, no WebGL. Architecture ported from
// @elise/particles (packages/particles/src/{field,particle-nucleus}.ts in
// elise-web): pure canvas 2D, additive ("lighter") glow blending on the
// brightest highlight particles. One landmark only: the Coliseo, matched
// point-by-point against the exact reference image "Coliseo en
// particulas.png" (see particle-shapes.js header for the extraction
// method) — nothing cropped out of that reference, and every particle
// carries the real RGB sampled from its source pixel.
//
// Layout: on wide screens the field fully covers the right side of the
// hero, edge to edge, from the bottom of the nav pill down to the bottom
// of the viewport — a "cover" fit (like CSS background-size:cover)
// against the real nav/.hero-content DOM rects, not a fixed image aspect
// ratio, so it stays full-bleed at any viewport size instead of
// letterboxing. On narrow screens it falls back to centered, behind the
// (centered) text.
//
// One continuous cycle, one particle set throughout — deliberately not
// three separate visual states. Build (particles fly in and assemble),
// hold (steady), and fade (particles detach and drift slowly downward,
// like dust settling, inviting a scroll) are just three windows of the
// same smooth position/opacity curve applied to the same array every
// frame, so there is no cut, swap, or density jump between them.
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

  // Real extent of the point cloud in its own normalized units (computed
  // once from the actual data instead of assumed, so this keeps working
  // if the extraction ever changes).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < shapeData.points.length; i += 2) {
    const x = shapeData.points[i], y = shapeData.points[i + 1];
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

  function paintDot(x, y, size, r, gr, bl, opacity, isGlow, bright) {
    // Radius deliberately small relative to the average spacing between
    // neighbouring points: at the density this cloud renders at, dots
    // sized to touch/overlap their neighbours merge into a smooth,
    // photographic wash — indistinguishable from just showing the source
    // image. Keeping every dot visibly separate (small radius, high
    // opacity, no overlap-driven blending) is what makes the result read
    // as particles that happen to reconstruct the image, not the image.
    if (isGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${r},${gr},${bl},${Math.min(1, 0.75 * bright * opacity)})`;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = `rgba(${r},${gr},${bl},${0.95 * opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Single particle pool used for the entire cycle (build, hold, and
  // fade all read from the same array) — thinned from the ~188k-point
  // extraction to a live-render budget via a partial Fisher-Yates pick
  // (not a regular stride: a fixed interval can over/under-sample in
  // bursts where the source array is locally dense — a shuffled pick
  // keeps the thin spatially unbiased).
  const isSmallInit = window.innerWidth < 760;
  const LIVE_TARGET = isSmallInit ? 16000 : 20000;
  function pickIndices(totalPts, target, rand) {
    const n = Math.min(target, totalPts);
    const idx = new Array(totalPts);
    for (let i = 0; i < totalPts; i++) idx[i] = i;
    for (let i = totalPts - 1; i > totalPts - n - 1 && i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx.slice(totalPts - n);
  }

  function buildParticles(s, seed) {
    const totalPts = s.points.length / 2;
    const rand = mulberry32(seed);
    const indices = pickIndices(totalPts, LIVE_TARGET, rand);
    const list = [];
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const r = s.colors[i * 3], g = s.colors[i * 3 + 1], b = s.colors[i * 3 + 2];
      const isGlow = r > 232 && g > 220 && b > 195 && rand() < 0.35;
      const depth = rand();
      list.push({
        tx: s.points[i * 2],
        ty: s.points[i * 2 + 1],
        depth,
        phase: rand() * Math.PI * 2,
        speed: 0.12 + rand() * 0.3,
        wobble: 0.01 + rand() * 0.026,
        size: (0.75 + rand() * 1.6) * (0.6 + depth * 0.7),
        color: [r, g, b],
        isGlow,
        buildDelay: rand() * 0.6,
        fallDelay: rand() * 0.55,
        twinkle: rand() * Math.PI * 2,
      });
    }
    // Depth-sort once so painting in array order gives back-to-front
    // layering, instead of re-bucketing by depth every frame.
    list.sort((a, b) => a.depth - b.depth);
    return list;
  }

  const particles = buildParticles(shapeData, 101);

  const BUILD = 4.2;  // seconds to fly in from the corner and assemble
  const HOLD = 4.4;   // seconds fully formed
  const FADE = 5.8;   // seconds — slow: each particle detaches on its own
                       // stagger and drifts down as it fades, not a flat dim
  const TOTAL = BUILD + HOLD + FADE;

  let width = 0, height = 0, dpr = 1;
  let currentLayout = { cx: 0, cy: 0, scale: 1 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    let phase, phaseLocal;
    if (localT < BUILD) { phase = 'build'; phaseLocal = localT / BUILD; }
    else if (localT < BUILD + HOLD) { phase = 'hold'; phaseLocal = 1; }
    else { phase = 'fade'; phaseLocal = (localT - BUILD - HOLD) / FADE; }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const { cx, cy, scale } = currentLayout;
    const cornerX = width * 1.02;
    const cornerY = height * 1.04;

    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const tScreenX = cx + p.tx * scale;
      const tScreenY = cy + p.ty * scale;

      let buildBlend = 1;
      if (phase === 'build') {
        const staggered = Math.max(0, Math.min(1, (phaseLocal - p.buildDelay) / (1 - p.buildDelay)));
        buildBlend = smooth(staggered * 2.1);
      }

      let x = lerp(cornerX, tScreenX, buildBlend);
      let y = lerp(cornerY, tScreenY, buildBlend);

      const ph = p.phase + time * p.speed;
      const wob = p.wobble * (0.4 + 0.6 * (1 - buildBlend)) * scale * 0.15;
      x += Math.sin(ph) * wob;
      y += Math.cos(ph * 1.17) * wob;

      let opacity = Math.min(1, buildBlend * 3); // soft pop-in as each particle starts moving

      if (phase === 'fade') {
        // each particle detaches on its own stagger, then drifts slowly
        // down and out as it dims — not a uniform fade in place.
        const fallLocal = Math.max(0, Math.min(1, (phaseLocal - p.fallDelay) / (1 - p.fallDelay)));
        y += fallLocal * fallLocal * height * 0.55;
        opacity *= 1 - smooth(fallLocal);
      }
      if (opacity <= 0.015) continue;

      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;

      const r = p.color[0] | 0, g = p.color[1] | 0, bl = p.color[2] | 0;
      const bright = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(time * 2.2 + p.twinkle);
      paintDot(x, y, p.size, r, g, bl, opacity, p.isGlow, bright);
    }
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
