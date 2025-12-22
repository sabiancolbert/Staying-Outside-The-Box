// thank heavens for chatGPT <3

function processKeyPress(KEY) {
  // your logic here
const STARFIELD = window.STARFIELD;
  if (!STARFIELD || !STARFIELD.starList?.length) return;

  // Apply per-star (can customize later)
  for (const STAR of STARFIELD.starList) {
    STAR.keyboardForceX = INPUT_X;
    STAR.keyboardForceY = INPUT_Y;
  }
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