// thank heavens for chatGPT <3

/*==============================================================*
 *                        SCRIPT MAP
 *==============================================================*
 *
 *  1. GLOBAL STATE & CONSTANTS
 *     - Page state flags
 *     - Canvas / starfield data
 *     - Pointer speed values
 *
 *  2. TRANSITION & LAYOUT
 *     2.1 Scroll helpers
 *     2.2 Page load / slide-in
 *     2.3 Back/forward cache restore
 *     2.4 Slide-out navigation (transitionTo)
 *
 *  3. STORAGE
 *     - Save starfield to localStorage
 *     - beforeunload sync
 *
 *  4. STARFIELD
 *     4.1 randomBetween()
 *     4.2 initStars() / createStars()
 *     4.3 moveStars()
 *     4.4 drawStarsWithLines()
 *     4.5 resizeCanvas() / animate()
 *
 *  5. POINTER INPUT
 *     - updateSpeed()
 *     - startPointerInteraction()
 *     - mouse / touch listeners
 *
 *  6. SIMPLE HTML HELPERS
 *     - toggleElement()
 *     - mobile touchend blur
 *
 *  7. INITIALIZATION
 *     - resizeCanvas()
 *     - initStars()
 *     - animate()
 *     - window resize listener
 *     - touch scroll/click fix (wireTouchEvent)
 *
 *  NOTE: Each major block is marked with //#region ... //#endregion
 *        so editors can fold and jump between sections.
 *==============================================================*/


//#region 1. GLOBAL STATE & CONSTANTS
/*========================================*
 *  1 GLOBAL STATE & CONSTANTS
 *========================================*/

/*---------- Page state flags ----------*/

let IS_INTERNAL_REFERRER = false;  // true if we came from the same origin
let IS_TRANSITIONING = false;      // blocks double navigation clicks


/*---------- Main layout handles ----------*/

// Main content wrapper (#transitionContainer is the sliding page)
const getPage = () => document.getElementById('transitionContainer');

// Detect if this is the homepage (has the main menu button)
const isHomepage = () => !!document.querySelector('#menuButton');

// Slide animation duration (seconds)
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);


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

// Canvas size and star scaling
let WIDTH = 0;
let HEIGHT = 0;
let SCALE_FACTOR = 0;
let MAX_STAR_COUNT = 0;
let MAX_LINK_DISTANCE = 0;

// Starfield data
let STARS = [];
//#endregion 1. GLOBAL STATE & CONSTANTS



//#region 2. TRANSITION & LAYOUT
/*========================================*
 *  2 TRANSITION & LAYOUT
 *========================================*/

/*---------- 2.1 Layout scroll helpers ----------*/

// Lock vertical scroll to #transitionContainer
function lockScrollToContainer(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  if (!HTML || !BODY) return;

  HTML.style.overflowY = 'hidden';   // window scroll disabled
  BODY.style.height = '100dvmin';    // body pinned to viewport height

  if (PAGE) {
    PAGE.style.overflowY = 'auto';   // page wrapper scrolls
  }
}

// Restore normal window/body scrolling (used during slide-out)
function freeScrollLayout(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  if (!HTML || !BODY) return;

  // Capture scroll before layout changes
  const CURRENT_SCROLL = PAGE && typeof PAGE.scrollTop === 'number'
    ? PAGE.scrollTop
    : window.scrollY || 0;

  // Switch to window/body scrolling
  HTML.style.overflowY = 'auto';
  BODY.style.height = 'auto';
  if (PAGE) PAGE.style.overflowY = 'visible';

  // Re-apply scroll position once layout resets
  requestAnimationFrame(() => {
    try {
      window.scrollTo(0, CURRENT_SCROLL);
    } catch (ERR) {
      console.warn('Could not restore scroll position:', ERR);
    }
  });
}


/*---------- 2.2 Page load / slide-in ----------*/

