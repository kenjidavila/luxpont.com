// Hero particle sequence — Canvas2D, no WebGL. Architecture ported from
// @elise/particles (packages/particles/src/{field,particle-nucleus}.ts in
// elise-web): pure canvas 2D, additive ("lighter") glow blending, particles
// bucketed by depth before painting. What's new here vs. ELISE's abstract
// nucleus/wave: particles morph between fixed point-cloud TARGETS sampled
// from stipple illustrations (see particle-shapes.js) instead of a
// procedural sphere, in ink-black/oro on pure white instead of ELISE's
// blue/cyan — no blue in this palette at all, by request.
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !window.LUXPONT_SHAPES) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = window.innerWidth < 760;

  const shapesByName = {};
  window.LUXPONT_SHAPES.forEach((s) => { shapesByName[s.name] = s; });
  const fullCount = window.LUXPONT_SHAPES[0].points.length / 2;
  // Thin the particle pool on small screens for performance; sample every
  // Nth point so the silhouette stays intact, just less dense.
  const stride = isSmall ? 2 : 1;
  const N = Math.floor(fullCount / stride);

  function mulberry32(seed) {
    let s = seed;
    return function () {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(42);

  const INK = [28, 26, 24];
  const INK2 = [10, 9, 8];
  const ORO = [183, 148, 78];
  const ORO_CLARO = [205, 176, 114];
  const GLOW = [246, 240, 224];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function smooth(t) { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); }

  const particles = new Array(N);
  for (let i = 0; i < N; i++) {
    const ct = rand();
    let color;
    let isGlow = false;
    if (ct < 0.55) color = lerpColor(INK, INK2, rand());
    else if (ct < 0.93) color = lerpColor(ORO, ORO_CLARO, rand());
    else { color = GLOW; isGlow = true; }

    const depth = rand();
    particles[i] = {
      // rest (floating) position — a soft open cloud, not a tight sphere
      rx: (rand() * 2 - 1) * 1.55,
      ry: (rand() * 2 - 1) * 1.05,
      depth,
      phase: rand() * Math.PI * 2,
      speed: 0.12 + rand() * 0.3,
      wobble: 0.018 + rand() * 0.05,
      size: (0.55 + rand() * 1.5) * (0.6 + depth * 0.8),
      color,
      isGlow,
      delay: rand() * 0.15, // per-particle stagger so the build isn't uniform
      twinkle: rand() * Math.PI * 2,
    };
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  // Logo plays once as the genesis moment, then the three monuments loop.
  const segments = [
    { shape: null, dur: 1.2 },
    { shape: 'logo', dur: 4.4 },
    { shape: null, dur: 2.0 },
    { shape: 'coliseo', dur: 6.6 },
    { shape: null, dur: 1.8 },
    { shape: 'castillo', dur: 6.6 },
    { shape: null, dur: 1.8 },
    { shape: 'metropolis', dur: 6.6 },
    { shape: null, dur: 1.8 },
  ];
  const LOOP_START_INDEX = 2; // repeat from the float gap right before "coliseo"
  let cum = 0;
  const starts = segments.map((s) => { const t0 = cum; cum += s.dur; return t0; });
  const totalDuration = cum;
  const loopStartTime = starts[LOOP_START_INDEX];
  const loopDuration = totalDuration - loopStartTime;

  function segmentAt(t) {
    let tt = t;
    if (tt >= totalDuration) {
      tt = loopStartTime + ((tt - loopStartTime) % loopDuration);
    }
    for (let i = segments.length - 1; i >= 0; i--) {
      if (tt >= starts[i]) {
        const local = (tt - starts[i]) / segments[i].dur;
        const prev = segments[i > 0 ? i - 1 : 0].shape;
        return { prevShape: prev, thisShape: segments[i].shape, local };
      }
    }
    return { prevShape: null, thisShape: null, local: 0 };
  }

  function targetFor(shapeName, i) {
    if (!shapeName) return null;
    const s = shapesByName[shapeName];
    if (!s) return null;
    const idx = (i * stride) % (s.points.length / 2);
    return [s.points[idx * 2], s.points[idx * 2 + 1]];
  }

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

    const cx = width * 0.5;
    const cy = height * 0.5;
    const scale = Math.min(width, height) * 0.42;

    const { prevShape, thisShape, local } = segmentAt(time);

    const BUCKETS = 12;
    const buckets = new Array(BUCKETS);
    for (let b = 0; b < BUCKETS; b++) buckets[b] = [];

    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const staggered = Math.max(0, Math.min(1, (local - p.delay) / (1 - p.delay)));
      const blend = smooth(staggered * 2.6); // overdrive so it fully settles by mid-segment, leaving a real hold

      const from = targetFor(prevShape, i);
      const to = targetFor(thisShape, i);
      const fromPt = from || [p.rx, p.ry];
      const toPt = to || [p.rx, p.ry];

      let x = lerp(fromPt[0], toPt[0], blend);
      let y = lerp(fromPt[1], toPt[1], blend);

      // continuous gentle float, even while "assembled" — never fully static
      const ph = p.phase + time * p.speed;
      const settledness = to ? blend : 0.15;
      const wob = p.wobble * (1 - settledness * 0.72);
      x += Math.sin(ph) * wob;
      y += Math.cos(ph * 1.17) * wob;

      const sx = cx + x * scale;
      const sy = cy + y * scale;
      if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue;

      const size = p.size * (reduceMotion ? 1 : 1);
      let bi = Math.floor(p.depth * BUCKETS);
      if (bi >= BUCKETS) bi = BUCKETS - 1;
      buckets[bi].push(sx, sy, size, p.color[0], p.color[1], p.color[2], p.isGlow ? 1 : 0, p.twinkle);
    }

    for (let b = 0; b < BUCKETS; b++) {
      const arr = buckets[b];
      for (let k = 0; k < arr.length; k += 8) {
        const sx = arr[k], sy = arr[k + 1], size = arr[k + 2];
        const r = arr[k + 3] | 0, g = arr[k + 4] | 0, bl = arr[k + 5] | 0;
        const isGlow = arr[k + 6];
        const twinkle = arr[k + 7];
        if (isGlow) {
          const bright = reduceMotion ? 0.85 : 0.6 + 0.4 * Math.sin(time * 2.2 + twinkle);
          ctx.globalCompositeOperation = 'lighter';
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3.2);
          grad.addColorStop(0, `rgba(${r},${g},${bl},${0.75 * bright})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${bl},${0.16 * bright})`);
          grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(1, bright)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 1.1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(${r},${g},${bl},0.85)`;
          ctx.beginPath();
          ctx.arc(sx, sy, size * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  if (reduceMotion) {
    draw(starts[7] + 3.5); // static frame: Metrópolis, fully settled
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
