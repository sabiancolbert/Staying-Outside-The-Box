
// thank heavens for chatGPT <3

/*==============================================================*
 *                       STARFIELD SCRIPT
 *==============================================================*
 *
 *  - Constellation canvas & starfield state
 *  - Storage for star positions & meta
 *  - Star creation, motion, and drawing
 *  - Pointer input (mouse/touch) for repulsion
 *  - Canvas resize & animation loop
 *==============================================================*/

//#region STARFIELD GLOBALS
/*========================================*
 *  STARFIELD GLOBAL STATE
 *========================================*/

/*---------- Constellation canvas & starfield ----------*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && BRUSH);

if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}

// Prevent repeats & loops
let FREEZE_CONSTELLATION = false;
let ANIMATION_STARTED = false;
let RESIZE_WIRED = false;
let STARS_INITIALIZED = false;

// Pointer tracking
let USER_X = 0;
let USER_Y = 0;
let USER_TIME = 0;
let USER_SPEED = 0;
let REPEL_TIMER = 0;
let CIRCLE_TIMER = 0;
window.REMOVE_CIRCLE = window.REMOVE_CIRCLE ?? false;

// Canvas size and star scaling
let WIDTH = 0;
let HEIGHT = 0;
let SCREEN_SIZE = 0;
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

// Starfield data
let STARS = [];
//#endregion STARFIELD GLOBALS

//#region STARFIELD STORAGE
/*========================================*
 *  STARFIELD STORAGE
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
        repelTimer: REPEL_TIMER,
        userSpeed: USER_SPEED,
        userX: USER_X,
        userY: USER_Y,
        userTime: USER_TIME
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
 *  STARFIELD CREATION & MOTION
 *========================================*/

/*---------- Random helper ----------*/

// Random float in [MIN, MAX)
const randomBetween = (MIN, MAX) =>
  Math.random() * (MAX - MIN) + MIN;

/*---------- Star initialization ----------*/

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

          // Restore motion state and pointer info
          REPEL_TIMER = META.repelTimer ?? 0;
          USER_SPEED = META.userSpeed ?? 0;

          if (typeof META.userX === 'number') USER_X = META.userX;
          if (typeof META.userY === 'number') USER_Y = META.userY;

          // USER_TIME is just a "pointer ever existed" flag in moveStars
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

/*---------- Star animation step ----------*/

    let ATTRACT_STRENGTH = 50;
    let ATTRACT_RADIUS = 245;
    let ATTRACT_SCALE = 5.5;
    
    let REPEL_STRENGTH = 126;
    let REPEL_RADIUS = 277;
    let REPEL_SCALE = 3.8;

// Debugging tool
function bindControl(id, setter) {
  const slider = document.getElementById(id);
  const number = document.getElementById(id + '_num');
  const label  = document.getElementById(id + '_val');

  if (!slider) return;

  const min = Number(slider.min || (number && number.min) || 0);
  const max = Number(slider.max || (number && number.max) || 10);

  const clamp = (v) => Math.min(max, Math.max(min, v));

  const apply = (v) => {
    v = clamp(Number(v));
    if (!Number.isFinite(v)) return;

    slider.value = String(v);
    if (number) number.value = String(v);
    if (label) label.textContent = String(v);
    setter(v);
  };

  // init from slider's current value
  apply(slider.value);

  slider.addEventListener('input', () => apply(slider.value));

  if (number) {
    number.addEventListener('input', () => apply(number.value)); // live typing
    number.addEventListener('change', () => apply(number.value)); // on blur/enter
  }
}


  bindControl('ATTRACT_STRENGTH', v => ATTRACT_STRENGTH = v);
  bindControl('ATTRACT_RADIUS',   v => ATTRACT_RADIUS   = v);
  bindControl('ATTRACT_SCALE',    v => ATTRACT_SCALE    = v);

  bindControl('REPEL_STRENGTH',   v => REPEL_STRENGTH   = v);
  bindControl('REPEL_RADIUS',     v => REPEL_RADIUS     = v);
  bindControl('REPEL_SCALE',      v => REPEL_SCALE      = v);

