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
 *
 *  Design notes:
 *   - CSS handles the animations via classes on #transitionContainer:
 *       .ready     -> slide-in complete
 *       .slide-out -> slide-out animation
 *   - This script’s job is to toggle those classes and manage navigation timing.
 *==============================================================*/


//#region 1) GLOBAL STATE + HELPERS
/*========================================*
 *  1) GLOBAL STATE + HELPERS
 *========================================*/

let IS_TRANSITIONING = false;
const SF = window.STARFIELD;

function freezeAndSaveStars() {
  if (!SF) return;
  SF.freeze = true;
  if (typeof SF.saveToStorage === "function") SF.saveToStorage();
}

// Fires on real navigations + bfcache; best cross-browser “we’re leaving”
window.addEventListener("pagehide", freezeAndSaveStars);

// Backup for mobile/tab switching
document.addEventListener("visibilitychange", () => {
  if (!SF) return;

  if (document.visibilityState === "hidden") {
    freezeAndSaveStars();
  } else if (document.visibilityState === "visible") {
    SF.freeze = false;
  }
});

const getTransitionContainer = () => document.getElementById("transitionContainer");
const isHomepage = () => !!document.querySelector("#menuButton");

/** Matches CSS: homepage anim is longer than inner pages */
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);

/** True if navigation was back/forward (sometimes via bfcache) */
function isBackForwardNavigation(event) {
  if (event?.persisted) return true;
  try {
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  } catch {
    return false;
  }
}

/** Determines whether the referrer is internal and whether it was the Menu page */
function getReferrerInfo() {
  const REF = document.referrer;

  let isInternal = false;
  let cameFromMenu = false;

  if (!REF) return { REF, isInternal, cameFromMenu };

  try {
    const REF_URL = new URL(REF);
    isInternal = REF_URL.origin === location.origin;

    const PATH = REF_URL.pathname.toLowerCase();
    cameFromMenu =
      PATH === "/menu" ||
      PATH === "/menu/" ||
      PATH.endsWith("/menu/index.html");
  } catch {
    // if parsing fails, treat as external/unknown
  }

  return { REF, isInternal, cameFromMenu };
}

/* #endregion 1) GLOBAL STATE + HELPERS */



//#region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
/*========================================*
 *  2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *========================================*
 *  Transition system sometimes relies on the document being
 *  the scroll container, not #transitionContainer.
 *
 *  This helper:
 *   - preserves current scroll position
 *   - ensures html scrolls (overflowY:auto)
 *   - ensures body and container are NOT scroll containers
 *   - triggers canvas resize if present
 */

function enableDocumentScroll(container = getTransitionContainer()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  // Save scroll (prefer container scrollTop if it ever becomes scrollable)
  const CURRENT_SCROLL = container?.scrollTop ?? window.scrollY ?? 0;

  // Document becomes scroller
  HTML.style.overflowY = "auto";
  BODY.style.overflow = "visible";
  BODY.style.height = "auto";

  // Container is NOT scrollable
  if (container) {
    container.style.overflow = "visible";
    container.style.height = "auto";
  }

  // If starfield exposes resizeCanvas(), keep it in sync
  if (SF && typeof SF.resizeCanvas === "function") SF.resizeCanvas();

  // Restore scroll next frame
  requestAnimationFrame(() => {
    try { window.scrollTo(0, CURRENT_SCROLL); } catch {}
  });
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



//#region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
/*========================================*
 *  3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *========================================*/

window.addEventListener("load", () => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;

  // Set slide duration CSS var for this page
  document.documentElement.style.setProperty(
    "--SLIDE_DURATION",
    `${getSlideDurationSeconds()}s`
  );

  // Trigger slide-in (CSS: .ready -> translateY(0))
  requestAnimationFrame(() => {
    CONTAINER.classList.add("ready");
  });

  // Back button logic
  const { REF, isInternal, cameFromMenu } = getReferrerInfo();
  const BACK_LINK = document.getElementById("homepageBack");

  if (!BACK_LINK) return;

  // • If came from Menu → hide
  // • If came from any other internal page → show and store ref
  if (cameFromMenu) {
    BACK_LINK.style.display = "none";
    return;
  }

  if (isInternal && REF) {
    BACK_LINK.style.display = "block";
    localStorage.setItem("homepageBackUrl", REF);
    return;
  }

  // External/unknown
  BACK_LINK.style.display = "none";
  localStorage.removeItem("homepageBackUrl");
});

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



