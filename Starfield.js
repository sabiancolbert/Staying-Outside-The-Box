// thank heavens for chatGPT <3

/*==============================================================*
 *                       STARFIELD SCRIPT
 *==============================================================*
 *
 *  - Constellation canvas & starfield state
 *  - Storage for star positions & meta
 *  - Star creation, motion, and drawing
 *  - Pointer input (mouse/touch) for attraction/repulsion
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

// Freeze flag to pause star motion during transitions
let FREEZE_CONSTELLATION = false;

// Pointer tracking
let LAST_X = 0;
let LAST_Y = 0;
let LAST_TIME = 0;
let POINTER_SPEED = 0;
let SMOOTH_SPEED = 0;
let CLEANED_USER_SPEED = 0;
let ATTRACTION_VALUE = 1;
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
        width:           WIDTH,
        height:          HEIGHT,
        scaleFactor:     SCALE_FACTOR,
        attractionValue: ATTRACTION_VALUE,
        repulsionValue:   REPULSION_VALUE,
        cleanedUserSpeed:CLEANED_USER_SPEED,
        smoothSpeed:     SMOOTH_SPEED,
        pointerSpeed:    POINTER_SPEED,
        lastX:           LAST_X,
        lastY:           LAST_Y,
        lastTime:        LAST_TIME
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

          // Restore motion state, attraction, and pointer info
          ATTRACTION_VALUE   = META.attractionValue   ?? 1;
          REPULSION_VALUE     = META.repulsionValue     ?? 0;
          CLEANED_USER_SPEED = META.cleanedUserSpeed  ?? 0;
          SMOOTH_SPEED       = META.smoothSpeed       ?? 0;
          POINTER_SPEED      = META.pointerSpeed      ?? 0;

          // Pointer position / timing for the repulsion bubble
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
    // Basic drift scaled by pointer speed
    STAR.x += STAR.vx * (CLEANED_USER_SPEED + 1);
    STAR.y += STAR.vy * (CLEANED_USER_SPEED + 1);

    // Pointer pull / push zone around the cursor
    if (LAST_TIME !== 0 && CLEANED_USER_SPEED > 0.19) {
      const DX = LAST_X - STAR.x;
      const DY = LAST_Y - STAR.y;
      const DIST_SQ = DX * DX + DY * DY;
      const MAX_INFLUENCE = 10000 * (SCALE_FACTOR / 500);

      if (DIST_SQ > 4 && DIST_SQ < MAX_INFLUENCE) {
        // Base strength shared by attraction and repulsion
        const BASE_PULL =
          0.008 *
          CLEANED_USER_SPEED *
          ((MAX_INFLUENCE - DIST_SQ) / MAX_INFLUENCE);
        
        // Separate strengths for attraction and repulsion
        const ATTR_PULL = BASE_PULL * ATTRACTION_VALUE;   // inward + orbit
        const REP_PULL  = BASE_PULL * REPULSION_VALUE;   // outward + orbit
        
        const DIST = Math.sqrt(DIST_SQ) || 1;
        
        // Unit radial vector (toward the pointer)
        const RAD_X = DX / DIST;
        const RAD_Y = DY / DIST;
        
        // Unit tangential vector (perpendicular to radial)
        const TAN_X = -RAD_Y;
        const TAN_Y = RAD_X;
        
        // 0 = straight line toward/from pointer, 1 = pure circular orbit
        const CURVE = 0.45; // tweak 0.2–0.7 for more/less curve
        
        const MIX_R = 1 - CURVE;
        const MIX_T = CURVE;
        
        // Attraction: toward pointer + tangential orbit
        const ATTR_DIR_X = RAD_X * MIX_R + TAN_X * MIX_T;
        const ATTR_DIR_Y = RAD_Y * MIX_R + TAN_Y * MIX_T;
        
        // Repulsion: away from pointer + SAME tangential direction
        const REP_DIR_X = -RAD_X * MIX_R + TAN_X * MIX_T;
        const REP_DIR_Y = -RAD_Y * MIX_R + TAN_Y * MIX_T;
        
        // Combine attraction + repulsion into one displacement
        const PULL_X =
          (ATTR_DIR_X * ATTR_PULL + REP_DIR_X * REP_PULL) * DIST;
        const PULL_Y =
          (ATTR_DIR_Y * ATTR_PULL + REP_DIR_Y * REP_PULL) * DIST;
        
        STAR.x += PULL_X;
        STAR.y += PULL_Y;
      }
    }

    // White flash decay for "spark" effect
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    // Opacity twinkle behavior
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }

    // Wrap stars at edges so they re-enter from the opposite side
    if (STAR.x < 0) STAR.x = WIDTH;
    if (STAR.x > WIDTH) STAR.x = 0;
    if (STAR.y < 0) STAR.y = HEIGHT;
    if (STAR.y > HEIGHT) STAR.y = 0;
  }

  // Slowly decay pointer speed influence
  CLEANED_USER_SPEED *= 0.95;
  if (CLEANED_USER_SPEED < 0.05) CLEANED_USER_SPEED = 0;
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
 *  POINTER INPUT (MOUSE / TOUCH)
 *========================================*/

/*---------- Pointer speed calculation ----------*/

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
  REPULSION_VALUE = 1; // Repel on click/touch
  updateSpeed(X, Y, TIME);
  CLEANED_USER_SPEED = Math.min(CLEANED_USER_SPEED + 0.8, 3);
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