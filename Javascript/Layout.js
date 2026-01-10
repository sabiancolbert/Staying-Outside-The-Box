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
 *     - Referrer analysis for back button behavior
 *
 *  2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *     - Restore default scrolling to the document
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
 *     - Navigate on timer
 *
 *  6) TOUCH NAV FIXES (POINTER TAP VS SWIPE)
 *     - Tap-to-navigate with animation
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
//const CRUNCH_SOUND = new Audio("/Resources/Crunch.mp3"); // Create audio object
//CRUNCH_SOUND.preload = "auto";                           // Hint: preload audio
//CRUNCH_SOUND.load();                                     // Begin loading audio
//CRUNCH_SOUND.volume = 0.25;                              // Set playback volume

/* GROUP: Pending transition timers */
// bfcache can resurrect timers if they were scheduled before leaving.
// We store handles so we can cancel them safely on pagehide/pageshow.
let SAVE_BEFORE_LEAVE_TIMEOUT_ID = null;     // setTimeout handle: freeze/save shortly before navigation
let NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null;  // setTimeout handle: actual navigation after slide duration

/* GROUP: Timer hygiene */
// Cancel any pending transition timers and reset handles.
// Prevents “ghost navigations” after bfcache restores.
function clearPendingTransitionTimers() { // Clears any scheduled navigation timers
  if (SAVE_BEFORE_LEAVE_TIMEOUT_ID) clearTimeout(SAVE_BEFORE_LEAVE_TIMEOUT_ID); // Cancel pending save timer
  if (NAVIGATE_AFTER_SLIDE_TIMEOUT_ID) clearTimeout(NAVIGATE_AFTER_SLIDE_TIMEOUT_ID); // Cancel pending nav timer

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = null; // Reset handle so "nothing is scheduled" is explicit
  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = null; // Reset handle so "nothing is scheduled" is explicit
}

/* GROUP: Starfield freeze + save */
// Freeze starfield motion and persist the latest state.
// Called when leaving or backgrounding so the canvas doesn’t drift while hidden.
function freezeAndSaveStarfield() { // Central "stop motion + save" hook

  S = window.STARFIELD; // Re-alias in case Setup loads after this file on some pages

  if (!S) return; // Bail if STARFIELD isn't present on this page

  S.isFrozen = true; // Freeze physics/render loop work during transitions/backgrounding

  if (typeof S.saveStarfieldToStorage === "function") { // Only call save when Setup storage exists
    S.saveStarfieldToStorage(); // Persist star positions + meta into localStorage
  }
}

/* GROUP: Leave/return lifecycle */
// pagehide fires for real navigations and for bfcache entries.
// This is the most reliable “we are leaving” hook across browsers.
window.addEventListener("pagehide", () => { // Fires when the page is being hidden/unloaded (including bfcache)
  clearPendingTransitionTimers(); // Prevent timers from firing after a bfcache restore
  freezeAndSaveStarfield(); // Freeze + save right before we leave
});

/* GROUP: Backgrounding + tab switching */
// visibilitychange helps on mobile where pagehide may not fire immediately.
document.addEventListener("visibilitychange", () => { // Fires when tab/app becomes hidden/visible

  S = window.STARFIELD; // Re-alias in case Setup loads after this file on some pages

  if (!S) return; // Bail if STARFIELD isn't present on this page

  if (document.visibilityState === "hidden") { // When the page goes into the background
    freezeAndSaveStarfield(); // Freeze + save so state doesn't drift offscreen
  } else if (document.visibilityState === "visible") { // When the page returns to foreground
    S.isFrozen = false; // Allow starfield to resume
  }
});

/* GROUP: DOM helpers */
// Get the transition wrapper element.
// This container receives slide-in/out classes in CSS.
const getTransitionContainer = () => document.getElementById("transitionContainer"); // Fetch the transition wrapper

// Determine whether this page appears to be the homepage.
// Used to decide longer animation timing.
const isHomepage = () => !!document.querySelector("#menuButton"); // Home heuristic: menu button exists

// Match CSS expectations: homepage is a longer slide than inner pages.
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6); // Return slide duration in seconds

/* GROUP: Navigation type detection */
// Detect whether this page was restored via back/forward (often bfcache).
// We use this to repair state when a user returns without a full reload.
function isBackForwardNavigation(EVENT) { // Returns true when page came from bfcache/back-forward

  if (EVENT?.persisted) return true; // Browser explicitly tells us this is a bfcache restore

  try { // Try Navigation Timing API (not supported everywhere)
    return performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward"; // Detect back/forward navigation type
  } catch { // If the API fails or is unsupported
    return false; // Default: not a back/forward restore
  }
}

