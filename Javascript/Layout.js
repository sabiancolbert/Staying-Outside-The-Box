// thank heavens for chatGPT <3
// Layout + page transitions controller for StayingOutsideTheBox.
// This file owns navigation animations, bfcache hygiene, and touch-safe tap handling.
// Starfield is treated as a “passenger” that we freeze/save during transitions.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) GLOBAL STATE + HELPERS
 *     - Transition guard flags
 *     - Timer hygiene for bfcache
 *     - Starfield freeze/save hooks
 *     - DOM helpers
 *     - Navigation type detection
 *     - Referrer analysis for back button behavior (menu vs homepage vs internal)
 *
 *  2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *     - Helpers to lock/unlock document scroll (optional)
 *
 *  3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *     - Apply slide duration
 *     - Trigger slide-in
 *     - Decide back button visibility + stored back URL
 *
 *  4) BACK/FORWARD CACHE (PAGESHOW)
 *     - Repair state after bfcache restores
 *
 *  5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *     - Animate out
 *     - Freeze+save near the end
 *     - Navigate on transitionend (with timeout fallback)
 *
 *  6) NAV FIXES (CLICK + TOUCH TAP VS SWIPE)
 *     - Click-to-navigate with animation (desktop + keyboard + accessibility)
 *     - Touch tap-to-navigate with animation
 *     - Swipe-to-scroll remains native
 *====================================================================*/


/*======================================================================
 * #region 1) GLOBAL STATE + HELPERS
 *====================================================================*/

/* GROUP: Transition guard flag */
// Track whether a transition is currently running.
// This prevents double clicks/taps from stacking multiple navigations.
let IS_TRANSITION_ACTIVE = false; // True while slide-out is in progress

/* GROUP: Starfield alias */
// Create a short alias to the STARFIELD namespace.
// Used only for freeze/save/resizing helpers.
var S = window.STARFIELD; // Local pointer to global STARFIELD (may be null on some pages)

/* GROUP: Audio (disabled) */
// Optional “crunch” sound. Left disabled for now.
//const CRUNCH_SOUND = new Audio("/Resources/Crunch.mp3");
//CRUNCH_SOUND.preload = "auto";
//CRUNCH_SOUND.load();
//CRUNCH_SOUND.volume = 0.25;

/* GROUP: Pending transition timers */
// bfcache can resurrect timers if they were scheduled before leaving.
// We store handles so we can cancel them safely on pagehide/pageshow.
let SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;     // setTimeout handle: freeze/save shortly before navigation
let NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;  // setTimeout handle: fallback navigation if transitionend fails

/* GROUP: Timer hygiene */
// Cancel any pending transition timers and reset handles.
// Prevents “ghost navigations” after bfcache restores.
function clearPendingTransitionTimers() {
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID);
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID);

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;
}

/* GROUP: Starfield freeze + save */
// Freeze starfield motion and persist the latest state.
// Called when leaving or backgrounding so the canvas doesn’t drift while hidden.
function freezeAndSaveStarfield() {
  S = window.STARFIELD; // Re-alias in case Setup loads after this file on some pages
  if (!S) return;

  S.isFrozen = true;

  if (typeof S.saveStarfieldToStorage === "function") {
    S.saveStarfieldToStorage();
  }
}

/* GROUP: Leave/return lifecycle */
// pagehide fires for real navigations and for bfcache entries.
// This is the most reliable “we are leaving” hook across browsers.
window.addEventListener("pagehide", () => {
  clearPendingTransitionTimers();
  freezeAndSaveStarfield();
});

/* GROUP: Backgrounding + tab switching */
// visibilitychange helps on mobile where pagehide may not fire immediately.
document.addEventListener("visibilitychange", () => {
  S = window.STARFIELD;
  if (!S) return;

  if (document.visibilityState === "hidden") {
    freezeAndSaveStarfield();
  } else if (document.visibilityState === "visible") {
    S.isFrozen = false;
  }
});

/* GROUP: DOM helpers */
// Get the transition wrapper element.
// This container receives slide-in/out classes in CSS.
const getTransitionContainer = () => document.getElementById("transitionContainer");

// Determine whether this page appears to be the homepage.
// Used to decide longer animation timing.
const isHomepage = () => !!document.querySelector("#menuButton");
const isPolicypage = () => !!document.querySelector("#policyBack");

