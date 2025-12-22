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
  // your logic here
const STARFIELD = window.STARFIELD;
  if (!STARFIELD || !STARFIELD.starList?.length) return;

  // Apply per-star (can customize later)
  for (const STAR of STARFIELD.starList) {
    const FORCES = KEY_ACTIONS[USER_INPUT]?.(STAR);
    STAR.keyboardForceX = FORCES[0];
    STAR.keyboardForceY = FORCES[1];
  }
  console.log("Key pressed:", KEY);
}

const KEY_FUNCTIONS = {
  w: (STAR) => return runW(STAR)
};

/* KEY FUNCTIONALITY */

function runW(STAR) {
  let FORCES = [0, 0];
  //math
//more math
//ill do this part later
    return FORCES;
}