/* GROUP: Referrer analysis */
// Determine whether the referrer is internal and whether it was the Menu page.
// This controls whether the homepage back button should appear.
function getReferrerInfo() { // Returns referrer string + internal/menu flags

  const REFERRER = document.referrer; // Browser-provided referrer URL (may be empty)

  let IS_INTERNAL_REFERRER = false; // True if referrer is same-origin
  let CAME_FROM_MENU_PAGE = false; // True if referrer path matches /menu

  if (!REFERRER) return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE }; // Early return when referrer is empty

  try { // Parse referrer as URL for safe origin/path checks
    const REFERRER_URL = new URL(REFERRER); // Convert string into URL object
    IS_INTERNAL_REFERRER = REFERRER_URL.origin === location.origin; // Same-origin check

    const REFERRER_PATH = REFERRER_URL.pathname.toLowerCase(); // Normalize path to lowercase for comparisons

    CAME_FROM_MENU_PAGE = // Menu detection across common URL forms
      REFERRER_PATH === "/menu" || // /menu
      REFERRER_PATH === "/menu/" || // /menu/
      REFERRER_PATH.endsWith("/menu/index.html"); // /menu/index.html (or nested forms)
  } catch {} // Ignore parse errors and keep defaults

  return { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE }; // Return computed referrer info
}

/* #endregion 1) GLOBAL STATE + HELPERS */



/*======================================================================
 * #region 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER)
 *====================================================================*/

/* GROUP: Restore document scrolling */
// Switch scrolling responsibility back to the document.
// Some layouts temporarily make the container the scroller,
// but this function restores “normal” page flow.
/* GROUP: Lock scroll during transitions */
// We lock both html and body for maximum cross-browser reliability.
function disableDocumentScroll() {
  const HTML = document.documentElement;
  const BODY = document.body;
  const CONTAINER = getTransitionContainer();

  HTML.style.overflowY = "hidden";
  BODY.style.overflow = "hidden";

  // Optional: allow container overflow if you want internal effects while locked.
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

  // Optional: prevent container from becoming the scroller.
  if (CONTAINER) CONTAINER.style.overflow = "hidden";
}

/* #endregion 2) SCROLL OWNERSHIP (DOCUMENT IS SCROLLER) */



/*======================================================================
 * #region 3) PAGE LOAD (SLIDE-IN + BACK BUTTON)
 *====================================================================*/

/* GROUP: Load-time animation setup */
// Run slide-in setup and back-button logic after all resources finish loading.
// Using "load" ensures fonts/images/layout are settled before slide-in begins.
window.addEventListener("load", () => { // Fires after the page fully loads

  const CONTAINER = getTransitionContainer(); // Find the transition wrapper
  if (!CONTAINER) return; // Bail if wrapper is missing on this page

  document.documentElement.style.setProperty( // Publish slide duration to CSS variable
    "--SLIDE_DURATION", // CSS variable name
    `${getSlideDurationSeconds()}s` // Value: seconds string (ex: "0.6s")
  );

  requestAnimationFrame(() => { // Next frame ensures class change triggers animation
    CONTAINER.classList.add("ready"); // Add class used by CSS to slide in
  });
  
  enableDocumentScroll();

  /* GROUP: Back button logic */
  const { REFERRER, IS_INTERNAL_REFERRER, CAME_FROM_MENU_PAGE } = getReferrerInfo(); // Compute back-link rules

  const BACK_LINK = document.getElementById("homepageBack"); // Find the homepage back button link
  if (!BACK_LINK) return; // Bail if this page doesn't have that element

  if (CAME_FROM_MENU_PAGE) { // If we arrived from the Menu page
    BACK_LINK.style.display = "none"; // Hide the back button (Menu isn't part of back trail)
    return; // Stop here
  }

  if (IS_INTERNAL_REFERRER && REFERRER) { // If referrer is internal and non-empty
    BACK_LINK.style.display = "block"; // Show the back button
    localStorage.setItem("homepageBackUrl", REFERRER); // Store destination for "back" keyword navigation
    return; // Done
  }

  BACK_LINK.style.display = "none"; // Hide back button for external/unknown referrers
  localStorage.removeItem("homepageBackUrl"); // Clear stored back URL so "back" can't point somewhere weird
});

/* #endregion 3) PAGE LOAD (SLIDE-IN + BACK BUTTON) */



/*======================================================================
 * #region 4) BACK/FORWARD CACHE (PAGESHOW)
 *====================================================================*/

