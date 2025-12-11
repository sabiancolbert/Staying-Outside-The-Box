// thank heavens for chatGPT <3
/*==============================================================*
 *                       STARFIELD SCRIPT
 *==============================================================*
 *
 *  - Constellation canvas & starfield state
 *  - Storage for star positions & meta
 *  - Star creation, motion, and drawing
 *  - Pointer input (mouse/touch) for repulsion
 *  - Canvas resize & animation loop
 *==============================================================*/

//#region STARFIELD GLOBALS
/*========================================*
 *  STARFIELD GLOBAL STATE
 *========================================*/
/*---------- Constellation canvas & starfield ----------*/
const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS && CANVAS.getContext ? CANVAS.getContext('2d') : null;
const HAS_CANVAS = !!(CANVAS && BRUSH);
if (!HAS_CANVAS) {
  console.warn('Constellation canvas not found or unsupported; starfield disabled.');
}
// Freeze flag to pause star motion during transitions
let FREEZE_CONSTELLATION = false;
// Pointer tracking
let LAST_X = 0;
let LAST_Y = 0;
let LAST_TIME = 0;
let POINTER_SPEED = 0;
let SMOOTH_SPEED = 0;
let CLEANED_USER_SPEED = 0;
// Repulsion strength
let REPULSION_VALUE = 0;
// Canvas size and star scaling
let WIDTH = 0;
let HEIGHT = 0;
let SCALE_FACTOR = 0;
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;
// Starfield data
let STARS = [];
//#endregion STARFIELD GLOBALS
//#region STARFIELD STORAGE
/*========================================*
 *  STARFIELD STORAGE
 *========================================*/
// Save star positions and motion meta into localStorage
function saveStarsToStorage() {
  if (!HAS_CANVAS) return;
  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width:           WIDTH,
        height:          HEIGHT,
        scaleFactor:     SCALE_FACTOR,
        repulsionValue:  REPULSION_VALUE,
        cleanedUserSpeed:CLEANED_USER_SPEED,
        smoothSpeed:     SMOOTH_SPEED,
        pointerSpeed:    POINTER_SPEED,
        lastX:           LAST_X,
        lastY:           LAST_Y,
        lastTime:        LAST_TIME
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
 *  STARFIELD CREATION & MOTION
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
          REPULSION_VALUE   = META.repulsionValue    ?? 0;
          CLEANED_USER_SPEED = META.cleanedUserSpeed ?? 0;
          SMOOTH_SPEED       = META.smoothSpeed      ?? 0;
          POINTER_SPEED      = META.pointerSpeed     ?? 0;
          if (typeof META.lastX === 'number') LAST_X = META.lastX;
          if (typeof META.lastY === 'number') LAST_Y = META.lastY;
          // LAST_TIME is just a "pointer ever existed" flag in moveStars
          if (typeof META.lastTime === 'number' && META.lastTime > 0) {
            LAST_TIME = META.lastTime;
          } else {
            LAST_TIME = (window.performance && performance.now)
              ? performance.now()
              : Date.now();
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
  const MAX_SIZE = SCALE_FACTOR / 400 || 3;
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
      whiteValue: 0
    });
  }
}
/*---------- Star animation step ----------*/















