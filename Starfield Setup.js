// thank heavens for chatGPT <3

/*==============================================================*
 *                     STARFIELD CORE (PART 1)
 *==============================================================*
 *  What this file does:
 *   1) Shared state container (window.STARFIELD)
 *   2) Canvas setup + runtime guards
 *   3) Storage (localStorage) save/restore/rescale
 *   4) Star creation
 *   5) UI controls: steppers + bindControl wiring
 *   6) Resize + animation loop bootstrap
 *
 *  What this file intentionally does NOT include:
 *   - Gravity params region (moved to Part 2)
 *   - moveStars region (moved to Part 2)
 *   - drawing region (moved to Part 2)
 *   - pointer updateSpeed + event listeners (moved to Part 2)
 *==============================================================*/

/*==============================================================*
 *  MENU
 *==============================================================*
 *  1) SHARED STATE (window.STARFIELD)
 *  2) CANVAS SETUP
 *  3) STORAGE: SAVE / RESTORE
 *  4) STAR CREATION
 *  5) UI CONTROLS: STEPPERS + BINDCONTROL
 *  6) RESIZE + ANIMATION + BOOTSTRAP
 *==============================================================*/

//#region 1) SHARED STATE (window.STARFIELD)
/*========================================*
 *  One shared object so two scripts can
 *  safely communicate.
 *========================================*/
window.STARFIELD = window.STARFIELD || {};

const SF = window.STARFIELD;

// Shared flags (persist across script files)
SF.FREEZE = SF.FREEZE ?? false;
SF.ANIM_STARTED = SF.ANIM_STARTED ?? false;
SF.RESIZE_WIRED = SF.RESIZE_WIRED ?? false;
SF.STARS_INIT = SF.STARS_INIT ?? false;

// Cross-script flag (you already use this)
window.REMOVE_CIRCLE = window.REMOVE_CIRCLE ?? false;

// Canvas + context (set below)
SF.CANVAS = SF.CANVAS ?? null;
SF.BRUSH = SF.BRUSH ?? null;
SF.HAS_CANVAS = SF.HAS_CANVAS ?? false;

// Pointer + timers (owned by SF so Part 2 can read/write)
SF.USER_X = SF.USER_X ?? 0;
SF.USER_Y = SF.USER_Y ?? 0;
SF.USER_TIME = SF.USER_TIME ?? 0;
SF.USER_SPEED = SF.USER_SPEED ?? 0;
SF.POKE_TIMER = SF.POKE_TIMER ?? 0;
SF.CIRCLE_TIMER = SF.CIRCLE_TIMER ?? 0;

// Sizes + scaling (owned by SF)
SF.W = SF.W ?? 0;
SF.H = SF.H ?? 0;
SF.SCREEN = SF.SCREEN ?? 0;
SF.SCALE = SF.SCALE ?? 1;
SF.MAX_STARS = SF.MAX_STARS ?? 0;
SF.MAX_LINK = SF.MAX_LINK ?? 0;

// Precomputed scaling powers (used in Part 2 physics)
SF.SCALED_ATT_GRA = SF.SCALED_ATT_GRA ?? 1;
SF.SCALED_REP_GRA = SF.SCALED_REP_GRA ?? 1;
SF.SCALED_ATT_SHA = SF.SCALED_ATT_SHA ?? 1;
SF.SCALED_ATT = SF.SCALED_ATT ?? 1;
SF.SCALED_REP = SF.SCALED_REP ?? 1;

// Stars array
SF.STARS = SF.STARS ?? [];

// Utility hooks exposed for Part 2
SF.nowMs = SF.nowMs || function nowMs() {
  return (window.performance && performance.now) ? performance.now() : Date.now();
};

// Timestamp normalizer (Mac/Safari fix)
SF.normalizeEventTime = SF.normalizeEventTime || function normalizeEventTime(TS) {
  if (!Number.isFinite(TS) || TS <= 0) return SF.nowMs();

  // Epoch-like => convert to perf-time
  if (TS > 1e12) {
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return TS - performance.timeOrigin;
    }
    return SF.nowMs();
  }

  return TS;
};