/* GROUP: Repair state after bfcache restore */
// pageshow fires when a page is shown, including bfcache restores.
// We repair timers, transition flags, and CSS classes so the UI is stable.
window.addEventListener("pageshow", (EVENT) => { // Fires on normal show and bfcache restore

  const CONTAINER = getTransitionContainer(); // Find the transition wrapper
  if (!CONTAINER) return; // Bail if wrapper is missing

  clearPendingTransitionTimers(); // Cancel any timers resurrected by bfcache

  S = window.STARFIELD; // Re-alias starfield on return
  if (S) S.isFrozen = false; // Unfreeze simulation if starfield exists

  if (!isBackForwardNavigation(EVENT)) return; // Only repair classes/flags for actual back-forward restores

  CONTAINER.classList.remove("slide-out"); // Remove any mid-transition class that might have been preserved
  CONTAINER.classList.add("ready"); // Ensure we look like a fully loaded page

  IS_TRANSITION_ACTIVE = false; // Reset transition guard so taps work again

  CONTAINER.scrollTop = 0; // Reset container scroll in case it was used as a scroller
});

/* #endregion 4) BACK/FORWARD CACHE (PAGESHOW) */



/*======================================================================
 * #region 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE)
 *====================================================================*/

/* GROUP: Transition navigation entry point */
// Animate slide-out, then navigate after the animation duration.
// URL may be a real href or the special keyword "back".
function transitionTo(URL) { // Main navigation helper: animate out, then go

  if (IS_TRANSITION_ACTIVE) return; // Guard: ignore if a transition is already running
  if (!URL) return; // Guard: ignore empty URLs
  //CRUNCH_SOUND.pause(), CRUNCH_SOUND.play().catch(() => {}); // Optional click sound (disabled)

  clearPendingTransitionTimers(); // Cancel any older transition timers
  IS_TRANSITION_ACTIVE = true; // Lock transitions until this navigation completes

  const CONTAINER = getTransitionContainer(); // Get wrapper used for slide-out animation
  
  /* GROUP: "back" keyword support */
  if (URL === "back") { // If caller wants stored internal "back" behavior

    const STORED_BACK_URL = localStorage.getItem("homepageBackUrl"); // Read stored referrer destination

    if (!STORED_BACK_URL) { // If no stored URL exists
      IS_TRANSITION_ACTIVE = false; // Unlock transitions so user isn't stuck
      return; // Abort navigation
    }

    URL = STORED_BACK_URL; // Replace keyword with real URL
  }
alert(CONTAINER);
  /* GROUP: No container fallback */
  if (!CONTAINER) { // If wrapper doesn't exist, we can't animate
    location.href = URL; // Navigate immediately
    return; // Done
  }

  /* GROUP: Slide distance computation */
  const SLIDE_DISTANCE_PX = (window.innerHeight * 1.1) + (window.scrollY ?? 0); // How far to slide so page fully clears

  document.documentElement.style.setProperty( // Publish slide distance to CSS variable
    "--SLIDE_DISTANCE", // CSS variable name
    `${SLIDE_DISTANCE_PX}px` // Value: pixels string
  );
  /* GROUP: Start slide-out */

  CONTAINER.classList.add("slide-out"); // Add class that triggers slide-out CSS animation

  /* GROUP: Timer scheduling */
  const DURATION_MS = getSlideDurationSeconds() * 1000; // Convert seconds into ms for setTimeout

  SAVE_BEFORE_LEAVE_TIMEOUT_ID = setTimeout( // Schedule freeze/save near end of animation
    freezeAndSaveStarfield, // Callback: freeze + persist starfield state
    Math.max(0, DURATION_MS - 50) // Run just before navigation (50ms cushion)
  );

  NAVIGATE_AFTER_SLIDE_TIMEOUT_ID = setTimeout(() => { // Schedule actual navigation
    location.href = URL; // Navigate to destination URL
  }, DURATION_MS); // Fire when animation should have completed
}

/* #endregion 5) TRANSITION NAVIGATION (SLIDE-OUT THEN LEAVE) */



/*======================================================================
 * #region 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE)
 *====================================================================*/

/* GROUP: Small DOM utility */
// Toggle an element’s hidden state by id.
function toggleElement(ELEMENT_ID) { // Simple helper for debug UI toggles
  if (!ELEMENT_ID) return; // Guard: require an id string

  const ELEMENT = document.getElementById(ELEMENT_ID); // Locate element by id
  if (ELEMENT) ELEMENT.hidden = !ELEMENT.hidden; // Flip hidden flag when element exists
}

