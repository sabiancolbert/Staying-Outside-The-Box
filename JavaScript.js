// thank heavens for chatGPT <3
/*==============================================================*
 *                       JAVASCRIPT MAP
 *==============================================================*

  1. GLOBAL VARIABLES & CONSTANTS
     - Page state flags
     - Starfield canvas variables
     - Pointer tracking / motion values

  2. TRANSITION & LAYOUT LOGIC
     2.1 Scroll control
         - lockScrollToContainer()
         - freeScrollLayout()
     2.2 Page load handler
         - slide-in setup
         - back-link persistence
     2.3 Back/forward cache recovery
     2.4 Page navigation + slide-out transition
         - transitionTo()

  3. STORAGE & PERSISTENCE
     - saveStarsToStorage()
     - beforeunload sync

  4. STARFIELD LOGIC
     4.1 Helpers
         - randomBetween()
     4.2 Initialization
         - initStars()
         - createStars()
     4.3 Animation steps
         - moveStars()
         - drawStarsWithLines()
     4.4 Canvas resizing + animation loop
         - resizeCanvas()
         - animate()

  5. POINTER INPUT & SPEED LOGIC
     - updateSpeed()
     - startPointerInteraction()
     - mouse + touch listeners

  6. SIMPLE HTML UTILITIES
     - toggleElement()
     - touchend blur behavior

  7. INITIALIZATION BLOCK
     - resizeCanvas()
     - initStars()
     - animate()
     - window resize listener

 *==============================================================*/
/*========================================*
 *  1 GLOBAL VARIABLES & CONSTANTS
 *========================================*/

/*---------- Page state flags ----------*/

let IS_INTERNAL_REFERRER = false;  // true if we came from same origin
let IS_TRANSITIONING = false;      // prevents double navigation clicks

/*---------- Main layout handles ----------*/

// Main content wrapper (#transitionContainer is the sliding page)
const getPage = () => document.getElementById('transitionContainer');

// Detect if this is the homepage (has the main menu button)
const isHomepage = () => !!document.querySelector('#menuButton');

// Shared helper for slide animation duration (seconds)
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6) + window.scrollY * 0.001;

/*---------- Constellation canvas & starfield ----------*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS.getContext('2d');

// Freeze flag to pause star motion during transitions
let FREEZE_CONSTELLATION = false;

// Pointer tracking for speed / attraction
let LAST_X = 0;
let LAST_Y = 0;
let LAST_TIME = 0;
let POINTER_SPEED = 0;
let SMOOTH_SPEED = 0;
let CLEANED_USER_SPEED = 0;
let ATTRACTION_VALUE = 1;

// Canvas size and star scaling
let WIDTH = 0;
let HEIGHT = 0;
let SCALE_FACTOR = 0;
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

// Starfield data
let STARS = [];


/*========================================*
 *  2 TRANSITION & LAYOUT LOGIC
 *========================================*/

/*---------- Layout scroll helpers ----------*/

// Lock scroll to #transitionContainer only
function lockScrollToContainer(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  HTML.style.overflowY = 'hidden';  // window scroll disabled
  BODY.style.height = '100dvmin';   // keep body pinned to viewport height

  if (PAGE) PAGE.style.overflowY = 'auto'; // page wrapper scrolls
}

// Restore normal page scroll to window/body for proper animation 
function freeScrollLayout(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  // Capture scroll before layout changes
  const CURRENT_SCROLL = PAGE ? PAGE.scrollTop : window.scrollY;

  // Switch to window/body scrolling
  HTML.style.overflowY = 'auto';
  BODY.style.height = 'auto';
  if (PAGE) PAGE.style.overflowY = 'visible';

  // Re-apply scroll position once layout resets scroll to top
  requestAnimationFrame(() => {
    window.scrollTo(0, CURRENT_SCROLL);
  });
}


/*---------- Page load handler ----------*/

window.addEventListener('load', () => {
  const PAGE = getPage();

  // Read and clear "suppressHomeBack" flag for this view
  const SUPPRESS_HOME_BACK =
    sessionStorage.getItem('suppressHomeBack') === '1';
  sessionStorage.removeItem('suppressHomeBack');

  // Strip hash so anchor links don't break slide transitions
  if (window.location.hash) {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }

  // Configure slide-in speed and lock scroll once finished
  if (PAGE) {
    document.documentElement.style.setProperty(
      '--slide-duration',
      `${getSlideDurationSeconds()}s`
    );

    // Wait one frame to avoid flashing before animation
    requestAnimationFrame(() => {
      PAGE.classList.add('ready');

      // After the slide-in completes, lock scroll to container
      PAGE.addEventListener(
        'transitionend',
        () => lockScrollToContainer(PAGE),
        { once: true }
      );
    });
  }

  // Detect if referrer is from this same origin
  const REF = document.referrer;
  if (REF) {
    try {
      const REF_URL = new URL(REF);
      IS_INTERNAL_REFERRER = REF_URL.origin === window.location.origin;
    } catch {
      IS_INTERNAL_REFERRER = false;
    }
  }

  // Configure homepage back link visibility and stored URL
  const BACK_LINK = document.getElementById('homepageBack');
  if (BACK_LINK) {
    if (!SUPPRESS_HOME_BACK && IS_INTERNAL_REFERRER && REF) {
      try {
        localStorage.setItem('homepageBackUrl', REF);
      } catch (ERR) {
        console.warn('Could not save homepageBackUrl:', ERR);
      }
    } else {
      localStorage.removeItem('homepageBackUrl');
    }

    BACK_LINK.style.display =
      !SUPPRESS_HOME_BACK && localStorage.getItem('homepageBackUrl')
        ? 'block'
        : 'none';
  }

  // Fresh external entry: clear saved constellation so it feels new
  if (!IS_INTERNAL_REFERRER) {
    localStorage.removeItem('constellationStars');
    localStorage.removeItem('constellationMeta');
  }
});


