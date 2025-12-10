// thank heavens for chatGPT <3

/*==============================*
 *  GLOBAL PAGE STATE
 *==============================*/

let IS_INTERNAL_REFERRER = false;
let IS_TRANSITIONING = false;

/*==============================*
 *  SMALL HELPERS
 *==============================*/

// Main content wrapper
const getPage = () => document.getElementById('transitionContainer');

// Detect if this is the homepage (has the main menu button)
function isHomepage() {
  return !!document.querySelector('#menuButton');
}

// Use #transitionContainer as the only scroll area
function lockScrollToContainer(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;
  HTML.style.overflowY = 'hidden';
  BODY.style.height = '100dvmin';
  if (PAGE) PAGE.style.overflowY = 'auto';
}

// Let the whole page scroll normally during transition
function freeScrollLayout(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  // 1) Read the current scroll position from the *old* scroll container
  const CURRENT_SCROLL = PAGE && PAGE.scrollTop;

  // 2) Switch to window/body scrolling
  HTML.style.overflowY = 'auto';
  BODY.style.height = 'auto';
  PAGE.style.overflowY = 'visible';

  // 3) After layout updates, apply the same scroll offset to the new scroll container
  requestAnimationFrame(() => {
    window.scrollTo(0, CURRENT_SCROLL);
  });
}

/*==============================*
 *  PAGE LOAD HANDLER
 *==============================*/

window.addEventListener('load', () => {
  const PAGE = getPage();

  // Clear menu-return flag for this page view
  const SUPPRESS_HOME_BACK =
    sessionStorage.getItem('suppressHomeBack') === '1';
  sessionStorage.removeItem('suppressHomeBack');

  // Remove hash so anchors don't interfere with transitions
  if (window.location.hash) {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }

  // Configure slide-in timing and lock scroll after transition
  if (PAGE) {
    // Slower on homepage, faster on other pages
    const SLIDE_SECONDS = isHomepage() ? 1.2 : 0.6;

    document.documentElement.style.setProperty(
      '--slide-duration',
      `${SLIDE_SECONDS}s`
    );

    requestAnimationFrame(() => {
      PAGE.classList.add('ready');

      PAGE.addEventListener(
        'transitionend',
        () => lockScrollToContainer(PAGE),
        { once: true }
      );
    });
  }

  // Detect if we came from another page on this site
  const REF = document.referrer;
  if (REF) {
    try {
      const REF_URL = new URL(REF);
      IS_INTERNAL_REFERRER = REF_URL.origin === window.location.origin;
    } catch {
      IS_INTERNAL_REFERRER = false;
    }
  }

  // Show or hide the homepage back link
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

    const BACK_URL = localStorage.getItem('homepageBackUrl');
    BACK_LINK.style.display =
      !SUPPRESS_HOME_BACK && BACK_URL ? 'block' : 'none';
  }

  // Clear saved constellations on fresh external entry
  if (!IS_INTERNAL_REFERRER) {
    localStorage.removeItem('constellationStars');
    localStorage.removeItem('constellationMeta');
  }
});

/*==============================*
 *  BACK/FORWARD CACHE HANDLER
 *==============================*/

