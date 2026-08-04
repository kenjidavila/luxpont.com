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

  // The hero sits on a near-black "cover" field now; the particle buffer is
  // filled with it and every particle fades toward it (not white) as it dims.
  const COVER = [14, 12, 10]; // #0E0C0A
  const COVER_U32 = ((0xff << 24) | (COVER[2] << 16) | (COVER[1] << 8) | COVER[0]) >>> 0;

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

    // Per-particle edge factor: normalized radial distance from the shape
    // centre (0 = dense core, 1 = outermost dust). Used to give only the
    // silhouette's edge a subtle, living drift while the core stays crisp.
    const scx = (minX + maxX) / 2, scy = (minY + maxY) / 2;
    const edge = new Float32Array(totalPts);
    let maxR = 1e-6;
    for (let i = 0; i < totalPts; i++) {
      const dx = points[i * 2] - scx, dy = points[i * 2 + 1] - scy;
      const r = Math.sqrt(dx * dx + dy * dy);
      edge[i] = r;
      if (r > maxR) maxR = r;
    }
    for (let i = 0; i < totalPts; i++) edge[i] /= maxR;

    return {
      name: shapeData.name, points, colors, totalPts, order,
      minX, maxX, minY, maxY,
      shapeCx: (minX + maxX) / 2, shapeCy: (minY + maxY) / 2,
      xSpan: maxX - minX, ySpan: maxY - minY,
      align: ALIGN[shapeData.name] || 'normal',
      depth, phase, speed, wobble, size, isGlow, buildDelay, fallDelay, twinkle, edge,
    };
  }

  const shapeStates = window.LUXPONT_SHAPES.map((s, idx) => buildShapeState(s, 101 + idx * 37));

  function computeLayout(width, height, shape) {
    // Matches the CSS breakpoint (site.css, hero-content rules): below
    // 1100px there isn't room for a text column + a legible particle
    // region side by side without them crowding — verified as a real bug
    // at 1024px (iPad landscape), where the split layout put dense
    // particles directly behind the text.
    const small = width < 1101;
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
    // Extra headroom below the nav: the top of a shape's bounding box is
    // often its sparsest region (a statue's raised arm, a spire's finial —
    // a handful of faint points), so a tight margin reads as if the shape
    // is crowding/clipping into the nav even though nothing is actually
    // being cut off. More breathing room keeps that sparse detail visually
    // separated from the nav pill.
    const top = navBottom + 40;
    const rectW = Math.max(1, right - left);
    // Bottom margin so the shape's bounding box doesn't sit flush against
    // the very edge of the viewport — the source scenes aren't evenly
    // dense along that edge (sparse drifting dust on one side, solid
    // stonework on the other), so a zero-margin crop reads as an uneven,
    // tilted ground line.
    const rectH = Math.max(1, height - top - 44);
    // Cover fills the region (cropping overflow); contain fits the whole shape
    // inside it (leaving air). The Coliseo is a wide, landscape scene — cover-
    // cropping blew it up to full height and bled it under the text with no
    // breathing room, so it's fitted (contain, lightly enlarged) and centred to
    // sit with clear air around it. Metropolis / centered keep the flush cover.
    const coverScale = Math.max(rectW / shape.xSpan, rectH / shape.ySpan);
    const containScale = Math.min(rectW / shape.xSpan, rectH / shape.ySpan);
    const scale = shape.align === 'normal' ? containScale * 1.15 : coverScale;

    // Centering the shape inside its region only fills the region on
    // whichever axis is the *binding* one for the cover-fit scale — the
    // other axis comes out narrower than the region and, centered, leaves
    // equal empty space on both sides of it. For 'mirrored' that showed up
    // as Metropolis not actually reaching the true left edge; for 'normal'
    // the equivalent would be not reaching the right edge. Anchoring the
    // shape's own bounding-box edge to the region's edge (instead of
    // centering) guarantees it's flush on the side that's supposed to be
    // flush, and lets any slack fall on the side that already has room
    // (toward the text) — same idea for the top edge, so it's flush below
    // the nav instead of an equal top/bottom gap hiding that.
    let cx, cy;
    if (shape.align === 'mirrored') {
      cx = left - shape.minX * scale;
      cy = top - shape.minY * scale;
    } else if (shape.align === 'centered') {
      cx = left + rectW / 2 - shape.shapeCx * scale;
      cy = top + rectH / 2 - shape.shapeCy * scale;
    } else {
      // Coliseo — centred in its right-hand region so the air falls evenly
      // around it instead of the shape sitting flush against the edges.
      cx = left + rectW / 2 - shape.shapeCx * scale;
      cy = top + rectH / 2 - shape.shapeCy * scale;
    }
    return { cx, cy, scale };
  }

  const BUILD = 4.2;  // seconds to spiral in from the far edge and assemble
  const TAU = Math.PI * 2;
  // Cross-screen spiral handoff (see draw()): the incoming image winds IN
  // from the far edge and the outgoing one winds OUT toward it, so each
  // landmark swap reads as one spiral sweeping across the hero — right-to-
  // left going into Metropolis, left-to-right going into Coliseo. Both
  // angles decay to 0 at arrival, so the assembled image is always exact.
  const SPIRAL_TURNS_BUILD = 0.5;
  const SPIRAL_TURNS_FADE = 0.7;
  const HOLD = 9.0;   // seconds fully formed — long, calm hold so each landmark
                       // (and its hero text) lingers well before the next swap
  const FADE = 5.8;   // seconds — slow: each particle detaches on its own
                       // stagger and drifts down as it fades, not a flat dim
  const PER_SHAPE = BUILD + HOLD + FADE;
  const TOTAL = PER_SHAPE * shapeStates.length;

  let width = 0, height = 0, dpr = 1;
  let imgData = null;
  let buf = null;
  let buf32 = null;
  let dw = 0, dh = 0;
  let lastShapeIdx = -1;
  let cachedLayout = { cx: 0, cy: 0, scale: 1 };
  let transitionEndsAt = -Infinity;
  let needsLayoutRefresh = true; // forces one fresh measurement on first frame and after resize
  // .hero-content is stationary for ~90% of each shape's time on screen —
  // it only physically moves (repositions while invisible, mid-fade) for
  // the ~2.2s fade right after a switch. Querying getBoundingClientRect()
  // (forces a layout read) every single frame regardless was measured to
  // cause real, compounding frame-time growth over a running page; only
  // re-querying while a fade is actually in flight removes that cost for
  // the steady-state ~90%.
  const TRANSITION_DURATION = 2.2; // seconds — matches the CSS @keyframes duration below
  const TRANSITION_WINDOW = TRANSITION_DURATION + 0.15;

  // A plain `transition:left` would animate the position change visibly
  // (a slide) — what's wanted instead is invisible: fade out, reposition
  // while opacity is 0, fade back in. That needs a real @keyframes
  // animation (to hold the position jump exactly at the opacity-0
  // moment), and which one depends on the direction of travel.
  if (heroContentEl) {
    heroContentEl.addEventListener('animationend', (e) => {
      if (e.target === heroContentEl) heroContentEl.style.animation = '';
    });
  }

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
    buf32 = new Uint32Array(buf.buffer);
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
        const enteringMirrored = shape.align === 'mirrored';
        const enteringCentered = shape.align === 'centered';
        heroContentEl.style.animation = 'none';
        void heroContentEl.offsetWidth; // force reflow so the animation restarts even if the same name fires twice in a row
        heroContentEl.style.animation = (enteringMirrored ? 'hero-fade-to-mirrored' : 'hero-fade-to-normal')
          + ' ' + TRANSITION_DURATION + 's ease-in-out both';
        // the keyframes jump position/text-align at 40% (while opacity is 0); the
        // .mirrored/.centered classes also drive hero-lead/hero-actions alignment,
        // so their toggle must land at that same invisible instant, not at time 0,
        // or the paragraph/buttons would visibly snap ahead of the headline
        setTimeout(() => {
          heroContentEl.classList.toggle('mirrored', enteringMirrored);
          heroContentEl.classList.toggle('centered', enteringCentered);
        }, TRANSITION_DURATION * 1000 * 0.4);
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
    // The shape's centre on screen — the pivot the outgoing image spirals
    // around as it winds off.
    const screenCx = cx + shape.shapeCx * scale;
    const screenCy = cy + shape.shapeCy * scale;
    // Cross-screen spiral handoff. Each landmark enters from the side
    // OPPOSITE its resting place and spirals into position, and later leaves
    // by spiralling off toward that same far side — so a Coliseo(right)->
    // Metropolis(left) swap reads as one right-to-left spiral, and the way
    // back as a left-to-right one. Metropolis (mirrored, rests left) enters
    // from the right; Coliseo (normal, rests right) enters from the left.
    const swapFromRight = shape.align === 'mirrored';
    // Origin kept just inside the far edge (not offscreen) so the whole
    // spiral crossing is visible — particles stream out from a point near the
    // right (Metropolis) or left (Coliseo) edge and wind across to their rest.
    const originX = swapFromRight ? width * 0.94 : width * 0.06;
    const originY = height * 0.52;
    const buildSign = swapFromRight ? -1 : 1; // rotational sense of the inward spiral

    const { points, colors, order, totalPts } = shape;
    const { depth, phase, speed, wobble, size, isGlow, buildDelay, fallDelay, twinkle, edge } = shape;

    buf32.fill(COVER_U32); // reset the whole buffer to the opaque cover (near-black)

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

      let x = lerp(originX, tScreenX, buildBlend);
      let y = lerp(originY, tScreenY, buildBlend);

      if (phaseName === 'build' && buildBlend > 0 && buildBlend < 1) {
        // Wind the far-edge-to-target crossing into a spiral: rotate the
        // in-flight offset around the entry origin by an angle that decays to
        // zero exactly as buildBlend reaches 1, so every particle still lands
        // precisely on target — only the crossing arcs, one coherent spiral
        // sweeping the whole image into place from the far side.
        const spiralAngle = (1 - buildBlend) * SPIRAL_TURNS_BUILD * TAU * buildSign;
        const cosA = Math.cos(spiralAngle), sinA = Math.sin(spiralAngle);
        const dx = x - originX, dy = y - originY;
        x = originX + dx * cosA - dy * sinA;
        y = originY + dx * sinA + dy * cosA;
      }

      const ph = phase[i] + time * speed[i];
      const wob = wobble[i] * (0.4 + 0.6 * (1 - buildBlend)) * scale * 0.15;
      x += Math.sin(ph) * wob;
      y += Math.cos(ph * 1.17) * wob;

      // Alive edges: only the outer band (edge > 0.4) breathes, with a slow
      // per-particle drift that grows quadratically toward the outermost dust,
      // so the silhouette's rim and the stray motes around it float gently
      // while the dense core stays perfectly still. Full once built.
      const e = edge[i];
      if (e > 0.4) {
        const t2 = e - 0.4;
        const amp = t2 * t2 * scale * 0.09 * buildBlend;
        x += Math.sin(time * (0.32 + speed[i]) + phase[i]) * amp;
        y += Math.cos(time * (0.28 + speed[i] * 0.9) + phase[i] * 1.3) * amp;
      }

      let opacity = Math.min(1, buildBlend * 3); // soft pop-in as each particle starts moving

      if (phaseName === 'fade') {
        // Fade is the time-reverse of a build: each particle leaves its rest
        // position and spirals OUT to a point on the far edge it winds off
        // toward, rotating around that exit point by an angle that grows from
        // zero — the exact mirror of the way the next landmark will spiral IN.
        // The exit side is the same one this image entered from (Coliseo winds
        // off left, Metropolis off right), and the turn sense matches the next
        // build, so a fade-out and the following build read as one continuous
        // cross-screen spiral (right-to-left into Metropolis, and back).
        const fd = fallDelay[i];
        const fallLocal = Math.max(0, Math.min(1, (phaseLocal - fd) / (1 - fd)));
        const eased = smooth(fallLocal);
        const exitX = (shape.align !== 'mirrored') ? width * 0.06 : width * 0.94;
        const exitY = originY;
        const ex = lerp(tScreenX, exitX, eased);
        const ey = lerp(tScreenY, exitY, eased);
        const ang = eased * SPIRAL_TURNS_FADE * TAU * -buildSign;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const dx = ex - exitX, dy = ey - exitY;
        x = exitX + dx * cosA - dy * sinA;
        y = exitY + dx * sinA + dy * cosA;
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
      // blend toward the cover background by (1 - opacity) — direct pixel
      // writes don't get automatic alpha compositing, so the fade has to
      // be baked into the written colour itself.
      const fr = COVER[0] + (r - COVER[0]) * opacity;
      const fg = COVER[1] + (g - COVER[1]) * opacity;
      const fb = COVER[2] + (b - COVER[2]) * opacity;

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
