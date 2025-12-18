// thank heavens for chatGPT <3

/*==============================================================*
 *                         STARFIELD SCRIPT
 *==============================================================*
 *  Responsibilities:
 *   - Canvas + drawing context setup
 *   - Star storage (localStorage) + restore
 *   - Star creation + motion + wrap/bounce
 *   - Pointer input (mouse/touch) -> speed + poke + ring timers
 *   - Animation loop + resize handling
 *==============================================================*/

//#region STARFIELD GLOBALS
/*========================================*
 *  STARFIELD GLOBAL STATE
 *========================================*
 *  - Canvas + runtime flags
 *  - Pointer state + timers
 *  - Canvas sizing + scaling
 *  - Star array
 *========================================*/

/*---------- Canvas ----------*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && BRUSH);

if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}

/*---------- Runtime guards (prevent repeats/loops) ----------*/

let FREEZE_CONSTELLATION = false;
let ANIMATION_STARTED = false;
let RESIZE_WIRED = false;
let STARS_INITIALIZED = false;

/*---------- Pointer tracking + timers ----------*/

let USER_X = 0;
let USER_Y = 0;
let USER_TIME = 0;
let USER_SPEED = 0;
let POKE_TIMER = 0;
let CIRCLE_TIMER = 0;

// Cross-script flag (preserved across pages if set earlier)
window.REMOVE_CIRCLE = window.REMOVE_CIRCLE ?? false;

/*---------- Canvas size + scaling ----------*/

let WIDTH = 0;
let HEIGHT = 0;
let SCREEN_SIZE = 0;
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

/*---------- Starfield data ----------*/

let STARS = [];
//#endregion STARFIELD GLOBALS

//#region STARFIELD STORAGE
/*========================================*
 *  STORAGE (localStorage)
 *========================================*
 *  Saves:
 *   - Star array (positions + motion + visual props)
 *   - Meta (canvas size + pointer/timer state + gravity params)
 *========================================*/

// Save star positions and motion meta into localStorage
function saveStarsToStorage() {
  if (!HAS_CANVAS) return;
  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width: WIDTH,
        height: HEIGHT,
        repelTimer: POKE_TIMER,
        userSpeed: USER_SPEED,
        userX: USER_X,
        userY: USER_Y,
        userTime: USER_TIME,
        attractStrength: ATTRACT_STRENGTH,
        attractRadius: ATTRACT_RADIUS,
        attractScale: ATTRACT_SCALE,
        repelStrength: REPEL_STRENGTH,
        repelRadius: REPEL_RADIUS,
        repelScale: REPEL_SCALE
      })
    );
  } catch (ERR) {
    console.warn('Could not save stars:', ERR);
  }
}

// Save constellation right before the page unloads or reloads
window.addEventListener('beforeunload', saveStarsToStorage);
//#endregion STARFIELD STORAGE

//#region STARFIELD CORE
/*========================================*
 *  CREATION + MOTION + DRAWING
 *========================================*/

/*---------- Utility: random float in [MIN, MAX) ----------*/

const randomBetween = (MIN, MAX) =>
  Math.random() * (MAX - MIN) + MIN;

/*---------- Initialization: restore if possible ----------*/