// Move, fade, and wrap stars around user interaction
function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;
  for (const STAR of STARS) {

    const X_DISTANCE = USER_X - STAR.x;
    const Y_DISTANCE = USER_Y - STAR.y;
    const DISTANCE = Math.hypot(X_DISTANCE, Y_DISTANCE) + 0.0001;
    const INV_DIST = 1 / DISTANCE;
    const TO_USER_X = X_DISTANCE / DISTANCE;
    const TO_USER_Y = Y_DISTANCE / DISTANCE;
    
    // Increase all star speed (clamped low) with user interaction
    STAR.momentumX += 0.03 * USER_SPEED * STAR.vx + randomBetween(-0.8, 0.8);
    STAR.momentumY += 0.03 * USER_SPEED * STAR.vy + randomBetween(-0.8, 0.8);
    STAR.momentumX = Math.max(-3, Math.min(STAR.momentumX, 3));
    STAR.momentumY = Math.max(-3, Math.min(STAR.momentumY, 3));

    if (DISTANCE < SCREEN_SIZE * 0.2) {
      // User gravity ring (attract from outside)
      STAR.momentumX += ATTRACT_STRENGTH * USER_SPEED * (ATTRACT_RADIUS / INV_X_DIST);
      STAR.momentumY += ATTRACT_STRENGTH * USER_SPEED * (ATTRACT_RADIUS / INV_Y_DIST);
      // User gravity ring (repel from inside)
      STAR.momentumX -= REPEL_STRENGTH * USER_SPEED * (REPEL_RADIUS / INV_X_DIST);
      STAR.momentumY -= REPEL_STRENGTH * USER_SPEED * (REPEL_RADIUS / INV_Y_DIST);
        
      // Repel on poke
      STAR.momentumX += -1.3 * REPEL_TIMER * INV_X_DIST;
      STAR.momentumY += -1.3 * REPEL_TIMER * INV_Y_DIST;
    }

    // Make momentum form a circle (clamped high)
    const LIMIT = 13;
    const HYPOT = Math.hypot(STAR.momentumX, STAR.momentumY);
    if (HYPOT > LIMIT) {
      STAR.momentumX *= LIMIT / HYPOT;
      STAR.momentumY *= LIMIT / HYPOT;
    }

    // Apply momentum and passive movement
    STAR.x += STAR.vx + STAR.momentumX;
    STAR.y += STAR.vy + STAR.momentumY;

    // Decay momentum
    STAR.momentumX *= 0.98;
    STAR.momentumY *= 0.98;

    // Screen wrap if passive (wait until full star is off-screen)
    if (CIRCLE_TIMER = 0 || X_DISTANCE + Y_DISTANCE > 200 || REPEL_TIMER > 1000) {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0; // same radius you draw with
      if (STAR.x < -R) STAR.x = WIDTH + R;
      else if (STAR.x > WIDTH + R) STAR.x = -R;
      if (STAR.y < -R) STAR.y = HEIGHT + R;
      else if (STAR.y > HEIGHT + R) STAR.y = -R;
    }
    // Screen bounce if user interacting
    else {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0;

      // Reflect off left/right walls (radius-aware)
      if (STAR.x < R) {
        STAR.x = 2 * R - STAR.x;
        STAR.vx = Math.abs(STAR.vx);
        STAR.momentumX = Math.abs(STAR.momentumX);
      } else if (STAR.x > WIDTH - R) {
        STAR.x = 2 * (WIDTH - R) - STAR.x;
        STAR.vx = -Math.abs(STAR.vx);
        STAR.momentumX = -Math.abs(STAR.momentumX);
      }

      // Reflect off top/bottom walls (radius-aware)
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

    // If the star has white value, decay it
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }
    // If the star has been hidden for a while, flicker the star back on
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
      // Decay star opacity
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
      // If star is invisible, keep it hidden for a while
    } else {
      STAR.opacity -= 0.0001;
    }
  }

  // Global variable decay
  USER_SPEED *= 0.5;
  if (USER_SPEED < 0.001) USER_SPEED = 0;
  CIRCLE_TIMER *= 0.9;
  if (CIRCLE_TIMER < 0.001) CIRCLE_TIMER = 0;
  REPEL_TIMER *= 0.85;
  if (REPEL_TIMER < 0.001) REPEL_TIMER = 0;






  const DBG_STAR = STARS[0];

document.getElementById('dbgSpeed').textContent =
  USER_SPEED.toFixed(3);