// Random helper
SF.RANDOM_BETWEEN = SF.RANDOM_BETWEEN || function RANDOM_BETWEEN(MIN, MAX) {
  return Math.random() * (MAX - MIN) + MIN;
};

// Edge fade helper (Part 2 uses it in drawing)
SF.edgeFactor = SF.edgeFactor || function edgeFactor(STAR) {
  const DRAW_R = (STAR.whiteValue * 2 + STAR.size) || 0;

  const LEFT = STAR.x + DRAW_R;
  const RIGHT = SF.W + DRAW_R - STAR.x;
  const TOP = STAR.y + DRAW_R;
  const BOTTOM = SF.H + DRAW_R - STAR.y;

  const MIN_EDGE = Math.min(LEFT, RIGHT, TOP, BOTTOM);
  const FADE_BAND = Math.min(90, SF.SCREEN * 0.03);

  let t = MIN_EDGE / FADE_BAND;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  return t * t * (3 - 2 * t); // smoothstep
};
//#endregion



//#region 2) CANVAS SETUP
/*========================================*
 *  Connect to <canvas id="constellations">
 *========================================*/
(function setupCanvas() {
  const CANVAS = document.getElementById('constellations');
  const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
  const HAS_CANVAS = !!(CANVAS && BRUSH);

  SF.CANVAS = CANVAS;
  SF.BRUSH = BRUSH;
  SF.HAS_CANVAS = HAS_CANVAS;

  if (!HAS_CANVAS) {
    console.warn('Constellation canvas not found or unsupported; starfield disabled.');
  }
})();
//#endregion



//#region 3) STORAGE: SAVE / RESTORE
/*========================================*
 *  localStorage persistence
 *========================================*/
SF.saveToStorage = SF.saveToStorage || function saveToStorage() {
  if (!SF.HAS_CANVAS) return;

  try {
    localStorage.setItem('constellationStars', JSON.stringify(SF.STARS));

    // Note: gravity params live in Part 2, but still stored via SF.* keys
    localStorage.setItem('constellationMeta', JSON.stringify({
      width: SF.W,
      height: SF.H,

      pokeTimer: SF.POKE_TIMER,
      userSpeed: SF.USER_SPEED,
      userX: SF.USER_X,
      userY: SF.USER_Y,
      userTime: SF.USER_TIME,

      // These are defined in Part 2; if Part 2 isn't loaded, they may be undefined.
      attractStrength: SF.ATTRACT_STRENGTH,
      attractRadius: SF.ATTRACT_RADIUS,
      attractScale: SF.ATTRACT_SCALE,
      clamp: SF.CLAMP,
      repelStrength: SF.REPEL_STRENGTH,
      repelRadius: SF.REPEL_RADIUS,
      repelScale: SF.REPEL_SCALE,
      pokeStrength: SF.POKE_STRENGTH
    }));
  } catch (ERR) {
    console.warn('Could not save stars:', ERR);
  }
};

// Save right before unload
if (!SF._SAVE_WIRED) {
  SF._SAVE_WIRED = true;
  window.addEventListener('beforeunload', SF.saveToStorage);
}

