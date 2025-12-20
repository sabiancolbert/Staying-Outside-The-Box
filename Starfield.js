// thank heavens for chatGPT <3

/*==============================================================*
 *                         STARFIELD SCRIPT
 *==============================================================*
 *  What this file does:
 *   1) Canvas setup + runtime guards
 *   2) Star persistence (localStorage) + restore/rescale
 *   3) Star creation + physics (attract / repel / poke)
 *   4) Drawing (stars + links + optional pointer ring)
 *   5) Pointer input (mouse/touch) -> speed + timers
 *   6) Animation loop + resize handling
 *
 *  Perf notes:
 *   - De-lag distance checks: compare squared distance first
 *   - Link drawing: squared cutoff + Path2D bucket strokes
 *   - Edge fade: cached once per star per frame
 *==============================================================*/

//#region 1) CANVAS + GLOBAL STATE
/*========================================*
 *  CANVAS + RUNTIME FLAGS
 *========================================*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && BRUSH);

if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}

// Prevent repeats/loops (useful if scripts get reloaded)
let FREEZE_CONSTELLATION = false;
let ANIMATION_STARTED = false;
let RESIZE_WIRED = false;
let STARS_INITIALIZED = false;

// Pointer state + timers
let USER_X = 0;
let USER_Y = 0;
let USER_TIME = 0;   // also acts as “pointer exists” flag
let USER_SPEED = 0;
let POKE_TIMER = 0;
let CIRCLE_TIMER = 0;

// Cross-script flag (preserved across pages if set earlier)
window.REMOVE_CIRCLE = window.REMOVE_CIRCLE ?? false;

// Canvas sizing + scaling
let CANVAS_WIDTH = 0;
let CANVAS_HEIGHT = 0;
let SCREEN_SIZE = 0;       // CANVAS_WIDTH + CANVAS_HEIGHT
let SCALE_TO_SCREEN = 0;   // your main scale factor
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

// Precomputed scaling powers (kept out of the laggy loop)
let SCALED_ATT_GRA = 1;
let SCALED_REP_GRA = 1;
let SCALED_ATT_SHA = 1;
let SCALED_ATT = 1;
let SCALED_REP = 1;

// Starfield data
let STARS = [];
//#endregion



//#region 2) STORAGE (localStorage)
/*========================================*
 *  STORAGE
 *========================================*
 *  Saves:
 *   - constellationStars: full star array
 *   - constellationMeta: canvas size + pointer/timers + UI params
 *========================================*/

function saveStarsToStorage() {
  if (!HAS_CANVAS) return;

  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));

    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,

        // pointer + timers
        pokeTimer: POKE_TIMER,
        userSpeed: USER_SPEED,
        userX: USER_X,
        userY: USER_Y,
        userTime: USER_TIME,

        // UI params
        attractStrength: ATTRACT_STRENGTH,
        attractRadius: ATTRACT_RADIUS,
        attractScale: ATTRACT_SCALE,
        clamp: CLAMP,
        repelStrength: REPEL_STRENGTH,
        repelRadius: REPEL_RADIUS,
        repelScale: REPEL_SCALE,
        pokeStrength: POKE_STRENGTH
      })
    );
  } catch (ERR) {
    console.warn('Could not save stars:', ERR);
  }
}

window.addEventListener('beforeunload', saveStarsToStorage);
//#endregion



//#region 3) UTILITIES
/*========================================*
 *  UTILITIES
 *========================================*/

function nowMs() {
  return (window.performance && performance.now) ? performance.now() : Date.now();
}

/**
 * Mac/Safari timestamp fix:
 * Some browsers give `event.timeStamp` in epoch ms (Date.now-ish),
 * others give it relative to page load (performance.now-ish),
 * and occasionally it can be 0.
 *
 * We normalize everything to the same "performance.now()" style clock.
 */