// Load saved stars if present, otherwise create a new field
function initStars() {
  if (!HAS_CANVAS) return;

  let SAVED;
  try {
    SAVED = localStorage.getItem('constellationStars');
  } catch (ERR) {
    console.warn('Could not read constellationStars from storage:', ERR);
    createStars();
    return;
  }

  if (!SAVED) {
    createStars();
    return;
  }

  try {
    const PARSED = JSON.parse(SAVED);

    if (Array.isArray(PARSED) && PARSED.length) {
      STARS = PARSED;

      let META_RAW;
      try {
        META_RAW = localStorage.getItem('constellationMeta');
      } catch (ERR) {
        console.warn('Could not read constellationMeta from storage:', ERR);
      }

      if (META_RAW) {
        try {
          const META = JSON.parse(META_RAW);

          // Rescale coordinates from old canvas size to current
          if (META.width > 0 && META.height > 0) {
            const SCALE_X = WIDTH / META.width;
            const SCALE_Y = HEIGHT / META.height;
            const SIZE_SCALE =
              (WIDTH + HEIGHT) / (META.width + META.height);

            for (const STAR of STARS) {
              STAR.x *= SCALE_X;
              STAR.y *= SCALE_Y;
              STAR.size *= SIZE_SCALE;
            }
          }

          // Restore timers + pointer state + gravity control values
          POKE_TIMER = META.repelTimer ?? 0;
          USER_SPEED = META.userSpeed ?? 0;
          ATTRACT_STRENGTH = META.attractStrength ?? ATTRACT_STRENGTH;
          ATTRACT_RADIUS   = META.attractRadius   ?? ATTRACT_RADIUS;
          ATTRACT_SCALE    = META.attractScale    ?? ATTRACT_SCALE;

          REPEL_STRENGTH   = META.repelStrength   ?? REPEL_STRENGTH;
          REPEL_RADIUS     = META.repelRadius     ?? REPEL_RADIUS;
          REPEL_SCALE      = META.repelScale      ?? REPEL_SCALE;

          if (typeof META.userX === 'number') USER_X = META.userX;
          if (typeof META.userY === 'number') USER_Y = META.userY;

          // USER_TIME acts as a “pointer exists” flag in moveStars
          if (typeof META.userTime === 'number' && META.userTime > 0) {
            USER_TIME = META.userTime;
          } else {
            USER_TIME = (window.performance && performance.now) ?
              performance.now() :
              Date.now();
          }
        } catch (ERR) {
          console.warn(
            'Could not parse constellationMeta, skipping scale.',
            ERR
          );
        }
      }
    } else {
      createStars();
    }
  } catch (ERR) {
    console.error('Could not parse saved stars, recreating.', ERR);
    createStars();
  }
}

/*---------- Initialization: build new starfield ----------*/

// Build a brand-new starfield for the current canvas size
function createStars() {
  if (!HAS_CANVAS) return;

  STARS = [];

  // Keep size range valid even on very small screens
  const MIN_SIZE = 3;
  const MAX_SIZE = SCREEN_SIZE / 400 || 3;

  for (let I = 0; I < MAX_STAR_COUNT; I++) {
    STARS.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: randomBetween(-0.25, 0.25),
      vy: randomBetween(-0.25, 0.25),
      size: randomBetween(
        Math.min(MIN_SIZE, MAX_SIZE),
        Math.max(MIN_SIZE, MAX_SIZE)
      ),
      opacity: randomBetween(0.005, 1.8),
      fadeSpeed: randomBetween(1, 2.1),
      redValue: randomBetween(0, 200),
      whiteValue: 0,
      momentumX: 0,
      momentumY: 0
    });
  }
}

/*==============================================================*
 *           STEPPER HOLD-TO-REPEAT (BUTTON ACCELERATION)
 *==============================================================*
 *  Behavior:
 *   - Click: one step
 *   - Hold: repeat steps
 *   - Accelerates by shrinking interval over time
 *  Input:
 *   - Mouse + touch supported (touch uses passive:false)
 *==============================================================*/

function enableStepperHold(button, onStep) {
  let holdTimer = null;
  let repeatTimer = null;

  const INITIAL_DELAY = 350;   // ms before repeat starts
  const START_INTERVAL = 120;  // initial repeat speed
  const MIN_INTERVAL = 40;     // max speed cap
  const ACCELERATION = 0.88;   // interval shrink per tick

  const startHold = () => {
    let interval = START_INTERVAL;

    // Immediate first step
    onStep();

    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => {
        onStep();
        interval = Math.max(MIN_INTERVAL, interval * ACCELERATION);

        // Restart interval to apply acceleration
        clearInterval(repeatTimer);
        repeatTimer = setInterval(onStep, interval);
      }, interval);
    }, INITIAL_DELAY);
  };

  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    holdTimer = null;
    repeatTimer = null;
  };

  // Mouse
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startHold();
  });
  button.addEventListener('mouseup', stopHold);
  button.addEventListener('mouseleave', stopHold);

  // Touch
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startHold();
  }, { passive: false });

  button.addEventListener('touchend', stopHold);
  button.addEventListener('touchcancel', stopHold);
}

