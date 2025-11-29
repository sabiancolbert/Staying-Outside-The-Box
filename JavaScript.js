/*-------------------*/
/* HTML Elements */
/*--------------------*/

//open & close elements
function toggleElement(x){
  const element = document.getElementById(x);
  element.hidden = !element.hidden;
  }
  
  //reset color of buttons when finger is lifted
  document.addEventListener('touchend', () => {
  document.activeElement?.blur();
});

/*---------------------------*/
/* Cliche Constellation Code */
/*---------------------------*/


const canvas = document.getElementById('constellations');
const brush = canvas.getContext('2d');

let freezeConstellation = false;
let stars = [];
let lastX = 0, lastY = 0, lastTime = 0;
let pointerSpeed = 0;
let smoothSpeed = 0;

//defined in rescaleCanvas() to remove redundancy
let width = 0;
let height = 0;
let scaleFactor = 0;
let maxStarCount = 0;
let maxLinkDistance = 0;
let cleanedUserSpeed = 0;

/* Stars */

function initStars() {
  //if there were stars saved from another page, load those
  const saved = localStorage.getItem('constellationStars');

  if (saved) {
    try {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed) && parsed.length) {
        stars = parsed;

        // Try to scale from old canvas size to this one
        const metaRaw = localStorage.getItem('constellationMeta');
        if (metaRaw) {
          try {
            const meta = JSON.parse(metaRaw);
            if (meta.width > 0 && meta.height > 0) {
              const scaleX = width / meta.width;
              const scaleY = height / meta.height;
              const sizeScale = (width + height) / (meta.width + meta.height);

              for (const star of stars) {
                star.x *= scaleX;
                star.y *= scaleY;
                star.size *= sizeScale;
              }
            }
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
  } else {
    createStars();
  }
}


  //if no save is found, then make stars
function createStars(){
  stars = [];
    for (let i = 0; i < maxStarCount; i++) {
      stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-.25, .25),
      vy: randomBetween(-.25, .25),
      size: randomBetween(3, scaleFactor/400),
      opacity: randomBetween(.005, 1.8),
      fadeSpeed: randomBetween(1,2.1),
      redValue: randomBetween(0, 200),
      whiteValue: 0
    });
    }
}

function moveStars() {
  for (const star of stars) {
    //passive constant star movement
    star.x += star.vx * (cleanedUserSpeed + 1);
    star.y += star.vy * (cleanedUserSpeed + 1);

    //attraction to cursor and touch
    if (lastTime !== 0 && cleanedUserSpeed > 0.19) {
      const dx = lastX - star.x;
      const dy = lastY - star.y;
      const distSq = dx * dx + dy * dy;

      const maxInfluence = 130 * 130;  //~130px influence radius
      if (distSq > 4 && distSq < maxInfluence) {
        const baseForce = 0.008 * cleanedUserSpeed;
        const proximity = (maxInfluence - distSq) / maxInfluence;
        const pull = baseForce * proximity;
        star.x += dx * pull;
        star.y += dy * pull;
      }
      
      //twinkle the stars
    {
      //return color from white stars
      if(star.whiteValue > 0){
        star.whiteValue -= Math.max(0, star.whiteValue * .02);
      }
      //adjust opacity
      if(star.opacity <= 0.005){
        star.opacity = 1;
        //chance to twinkle white 
        if (Math.random() < 0.07) {
          star.whiteValue = 1;
        }
      }
      else if(star.opacity > 0.02){
        star.opacity-=.005 * star.fadeSpeed;
      }
      //if the star is no longer visible, keep it hidden for a while
      else{
        star.opacity -= .0001;
      }
    }
    }

    //wrap stars around the edges
    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }

  //decay constellation speed smoothly
  cleanedUserSpeed *= 0.9;
}

