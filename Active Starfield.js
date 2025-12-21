// thank heavens for chatGPT <3

/*==============================================================*
 *                    ACTIVE STARFIELD
 *==============================================================*
 *  Requires Starfield Setup.js loaded first.
 *
 *  Contains:
 *   1) Physics (moveStars)
 *   2) Rendering (drawStarsWithLines)
 *   3) Pointer input (updateSpeed + listeners)
 *==============================================================*/


//#region 1) PHYSICS
/*========================================*
 *  1) PHYSICS (MOVE STARS)
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.moveStars = function moveStars() {
    if (!SF.hasCanvas || !SF.stars.length) return;

    const influenceRange = SF.screenSum * 0.2;
    const influenceRangeSq = influenceRange * influenceRange;
    const wrapDistanceSq = 200 * 200;

    const P = SF.params;
    const POW = SF.scalePow;

    for (const star of SF.stars) {
      const dxToPointer = SF.pointerX - star.x;
      const dyToPointer = SF.pointerY - star.y;

      // squared distance first (cheap)
      const distSq = dxToPointer * dxToPointer + dyToPointer * dyToPointer;

      if (distSq < influenceRangeSq) {
        const dist = Math.sqrt(distSq) + 0.0001;

        const toPointerX = dxToPointer / dist;
        const toPointerY = dyToPointer / dist;

        // Linear falloff gradients
        let attrGrad = 1 - (dist / (((P.attractRadius * 5.2) * POW.attGrad) || 1));
        let repelGrad = 1 - (dist / (((P.repelRadius * 2.8) * POW.repGrad) || 1));

        attrGrad = Math.max(0, attrGrad);
        repelGrad = Math.max(0, repelGrad);

        // Shape curves
        const attrShape = Math.pow(
          attrGrad,
          Math.max(0.1, ((P.attractScale * 0.48) * POW.attShape))
        );

        const repelShape = Math.pow(
          repelGrad,
          Math.max(0.1, (P.repelScale * 0.64))
        );

        const attractForce =
          ((P.attractStrength * 0.006) * POW.att) *
          SF.pointerSpeed *
          attrShape;

        const repelForce =
          ((P.repelStrength * 0.0182) * POW.rep) *
          SF.pointerSpeed *
          repelShape;

        // Attraction
        star.momentumX += attractForce * toPointerX;
        star.momentumY += attractForce * toPointerY;

        // Repulsion
        star.momentumX += repelForce * -toPointerX;
        star.momentumY += repelForce * -toPointerY; // ✅ typo fixed

        // Poke impulse (repel-shaped)
        const pokeForce = (0.01 * P.pokeStrength) * SF.pokeTimer * repelShape;
        star.momentumX += pokeForce * -toPointerX;
        star.momentumY += pokeForce * -toPointerY;
      }

      // Baseline drift boosted by interaction
      star.momentumX += star.vx * Math.min(10, 0.05 * SF.pointerSpeed);
      star.momentumY += star.vy * Math.min(10, 0.05 * SF.pointerSpeed);

      // Clamp force magnitude
      let fx = star.momentumX;
      let fy = star.momentumY;

      const limit = P.clamp * (SF.scaleToScreen ** 2);
      const mag = Math.sqrt(fx * fx + fy * fy);

      if (mag > limit) {
        const scale = limit / mag;
        fx *= scale;
        fy *= scale;
      }

      // Integrate
      star.x += star.vx + fx;
      star.y += star.vy + fy;

      // Friction
      star.momentumX *= 0.98;
      star.momentumY *= 0.98;

      // Wrap vs bounce
      if (SF.ringTimer === 0 || distSq > wrapDistanceSq || SF.pokeTimer > 1000) {
        const r = (star.whiteValue * 2 + star.size) || 0;

        if (star.x < -r) star.x = SF.w + r;
        else if (star.x > SF.w + r) star.x = -r;

        if (star.y < -r) star.y = SF.h + r;
        else if (star.y > SF.h + r) star.y = -r;
      } else {
        const r = (star.whiteValue * 2 + star.size) || 0;

        if (star.x < r) { star.x = 2 * r - star.x; star.momentumX = -star.momentumX; }
        else if (star.x > SF.w - r) { star.x = 2 * (SF.w - r) - star.x; star.momentumX = -star.momentumX; }

        if (star.y < r) { star.y = 2 * r - star.y; star.momentumY = -star.momentumY; }
        else if (star.y > SF.h - r) { star.y = 2 * (SF.h - r) - star.y; star.momentumY = -star.momentumY; }
      }

      // Flash decay
      if (star.whiteValue > 0) {
        star.whiteValue *= 0.98;
        if (star.whiteValue < 0.001) star.whiteValue = 0;
      }

      // Opacity cycle
      if (star.opacity <= 0.005) {
        star.opacity = 1;
        if (Math.random() < 0.07) star.whiteValue = 1;
      } else if (star.opacity > 0.02) {
        star.opacity -= 0.005 * star.fadeSpeed;
      } else {
        star.opacity -= 0.0001;
      }
    }

    // Global decay
    SF.pointerSpeed *= 0.5;
    if (SF.pointerSpeed < 0.001) SF.pointerSpeed = 0;

    // Ring behavior (grow then fade with ringTimer, no extra kill-switch logic)
    SF.ringTimer *= 0.9;
    if (SF.ringTimer < 0.1) SF.ringTimer = 0;

    if (SF.ringTimer < 1) {
      SF.ringSize = 0;
    } else if (SF.ringSize < 1) {
      SF.ringSize += 0.05;
      if (SF.ringSize > 1) SF.ringSize = 1;
    }

    SF.pokeTimer *= 0.85;
    if (SF.pokeTimer < 1) SF.pokeTimer = 0;

    // Debug readouts
    if (SF.debug.enabled) {
      const dbgCircle = document.getElementById("dbgCircle");
      if (dbgCircle) dbgCircle.textContent = SF.ringTimer.toFixed(3);

      const dbgSpeed = document.getElementById("dbgSpeed");
      if (dbgSpeed) dbgSpeed.textContent = SF.pointerSpeed.toFixed(3);

      const dbgPoke = document.getElementById("dbgPoke");
      if (dbgPoke) dbgPoke.textContent = SF.pokeTimer.toFixed(1);
    }
  };
})();

/* #endregion 1) PHYSICS */