//#region 4) BACK/FORWARD CACHE (PAGESHOW)
/*========================================*
 *  4) BACK/FORWARD CACHE (PAGESHOW)
 *========================================*
 *  When bfcache restores a page, DOM returns in a “past” state.
 *  This ensures we’re back to “ready” (not mid-slide-out) and prevents
 *  transition lockups.
 */

window.addEventListener("pageshow", (event) => {
  const CONTAINER = getTransitionContainer();
  if (!CONTAINER) return;
  if (SF) SF.freeze = false;
  
  if (!isBackForwardNavigation(event)) return;

  CONTAINER.classList.remove("slide-out");
  CONTAINER.classList.add("ready");

  IS_TRANSITIONING = false;
  CONTAINER.scrollTop = 0;
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



//#region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
/*========================================*
 *  5) TRANSITION NAVIGATION
 *========================================*
 *  transitionTo(url):
 *   - guards against double triggers
 *   - supports "back" keyword using stored URL
 *   - optionally freezes/saves starfield state
 *   - computes a slide distance for the outgoing transform
 *   - waits for CSS transition time, then navigates
 */

function transitionTo(url) {
  if (IS_TRANSITIONING) return;
  if (!url) return;

  IS_TRANSITIONING = true;

  const CONTAINER = getTransitionContainer();

  // Special keyword: back -> restore stored URL
  if (url === "back") {
    const STORED = localStorage.getItem("homepageBackUrl");
    if (!STORED) {
      IS_TRANSITIONING = false;
      return;
    }
    url = STORED;
  }

  // If container missing, just go
  if (!CONTAINER) {
    location.href = url;
    return;
  }
  
  // Compute slide distance (viewport + current scroll)
  const DIST_PX = (window.innerHeight * 1.1) + (window.scrollY ?? 0);
  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${DIST_PX}px`);

// Start slide-out
CONTAINER.classList.add("slide-out");

// Leave after animation time
const MS = getSlideDurationSeconds() * 1000;

// Freeze+save right before navigation (keeps motion during slide, but captures final state)
setTimeout(freezeAndSaveStars, Math.max(0, MS - 50));

setTimeout(() => {
  location.href = url;
}, MS);
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



//#region 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE)
/*========================================*
 *  6) TOUCH NAV FIXES
 *========================================*
 *  We treat touch as:
 *   - Tap: navigate via transitionTo()
 *   - Swipe/drag: do NOT navigate, and remove sticky :focus/:active visuals
 *
 *  Uses pointer events so it works consistently on iOS + modern browsers.
 */

// Toggle an element's visibility via the [hidden] attribute
function toggleElement(id) {
  if (!id) return;
  const EL = document.getElementById(id);
  if (EL) EL.hidden = !EL.hidden;
}

/** Wires pointer-based navigation onto elements that match selector */
function wirePointerNavigation(selector = "a") {
  const items = document.querySelectorAll(selector);
  if (!items.length) return;

  items.forEach((el) => {
    let startX = 0;
    let startY = 0;
    let moved = false;
    let activePointerId = null;

    el.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;

        activePointerId = e.pointerId;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;

        // Ensure we get the corresponding pointerup/cancel
        try { el.setPointerCapture(activePointerId); } catch {}
      },
      { passive: true }
    );

    el.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerId !== activePointerId) return;

        // Mark as moved if finger drifts beyond tap threshold
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) moved = true;
      },
      { passive: true }
    );

    el.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerId !== activePointerId) return;

        try { el.releasePointerCapture(activePointerId); } catch {}
        activePointerId = null;

        // If swipe/drag, do nothing and unstick styles
        if (moved) {
          try { el.blur(); } catch {}
          return;
        }

        // Tap: take over navigation
        e.preventDefault();

        if (el.id === "homepageBack") {
          transitionTo("back");
          return;
        }

        const href = el.getAttribute("href");
        if (!href) return;

        transitionTo(href);
      },
      { passive: false }
    );

    el.addEventListener(
      "pointercancel",
      () => {
        activePointerId = null;
        try { el.blur(); } catch {}
      },
      { passive: true }
    );
  });
}

document.addEventListener("DOMContentLoaded", () => wirePointerNavigation());

/* #endregion 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE) */