window.addEventListener('pageshow', (event) => {
  const PAGE = getPage();
  if (!PAGE) return;

  const NAV_ENTRIES = performance.getEntriesByType
    ? performance.getEntriesByType('navigation')
    : [];
  const NAV_TYPE = NAV_ENTRIES[0] && NAV_ENTRIES[0].type;

  // Fix state when page is restored from bfcache
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

/*==============================*
 *  SIMPLE HTML HELPERS
 *==============================*/

// Toggle an element using the hidden attribute
function toggleElement(id) {
  const EL = document.getElementById(id);
  if (EL) EL.hidden = !EL.hidden;
}

// Drop focus after touch so active states clear
document.addEventListener(
  'touchend',
  () => {
    document.activeElement?.blur();
  },
  { passive: true }
);

/*==============================*
 *  CONSTELLATION CANVAS SETUP
 *==============================*/

const CANVAS = document.getElementById('constellations');
const BRUSH = CANVAS.getContext('2d');

let FREEZE_CONSTELLATION = false;

// Mouse/touch movement tracking
let LAST_X = 0,
  LAST_Y = 0,
  LAST_TIME = 0,
  POINTER_SPEED = 0,
  SMOOTH_SPEED = 0,
  CLEANED_USER_SPEED = 0,
  ATTRACTION_VALUE = 1;

// Canvas size and star scaling
let WIDTH = 0,
  HEIGHT = 0,
  SCALE_FACTOR = 0,
  MAX_STAR_COUNT = 0,
  MAX_LINK_DISTANCE = 0;

// Star objects
let STARS = [];

/*==============================*
 *  STAR HELPERS
 *==============================*/

// Random float in [min, max)
const randomBetween = (min, max) =>
  Math.random() * (max - min) + min;

/*==============================*
 *  STAR INITIALIZATION
 *==============================*/

// Load saved stars or create new ones
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

          ATTRACTION_VALUE = META.attractionValue ?? 1;
          CLEANED_USER_SPEED = META.cleanedUserSpeed ?? 0;
          SMOOTH_SPEED = META.smoothSpeed ?? 0;
          POINTER_SPEED = META.pointerSpeed ?? 0;
        } catch (ERR) {
          console.warn('Could not parse constellationMeta, skipping scale.', ERR);
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

// Build a new starfield for the current canvas
function createStars() {
  STARS = [];

  for (let I = 0; I < MAX_STAR_COUNT; I++) {
    STARS.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      vx: randomBetween(-0.25, 0.25),
      vy: randomBetween(-0.25, 0.25),
      size: randomBetween(3, SCALE_FACTOR / 400),
      opacity: randomBetween(0.005, 1.8),
      fadeSpeed: randomBetween(1, 2.1),
      redValue: randomBetween(0, 200),
      whiteValue: 0
    });
  }
}

/*==============================*
 *  STAR ANIMATION
 *==============================*/

// Move, fade, and wrap stars around the screen
function moveStars() {
  for (const STAR of STARS) {
    STAR.x += STAR.vx * (CLEANED_USER_SPEED + 1);
    STAR.y += STAR.vy * (CLEANED_USER_SPEED + 1);

    // Pointer pull / push
    if (LAST_TIME !== 0 && CLEANED_USER_SPEED > 0.19) {
      const DX = LAST_X - STAR.x;
      const DY = LAST_Y - STAR.y;
      const SCREEN_SIZE_MODIFIER = SCALE_FACTOR / 500;
      const DIST_SQ = DX * DX + DY * DY;
      const MAX_INFLUENCE = 12000 * SCREEN_SIZE_MODIFIER;

      if (DIST_SQ > 4 && DIST_SQ < MAX_INFLUENCE) {
        const PROXIMITY = (MAX_INFLUENCE - DIST_SQ) / MAX_INFLUENCE;
        const PULL =
          0.005 *
          CLEANED_USER_SPEED *
          PROXIMITY *
          (ATTRACTION_VALUE < 0 ? ATTRACTION_VALUE * 2.5 : ATTRACTION_VALUE);

        STAR.x += DX * PULL;
        STAR.y += DY * PULL;
      }
    }

    // Fade white flashes
    if (STAR.whiteValue > 0) {
      STAR.whiteValue -= Math.max(0, STAR.whiteValue * 0.02);
    }

    // Opacity and twinkle
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }

    // Wrap at canvas edges
    if (STAR.x < 0) STAR.x = WIDTH;
    if (STAR.x > WIDTH) STAR.x = 0;
    if (STAR.y < 0) STAR.y = HEIGHT;
    if (STAR.y > HEIGHT) STAR.y = 0;
  }

  // Slowly decay pointer speed
  CLEANED_USER_SPEED *= 0.95;
  if (CLEANED_USER_SPEED < 0.05) CLEANED_USER_SPEED = 0;

  // Ease attraction back to normal
  ATTRACTION_VALUE += (1 - ATTRACTION_VALUE) * 0.06;
  if (ATTRACTION_VALUE > 1) ATTRACTION_VALUE = 1;
}