//#region 2) RENDERING
/*========================================*
 *  2) RENDERING (STARS + LINKS + RING)
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  const LINK_BUCKETS = 18;
  let linkPaths = Array.from({ length: LINK_BUCKETS }, () => new Path2D());

  function resetLinkPaths() {
    for (let i = 0; i < LINK_BUCKETS; i++) linkPaths[i] = new Path2D();
  }

  SF.drawStarsWithLines = function drawStarsWithLines() {
    if (!SF.hasCanvas || !SF.brush) return;

    const BR = SF.brush;
    BR.clearRect(0, 0, SF.w, SF.h);

    // Pointer ring
    const goalRadius = Math.max(0, SF.scaleToScreen * 100 - 40);
    const ringRadius = goalRadius * SF.ringSize;
    const ringWidth = SF.ringTimer * 0.15 + 1.5;
    const ringAlpha = Math.min(SF.ringTimer * 0.07, 1);

    if (SF.pointerTime > 0 && ringAlpha > 0.001) {
      BR.save();
      BR.lineWidth = ringWidth;
      BR.strokeStyle = "rgba(189, 189, 189, 1)";
      BR.globalAlpha = ringAlpha;

      BR.beginPath();
      BR.arc(SF.pointerX, SF.pointerY, ringRadius, 0, Math.PI * 2);
      BR.stroke();
      BR.restore();
    }

    // Links
    BR.lineWidth = 1;

    const count = SF.stars.length;
    if (count) {
      for (let i = 0; i < count; i++) SF.stars[i].edge = SF.edgeFactor(SF.stars[i]);

      const distScale = SF.screenSum / 1100;
      const cutoffRaw = SF.maxLinkDist / distScale;
      const cutoffSq = cutoffRaw * cutoffRaw;

      resetLinkPaths();

      for (let a = 0; a < count; a++) {
        const A = SF.stars[a];
        const ax = A.x, ay = A.y;
        const aOp = A.opacity;
        const aEdge = A.edge;

        for (let b = a + 1; b < count; b++) {
          const B = SF.stars[b];

          const dx = ax - B.x;
          const dy = ay - B.y;
          const dSq = dx * dx + dy * dy;

          if (dSq > cutoffSq) continue;

          const dist = Math.sqrt(dSq) * distScale;

          let alpha = (1 - dist / SF.maxLinkDist) * ((aOp + B.opacity) / 2);
          alpha *= Math.min(aEdge, B.edge);

          if (alpha <= 0.002) continue;

          let bucket = (alpha * (LINK_BUCKETS - 1)) | 0;
          if (bucket < 0) bucket = 0;
          if (bucket >= LINK_BUCKETS) bucket = LINK_BUCKETS - 1;

          linkPaths[bucket].moveTo(ax, ay);
          linkPaths[bucket].lineTo(B.x, B.y);
        }
      }

      for (let i = 0; i < LINK_BUCKETS; i++) {
        const bucketAlpha = (i + 1) / LINK_BUCKETS;
        BR.strokeStyle = `rgba(100, 100, 100, ${bucketAlpha})`;
        BR.stroke(linkPaths[i]);
      }
    }

    // Star bodies
    for (const star of SF.stars) {
      let tempRed = 255 * star.whiteValue + star.redValue;
      if (tempRed > 255) tempRed = 255;

      BR.beginPath();
      BR.fillStyle = `rgba(${tempRed}, ${255 * star.whiteValue}, ${255 * star.whiteValue}, ${star.opacity})`;
      BR.arc(star.x, star.y, star.whiteValue * 2 + star.size, 0, Math.PI * 2);
      BR.fill();
    }
  };

  SF.forceRedraw = function forceRedraw() {
    if (!SF.brush || !SF.canvas) return;
    SF.drawStarsWithLines();
  };
})();

/* #endregion 2) RENDERING */



//#region 3) POINTER INPUT
/*========================================*
 *  3) POINTER INPUT
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.updateSpeed = function (x, y) {
    const time = SF.nowMS();
    const dt = Math.max(1, time - SF.pointerTime);
  
    const dx = x - SF.pointerX;
    const dy = y - SF.pointerY;
  
    const rawSpeed = Math.sqrt(dx*dx + dy*dy) / dt;
    SF.pointerSpeed = Math.min(rawSpeed * 50, 50);
    SF.ringTimer = Math.max(SF.ringTimer, SF.pointerSpeed);
    
    SF.pointerX = x;
    SF.pointerY = y;
    SF.pointerTime = time;
  };

  SF.startPointerInteraction = function startPointerInteraction(x, y) {
    SF.pokeTimer = 500;
    SF.updateSpeed(x, y);
  };

  // Mouse
  window.addEventListener("mousemove", (e) => SF.updateSpeed(e.clientX, e.clientY));
  window.addEventListener("mousedown", (e) => SF.startPointerInteraction(e.clientX, e.clientY));

  // Touch
  window.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    if (!t) return;
    SF.startPointerInteraction(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (!t) return;
    SF.updateSpeed(t.clientX, t.clientY);
  }, { passive: true });
})();

/* #endregion 3) POINTER INPUT */