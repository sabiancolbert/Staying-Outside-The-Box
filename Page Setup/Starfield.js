// thank heavens for chatGPT <3

/*==============================================================*
 *                         STARFIELD SCRIPT
 *==============================================================*
 *  What this file does:
 *   1) Canvas setup + runtime guards
 *   2) Star persistence (localStorage) + restore/rescale
 *   3) Star creation + physics (attract / repel / poke)
 *   4) Drawing (stars + links + pointer ring)
 *   5) Pointer input (mouse/touch) -> speed + timers
 *   6) Animation loop + resize handling
 *
 *  Perf notes:
 *   - Distance checks: compare squared distance first
 *   - Link drawing: squared cutoff + Path2D alpha buckets
 *   - Edge fade: cached once per star per frame
 *==============================================================*/


//#region 1) CANVAS + RUNTIME FLAGS
/*========================================*
 *  1) CANVAS + RUNTIME FLAGS
 *========================================*/

const CANVAS = document.getElementById('constellations');
const CTX = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && CTX);

if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}

// Guard flags (useful if scripts get injected/reloaded)
let FREEZE_CONSTELLATION = false;
let ANIMATION_STARTED = false;
let RESIZE_WIRED = false;
let STARS_INITIALIZED = false;
//#endregion



//#region 2) GLOBAL STATE (POINTER / CANVAS / STARS)
/*========================================*
 *  2) GLOBAL STATE
 *========================================*/

// Pointer state + interaction timers
let POINTER_X = 0;
let POINTER_Y = 0;
let POINTER_T = 0;            // also acts as “pointer exists” flag
let POINTER_SPEED = 0;

let POKE_T = 0;               // poke impulse timer
let RING_T = 0;               // ring visibility timer
let RING_SIZE = 0;            // ring scale factor 0..1

// Canvas sizing + scaling
let W = 0;
let H = 0;
let SCREEN_SUM = 0;           // W + H
let SCREEN_SCALE = 1;         // main feel scale factor (derived from screen)
let STAR_TARGET_COUNT = 0;
let LINK_MAX_DIST = 0;

// Precomputed scaling powers (kept out of the hot loop)
let SCALE_POW = {
  attGrad: 1,
  repGrad: 1,
  attShapePow: 1,
  attStrength: 1,
  repStrength: 1
};

// Star array
let STARS = [];
//#endregion



//#region 3) UTILITIES
/*========================================*
 *  3) UTILITIES
 *========================================*/

const randBetween = (min, max) => Math.random() * (max - min) + min;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const clamp01 = (v) => clamp(v, 0, 1);

const safeNum = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

function nowMs() {
  return (window.performance && performance.now) ? performance.now() : Date.now();
}

/**
 * Safari/Mac timestamp fix:
 * Some browsers give event.timeStamp in epoch ms,
 * others give it relative to page load, and sometimes it’s 0.
 * We normalize everything to "performance.now()" style time.
 */
function normalizeEventTime(eventTimeStamp) {
  if (!Number.isFinite(eventTimeStamp) || eventTimeStamp <= 0) return nowMs();

  // If it looks like epoch time, convert to perf-style time if possible.
  if (eventTimeStamp > 1e12) {
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return eventTimeStamp - performance.timeOrigin;
    }
    return nowMs();
  }

  return eventTimeStamp;
}

/**
 * Edge fade factor:
 *  - 0 near/over the wrap boundary
 *  - 1 when safely away from edges
 * Uses smoothstep for a soft curve.
 */
function edgeFadeFactor(star) {
  const drawR = (star.whiteValue * 2 + star.size) || 0;

  const left = star.x + drawR;            // 0 when x == -R
  const right = W + drawR - star.x;       // 0 when x == W + R
  const top = star.y + drawR;             // 0 when y == -R
  const bottom = H + drawR - star.y;      // 0 when y == H + R

  const minEdgeDist = Math.min(left, right, top, bottom);
  const fadeBand = Math.min(90, SCREEN_SUM * 0.03);

  const t = clamp01(minEdgeDist / fadeBand);
  return t * t * (3 - 2 * t); // smoothstep
}
//#endregion