function normalizeEventTime(TIME_STAMP) {
  if (!Number.isFinite(TIME_STAMP) || TIME_STAMP <= 0) return nowMs();

  // If it looks like epoch time (e.g., 1700000000000), convert to perf-style time.
  // performance.timeOrigin exists in modern browsers; fallback uses nowMs().
  if (TIME_STAMP > 1e12) {
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return TIME_STAMP - performance.timeOrigin;
    }
    return nowMs();
  }

  // Otherwise assume it's already perf-style-ish.
  return TIME_STAMP;
}

const RANDOM_BETWEEN = (MIN, MAX) => Math.random() * (MAX - MIN) + MIN;

// 0 at/beyond wrap threshold, 1 when safely away from edges
function edgeFactor(STAR) {
  const DRAW_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  const LEFT = STAR.x + DRAW_RADIUS;                          // 0 when x == -R
  const RIGHT = CANVAS_WIDTH + DRAW_RADIUS - STAR.x;          // 0 when x == W + R
  const TOP = STAR.y + DRAW_RADIUS;                           // 0 when y == -R
  const BOTTOM = CANVAS_HEIGHT + DRAW_RADIUS - STAR.y;        // 0 when y == H + R

  const MIN_EDGE_DIST = Math.min(LEFT, RIGHT, TOP, BOTTOM);
  const FADE_BAND = Math.min(90, SCREEN_SIZE * 0.03);

  let T = MIN_EDGE_DIST / FADE_BAND;
  if (T < 0) T = 0;
  if (T > 1) T = 1;

  return T * T * (3 - 2 * T); // smoothstep
}
//#endregion



//#region 4) INIT: RESTORE OR CREATE STARS
/*========================================*
 *  INIT STARS
 *========================================*/

function initStars() {
  if (!HAS_CANVAS) return;

  let SAVED_STARS_RAW = null;

  try {
    SAVED_STARS_RAW = localStorage.getItem('constellationStars');
  } catch (ERR) {
    console.warn('Could not read constellationStars from storage:', ERR);
    createStars();
    return;
  }

  if (!SAVED_STARS_RAW) {
    createStars();
    return;
  }

  try {
    const PARSED_STARS = JSON.parse(SAVED_STARS_RAW);

    if (Array.isArray(PARSED_STARS) && PARSED_STARS.length) {
      STARS = PARSED_STARS;

      let META_RAW = null;
      try {
        META_RAW = localStorage.getItem('constellationMeta');
      } catch (ERR) {
        console.warn('Could not read constellationMeta from storage:', ERR);
      }

      if (META_RAW) {
        try {
          const META = JSON.parse(META_RAW);

          if (META.width > 0 && META.height > 0) {
            const SCALE_X = CANVAS_WIDTH / META.width;
            const SCALE_Y = CANVAS_HEIGHT / META.height;
            const SIZE_SCALE = (CANVAS_WIDTH + CANVAS_HEIGHT) / (META.width + META.height);

            for (const STAR of STARS) {
              STAR.x *= SCALE_X;
              STAR.y *= SCALE_Y;
              STAR.size *= SIZE_SCALE;
            }
          }

          POKE_TIMER = META.pokeTimer ?? 0;
          USER_SPEED = META.userSpeed ?? 0;

          ATTRACT_STRENGTH = META.attractStrength ?? ATTRACT_STRENGTH;
          ATTRACT_RADIUS   = META.attractRadius   ?? ATTRACT_RADIUS;
          ATTRACT_SCALE    = META.attractScale    ?? ATTRACT_SCALE;
          CLAMP            = META.clamp           ?? CLAMP;
          REPEL_STRENGTH   = META.repelStrength   ?? REPEL_STRENGTH;
          REPEL_RADIUS     = META.repelRadius     ?? REPEL_RADIUS;
          REPEL_SCALE      = META.repelScale      ?? REPEL_SCALE;
          POKE_STRENGTH    = META.pokeStrength    ?? POKE_STRENGTH;

          if (typeof META.userX === 'number') USER_X = META.userX;
          if (typeof META.userY === 'number') USER_Y = META.userY;

          if (typeof META.userTime === 'number' && META.userTime > 0) {
            USER_TIME = META.userTime;
          } else {
            USER_TIME = nowMs();
          }
        } catch (ERR) {
          console.warn('Could not parse constellationMeta, skipping meta restore.', ERR);
        }
      }

      return;
    }

    createStars();
  } catch (ERR) {
    console.error('Could not parse saved stars, recreating.', ERR);
    createStars();
  }
}

