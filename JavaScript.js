// thank heavens for chatGPT <3

/*==============================*
 *  GLOBAL PAGE STATE
 *==============================*/

let isInternalReferrer = false;    // true if we came from another page on this site
let slideDurationMs = 600;         // fallback slide-out duration (ms) if calc fails
let isTransitioning = false;       // prevents double navigation during transitions

/*==============================*
 *  PAGE LOAD HANDLER
 *==============================*/

function resetPageHeights() {
  
  const html = document.documentElement;
  const body = document.body;
  const tc = document.getElementById('transitionContainer');

  const vh = window.innerHeight + 'px'; // real 100dvh without iOS bugs

  html.style.height = vh;
  body.style.height = vh;

  if (tc) {
    tc.style.height = vh;
    tc.style.minHeight = vh;   // prevents shrinking
    tc.style.maxHeight = vh;   // prevents expanding
  }
}

window.addEventListener('load', () => {
  const page = document.getElementById('transitionContainer');

  // Read and clear the "came from menu" flag
  const suppressHomeBack = sessionStorage.getItem('suppressHomeBack') === '1';
  sessionStorage.removeItem('suppressHomeBack');

  // Remove URL hash so in-page anchors don't block slide animations
  if (window.location.hash) {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }

  // Set slide duration relative to content height (clamped 1–3×)
  if (page) {
    const pageSize = .5 * Math.max(1, Math.min(page.offsetHeight / (window.innerHeight || document.documentElement.clientHeight), 3));
document.documentElement.style.setProperty('--slide-duration', `${pageSize}s`);
slideDurationMs = pageSize * 1000;

    // Mark page as ready so CSS can run entrance animations
    requestAnimationFrame(() => {
      page.classList.add('ready');
    });
  }

//reset heights to prevent background expansion and contraction
resetPageHeights();

  // Detect if we came from the same origin (internal navigation)
  const ref = document.referrer;
  if (ref) {
    try {
      const refUrl = new URL(ref);
      isInternalReferrer = refUrl.origin === window.location.origin;
    } catch {
      isInternalReferrer = false;
    }
  }

  // Handle the "back to previous internal page" link on the homepage
  const backLink = document.getElementById('homepageBack');
  if (backLink) {
    // Store a back URL only when coming from an internal page
    if (!suppressHomeBack && isInternalReferrer && ref) {
      try {
        localStorage.setItem('homepageBackUrl', ref);
      } catch (err) {
        console.warn('Could not save homepageBackUrl:', err);
      }
    } else {
      localStorage.removeItem('homepageBackUrl');
    }

    const backUrl = localStorage.getItem('homepageBackUrl');
    backLink.style.display =
      !suppressHomeBack && backUrl ? 'block' : 'none';
  }

  // If we entered the site from outside, clear stale constellation data
  if (!isInternalReferrer) {
    localStorage.removeItem('constellationStars');
    localStorage.removeItem('constellationMeta');
  }
  
});

/*==============================*
 *  BACK/FORWARD CACHE HANDLER
 *==============================*/

window.addEventListener('pageshow', (event) => {
  
  const page = document.getElementById('transitionContainer');
  if (!page) return;
  applyFreeLayout();
  // Safely read navigation type (if supported)
  const navEntries = performance.getEntriesByType
    ? performance.getEntriesByType('navigation')
    : [];
  const navType = navEntries[0] && navEntries[0].type;

  if (event.persisted || navType === 'back_forward') {
    // Ensure content is visible (not stuck off-screen after bfcache)
    page.classList.remove('slide-out');
    page.classList.add('ready');
    
  
    // Unfreeze constellation motion
    freezeConstellation = false;
    cleanedUserSpeed = 0;
    smoothSpeed = 0;
    pointerSpeed = 0;

    // Reset scroll inside the transition container
    page.scrollTop = 0;
    
    applyLockedLayout();
    

// Allow transitions again
    isTransitioning = false;
  
  }
});