SF.initStars = SF.initStars || function initStars() {
  if (!SF.HAS_CANVAS) return;

  let RAW = null;
  try {
    RAW = localStorage.getItem('constellationStars');
  } catch (ERR) {
    console.warn('Could not read constellationStars from storage:', ERR);
    SF.createStars();
    return;
  }

  if (!RAW) {
    SF.createStars();
    return;
  }

  try {
    const PARSED = JSON.parse(RAW);

    if (Array.isArray(PARSED) && PARSED.length) {
      SF.STARS = PARSED;

      // Meta restore (optional)
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
            const SX = SF.W / META.width;
            const SY = SF.H / META.height;
            const SIZE_S = (SF.W + SF.H) / (META.width + META.height);

            for (const STAR of SF.STARS) {
              STAR.x *= SX;
              STAR.y *= SY;
              STAR.size *= SIZE_S;
            }
          }

          SF.POKE_TIMER = META.pokeTimer ?? SF.POKE_TIMER ?? 0;
          SF.USER_SPEED = META.userSpeed ?? SF.USER_SPEED ?? 0;

          // Gravity params may not exist yet if Part 2 loads later
          if (META.attractStrength != null) SF.ATTRACT_STRENGTH = META.attractStrength;
          if (META.attractRadius != null)   SF.ATTRACT_RADIUS   = META.attractRadius;
          if (META.attractScale != null)    SF.ATTRACT_SCALE    = META.attractScale;
          if (META.clamp != null)           SF.CLAMP            = META.clamp;
          if (META.repelStrength != null)   SF.REPEL_STRENGTH   = META.repelStrength;
          if (META.repelRadius != null)     SF.REPEL_RADIUS     = META.repelRadius;
          if (META.repelScale != null)      SF.REPEL_SCALE      = META.repelScale;
          if (META.pokeStrength != null)    SF.POKE_STRENGTH    = META.pokeStrength;

          if (typeof META.userX === 'number') SF.USER_X = META.userX;
          if (typeof META.userY === 'number') SF.USER_Y = META.userY;

          if (typeof META.userTime === 'number' && META.userTime > 0) {
            SF.USER_TIME = META.userTime;
          } else {
            SF.USER_TIME = SF.nowMs();
          }
        } catch (ERR) {
          console.warn('Could not parse constellationMeta, skipping meta restore.', ERR);
        }
      }

      return;
    }

    SF.createStars();
  } catch (ERR) {
    console.error('Could not parse saved stars, recreating.', ERR);
    SF.createStars();
  }
};
//#endregion



//#region 4) STAR CREATION
/*========================================*
 *  Creates a fresh field for current size
 *========================================*/
SF.createStars = SF.createStars || function createStars() {
  if (!SF.HAS_CANVAS) return;

  SF.STARS = [];

  const MIN_SIZE = 3;
  const MAX_SIZE = SF.SCREEN / 400 || 3;

  for (let i = 0; i < SF.MAX_STARS; i++) {
    SF.STARS.push({
      x: Math.random() * SF.W,
      y: Math.random() * SF.H,
      vx: SF.RANDOM_BETWEEN(-0.25, 0.25),
      vy: SF.RANDOM_BETWEEN(-0.25, 0.25),
      size: SF.RANDOM_BETWEEN(Math.min(MIN_SIZE, MAX_SIZE), Math.max(MIN_SIZE, MAX_SIZE)),
      opacity: SF.RANDOM_BETWEEN(0.005, 1.8),
      fadeSpeed: SF.RANDOM_BETWEEN(1, 2.1),
      redValue: SF.RANDOM_BETWEEN(0, 200),
      whiteValue: 0,
      momentumX: 0,
      momentumY: 0,
      edge: 1
    });
  }
};
//#endregion



//#region 5) UI CONTROLS: STEPPERS + BINDCONTROL
/*========================================*
 *  Hold-to-repeat buttons + UI binding
 *========================================*/
