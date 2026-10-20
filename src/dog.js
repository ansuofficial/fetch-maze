// The goal: an orange toy ball with two seams, shaded so it looks round.
function drawBall(x, y, r) {
  const g = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
  g.addColorStop(0, mix(ORANGE, CARD, .45)); g.addColorStop(.45, C.orange); g.addColorStop(1, mix(ORANGE, INK, .2));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.strokeStyle = rgba(CARD, .85); ctx.lineWidth = Math.max(.8, r * .14);
  ctx.beginPath(); ctx.arc(x - r * 1.25, y, r * .95, -.9, .9); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 1.25, y, r * .95, Math.PI - .9, Math.PI + .9); ctx.stroke();
  ctx.restore();
}

/* ---------- The dog ---------- */
// A golden dog seen from the side, drawn facing right about 100 units long with its paws near y = 30.
// It is drawn in code so it stays sharp at every size, and it walks, wags, blinks, turns and leans.
const DOG = {};
function setupDog() {
  const coat = rgb(tok("dog-coat")), light = rgb(tok("dog-light")), dark = rgb(tok("dog-dark")), deep = rgb(tok("dog-deep"));
  const lin = (y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  DOG.body = lin(-18, 10, [[0, mix(coat, light, .3)], [.5, mix(coat, light, 0)], [1, mix(coat, dark, .55)]]);
  DOG.head = lin(-42, -20, [[0, mix(coat, light, .28)], [1, mix(coat, dark, .12)]]);
  DOG.muzzle = lin(-36, -23, [[0, mix(light, coat, .15)], [1, mix(light, coat, .55)]]);
  DOG.chest = lin(-10, 10, [[0, mix(light, coat, .5)], [1, mix(light, coat, .2)]]);
  DOG.ear = lin(-40, -20, [[0, mix(dark, coat, .25)], [1, mix(dark, deep, .45)]]);
  DOG.legNear = lin(-4, 31, [[0, mix(coat, dark, .1)], [1, mix(coat, dark, .45)]]);
  DOG.legFar = lin(-4, 31, [[0, mix(dark, deep, .2)], [1, mix(deep, dark, .2)]]);
  DOG.tail = lin(-38, -8, [[0, mix(coat, light, .25)], [1, mix(coat, dark, .25)]]);
  DOG.paw = mix(coat, light, .45);
  DOG.pawFar = mix(dark, deep, .3);
  DOG.ink = tok("dog-ink"); DOG.inkRgb = rgb(DOG.ink);
  DOG.tag = tok("dog-tag"); DOG.edge = tok("dog-edge"); DOG.inner = tok("dog-inner");
}

// o: { x, y, size, face, tilt, gait, walk, wag, blink, hop, hold }
function drawDog(o) {
  const s = o.size / 100, w = o.walk, A = .44 * w, L = 3.4 * w;
  const out = Math.max(1.3, 1.5 / s);   // outline width in dog units, never under about 1.5 screen pixels
  const fine = Math.max(.9, .7 / s);    // thin face lines
  const bob = 1.3 * w * (1 - Math.cos(2 * o.gait)) / 2;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.save();   // the shadow stays on the ground while the dog hops
  ctx.scale(s, s);
  const sh = 1 - Math.min(.45, o.hop / 34);
  ctx.fillStyle = C.shadowInk;
  ctx.beginPath(); ctx.ellipse(o.face * -6, 35.5, 31 * sh, 4.4 * sh, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.rotate(o.tilt);
  ctx.scale(o.face * s, s);
  ctx.translate(-4, 5 - o.hop - bob);   // put the dog's visual middle on its anchor

  // Legs swing in diagonal pairs, and each paw lifts as it comes forward
  const leg = (jx, jy, kx, ky, px, py, phase) => {
    const th = A * Math.sin(o.gait + phase), lift = Math.max(0, -Math.cos(o.gait + phase)) * L;
    const cs = Math.cos(th), sn = Math.sin(th);
    const r = (x, y) => [jx + (x - jx) * cs - (y - jy) * sn, jy + (x - jx) * sn + (y - jy) * cs];
    const k = r(kx, ky), p = r(px, py);
    return [[jx, jy], [k[0], k[1] - lift * .5], [p[0], p[1] - lift]];
  };
  const legs = {
    farFront: leg(9, -3, 10.5, 13, 10, 28.6, Math.PI),
    farHind: leg(-27, -4, -31, 15.5, -27.5, 28.6, 0),
    nearFront: leg(15, -3, 16.5, 13, 16, 28.6, 0),
    nearHind: leg(-22, -4, -26, 15.5, -22.5, 28.6, Math.PI)
  };
  const strokeLeg = (pts, wTop, wLow, style) => {
    ctx.strokeStyle = style; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = wTop; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
    ctx.lineWidth = wLow; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.stroke();
  };
  const paw = (p, style, grow = 0) => {
    ctx.fillStyle = style;
    ctx.beginPath(); ctx.ellipse(p[0] + 1.6, p[1] + .7, 4.3 + grow, 2.5 + grow, 0, 0, TAU); ctx.fill();
  };
  const tailPath = () => {
    ctx.save();
    ctx.translate(-30, -10); ctx.rotate(o.wag); ctx.translate(30, 10);
    ctx.beginPath();
    ctx.moveTo(-28.5, -14);
    ctx.bezierCurveTo(-34.5, -18, -40.5, -24.5, -43, -34);
    ctx.bezierCurveTo(-44, -38.5, -40.5, -39.5, -39.2, -35.5);
    ctx.bezierCurveTo(-37.2, -28, -35, -20, -29, -6.5);
    ctx.closePath();
    ctx.restore();
  };
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(-31, -9);
    ctx.bezierCurveTo(-27, -17.5, -12, -17.5, 4, -16.5);
    ctx.bezierCurveTo(14, -16, 21, -16.5, 25, -8.5);
    ctx.bezierCurveTo(28.5, -1, 24.5, 8.5, 14.5, 9);
    ctx.bezierCurveTo(5.5, 9.5, -5, 5, -13, 4);
    ctx.bezierCurveTo(-23, 3.5, -33, 2.5, -33.5, -4);
    ctx.bezierCurveTo(-33.5, -6.5, -32.5, -8.3, -31, -9);
    ctx.closePath();
  };
  const hy = .9 * w * Math.sin(2 * o.gait + .7) - 4.5;   // the head nods a little while walking
  const neckPath = () => {
    ctx.beginPath();
    ctx.moveTo(12, -14);
    ctx.bezierCurveTo(16, -22, 21.5, hy - 27, 27, hy - 31.5);
    ctx.lineTo(38, hy - 23);
    ctx.bezierCurveTo(33.5, hy - 14, 30.5, -9, 27, -1);
    ctx.closePath();
  };
  const headPath = () => { ctx.beginPath(); ctx.ellipse(33, hy - 27.5, 10.8, 9.8, -.12, 0, TAU); };
  const muzzlePath = () => {
    ctx.beginPath();
    ctx.moveTo(35.5, hy - 31.5);
    ctx.bezierCurveTo(42, hy - 32, 48.5, hy - 30, 51, hy - 26.5);
    ctx.bezierCurveTo(52.6, hy - 23.4, 51.5, hy - 19.8, 47.8, hy - 19.2);
    ctx.bezierCurveTo(44, hy - 18.6, 39.5, hy - 18.6, 36, hy - 20.8);
    ctx.closePath();
  };
  const sway = .08 * w * Math.sin(2 * o.gait) + .05 * Math.sin(o.wag * 2);
  const earPath = () => {
    ctx.save();
    ctx.translate(28.5, hy - 34); ctx.rotate(sway); ctx.translate(-28.5, -(hy - 34));
    ctx.beginPath();
    ctx.moveTo(28.5, hy - 35);
    ctx.bezierCurveTo(33.5, hy - 36.5, 35.5, hy - 31, 34, hy - 25);
    ctx.bezierCurveTo(33, hy - 20, 31, hy - 16.2, 27.8, hy - 15.8);
    ctx.bezierCurveTo(24.6, hy - 15.6, 23.4, hy - 20, 23.9, hy - 25);
    ctx.bezierCurveTo(24.4, hy - 30.5, 25.4, hy - 34, 28.5, hy - 35);
    ctx.closePath();
    ctx.restore();
  };

  // 1. One outline around the whole dog, so it reads on the warm-white board at any size
  ctx.strokeStyle = DOG.edge; ctx.lineWidth = out * 2; ctx.lineJoin = "round";
  [tailPath, bodyPath, neckPath, headPath, muzzlePath, earPath].forEach(p => { p(); ctx.stroke(); });
  Object.values(legs).forEach(pts => { strokeLeg(pts, 8.6 + out * 2, 6.2 + out * 2, DOG.edge); paw(pts[2], DOG.edge, out); });

  // 2. Fur, back to front: far legs, tail, body, near legs, neck and head
  strokeLeg(legs.farHind, 10.5, 6, DOG.legFar); paw(legs.farHind[2], DOG.pawFar);
  strokeLeg(legs.farFront, 8.4, 6, DOG.legFar); paw(legs.farFront[2], DOG.pawFar);
  tailPath(); ctx.fillStyle = DOG.tail; ctx.fill();
  bodyPath(); ctx.fillStyle = DOG.body; ctx.fill();
  ctx.save(); bodyPath(); ctx.clip();   // a lighter chest ruff
  ctx.fillStyle = DOG.chest; ctx.beginPath(); ctx.ellipse(21.5, 1, 8.5, 10, -.3, 0, TAU); ctx.fill();
  ctx.restore();
  strokeLeg(legs.nearHind, 11 + out, 6.3 + out, DOG.inner); strokeLeg(legs.nearHind, 11, 6.3, DOG.legNear); paw(legs.nearHind[2], DOG.paw);
  strokeLeg(legs.nearFront, 8.6 + out, 6.2 + out, DOG.inner); strokeLeg(legs.nearFront, 8.6, 6.2, DOG.legNear); paw(legs.nearFront[2], DOG.paw);
  neckPath(); ctx.fillStyle = DOG.head; ctx.fill();
  headPath(); ctx.fillStyle = DOG.head; ctx.fill();
  muzzlePath(); ctx.fillStyle = DOG.muzzle; ctx.fill();

  // 3. Face: nose, mouth, eye and brow, then the ear over the back of the head
  ctx.fillStyle = DOG.ink;
  ctx.beginPath(); ctx.ellipse(50.4, hy - 25.8, 2.9, 2.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(CARD, .45);
  ctx.beginPath(); ctx.ellipse(49.6, hy - 26.7, 1, .6, -.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(DOG.inkRgb, .5); ctx.lineWidth = fine; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(48.8, hy - 20.6); ctx.quadraticCurveTo(44, hy - 19.2, 40.5, hy - 21.4); ctx.stroke();
  const ey = hy - 29.6;
  ctx.fillStyle = DOG.ink;
  ctx.beginPath(); ctx.ellipse(39.6, ey, 2.2, o.blink ? .35 : 2.4, 0, 0, TAU); ctx.fill();
  if (!o.blink) { ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(40.3, ey - .8, .8, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = DOG.inner; ctx.lineWidth = fine;
  ctx.beginPath(); ctx.moveTo(37.4, ey - 3.6); ctx.quadraticCurveTo(39.6, ey - 4.8, 41.8, ey - 3.4); ctx.stroke();
  earPath(); ctx.strokeStyle = DOG.inner; ctx.lineWidth = out; ctx.stroke(); ctx.fillStyle = DOG.ear; ctx.fill();

  // 4. Collar in the player's color, with a small gold tag
  ctx.strokeStyle = C.collar; ctx.lineWidth = 3.6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(20.5, hy - 19); ctx.quadraticCurveTo(28, hy - 12.5, 34, hy - 11.5); ctx.stroke();
  ctx.fillStyle = DOG.tag; ctx.strokeStyle = DOG.edge; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.arc(31.5, hy - 8.5, 2.2, 0, TAU); ctx.fill(); ctx.stroke();

  if (o.hold) drawBall(53, hy - 19, 6);   // fetched
  ctx.restore();
}
