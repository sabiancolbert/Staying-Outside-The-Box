// thank heavens for chatGPT <3

/*==============================================================*
 *                         STARFIELD SCRIPT
 *==============================================================*
 *  What this file does:
 *   1) Canvas setup + resize scaling
 *   2) Star storage (localStorage) + restore
 *   3) Star creation + physics (attract/repel/poke) + wrap/bounce
 *   4) Pointer input (mouse/touch) -> speed + timers
 *   5) Rendering (stars + connection lines + optional ring)
 *
 *  Performance principles used here:
 *   - Avoid per-frame allocations (no per-frame Path2D creation)
 *   - Hoist constants out of inner loops
 *   - Early-outs using squared distance checks
 *   - Lazy DOM lookups for debug nodes (prevents “cached null forever”)
 *==============================================================*/


//#region 1) CANVAS + GLOBAL STATE
/*========================================*
 *  CANVAS + GLOBAL STATE
 *========================================*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && BRUSH);

if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}

// Runtime guards
let FREEZE_CONSTELLATION = false;
let ANIMATION_STARTED = false;
let RESIZE_WIRED = false;
let STARS_INITIALIZED = false;

// Pointer state + timers
let USER_X = 0;
let USER_Y = 0;
let USER_TIME_MS = 0;
let USER_SPEED = 0;
let POKE_TIMER = 0;
let CIRCLE_TIMER = 0;

// Cross-script flag (preserved across pages if set earlier)
window.REMOVE_CIRCLE = window.REMOVE_CIRCLE ?? false;

// Canvas sizing + scaling
let CANVAS_WIDTH = 0;
let CANVAS_HEIGHT = 0;
let SCREEN_SIZE = 0;          // width + height
let SCALE_TO_SCREEN = 0;      // general scale helper
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

// Star data
let STARS = [];

//#endregion



//#region 2) TIME + RANDOM HELPERS
/*========================================*
 *  TIME + RANDOM HELPERS
 *========================================*/

function NOW_MS() {
  return (window.performance && performance.now) ? performance.now() : Date.now();
}

function RAND_BETWEEN(MIN, MAX) {
  return Math.random() * (MAX - MIN) + MIN;
}

//#endregion



//#region 3) STORAGE (localStorage)
/*========================================*
 *  STORAGE (localStorage)
 *========================================*/

