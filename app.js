"use strict";

const home = document.getElementById("home");
const reader = document.getElementById("reader");
const stage = document.getElementById("stage");
const topicInput = document.getElementById("topic");

const DRAFT_KEY = "story-time-draft";
const pages = window.SAMPLE_STORY.pages;

const view = { spread: false, w: 0, h: 0, pageW: 0, index: 0 };
let turn = null;
let animating = false;
let pointer = null;

/* דף הפתיחה */

try {
  topicInput.value = localStorage.getItem(DRAFT_KEY) || "";
} catch {}

topicInput.addEventListener("input", () => {
  try {
    localStorage.setItem(DRAFT_KEY, topicInput.value);
  } catch {}
});

document.getElementById("topic-form").addEventListener("submit", (event) => {
  event.preventDefault();
  history.pushState({ reading: true }, "", "#book");
  openBook();
});

document.getElementById("home-btn").addEventListener("click", () => {
  if (history.state && history.state.reading) {
    history.back();
  } else {
    history.replaceState(null, "", location.pathname);
    closeBook();
  }
});
window.addEventListener("popstate", syncRoute);

function syncRoute() {
  if (location.hash === "#book") openBook();
  else closeBook();
}

function openBook() {
  home.hidden = true;
  reader.hidden = false;
  document.getElementById("theme-color").content = "#ffffff";
  view.index = 0;
  layout();
}

function closeBook() {
  reader.hidden = true;
  home.hidden = false;
  document.getElementById("theme-color").content = "#2bb3ff";
  cancelTurn();
}

/* הירח: ממצמץ, מביט באצבע, ומסתכל על הדף ושמח כשכותבים */

const moon = document.getElementById("moon");
const moonHop = document.getElementById("moon-hop");
const pupils = [...moon.querySelectorAll(".pupil")];
const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let smileTimer;
let glanceTimer;
let lastHop = 0;

function lookAt(x, y) {
  pupils.forEach((pupil) => {
    pupil.style.transform = `translate(${x}px, ${y}px)`;
  });
}

function lookToward(clientX, clientY) {
  const box = moon.getBoundingClientRect();
  const dx = clientX - (box.left + box.width / 2);
  const dy = clientY - (box.top + box.height * 0.38);
  const span = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, span / 120) * 8;
  lookAt((dx / span) * reach, (dy / span) * reach);
}

function blink() {
  if (home.hidden || stillMotion.matches) return;
  moon.classList.add("blink");
  setTimeout(() => moon.classList.remove("blink"), 130);
}

function scheduleBlink() {
  setTimeout(() => {
    blink();
    scheduleBlink();
  }, 2400 + Math.random() * 3400);
}