function createStars() {
  if (!HAS_CANVAS) return;

  STARS = [];

  const MIN_STAR_SIZE = 3;
  const MAX_STAR_SIZE = SCREEN_SIZE / 400 || 3;

  for (let STAR_INDEX = 0; STAR_INDEX < MAX_STAR_COUNT; STAR_INDEX++) {
    STARS.push({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      vx: RANDOM_BETWEEN(-0.25, 0.25),
      vy: RANDOM_BETWEEN(-0.25, 0.25),
      size: RANDOM_BETWEEN(
        Math.min(MIN_STAR_SIZE, MAX_STAR_SIZE),
        Math.max(MIN_STAR_SIZE, MAX_STAR_SIZE)
      ),
      opacity: RANDOM_BETWEEN(0.005, 1.8),
      fadeSpeed: RANDOM_BETWEEN(1, 2.1),
      redValue: RANDOM_BETWEEN(0, 200),
      whiteValue: 0,
      momentumX: 0,
      momentumY: 0,
      edge: 1
    });
  }
}
//#endregion



//#region 5) UI CONTROLS (STEPPERS + BINDINGS)
/*========================================*
 *  HOLD-TO-REPEAT STEPPERS
 *========================================*/

function enableStepperHold(BUTTON, ON_STEP) {
  let HOLD_TIMER = null;
  let REPEAT_TIMER = null;

  const INITIAL_DELAY_MS = 350;
  const START_INTERVAL_MS = 120;
  const MIN_INTERVAL_MS = 40;
  const ACCELERATION = 0.88;

  const startHold = () => {
    let INTERVAL = START_INTERVAL_MS;
    ON_STEP();

    HOLD_TIMER = setTimeout(() => {
      REPEAT_TIMER = setInterval(() => {
        ON_STEP();
        INTERVAL = Math.max(MIN_INTERVAL_MS, INTERVAL * ACCELERATION);

        clearInterval(REPEAT_TIMER);
        REPEAT_TIMER = setInterval(ON_STEP, INTERVAL);
      }, INTERVAL);
    }, INITIAL_DELAY_MS);
  };

  const stopHold = () => {
    clearTimeout(HOLD_TIMER);
    clearInterval(REPEAT_TIMER);
    HOLD_TIMER = null;
    REPEAT_TIMER = null;
  };

  BUTTON.addEventListener('mousedown', (E) => {
    E.preventDefault();
    startHold();
  });
  BUTTON.addEventListener('mouseup', stopHold);
  BUTTON.addEventListener('mouseleave', stopHold);

  BUTTON.addEventListener(
    'touchstart',
    (E) => {
      E.preventDefault();
      startHold();
    },
    { passive: false }
  );

  BUTTON.addEventListener('touchend', stopHold);
  BUTTON.addEventListener('touchcancel', stopHold);
}

/*========================================*
 *  GRAVITY PARAMS (bound to UI)
 *========================================*/

let ATTRACT_STRENGTH = 50;
let ATTRACT_RADIUS = 50;
let ATTRACT_SCALE = 5;
let CLAMP = 5;
let REPEL_STRENGTH = 50;
let REPEL_RADIUS = 50;
let REPEL_SCALE = 5;
let POKE_STRENGTH = 5;

