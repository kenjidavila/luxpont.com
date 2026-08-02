// Hero particle field — Canvas2D, no WebGL. Architecture ported from
// @elise/particles (packages/particles/src/{field,particle-nucleus}.ts in
// elise-web): pure canvas 2D, additive ("lighter") glow blending, particles
// bucketed by depth before painting. What's new here: every particle target
// is the EXACT centroid of a real ink dot detected in the source stipple
// illustration (particle-shapes.js — connected-component labeling, not a
// statistical resample), particles all originate from the bottom-right
// corner and fly to their target to construct each reference, hold, fade
// out, then the next reference builds the same way. Ink-black/oro on pure
// white — no blue anywhere in the palette.
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !window.LUXPONT_SHAPES) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.innerWidth < 760;

  const SEQUENCE = ['coliseo', 'castillo', 'metropolis'];
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

  // Every real dot from the source becomes exactly one particle. On small
  // screens a stride thins the pool for performance — still real detected
  // points, just fewer of them, not a re-sample.
  function buildParticles(shapeName, seed) {
    const s = shapesByName[shapeName];
    const totalPts = s.points.length / 2;
    const stride = isSmall ? 3 : 1;
    const rand = mulberry32(seed);
    const list = [];
    for (let i = 0; i < totalPts; i += stride) {
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
    const cx = small ? width * 0.5 : width * 0.72;
    const cy = small ? height * 0.58 : height * 0.5;
    const scale = Math.min(width, height) * (small ? 0.4 : 0.46);
    const cornerX = width * 1.02;
    const cornerY = height * 1.04;

    // time can start marginally negative (a headless/first-frame timestamp
    // quirk where rAF's `now` lands a hair before `start`); JS's `%` keeps
    // the sign of the dividend, so an unclamped negative time would floor
    // to shapeIdx -1 and crash. Clamp at zero.
    const t = Math.max(0, time) % TOTAL;
    const shapeIdx = Math.min(SEQUENCE.length - 1, Math.floor(t / PER_SHAPE));
    const localT = t - shapeIdx * PER_SHAPE;
    const particles = shapeSets[SEQUENCE[shapeIdx]];

    let phase, phaseLocal;
    if (localT < BUILD) { phase = 'build'; phaseLocal = localT / BUILD; }
    else if (localT < BUILD + HOLD) { phase = 'hold'; phaseLocal = 1; }
    else { phase = 'fade'; phaseLocal = (localT - BUILD - HOLD) / FADE; }

    const BUCKETS = 12;
    const buckets = new Array(BUCKETS);
    for (let b = 0; b < BUCKETS; b++) buckets[b] = [];

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

      let bi = Math.floor(p.depth * BUCKETS);
      if (bi >= BUCKETS) bi = BUCKETS - 1;
      buckets[bi].push(x, y, p.size, p.color[0], p.color[1], p.color[2], p.isGlow ? 1 : 0, p.twinkle, opacity);
    }

    for (let b = 0; b < BUCKETS; b++) {
      const arr = buckets[b];
      for (let k = 0; k < arr.length; k += 9) {
        const sx = arr[k], sy = arr[k + 1], size = arr[k + 2];
        const r = arr[k + 3] | 0, g = arr[k + 4] | 0, bl = arr[k + 5] | 0;
        const isGlow = arr[k + 6];
        const twinkle = arr[k + 7];
        const opacity = arr[k + 8];
        if (isGlow) {
          const bright = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(time * 2.2 + twinkle);
          ctx.globalCompositeOperation = 'lighter';
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3);
          grad.addColorStop(0, `rgba(${r},${g},${bl},${0.7 * bright * opacity})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${bl},${0.14 * bright * opacity})`);
          grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(1, bright * opacity)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 1.05, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(${r},${g},${bl},${0.88 * opacity})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
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