/*---------- Back/forward cache handler ----------*/

window.addEventListener('pageshow', (event) => {
  const PAGE = getPage();
  if (!PAGE) return;

  const NAV_TYPE = (performance.getEntriesByType
    ? performance.getEntriesByType('navigation')
    : [])[0]?.type;

  // If restored from bfcache, reset transition and motion state
  if (event.persisted || NAV_TYPE === 'back_forward') {
    PAGE.classList.remove('slide-out');
    PAGE.classList.add('ready');

    lockScrollToContainer(PAGE);

    FREEZE_CONSTELLATION = false;
    CLEANED_USER_SPEED = 0;
    SMOOTH_SPEED = 0;
    POINTER_SPEED = 0;

    PAGE.scrollTop = 0;
    IS_TRANSITIONING = false;
  }
});


/*---------- Navigation & transition trigger ----------*/

// Trigger slide-out animation and then navigate to new URL
function transitionTo(url, isMenu = false) {
  if (IS_TRANSITIONING) return;
  IS_TRANSITIONING = true;

  const PAGE = getPage();

  // Menu links hide the back-link on arrival
  if (isMenu) {
    sessionStorage.setItem('suppressHomeBack', '1');
  } else {
    sessionStorage.removeItem('suppressHomeBack');
  }

  // Special "back" keyword uses stored homepageBackUrl
  if (url === 'back') {
    const STORED = localStorage.getItem('homepageBackUrl');
    if (!STORED) {
      IS_TRANSITIONING = false;
      return;
    }
    url = STORED;
  }

  // If page wrapper is missing, just bail straight to the URL
  if (!PAGE) {
    window.location.href = url;
    return;
  }

  // Pause star motion and persist their current state
  FREEZE_CONSTELLATION = true;
  saveStarsToStorage();

  // Give body the scroll responsibility again
  freeScrollLayout(PAGE);

  // Kick off slide-out animation
  PAGE.classList.add('slide-out');

  // Navigate after slide-out completes
  setTimeout(() => {
    window.location.href = url;
  }, getSlideDurationSeconds() * 1000);
}


/*========================================*
 *  3 STORAGE & PERSISTENCE
 *========================================*/

// Save star positions and motion meta into localStorage
function saveStarsToStorage() {
  try {
    localStorage.setItem('constellationStars', JSON.stringify(STARS));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width: WIDTH,
        height: HEIGHT,
        scaleFactor: SCALE_FACTOR,
        attractionValue: ATTRACTION_VALUE,
        cleanedUserSpeed: CLEANED_USER_SPEED,
        smoothSpeed: SMOOTH_SPEED,
        pointerSpeed: POINTER_SPEED
      })
    );
  } catch (ERR) {
    console.warn('Could not save stars:', ERR);
  }
}

// Save constellation right before the page unloads or reloads
window.addEventListener('beforeunload', saveStarsToStorage);


/*========================================*
 *  4 STARFIELD LOGIC
 *========================================*/

/*---------- Random helper ----------*/

// Random float in [min, max)
const randomBetween = (min, max) =>
  Math.random() * (max - min) + min;


/*---------- Star initialization ----------*/

