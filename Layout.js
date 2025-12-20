// thank heavens for chatGPT <3

/*==============================================================*
 *                     LAYOUT & TRANSITIONS
 *==============================================================*
 *
 * Starfield lives in Starfield.js
 * This file controls:
 *  • Page transitions
 *  • Back/forward logic
 *  • Back button visibility
 *  • Touch navigation fixes
 *==============================================================*/


//#region 1. GLOBAL PAGE STATE
/*========================================*
 *  GLOBAL PAGE STATE
 *========================================*/

let IS_TRANSITIONING = false;

const getPage = () => document.getElementById('transitionContainer');
const isHomepage = () => !!document.querySelector('#menuButton');
const getSlideDurationSeconds = () => (isHomepage() ? 1.2 : 0.6);
//#endregion



//#region 2. TRANSITION & LAYOUT
/*========================================*
 *  TRANSITION & LAYOUT
 *========================================*/

function freeScrollLayout(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;

  const CURRENT_SCROLL =
    PAGE?.scrollTop ?? window.scrollY ?? 0;

  // Document becomes scroller
  HTML.style.overflowY = "auto";
  BODY.style.overflow = "visible";
  BODY.style.height = "auto";

  // Container is NOT scrollable
  if (PAGE) {
    PAGE.style.overflow = "visible";
    PAGE.style.height = "auto";
  }

  if (typeof resizeCanvas === "function") resizeCanvas();

  requestAnimationFrame(() => {
    try { window.scrollTo(0, CURRENT_SCROLL); } catch {}
  });
}

// Lock vertical scrolling to #transitionContainer only
function lockScrollToContainer(PAGE = getPage()) {
  const HTML = document.documentElement;
  const BODY = document.body;
  if (!HTML || !BODY || !PAGE) return;

  // Kill document scroll
  HTML.style.overflow = "hidden";
  BODY.style.overflow = "hidden";
  HTML.style.height = "100%";
  BODY.style.height = "100%";

  // Single scroll surface
  PAGE.style.height = "100dvh";
  PAGE.style.overflowY = "auto";
  PAGE.style.overflowX = "hidden";
  PAGE.style.webkitOverflowScrolling = "touch";
  PAGE.style.overscrollBehavior = "contain";
}

/*---------- PAGE LOAD ----------*/
window.addEventListener("load", () => {
  const PAGE = getPage();

  // Determine referrer
  const REF = document.referrer;
  let CAME_FROM_MENU = false;
  let IS_INTERNAL_REFERRER = false;

  if (REF) {
    try {
      const REF_URL = new URL(REF);
      IS_INTERNAL_REFERRER = REF_URL.origin === location.origin;
      const PATH = REF_URL.pathname.toLowerCase();
      CAME_FROM_MENU =
        PATH === "/menu" ||
        PATH === "/menu/" ||
        PATH.endsWith("/menu/index.html");
    } catch {}
  }

  // Set slide duration
  document.documentElement.style.setProperty(
    "--SLIDE_DURATION",
    `${getSlideDurationSeconds()}s`
  );

  // Trigger slide-in
  // Trigger slide-in
requestAnimationFrame(() => {
  PAGE.classList.add("ready");

  const lockOnce = () => lockScrollToContainer(PAGE);

  // 1) Normal path: lock when the CSS transition finishes
  PAGE.addEventListener("transitionend", lockOnce, { once: true });

  // 2) Safety net: lock even if transitionend never fires
  const MS = getSlideDurationSeconds() * 1000;
  setTimeout(lockOnce, MS + 80);
});

  // Back button visibility:
  // • If came from Menu → hide
  // • If came from any other internal page → show
  const BACK_LINK = document.getElementById("homepageBack");

  if (BACK_LINK) {
    if (CAME_FROM_MENU) {
      BACK_LINK.style.display = "none";
    } else if (IS_INTERNAL_REFERRER && REF) {
      BACK_LINK.style.display = "block";
      localStorage.setItem("homepageBackUrl", REF);
    } else {
      BACK_LINK.style.display = "none";
      localStorage.removeItem("homepageBackUrl");
    }
  }
});



