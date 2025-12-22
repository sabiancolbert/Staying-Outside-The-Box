// thank heavens for chatGPT <3
/* EVENT LISTENER */

window.addEventListener("keydown", (event) => {
  // Ignore held-down repeats
  if (event.repeat) return;

  // Ignore IME composition
  if (event.isComposing) return;

  processKeyPress(event.key);
});

/* KEY PROCESSING */

function processKeyPress(KEY) {
  const STARFIELD = window.STARFIELD;
  if (!STARFIELD?.starList?.length) return;

  // Step 1: normalize key into a lookup value
  const KEYBOARD_INPUT = String(KEY).toLowerCase();

  // Step 2: apply per-star
  for (const STAR of STARFIELD.starList) {
    const FORCES = KEY_FUNCTIONS[KEYBOARD_INPUT]?.(STAR) ?? [0, 0];
    STAR.keyboardForceX = FORCES[0];
    STAR.keyboardForceY = FORCES[1];
  }

  console.log("Key pressed:", KEY);
}

const KEY_FUNCTIONS = {
  w: (STAR) => runW(STAR),
  // a: (STAR) => runA(STAR),
  // s: (STAR) => runS(STAR),
  // d: (STAR) => runD(STAR),
};

/* KEY FUNCTIONALITY */

function runW(STAR) {
  return [0, window.CIRCLE_TIMER];
}