/*==============================================================*
 *              GRAVITY CONTROL BINDING (UI -> JS)
 *==============================================================*
 *  Binds the 3-part control set per ID:
 *   - Range input:  #ID
 *   - Number input: #ID_num
 *   - Stepper btns: .stepBtn[data-step="-1|1"] in same .ctl
 *
 *  Notes:
 *   - Initializes UI from JS values (restored state wins).
 *   - Dispatches 'input' on slider after apply to keep fill sync.
 *==============================================================*/

function bindControl(id, setter, initialValue) {
  const slider = document.getElementById(id);
  if (!slider) return false;

  const number = document.getElementById(id + '_num');

  // Find the nearest .ctl container, then the stepper buttons
  const ctl = slider.closest('.ctl') || slider.parentElement;
  const stepBtns = ctl ? ctl.querySelectorAll('.stepBtn[data-step]') : [];

  const min = Number(slider.min || (number && number.min) || 0);
  const max = Number(slider.max || (number && number.max) || 10);

  const clamp = (v) => Math.min(max, Math.max(min, v));

  const apply = (v) => {
    v = clamp(Number(v));
    if (!Number.isFinite(v)) return;

    slider.value = String(v);
    if (number) number.value = String(v);

    setter(v);

    // Keep your slider gradient fill in sync (if you use that)
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Step size: prefer slider.step, else number.step, else 1
  const rawStep = Number(slider.step || (number && number.step) || 1);
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;

  const nudge = (dir) => {
    const current = Number(slider.value);
    const next = current + dir * step;
    apply(next);
  };

  // Initialize from JS value (NOT HTML)
  apply(initialValue ?? slider.value);

  // Slider drag
  slider.addEventListener('input', () => apply(slider.value));

  // Number typing
  if (number) {
    number.addEventListener('input', () => apply(number.value));
    number.addEventListener('change', () => apply(number.value));
  }

  // +/- buttons (hold-to-repeat)
  stepBtns.forEach(btn => {
    const dir = Number(btn.dataset.step) || 0;
    if (!dir) return;

    enableStepperHold(btn, () => nudge(dir));
  });

  return true;
}

function initGravityControlsIfPresent() {
  // Bail quickly if page has none
  if (!document.getElementById('ATTRACT_STRENGTH') &&
      !document.getElementById('REPEL_STRENGTH')) {
    return;
  }

  // ATTRACT
  bindControl('ATTRACT_STRENGTH', v => ATTRACT_STRENGTH = v, ATTRACT_STRENGTH);
  bindControl('ATTRACT_RADIUS',   v => ATTRACT_RADIUS   = v, ATTRACT_RADIUS);
  bindControl('ATTRACT_SCALE',    v => ATTRACT_SCALE    = v, ATTRACT_SCALE);

  // REPEL
  bindControl('REPEL_STRENGTH',   v => REPEL_STRENGTH   = v, REPEL_STRENGTH);
  bindControl('REPEL_RADIUS',     v => REPEL_RADIUS     = v, REPEL_RADIUS);
  bindControl('REPEL_SCALE',      v => REPEL_SCALE      = v, REPEL_SCALE);
}

document.addEventListener('DOMContentLoaded', initGravityControlsIfPresent);

/*---------- Motion: per-frame star update ----------*/

// Move, fade, and wrap stars around user interaction
function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;
  for (const STAR of STARS) {

    const X_DISTANCE = USER_X - STAR.x;
    const Y_DISTANCE = USER_Y - STAR.y;
    const DISTANCE = Math.hypot(X_DISTANCE, Y_DISTANCE) + 0.0001;
    const TO_USER_X = X_DISTANCE / DISTANCE;
    const TO_USER_Y = Y_DISTANCE / DISTANCE;
    const RANGE = SCREEN_SIZE * 0.2;

    // Apply gravity ring forces only within influence range
    if (DISTANCE < RANGE) {

      // Linear gradient: 1 at center -> 0 at radius -> stays 0 beyond radius
      const ATTR_GRADIENT = 1 - (DISTANCE / (ATTRACT_RADIUS || 1));
      const REPEL_GRADIENT = 1 - (DISTANCE / (REPEL_RADIUS  || 1));

      // Clamp
      const ATTR_FALLOFF = Math.max(0, ATTR_GRADIENT);
      const REPEL_FALLOFF = Math.max(0, REPEL_GRADIENT);

      // Shape curve: higher scale = tighter near center, weaker at edge
      const ATTR_SHAPE = Math.pow(ATTR_FALLOFF, Math.max(0.1, ATTRACT_SCALE));
      const REPEL_SHAPE = Math.pow(REPEL_FALLOFF, Math.max(0.1, REPEL_SCALE));

      // Attraction (toward user)
      const ATTRACT = ATTRACT_STRENGTH * USER_SPEED * ATTR_SHAPE;
      STAR.momentumX += ATTRACT * TO_USER_X;
      STAR.momentumY += ATTRACT * TO_USER_Y;

      // Repulsion (away from user)
      const REPEL = REPEL_STRENGTH * USER_SPEED * REPEL_SHAPE;
      STAR.momentumX -= REPEL * TO_USER_X;
      STAR.momentumY -= REPEL * TO_USER_Y;

      // Poke: extra kick away (also respects repel radius)
      const POKE = 1.3 * POKE_TIMER * REPEL_SHAPE;
      STAR.momentumX -= POKE * TO_USER_X;
      STAR.momentumY -= POKE * TO_USER_Y;
    }

    // Global boost: user interaction increases baseline drift speed
    STAR.momentumX += 0.1 * USER_SPEED * STAR.vx;
    STAR.momentumY += 0.1 * USER_SPEED * STAR.vy;

    // Clamp momentum magnitude
    const LIMIT = 13;
    const HYPOT = Math.hypot(STAR.momentumX, STAR.momentumY);
    if (HYPOT > LIMIT) {
      STAR.momentumX *= LIMIT / HYPOT;
      STAR.momentumY *= LIMIT / HYPOT;
    }

    // Apply motion (passive velocity + momentum + tiny jitter)
    STAR.x += STAR.vx + STAR.momentumX + randomBetween(-0.2, 0.2);
    STAR.y += STAR.vy + STAR.momentumY + randomBetween(-0.2, 0.2);

    // Momentum decay
    STAR.momentumX *= 0.98;
    STAR.momentumY *= 0.98;

    // Wrap when passive OR far OR heavy poke (radius-aware, fully off-screen)
    if (CIRCLE_TIMER == 0 || DISTANCE > 200 || POKE_TIMER > 1000) {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0; // draw radius
      if (STAR.x < -R) STAR.x = WIDTH + R;
      else if (STAR.x > WIDTH + R) STAR.x = -R;
      if (STAR.y < -R) STAR.y = HEIGHT + R;
      else if (STAR.y > HEIGHT + R) STAR.y = -R;
    }
    // Otherwise bounce (interactive mode, radius-aware reflection)
    else {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0;

      // Left/right walls
      if (STAR.x < R) {
        STAR.x = 2 * R - STAR.x;
        STAR.vx = Math.abs(STAR.vx);
        STAR.momentumX = Math.abs(STAR.momentumX);
      } else if (STAR.x > WIDTH - R) {
        STAR.x = 2 * (WIDTH - R) - STAR.x;
        STAR.vx = -Math.abs(STAR.vx);
        STAR.momentumX = -Math.abs(STAR.momentumX);
      }

      // Top/bottom walls
      if (STAR.y < R) {
        STAR.y = 2 * R - STAR.y;
        STAR.vy = Math.abs(STAR.vy);
        STAR.momentumY = Math.abs(STAR.momentumY);
      } else if (STAR.y > HEIGHT - R) {
        STAR.y = 2 * (HEIGHT - R) - STAR.y;
        STAR.vy = -Math.abs(STAR.vy);
        STAR.momentumY = -Math.abs(STAR.momentumY);
      }
    }

    // White flash decay
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    // Opacity cycle (fade out -> snap back on -> occasional white flicker)
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }
  }

  // Global decay (timers + interaction energy)
  USER_SPEED *= 0.5;
  if (USER_SPEED < 0.001) USER_SPEED = 0;

  CIRCLE_TIMER *= 0.9;
  if (CIRCLE_TIMER < 0.1) CIRCLE_TIMER = 0;

  POKE_TIMER *= 0.85;
  if (POKE_TIMER < 1) POKE_TIMER = 0;

  // Debug readouts (optional; only updates if elements exist)
  const DBG_CIRCLE = document.getElementById('dbgCircle');
  if (DBG_CIRCLE) DBG_CIRCLE.textContent = CIRCLE_TIMER.toFixed(3);

  const DBG_SPEED = document.getElementById('dbgSpeed');
  if (DBG_SPEED) DBG_SPEED.textContent = USER_SPEED.toFixed(3);

  const DBG_POKE = document.getElementById('dbgPoke');
  if (DBG_POKE) DBG_POKE.textContent = POKE_TIMER.toFixed(1);
}