/* GROUP: Tap-to-navigate without breaking scroll */
// Converts touch taps into animated navigation,
// while preserving swipe gestures for native scrolling.
function wirePointerNavigation(SELECTOR = "a") { // Intercepts touch taps on links to run transitions

  const NAV_ITEMS = document.querySelectorAll(SELECTOR); // Collect all matching navigable elements
  if (!NAV_ITEMS.length) return; // Bail if no targets exist

  NAV_ITEMS.forEach((ELEMENT) => { // Wire gesture logic for each element

    let START_X = 0; // Gesture starting X
    let START_Y = 0; // Gesture starting Y
    let DID_MOVE = false; // True once movement exceeds threshold (classify as swipe)
    let ACTIVE_POINTER_ID = null; // Tracks which touch pointer we are following

    /* GROUP: Pointer down */
    ELEMENT.addEventListener(
      "pointerdown", // Touch begins
      (EVENT) => {

        if (EVENT.pointerType !== "touch") return; // Ignore mouse/stylus so normal clicks remain normal

        ACTIVE_POINTER_ID = EVENT.pointerId; // Track this finger id
        DID_MOVE = false; // Reset move flag for new gesture

        START_X = EVENT.clientX; // Capture initial X
        START_Y = EVENT.clientY; // Capture initial Y

        try { ELEMENT.setPointerCapture(ACTIVE_POINTER_ID); } catch {} // Keep getting events even if finger drifts
      },
      { passive: true } // Passive: do not block scroll on pointerdown
    );

    /* GROUP: Pointer move */
    ELEMENT.addEventListener(
      "pointermove", // Finger moved
      (EVENT) => {

        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return; // Ignore unrelated pointers

        if (Math.hypot(EVENT.clientX - START_X, EVENT.clientY - START_Y) > 10) { // If user moved beyond threshold
          DID_MOVE = true; // Mark as swipe/drag, not a tap
        }
      },
      { passive: true } // Passive: allow native scrolling
    );

    /* GROUP: Pointer up */
    ELEMENT.addEventListener(
      "pointerup", // Finger lifted
      (EVENT) => {

        if (EVENT.pointerId !== ACTIVE_POINTER_ID) return; // Ignore if this isn't our tracked pointer

        try { ELEMENT.releasePointerCapture(ACTIVE_POINTER_ID); } catch {} // Release capture now that gesture ended
        ACTIVE_POINTER_ID = null; // Clear pointer id so next gesture starts fresh

        if (DID_MOVE) { // If this was a swipe
          try { ELEMENT.blur(); } catch {} // Remove sticky focus outlines on iOS
          return; // Do not navigate
        }
        
        const HREF = ELEMENT.getAttribute("href");
        if (!HREF) return; // Return if no HREF
        
        // Let special links behave normally
        if (
          HREF.startsWith("mailto:") ||
          HREF.startsWith("tel:") ||
          HREF.startsWith("sms:") ||
          HREF.startsWith("javascript:")
        ) {
          return;
        }

        EVENT.preventDefault(); // Tap: prevent default navigation so we can animate

        if (ELEMENT.id === "homepageBack") { // Special case: homepage back button
          transitionTo("back"); // Use stored back URL behavior
          return; // Done
        }

        transitionTo(HREF); // Trigger slide-out then navigate
      },
      { passive: false } // Non-passive because we call preventDefault for tap behavior
    );

    /* GROUP: Pointer cancel */
    ELEMENT.addEventListener(
      "pointercancel", // Browser canceled the gesture (system interruption, etc.)
      () => {
        ACTIVE_POINTER_ID = null; // Clear tracked pointer id
        try { ELEMENT.blur(); } catch {} // Remove sticky focus outlines
      },
      { passive: true } // Passive: no scrolling interference
    );
  });
}

/* GROUP: Wire after DOM is ready */
// Attach touch navigation overrides once elements exist in the DOM.
document.addEventListener(
  "DOMContentLoaded", // Run after DOM is parsed
  () => {
    injectGlobalFooter(); // Add footer
    wirePointerNavigation(); // Wire pointer navigation on all links by default
    disableDocumentScroll()
  }
);

/* #endregion 6) TOUCH NAV FIXES (POINTER TAP VS SWIPE) */

/*======================================================================
 * FOOTER INJECTION (SHARED ACROSS ALL PAGES)
 *====================================================================*/

function injectGlobalFooter() {
  if (isHomepage()) return;
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
      All trademarks, logos, and brands are property of their respective owners.<br>
      This site uses these logos only to link to official profiles.<br>
      No endorsement is implied.
    </p>
    <p>
      <strong>Contact: </strong>
      <a href="mailto:admin@stayingoutsidethebox.com">
        admin@&#8203;stayingoutsidethebox&#8203;.com
      </a>
    </p>
    <a onclick="transitionTo(this.href); return false;" href="/privacy and terms.html">
      Privacy Policy &amp; Terms of Use
    </a>
  `;

  CONTAINER.appendChild(FOOTER);
}