SF.enableStepperHold = SF.enableStepperHold || function enableStepperHold(BUTTON, ON_STEP) {
  let HOLD_TIMER = null;
  let REPEAT_TIMER = null;

  const INITIAL_DELAY_MS = 350;
  const START_INTERVAL_MS = 120;
  const MIN_INTERVAL_MS = 40;
  const ACCELERATION = 0.88;

  const startHold = () => {
    let interval = START_INTERVAL_MS;
    ON_STEP();

    HOLD_TIMER = setTimeout(() => {
      REPEAT_TIMER = setInterval(() => {
        ON_STEP();
        interval = Math.max(MIN_INTERVAL_MS, interval * ACCELERATION);

        clearInterval(REPEAT_TIMER);
        REPEAT_TIMER = setInterval(ON_STEP, interval);
      }, interval);
    }, INITIAL_DELAY_MS);
  };

  const stopHold = () => {
    clearTimeout(HOLD_TIMER);
    clearInterval(REPEAT_TIMER);
    HOLD_TIMER = null;
    REPEAT_TIMER = null;
  };

  BUTTON.addEventListener('mousedown', (E) => { E.preventDefault(); startHold(); });
  BUTTON.addEventListener('mouseup', stopHold);
  BUTTON.addEventListener('mouseleave', stopHold);

  BUTTON.addEventListener('touchstart', (E) => { E.preventDefault(); startHold(); }, { passive: false });
  BUTTON.addEventListener('touchend', stopHold);
  BUTTON.addEventListener('touchcancel', stopHold);
};

SF.bindControl = SF.bindControl || function bindControl(ID, SETTER_FN, INITIAL_VALUE) {
  const SLIDER = document.getElementById(ID);
  if (!SLIDER) return false;

  const NUMBER_INPUT = document.getElementById(ID + '_num');
  const CONTROL_BLOCK = SLIDER.closest('.controlBlock');
  const STEP_BUTTONS = CONTROL_BLOCK ? CONTROL_BLOCK.querySelectorAll('.stepBtn[data-step]') : [];

  const MIN = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);
  const MAX = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

  const RAW_STEP = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);
  const STEP = Number.isFinite(RAW_STEP) && RAW_STEP > 0 ? RAW_STEP : 1;

  const clampValue = (v) => Math.min(MAX, Math.max(MIN, v));

  const snapToStep = (v) => {
    if (!Number.isFinite(STEP) || STEP <= 0) return v;
    const snapped = MIN + Math.round((v - MIN) / STEP) * STEP;
    const decimals = (String(STEP).split('.')[1] || '').length;
    return Number(snapped.toFixed(decimals));
  };

  const applyValue = (v) => {
    v = Number(v);
    if (!Number.isFinite(v)) return;

    v = clampValue(v);
    v = snapToStep(v);

    SLIDER.value = String(v);
    if (NUMBER_INPUT) NUMBER_INPUT.value = String(v);

    SETTER_FN(v);
    SLIDER.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const nudge = (dir) => applyValue(Number(SLIDER.value) + dir * STEP);

  applyValue(INITIAL_VALUE ?? SLIDER.value);

  SLIDER.addEventListener('input', () => applyValue(SLIDER.value));

  if (NUMBER_INPUT) {
    NUMBER_INPUT.addEventListener('input', () => applyValue(NUMBER_INPUT.value));
    NUMBER_INPUT.addEventListener('change', () => applyValue(NUMBER_INPUT.value));
  }

  STEP_BUTTONS.forEach((BTN) => {
    const DIR = Number(BTN.dataset.step) || 0;
    if (!DIR) return;
    SF.enableStepperHold(BTN, () => nudge(DIR));
  });

  return true;
};

SF.initControlsIfPresent = SF.initControlsIfPresent || function initControlsIfPresent() {
  // Part 2 defines SF.ATTRACT_STRENGTH etc; if it's not loaded yet, nothing to bind.
  if (typeof SF.ATTRACT_STRENGTH === 'undefined') return;

  if (!document.getElementById('ATTRACT_STRENGTH') &&
      !document.getElementById('REPEL_STRENGTH')) {
    return;
  }

  SF.bindControl('ATTRACT_STRENGTH', (V) => (SF.ATTRACT_STRENGTH = V), SF.ATTRACT_STRENGTH);
  SF.bindControl('ATTRACT_RADIUS',   (V) => (SF.ATTRACT_RADIUS   = V), SF.ATTRACT_RADIUS);
  SF.bindControl('ATTRACT_SCALE',    (V) => (SF.ATTRACT_SCALE    = V), SF.ATTRACT_SCALE);

  SF.bindControl('CLAMP',            (V) => (SF.CLAMP            = V), SF.CLAMP);

  SF.bindControl('REPEL_STRENGTH',   (V) => (SF.REPEL_STRENGTH   = V), SF.REPEL_STRENGTH);
  SF.bindControl('REPEL_RADIUS',     (V) => (SF.REPEL_RADIUS     = V), SF.REPEL_RADIUS);
  SF.bindControl('REPEL_SCALE',      (V) => (SF.REPEL_SCALE      = V), SF.REPEL_SCALE);

  SF.bindControl('POKE_STRENGTH',    (V) => (SF.POKE_STRENGTH    = V), SF.POKE_STRENGTH);
};