/*---------- Rendering helpers ----------*/

// 0 at/beyond wrap threshold, 1 when safely away from edges
function edgeFactor(STAR) {
  const R = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Distance from the “fully off-screen” threshold on each side
  const left = STAR.x + R;              // 0 when x == -R
  const right = WIDTH + R - STAR.x;     // 0 when x == WIDTH + R
  const top = STAR.y + R;               // 0 when y == -R
  const bottom = HEIGHT + R - STAR.y;   // 0 when y == HEIGHT + R

  const d = Math.min(left, right, top, bottom);

  // Fade band width (gentle)
  const FADE_BAND = Math.min(90, SCREEN_SIZE * 0.03);

  let t = d / FADE_BAND;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  // Smoothstep
  return t * t * (3 - 2 * t);
}

/*---------- Rendering: lines + stars ----------*/

function drawStarsWithLines() {
  if (!HAS_CANVAS || !BRUSH) return;

  // Clear canvas
  BRUSH.clearRect(0, 0, WIDTH, HEIGHT);

  // Optional ring around pointer
  if (!window.REMOVE_CIRCLE) {
    const RING_RADIUS = 0.04 * SCREEN_SIZE;
    const RING_WIDTH = 1.5 + CIRCLE_TIMER * 0.15;
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

  // Lines between nearby stars
  BRUSH.lineWidth = 1;
  const COUNT = STARS.length;

  for (let I = 0; I < COUNT; I++) {
    for (let J = I + 1; J < COUNT; J++) {
      const STAR_A = STARS[I];
      const STAR_B = STARS[J];
      const X_DISTANCE = STAR_A.x - STAR_B.x;
      const Y_DISTANCE = STAR_A.y - STAR_B.y;
      const DISTANCE = Math.hypot(X_DISTANCE, Y_DISTANCE) / 1100 * SCREEN_SIZE;

      if (DISTANCE < MAX_LINK_DISTANCE) {
        // Fade with distance + star opacity
        let ALPHA = (1 - DISTANCE / MAX_LINK_DISTANCE) * ((STAR_A.opacity + STAR_B.opacity) / 2);
        // Additional fade near edges (hides wrap teleport)
        ALPHA *= Math.min(edgeFactor(STAR_A), edgeFactor(STAR_B));

        BRUSH.strokeStyle = `rgba(0, 0, 0, ${ALPHA})`;
        BRUSH.beginPath();
        BRUSH.moveTo(STAR_A.x, STAR_A.y);
        BRUSH.lineTo(STAR_B.x, STAR_B.y);
        BRUSH.stroke();
      }
    }
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

/*---------- External redraw hook (used by other scripts) ----------*/

// Redraw without user circle on page leave
window.forceStarfieldRedraw = () => {
  if (!BRUSH || !CANVAS) return;
  drawStarsWithLines();
};

/*---------- Resize + animation loop ----------*/

function resizeCanvas() {
  if (!HAS_CANVAS) return;

  const OLD_WIDTH = WIDTH;
  const OLD_HEIGHT = HEIGHT;
  const OLD_SCREEN_SIZE = SCREEN_SIZE || 1;

  WIDTH = window.innerWidth || 0;
  HEIGHT = window.innerHeight || 0;

  CANVAS.width = WIDTH;
  CANVAS.height = HEIGHT;

  SCREEN_SIZE = WIDTH + HEIGHT;
  MAX_STAR_COUNT = Math.min(450, SCREEN_SIZE / 10);
  MAX_LINK_DISTANCE = SCREEN_SIZE / 10;

  // Rescale existing stars to new canvas
  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0) {
    const SCALE_X = WIDTH / OLD_WIDTH;
    const SCALE_Y = HEIGHT / OLD_HEIGHT;
    const SCALE_SIZE = SCREEN_SIZE / OLD_SCREEN_SIZE;

    for (const STAR of STARS) {
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SCALE_SIZE;
    }
  }
}

function animate() {
  if (!HAS_CANVAS) return;
  if (!FREEZE_CONSTELLATION) moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}
//#endregion STARFIELD CORE

//#region POINTER INPUT
/*========================================*
 *  POINTER INPUT (MOUSE / TOUCH)
 *========================================*
 *  Updates:
 *   - USER_SPEED (derived from movement delta / time delta)
 *   - Timers (CIRCLE_TIMER, POKE_TIMER)
 *   - USER position + timestamp
 *========================================*/

function updateSpeed(X, Y, TIME) {
  if (!Number.isFinite(TIME)) TIME = performance.now ? performance.now() : Date.now();

  const DT = Math.max(1, TIME - USER_TIME);
  const DX = X - USER_X;
  const DY = Y - USER_Y;
  const RAW_USER_SPEED = Math.hypot(DX, DY) / DT;

  USER_SPEED = Math.min(RAW_USER_SPEED * 50, 50);
  CIRCLE_TIMER = Math.max(CIRCLE_TIMER, USER_SPEED);
  USER_X = X;
  USER_Y = Y;
  USER_TIME = TIME;
}

// Shared start handler (mousedown / touchstart)
function startPointerInteraction(X, Y, TIME) {
  POKE_TIMER = 25000; // Repel on click/touch
  updateSpeed(X, Y, TIME);
}

// Mouse move updates pointer speed
window.addEventListener('mousemove', (E) =>
  updateSpeed(E.clientX, E.clientY, E.timeStamp)
);

// Mouse down triggers repulsion + speed bump
window.addEventListener('mousedown', (E) => {
  startPointerInteraction(E.clientX, E.clientY, E.timeStamp);
});

// Touch start triggers the same repulsion behavior
window.addEventListener('touchstart', (E) => {
  const TOUCH_POINT = E.touches[0];
  if (!TOUCH_POINT) return;
  startPointerInteraction(TOUCH_POINT.clientX, TOUCH_POINT.clientY, E.timeStamp);
});

// Touch move updates speed
window.addEventListener('touchmove', (E) => {
  const TOUCH_POINT = E.touches[0];
  if (!TOUCH_POINT) return;
  updateSpeed(TOUCH_POINT.clientX, TOUCH_POINT.clientY, E.timeStamp);
});

//#endregion POINTER INPUT

//#region STARFIELD INITIALIZATION
/*========================================*
 *  INITIALIZATION / BOOTSTRAP
 *========================================*
 *  - Resize first (sets WIDTH/HEIGHT/SCREEN_SIZE)
 *  - Guard against 0-size first loads (Chromebook / odd timing)
 *  - Init stars once, start animation once, wire resize once
 *========================================*/

function sizesReady() {
  return (
    Number.isFinite(WIDTH) &&
    Number.isFinite(HEIGHT) &&
    WIDTH > 50 &&
    HEIGHT > 50
  );
}

function startStarfield() {
  resizeCanvas();

  // First-load guard: wait for real viewport sizes
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

//#endregion STARFIELD INITIALIZATION