window.addEventListener('load', () => {
  const PAGE = getPage();

  // Read and clear "suppressHomeBack" flag for this view
  let SUPPRESS_HOME_BACK = false;
  try {
    SUPPRESS_HOME_BACK = sessionStorage.getItem('suppressHomeBack') === '1';
    sessionStorage.removeItem('suppressHomeBack');
  } catch (ERR) {
    console.warn('SessionStorage unavailable; suppressHomeBack ignored:', ERR);
  }

  // Strip hash so anchor links don't block the slide animation
  if (window.location.hash) {
    try {
      history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
    } catch (ERR) {
      console.warn('Could not replace state to strip hash:', ERR);
    }
  }

  // Configure slide-in speed and lock scroll once finished
  if (PAGE) {
    try {
      document.documentElement.style.setProperty(
        '--SLIDE_DURATION',
        `${getSlideDurationSeconds()}s`
      );
    } catch (ERR) {
      console.warn('Could not set --SLIDE_DURATION:', ERR);
    }

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

  // Homepage back-link visibility and stored URL
  const BACK_LINK = document.getElementById('homepageBack');
  if (BACK_LINK) {
    try {
      if (!SUPPRESS_HOME_BACK && IS_INTERNAL_REFERRER && REF) {
        localStorage.setItem('homepageBackUrl', REF);
      } else {
        localStorage.removeItem('homepageBackUrl');
      }

      const BACK_URL = localStorage.getItem('homepageBackUrl');
      BACK_LINK.style.display =
        !SUPPRESS_HOME_BACK && BACK_URL ? 'block' : 'none';
    } catch (ERR) {
      console.warn('homepageBackUrl storage unavailable:', ERR);
      BACK_LINK.style.display = 'none';
    }
  }

  // Fresh external entry: clear saved constellation so it feels new
  if (!IS_INTERNAL_REFERRER) {
    try {
      localStorage.removeItem('constellationStars');
      localStorage.removeItem('constellationMeta');
    } catch (ERR) {
      console.warn('Could not clear saved constellation state:', ERR);
    }
  }
});


/*---------- 2.3 Back/forward cache handler ----------*/

window.addEventListener('pageshow', (EVENT) => {
  const PAGE = getPage();
  if (!PAGE) return;

  let NAV_TYPE;
  try {
    const NAV_ENTRIES = performance.getEntriesByType
      ? performance.getEntriesByType('navigation')
      : [];
    NAV_TYPE = NAV_ENTRIES[0] && NAV_ENTRIES[0].type;
  } catch {
    NAV_TYPE = undefined;
  }

  // If restored from bfcache, reset transition and motion state
  if (EVENT.persisted || NAV_TYPE === 'back_forward') {
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


/*---------- 2.4 Navigation & slide-out ----------*/

// Trigger slide-out animation and then navigate to new URL
function transitionTo(URL, IS_MENU = false) {
  if (IS_TRANSITIONING) return;
  if (!URL) {
    console.warn('transitionTo called without a URL.');
    return;
  }
  IS_TRANSITIONING = true;

  const PAGE = getPage();

  // Menu links hide the back-link on arrival
  try {
    if (IS_MENU) {
      sessionStorage.setItem('suppressHomeBack', '1');
    } else {
      sessionStorage.removeItem('suppressHomeBack');
    }
  } catch (ERR) {
    console.warn('SessionStorage unavailable in transitionTo:', ERR);
  }

  // Special "back" keyword uses stored homepageBackUrl
  if (URL === 'back') {
    try {
      const STORED = localStorage.getItem('homepageBackUrl');
      if (!STORED) {
        IS_TRANSITIONING = false;
        return;
      }
      URL = STORED;
    } catch (ERR) {
      console.warn('Could not read homepageBackUrl:', ERR);
      IS_TRANSITIONING = false;
      return;
    }
  }

  // If page wrapper is missing, just go straight to the URL
  if (!PAGE) {
    window.location.href = URL;
    return;
  }

  // Pause star motion and persist current state
  FREEZE_CONSTELLATION = true;
  saveStarsToStorage();

  // Distance = one viewport + scroll inside the page
  const SCROLL_IN_PAGE =
    typeof PAGE.scrollTop === 'number' ? PAGE.scrollTop : 0;
  const DIST = window.innerHeight + SCROLL_IN_PAGE;

  try {
    document.documentElement.style.setProperty(
      '--SLIDE_DISTANCE',
      `${DIST}px`
    );
  } catch (ERR) {
    console.warn('Could not set --SLIDE_DISTANCE:', ERR);
  }

  // Let body/window handle scroll during the slide-out
  freeScrollLayout(PAGE);

  // Kick off slide-out animation
  PAGE.classList.add('slide-out');

  // Navigate after slide-out completes (time-based fallback)
  const DURATION_MS = getSlideDurationSeconds() * 1000;
  setTimeout(() => {
    window.location.href = URL;
  }, Number.isFinite(DURATION_MS) ? DURATION_MS : 600);
}
//#endregion 2. TRANSITION & LAYOUT



//#region 3. STORAGE
/*========================================*
 *  3 STORAGE
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
//#endregion 3. STORAGE



//#region 4. STARFIELD
/*========================================*
 *  4 STARFIELD
 *========================================*/

/*---------- 4.1 Random helper ----------*/

// Random float in [MIN, MAX)
const randomBetween = (MIN, MAX) =>
  Math.random() * (MAX - MIN) + MIN;


/*---------- 4.2 Star initialization ----------*/

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


/*---------- 4.3 Star animation step ----------*/

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


/*---------- 4.4 Star rendering ----------*/

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


/*---------- 4.5 Canvas resize & animation loop ----------*/

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
//#endregion 4. STARFIELD



//#region 5. POINTER INPUT
/*========================================*
 *  5 POINTER INPUT
 *========================================*/

/*---------- 5.1 Pointer speed calculation ----------*/

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
  ATTRACTION_VALUE = -2; // flip to "repel" on click/touch
  updateSpeed(X, Y, TIME);
  CLEANED_USER_SPEED = Math.min(CLEANED_USER_SPEED + 0.8, 3);
}


/*---------- 5.2 Pointer event listeners ----------*/

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

// Fix "hover but no click during scroll" on mobile
function wireTouchEvent(SELECTOR = 'a') {
  const ELEMENTS = document.querySelectorAll(SELECTOR);
  if (!ELEMENTS.length) return;

  ELEMENTS.forEach((ELEMENT) => {
    let START_X = 0;
    let START_Y = 0;
    let MOVED = false;

    // start: remember where the finger went down
    ELEMENT.addEventListener(
      'touchstart',
      (E) => {
        const TOUCH = E.touches[0];
        if (!TOUCH) return;
        START_X = TOUCH.clientX;
        START_Y = TOUCH.clientY;
        MOVED = false;
      },
      { passive: true }
    );

    // move: if we move more than a few px, treat it as scroll, not tap
    ELEMENT.addEventListener(
      'touchmove',
      (E) => {
        const TOUCH = E.touches[0];
        if (!TOUCH) return;
        const DX = TOUCH.clientX - START_X;
        const DY = TOUCH.clientY - START_Y;
        const DISTANCE = Math.hypot(DX, DY);
        if (DISTANCE > 10) {
          MOVED = true;
        }
      },
      { passive: true }
    );

    // end: if we didn't move much, treat this as a click
    ELEMENT.addEventListener(
      'touchend',
      (E) => {
        if (MOVED) {
          // big move = scroll; let browser handle it
          return;
        }

        // This is a "light tap" → we take over
        E.preventDefault();

        // Use href as the URL fallback
        const URL = ELEMENT.getAttribute('href');
        if (!URL) return;

        // Optional: infer IS_MENU from data attribute instead of hardcoding
        const IS_MENU = ELEMENT.dataset.menu === '1';

        // Call existing navigation logic
        transitionTo(URL, IS_MENU);
      },
      { passive: false } // MUST be false so preventDefault() is allowed
    );
  });
}
//#endregion 5. POINTER INPUT



//#region 6. SIMPLE HTML HELPERS
/*========================================*
 *  6 SIMPLE HTML HELPERS
 *========================================*/

// Toggle an element's visibility via the [hidden] attribute
function toggleElement(ID) {
  if (!ID) return;
  const EL = document.getElementById(ID);
  if (EL) EL.hidden = !EL.hidden;
}

// After touch interactions, drop focus so :active states clear cleanly
document.addEventListener(
  'touchend',
  () => {
    try {
      document.activeElement?.blur();
    } catch {
      // If blur fails, just ignore
    }
  },
  { passive: true }
);
//#endregion 6. SIMPLE HTML HELPERS



//#region 7. INITIALIZATION
/*========================================*
 *  7 INITIALIZATION
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
  console.error('Initialization error in starfield/transition script:', ERR);
}

// Wire up tap-to-navigate behavior once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  wireTouchEvent('a');
});
//#endregion 7. INITIALIZATION