document.getElementById('dbgRepel').textContent =
  REPEL_TIMER.toFixed(1);
}

/*---------- Star rendering ----------*/

// 0 at/beyond wrap threshold, 1 when safely away from edges
function edgeFactor(STAR) {
  const R = (STAR.whiteValue * 2 + STAR.size) || 0;

  // distance from the "fully off-screen" threshold on each side
  const left = STAR.x + R; // 0 when x == -R
  const right = WIDTH + R - STAR.x; // 0 when x == WIDTH + R
  const top = STAR.y + R; // 0 when y == -R
  const bottom = HEIGHT + R - STAR.y; // 0 when y == HEIGHT + R

  const d = Math.min(left, right, top, bottom);

  // fade band width (gentle). tweak this number.
  const FADE_BAND = Math.min(90, SCREEN_SIZE * 0.03);

  let t = d / FADE_BAND;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  // smoothstep (soft fade)
  return t * t * (3 - 2 * t);
}

// Draw all lines and star bodies for the current frame
function drawStarsWithLines() {
  // If not finished loading, or loading another page, then cancel
  if (!HAS_CANVAS || !BRUSH) return;

  // Clear entire canvas
  BRUSH.clearRect(0, 0, WIDTH, HEIGHT);

  // Colored ring around user
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
      const DISTANCE= Math.hypot(X_DISTANCE, Y_DISTANCE) / 1100 * SCREEN_SIZE;

      if (DISTANCE < MAX_LINK_DISTANCE) {
        // Dimmer with distance
        let ALPHA = (1 - DISTANCE / MAX_LINK_DISTANCE) * ((STAR_A.opacity + STAR_B.opacity) / 2);
        // Dimmer near edges for screen wrapping (fade out before teleport)
        ALPHA *= Math.min(edgeFactor(STAR_A), edgeFactor(STAR_B));

        BRUSH.strokeStyle = `rgba(0, 0, 0, ${ALPHA})`;
        BRUSH.beginPath();
        BRUSH.moveTo(STAR_A.x, STAR_A.y);
        BRUSH.lineTo(STAR_B.x, STAR_B.y);
        BRUSH.stroke();
      }
    }
  }

  // Star bodies (colored dots)
  for (const STAR of STARS) {
    let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
    if (TEMP_RED > 255) TEMP_RED = 255;

    BRUSH.beginPath();
    BRUSH.fillStyle = `rgba(${TEMP_RED}, ${
      255 * STAR.whiteValue
    }, ${255 * STAR.whiteValue}, ${STAR.opacity})`;
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

// Redraw without user circle on page leave
window.forceStarfieldRedraw = () => {
  if (!BRUSH || !CANVAS) return;
  drawStarsWithLines();
};

/*---------- Canvas resize & animation loop ----------*/

// Match canvas to viewport and rescale stars to fit
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

  // Rescale stars if we already had a previous size
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

// Main requestAnimationFrame loop
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
 *========================================*/

// Update pointer speed and derived USER_SPEED
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

// Shared start handler for mouse/touch pointer interactions
function startPointerInteraction(X, Y, TIME) {
  REPEL_TIMER = 25000; // Repel on click/touch
  updateSpeed(X, Y, TIME);
}

// Mouse move updates live pointer speed
window.addEventListener('mousemove', (E) =>
  updateSpeed(E.clientX, E.clientY, E.timeStamp)
);

// Mouse down triggers strong repulsion + speed bump
window.addEventListener('mousedown', (E) => {
  startPointerInteraction(E.clientX, E.clientY, E.timeStamp);
});

// Touch start triggers the same repulsion behavior
window.addEventListener('touchstart', (E) => {
  const TOUCH_POINT = E.touches[0];
  if (!TOUCH_POINT) return;
  startPointerInteraction(TOUCH_POINT.clientX, TOUCH_POINT.clientY, E.timeStamp);
});

// Touch move updates speed from active touch
window.addEventListener('touchmove', (E) => {
  const TOUCH_POINT = E.touches[0];
  if (!TOUCH_POINT) return;
  updateSpeed(TOUCH_POINT.clientX, TOUCH_POINT.clientY, E.timeStamp);
});

//#endregion POINTER INPUT

//#region STARFIELD INITIALIZATION
/*========================================*
 *  STARFIELD INITIALIZATION
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

  // Chromebook / first-load guard
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