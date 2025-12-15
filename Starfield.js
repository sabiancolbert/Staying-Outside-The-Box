

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

// Freeze flag to pause star motion during transitions
let FREEZE_CONSTELLATION = false;

// Pointer tracking
let USER_X = 0;
let USER_Y = 0;
let USER_TIME = 0;
let USER_SPEED = 0;
let REPEL_TIMER = 0;

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
        width:           WIDTH,
        height:          HEIGHT,
        scaleFactor:     SCREEN_SIZE,
        repelTimer:      REPEL_TIMER,
        userSpeed:       USER_SPEED,
        userX:           USER_X,
        userY:           USER_Y,
        userTime:        USER_TIME
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
          REPEL_TIMER   = META.repelTimer    ?? 0;
          USER_SPEED = META.userSpeed ?? 0;

          if (typeof META.userX === 'number') USER_X = META.userX;
          if (typeof META.userY === 'number') USER_Y = META.userY;

          // USER_TIME is just a "pointer ever existed" flag in moveStars
          if (typeof META.userTime === 'number' && META.userTime > 0) {
            USER_TIME = META.userTime;
          } else {
            USER_TIME = (window.performance && performance.now)
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
// Move, fade, and wrap stars around the screen
function moveStars() {
  if (!HAS_CANVAS || !STARS.length) return;
  
  for (const STAR of STARS) {
 
    const X_DISTANCE = USER_X - STAR.x;
    const Y_DISTANCE = USER_Y - STAR.y;
    // Distance from user
    const DISTANCE = Math.hypot(X_DISTANCE, Y_DISTANCE) || 1;
    // 0 = far, 1 = close
    const INV_GRADIENT_DISTANCE = 1 / DISTANCE;
    // Gradient towards user
    const GRADIENT_TO_USER_X = X_DISTANCE * (INV_GRADIENT_DISTANCE ** 4);
    const GRADIENT_TO_USER_Y = Y_DISTANCE * (INV_GRADIENT_DISTANCE ** 4);
    
    /*--------------------------------------*
     *  FORM RING AROUND USER
     *--------------------------------------*/
    // Increase all star speed (clamped) with user interaction
    STAR.momentumX += 0.03 * USER_SPEED * STAR.vx;
    STAR.momentumY += 0.03 * USER_SPEED * STAR.vy;
    STAR.momentumX = Math.max(-5, Math.min(STAR.momentumX, 5));
    STAR.momentumY = Math.max(-5, Math.min(STAR.momentumY, 5));
    
    // User gravity ring & repel ball
    const ATTRACT = 50000;
    const REPEL = 1000 * ATTRACT;
    STAR.momentumX += ATTRACT * USER_SPEED * GRADIENT_TO_USER_X;
    STAR.momentumY += ATTRACT * USER_SPEED * GRADIENT_TO_USER_Y;
    STAR.momentumX -= REPEL * USER_SPEED * GRADIENT_TO_USER_X * (INV_GRADIENT_DISTANCE ** 2);
    STAR.momentumY -= REPEL * USER_SPEED * GRADIENT_TO_USER_Y * (INV_GRADIENT_DISTANCE ** 2);
    
    // Clamp ring momentum high, and make it form a circle
    const LIMIT = 10;
    const HYPOT = Math.hypot(STAR.momentumX, STAR.momentumY);
    if (HYPOT > LIMIT) { STAR.momentumX *= LIMIT / HYPOT; STAR.momentumY *= LIMIT / HYPOT; }
    
    // Add global repulsion on pokes
    const GLOBAL_REPULSION_X = Math.min(3, REPEL_TIMER * GRADIENT_TO_USER_X / INV_GRADIENT_DISTANCE);
    const GLOBAL_REPULSION_Y = Math.min(3, REPEL_TIMER * GRADIENT_TO_USER_Y / INV_GRADIENT_DISTANCE);

    // Add all vectors up and apply them
    STAR.x += STAR.vx + STAR.momentumX - GLOBAL_REPULSION_X;
    STAR.y += STAR.vy + STAR.momentumY - GLOBAL_REPULSION_Y;

    // Decay momentum
    STAR.momentumX *= 0.97;
    STAR.momentumY *= 0.97;
















    /*--------------------------------------*
     *  SCREEN WRAP
     *--------------------------------------*/
    STAR.x = (STAR.x % WIDTH + WIDTH) % WIDTH;
    STAR.y = (STAR.y % HEIGHT + HEIGHT) % HEIGHT;
    /*--------------------------------------*
     *  TWINKLE & LIFE CYCLE
     *--------------------------------------*/
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

  /*--------------------------------------*
   *  GLOBAL DECAY
   *--------------------------------------*/
  USER_SPEED *= 0.85;
  if (USER_SPEED < 0.001) USER_SPEED = 0;

  REPEL_TIMER *= 0.92;
  if (REPEL_TIMER < 0.001) REPEL_TIMER = 0;
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
      const X_DISTANCE = A.x - B.x;
      const Y_DISTANCE = A.y - B.y;
      const DIST = Math.hypot(X_DISTANCE, Y_DISTANCE);

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
  const OLD_SCREEN_SIZE = SCREEN_SIZE || 1;

  WIDTH = window.innerWidth || 0;
  HEIGHT = window.innerHeight || 0;

  CANVAS.width = WIDTH;
  CANVAS.height = HEIGHT;

  SCREEN_SIZE = Math.min(WIDTH + HEIGHT, 2000);
  MAX_STAR_COUNT = SCREEN_SIZE / 10;
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
  USER_X = X;
  USER_Y = Y;
  USER_TIME = TIME;
}

// Shared start handler for mouse/touch pointer interactions
function startPointerInteraction(X, Y, TIME) {
  REPEL_TIMER = 100000; // Repel on click/touch
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