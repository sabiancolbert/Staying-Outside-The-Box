// thank heavens for chatGPT <3

/*==============================================================*
 *                  LAYOUT & TRANSITIONS SCRIPT
 *==============================================================*
 *  What this file does:
 *   1) Global state + helpers
 *   2) Scroll ownership helper (document is the scroller)
 *   3) Page load: set slide duration + slide-in + back button logic
 *   4) bfcache restore handling (pageshow)
 *   5) Transition navigation (slide-out then location change)
 *   6) Touch navigation fixes (pointer-based tap vs swipe)
 *==============================================================*/



/*========================================*
//#region 1) GLOBAL STATE + HELPERS
 *========================================*/

let IS_TRANSITION_ACTIVE = false;
const STARFIELD = window.STARFIELD;

const CRUNCH_SOUND = new Audio("/Resources/Crunch.mp3");
CRUNCH_SOUND.preload = "auto";
CRUNCH_SOUND.load();
CRUNCH_SOUND.volume = 0.25;

// Pending transition timers (bfcache can resurrect these unless we cancel them)
let SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;
let NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;

function clearPendingTransitionTimers() {
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID);
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID);

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;
}

function freezeAndSaveStarfield() {
  // Step 1: if no starfield exists, do nothing
  if (!STARFIELD) return;

  // Step 2: freeze physics
  STARFIELD.isFrozen = true;

  // Step 3: persist current star state (if exposed)
  if (typeof STARFIELD.saveStarfieldToStorage === "function") {
    STARFIELD.saveStarfieldToStorage();
  }
}

// Fires on real navigations + bfcache; best cross-browser “we’re leaving”
window.addEventListener("pagehide", () => {
  // Kill any scheduled “navigate after slide” that might still be pending
  clearPendingTransitionTimers();
  freezeAndSaveStarfield();
});

// Backup for mobile/tab switching
document.addEventListener("visibilitychange", () => {
  if (!STARFIELD) return;

  if (document.visibilityState === "hidden") {
    freezeAndSaveStarfield();
  } else if (document.visibilityState === "visible") {
    STARFIELD.isFrozen = false;
  }
});

const getTransitionContainer = () => document.getElementById("transitionContainer");
const isHomepage = () => !!document.querySelector("#menuButton");

/** Matches CSS: homepage anim is longer than inner pages */
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);

/** True if navigation was back/forward (sometimes via bfcache) */
function isBackForwardNavigation(EVENT) {
  if (EVENT?.persisted) return true;
  try {
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  } catch {
    return false;
  }
}

/** Determines whether the referrer is internal and whether it was the Menu page */
function getReferrerInfo() {
  const REFERRER = document.referrer;

  let IS_INTERNAL_REFERRER = false;
  let CAME_FROM_MENU_PAGE = false;

  if (!REFERRER) return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE };

  try {
    const REFERRER_URL = new URL(REFERRER);
    IS_INTERNAL_REFERRER = REFERRER_URL.origin === location.origin;

    const REFERRER_PATH = REFERRER_URL.pathname.toLowerCase();
    CAME_FROM_MENU_PAGE =
      REFERRER_PATH === "/menu" ||
      REFERRER_PATH === "/menu/" ||
      REFERRER_PATH.endsWith("/menu/index.html");
  } catch {
    // If parsing fails, treat as external/unknown
  }

  return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE };
}

/* #endregion 1) GLOBAL STATE + HELPERS */



/*========================================*
//#region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *========================================*/

function enableDocumentScroll(CONTAINER = getTransitionContainer()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  // Step 1: preserve current scroll position
  const SAVED_SCROLL_Y = CONTAINER?.scrollTop ?? window.scrollY ?? 0;

  // Step 2: document becomes the scroller
  HTML.style.overflowY = "auto";
  BODY.style.overflow = "visible";
  BODY.style.height = "auto";

  // Step 3: container is NOT scrollable
  if (CONTAINER) {
    CONTAINER.style.overflow = "visible";
    CONTAINER.style.height = "auto";
  }

  // Step 4: keep starfield canvas synced if available
  if (STARFIELD && typeof STARFIELD.resizeStarfieldCanvas === "function") {
    STARFIELD.resizeStarfieldCanvas();
  }

  // Step 5: restore scroll next frame
  requestAnimationFrame(() => {
    try { window.scrollTo(0, SAVED_SCROLL_Y); } catch {}
  });
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



/*========================================*
//#region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *========================================*/

window.addEventListener("load", () => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  // Step 1: set slide duration CSS var for this page
  document.documentElement.style.setProperty("--SLIDE_DURATION", `${getSlideDurationSeconds()}s`);

  // Step 2: trigger slide-in
  requestAnimationFrame(() => {
    CONTAINER.classList.add("ready");
  });

  // Step 3: back button logic
  const { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE } = getReferrerInfo();
  const BACK_LINK = document.getElementById("homepageBack");
  if (!BACK_LINK) return;

  // Step 4: if came from Menu, hide back button
  if (CAME_FROM_MENU_PAGE) {
    BACK_LINK.style.display = "none";
    return;
  }

  // Step 5: if came from internal page, show and store referrer
  if (IS_INTERNAL_REFERRER && REFERRER) {
    BACK_LINK.style.display = "block";
    localStorage.setItem("homepageBackUrl", REFERRER);
    return;
  }

  // Step 6: external/unknown referrer
  BACK_LINK.style.display = "none";
  localStorage.removeItem("homepageBackUrl");
});

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



