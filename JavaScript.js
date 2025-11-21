/*---------------------------*/
/* Cliche Constellation Code */
/*---------------------------*/

const canvas = document.getElementById('constellation-bg');
const brush = canvas.getContext('2d');
const stars = [];

//defined in rescaleCanvas() to remove redundancy
let width = 0;
let height = 0;
let scaleFactor = 0;
let maxStarCount = 0;
let maxLinkDistance = 0;
let cleanedUserSpeed = 0;

/* Stars */

function createStars() {
  for (let i = 0; i < maxStarCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-.25, .25),
      vy: randomBetween(-.25, .25),
      size: randomBetween(1, scaleFactor/400),
      opacity: randomBetween(.005, 2),
      redValue: randomBetween(0, 150),
      whiteValue: 0
    });
  }
}

function moveStars() {
  const speedFactor = cleanedUserSpeed + 1;
  for (const star of stars) {
    star.x += star.vx * speedFactor;
    star.y += star.vy * speedFactor;

    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }
    //decay the constelation speed smoothly
    cleanedUserSpeed *= 0.95;
}

function drawStarsWithLines() {
  brush.clearRect(0, 0, width, height);
   
  //determine the lines
  brush.lineWidth = 1;
  brush.strokeStyle = 'rgba(0, 0, 0, 1)';
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
        brush.globalAlpha = alpha;
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
    
    //thinkle the stars
    {
      //return color from white stars
      if(star.whiteValue > 0){
        star.whiteValue -= .02;
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
        star.opacity-=.005;
      }
      //if the star is no longer visible, keep it hidden for a while
      else{
        star.opacity -= .0001;
      }
    }
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
  moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/* On Page Load */

resizeCanvas();
createStars();
animate();
window.addEventListener('resize', () => {
  resizeCanvas();
});

/*-----------------------------------------*/
/* Increase Constelation Speed With Cursor */
/*-----------------------------------------*/

let lastX = 0, lastY = 0, lastTime = 0;
let pointerSpeed = 0;
let smoothSpeed = 0;

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
  updateSpeed(e.clientX, e.clientY, e.timeStamp);
});

/* Touch Speed Tracking (Mobile) */
window.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});