const canvas = document.getElementById('constellation-bg');
const brush = canvas.getContext('2d');
let stars = [];

 //defined in rescaleCanvas() to remove redundancy
let width = 0;
let height = 0;
let scaleFactor = 0;
let maxStarCount = 0;
let maxLinkDistance = 0;

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
      redValue: randomBetween(0, 150)
    });
  }
}

function moveStars() {
  for (const star of stars) {
    star.x += star.vx;
    star.y += star.vy;

    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }
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
    brush.beginPath();
    brush.fillStyle = `rgba(${star.redValue}, 0, 0, ${star.opacity})`;
    brush.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    brush.fill();
    
    //slowly fade. if its almost gone, then wait a while before reappearing again
    if(star.opacity < 0.005){
      star.opacity = 1;
    }
    else if(star.opacity < 0.02){
      star.opacity -= .0001;
    }
    else{
      star.opacity-=.005;
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
  maxLinkDistance = scaleFactor/20;

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