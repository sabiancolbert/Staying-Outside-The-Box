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

//alert("Debug gum"); // Optional debug tripwire: confirms this file loaded

/*========================================*
//#region 1) GLOBAL STATE + HELPERS
 *========================================*/

/* TRANSITION FLAG */
// Track whether a slide transition is currently running (prevents double-trigger)
let IS_TRANSITION_ACTIVE = false;

/* STARFIELD ALIAS */
// Create a short alias for STARFIELD (used for freeze/save helpers)
var S = window.STARFIELD;

/* AUDIO (disabled) */
//const CRUNCH_SOUND = new Audio("/Resources/Crunch.mp3");
//CRUNCH_SOUND.preload = "auto";
//CRUNCH_SOUND.load();
//CRUNCH_SOUND.volume = 0.25;

/* PENDING TIMERS (bfcache can revive these if we don't cancel them) */
// Store the timeout id that saves right before leaving
let SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;

// Store the timeout id that navigates after slide-out completes
let NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;

// Cancel any pending transition timers and reset their handles
function clearPendingTransitionTimers() {
  // Cancel the "save before leave" timeout if it exists
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID);

  // Cancel the "navigate after slide" timeout if it exists
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID);

  // Clear the handle so we know nothing is scheduled
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;

  // Clear the handle so we know nothing is scheduled
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;
}

// Freeze starfield motion and persist the latest state to storage
function freezeAndSaveStarfield() {
  // Step 1: if no starfield exists, do nothing
  if (!STARFIELD) return;

  // Step 2: freeze physics
  S.isFrozen = true;

  // Step 3: persist current star state (if exposed)
  if (typeof S.saveStarfieldToStorage === "function") {
    S.saveStarfieldToStorage();
  }
}

/* LEAVE/RETURN LIFECYCLE */
// Fires on real navigations + bfcache; best cross-browser “we’re leaving”
window.addEventListener("pagehide", () => {
  // Cancel any old timers so they cannot fire after a bfcache restore
  clearPendingTransitionTimers();

  // Freeze motion and save state right before leaving the page
  freezeAndSaveStarfield();
});

// Backup save/freeze for mobile backgrounding and tab switching
document.addEventListener("visibilitychange", () => {
  // Skip if STARFIELD is not present on this page
  if (!STARFIELD) return;

  // When hidden, freeze + save so state doesn't drift offscreen
  if (document.visibilityState === "hidden") {
    freezeAndSaveStarfield();
  }
  // When visible again, allow the simulation to resume
  else if (document.visibilityState === "visible") {
    S.isFrozen = false;
  }
});

/* DOM HELPERS */
// Return the transition wrapper element used by slide-in/out classes
const getTransitionContainer = () => document.getElementById("transitionContainer");

// Return true if this page looks like the homepage (menu button exists)
const isHomepage = () => !!document.querySelector("#menuButton");

// Match CSS: homepage animation runs longer than inner pages
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);

/* NAVIGATION TYPE */
// Detect back/forward navigation (often restored from bfcache)
function isBackForwardNavigation(EVENT) {
  // Some browsers mark bfcache restores on pageshow
  if (EVENT?.persisted) return true;

  // Use Navigation Timing API when available
  try {
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  } catch {
    // Fallback: treat unknown as not back/forward
    return false;
  }
}

/* REFERRER ANALYSIS */
// Determine whether the referrer is internal and whether it was the Menu page
function getReferrerInfo() {
  // Read the browser-provided referrer string (may be empty)
  const REFERRER = document.referrer;

  // Track whether referrer is same-origin
  let IS_INTERNAL_REFERRER = false;

  // Track whether the referrer path matches the Menu page
  let CAME_FROM_MENU_PAGE = false;

  // Exit early when there is no referrer
  if (!REFERRER) return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE };

  try {
    // Parse the referrer into a URL so we can reliably read origin/path
    const REFERRER_URL = new URL(REFERRER);

    // Mark internal when the referrer origin matches this site's origin
    IS_INTERNAL_REFERRER = REFERRER_URL.origin === location.origin;

    // Normalize the path for comparisons
    const REFERRER_PATH = REFERRER_URL.pathname.toLowerCase();

    // Recognize common Menu URL forms
    CAME_FROM_MENU_PAGE =
      REFERRER_PATH === "/menu" ||
      REFERRER_PATH === "/menu/" ||
      REFERRER_PATH.endsWith("/menu/index.html");
  } catch {
    // If parsing fails, treat referrer as external/unknown
  }

  // Return the computed referrer flags plus the raw string
  return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE };
}

/* #endregion 1) GLOBAL STATE + HELPERS */



/*========================================*
//#region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *========================================*/