/*==============================*
 *  SIMPLE HTML HELPERS
 *==============================*/

// Toggle an element's visibility via the `hidden` attribute
function toggleElement(id) {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = !element.hidden;
  }
}

/* Small helper: drop focus when a touch ends, so outlines/active states clear nicely */
document.addEventListener(
  'touchend',
  () => {
    document.activeElement?.blur();
  },
  { passive: true }
);

/*==============================*
 *  CONSTELLATION CANVAS SETUP
 *==============================*/

const canvas = document.getElementById('constellations');
const brush = canvas.getContext('2d');

let freezeConstellation = false;

// Pointer / speed tracking
let lastX = 0;
let lastY = 0;
let lastTime = 0;
let pointerSpeed = 0;
let smoothSpeed = 0;
let cleanedUserSpeed = 0;
let attractionValue = 1;

// Canvas & star scaling
let width = 0;
let height = 0;
let scaleFactor = 0;
let maxStarCount = 0;
let maxLinkDistance = 0;

// Star collection
let stars = [];

/*==============================*
 *  UTILITY FUNCTIONS
 *==============================*/

// Random number in [min, max)
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/*==============================*
 *  STAR INITIALIZATION
 *==============================*/

// Load stars from storage if possible, otherwise create new ones
function initStars() {
  const saved = localStorage.getItem('constellationStars');

  if (!saved) {
    createStars();
    return;
  }

  try {
    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed) && parsed.length) {
      stars = parsed;

      // Try to rescale from previous canvas size
      const metaRaw = localStorage.getItem('constellationMeta');
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (meta.width > 0 && meta.height > 0) {
            const scaleX = width / meta.width;
            const scaleY = height / meta.height;
            const sizeScale =
              (width + height) / (meta.width + meta.height);

            for (const star of stars) {
              star.x *= scaleX;
              star.y *= scaleY;
              star.size *= sizeScale;
            }
          }

          attractionValue  = meta.attractionValue  ?? 1;
          cleanedUserSpeed = meta.cleanedUserSpeed ?? 0;
          smoothSpeed      = meta.smoothSpeed      ?? 0;
          pointerSpeed     = meta.pointerSpeed     ?? 0;
        } catch (err) {
          console.warn('Could not parse constellationMeta, skipping scale.', err);
        }
      }
    } else {
      createStars();
    }
  } catch (err) {
    console.error('Could not parse saved stars, recreating.', err);
    createStars();
  }
}

// Create a new starfield sized to the current canvas
function createStars() {
  stars = [];

  for (let i = 0; i < maxStarCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-0.25, 0.25),
      vy: randomBetween(-0.25, 0.25),
      size: randomBetween(3, scaleFactor / 400),
      opacity: randomBetween(0.005, 1.8),
      fadeSpeed: randomBetween(1, 2.1),
      redValue: randomBetween(0, 200),
      whiteValue: 0
    });
  }
}

/*==============================*
 *  STAR ANIMATION LOGIC
 *==============================*/