//#region 4) STORAGE (localStorage)
/*========================================*
 *  4) STORAGE
 *========================================*
 *  Saves:
 *   - constellationStars: star array
 *   - constellationMeta: canvas size + pointer/timers + UI params
 *========================================*/

function saveStarsToStorage() {
  if (!HAS_CANVAS) return;

  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));

    localStorage.setItem('constellationMeta', JSON.stringify({
      width: W,
      height: H,

      // pointer + timers
      pokeT: POKE_T,
      pointerSpeed: POINTER_SPEED,
      pointerX: POINTER_X,
      pointerY: POINTER_Y,
      pointerT: POINTER_T,
      ringT: RING_T,
      ringSize: RING_SIZE,

      // UI params
      attractStrength: ATTRACT_STRENGTH,
      attractRadius: ATTRACT_RADIUS,
      attractScale: ATTRACT_SCALE,
      clamp: CLAMP,
      repelStrength: REPEL_STRENGTH,
      repelRadius: REPEL_RADIUS,
      repelScale: REPEL_SCALE,
      pokeStrength: POKE_STRENGTH
    }));
  } catch (err) {
    console.warn('Could not save stars:', err);
  }
}
//#endregion



//#region 5) INIT STARS (RESTORE OR CREATE)
/*========================================*
 *  5) INIT STARS
 *========================================*/

function initStars() {
  if (!HAS_CANVAS) return;

  let rawStars = null;
  try {
    rawStars = localStorage.getItem('constellationStars');
  } catch (err) {
    console.warn('Could not read constellationStars:', err);
  }

  if (!rawStars) {
    createStars();
    return;
  }

  try {
    const parsed = JSON.parse(rawStars);

    if (!Array.isArray(parsed) || !parsed.length) {
      createStars();
      return;
    }

    STARS = parsed;

    // Meta restore (optional)
    let rawMeta = null;
    try {
      rawMeta = localStorage.getItem('constellationMeta');
    } catch (err) {
      console.warn('Could not read constellationMeta:', err);
    }

    if (rawMeta) {
      try {
        const meta = JSON.parse(rawMeta);

        // Rescale positions if canvas size changed
        if (safeNum(meta.width) > 0 && safeNum(meta.height) > 0) {
          const sx = W / meta.width;
          const sy = H / meta.height;
          const sizeScale = (W + H) / (meta.width + meta.height);

          for (const star of STARS) {
            star.x *= sx;
            star.y *= sy;
            star.size *= sizeScale;
          }
        }

        // Timers / pointer
        POKE_T = meta.pokeT ?? 0;
        POINTER_SPEED = meta.pointerSpeed ?? 0;
        RING_T = meta.ringT ?? 0;
        RING_SIZE = meta.ringSize ?? 0;

        POINTER_X = (typeof meta.pointerX === 'number') ? meta.pointerX : POINTER_X;
        POINTER_Y = (typeof meta.pointerY === 'number') ? meta.pointerY : POINTER_Y;
        POINTER_T = (typeof meta.pointerT === 'number' && meta.pointerT > 0) ? meta.pointerT : nowMs();

        // UI params
        ATTRACT_STRENGTH = meta.attractStrength ?? ATTRACT_STRENGTH;
        ATTRACT_RADIUS   = meta.attractRadius   ?? ATTRACT_RADIUS;
        ATTRACT_SCALE    = meta.attractScale    ?? ATTRACT_SCALE;

        CLAMP            = meta.clamp           ?? CLAMP;

        REPEL_STRENGTH   = meta.repelStrength   ?? REPEL_STRENGTH;
        REPEL_RADIUS     = meta.repelRadius     ?? REPEL_RADIUS;
        REPEL_SCALE      = meta.repelScale      ?? REPEL_SCALE;

        POKE_STRENGTH    = meta.pokeStrength    ?? POKE_STRENGTH;

      } catch (err) {
        console.warn('Could not parse constellationMeta; skipping meta restore.', err);
      }
    }

  } catch (err) {
    console.error('Could not parse saved stars, recreating.', err);
    createStars();
  }
}