// Match CSS expectations: homepage is a longer slide than inner pages.
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);

/* GROUP: Navigation type detection */
// Detect whether this page was restored via back/forward (often bfcache).
// We use this to repair state when a user returns without a full reload.
function isBackForwardNavigation(EVENT) {
  if (EVENT?.persisted) return true;

  try {
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  } catch {
    return false;
  }
}

/* GROUP: Referrer analysis */
// Determine whether the referrer is internal, and whether it was the Menu page or the Homepage.
// This controls whether certain back buttons should appear and what "back" should mean.
function getReferrerInfo() {
  const REFERRER = document.referrer;

  let IS_INTERNAL_REFERRER = false; // True if referrer is same-origin
  let CAME_FROM_MENU_PAGE = false;  // True if referrer path matches /menu
  let CAME_FROM_HOME_PAGE = false;  // True if referrer path matches homepage (/ or /index.html)

  if (!REFERRER) return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE };

  try {
    const REFERRER_URL = new URL(REFERRER);
    IS_INTERNAL_REFERRER = REFERRER_URL.origin === location.origin;

    const REFERRER_PATH = REFERRER_URL.pathname.toLowerCase();

    CAME_FROM_MENU_PAGE =
      REFERRER_PATH === "/menu" ||
      REFERRER_PATH === "/menu/" ||
      REFERRER_PATH.endsWith("/menu/index.html");

    CAME_FROM_HOME_PAGE =
      REFERRER_PATH === "/" ||
      REFERRER_PATH === "" ||
      REFERRER_PATH === "/index.html" ||
      REFERRER_PATH === "/index.htm";
  } catch {}

  return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE };
}

/* #endregion 1) GLOBAL STATE + HELPERS */



/*======================================================================
 * #region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *====================================================================*/

/* GROUP: Lock scroll during transitions */
// We lock both html and body for maximum cross-browser reliability.
function disableDocumentScroll() {
  const HTML = document.documentElement;
  const BODY = document.body;
  const CONTAINER = getTransitionContainer();

  HTML.style.overflowY = "hidden";
  BODY.style.overflow = "hidden";

  if (CONTAINER) CONTAINER.style.overflow = "visible";
}

/* GROUP: Restore scroll after transitions/load */
// Put scroll back on the document.
function enableDocumentScroll() {
  const HTML = document.documentElement;
  const BODY = document.body;
  const CONTAINER = getTransitionContainer();

  HTML.style.overflowY = "auto";
  BODY.style.overflow = "visible";

  if (CONTAINER) CONTAINER.style.overflow = "hidden";
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



/*======================================================================
 * #region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *====================================================================*/

/* GROUP: Load-time animation setup */
// Run slide-in setup and back-button logic after all resources finish loading.
// Using "load" ensures fonts/images/layout are settled before slide-in begins.
window.addEventListener("load", () => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  document.documentElement.style.setProperty(
    "--SLIDE_DURATION",
    `${getSlideDurationSeconds()}s`
  );

  requestAnimationFrame(() => {
    CONTAINER.classList.add("ready");
  });

  /* GROUP: Back button logic (supports multiple pages) */
  const { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE, CAME_FROM_HOME_PAGE } = getReferrerInfo();

  // Some pages may have different back buttons; use whichever exists.
  const HOME_BACK = document.getElementById("homepageBack");
  const POLICY_BACK = document.getElementById("policyBack");
  const BACK_LINK = HOME_BACK || POLICY_BACK;

  if (!BACK_LINK) return;

  // If we came from Menu or directly from Homepage, hide "back" (avoid weird loops).
  if (CAME_FROM_MENU_PAGE && HOME_BACK || CAME_FROM_HOME_PAGE && POLICY_BACK) {
    BACK_LINK.style.display = "none";
    return;
  }

  // If internal referrer exists, show back and store it for "back" keyword navigation.
  if (IS_INTERNAL_REFERRER && REFERRER) {
    BACK_LINK.style.display = "block";
    localStorage.setItem("homepageBackUrl", REFERRER);
    return;
  }

  // External/unknown referrer: hide and clear stored back URL.
  BACK_LINK.style.display = "none";
  localStorage.removeItem("homepageBackUrl");
});

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