function bindControl(ID, SETTER_FN, INITIAL_VALUE) {
  const SLIDER = document.getElementById(ID);
  if (!SLIDER) return false;

  const NUMBER_INPUT = document.getElementById(ID + '_num');

  const CONTROL_BLOCK = SLIDER.closest('.controlBlock');
  const STEP_BUTTONS = CONTROL_BLOCK
    ? CONTROL_BLOCK.querySelectorAll('.stepBtn[data-step]')
    : [];

  const MIN = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);
  const MAX = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

  const RAW_STEP = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);
  const STEP = Number.isFinite(RAW_STEP) && RAW_STEP > 0 ? RAW_STEP : 1;

  const clampValue = (VALUE) => Math.min(MAX, Math.max(MIN, VALUE));

  const snapToStep = (VALUE) => {
    if (!Number.isFinite(STEP) || STEP <= 0) return VALUE;

    const SNAPPED = MIN + Math.round((VALUE - MIN) / STEP) * STEP;
    const DECIMALS = (String(STEP).split('.')[1] || '').length;

    return Number(SNAPPED.toFixed(DECIMALS));
  };

  const applyValue = (VALUE) => {
    VALUE = Number(VALUE);
    if (!Number.isFinite(VALUE)) return;

    VALUE = clampValue(VALUE);
    VALUE = snapToStep(VALUE);

    SLIDER.value = String(VALUE);
    if (NUMBER_INPUT) NUMBER_INPUT.value = String(VALUE);

    SETTER_FN(VALUE);

    SLIDER.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const nudge = (DIR) => {
    const CURRENT = Number(SLIDER.value);
    applyValue(CURRENT + DIR * STEP);
  };

  applyValue(INITIAL_VALUE ?? SLIDER.value);

  SLIDER.addEventListener('input', () => applyValue(SLIDER.value));

  if (NUMBER_INPUT) {
    NUMBER_INPUT.addEventListener('input', () => applyValue(NUMBER_INPUT.value));
    NUMBER_INPUT.addEventListener('change', () => applyValue(NUMBER_INPUT.value));
  }

  STEP_BUTTONS.forEach((BTN) => {
    const DIR = Number(BTN.dataset.step) || 0;
    if (!DIR) return;
    enableStepperHold(BTN, () => nudge(DIR));
  });

  return true;
}

function initGravityControlsIfPresent() {
  if (!document.getElementById('ATTRACT_STRENGTH') &&
      !document.getElementById('REPEL_STRENGTH')) {
    return;
  }

  bindControl('ATTRACT_STRENGTH', (V) => (ATTRACT_STRENGTH = V), ATTRACT_STRENGTH);
  bindControl('ATTRACT_RADIUS',   (V) => (ATTRACT_RADIUS   = V), ATTRACT_RADIUS);
  bindControl('ATTRACT_SCALE',    (V) => (ATTRACT_SCALE    = V), ATTRACT_SCALE);

  bindControl('CLAMP',            (V) => (CLAMP            = V), CLAMP);

  bindControl('REPEL_STRENGTH',   (V) => (REPEL_STRENGTH   = V), REPEL_STRENGTH);
  bindControl('REPEL_RADIUS',     (V) => (REPEL_RADIUS     = V), REPEL_RADIUS);
  bindControl('REPEL_SCALE',      (V) => (REPEL_SCALE      = V), REPEL_SCALE);

  bindControl('POKE_STRENGTH',    (V) => (POKE_STRENGTH    = V), POKE_STRENGTH);
}

document.addEventListener('DOMContentLoaded', initGravityControlsIfPresent);
//#endregion



//#region 6) PHYSICS (MOVE STARS)
/*========================================*
 *  MOVE STARS
 *========================================*/

