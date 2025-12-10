// thank heavens for chatGPT <3

/*==============================================================*
 *                     LAYOUT & TRANSITIONS
 *==============================================================*
 *
 *  1. GLOBAL PAGE STATE
 *  2. TRANSITION & LAYOUT
 *     - Scroll helpers
 *     - Page load / slide-in
 *     - Back/forward cache restore
 *     - Slide-out navigation (transitionTo)
 *  3. SIMPLE HTML HELPERS
 *     - toggleElement()
 *     - mobile touchend blur
 *     - wireTouchEvent()
 *==============================================================*/


//#region 1. GLOBAL PAGE STATE
/*========================================*
 *  1 GLOBAL PAGE STATE & HELPERS
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
//#endregion 1. GLOBAL PAGE STATE



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
  // (Stars script will just rebuild a new field on this page)
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

    // If the starfield script is present, reset its motion state
    if (typeof FREEZE_CONSTELLATION !== 'undefined') {
      FREEZE_CONSTELLATION = false;
    }
    if (typeof CLEANED_USER_SPEED !== 'undefined') CLEANED_USER_SPEED = 0;
    if (typeof SMOOTH_SPEED !== 'undefined') SMOOTH_SPEED = 0;
    if (typeof POINTER_SPEED !== 'undefined') POINTER_SPEED = 0;

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

  // Pause star motion and persist current state (if the starfield exists)
  if (typeof FREEZE_CONSTELLATION !== 'undefined') {
    FREEZE_CONSTELLATION = true;
  }
  if (typeof saveStarsToStorage === 'function') {
    saveStarsToStorage();
  }

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



//#region 3. SIMPLE HTML HELPERS
/*========================================*
 *  3 SIMPLE HTML HELPERS & TOUCH NAV
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

// Wire up tap-to-navigate behavior once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  wireTouchEvent('a');
});
//#endregion 3. SIMPLE HTML HELPERS