/*========================================*
//#region 4) BACK/FORWARD CACHE (PAGESHOW)
 *========================================*/

window.addEventListener("pageshow", (EVENT) => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;
  
  // Step 1: bfcache restore can re-run old timers once. Cancel them immediately.
  clearPendingTransitionTimers();

  // Step 2: unfreeze starfield when returning
  if (STARFIELD) STARFIELD.isFrozen = false;

  // Step 3: only handle true back/forward restores
  if (!isBackForwardNavigation(EVENT)) return;

  // Step 4: ensure we're in a “ready” state
  CONTAINER.classList.remove("slide-out");
  CONTAINER.classList.add("ready");

  // Step 5: reset transition state
  IS_TRANSITION_ACTIVE = false;
  CONTAINER.scrollTop = 0;
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*========================================*
//#region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *========================================*/

function transitionTo(URL) {
  // Step 1: guard against double-triggers
  if (IS_TRANSITION_ACTIVE) return;
  if (!URL) return;
CRUNCH_SOUND.pause(), CRUNCH_SOUND.play().catch(() => {});
  
  clearPendingTransitionTimers();

  IS_TRANSITION_ACTIVE = true;

  const CONTAINER = getTransitionContainer();

  // Step 2: special keyword: "back"
  if (URL === "back") {
    const STORED_BACK_URL = localStorage.getItem("homepageBackUrl");
    if (!STORED_BACK_URL) {
      IS_TRANSITION_ACTIVE = false;
      return;
    }
    URL = STORED_BACK_URL;
  }

  // Step 3: if no container, navigate immediately
  if (!CONTAINER) {
    location.href = URL;
    return;
  }

  // Step 4: compute slide distance (viewport + current scroll)
  const SLIDE_DISTANCE_PX = (window.innerHeight * 1.1) + (window.scrollY ?? 0);
  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${SLIDE_DISTANCE_PX}px`);

  // Step 5: start slide-out
  CONTAINER.classList.add("slide-out");

  // Step 6: compute animation time
  const DURATION_MS = getSlideDurationSeconds() * 1000;

  // Step 7: freeze+save right before leaving (keeps motion during slide, but captures final)
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout(
    freezeAndSaveStarfield,
    Math.max(0, DURATION_MS - 50)
  );

  // Step 8: navigate after animation ends
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => {
    location.href = URL;
  }, DURATION_MS);
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



/*========================================*
//#region 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE)
 *========================================*/

function toggleElement(ELEMENT_ID) {
  if (!ELEMENT_ID) return;
  const ELEMENT = document.getElementById(ELEMENT_ID);
  if (ELEMENT) ELEMENT.hidden = !ELEMENT.hidden;
}

function wirePointerNavigation(SELECTOR = "a") {
  const NAV_ITEMS = document.querySelectorAll(SELECTOR);
  if (!NAV_ITEMS.length) return;

  NAV_ITEMS.forEach((ELEMENT) => {
    let START_X = 0;
    let START_Y = 0;
    let DID_MOVE = false;
    let ACTIVE_POINTER_ID = null;

    ELEMENT.addEventListener(
      "pointerdown",
      (EVENT) => {
        if (EVENT.pointerType !== "touch") return;

        ACTIVE_POINTER_ID = EVENT.pointerId;
        DID_MOVE = false;
        START_X = EVENT.clientX;
        START_Y = EVENT.clientY;

        try { ELEMENT.setPointerCapture(ACTIVE_POINTER_ID); } catch {}
      },
      { passive: true }
    );

    ELEMENT.addEventListener(
      "pointermove",
      (EVENT) => {
        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

        // Tap threshold
        if (Math.hypot(EVENT.clientX - START_X, EVENT.clientY - START_Y) > 10) {
          DID_MOVE = true;
        }
      },
      { passive: true }
    );

    ELEMENT.addEventListener(
      "pointerup",
      (EVENT) => {
        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

        try { ELEMENT.releasePointerCapture(ACTIVE_POINTER_ID); } catch {}
        ACTIVE_POINTER_ID = null;

        // Swipe/drag: do nothing, clear sticky styles
        if (DID_MOVE) {
          try { ELEMENT.blur(); } catch {}
          return;
        }

        // Tap: take over navigation
        EVENT.preventDefault();

        if (ELEMENT.id === "homepageBack") {
          transitionTo("back");
          return;
        }

        const HREF = ELEMENT.getAttribute("href");
        if (!HREF) return;

        transitionTo(HREF);
      },
      { passive: false }
    );

    ELEMENT.addEventListener(
      "pointercancel",
      () => {
        ACTIVE_POINTER_ID = null;
        try { ELEMENT.blur(); } catch {}
      },
      { passive: true }
    );
  });
}

document.addEventListener("DOMContentLoaded", () => wirePointerNavigation());

/* #endregion 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE) */