function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;

  const INFLUENCE_RANGE = SCREEN_SIZE * 0.2;
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;
  const WRAP_DISTANCE_SQ = 200 * 200;

  for (const STAR of STARS) {
    const DELTA_X = USER_X - STAR.x;
    const DELTA_Y = USER_Y - STAR.y;

    // De-lag: squared distance first (no sqrt yet)
    const DIST_SQ = DELTA_X * DELTA_X + DELTA_Y * DELTA_Y;

    if (DIST_SQ < INFLUENCE_RANGE_SQ) {
      const DIST = Math.sqrt(DIST_SQ) + 0.0001;

      const TO_USER_X = DELTA_X / DIST;
      const TO_USER_Y = DELTA_Y / DIST;

      // Linear gradients
      let ATTR_GRADIENT =
        1 - (DIST / (((ATTRACT_RADIUS * 5.2) * SCALED_ATT_GRA) || 1));

      let REPEL_GRADIENT =
        1 - (DIST / (((REPEL_RADIUS * 2.8) * SCALED_REP_GRA) || 1));

      ATTR_GRADIENT = Math.max(0, ATTR_GRADIENT);
      REPEL_GRADIENT = Math.max(0, REPEL_GRADIENT);

      const ATTR_SHAPE = Math.pow(
        ATTR_GRADIENT,
        Math.max(0.1, ((ATTRACT_SCALE * 0.48) * SCALED_ATT_SHA))
      );

      const REPEL_SHAPE = Math.pow(
        REPEL_GRADIENT,
        Math.max(0.1, (REPEL_SCALE * 0.64))
      );

      const ATTRACT =
        ((ATTRACT_STRENGTH * 0.006) * SCALED_ATT) *
        USER_SPEED *
        ATTR_SHAPE;

      const REPEL =
        ((REPEL_STRENGTH * 0.0182) * SCALED_REP) *
        USER_SPEED *
        REPEL_SHAPE;

      STAR.momentumX += ATTRACT * TO_USER_X;
      STAR.momentumY += ATTRACT * TO_USER_Y;

      STAR.momentumX += REPEL * -TO_USER_X;
      STAR.momentumY += REPEL * -TO_USER_Y;

      const POKE_FORCE = (0.01 * POKE_STRENGTH) * POKE_TIMER * REPEL_SHAPE;
      STAR.momentumX += POKE_FORCE * -TO_USER_X;
      STAR.momentumY += POKE_FORCE * -TO_USER_Y;
    }

    // Baseline drift boosted by interaction
    STAR.momentumX += STAR.vx * Math.min(10, 0.05 * USER_SPEED);
    STAR.momentumY += STAR.vy * Math.min(10, 0.05 * USER_SPEED);

    // Clamp force magnitude (matches original behavior)
    let FORCE_X = STAR.momentumX;
    let FORCE_Y = STAR.momentumY;

    const LIMIT = CLAMP * (SCALE_TO_SCREEN ** 2);
    const FORCE_MAG = Math.sqrt(FORCE_X * FORCE_X + FORCE_Y * FORCE_Y);

    if (FORCE_MAG > LIMIT) {
      const SCALE = LIMIT / FORCE_MAG;
      FORCE_X *= SCALE;
      FORCE_Y *= SCALE;
    }

    STAR.x += STAR.vx + FORCE_X;
    STAR.y += STAR.vy + FORCE_Y;

    STAR.momentumX *= 0.98;
    STAR.momentumY *= 0.98;

    // Wrap vs bounce
    if (CIRCLE_TIMER == 0 || DIST_SQ > WRAP_DISTANCE_SQ || POKE_TIMER > 1000) {
      const DRAW_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < -DRAW_RADIUS) STAR.x = CANVAS_WIDTH + DRAW_RADIUS;
      else if (STAR.x > CANVAS_WIDTH + DRAW_RADIUS) STAR.x = -DRAW_RADIUS;

      if (STAR.y < -DRAW_RADIUS) STAR.y = CANVAS_HEIGHT + DRAW_RADIUS;
      else if (STAR.y > CANVAS_HEIGHT + DRAW_RADIUS) STAR.y = -DRAW_RADIUS;
    } else {
      const DRAW_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < DRAW_RADIUS) {
        STAR.x = 2 * DRAW_RADIUS - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      } else if (STAR.x > CANVAS_WIDTH - DRAW_RADIUS) {
        STAR.x = 2 * (CANVAS_WIDTH - DRAW_RADIUS) - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      }

      if (STAR.y < DRAW_RADIUS) {
        STAR.y = 2 * DRAW_RADIUS - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      } else if (STAR.y > CANVAS_HEIGHT - DRAW_RADIUS) {
        STAR.y = 2 * (CANVAS_HEIGHT - DRAW_RADIUS) - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      }
    }

    // Flash decay
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    // Opacity cycle
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }
  }

  // Global decay
  USER_SPEED *= 0.5;
  if (USER_SPEED < 0.001) USER_SPEED = 0;

  CIRCLE_TIMER *= 0.9;
  if (CIRCLE_TIMER < 0.1) CIRCLE_TIMER = 0;

  POKE_TIMER *= 0.85;
  if (POKE_TIMER < 1) POKE_TIMER = 0;

  // Debug readouts (same behavior as original)
  const MISC_DEBUG = 0; // <-- Change this to any variable to see live updates
  const DBG_MISC = document.getElementById('miscDbg');
  if (DBG_MISC) DBG_MISC.textContent = MISC_DEBUG.toFixed(3);

  const DBG_CIRCLE = document.getElementById('dbgCircle');
  if (DBG_CIRCLE) DBG_CIRCLE.textContent = CIRCLE_TIMER.toFixed(3);

  const DBG_SPEED = document.getElementById('dbgSpeed');
  if (DBG_SPEED) DBG_SPEED.textContent = USER_SPEED.toFixed(3);

  const DBG_POKE = document.getElementById('dbgPoke');
  if (DBG_POKE) DBG_POKE.textContent = POKE_TIMER.toFixed(1);
}
//#endregion