function drawStarsWithLines() {
  brush.clearRect(0, 0, width, height);
   
  //determine the lines
  brush.lineWidth = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const aStar = stars[i];
      const bStar = stars[j];
      const xDistance = aStar.x - bStar.x;
      const yDistance = aStar.y - bStar.y;
      const opacityModifier = (aStar.opacity + bStar.opacity) /2;
      const distance = Math.hypot(xDistance, yDistance);
      
      //if star a and star b aren't too far apart, draw the line
      if (distance < maxLinkDistance) {
        const alpha = (1 - distance / maxLinkDistance) * opacityModifier;
        brush.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        brush.beginPath();
        brush.moveTo(aStar.x, aStar.y);
        brush.lineTo(bStar.x, bStar.y);
        brush.stroke();
      }
    }
  }
  //draw stars
  for (const star of stars) {
    let tempRed = 255 * star.whiteValue + star.redValue;
    if (tempRed > 255){
      tempRed = 255;
    }
    const tempGreen = 255 * star.whiteValue;
    const tempBlue = 255 * star.whiteValue;
    const tempSize = star.whiteValue * 2 + star.size;
    brush.beginPath();
    brush.fillStyle = `rgba(${tempRed}, ${tempGreen}, ${tempBlue}, ${star.opacity})`;
    brush.arc(star.x, star.y, tempSize, 0, Math.PI * 2);
    brush.fill();
    
    
  }
}

/* Functional */

function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  const oldScaleFactor = scaleFactor;

  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  scaleFactor = width+height;
  if(scaleFactor>1500){
    scaleFactor = 1500;
  }
  maxStarCount = scaleFactor/10;
  maxLinkDistance = scaleFactor/10;

  //resize stars, unless the page has just opened
  if (oldWidth != 0) {
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

function animate() {
  if (!freezeConstellation) {
    moveStars();
  }
  drawStarsWithLines();
  requestAnimationFrame(animate);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/* On Page Load */

resizeCanvas();
initStars();
animate();
window.addEventListener('resize', () => {
  resizeCanvas();
});

/* Increase Constelation Speed With Cursor */

function updateSpeed(x, y, time) {
  const dx = x - lastX;
  const dy = y - lastY;
  const dt = time - lastTime;

  if (dt > 0) {
    pointerSpeed = Math.sqrt(dx * dx + dy * dy) / dt; //px per ms
  }

  //smoothing for jitteriness
  smoothSpeed = smoothSpeed * .8 + pointerSpeed * 10;

  //normalize to avoid extreme speeds
  cleanedUserSpeed = Math.min(smoothSpeed, 10);

  lastX = x;
  lastY = y;
  lastTime = time;
}

/* Desktop Cursor Speed Tracking */
window.addEventListener("mousemove", (e) => {
  updateSpeed(e.clientX, e.clientY, 2 * e.timeStamp);
});

/* Touch Speed Tracking (Mobile) */
window.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});

/* Release Attraction */

window.addEventListener("touchend", () => {
  cleanedUserSpeed = 0;
  smoothSpeed = 0;
  pointerSpeed = 0;
});

window.addEventListener("mouseup", () => {
  cleanedUserSpeed = 0;
  smoothSpeed = 0;
  pointerSpeed = 0;
});

/*--------------------------*/
/* Animate Page Transitions */
/*--------------------------*/

window.addEventListener('load', () => {
  const page = document.getElementById('transitionContainer');
  if (!page) return;
  // Use rAF so the browser sees the initial translateY before we add "ready"
  requestAnimationFrame(() => {
    page.classList.add('ready');
  });
});


function transitionTo(url) {
  const page = document.getElementById('transitionContainer');
  if (!page) {
    window.location.href = url;
    return;
  }
  freezeConstellation = true;
  saveStarsToStorage();
  window.scrollTo(0, 0);
  page.classList.add('slide-out');
  const handler = (event) => {
    if (event.propertyName === 'transform') {
      page.removeEventListener('transitionend', handler);
      window.location.href = url;
    }
  };

  page.addEventListener('transitionend', handler);
}

//save the stars
function saveStarsToStorage() {
  try {
    localStorage.setItem('constellationStars', JSON.stringify(stars));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width,
        height,
        scaleFactor
      })
    );
  } catch (err) {
    console.warn('Could not save stars:', err);
  }
}

//failsafe:
window.addEventListener('beforeunload', saveStarsToStorage);