// Move, fade, and wrap stars around the screen
function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;

  for (const STAR of STARS) {

    // --- 1. Pointer "gravity" modifies velocity (orbit-ish around finger) ---
    if (LAST_TIME !== 0 && CLEANED_USER_SPEED > 0.19) {
      const DX = LAST_X - STAR.x;
      const DY = LAST_Y - STAR.y;
      const DIST_SQ = DX * DX + DY * DY;

      const MAX_INFLUENCE = 10000 * (SCALE_FACTOR / 500);

      if (DIST_SQ > 9 && DIST_SQ < MAX_INFLUENCE) {
        const DIST = Math.sqrt(DIST_SQ) || 1;
        const MAX_RADIUS = Math.sqrt(MAX_INFLUENCE);

        // Target ring radius around your finger (fraction of field radius)
        const TARGET_RADIUS = MAX_RADIUS * 0.35;

        // Positive if outside the ring, negative if inside
        const radialError = DIST - TARGET_RADIUS;

        // Unit radial vector (toward pointer)
        const RAD_X = DX / DIST;
        const RAD_Y = DY / DIST;

        // Tangential (perpendicular) for orbit-ish motion
        const TAN_X = -RAD_Y;
        const TAN_Y = RAD_X;

        // Base scale from your motion
        const SPEED_FACTOR = 0.4 + CLEANED_USER_SPEED;

        // Softer constants than before to avoid crazy speeds
        const radialK = 0.00025 * SPEED_FACTOR;  // ring spring
        const orbitK  = 0.0005  * SPEED_FACTOR;  // tangential "orbit"

        // Spring-like radial term: push toward ring, not center
        let radialAccel = -radialError * radialK;

        // Allow repulsion to exaggerate radial behavior
        radialAccel *= (1 + REPULSION_VALUE);

        // Tangential acceleration
        let orbitAccel = orbitK;

        // Base acceleration vector
        let ax = RAD_X * radialAccel + TAN_X * orbitAccel;
        let ay = RAD_Y * radialAccel + TAN_Y * orbitAccel;

        // --- Wobble: mix accel direction with the star's velocity direction ---
        const vLen = Math.hypot(STAR.vx, STAR.vy) || 1;
        const vDirX = STAR.vx / vLen;
        const vDirY = STAR.vy / vLen;

        const accelLen = Math.hypot(ax, ay) || 1;
        let aDirX = ax / accelLen;
        let aDirY = ay / accelLen;

        const WOBBLE = 0.3;             // 0 = perfect ring orbit, 1 = follow velocity
        const INV_WOBBLE = 1 - WOBBLE;

        const mixedDirX = aDirX * INV_WOBBLE + vDirX * WOBBLE;
        const mixedDirY = aDirY * INV_WOBBLE + vDirY * WOBBLE;

        // Keep magnitude, just use mixed direction
        ax = mixedDirX * accelLen;
        ay = mixedDirY * accelLen;

        // Apply acceleration to velocity
        STAR.vx += ax;
        STAR.vy += ay;
      }
    }

    // --- 2. Friction + clamped speed so things never go insane or dead ---
    // Mild global friction so speeds slowly relax
    STAR.vx *= 0.995;
    STAR.vy *= 0.995;

    const speed = Math.hypot(STAR.vx, STAR.vy);
    if (speed > 0) {
      // Scale max speed to canvas size a bit
      const MAX_SPEED = 0.8 * (SCALE_FACTOR / 1000);  // px per frame
      const MIN_SPEED = 0.02;                         // keep tiny drift

      if (speed > MAX_SPEED) {
        const scaleDown = MAX_SPEED / speed;
        STAR.vx *= scaleDown;
        STAR.vy *= scaleDown;
      } else if (speed < MIN_SPEED) {
        const scaleUp = MIN_SPEED / speed;
        STAR.vx *= scaleUp;
        STAR.vy *= scaleUp;
      }
    }

    // --- 3. Move by velocity only (NO extra CLEANED_USER_SPEED multiplier) ---
    STAR.x += STAR.vx;
    STAR.y += STAR.vy;

    // --- 4. Spark / fade / wrap behavior (unchanged) ---
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }

    if (STAR.x < 0) STAR.x = WIDTH;
    if (STAR.x > WIDTH) STAR.x = 0;
    if (STAR.y < 0) STAR.y = HEIGHT;
    if (STAR.y > HEIGHT) STAR.y = 0;
  }

  // Pointer influence itself still fades out over time
  CLEANED_USER_SPEED *= 0.95;
  if (CLEANED_USER_SPEED < 0.05) CLEANED_USER_SPEED = 0;

  REPULSION_VALUE *= 0.965;
  if (REPULSION_VALUE < 0.01) REPULSION_VALUE = 0;
}