//#region 7) RENDERING (STARS + LINKS + RING)
/*========================================*
 *  DRAWING
 *========================================*/

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const USE_BUCKETED_PATHS = !IS_IOS; // buckets on Mac/PC, simple strokes on iPhone
const LINK_BUCKET_COUNT = 18;
let LINK_PATHS = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D());

function resetLinkPaths() {
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {
    LINK_PATHS[BUCKET_INDEX] = new Path2D();
  }
}

function drawStarsWithLines() {
  if (!HAS_CANVAS || !BRUSH) return;

  BRUSH.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Pointer ring
  if (!window.REMOVE_CIRCLE) {
    const RING_RADIUS = SCALE_TO_SCREEN * 100 - 40;
    const RING_WIDTH = CIRCLE_TIMER * 0.15 + 1.5;
    const RING_ALPHA = Math.min(CIRCLE_TIMER * 0.07, 1);

    if (USER_TIME > 0 && RING_ALPHA > 0.001) {
      BRUSH.save();
      BRUSH.lineWidth = RING_WIDTH;
      BRUSH.strokeStyle = 'rgba(0, 0, 0, 1)';
      BRUSH.globalAlpha = RING_ALPHA;

      BRUSH.beginPath();
      BRUSH.arc(USER_X, USER_Y, RING_RADIUS, 0, Math.PI * 2);
      BRUSH.stroke();

      BRUSH.restore();
    }
  }

  // Links
    // Lines between nearby stars
  BRUSH.lineWidth = 1;

  const STAR_COUNT = STARS.length;
  if (STAR_COUNT) {
    for (let STAR_INDEX = 0; STAR_INDEX < STAR_COUNT; STAR_INDEX++) {
      STARS[STAR_INDEX].edge = edgeFactor(STARS[STAR_INDEX]);
    }

    const DIST_SCALE = SCREEN_SIZE / 1100;
    const CUTOFF_RAW = MAX_LINK_DISTANCE / DIST_SCALE;
    const CUTOFF2 = CUTOFF_RAW * CUTOFF_RAW;

    if (!USE_BUCKETED_PATHS) {
      // ✅ iPhone: old-school simple draw (no Path2D allocations)
      for (let I = 0; I < STAR_COUNT; I++) {
        const A = STARS[I];
        for (let J = I + 1; J < STAR_COUNT; J++) {
          const B = STARS[J];

          const DX = A.x - B.x;
          const DY = A.y - B.y;
          const D2 = DX * DX + DY * DY;
          if (D2 > CUTOFF2) continue;

          const DIST = Math.sqrt(D2) * DIST_SCALE;

          let ALPHA = (1 - DIST / MAX_LINK_DISTANCE) * ((A.opacity + B.opacity) / 2);
          ALPHA *= Math.min(A.edge, B.edge);
          if (ALPHA <= 0.002) continue;

          BRUSH.strokeStyle = `rgba(0, 0, 0, ${ALPHA})`;
          BRUSH.beginPath();
          BRUSH.moveTo(A.x, A.y);
          BRUSH.lineTo(B.x, B.y);
          BRUSH.stroke();
        }
      }
    } else {
      // ✅ Desktop: bucketed Path2D (fewer stroke calls)
      resetLinkPaths();

      for (let I = 0; I < STAR_COUNT; I++) {
        const A = STARS[I];
        const AX = A.x, AY = A.y;
        const A_OP = A.opacity;
        const A_EDGE = A.edge;

        for (let J = I + 1; J < STAR_COUNT; J++) {
          const B = STARS[J];

          const DX = AX - B.x;
          const DY = AY - B.y;
          const D2 = DX * DX + DY * DY;
          if (D2 > CUTOFF2) continue;

          const DIST = Math.sqrt(D2) * DIST_SCALE;

          let ALPHA = (1 - DIST / MAX_LINK_DISTANCE) * ((A_OP + B.opacity) / 2);
          ALPHA *= Math.min(A_EDGE, B.edge);
          if (ALPHA <= 0.002) continue;

          let BUCKET = (ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;
          if (BUCKET < 0) BUCKET = 0;
          if (BUCKET >= LINK_BUCKET_COUNT) BUCKET = LINK_BUCKET_COUNT - 1;

          LINK_PATHS[BUCKET].moveTo(AX, AY);
          LINK_PATHS[BUCKET].lineTo(B.x, B.y);
        }
      }

      for (let B = 0; B < LINK_BUCKET_COUNT; B++) {
        const BUCKET_ALPHA = (B + 1) / LINK_BUCKET_COUNT;
        BRUSH.strokeStyle = `rgba(0, 0, 0, ${BUCKET_ALPHA})`;
        BRUSH.stroke(LINK_PATHS[B]);
      }
    }
  }

    for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {
      const BUCKET_ALPHA = (BUCKET_INDEX + 1) / LINK_BUCKET_COUNT;
      BRUSH.strokeStyle = `rgba(0, 0, 0, ${BUCKET_ALPHA})`;
      BRUSH.stroke(LINK_PATHS[BUCKET_INDEX]);
    }
  }

  // Star bodies
  for (const STAR of STARS) {
    let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
    if (TEMP_RED > 255) TEMP_RED = 255;

    BRUSH.beginPath();
    BRUSH.fillStyle = `rgba(${TEMP_RED}, ${255 * STAR.whiteValue}, ${255 * STAR.whiteValue}, ${STAR.opacity})`;
    BRUSH.arc(STAR.x, STAR.y, STAR.whiteValue * 2 + STAR.size, 0, Math.PI * 2);
    BRUSH.fill();
  }
}