function createStars() {
  if (!HAS_CANVAS) return;

  STARS = [];

  const MIN_SIZE = 3;
  const MAX_SIZE = SCREEN_SUM / 400 || 3;

  for (let i = 0; i < STAR_TARGET_COUNT; i++) {
    STARS.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: randBetween(-0.25, 0.25),
      vy: randBetween(-0.25, 0.25),

      size: randBetween(
        Math.min(MIN_SIZE, MAX_SIZE),
        Math.max(MIN_SIZE, MAX_SIZE)
      ),

      opacity: randBetween(0.005, 1.8),
      fadeSpeed: randBetween(1, 2.1),

      redValue: randBetween(100, 200),
      whiteValue: 0,

      momentumX: 0,
      momentumY: 0,

      edge: 1
    });
  }
}
//#endregion



//#region 6) UI CONTROLS (STEPPERS + BINDINGS)
/*========================================*
 *  6) UI CONTROLS
 *========================================*
 *  - hold-to-repeat stepper buttons
 *  - slider + number input binding with snapping
 *========================================*/

function enableStepperHold(button, onStep) {
  let holdTimer = null;
  let repeatTimer = null;

  const INITIAL_DELAY_MS = 350;
  const START_INTERVAL_MS = 120;
  const MIN_INTERVAL_MS = 40;
  const ACCELERATION = 0.88;

  const startHold = () => {
    let interval = START_INTERVAL_MS;
    onStep();

    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => {
        onStep();
        interval = Math.max(MIN_INTERVAL_MS, interval * ACCELERATION);

        clearInterval(repeatTimer);
        repeatTimer = setInterval(onStep, interval);
      }, interval);
    }, INITIAL_DELAY_MS);
  };

  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    holdTimer = null;
    repeatTimer = null;
  };

  button.addEventListener('mousedown', (e) => { e.preventDefault(); startHold(); });
  button.addEventListener('mouseup', stopHold);
  button.addEventListener('mouseleave', stopHold);

  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startHold();
  }, { passive: false });

  button.addEventListener('touchend', stopHold);
  button.addEventListener('touchcancel', stopHold);
}

/*---------- Gravity params (bound to UI) ----------*/

let ATTRACT_STRENGTH = 50;
let ATTRACT_RADIUS = 50;
let ATTRACT_SCALE = 5;

let CLAMP = 5;

let REPEL_STRENGTH = 50;
let REPEL_RADIUS = 50;
let REPEL_SCALE = 5;

let POKE_STRENGTH = 5;