/*---------- BACK/FORWARD CACHE ----------*/
window.addEventListener("pageshow", (event) => {
  const PAGE = getPage();
  if (!PAGE) return;

  if (event.persisted || performance?.getEntriesByType("navigation")[0]?.type === "back_forward") {
    PAGE.classList.remove("slide-out");
    PAGE.classList.add("ready");
    lockScrollToContainer(PAGE);
    IS_TRANSITIONING = false;
    PAGE.scrollTop = 0;
  }
});



/*---------- TRANSITION TO NEW PAGE ----------*/
function transitionTo(URL) {
  if (IS_TRANSITIONING) return;
  if (!URL) return;
  IS_TRANSITIONING = true;

window.REMOVE_CIRCLE = true;
requestAnimationFrame(() => window.forceStarfieldRedraw?.());

  const PAGE = getPage();

  // Back keyword → use stored URL
  if (URL === "back") {
    const STORED = localStorage.getItem("homepageBackUrl");
    if (!STORED) return (IS_TRANSITIONING = false);
    URL = STORED;
  }

  if (!PAGE) return (location.href = URL);

  // Pause starfield safely if Starfield.js is loaded
  if (typeof FREEZE_CONSTELLATION !== "undefined") FREEZE_CONSTELLATION = true;
  if (typeof saveStarsToStorage === "function") saveStarsToStorage();

  // Compute slide distance
  const DIST = (window.innerHeight * 1.1) + (PAGE.scrollTop ?? 0);
  document.documentElement.style.setProperty("--SLIDE_DISTANCE", `${DIST}px`);

  freeScrollLayout(PAGE);
  PAGE.classList.add("slide-out");

  setTimeout(() => {
    location.href = URL;
  }, getSlideDurationSeconds() * 1000);
}
//#endregion



//#region 3. TOUCH NAV FIXES
/*========================================*
 *  TOUCH NAVIGATION HANDLING
 *========================================*/




// Toggle an element's visibility via the [hidden] attribute
function toggleElement(ID) {
  if (!ID) return;
  const EL = document.getElementById(ID);
  if (EL) EL.hidden = !EL.hidden;
}

function wirePointerEvent(selector = "a") {
  const items = document.querySelectorAll(selector);
  if (!items.length) return;

  items.forEach((el) => {
    let sx = 0;
    let sy = 0;
    let moved = false;
    let pid = null;

    el.addEventListener(
      "pointerdown",
      (e) => {
        // Only treat touch like your old touch handlers
        if (e.pointerType !== "touch") return;

        pid = e.pointerId;
        moved = false;
        sx = e.clientX;
        sy = e.clientY;

        // Guarantees this element receives pointerup/cancel even if finger drifts
        try { el.setPointerCapture(pid); } catch {}
      },
      { passive: true }
    );

    el.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerId !== pid) return;
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) moved = true;
      },
      { passive: true }
    );

    el.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerId !== pid) return;

        try { el.releasePointerCapture(pid); } catch {}
        pid = null;

        // If the finger slid around, do NOT navigate and also unstick styles
        if (moved) {
          try { el.blur(); } catch {}
          return;
        }

        // Take over navigation (like your touchend + preventDefault)
        e.preventDefault();

        if (el.id === "homepageBack") {
          transitionTo("back");
          return;
        }

        const url = el.getAttribute("href");
        if (!url) return;

        transitionTo(url);
      },
      { passive: false }
    );

    el.addEventListener(
      "pointercancel",
      () => {
        pid = null;
        try { el.blur(); } catch {}
      },
      { passive: true }
    );
  });
}

document.addEventListener("DOMContentLoaded", () => wirePointerEvent());

document.addEventListener("DOMContentLoaded", () => wireTouchEvent());
//#endregion