function SAVE_STARS_TO_STORAGE() {
  if (!HAS_CANVAS) return;

  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,

        pokeTimer: POKE_TIMER,
        userSpeed: USER_SPEED,
        userX: USER_X,
        userY: USER_Y,
        userTime: USER_TIME_MS,

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

window.addEventListener('beforeunload', SAVE_STARS_TO_STORAGE);

//#endregion



//#region 4) GRAVITY CONTROLS (UI -> JS)
/*========================================*
 *  GRAVITY CONTROLS (UI -> JS)
 *========================================*
 *  Expected markup per control:
 *   - Range input:  #ID
 *   - Number input: #ID_num (optional)
 *   - Step buttons: .stepBtn[data-step="-1|1"] inside .controlBlock (optional)
 *
 *  Notes:
 *   - Initialization reads from the JS value (which may have been restored)
 *   - Slider fill sync is maintained via dispatching an 'input' event
 *========================================*/

// These are LET on purpose: UI modifies them live.
let ATTRACT_STRENGTH = 50;
let ATTRACT_RADIUS = 50;
let ATTRACT_SCALE = 5;

let CLAMP = 5;

let REPEL_STRENGTH = 50;
let REPEL_RADIUS = 50;
let REPEL_SCALE = 5;

let POKE_STRENGTH = 5;

// Precomputed scale multipliers (updated on resize)
let SCALED_ATT_GRA = 0;
let SCALED_REP_GRA = 0;
let SCALED_ATT_SHA = 0;
let SCALED_ATT = 0;
let SCALED_REP = 0;

function ENABLE_STEPPER_HOLD(BUTTON, ON_STEP) {
  let HOLD_TIMEOUT = null;
  let REPEAT_INTERVAL = null;

  const INITIAL_DELAY_MS = 350;
  const START_INTERVAL_MS = 120;
  const MIN_INTERVAL_MS = 40;
  const ACCEL = 0.88;

  const START_HOLD = () => {
    let INTERVAL_MS = START_INTERVAL_MS;

    // Immediate first step
    ON_STEP();

    HOLD_TIMEOUT = setTimeout(() => {
      REPEAT_INTERVAL = setInterval(() => {
        ON_STEP();

        INTERVAL_MS = Math.max(MIN_INTERVAL_MS, INTERVAL_MS * ACCEL);

        // Restart interval to apply acceleration
        clearInterval(REPEAT_INTERVAL);
        REPEAT_INTERVAL = setInterval(ON_STEP, INTERVAL_MS);
      }, INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  };

  const STOP_HOLD = () => {
    clearTimeout(HOLD_TIMEOUT);
    clearInterval(REPEAT_INTERVAL);
    HOLD_TIMEOUT = null;
    REPEAT_INTERVAL = null;
  };

  // Mouse
  BUTTON.addEventListener('mousedown', (E) => {
    E.preventDefault();
    START_HOLD();
  });
  BUTTON.addEventListener('mouseup', STOP_HOLD);
  BUTTON.addEventListener('mouseleave', STOP_HOLD);

  // Touch
  BUTTON.addEventListener('touchstart', (E) => {
    E.preventDefault();
    START_HOLD();
  }, { passive: false });

  BUTTON.addEventListener('touchend', STOP_HOLD);
  BUTTON.addEventListener('touchcancel', STOP_HOLD);
}

function BIND_CONTROL(CONTROL_ID, SETTER, INITIAL_VALUE) {
  const SLIDER_EL = document.getElementById(CONTROL_ID);
  if (!SLIDER_EL) return false;

  const NUMBER_EL = document.getElementById(CONTROL_ID + '_num');

  const CONTROL_BLOCK = SLIDER_EL.closest('.controlBlock');
  const STEP_BUTTONS = CONTROL_BLOCK
    ? CONTROL_BLOCK.querySelectorAll('.stepBtn[data-step]')
    : [];

  const MIN_VAL = Number(SLIDER_EL.min || (NUMBER_EL && NUMBER_EL.min) || 0);
  const MAX_VAL = Number(SLIDER_EL.max || (NUMBER_EL && NUMBER_EL.max) || 10);

  const RAW_STEP = Number(SLIDER_EL.step || (NUMBER_EL && NUMBER_EL.step) || 1);
  const STEP_VAL = Number.isFinite(RAW_STEP) && RAW_STEP > 0 ? RAW_STEP : 1;

  const CLAMP_VAL = (V) => Math.min(MAX_VAL, Math.max(MIN_VAL, V));

  const SNAP_TO_STEP = (V) => {
    if (!Number.isFinite(STEP_VAL) || STEP_VAL <= 0) return V;

    const SNAPPED = MIN_VAL + Math.round((V - MIN_VAL) / STEP_VAL) * STEP_VAL;
    const DECIMALS = (String(STEP_VAL).split('.')[1] || '').length;
    return Number(SNAPPED.toFixed(DECIMALS));
  };

  const APPLY = (V) => {
    let NEXT = Number(V);
    if (!Number.isFinite(NEXT)) return;

    NEXT = CLAMP_VAL(NEXT);
    NEXT = SNAP_TO_STEP(NEXT);

    SLIDER_EL.value = String(NEXT);
    if (NUMBER_EL) NUMBER_EL.value = String(NEXT);

    SETTER(NEXT);

    // Keep slider visuals (like gradient fill) in sync if you have them
    SLIDER_EL.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const NUDGE = (DIR) => {
    const CURRENT = Number(SLIDER_EL.value);
    const NEXT = CURRENT + DIR * STEP_VAL;
    APPLY(NEXT);
  };

  // Initialize from JS value (restored state wins)
  APPLY(INITIAL_VALUE ?? SLIDER_EL.value);

  SLIDER_EL.addEventListener('input', () => APPLY(SLIDER_EL.value));

  if (NUMBER_EL) {
    NUMBER_EL.addEventListener('input', () => APPLY(NUMBER_EL.value));
    NUMBER_EL.addEventListener('change', () => APPLY(NUMBER_EL.value));
  }

  STEP_BUTTONS.forEach((BTN) => {
    const DIR = Number(BTN.dataset.step) || 0;
    if (!DIR) return;
    ENABLE_STEPPER_HOLD(BTN, () => NUDGE(DIR));
  });

  return true;
}

function INIT_GRAVITY_CONTROLS_IF_PRESENT() {
  // Bail quickly if this page has no controls
  if (!document.getElementById('ATTRACT_STRENGTH') &&
      !document.getElementById('REPEL_STRENGTH')) {
    return;
  }

  BIND_CONTROL('ATTRACT_STRENGTH', (V) => { ATTRACT_STRENGTH = V; }, ATTRACT_STRENGTH);
  BIND_CONTROL('ATTRACT_RADIUS',   (V) => { ATTRACT_RADIUS = V; },   ATTRACT_RADIUS);
  BIND_CONTROL('ATTRACT_SCALE',    (V) => { ATTRACT_SCALE = V; },    ATTRACT_SCALE);

  BIND_CONTROL('CLAMP',            (V) => { CLAMP = V; },            CLAMP);

  BIND_CONTROL('REPEL_STRENGTH',   (V) => { REPEL_STRENGTH = V; },   REPEL_STRENGTH);
  BIND_CONTROL('REPEL_RADIUS',     (V) => { REPEL_RADIUS = V; },     REPEL_RADIUS);
  BIND_CONTROL('REPEL_SCALE',      (V) => { REPEL_SCALE = V; },      REPEL_SCALE);

  BIND_CONTROL('POKE_STRENGTH',    (V) => { POKE_STRENGTH = V; },    POKE_STRENGTH);
}

document.addEventListener('DOMContentLoaded', INIT_GRAVITY_CONTROLS_IF_PRESENT);

//#endregion



//#region 5) STARFIELD INIT (CREATE + RESTORE)
/*========================================*
 *  STARFIELD INIT (CREATE + RESTORE)
 *========================================*/

function CREATE_STARS() {
  if (!HAS_CANVAS) return;

  STARS = [];

  // Keep size range valid even on very small screens
  const MIN_STAR_SIZE = 3;
  const MAX_STAR_SIZE = SCREEN_SIZE / 400 || 3;

  const SIZE_LO = Math.min(MIN_STAR_SIZE, MAX_STAR_SIZE);
  const SIZE_HI = Math.max(MIN_STAR_SIZE, MAX_STAR_SIZE);

  for (let STAR_INDEX = 0; STAR_INDEX < MAX_STAR_COUNT; STAR_INDEX++) {
    STARS.push({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,

      vx: RAND_BETWEEN(-0.25, 0.25),
      vy: RAND_BETWEEN(-0.25, 0.25),

      size: RAND_BETWEEN(SIZE_LO, SIZE_HI),

      opacity: RAND_BETWEEN(0.005, 1.8),
      fadeSpeed: RAND_BETWEEN(1, 2.1),

      redValue: RAND_BETWEEN(0, 200),
      whiteValue: 0,

      momentumX: 0,
      momentumY: 0,

      edge: 0
    });
  }
}

function INIT_STARS() {
  if (!HAS_CANVAS) return;

  let SAVED_STARS_RAW = null;

  try {
    SAVED_STARS_RAW = localStorage.getItem('constellationStars');
  } catch (ERR) {
    console.warn('Could not read constellationStars from storage:', ERR);
    CREATE_STARS();
    return;
  }

  if (!SAVED_STARS_RAW) {
    CREATE_STARS();
    return;
  }

  try {
    const PARSED_STARS = JSON.parse(SAVED_STARS_RAW);

    if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
      CREATE_STARS();
      return;
    }

    STARS = PARSED_STARS;

    let SAVED_META_RAW = null;
    try {
      SAVED_META_RAW = localStorage.getItem('constellationMeta');
    } catch (ERR) {
      console.warn('Could not read constellationMeta from storage:', ERR);
    }

    if (!SAVED_META_RAW) return;

    try {
      const META = JSON.parse(SAVED_META_RAW);

      // Rescale coordinates from old canvas size to current
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

      // Restore state
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

      USER_TIME_MS = NOW_MS();
    } catch (ERR) {
      console.warn('Could not parse constellationMeta, skipping restore.', ERR);
    }
  } catch (ERR) {
    console.error('Could not parse saved stars, recreating.', ERR);
    CREATE_STARS();
  }
}

//#endregion



//#region 6) DEBUG (LAZY DOM LOOKUP)
/*========================================*
 *  DEBUG READOUTS
 *========================================*
 *  Notes:
 *   - Lazy DOM lookups avoid caching null if nodes are not yet in DOM.
 *   - Throttled to ~10fps to avoid text churn overhead.
 *========================================*/

let DEBUG_LAST_MS = 0;

function UPDATE_DEBUG() {
  const NOW = NOW_MS();
  if (NOW - DEBUG_LAST_MS < 100) return;
  DEBUG_LAST_MS = NOW;

  const DBG_MISC = document.getElementById('miscDbg');
  const DBG_CIRCLE = document.getElementById('dbgCircle');
  const DBG_SPEED = document.getElementById('dbgSpeed');
  const DBG_POKE = document.getElementById('dbgPoke');

  if (DBG_MISC) DBG_MISC.textContent = (0).toFixed(3); // Replace 0 with any variable to watch
  if (DBG_CIRCLE) DBG_CIRCLE.textContent = CIRCLE_TIMER.toFixed(3);
  if (DBG_SPEED) DBG_SPEED.textContent = USER_SPEED.toFixed(3);
  if (DBG_POKE) DBG_POKE.textContent = POKE_TIMER.toFixed(1);
}

//#endregion



//#region 7) PHYSICS (MOVE STARS)
/*========================================*
 *  PHYSICS (MOVE STARS)
 *========================================*
 *  Core ideas:
 *   - Use squared-distance checks for early outs
 *   - Only compute sqrt when inside influence range
 *   - Precompute common scale multipliers during resize
 *   - Keep your intentional clamp logic untouched (per request)
 *========================================*/

function MOVE_STARS() {
  if (!HAS_CANVAS || !STARS.length) return;

  // Hoisted constants (per-frame)
  const RANGE = SCREEN_SIZE * 0.2;
  const RANGE_SQ = RANGE * RANGE;

  const TOO_FAR = 200;
  const TOO_FAR_SQ = TOO_FAR * TOO_FAR;

  const DRIFT_BOOST = Math.min(10, 0.05 * USER_SPEED);

  // Pre-calc (per-frame)
  const LIMIT = CLAMP * (SCALE_TO_SCREEN ** 2);

  for (const STAR of STARS) {
    const X_TO_USER = USER_X - STAR.x;
    const Y_TO_USER = USER_Y - STAR.y;

    const DIST_SQ = X_TO_USER * X_TO_USER + Y_TO_USER * Y_TO_USER;

    // Influence ring only within range
    if (DIST_SQ < RANGE_SQ) {
      const DIST = Math.sqrt(DIST_SQ) || 0.0001;
      const DIR_X = X_TO_USER / DIST;
      const DIR_Y = Y_TO_USER / DIST;

      // Linear gradients (clamped later)
      let ATTR_GRAD =
        1 - (DIST / (((ATTRACT_RADIUS * 5.2) * SCALED_ATT_GRA) || 1));

      let REPEL_GRAD =
        1 - (DIST / (((REPEL_RADIUS * 2.8) * SCALED_REP_GRA) || 1));

      if (ATTR_GRAD < 0) ATTR_GRAD = 0;
      if (REPEL_GRAD < 0) REPEL_GRAD = 0;

      const ATTR_SHAPE = Math.pow(
        ATTR_GRAD,
        Math.max(0.1, ((ATTRACT_SCALE * 0.48) * SCALED_ATT_SHA))
      );

      const REPEL_SHAPE = Math.pow(
        REPEL_GRAD,
        Math.max(0.1, (REPEL_SCALE * 0.64))
      );

      const ATTRACT_FORCE =
        ((ATTRACT_STRENGTH * 0.006) * SCALED_ATT) *
        USER_SPEED *
        ATTR_SHAPE;

      const REPEL_FORCE =
        ((REPEL_STRENGTH * 0.0182) * SCALED_REP) *
        USER_SPEED *
        REPEL_SHAPE;

      // Apply forces
      STAR.momentumX += ATTRACT_FORCE * DIR_X;
      STAR.momentumY += ATTRACT_FORCE * DIR_Y;

      STAR.momentumX += REPEL_FORCE * -DIR_X;
      STAR.momentumY += REPEL_FORCE * -DIR_Y;

      // Poke (extra kick away)
      const POKE_FORCE = (0.01 * POKE_STRENGTH) * POKE_TIMER * REPEL_SHAPE;
      STAR.momentumX += POKE_FORCE * -DIR_X;
      STAR.momentumY += POKE_FORCE * -DIR_Y;
    }

    // Baseline drift (reacts to interaction)
    STAR.momentumX += STAR.vx * DRIFT_BOOST;
    STAR.momentumY += STAR.vy * DRIFT_BOOST;

    // Local force variables (so clamp doesn't permanently reduce momentum)
    let FORCE_X = STAR.momentumX;
    let FORCE_Y = STAR.momentumY;

    // Your intentional clamp logic preserved exactly (even if nonstandard)
    const FORCE_SQ = FORCE_X * FORCE_X + FORCE_Y * FORCE_Y;
    if (FORCE_SQ > LIMIT) {
      FORCE_X *= LIMIT / FORCE_SQ;
      FORCE_Y *= LIMIT / FORCE_SQ;
    }

    // Apply movement
    STAR.x += STAR.vx + FORCE_X;
    STAR.y += STAR.vy + FORCE_Y;

    // Momentum decay
    STAR.momentumX *= 0.98;
    STAR.momentumY *= 0.98;

    // Wrap vs bounce
    if (CIRCLE_TIMER === 0 || DIST_SQ > TOO_FAR_SQ || POKE_TIMER > 1000) {
      const DRAW_R = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < -DRAW_R) STAR.x = CANVAS_WIDTH + DRAW_R;
      else if (STAR.x > CANVAS_WIDTH + DRAW_R) STAR.x = -DRAW_R;

      if (STAR.y < -DRAW_R) STAR.y = CANVAS_HEIGHT + DRAW_R;
      else if (STAR.y > CANVAS_HEIGHT + DRAW_R) STAR.y = -DRAW_R;
    } else {
      const DRAW_R = (STAR.whiteValue * 2 + STAR.size) || 0;

      // Left/right
      if (STAR.x < DRAW_R) {
        STAR.x = 2 * DRAW_R - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      } else if (STAR.x > CANVAS_WIDTH - DRAW_R) {
        STAR.x = 2 * (CANVAS_WIDTH - DRAW_R) - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      }

      // Top/bottom
      if (STAR.y < DRAW_R) {
        STAR.y = 2 * DRAW_R - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      } else if (STAR.y > CANVAS_HEIGHT - DRAW_R) {
        STAR.y = 2 * (CANVAS_HEIGHT - DRAW_R) - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      }
    }

    // White flash decay
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

  UPDATE_DEBUG();
}

//#endregion



//#region 8) RENDERING (STARS + LINES + RING)
/*========================================*
 *  RENDERING (STARS + LINES + RING)
 *========================================*
 *  Big performance change:
 *   - No Path2D buckets, no per-frame allocations.
 *   - We draw each alpha-bucket using normal paths:
 *       beginPath -> many lineTo -> stroke
 *========================================*/

const LINE_BUCKETS = 18;

function EDGE_FACTOR(STAR) {
  const DRAW_R = (STAR.whiteValue * 2 + STAR.size) || 0;

  const LEFT = STAR.x + DRAW_R;
  const RIGHT = CANVAS_WIDTH + DRAW_R - STAR.x;
  const TOP = STAR.y + DRAW_R;
  const BOTTOM = CANVAS_HEIGHT + DRAW_R - STAR.y;

  const NEAREST = Math.min(LEFT, RIGHT, TOP, BOTTOM);

  const FADE_BAND = Math.min(90, SCREEN_SIZE * 0.03);

  let T = NEAREST / FADE_BAND;
  if (T < 0) T = 0;
  if (T > 1) T = 1;

  // Smoothstep
  return T * T * (3 - 2 * T);
}

function DRAW_STARS_WITH_LINES() {
  if (!HAS_CANVAS || !BRUSH) return;

  BRUSH.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Pointer ring
  if (!window.REMOVE_CIRCLE) {
    const RING_RADIUS = SCALE_TO_SCREEN * 100 - 40;
    const RING_WIDTH = CIRCLE_TIMER * 0.15 + 1.5;
    const RING_ALPHA = Math.min(CIRCLE_TIMER * 0.07, 1);

    if (USER_TIME_MS > 0 && RING_ALPHA > 0.001) {
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

  // Precompute edge fade once per star
  for (const STAR of STARS) {
    STAR.edge = EDGE_FACTOR(STAR);
  }

  // Connection lines (bucketed by alpha)
  BRUSH.lineWidth = 1;

  const COUNT = STARS.length;
  const DIST_SCALE = SCREEN_SIZE / 1100;
  const ST = STARS;
  const MAXD = MAX_LINK_DISTANCE;

  const CUTOFF = (MAXD / DIST_SCALE);
  const CUTOFF_SQ = CUTOFF * CUTOFF;

  // Draw bucket by bucket (each bucket gets one beginPath + stroke)
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINE_BUCKETS; BUCKET_INDEX++) {
    BRUSH.beginPath();

    const BUCKET_ALPHA = (BUCKET_INDEX + 1) / LINE_BUCKETS;

    for (let I = 0; I < COUNT; I++) {
      const A = ST[I];
      const AX = A.x;
      const AY = A.y;
      const AOP = A.opacity;
      const AEDGE = A.edge;

      for (let J = I + 1; J < COUNT; J++) {
        const B = ST[J];

        const DX = AX - B.x;
        const DY = AY - B.y;
        const D2 = DX * DX + DY * DY;

        if (D2 > CUTOFF_SQ) continue;

        const DIST = Math.sqrt(D2) * DIST_SCALE;

        let ALPHA = (1 - DIST / MAXD) * ((AOP + B.opacity) * 0.5);
        ALPHA *= Math.min(AEDGE, B.edge);

        if (ALPHA <= 0.002) continue;

        let BI = (ALPHA * (LINE_BUCKETS - 1)) | 0;
        if (BI < 0) BI = 0;
        if (BI >= LINE_BUCKETS) BI = LINE_BUCKETS - 1;

        if (BI !== BUCKET_INDEX) continue;

        BRUSH.moveTo(AX, AY);
        BRUSH.lineTo(B.x, B.y);
      }
    }

    BRUSH.strokeStyle = `rgba(0, 0, 0, ${BUCKET_ALPHA})`;
    BRUSH.stroke();
  }

  // Star bodies
  for (const STAR of STARS) {
    let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
    if (TEMP_RED > 255) TEMP_RED = 255;

    BRUSH.beginPath();
    BRUSH.fillStyle = `rgba(${TEMP_RED}, ${255 * STAR.whiteValue}, ${255 * STAR.whiteValue}, ${STAR.opacity})`;
    BRUSH.arc(
      STAR.x,
      STAR.y,
      STAR.whiteValue * 2 + STAR.size,
      0,
      Math.PI * 2
    );
    BRUSH.fill();
  }
}

// External redraw hook (other scripts can flip REMOVE_CIRCLE then call this)
window.forceStarfieldRedraw = () => {
  if (!BRUSH || !CANVAS) return;
  DRAW_STARS_WITH_LINES();
};

//#endregion



//#region 9) RESIZE + ANIMATION LOOP
/*========================================*
 *  RESIZE + ANIMATION LOOP
 *========================================*/

function RESIZE_CANVAS() {
  if (!HAS_CANVAS) return;

  const OLD_W = CANVAS_WIDTH;
  const OLD_H = CANVAS_HEIGHT;
  const OLD_SCREEN = SCREEN_SIZE || 1;

  CANVAS_WIDTH = window.innerWidth || 0;
  CANVAS_HEIGHT = window.innerHeight || 0;

  CANVAS.width = CANVAS_WIDTH;
  CANVAS.height = CANVAS_HEIGHT;

  SCREEN_SIZE = CANVAS_WIDTH + CANVAS_HEIGHT;

  SCALE_TO_SCREEN = Math.pow(SCREEN_SIZE / 1200, 0.35);
  MAX_STAR_COUNT = Math.min(450, SCREEN_SIZE / 10);
  MAX_LINK_DISTANCE = SCREEN_SIZE / 10;

  // Precompute scale multipliers used in physics
  SCALED_ATT_GRA = SCALE_TO_SCREEN ** 1.11;
  SCALED_REP_GRA = SCALE_TO_SCREEN ** 0.66;
  SCALED_ATT_SHA = SCALE_TO_SCREEN ** -8.89;
  SCALED_ATT = SCALE_TO_SCREEN ** -8.46;
  SCALED_REP = SCALE_TO_SCREEN ** -0.89;

  // Rescale existing stars to new canvas
  if (OLD_W !== 0 && OLD_H !== 0 && STARS.length) {
    const SCALE_X = CANVAS_WIDTH / OLD_W;
    const SCALE_Y = CANVAS_HEIGHT / OLD_H;
    const SCALE_SIZE = SCREEN_SIZE / OLD_SCREEN;

    for (const STAR of STARS) {
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SCALE_SIZE;
    }
  }
}

function ANIMATE() {
  if (!HAS_CANVAS) return;
  if (!FREEZE_CONSTELLATION) MOVE_STARS();
  DRAW_STARS_WITH_LINES();
  requestAnimationFrame(ANIMATE);
}

//#endregion



//#region 10) POINTER INPUT
/*========================================*
 *  POINTER INPUT (MOUSE / TOUCH)
 *========================================*/

function UPDATE_SPEED(NEW_X, NEW_Y) {
  const NOW = NOW_MS();

  const DT = Math.max(1, NOW - USER_TIME_MS);
  const DX = NEW_X - USER_X;
  const DY = NEW_Y - USER_Y;

  // Raw speed (pixels per ms)
  const RAW_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;

  USER_SPEED = Math.min(RAW_SPEED * 50, 50);
  CIRCLE_TIMER = Math.max(CIRCLE_TIMER, USER_SPEED);

  USER_X = NEW_X;
  USER_Y = NEW_Y;
  USER_TIME_MS = NOW;
}

function START_POINTER_INTERACTION(NEW_X, NEW_Y) {
  POKE_TIMER = 2500;
  UPDATE_SPEED(NEW_X, NEW_Y);
}

// Mouse
window.addEventListener('mousemove', (E) => UPDATE_SPEED(E.clientX, E.clientY));
window.addEventListener('mousedown', (E) => START_POINTER_INTERACTION(E.clientX, E.clientY));

// Touch
window.addEventListener('touchstart', (E) => {
  const TOUCH = E.touches[0];
  if (!TOUCH) return;
  START_POINTER_INTERACTION(TOUCH.clientX, TOUCH.clientY);
}, { passive: true });

window.addEventListener('touchmove', (E) => {
  const TOUCH = E.touches[0];
  if (!TOUCH) return;
  UPDATE_SPEED(TOUCH.clientX, TOUCH.clientY);
}, { passive: true });

//#endregion



//#region 11) BOOTSTRAP
/*========================================*
 *  BOOTSTRAP
 *========================================*/

function SIZES_READY() {
  return (
    Number.isFinite(CANVAS_WIDTH) &&
    Number.isFinite(CANVAS_HEIGHT) &&
    CANVAS_WIDTH > 50 &&
    CANVAS_HEIGHT > 50
  );
}

function START_STARFIELD() {
  RESIZE_CANVAS();

  // First-load guard: wait for real viewport sizes
  if (!SIZES_READY()) {
    requestAnimationFrame(START_STARFIELD);
    return;
  }

  if (!STARS_INITIALIZED) {
    STARS_INITIALIZED = true;
    INIT_STARS();
  }

  if (!ANIMATION_STARTED) {
    ANIMATION_STARTED = true;
    ANIMATE();
  }

  if (!RESIZE_WIRED) {
    RESIZE_WIRED = true;
    window.addEventListener('resize', RESIZE_CANVAS);
  }
}

try {
  START_STARFIELD();
} catch (ERR) {
  console.error('Initialization error in starfield script:', ERR);
}

//#endregion

// Joke: if this script gets any smoother, the stars are going to unionize for better working conditions. ✨🪧