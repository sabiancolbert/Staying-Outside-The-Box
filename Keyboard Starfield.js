// thank heavens for chatGPT <3

/*========================================*
//#region 1) GLOBAL INPUT STATE
 *========================================*/

// Which letter has been pressed
window.USER_INPUT = 0;

//#endregion



// thank heavens for chatGPT <3

/*==============================================================*
 *                 KEYBOARD INPUT (EXACT KEYS)
 *==============================================================*
 *  Calls: processKeyPress(KEY)
 *
 *  - Desktop physical keyboards only
 *  - Mobile on-screen keyboards are intentionally ignored
 *  - No text insertion handling
 *==============================================================*/

(() => {
  // Local handler (NOT on window)
  function processKeyPress(KEY) {
    // your logic here
    // examples: "w", "a", "s", "d", "Enter", "Escape"
    console.log("Key pressed:", KEY);
  }

  window.addEventListener(
    "keydown",
    (event) => {
      // Ignore held-down repeats
      if (event.repeat) return;

      // Ignore IME composition
      if (event.isComposing) return;

      // Ignore typing inside inputs
      const TARGET = event.target;
      if (
        TARGET &&
        (TARGET.tagName === "INPUT" ||
         TARGET.tagName === "TEXTAREA" ||
         TARGET.isContentEditable)
      ) return;

      processKeyPress(event.key);
    },
    { passive: true }
  );
})();











// Key down
window.addEventListener(
  "keydown",
  (event) => {
    if (event.repeat) return;

    const TARGET = event.target;
    if (
      TARGET &&
      (TARGET.tagName === "INPUT" ||
       TARGET.tagName === "TEXTAREA" ||
       TARGET.isContentEditable)
    ) return;

    const KEY = event.key.toLowerCase();

    if (KEY === "a") window.USER_INPUT.left  = true;
    if (KEY === "d") window.USER_INPUT.right = true;
    if (KEY === "w") window.USER_INPUT.up    = true;
    if (KEY === "s") window.USER_INPUT.down  = true;

    // Prevent browser behavior ONLY for WASD
    if (["w", "a", "s", "d"].includes(KEY)) {
      event.preventDefault();
    }
  },
  { passive: false }
);

// Key up
window.addEventListener("keyup", (event) => {
  const KEY = event.key.toLowerCase();

  if (KEY === "a") window.USER_INPUT.left  = false;
  if (KEY === "d") window.USER_INPUT.right = false;
  if (KEY === "w") window.USER_INPUT.up    = false;
  if (KEY === "s") window.USER_INPUT.down  = false;
});

//#endregion



/*========================================*
//#region 3) FORCE UPDATE API
 *========================================*
 *  Called once per frame from physics.
 *  Converts key state → per-star forces.
 */

window.updateKeyboardForces = function updateKeyboardForces() {
  const STARFIELD = window.STARFIELD;
  if (!STARFIELD || !STARFIELD.starList?.length) return;

  // Convert key states into direction (-1, 0, 1)
  const INPUT_X =
    (window.USER_INPUT.right ? 1 : 0) -
    (window.USER_INPUT.left  ? 1 : 0);

  const INPUT_Y =
    (window.USER_INPUT.down ? 1 : 0) -
    (window.USER_INPUT.up   ? 1 : 0);

  // Global tuning knob
  const FORCE_SCALE = 0.6;

  // Apply per-star (can customize later)
  for (const STAR of STARFIELD.starList) {
    STAR.keyboardForceX = INPUT_X * FORCE_SCALE;
    STAR.keyboardForceY = INPUT_Y * FORCE_SCALE;
  }
};

//#endregion



/*========================================*
//#region 4) SAFETY INITIALIZATION
 *========================================*
 *  Ensures stars never read undefined values.
 */

document.addEventListener("DOMContentLoaded", () => {
  const STARFIELD = window.STARFIELD;
  if (!STARFIELD?.starList) return;

  for (const STAR of STARFIELD.starList) {
    STAR.keyboardForceX ||= 0;
    STAR.keyboardForceY ||= 0;
  }
});

//#endregion