function bindControl(id, setter, initialValue) {
  const slider = document.getElementById(id);
  if (!slider) return false;

  const numberInput = document.getElementById(id + '_num');

  const block = slider.closest('.controlBlock');
  const stepBtns = block ? block.querySelectorAll('.stepBtn[data-step]') : [];

  const MIN = Number(slider.min || (numberInput && numberInput.min) || 0);
  const MAX = Number(slider.max || (numberInput && numberInput.max) || 10);

  const rawStep = Number(slider.step || (numberInput && numberInput.step) || 1);
  const STEP = (Number.isFinite(rawStep) && rawStep > 0) ? rawStep : 1;

  const snapToStep = (value) => {
    const snapped = MIN + Math.round((value - MIN) / STEP) * STEP;
    const decimals = (String(STEP).split('.')[1] || '').length;
    return Number(snapped.toFixed(decimals));
  };

  const applyValue = (value) => {
    value = Number(value);
    if (!Number.isFinite(value)) return;

    value = clamp(value, MIN, MAX);
    value = snapToStep(value);

    slider.value = String(value);
    if (numberInput) numberInput.value = String(value);

    setter(value);

    // Keep any other "input" listeners alive
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const nudge = (dir) => {
    const current = Number(slider.value);
    applyValue(current + dir * STEP);
  };

  applyValue(initialValue ?? slider.value);

  slider.addEventListener('input', () => applyValue(slider.value));

  if (numberInput) {
    numberInput.addEventListener('input', () => applyValue(numberInput.value));
    numberInput.addEventListener('change', () => applyValue(numberInput.value));
  }

  stepBtns.forEach((btn) => {
    const dir = Number(btn.dataset.step) || 0;
    if (!dir) return;
    enableStepperHold(btn, () => nudge(dir));
  });

  return true;
}

function initGravityControlsIfPresent() {
  if (!document.getElementById('ATTRACT_STRENGTH') &&
      !document.getElementById('REPEL_STRENGTH')) {
    return;
  }

  bindControl('ATTRACT_STRENGTH', (v) => (ATTRACT_STRENGTH = v), ATTRACT_STRENGTH);
  bindControl('ATTRACT_RADIUS',   (v) => (ATTRACT_RADIUS   = v), ATTRACT_RADIUS);
  bindControl('ATTRACT_SCALE',    (v) => (ATTRACT_SCALE    = v), ATTRACT_SCALE);

  bindControl('CLAMP',            (v) => (CLAMP            = v), CLAMP);

  bindControl('REPEL_STRENGTH',   (v) => (REPEL_STRENGTH   = v), REPEL_STRENGTH);
  bindControl('REPEL_RADIUS',     (v) => (REPEL_RADIUS     = v), REPEL_RADIUS);
  bindControl('REPEL_SCALE',      (v) => (REPEL_SCALE      = v), REPEL_SCALE);

  bindControl('POKE_STRENGTH',    (v) => (POKE_STRENGTH    = v), POKE_STRENGTH);
}

document.addEventListener('DOMContentLoaded', initGravityControlsIfPresent);
//#endregion



//#region 7) PHYSICS (MOVE STARS)
/*========================================*
 *  7) PHYSICS
 *========================================*/

function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;

  const influenceRange = SCREEN_SUM * 0.2;
  const influenceRangeSq = influenceRange * influenceRange;

  const wrapDistanceSq = 200 * 200;

  for (const star of STARS) {
    const dx = POINTER_X - star.x;
    const dy = POINTER_Y - star.y;

    // De-lag: squared distance first
    const distSq = dx * dx + dy * dy;

    if (distSq < influenceRangeSq) {
      const dist = Math.sqrt(distSq) + 0.0001;

      const toPointerX = dx / dist;
      const toPointerY = dy / dist;

      // Linear gradients (0..1)
      let attGrad = 1 - (dist / (((ATTRACT_RADIUS * 5.2) * SCALE_POW.attGrad) || 1));
      let repGrad = 1 - (dist / (((REPEL_RADIUS  * 2.8) * SCALE_POW.repGrad) || 1));
      attGrad = Math.max(0, attGrad);
      repGrad = Math.max(0, repGrad);

      // Shape curves
      const attShape = Math.pow(
        attGrad,
        Math.max(0.1, ((ATTRACT_SCALE * 0.48) * SCALE_POW.attShapePow))
      );

      const repShape = Math.pow(
        repGrad,
        Math.max(0.1, (REPEL_SCALE * 0.64))
      );

      // Final forces (scaled by pointer speed)
      const attract =
        ((ATTRACT_STRENGTH * 0.006) * SCALE_POW.attStrength) *
        POINTER_SPEED *
        attShape;

      const repel =
        ((REPEL_STRENGTH * 0.0182) * SCALE_POW.repStrength) *
        POINTER_SPEED *
        repShape;

      star.momentumX += attract * toPointerX;
      star.momentumY += attract * toPointerY;

      star.momentumX += repel * -toPointerX;
      star.momentumY += repel * -toPointerY;

      const pokeForce = (0.01 * POKE_STRENGTH) * POKE_T * repShape;
      star.momentumX += pokeForce * -toPointerX;
      star.momentumY += pokeForce * -toPointerY;
    }

    // Baseline drift boosted by interaction
    const driftBoost = Math.min(10, 0.05 * POINTER_SPEED);
    star.momentumX += star.vx * driftBoost;
    star.momentumY += star.vy * driftBoost;

    // Clamp force magnitude
    let fx = star.momentumX;
    let fy = star.momentumY;

    const limit = CLAMP * (SCREEN_SCALE ** 2);
    const forceMag = Math.sqrt(fx * fx + fy * fy);

    if (forceMag > limit) {
      const s = limit / forceMag;
      fx *= s;
      fy *= s;
    }

    star.x += star.vx + fx;
    star.y += star.vy + fy;

    star.momentumX *= 0.98;
    star.momentumY *= 0.98;

    // Wrap vs bounce
    if (RING_T === 0 || distSq > wrapDistanceSq || POKE_T > 1000) {
      const drawR = (star.whiteValue * 2 + star.size) || 0;

      if (star.x < -drawR) star.x = W + drawR;
      else if (star.x > W + drawR) star.x = -drawR;

      if (star.y < -drawR) star.y = H + drawR;
      else if (star.y > H + drawR) star.y = -drawR;
    } else {
      const drawR = (star.whiteValue * 2 + star.size) || 0;

      if (star.x < drawR) {
        star.x = 2 * drawR - star.x;
        star.momentumX = -star.momentumX;
      } else if (star.x > W - drawR) {
        star.x = 2 * (W - drawR) - star.x;
        star.momentumX = -star.momentumX;
      }

      if (star.y < drawR) {
        star.y = 2 * drawR - star.y;
        star.momentumY = -star.momentumY;
      } else if (star.y > H - drawR) {
        star.y = 2 * (H - drawR) - star.y;
        star.momentumY = -star.momentumY;
      }
    }

    // Flash decay
    if (star.whiteValue > 0) {
      star.whiteValue *= 0.98;
      if (star.whiteValue < 0.001) star.whiteValue = 0;
    }

    // Opacity cycle
    if (star.opacity <= 0.005) {
      star.opacity = 1;
      if (Math.random() < 0.07) star.whiteValue = 1;
    } else if (star.opacity > 0.02) {
      star.opacity -= 0.005 * star.fadeSpeed;
    } else {
      star.opacity -= 0.0001;
    }
  }

  // Global decay
  POINTER_SPEED *= 0.5;
  if (POINTER_SPEED < 0.001) POINTER_SPEED = 0;

  // Ring timing
  RING_T *= 0.9;
  if (RING_T < 0.1) RING_T = 0;

  if (RING_T < 1) {
    RING_SIZE = 0;
  } else if (RING_SIZE < 1) {
    RING_SIZE += 0.05;
  }

  POKE_T *= 0.85;
  if (POKE_T < 1) POKE_T = 0;

  // Debug readouts
  const MISC_DEBUG = 0;
  const dbgMisc = document.getElementById('miscDbg');
  if (dbgMisc) dbgMisc.textContent = MISC_DEBUG.toFixed(3);

  const dbgRing = document.getElementById('dbgCircle');
  if (dbgRing) dbgRing.textContent = RING_T.toFixed(3);

  const dbgSpeed = document.getElementById('dbgSpeed');
  if (dbgSpeed) dbgSpeed.textContent = POINTER_SPEED.toFixed(3);

  const dbgPoke = document.getElementById('dbgPoke');
  if (dbgPoke) dbgPoke.textContent = POKE_T.toFixed(1);
}
//#endregion