document.addEventListener('DOMContentLoaded', SF.initControlsIfPresent);
//#endregion



//#region 6) RESIZE + ANIMATION + BOOTSTRAP
/*========================================*
 *  Resize calculates scale + precomputed powers
 *  Animation loop calls Part 2 hooks (if present)
 *========================================*/
SF.resizeCanvas = SF.resizeCanvas || function resizeCanvas() {
  if (!SF.HAS_CANVAS) return;

  const OLD_W = SF.W;
  const OLD_H = SF.H;
  const OLD_SCREEN = SF.SCREEN || 1;

  SF.W = window.innerWidth || 0;
  SF.H = window.innerHeight || 0;

  SF.CANVAS.width = SF.W;
  SF.CANVAS.height = SF.H;

  SF.SCREEN = SF.W + SF.H;
  SF.SCALE = Math.pow(SF.SCREEN / 1200, 0.35);
  SF.MAX_STARS = Math.min(450, SF.SCREEN / 10);
  SF.MAX_LINK = SF.SCREEN / 10;

  // Precompute scaling powers used inside Part 2 loop
  SF.SCALED_ATT_GRA = SF.SCALE ** 1.11;
  SF.SCALED_REP_GRA = SF.SCALE ** 0.66;
  SF.SCALED_ATT_SHA = SF.SCALE ** -8.89;
  SF.SCALED_ATT = SF.SCALE ** -8.46;
  SF.SCALED_REP = SF.SCALE ** -0.89;

  // Rescale existing stars to new canvas
  if (OLD_W !== 0 && OLD_H !== 0 && SF.STARS.length) {
    const SX = SF.W / OLD_W;
    const SY = SF.H / OLD_H;
    const SIZE_S = SF.SCREEN / OLD_SCREEN;

    for (const STAR of SF.STARS) {
      STAR.x *= SX;
      STAR.y *= SY;
      STAR.size *= SIZE_S;
    }
  }
};

SF.animate = SF.animate || function animate() {
  if (!SF.HAS_CANVAS) return;

  // Part 2 provides these functions
  if (!SF.FREEZE && typeof SF.moveStars === 'function') SF.moveStars();
  if (typeof SF.drawStarsWithLines === 'function') SF.drawStarsWithLines();

  requestAnimationFrame(SF.animate);
};

SF.sizesReady = SF.sizesReady || function sizesReady() {
  return Number.isFinite(SF.W) && Number.isFinite(SF.H) && SF.W > 50 && SF.H > 50;
};

SF.start = SF.start || function startStarfield() {
  SF.resizeCanvas();

  if (!SF.sizesReady()) {
    requestAnimationFrame(SF.start);
    return;
  }

  if (!SF.STARS_INIT) {
    SF.STARS_INIT = true;
    SF.initStars();
  }

  if (!SF.ANIM_STARTED) {
    SF.ANIM_STARTED = true;
    SF.animate();
  }

  if (!SF.RESIZE_WIRED) {
    SF.RESIZE_WIRED = true;
    window.addEventListener('resize', SF.resizeCanvas);
  }
};

try {
  SF.start();
} catch (ERR) {
  console.error('Initialization error in StarfieldCore.js:', ERR);
}
//#endregion

// Joke: This file is the ship hull. The other file is the thrusters and the pretty space-windows. 🚀🪟