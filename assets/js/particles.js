// Hero particle field — Canvas2D, no WebGL. Architecture ported from
// @elise/particles (packages/particles/src/{field,particle-nucleus}.ts in
// elise-web): pure canvas 2D, additive ("lighter") glow blending, particles
// bucketed by depth before painting. Every particle target comes from
// particle-shapes.js's high-density extraction of the source stipple
// illustrations (real ink-pixel locations, proportional to true measured
// ink area — see that file's header). Particles all originate from the
// bottom-right corner and fly to their target to construct each reference,
// hold, fade out, then the next reference builds the same way. Sequence:
// Coliseo (right) -> Metrópolis (left) -> Castillo (center). Ink-black/oro
// on pure white — no blue anywhere in the palette.
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !window.LUXPONT_SHAPES) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.innerWidth < 760;

  const SEQUENCE = ['coliseo', 'metropolis', 'castillo'];
  // horizontal anchor per shape on wide screens: coliseo hugs the right,
  // metrópolis hugs the left, castillo builds centered. Castillo is wide
  // and landscape (aspect ~2.4), so centered it would sit squarely behind
  // the text column; nudged down and scaled down a touch so it reads as a
  // backdrop under the copy instead of fighting it for legibility.
  const ANCHOR_X = { coliseo: 0.74, metropolis: 0.26, castillo: 0.5 };
  const ANCHOR_Y = { coliseo: 0.5, metropolis: 0.5, castillo: 0.66 };
  const SCALE_MULT = { coliseo: 0.46, metropolis: 0.46, castillo: 0.36 };
  const shapesByName = {};
  window.LUXPONT_SHAPES.forEach((s) => { shapesByName[s.name] = s; });

  function mulberry32(seed) {
    let s = seed;
    return function () {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const INK = [28, 26, 24];
  const INK2 = [10, 9, 8];
  const ORO = [183, 148, 78];
  const ORO_CLARO = [205, 176, 114];
  const GLOW = [246, 240, 224];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function smooth(t) { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); }

  // The high-density extraction can carry 40k-130k real points per shape
  // (particle-shapes.js). Rendering all of them every frame is too many
  // canvas draw calls for a steady 60fps, so each shape's pool is thinned
  // to a live-render budget via a partial Fisher-Yates pick (not a regular
  // stride: the source array groups a dense blob's points consecutively,
  // so a fixed-interval stride would over/under-sample in bursts — a
  // shuffled pick keeps the thin spatially unbiased and preserves the
  // real density gradient the extraction captured).
  const LIVE_TARGET = isSmall ? 12000 : 24000;
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
  function buildParticles(shapeName, seed) {
    const s = shapesByName[shapeName];
    const totalPts = s.points.length / 2;
    const rand = mulberry32(seed);
    const indices = pickIndices(totalPts, LIVE_TARGET, rand);
    const list = [];
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const ct = rand();
      let color;
      let isGlow = false;
      if (ct < 0.55) color = lerpColor(INK, INK2, rand());
      else if (ct < 0.97) color = lerpColor(ORO, ORO_CLARO, rand());
      else { color = GLOW; isGlow = true; }
      const depth = rand();
      list.push({
        tx: s.points[i * 2],
        ty: s.points[i * 2 + 1],
        depth,
        phase: rand() * Math.PI * 2,
        speed: 0.12 + rand() * 0.3,
        wobble: 0.01 + rand() * 0.026,
        size: (0.55 + rand() * 1.3) * (0.6 + depth * 0.7),
        color,
        isGlow,
        delay: rand() * 0.6,
        twinkle: rand() * Math.PI * 2,
      });
    }
    // Depth-sort once here instead of re-bucketing every frame: painting
    // in ascending-depth order already gives the back-to-front layering
    // the old per-frame bucket pass existed for, at a fraction of the cost.
    list.sort((a, b) => a.depth - b.depth);
    return list;
  }

  const shapeSets = {};
  SEQUENCE.forEach((name, idx) => { shapeSets[name] = buildParticles(name, 101 + idx); });

  const BUILD = 3.8;  // seconds to fly in from the corner and assemble
  const HOLD = 3.4;   // seconds fully formed
  const FADE = 1.6;   // seconds dissolving before the next reference starts
  const PER_SHAPE = BUILD + HOLD + FADE;
  const TOTAL = PER_SHAPE * SEQUENCE.length;

  let width = 0, height = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw(time) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const small = width < 760;

    // time can start marginally negative (a headless/first-frame timestamp
    // quirk where rAF's `now` lands a hair before `start`); JS's `%` keeps
    // the sign of the dividend, so an unclamped negative time would floor
    // to shapeIdx -1 and crash. Clamp at zero.
    const t = Math.max(0, time) % TOTAL;
    const shapeIdx = Math.min(SEQUENCE.length - 1, Math.floor(t / PER_SHAPE));
    const localT = t - shapeIdx * PER_SHAPE;
    const shapeName = SEQUENCE[shapeIdx];
    const particles = shapeSets[shapeName];

    const cx = small ? width * 0.5 : width * ANCHOR_X[shapeName];
    const cy = small ? height * 0.58 : height * ANCHOR_Y[shapeName];
    const scale = Math.min(width, height) * (small ? 0.4 : SCALE_MULT[shapeName]);
    const cornerX = width * 1.02;
    const cornerY = height * 1.04;

    let phase, phaseLocal;
    if (localT < BUILD) { phase = 'build'; phaseLocal = localT / BUILD; }
    else if (localT < BUILD + HOLD) { phase = 'hold'; phaseLocal = 1; }
    else { phase = 'fade'; phaseLocal = (localT - BUILD - HOLD) / FADE; }

    // particles[] is pre-sorted by depth (ascending) once at build time, so
    // painting straight through the array already gives back-to-front
    // layering — no per-frame bucket allocation/push needed.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const tScreenX = cx + p.tx * scale;
      const tScreenY = cy + p.ty * scale;

      let buildBlend = 1;
      if (phase === 'build') {
        const staggered = Math.max(0, Math.min(1, (phaseLocal - p.delay) / (1 - p.delay)));
        buildBlend = smooth(staggered * 2.1);
      }

      let x = lerp(cornerX, tScreenX, buildBlend);
      let y = lerp(cornerY, tScreenY, buildBlend);

      const ph = p.phase + time * p.speed;
      const wob = p.wobble * (0.4 + 0.6 * (1 - buildBlend)) * scale * 0.15;
      x += Math.sin(ph) * wob;
      y += Math.cos(ph * 1.17) * wob;

      let opacity = Math.min(1, buildBlend * 3); // soft pop-in as each particle starts moving
      if (phase === 'fade') opacity *= 1 - smooth(phaseLocal);
      if (opacity <= 0.015) continue;

      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;

      const r = p.color[0] | 0, g = p.color[1] | 0, bl = p.color[2] | 0;
      if (p.isGlow) {
        const bright = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(time * 2.2 + p.twinkle);
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${0.7 * bright * opacity})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${bl},${0.14 * bright * opacity})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(1, bright * opacity)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 1.05, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${r},${g},${bl},${0.88 * opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (reduceMotion) {
    draw(BUILD + HOLD * 0.5); // static frame: Coliseo, fully assembled
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