//#region 8) RENDERING (STARS + LINKS + RING)
/*========================================*
 *  8) RENDERING
 *========================================*/

const LINK_BUCKETS = 18;
let LINK_PATHS = Array.from({ length: LINK_BUCKETS }, () => new Path2D());

function resetLinkPaths() {
  for (let i = 0; i < LINK_BUCKETS; i++) LINK_PATHS[i] = new Path2D();
}

function drawFrame() {
  if (!HAS_CANVAS || !CTX) return;

  CTX.clearRect(0, 0, W, H);

  /*---------- Pointer ring ----------*/
  // Fix: clamp base radius so arc never gets negative radius on tiny screens
  const baseRadius = Math.max(0, SCREEN_SCALE * 100 - 40);
  const ringRadius = baseRadius * RING_SIZE;
  const ringWidth = RING_T * 0.15 + 1.5;
  const ringAlpha = Math.min(RING_T * 0.07, 1);

  if (POINTER_T > 0 && ringAlpha > 0.001) {
    CTX.save();
    CTX.lineWidth = ringWidth;
    CTX.strokeStyle = 'rgba(189, 189, 189, 1)';
    CTX.globalAlpha = ringAlpha;

    CTX.beginPath();
    CTX.arc(POINTER_X, POINTER_Y, ringRadius, 0, Math.PI * 2);
    CTX.stroke();

    CTX.restore();
  }

  /*---------- Links ----------*/
  CTX.lineWidth = 1;

  const count = STARS.length;
  if (count) {
    // Cache edge fade once per star per frame
    for (let i = 0; i < count; i++) STARS[i].edge = edgeFadeFactor(STARS[i]);

    const distScale = SCREEN_SUM / 1100;
    const cutoffRaw = LINK_MAX_DIST / distScale;
    const cutoffSq = cutoffRaw * cutoffRaw;

    resetLinkPaths();

    for (let a = 0; a < count; a++) {
      const A = STARS[a];
      const ax = A.x, ay = A.y;
      const aOpacity = A.opacity;
      const aEdge = A.edge;

      for (let b = a + 1; b < count; b++) {
        const B = STARS[b];

        const dx = ax - B.x;
        const dy = ay - B.y;
        const dSq = dx * dx + dy * dy;

        if (dSq > cutoffSq) continue;

        const d = Math.sqrt(dSq) * distScale;

        let alpha = (1 - d / LINK_MAX_DIST) * ((aOpacity + B.opacity) / 2);
        alpha *= Math.min(aEdge, B.edge);

        if (alpha <= 0.002) continue;

        let bucket = (alpha * (LINK_BUCKETS - 1)) | 0;
        bucket = clamp(bucket, 0, LINK_BUCKETS - 1);

        LINK_PATHS[bucket].moveTo(ax, ay);
        LINK_PATHS[bucket].lineTo(B.x, B.y);
      }
    }

    for (let i = 0; i < LINK_BUCKETS; i++) {
      const a = (i + 1) / LINK_BUCKETS;
      CTX.strokeStyle = `rgba(100, 100, 100, ${a})`;
      CTX.stroke(LINK_PATHS[i]);
    }
  }

  /*---------- Stars ----------*/
  for (const star of STARS) {
    let r = 255 * star.whiteValue + star.redValue;
    if (r > 255) r = 255;

    CTX.beginPath();
    CTX.fillStyle = `rgba(${r}, ${255 * star.whiteValue}, ${255 * star.whiteValue}, ${star.opacity})`;
    CTX.arc(star.x, star.y, star.whiteValue * 2 + star.size, 0, Math.PI * 2);
    CTX.fill();
  }
}
//#endregion