// Move stars (velocity, pointer pull, fading, wrapping)
function moveStars() {
  for (const star of stars) {
    // Base movement, scaled by user speed
    star.x += star.vx * (cleanedUserSpeed + 1);
    star.y += star.vy * (cleanedUserSpeed + 1);

    // Pointer attraction / repulsion when moving fast
    if (lastTime !== 0 && cleanedUserSpeed > 0.19) {
      const dx = lastX - star.x;
      const dy = lastY - star.y;
      const screenSizeModifier = scaleFactor / 500;
      const distSq = dx * dx + dy * dy;

      const maxInfluence = 12000 * screenSizeModifier;
      if (distSq > 4 && distSq < maxInfluence) {
        const proximity = (maxInfluence - distSq) / maxInfluence;
        const pull =
          0.005 *
          cleanedUserSpeed *
          proximity *
          (attractionValue < 0 ? attractionValue * 2.5 : attractionValue);

        star.x += dx * pull;
        star.y += dy * pull;
      }
    }

    // Fade white flashes back down
    if (star.whiteValue > 0) {
      star.whiteValue -= Math.max(0, star.whiteValue * 0.02);
    }

    // Opacity / twinkle behavior
    if (star.opacity <= 0.005) {
      // Respawn invisible stars
      star.opacity = 1;

      // Small chance to flash white
      if (Math.random() < 0.07) {
        star.whiteValue = 1;
      }
    } else if (star.opacity > 0.02) {
      // Normal fade
      star.opacity -= 0.005 * star.fadeSpeed;
    } else {
      // Keep them hidden for a bit
      star.opacity -= 0.0001;
    }

    // Wrap around edges
    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }

  // Slowly bleed off speed after user stops moving
  cleanedUserSpeed *= 0.95;

  // Snap tiny values to zero
  if (cleanedUserSpeed < 0.05) {
    cleanedUserSpeed = 0;
  }

  // Ease attractionValue back toward 1
  attractionValue += (1 - attractionValue) * 0.06;
  if (attractionValue > 1) attractionValue = 1;
}

// Draw star connections + star bodies
function drawStarsWithLines() {
  brush.clearRect(0, 0, width, height);

  // Lines between near neighbors
  brush.lineWidth = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const aStar = stars[i];
      const bStar = stars[j];

      const xDistance = aStar.x - bStar.x;
      const yDistance = aStar.y - bStar.y;
      const distance = Math.hypot(xDistance, yDistance);

      if (distance < maxLinkDistance) {
        const opacityModifier = (aStar.opacity + bStar.opacity) / 2;
        const alpha =
          (1 - distance / maxLinkDistance) * opacityModifier;

        brush.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        brush.beginPath();
        brush.moveTo(aStar.x, aStar.y);
        brush.lineTo(bStar.x, bStar.y);
        brush.stroke();
      }
    }
  }

  // Star circles
  for (const star of stars) {
    let tempRed = 255 * star.whiteValue + star.redValue;
    if (tempRed > 255) tempRed = 255;

    const tempGreen = 255 * star.whiteValue;
    const tempBlue = 255 * star.whiteValue;
    const tempSize = star.whiteValue * 2 + star.size;

    brush.beginPath();
    brush.fillStyle = `rgba(${tempRed}, ${tempGreen}, ${tempBlue}, ${star.opacity})`;
    brush.arc(star.x, star.y, tempSize, 0, Math.PI * 2);
    brush.fill();
  }
}

/*==============================*
 *  CANVAS RESIZE HANDLING
 *==============================*/

// Resize canvas to viewport, rescale existing stars
function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  const oldScaleFactor = scaleFactor;

  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  scaleFactor = width + height;
  if (scaleFactor > 2000) {
    scaleFactor = 2000;
  }

  maxStarCount = scaleFactor / 10;
  maxLinkDistance = scaleFactor / 10;

  // Rescale positions/sizes when this isn't the first call
  if (oldWidth !== 0) {
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;
    const scaleSize = scaleFactor / oldScaleFactor;

    for (const star of stars) {
      star.x *= scaleX;
      star.y *= scaleY;
      star.size *= scaleSize;
    }
  }
}

/*==============================*
 *  MAIN ANIMATION LOOP
 *==============================*/

function animate() {
  if (!freezeConstellation) {
    moveStars();
  }

  drawStarsWithLines();
  requestAnimationFrame(animate);
}

/*==============================*
 *  POINTER SPEED TRACKING
 *==============================*/