window.forceStarfieldRedraw = () => {
  if (!BRUSH || !CANVAS) return;
  drawStarsWithLines();
};
//#endregion



//#region 8) RESIZE + ANIMATION
/*========================================*
 *  RESIZE
 *========================================*/

function resizeCanvas() {
  if (!HAS_CANVAS) return;

  const OLD_WIDTH = CANVAS_WIDTH;
  const OLD_HEIGHT = CANVAS_HEIGHT;
  const OLD_SCREEN_SIZE = SCREEN_SIZE || 1;

  CANVAS_WIDTH = window.innerWidth || 0;
  CANVAS_HEIGHT = window.innerHeight || 0;

  CANVAS.width = CANVAS_WIDTH;
  CANVAS.height = CANVAS_HEIGHT;

  SCREEN_SIZE = CANVAS_WIDTH + CANVAS_HEIGHT;
  SCALE_TO_SCREEN = Math.pow(SCREEN_SIZE / 1200, 0.35);
  MAX_STAR_COUNT = Math.min(450, SCREEN_SIZE / 10);
  MAX_LINK_DISTANCE = SCREEN_SIZE / 10;

  // ✅ Precompute scaling powers here (keeps moveStars lean)
  SCALED_ATT_GRA = SCALE_TO_SCREEN ** 1.11;
  SCALED_REP_GRA = SCALE_TO_SCREEN ** 0.66;
  SCALED_ATT_SHA = SCALE_TO_SCREEN ** -8.89;
  SCALED_ATT = SCALE_TO_SCREEN ** -8.46;
  SCALED_REP = SCALE_TO_SCREEN ** -0.89;

  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0) {
    const SCALE_X = CANVAS_WIDTH / OLD_WIDTH;
    const SCALE_Y = CANVAS_HEIGHT / OLD_HEIGHT;
    const SIZE_SCALE = SCREEN_SIZE / OLD_SCREEN_SIZE;

    for (const STAR of STARS) {
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SIZE_SCALE;
    }
  }
}