//#region 9) RESIZE + ANIMATION LOOP
/*========================================*
 *  9) RESIZE + ANIMATION LOOP
 *========================================*/

function resizeCanvas() {
  if (!HAS_CANVAS) return;

  const oldW = W;
  const oldH = H;
  const oldSum = SCREEN_SUM || 1;

  W = window.innerWidth || 0;
  H = window.innerHeight || 0;

  CANVAS.width = W;
  CANVAS.height = H;

  SCREEN_SUM = W + H;

  SCREEN_SCALE = Math.pow(SCREEN_SUM / 1200, 0.35);
  STAR_TARGET_COUNT = Math.min(450, SCREEN_SUM / 10);
  LINK_MAX_DIST = SCREEN_SUM / 10;

  // Precompute scaling powers (keeps moveStars lean)
  SCALE_POW = {
    attGrad: SCREEN_SCALE ** 1.11,
    repGrad: SCREEN_SCALE ** 0.66,
    attShapePow: SCREEN_SCALE ** -8.89,
    attStrength: SCREEN_SCALE ** -8.46,
    repStrength: SCREEN_SCALE ** -0.89
  };

  // If we already have stars, rescale positions/sizes to the new canvas
  if (oldW !== 0 && oldH !== 0 && STARS.length) {
    const sx = W / oldW;
    const sy = H / oldH;
    const sizeScale = SCREEN_SUM / oldSum;

    for (const star of STARS) {
      star.x *= sx;
      star.y *= sy;
      star.size *= sizeScale;
    }
  }
}