// Compute pointer speed and smoothed speed from a new event
function updateSpeed(x, y, time) {
  const dx = x - lastX;
  const dy = y - lastY;
  const dt = time - lastTime;

  if (dt > 0) {
    // Pixels per millisecond
    pointerSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
  }

  // Smooth out jittery input
  smoothSpeed = smoothSpeed * 0.8 + pointerSpeed * 10;

  // Normalize and scale based on screen size
  cleanedUserSpeed = Math.min(
    smoothSpeed * (scaleFactor / 1100) ** 2,
    10
  );

  lastX = x;
  lastY = y;
  lastTime = time;
}

/*==============================*
 *  INTERACTION / SPEED HANDLERS
 *==============================*/

// Desktop cursor tracking
window.addEventListener('mousemove', (e) => {
  updateSpeed(e.clientX, e.clientY, e.timeStamp);
});

window.addEventListener('mousedown', (e) => {
  attractionValue = -2; // start strongly repulsive on click

  // Prevent an initial huge speed spike
  lastX = e.clientX;
  lastY = e.clientY;
  lastTime = e.timeStamp;

  updateSpeed(e.clientX, e.clientY, e.timeStamp);

  // Give stars a little "kick" on click
  cleanedUserSpeed = Math.min(cleanedUserSpeed + 0.8, 3);
});

// Touch start (mobile pointer)
window.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (!t) return;

  attractionValue = -2; // strongly repulsive on finger down

  // Prevent an initial huge speed spike
  lastX = t.clientX;
  lastY = t.clientY;
  lastTime = e.timeStamp;

  updateSpeed(t.clientX, t.clientY, e.timeStamp);

  // Same "kick" behavior as mouse
  cleanedUserSpeed = Math.min(cleanedUserSpeed + 0.8, 3);
});

// Touch move (mobile pointer)
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});

/*==============================*
 *  PAGE TRANSITIONS & STORAGE
 *==============================*/

function applyLockedLayout() {
  const html = document.documentElement;
  const body = document.body;
  const tc = document.getElementById('transitionContainer');

  html.style.overflowY = 'hidden';
  body.style.height = '100dvmin';
  tc.style.overflowY = 'auto';
}

function applyFreeLayout() {
  const html = document.documentElement;
  const body = document.body;
  const tc = document.getElementById('transitionContainer');

  html.style.overflowY = 'auto';
  body.style.height = 'auto';
  tc.style.overflowY = 'visible';
}

// Navigate with slide-out and stored constellation state
function transitionTo(url, isMenu = false) {
  if (isTransitioning) return;
  isTransitioning = true;

applyFreeLayout();
  if (isMenu) {
    sessionStorage.setItem('suppressHomeBack', '1');
  } else {
    sessionStorage.removeItem('suppressHomeBack');
  }

  const page = document.getElementById('transitionContainer');

  if (url === 'back') {
    const stored = localStorage.getItem('homepageBackUrl');
    if (!stored) {
      isTransitioning = false;
      return;
    }
    url = stored;
  }

  if (!page) {
    window.location.href = url;
    return;
  }

  // Freeze & save constellation for the next page
  freezeConstellation = true;
  saveStarsToStorage();

  // Trigger CSS slide-out
  page.classList.add('slide-out');

  const bufferMs = 50;

  setTimeout(() => {
    window.location.href = url;
  }, slideDurationMs + bufferMs);
}

// Save stars and related meta to localStorage
function saveStarsToStorage() {
  try {
    localStorage.setItem('constellationStars', JSON.stringify(stars));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width,
        height,
        scaleFactor,
        attractionValue,
        cleanedUserSpeed,
        smoothSpeed,
        pointerSpeed
      })
    );
  } catch (err) {
    console.warn('Could not save stars:', err);
  }
}

// Failsafe: save stars on normal page unload
window.addEventListener('beforeunload', () => {
  saveStarsToStorage();
});

/*==============================*
 *  INITIALIZATION
 *==============================*/

// Initial canvas setup + stars + animation loop
resizeCanvas();
initStars();
animate();

// Keep canvas synced with viewport size
window.addEventListener('resize', resizeCanvas);