function scheduleGlance() {
  clearTimeout(glanceTimer);
  glanceTimer = setTimeout(() => {
    if (!home.hidden && !stillMotion.matches && document.activeElement !== topicInput) {
      lookAt((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8);
    }
    scheduleGlance();
  }, 2800 + Math.random() * 2600);
}

function cheer() {
  moon.classList.add("happy");
  clearTimeout(smileTimer);
  smileTimer = setTimeout(() => moon.classList.remove("happy"), 1100);
  const now = performance.now();
  if (stillMotion.matches || now - lastHop < 320) return;
  lastHop = now;
  moonHop.animate(
    [{ transform: "translateY(0)" }, { transform: "translateY(-16px)" }, { transform: "translateY(0)" }],
    { duration: 300, easing: "ease-out" },
  );
}

topicInput.addEventListener("focus", () => lookAt(0, 8));
topicInput.addEventListener("input", () => {
  lookAt(0, 8);
  cheer();
});

home.addEventListener("pointermove", (event) => {
  if (document.activeElement === topicInput) return;
  lookToward(event.clientX, event.clientY);
  scheduleGlance();
});

home.addEventListener("pointerdown", (event) => {
  lookToward(event.clientX, event.clientY);
  scheduleGlance();
});

scheduleBlink();
scheduleGlance();

/* פריסה: אייפד בכפולה, טלפון בעמוד אחד */

function layout() {
  if (reader.hidden) return;
  cancelTurn();
  view.w = stage.clientWidth;
  view.h = stage.clientHeight;
  view.spread = Math.min(view.w, view.h) >= 600;
  view.pageW = view.spread ? view.w / 2 : view.w;
  if (view.spread) view.index -= view.index % 2;
  fitText();
  renderStatic();
}

function fitText() {
  const probe = document.createElement("div");
  probe.className = "layer measure";
  stage.append(probe);
  const largest = Math.min(view.pageW * (view.spread ? 0.078 : 0.098), 48);
  let size = Math.floor(largest);
  for (; size > 18; size--) {
    stage.style.setProperty("--fs", `${size}px`);
    if (pages.every((_, i) => pageFits(probe, i))) break;
  }
  probe.remove();
}

function pageFits(probe, i) {
  probe.replaceChildren(makePage(i, 0));
  const el = probe.firstElementChild;
  return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
}

function makePage(i, x) {
  const el = document.createElement("div");
  el.className = "page";
  el.style.left = `${x}px`;
  el.style.width = `${view.pageW}px`;
  el.style.height = `${view.h}px`;
  const page = pages[i];
  if (!page) return el;
  if (page.kind) el.classList.add(page.kind);
  for (const line of page.lines) {
    const p = document.createElement("p");
    line.split("**").forEach((part, n) => {
      if (n % 2) {
        const strong = document.createElement("strong");
        strong.textContent = part;
        p.append(strong);
      } else {
        p.append(part);
      }
    });
    el.append(p);
  }
  if (page.folio) {
    const folio = document.createElement("div");
    folio.className = "folio";
    folio.textContent = page.folio;
    el.append(folio);
  }
  return el;
}

function makeLayer(...children) {
  const layer = document.createElement("div");
  layer.className = "layer";
  layer.append(...children);
  return layer;
}

function spineEl() {
  const spine = document.createElement("div");
  spine.className = "spine";
  spine.style.left = `${view.pageW}px`;
  return spine;
}

function cornerEl(name) {
  const corner = document.createElement("div");
  corner.className = `corner ${name}`;
  return corner;
}

function renderStatic() {
  const { spread, pageW, index } = view;
  const parts = spread
    ? [makePage(index, pageW), makePage(index + 1, 0), spineEl()]
    : [makePage(index, 0)];
  if (canTurn(1)) parts.push(cornerEl("bl"), cornerEl("tl"));
  if (canTurn(-1)) parts.push(cornerEl("br"), cornerEl("tr"));
  stage.replaceChildren(makeLayer(...parts));
}

function canTurn(dir) {
  const step = view.spread ? 2 : 1;
  const next = view.index + dir * step;
  return next >= 0 && next < pages.length;
}

/* קיפול הדף.
   הדף מסתובב סביב השדרה, וקו הקיפול הוא האנך האמצעי בין הפינה המקורית לאצבע. */

function beginTurn(dir, cornerY) {
  if (!canTurn(dir)) return false;
  const { spread, pageW, w, h, index } = view;
  const hinge = pageW;
  let t;
  if (spread && dir > 0) {
    t = {
      rect: [0, pageW], corner: { x: 0, y: cornerY },
      from: { x: 0, y: cornerY }, to: { x: w, y: cornerY },
      base: [makePage(index, pageW), makePage(index + 3, 0)],
      front: makePage(index + 1, 0), back: makePage(index + 2, pageW),
    };
  } else if (spread) {
    t = {
      rect: [pageW, w], corner: { x: w, y: cornerY },
      from: { x: w, y: cornerY }, to: { x: 0, y: cornerY },
      base: [makePage(index - 2, pageW), makePage(index + 1, 0)],
      front: makePage(index, pageW), back: makePage(index - 1, 0),
    };
  } else if (dir > 0) {
    t = {
      rect: [0, pageW], corner: { x: 0, y: cornerY },
      from: { x: 0, y: cornerY }, to: { x: 2 * pageW, y: cornerY },
      base: [makePage(index + 1, 0)],
      front: makePage(index, 0), back: makePage(-1, pageW),
    };
  } else {
    t = {
      rect: [0, pageW], corner: { x: 0, y: cornerY },
      from: { x: 2 * pageW, y: cornerY }, to: { x: 0, y: cornerY },
      base: [makePage(index, 0)],
      front: makePage(index - 1, 0), back: makePage(-1, pageW),
    };
  }
  t.dir = dir;
  t.hinge = hinge;
  t.h = h;
  t.reachNear = dist(t.corner, { x: hinge, y: cornerY });
  t.reachFar = dist(t.corner, { x: hinge, y: h - cornerY });

  t.baseShade = shade("on-base");
  t.frontShade = shade("on-front");
  t.backShade = shade("on-back");
  t.front.append(t.frontShade);
  const backHolder = document.createElement("div");
  backHolder.append(t.back, t.backShade);

  t.baseLayer = makeLayer(...t.base);
  if (spread) t.baseLayer.append(spineEl());
  t.castLayer = makeLayer(t.baseShade);
  t.frontLayer = makeLayer(t.front);
  if (spread) t.frontLayer.append(spineEl());
  t.backLayer = makeLayer(backHolder);
  t.frontLayer.style.willChange = "clip-path";
  t.backLayer.style.willChange = "transform, clip-path";
  stage.replaceChildren(t.baseLayer, t.castLayer, t.frontLayer, t.backLayer);
  turn = t;
  drawTurn(t.from);
  return true;
}

function shade(kind) {
  const el = document.createElement("div");
  el.className = `fold-shade ${kind}`;
  return el;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* הדף מחובר לשדרה, לכן הפינה לא יכולה להתרחק ממנה יותר מאורך הדף */
function clampToPaper(p) {
  const { corner, hinge, reachNear, reachFar, h } = turn;
  const near = { x: hinge, y: corner.y };
  const far = { x: hinge, y: h - corner.y };
  let q = { ...p };
  for (let i = 0; i < 3; i++) {
    q = pullInside(q, near, reachNear);
    q = pullInside(q, far, reachFar);
  }
  return q;
}

function pullInside(p, center, radius) {
  const d = dist(p, center);
  if (d <= radius) return p;
  const k = radius / d;
  return { x: center.x + (p.x - center.x) * k, y: center.y + (p.y - center.y) * k };
}

function clipPolygon(points, keep) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const da = keep(a);
    const db = keep(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function toClipPath(points) {
  if (points.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return `polygon(${points.map((p) => `${p.x}px ${p.y}px`).join(",")})`;
}

function placeShade(el, origin, towards, length) {
  /* ציר ה-y של הפס מצביע לכיוון שאליו הצל דועך */
  const along = { x: towards.y, y: -towards.x };
  const angle = Math.atan2(along.y, along.x);
  el.style.width = `${2 * length}px`;
  el.style.left = `${origin.x - along.x * length}px`;
  el.style.top = `${origin.y - along.y * length}px`;
  el.style.transform = `rotate(${angle}rad)`;
}

function drawTurn(target) {
  const t = turn;
  const p = clampToPaper(target);
  t.point = p;
  const [x0, x1] = t.rect;
  const leaf = [
    { x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: t.h }, { x: x0, y: t.h },
  ];
  const span = dist(t.corner, p);
  if (span < 1) {
    t.frontLayer.style.clipPath = "none";
    t.backLayer.style.visibility = "hidden";
    t.castLayer.style.visibility = "hidden";
    t.frontShade.style.visibility = "hidden";
    return;
  }
  t.backLayer.style.visibility = "visible";
  t.castLayer.style.visibility = "visible";
  t.frontShade.style.visibility = "visible";

  const n = { x: (p.x - t.corner.x) / span, y: (p.y - t.corner.y) / span };
  const m = { x: (p.x + t.corner.x) / 2, y: (p.y + t.corner.y) / 2 };
  const side = (q) => (q.x - m.x) * n.x + (q.y - m.y) * n.y;

  const stay = clipPolygon(leaf, side);
  const flap = clipPolygon(leaf, (q) => -side(q));
  t.frontLayer.style.clipPath = toClipPath(stay);

  /* הגב של הדף: שיקוף סביב השדרה ואז סביב קו הקיפול, שביחד הם סיבוב והזזה */
  const s = t.hinge;
  const l11 = 1 - 2 * n.x * n.x;
  const l12 = -2 * n.x * n.y;
  const l22 = 1 - 2 * n.y * n.y;
  const offset = 2 * (m.x * n.x + m.y * n.y);
  const a = -l11;
  const b = -l12;
  const c = l12;
  const d = l22;
  const e = l11 * 2 * s + offset * n.x;
  const f = l12 * 2 * s + offset * n.y;
  t.backLayer.style.transform = `matrix(${a},${b},${c},${d},${e},${f})`;
  t.backLayer.style.clipPath = toClipPath(flap.map((q) => ({ x: 2 * s - q.x, y: q.y })));

  const length = Math.hypot(view.w, view.h);
  const reach = Math.min(90, 20 + span * 0.28);
  const fade = reach / 90;
  t.frontShade.style.opacity = fade;
  t.backShade.style.opacity = fade;
  t.baseShade.style.opacity = fade;

  /* הצל על הדף שנשאר מחושב בקואורדינטות של הדף עצמו */
  const frontBox = t.front.offsetLeft;
  placeShade(t.frontShade, { x: m.x - frontBox, y: m.y }, n, length);
  placeShade(t.backShade, { x: 2 * s - m.x, y: m.y }, { x: n.x, y: -n.y }, length);
  placeShade(t.baseShade, m, { x: -n.x, y: -n.y }, length);
  t.castLayer.style.clipPath = toClipPath(leaf);
}

function finishTurn(completed) {
  const dir = turn.dir;
  turn = null;
  if (completed) view.index += dir * (view.spread ? 2 : 1);
  renderStatic();
}

function cancelTurn() {
  turn = null;
  animating = false;
  pointer = null;
}

function animateTo(goal, duration, lift, onDone) {
  animating = true;
  const t = turn;
  const start = t.point || t.from;
  const startTime = performance.now();
  const towardMiddle = t.corner.y === 0 ? 1 : -1;
  const step = (now) => {
    if (turn !== t) return;
    const k = Math.min(1, (now - startTime) / duration);
    const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    drawTurn({
      x: start.x + (goal.x - start.x) * eased,
      y: start.y + (goal.y - start.y) * eased + towardMiddle * lift * Math.sin(Math.PI * k),
    });
    if (k < 1) {
      requestAnimationFrame(step);
    } else {
      animating = false;
      onDone();
    }
  };
  requestAnimationFrame(step);
}

function autoTurn(dir, cornerY) {
  if (animating || turn || !beginTurn(dir, cornerY)) return;
  animateTo(turn.to, 620, view.h * 0.14, () => finishTurn(true));
}

/* מחוות: גרירה ימינה קדימה וגרירה שמאלה אחורה, כמו בספר בעברית */

stage.addEventListener("pointerdown", (event) => {
  if (animating || turn) return;
  stage.setPointerCapture(event.pointerId);
  pointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTime: performance.now(),
    lastX: event.clientX,
    lastTime: performance.now(),
    velocity: 0,
    dragging: false,
  };
});

stage.addEventListener("pointermove", (event) => {
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.startX;
  const dy = event.clientY - pointer.startY;
  if (!pointer.dragging) {
    if (Math.hypot(dx, dy) < 8 || Math.abs(dx) < Math.abs(dy) * 0.5) return;
    const cornerY = pointer.startY < view.h / 2 ? 0 : view.h;
    if (!beginTurn(dx > 0 ? 1 : -1, cornerY)) {
      pointer = null;
      return;
    }
    pointer.dragging = true;
    const edge = turn.dir > 0 ? view.w : 0;
    const room = Math.max(Math.abs(edge - pointer.startX), view.w * 0.35);
    pointer.gain = Math.abs(turn.to.x - turn.from.x) / room;
  }
  const now = performance.now();
  if (now > pointer.lastTime) {
    pointer.velocity = (event.clientX - pointer.lastX) / (now - pointer.lastTime);
  }
  pointer.lastX = event.clientX;
  pointer.lastTime = now;
  drawTurn({ x: turn.from.x + dx * pointer.gain, y: turn.from.y + dy });
});

function endPointer(event, cancelled) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const p = pointer;
  pointer = null;
  if (p.dragging) {
    const t = turn;
    const travel = (t.point.x - t.from.x) / (t.to.x - t.from.x);
    const flick = p.velocity * t.dir > 0.45;
    const complete = !cancelled && (travel > 0.4 || flick);
    animateTo(complete ? t.to : t.from, 320, 0, () => finishTurn(complete));
    return;
  }
  if (cancelled || performance.now() - p.startTime > 500) return;
  const zone = Math.max(70, Math.min(view.w, view.h) * 0.2);
  const nearY = p.startY < zone ? 0 : p.startY > view.h - zone ? view.h : null;
  if (nearY === null) return;
  if (p.startX < zone) autoTurn(1, nearY);
  else if (p.startX > view.w - zone) autoTurn(-1, nearY);
}

stage.addEventListener("pointerup", (event) => endPointer(event, false));
stage.addEventListener("pointercancel", (event) => endPointer(event, true));

window.addEventListener("keydown", (event) => {
  if (reader.hidden) return;
  if (event.key === "ArrowLeft") autoTurn(1, view.h);
  if (event.key === "ArrowRight") autoTurn(-1, view.h);
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
});

if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

syncRoute();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