function animate() {
  if (!HAS_CANVAS) return;

  if (!FREEZE_CONSTELLATION) moveStars();
  drawFrame();

  requestAnimationFrame(animate);
}
//#endregion



//#region 10) POINTER INPUT
/*========================================*
 *  10) POINTER INPUT
 *========================================*/

function updatePointerSpeed(px, py, eventTimeStamp) {
  const t = normalizeEventTime(eventTimeStamp);

  const dt = Math.max(1, t - POINTER_T);
  const dx = px - POINTER_X;
  const dy = py - POINTER_Y;

  const rawSpeed = Math.sqrt(dx * dx + dy * dy) / dt;

  POINTER_SPEED = Math.min(rawSpeed * 50, 50);
  RING_T = Math.max(RING_T, POINTER_SPEED);

  POINTER_X = px;
  POINTER_Y = py;
  POINTER_T = t;
}

function startPointerInteraction(px, py, eventTimeStamp) {
  POKE_T = 500;
  updatePointerSpeed(px, py, eventTimeStamp);
}

window.addEventListener('mousemove', (e) => {
  updatePointerSpeed(e.clientX, e.clientY, e.timeStamp);
});

window.addEventListener('mousedown', (e) => {
  startPointerInteraction(e.clientX, e.clientY, e.timeStamp);
});

window.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (!touch) return;
  startPointerInteraction(touch.clientX, touch.clientY, e.timeStamp);
});

window.addEventListener('touchmove', (e) => {
  const touch = e.touches[0];
  if (!touch) return;
  updatePointerSpeed(touch.clientX, touch.clientY, e.timeStamp);
});
//#endregion



//#region 11) BOOTSTRAP
/*========================================*
 *  11) BOOTSTRAP
 *========================================*/

function sizesReady() {
  return (
    Number.isFinite(W) &&
    Number.isFinite(H) &&
    W > 50 &&
    H > 50
  );
}

function startStarfield() {
  resizeCanvas();

  if (!sizesReady()) {
    requestAnimationFrame(startStarfield);
    return;
  }

  if (!STARS_INITIALIZED) {
    STARS_INITIALIZED = true;
    initStars();
  }

  if (!ANIMATION_STARTED) {
    ANIMATION_STARTED = true;
    animate();
  }

  if (!RESIZE_WIRED) {
    RESIZE_WIRED = true;
    window.addEventListener('resize', resizeCanvas);
  }
}

try {
  startStarfield();
} catch (err) {
  console.error('Initialization error in starfield script:', err);
}
//#endregion