// Switch scrolling responsibility back to the document (not the transition container)
function enableDocumentScroll(CONTAINER = getTransitionContainer()) {
  // Cache <html> so we can change overflow behavior
  const HTML = document.documentElement;

  // Cache <body> so we can change overflow/height behavior
  const BODY = document.body;

  // Step 1: preserve current scroll position from container or window
  const SAVED_SCROLL_Y = CONTAINER?.scrollTop ?? window.scrollY ?? 0;

  // Step 2: make the document the scroller (restore natural page flow)
  HTML.style.overflowY = "auto";
  BODY.style.overflow = "visible";
  BODY.style.height = "auto";

  // Step 3: make the container non-scrollable (so it doesn't trap scroll)
  if (CONTAINER) {
    CONTAINER.style.overflow = "visible";
    CONTAINER.style.height = "auto";
  }

  // Step 4: keep starfield canvas synced after layout changes (if available)
  if (STARFIELD && typeof S.resizeStarfieldCanvas === "function") {
    S.resizeStarfieldCanvas();
  }

  // Step 5: restore scroll on the next frame after styles apply
  requestAnimationFrame(() => {
    try { window.scrollTo(0, SAVED_SCROLL_Y); } catch {}
  });
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



/*========================================*
//#region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *========================================*/

// Run slide-in setup and back-button logic after all resources finish loading
window.addEventListener("load", () => {
  // Grab the slide container used for transitions
  const CONTAINER = getTransitionContainer();

  // Bail if this page doesn't have a transition container
  if (!CONTAINER) return;

  // Step 1: set slide duration CSS var for this page type (home vs inner)
  document.documentElement.style.setProperty("--SLIDE_DURATION", `${getSlideDurationSeconds()}s`);

  // Step 2: trigger slide-in on the next frame so the class change animates
  requestAnimationFrame(() => {
    CONTAINER.classList.add("ready");
  });

  // Step 3: back button logic (based on referrer)
  const { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE } = getReferrerInfo();

  // Find the back link element if it exists on this page
  const BACK_LINK = document.getElementById("homepageBack");

  // Bail if there is no back link on this page
  if (!BACK_LINK) return;

  // Step 4: if we came from Menu, hide the back button (menu already navigates)
  if (CAME_FROM_MENU_PAGE) {
    BACK_LINK.style.display = "none";
    return;
  }

  // Step 5: if we came from an internal page, show back and store the referrer
  if (IS_INTERNAL_REFERRER && REFERRER) {
    BACK_LINK.style.display = "block";
    localStorage.setItem("homepageBackUrl", REFERRER);
    return;
  }

  // Step 6: external/unknown referrer, hide back and clear stored back url
  BACK_LINK.style.display = "none";
  localStorage.removeItem("homepageBackUrl");
});

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



/*========================================*
//#region 4) BACK/FORWARD CACHE (PAGESHOW)
 *========================================*/

// Repair transition state when returning via back/forward (often from bfcache)
window.addEventListener("pageshow", (EVENT) => {
  // Grab the slide container used for transitions
  const CONTAINER = getTransitionContainer();

  // Bail if this page doesn't have a transition container
  if (!CONTAINER) return;

  // Step 1: bfcache restore can revive old timers, so cancel them immediately
  clearPendingTransitionTimers();

  // Step 2: unfreeze starfield when returning (if present)
  if (STARFIELD) S.isFrozen = false;

  // Step 3: only handle true back/forward restores
  if (!isBackForwardNavigation(EVENT)) return;

  // Step 4: ensure we're in a stable "ready" state (not mid-slide)
  CONTAINER.classList.remove("slide-out");
  CONTAINER.classList.add("ready");

  // Step 5: reset transition state and scroll position to a safe baseline
  IS_TRANSITION_ACTIVE = false;
  CONTAINER.scrollTop = 0;
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*========================================*
//#region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *========================================*/

// Animate slide-out, then navigate once the animation duration has elapsed
function transitionTo(URL) {
  // Step 1: guard against double-triggers
  if (IS_TRANSITION_ACTIVE) return;

  // Step 1: guard against empty/invalid URLs
  if (!URL) return;

  //CRUNCH_SOUND.pause(), CRUNCH_SOUND.play().catch(() => {});

  // Clear any leftover timers from previous transitions
  clearPendingTransitionTimers();

  // Mark that a transition is in progress
  IS_TRANSITION_ACTIVE = true;

  // Grab the slide container used for transitions
  const CONTAINER = getTransitionContainer();

  // Step 2: support the special keyword "back" using stored referrer URL
  if (URL === "back") {
    const STORED_BACK_URL = localStorage.getItem("homepageBackUrl");

    // If we don't have a stored url, abort and re-enable transitions
    if (!STORED_BACK_URL) {
      IS_TRANSITION_ACTIVE = false;
      return;
    }

    // Replace the keyword with the real destination url
    URL = STORED_BACK_URL;
  }

  // Step 3: if container is missing, navigate immediately without animation
  if (!CONTAINER) {
    location.href = URL;
    return;
  }

  // Step 4: compute slide distance (viewport height + current scroll offset)
  const SLIDE_DISTANCE_PX = (window.innerHeight * 1.1) + (window.scrollY ?? 0);

  // Publish slide distance to CSS so the animation uses the right amount
  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${SLIDE_DISTANCE_PX}px`);

  // Step 5: start slide-out animation by adding the class
  CONTAINER.classList.add("slide-out");

  // Step 6: compute animation duration in milliseconds for timer scheduling
  const DURATION_MS = getSlideDurationSeconds() * 1000;

  // Step 7: freeze+save shortly before leaving (captures near-final star positions)
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout(
    freezeAndSaveStarfield,
    Math.max(0, DURATION_MS - 50)
  );

  // Step 8: navigate after the slide-out animation completes
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => {
    location.href = URL;
  }, DURATION_MS);
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



/*========================================*
//#region 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE)
 *========================================*/

// Toggle the hidden state of an element by id (tiny utility helper)
function toggleElement(ELEMENT_ID) {
  // Bail if no id was provided
  if (!ELEMENT_ID) return;

  // Find the element in the DOM
  const ELEMENT = document.getElementById(ELEMENT_ID);

  // Flip hidden on/off when element exists
  if (ELEMENT) ELEMENT.hidden = !ELEMENT.hidden;
}

// Convert touch taps on links into animated transitions, while preserving swipe scrolling
function wirePointerNavigation(SELECTOR = "a") {
  // Collect all navigable elements that match the selector
  const NAV_ITEMS = document.querySelectorAll(SELECTOR);

  // Bail if there are no matching elements on this page
  if (!NAV_ITEMS.length) return;

  NAV_ITEMS.forEach((ELEMENT) => {
    // Track gesture starting X coordinate
    let START_X = 0;

    // Track gesture starting Y coordinate
    let START_Y = 0;

    // Track whether the gesture exceeded the tap threshold
    let DID_MOVE = false;

    // Track the active pointer id so we only respond to the same finger
    let ACTIVE_POINTER_ID = null;

    // Begin tracking a touch pointer gesture
    ELEMENT.addEventListener(
      "pointerdown",
      (EVENT) => {
        // Ignore non-touch pointers so mouse clicks behave normally
        if (EVENT.pointerType !== "touch") return;

        // Store pointer id for matching move/up events
        ACTIVE_POINTER_ID = EVENT.pointerId;

        // Reset swipe detection for this gesture
        DID_MOVE = false;

        // Store the starting touch position
        START_X = EVENT.clientX;
        START_Y = EVENT.clientY;

        // Capture pointer so we keep getting events even if finger drifts
        try { ELEMENT.setPointerCapture(ACTIVE_POINTER_ID); } catch {}
      },
      { passive: true }
    );

    // Update swipe detection while the pointer moves
    ELEMENT.addEventListener(
      "pointermove",
      (EVENT) => {
        // Ignore move events from other pointers
        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

        // Mark as a swipe/drag if the finger moved beyond the tap threshold
        if (Math.hypot(EVENT.clientX - START_X, EVENT.clientY - START_Y) > 10) {
          DID_MOVE = true;
        }
      },
      { passive: true }
    );

    // Decide whether this gesture is a tap (navigate) or swipe (do nothing)
    ELEMENT.addEventListener(
      "pointerup",
      (EVENT) => {
        // Ignore up events from other pointers
        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

        // Release capture now that the gesture ended
        try { ELEMENT.releasePointerCapture(ACTIVE_POINTER_ID); } catch {}

        // Clear pointer id so we don't get stuck in an active state
        ACTIVE_POINTER_ID = null;

        // Swipe/drag: do nothing, and clear sticky focus styles
        if (DID_MOVE) {
          try { ELEMENT.blur(); } catch {}
          return;
        }

        // Tap: prevent default so we can run animated navigation instead
        EVENT.preventDefault();

        // Special case: back button uses stored referrer
        if (ELEMENT.id === "homepageBack") {
          transitionTo("back");
          return;
        }

        // Read href target (supports relative links)
        const HREF = ELEMENT.getAttribute("href");

        // Bail if there is no href to navigate to
        if (!HREF) return;

        // Trigger the slide-out transition and navigate at the end
        transitionTo(HREF);
      },
      { passive: false }
    );

    // Clean up if the pointer gesture is cancelled by the browser
    ELEMENT.addEventListener(
      "pointercancel",
      () => {
        // Clear pointer id so the next gesture starts fresh
        ACTIVE_POINTER_ID = null;

        // Clear focus to avoid sticky :focus outlines on iOS
        try { ELEMENT.blur(); } catch {}
      },
      { passive: true }
    );
  });
}

// Wire touch navigation overrides once the DOM is ready
document.addEventListener("DOMContentLoaded", () => wirePointerNavigation());

/* #endregion 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE) */