/*---------- Star rendering ----------*/
// Draw all lines and star bodies for the current frame
function drawStarsWithLines() {
  if (!HAS_CANVAS || !BRUSH) return;
  // Clear entire canvas
  BRUSH.clearRect(0, 0, WIDTH, HEIGHT);
  // Lines between nearby stars
  BRUSH.lineWidth = 1;
  const COUNT = STARS.length;
  for (let I = 0; I < COUNT; I++) {
    for (let J = I + 1; J < COUNT; J++) {
      const A = STARS[I];
      const B = STARS[J];
      const DX = A.x - B.x;
      const DY = A.y - B.y;
      const DIST = Math.hypot(DX, DY);
      if (DIST < MAX_LINK_DISTANCE) {
        const ALPHA =
          (1 - DIST / MAX_LINK_DISTANCE) *
          ((A.opacity + B.opacity) / 2);
        BRUSH.strokeStyle = `rgba(0, 0, 0, ${ALPHA})`;
        BRUSH.beginPath();
        BRUSH.moveTo(A.x, A.y);
        BRUSH.lineTo(B.x, B.y);
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
/*---------- Canvas resize & animation loop ----------*/
// Match canvas to viewport and rescale stars to fit
function resizeCanvas() {
  if (!HAS_CANVAS) return;
  const OLD_WIDTH = WIDTH;
  const OLD_HEIGHT = HEIGHT;
  const OLD_SCALE_FACTOR = SCALE_FACTOR || 1;
  WIDTH = window.innerWidth || 0;
  HEIGHT = window.innerHeight || 0;
  CANVAS.width = WIDTH;
  CANVAS.height = HEIGHT;
  SCALE_FACTOR = Math.min(WIDTH + HEIGHT, 2000);
  MAX_STAR_COUNT = SCALE_FACTOR / 10;
  MAX_LINK_DISTANCE = SCALE_FACTOR / 10;
  // Rescale stars if we already had a previous size
  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0) {
    const SCALE_X = WIDTH / OLD_WIDTH;
    const SCALE_Y = HEIGHT / OLD_HEIGHT;
    const SCALE_SIZE = SCALE_FACTOR / OLD_SCALE_FACTOR;
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
 *  POINTER INPUT (MOUSE / TOUCH)
 *========================================*/
// Update pointer speed and derived CLEANED_USER_SPEED
function updateSpeed(X, Y, TIME) {
  // Fallback if a weird environment passes an invalid timestamp
  if (!Number.isFinite(TIME)) {
    TIME = (window.performance && performance.now)
      ? performance.now()
      : Date.now();
  }
  const DT = TIME - LAST_TIME;
  if (DT > 0) {
    POINTER_SPEED = Math.hypot(X - LAST_X, Y - LAST_Y) / DT;
  }
  SMOOTH_SPEED = SMOOTH_SPEED * 0.8 + POINTER_SPEED * 10;
  CLEANED_USER_SPEED = Math.min(
    SMOOTH_SPEED * (SCALE_FACTOR / 1100) ** 2,
    10
  );
  LAST_X = X;
  LAST_Y = Y;
  LAST_TIME = TIME;
}
// Shared start handler for mouse/touch pointer interactions
function startPointerInteraction(X, Y, TIME) {
  REPULSION_VALUE = 3; // Repel on click/touch
  updateSpeed(X, Y, TIME);
  CLEANED_USER_SPEED = CLEANED_USER_SPEED + 0.8;
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
 *  STARFIELD INITIALIZATION
 *========================================*/
try {
  // Initialize canvas size
  resizeCanvas();
  // Restore or create starfield
  initStars();
  // Start animation loop
  animate();
  // Keep canvas scaled to window size
  window.addEventListener('resize', resizeCanvas);
} catch (ERR) {
  console.error('Initialization error in starfield script:', ERR);
}
//#endregion STARFIELD INITIALIZATION