function animate() {
  if (!HAS_CANVAS) return;
  if (!FREEZE_CONSTELLATION) moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}
//#endregion



//#region 9) POINTER INPUT
/*========================================*
 *  POINTER INPUT
 *========================================*/

function updateSpeed(POINTER_X, POINTER_Y, EVENT_TIME_STAMP) {
  const TIME = normalizeEventTime(EVENT_TIME_STAMP);

  const DT = Math.max(1, TIME - USER_TIME);
  const DX = POINTER_X - USER_X;
  const DY = POINTER_Y - USER_Y;

  const RAW_USER_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;

  USER_SPEED = Math.min(RAW_USER_SPEED * 50, 50);
  CIRCLE_TIMER = Math.max(CIRCLE_TIMER, USER_SPEED);

  USER_X = POINTER_X;
  USER_Y = POINTER_Y;
  USER_TIME = TIME;
}

function startPointerInteraction(POINTER_X, POINTER_Y, EVENT_TIME_STAMP) {
  POKE_TIMER = 2500;
  updateSpeed(POINTER_X, POINTER_Y, EVENT_TIME_STAMP);
}

window.addEventListener('mousemove', (E) =>
  updateSpeed(E.clientX, E.clientY, E.timeStamp)
);

window.addEventListener('mousedown', (E) =>
  startPointerInteraction(E.clientX, E.clientY, E.timeStamp)
);

window.addEventListener('touchstart', (E) => {
  const TOUCH = E.touches[0];
  if (!TOUCH) return;
  startPointerInteraction(TOUCH.clientX, TOUCH.clientY, E.timeStamp);
});

window.addEventListener('touchmove', (E) => {
  const TOUCH = E.touches[0];
  if (!TOUCH) return;
  updateSpeed(TOUCH.clientX, TOUCH.clientY, E.timeStamp);
});
//#endregion



//#region 10) BOOTSTRAP
/*========================================*
 *  STARTUP
 *========================================*/

function sizesReady() {
  return (
    Number.isFinite(CANVAS_WIDTH) &&
    Number.isFinite(CANVAS_HEIGHT) &&
    CANVAS_WIDTH > 50 &&
    CANVAS_HEIGHT > 50
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
} catch (ERR) {
  console.error('Initialization error in starfield script:', ERR);
}
//#endregion

// Joke: Your Mac timestamp was living in 1970 and filing taxes in the future. We escorted it gently back into “now.” 🕰️😄