/*======================================================================
 * #region 4) BACK/FORWARD CACHE (PAGESHOW)
 *====================================================================*/

/* GROUP: Repair state after bfcache restore */
// pageshow fires when a page is shown, including bfcache restores.
// We repair timers, transition flags, and CSS classes so the UI is stable.
window.addEventListener("pageshow", (EVENT) => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  clearPendingTransitionTimers();

  S = window.STARFIELD;
  if (S) S.isFrozen = false;

  if (!isBackForwardNavigation(EVENT)) return;

  CONTAINER.classList.remove("slide-out");
  CONTAINER.classList.add("ready");

  IS_TRANSITION_ACTIVE = false;

  CONTAINER.scrollTop = 0;
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*======================================================================
 * #region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *====================================================================*/

/* GROUP: Transition navigation entry point */
// Animate slide-out, then navigate after the animation duration.
// URL may be a real href or the special keyword "back".
function transitionTo(URL) {
  if (IS_TRANSITION_ACTIVE) return;
  if (!URL) return;

  clearPendingTransitionTimers();
  IS_TRANSITION_ACTIVE = true;

  const CONTAINER = getTransitionContainer();

  /* GROUP: "back" keyword support */
  if (URL === "back") {
    const STORED_BACK_URL = localStorage.getItem("homepageBackUrl");
    if (!STORED_BACK_URL) {
      IS_TRANSITION_ACTIVE = false;
      return;
    }
    URL = STORED_BACK_URL;
  }

  /* GROUP: No container fallback */
  if (!CONTAINER) {
    location.href = URL;
    IS_TRANSITION_ACTIVE = false; // safety unlock (in case navigation is blocked)
    return;
  }

  /* GROUP: Slide distance computation (supports different scroll owners) */
  const CONTAINER_SCROLL = CONTAINER.scrollTop || 0;
  const DOC_SCROLL = document.documentElement.scrollTop || document.body.scrollTop || 0;

  const ACTIVE_SCROLL = Math.max(DOC_SCROLL, CONTAINER_SCROLL);
  const SLIDE_DISTANCE_PX = (window.innerHeight * 1.1) + ACTIVE_SCROLL;

  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${SLIDE_DISTANCE_PX}px`);

  /* GROUP: Start slide-out */
  CONTAINER.classList.add("slide-out");

  /* GROUP: Navigate when the container's own transform transition ends */
  const DURATION_MS = getSlideDurationSeconds() * 1000;

  const onDone = (EVENT) => {
    // Only accept the container's transform finishing,
    // not random child transitions bubbling up.
    if (EVENT && (EVENT.target !== CONTAINER || EVENT.propertyName !== "transform")) return;

    CONTAINER.removeEventListener("transitionend", onDone);
    clearPendingTransitionTimers();
    IS_TRANSITION_ACTIVE = false;
    location.href = URL;
  };

  CONTAINER.addEventListener("transitionend", onDone);

  // Safety net fallback (in case transitionend never fires)
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => onDone(), DURATION_MS + 150);

  // Freeze/save shortly before leaving (keeps canvas state stable)
  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout(
    freezeAndSaveStarfield,
    Math.max(0, DURATION_MS - 50)
  );
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



/*======================================================================
 * #region 6) NAV FIXES (CLICK + TOUCH TAP VS SWIPE)
 *====================================================================*/

/* GROUP: Small DOM utility */
// Toggle an element’s hidden state by id.
function toggleElement(ELEMENT_ID) {
  if (!ELEMENT_ID) return;
  const ELEMENT = document.getElementById(ELEMENT_ID);
  if (ELEMENT) ELEMENT.hidden = !ELEMENT.hidden;
}

/* GROUP: Click/touch navigation with swipe detection */
// We use pointer events to detect swipe vs tap on touch.
// We use click events to *actually* cancel href and run transitions across all inputs.
function wirePointerNavigation(SELECTOR = "a") {
  const NAV_ITEMS = document.querySelectorAll(SELECTOR);
  if (!NAV_ITEMS.length) return;

  NAV_ITEMS.forEach((ELEMENT) => {
    let START_X = 0;
    let START_Y = 0;
    let DID_MOVE = false;
    let ACTIVE_POINTER_ID = null;

    /* GROUP: Pointer down (touch only) */
    ELEMENT.addEventListener("pointerdown", (EVENT) => {
      if (EVENT.pointerType !== "touch") return;

      ACTIVE_POINTER_ID = EVENT.pointerId;
      DID_MOVE = false;

      START_X = EVENT.clientX;
      START_Y = EVENT.clientY;

      try { ELEMENT.setPointerCapture(ACTIVE_POINTER_ID); } catch {}
    }, { passive: true });

    /* GROUP: Pointer move (touch only) */
    ELEMENT.addEventListener("pointermove", (EVENT) => {
      if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

      if (Math.hypot(EVENT.clientX - START_X, EVENT.clientY - START_Y) > 10) {
        DID_MOVE = true;
      }
    }, { passive: true });

    /* GROUP: Pointer up (touch only) */
    // We *do not* navigate here. We only classify swipe vs tap.
    ELEMENT.addEventListener("pointerup", (EVENT) => {
      if (EVENT.pointerId !== ACTIVE_POINTER_ID) return;

      try { ELEMENT.releasePointerCapture(ACTIVE_POINTER_ID); } catch {}
      ACTIVE_POINTER_ID = null;

      if (DID_MOVE) {
        try { ELEMENT.blur(); } catch {}
      }
    }, { passive: true });

    /* GROUP: Click (all inputs) */
    // This is the true "href kill switch" + transition entry point.
ELEMENT.addEventListener("click", (EVENT) => {
  const HREF = ELEMENT.getAttribute("href");
  if (!HREF) return;

  // Touch swipe? don't navigate.
if (DID_MOVE) return;
DID_MOVE = false;

  // Special keyword support
  if (HREF === "back") {
    EVENT.preventDefault();
    transitionTo("back");
    return;
  }

  // System handlers (don't animate these)
  if (
    HREF.startsWith("mailto:") ||
    HREF.startsWith("tel:") ||
    HREF.startsWith("sms:")
  ) {
    // Let browser handle it normally
    return;
  }

  // Let new-tab / downloads behave normally
  if (ELEMENT.target === "_blank" || ELEMENT.hasAttribute("download")) return;

  // Let true external http(s) links behave normally
  const IS_HTTP = /^https?:\/\//i.test(HREF);
  const IS_EXTERNAL = IS_HTTP && !HREF.startsWith(location.origin);
  if (IS_EXTERNAL) return;

  // Everything else: we own navigation timing
  EVENT.preventDefault();
  transitionTo(HREF);
}, { passive: false });

    /* GROUP: Pointer cancel */
    ELEMENT.addEventListener("pointercancel", () => {
      ACTIVE_POINTER_ID = null;
      try { ELEMENT.blur(); } catch {}
    }, { passive: true });
  });
}

/* GROUP: Wire after DOM is ready */
// Attach navigation overrides once elements exist in the DOM.
document.addEventListener("DOMContentLoaded", () => {
  injectGlobalFooter();
  wirePointerNavigation();
});

/* #endregion 6) NAV FIXES (CLICK + TOUCH TAP VS SWIPE) */



/*======================================================================
 * FOOTER INJECTION (SHARED ACROSS ALL PAGES)
 *====================================================================*/

function injectGlobalFooter() {
  if (isPolicypage() || isHomepage()) return;

  const CONTAINER = document.getElementById("transitionContainer");
  if (!CONTAINER) return;

  // Prevent duplicate footers (important for bfcache/pageshow)
  if (CONTAINER.querySelector("footer[data-global-footer]")) return;

  const FOOTER = document.createElement("footer");
  FOOTER.setAttribute("data-global-footer", "true");

  FOOTER.innerHTML = `
    <hr>
    <p>I Can’t Stop Dying™ and The I Collection™ are trademarks of Staying Outside The Box™ LLC</p>
    <p>
      <strong>Contact: </strong>
      <a href="mailto:admin@stayingoutsidethebox.com">
        admin@&#8203;stayingoutsidethebox&#8203;.com
      </a>
    </p>
<a href="/privacy and terms.html">
      Privacy Policy &amp; Terms of Use
    </a>
  `;

  CONTAINER.appendChild(FOOTER);
}