// Draw star links and star circles
function drawStarsWithLines() {
  BRUSH.clearRect(0, 0, WIDTH, HEIGHT);

  // Lines between nearby stars
  BRUSH.lineWidth = 1;
  for (let I = 0; I < STARS.length; I++) {
    for (let J = I + 1; J < STARS.length; J++) {
      const A = STARS[I];
      const B = STARS[J];
      const DX = A.x - B.x;
      const DY = A.y - B.y;
      const DIST = Math.hypot(DX, DY);

      if (DIST < MAX_LINK_DISTANCE) {
        const OPACITY_MODIFIER = (A.opacity + B.opacity) / 2;
        const ALPHA =
          (1 - DIST / MAX_LINK_DISTANCE) * OPACITY_MODIFIER;

        BRUSH.strokeStyle = `rgba(0, 0, 0, ${ALPHA})`;
        BRUSH.beginPath();
        BRUSH.moveTo(A.x, A.y);
        BRUSH.lineTo(B.x, B.y);
        BRUSH.stroke();
      }
    }
  }

  // Star bodies
  for (const STAR of STARS) {
    let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
    if (TEMP_RED > 255) TEMP_RED = 255;

    const TEMP_GREEN = 255 * STAR.whiteValue;
    const TEMP_BLUE = 255 * STAR.whiteValue;
    const TEMP_SIZE = STAR.whiteValue * 2 + STAR.size;

    BRUSH.beginPath();
    BRUSH.fillStyle = `rgba(${TEMP_RED}, ${TEMP_GREEN}, ${TEMP_BLUE}, ${STAR.opacity})`;
    BRUSH.arc(STAR.x, STAR.y, TEMP_SIZE, 0, Math.PI * 2);
    BRUSH.fill();
  }
}

/*==============================*
 *  RESIZE + ANIMATION LOOP
 *==============================*/

// Match canvas to viewport and rescale stars
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

// Main drawing loop
function animate() {
  if (!FREEZE_CONSTELLATION) moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}

/*==============================*
 *  POINTER SPEED
 *==============================*/

// Update pointer speed from mouse or touch
function updateSpeed(x, y, time) {
  const DX = x - LAST_X;
  const DY = y - LAST_Y;
  const DT = time - LAST_TIME;

  if (DT > 0) {
    POINTER_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;
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

window.addEventListener('mousemove', (e) =>
  updateSpeed(e.clientX, e.clientY, e.timeStamp)
);

window.addEventListener('mousedown', (e) => {
  ATTRACTION_VALUE = -2;
  LAST_X = e.clientX;
  LAST_Y = e.clientY;
  LAST_TIME = e.timeStamp;
  updateSpeed(e.clientX, e.clientY, e.timeStamp);
  CLEANED_USER_SPEED = Math.min(CLEANED_USER_SPEED + 0.8, 3);
});

window.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (!t) return;

  ATTRACTION_VALUE = -2;
  LAST_X = t.clientX;
  LAST_Y = t.clientY;
  LAST_TIME = e.timeStamp;
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
  CLEANED_USER_SPEED = Math.min(CLEANED_USER_SPEED + 0.8, 3);
});

window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});

/*==============================*
 *  PAGE TRANSITIONS & STORAGE
 *==============================*/

// Trigger slide-out and navigate to a new URL
function transitionTo(url, isMenu = false) {
  if (IS_TRANSITIONING) return;
  IS_TRANSITIONING = true;

  const PAGE = getPage();

  if (isMenu) {
    sessionStorage.setItem('suppressHomeBack', '1');
  } else {
    sessionStorage.removeItem('suppressHomeBack');
  }

  if (url === 'back') {
    const STORED = localStorage.getItem('homepageBackUrl');
    if (!STORED) {
      IS_TRANSITIONING = false;
      return;
    }
    url = STORED;
  }

  if (!PAGE) {
    window.location.href = url;
    return;
  }

  FREEZE_CONSTELLATION = true;
  saveStarsToStorage();

  freeScrollLayout(PAGE);
  PAGE.classList.add('slide-out');

  const SLIDE_SECONDS = isHomepage() ? 1.2 : 0.6;

  setTimeout(() => {
    window.location.href = url;
  }, SLIDE_SECONDS * 1000);
}

// Save current starfield to localStorage
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

window.addEventListener('beforeunload', saveStarsToStorage);

/*==============================*
 *  INITIALIZATION
 *==============================*/

resizeCanvas();
initStars();
animate();
window.addEventListener('resize', resizeCanvas);