// Load saved stars if present, otherwise create a fresh field
function initStars() {
  const SAVED = localStorage.getItem('constellationStars');

  if (!SAVED) {
    createStars();
    return;
  }

  try {
    const PARSED = JSON.parse(SAVED);

    if (Array.isArray(PARSED) && PARSED.length) {
      STARS = PARSED;

      const META_RAW = localStorage.getItem('constellationMeta');
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

          // Restore motion state and attraction settings
          ATTRACTION_VALUE = META.attractionValue ?? 1;
          CLEANED_USER_SPEED = META.cleanedUserSpeed ?? 0;
          SMOOTH_SPEED = META.smoothSpeed ?? 0;
          POINTER_SPEED = META.pointerSpeed ?? 0;
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
  STARS = [];

  // Keep size range valid even on very small screens
  const minSize = 3;
  const maxSize = SCALE_FACTOR / 400;

  for (let I = 0; I < MAX_STAR_COUNT; I++) {
    STARS.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: randomBetween(-0.25, 0.25),
      vy: randomBetween(-0.25, 0.25),
      size: randomBetween(
        Math.min(minSize, maxSize),
        Math.max(minSize, maxSize)
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
  for (const STAR of STARS) {
    // Basic drift scaled by pointer speed
    STAR.x += STAR.vx * (CLEANED_USER_SPEED + 1);
    STAR.y += STAR.vy * (CLEANED_USER_SPEED + 1);

    // Pointer pull / push zone around the cursor
    if (LAST_TIME !== 0 && CLEANED_USER_SPEED > 0.19) {
      const DX = LAST_X - STAR.x;
      const DY = LAST_Y - STAR.y;
      const DIST_SQ = DX * DX + DY * DY;
      const MAX_INFLUENCE = 12000 * (SCALE_FACTOR / 500);

      if (DIST_SQ > 4 && DIST_SQ < MAX_INFLUENCE) {
        const PULL =
          0.005 *
          CLEANED_USER_SPEED *
          ((MAX_INFLUENCE - DIST_SQ) / MAX_INFLUENCE) *
          (ATTRACTION_VALUE < 0 ? ATTRACTION_VALUE * 2.5 : ATTRACTION_VALUE);

        STAR.x += DX * PULL;
        STAR.y += DY * PULL;
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

  // Ease attraction back towards neutral (1)
  ATTRACTION_VALUE += (1 - ATTRACTION_VALUE) * 0.06;
  if (ATTRACTION_VALUE > 1) ATTRACTION_VALUE = 1;
}


/*---------- Star rendering ----------*/

// Draw all lines and star bodies for the current frame
function drawStarsWithLines() {
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
  const OLD_WIDTH = WIDTH;
  const OLD_HEIGHT = HEIGHT;
  const OLD_SCALE_FACTOR = SCALE_FACTOR;

  WIDTH = window.innerWidth;
  HEIGHT = window.innerHeight;
  CANVAS.width = WIDTH;
  CANVAS.height = HEIGHT;

  SCALE_FACTOR = Math.min(WIDTH + HEIGHT, 2000);
  MAX_STAR_COUNT = SCALE_FACTOR / 10;
  MAX_LINK_DISTANCE = SCALE_FACTOR / 10;

  // Rescale stars if we already had a previous size
  if (OLD_WIDTH !== 0) {
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
  if (!FREEZE_CONSTELLATION) moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}


/*========================================*
 *  5 POINTER INPUT & SPEED LOGIC
 *========================================*/

/*---------- Pointer speed calculation ----------*/

// Update pointer speed and derived CLEANED_USER_SPEED
function updateSpeed(x, y, time) {
  const DT = time - LAST_TIME;

  if (DT > 0) {
    POINTER_SPEED = Math.hypot(x - LAST_X, y - LAST_Y) / DT;
  }

  SMOOTH_SPEED = SMOOTH_SPEED * 0.8 + POINTER_SPEED * 10;
  CLEANED_USER_SPEED = Math.min(
    SMOOTH_SPEED * (SCALE_FACTOR / 1100) ** 2,
    10
  );

  LAST_X = x;
  LAST_Y = y;
  LAST_TIME = time;
}

// Shared start handler for mouse/touch pointer interactions
function startPointerInteraction(x, y, time) {
  ATTRACTION_VALUE = -2; // flip to "repel" on click/touch
  LAST_X = x;
  LAST_Y = y;
  LAST_TIME = time;
  updateSpeed(x, y, time);
  CLEANED_USER_SPEED = Math.min(CLEANED_USER_SPEED + 0.8, 3);
}


/*---------- Pointer event listeners ----------*/

// Mouse move updates live pointer speed
window.addEventListener('mousemove', (e) =>
  updateSpeed(e.clientX, e.clientY, e.timeStamp)
);

// Mouse down triggers strong repulsion + speed bump
window.addEventListener('mousedown', (e) => {
  startPointerInteraction(e.clientX, e.clientY, e.timeStamp);
});

// Touch start triggers the same repulsion behavior
window.addEventListener('touchstart', (e) => {
  const T = e.touches[0];
  if (!T) return;
  startPointerInteraction(T.clientX, T.clientY, e.timeStamp);
});

// Touch move updates speed from active touch
window.addEventListener('touchmove', (e) => {
  const T = e.touches[0];
  if (!T) return;
  updateSpeed(T.clientX, T.clientY, e.timeStamp);
});


/*========================================*
 *  6 SIMPLE HTML UTILITIES
 *========================================*/

// Toggle an element's visibility via the [hidden] attribute
function toggleElement(id) {
  const EL = document.getElementById(id);
  if (EL) EL.hidden = !EL.hidden;
}

// After touch interactions, drop focus so :active states clear cleanly
document.addEventListener(
  'touchend',
  () => {
    document.activeElement?.blur();
  },
  { passive: true }
);


/*========================================*
 *  7 INITIALIZATION
 *========================================*/

// Initialize canvas size
resizeCanvas();

// Restore or create starfield
initStars();

// Start animation loop
animate();

// Keep canvas scaled to window size
window.addEventListener('resize', resizeCanvas);