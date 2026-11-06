"use strict";

/* הדמות של דף הבית: כיפה בלילך עם תלתלים, פנים חיות, בועות רעיונות ופתק שהיא כותבת עליו.
   האפליקציה קובעת את המצב (Buddy.set), והדמות מתנהגת לפיו:
   idle מחפשת רעיונות ובועות קופצות, listening שולפת פתק וכותבת מה שהילדה אומרת,
   thinking יד לסנטר, asking מחכה לתשובה, shaking מנענעת את הראש, writing כותבת את הסיפור.
   הקואורדינטות בציורים הן ביחידות של אחוז מרוחב העמודה (cqw) */

(() => {
  const INK = "#151515";
  const IDEAS = ["🐉", "🚀", "🦄", "🧁", "🐢", "🏰", "🌈", "🦖", "🐙", "🎈"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  let root = null;
  let $ = null;
  let state = "idle";
  let epoch = 0;
  let bubble = null;
  let side = Math.random() < 0.5 ? 1 : -1;
  let lastShape = -1;
  let idea = -1;
  let paperH = 12;
  let noteShown = false;

  /* ---------- ציור ---------- */

  const eye = (cx, s) => `<g class="eye"><ellipse cx="${cx}" cy="128" rx="12" ry="10.5" fill="#fff"/>
    <g clip-path="url(#bd-eye-${s})"><circle class="pupil" cx="${cx + 1}" cy="129" r="5.8" fill="${INK}"/></g></g>`;

  const bumps = (() => {
    const r = 9.5, R = 53, out = [];
    const step = (r * 1.55) / R;
    for (let a = Math.PI; a <= Math.PI * 2 + 1e-6; a += step) {
      out.push(`<circle cx="${(50 + Math.cos(a) * R).toFixed(2)}" cy="${(145 + Math.sin(a) * R).toFixed(2)}" r="${r}"/>`);
    }
    return out.join("");
  })();

  const faceSvg = `<svg viewBox="78 74 144 122" aria-hidden="true">
    <defs><clipPath id="bd-eye-l"><ellipse cx="136" cy="128" rx="12" ry="10.5"/></clipPath><clipPath id="bd-eye-r"><ellipse cx="164" cy="128" rx="12" ry="10.5"/></clipPath></defs>
    <g class="tiltg"><g class="rig">
      <g class="lids">${eye(136, "l")}${eye(164, "r")}</g>
      <path class="mouth m-smile on" d="M139 150q11 9 22 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <path class="mouth m-smirk" d="M141 151q10 6 19-3" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <path class="mouth m-aha" d="M140 147q10 15 20 0z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path class="mouth m-ooh" d="M143 148q7 12 14 0z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path class="mouth m-grin" d="M135 147q15 15 30 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <g class="mouth m-focus"><path d="M150.6 152.6q-.2 6.6 4.6 6.8q4.6.2 4.2-6.6z" fill="#ff8fa6" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M155.2 154.2v2.8" stroke="#e46f8c" stroke-width="1.2" stroke-linecap="round"/><path d="M141 150q9 6 18.6-.6" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/></g>
    </g></g></svg>`;

  const notesSvg = `<svg class="bd-notes" viewBox="0 0 100 174" aria-hidden="true">
    <defs><clipPath id="bd-paper"><rect class="paper-clip" x="38" y="141" width="22" height="12"/></clipPath>
      <linearGradient id="bd-roll" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1fb"/><stop offset=".55" stop-color="#d9d2ec"/><stop offset="1" stop-color="#bfb4dd"/></linearGradient>
      <linearGradient id="bd-roll2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#f3f0fa"/><stop offset=".8" stop-color="#c9bee6"/><stop offset="1" stop-color="#a698d0"/></linearGradient></defs>
    <path class="arm-write" d="M76 160Q66 158 56 147" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round" opacity="0"/>
    <g class="pencil" opacity="0"><g class="pencil-r"><rect x="-1" y="-11" width="2" height="10.5" rx=".4" fill="#ffc94d"/><rect x="-1" y="-12.4" width="2" height="1.8" rx=".5" fill="#f6a9c8"/><rect x="-1" y="-10.8" width="2" height=".6" fill="#e0a92e"/><ellipse cx="0" cy="-1" rx="1.9" ry="1.2" fill="${INK}"/></g></g>
    <g class="note-g">
      <g clip-path="url(#bd-paper)"><rect x="38.5" y="141" width="21" height="34" fill="#fff"/>
        <g stroke="#e4dff0" stroke-width=".45">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M41 ${147 + i * 4}h16"/>`).join("")}</g></g>
      <path d="M54.4 141h5.1v5.6q-1.2-3.2-5.1-5.6z" fill="#ebe7f5"/><path d="M54.4 141q3.9 2.4 5.1 5.6l-3.6-1.2q-.4-2.6-1.5-4.4z" fill="url(#bd-roll)"/>
      <ellipse class="roll-drop" cx="49" cy="155" rx="11" ry="1.1" fill="#2b1f4a" opacity=".12"/>
      <rect class="roll-shadow" x="38.5" y="150" width="21" height="1.6" fill="#2b1f4a" opacity=".07"/>
      <rect class="roll-body" x="37.8" y="151" width="22.4" height="3.8" rx="1.9" fill="url(#bd-roll2)"/>
    </g>
    <g class="arm-hold" opacity="0"><path d="M24 158q8 4 14.6-2.4" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/><ellipse cx="39.6" cy="154.4" rx="1.9" ry="1.2" fill="${INK}" transform="rotate(-15 39.6 154.4)"/></g>
    <g class="arm-chin" opacity="0"><path d="M76 160C71 151 66 141 60.4 136.6" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/><ellipse cx="59.2" cy="136.4" rx="1.9" ry="1.2" fill="${INK}" transform="rotate(20 59.2 136.4)"/></g>
  </svg>`;

  const texSvg = `<svg class="bd-layer" viewBox="0 0 100 174" aria-hidden="true">
    <defs><filter id="bd-tx" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="1" seed="8" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -2.2"/></filter>
      <clipPath id="bd-head"><circle cx="50" cy="145" r="53"/>${bumps}</clipPath>
      <linearGradient id="bd-fade" x1="0" y1="80" x2="0" y2="165" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <mask id="bd-mask" maskUnits="userSpaceOnUse" x="0" y="70" width="100" height="104"><rect x="0" y="70" width="100" height="104" fill="url(#bd-fade)"/></mask></defs>
    <g clip-path="url(#bd-head)"><g mask="url(#bd-mask)"><rect x="0" y="70" width="100" height="104" filter="url(#bd-tx)" opacity=".8"/></g></g></svg>`;

  /* ---------- כלים ---------- */

  const N = (q) => root.querySelector(".bd-notes " + q);
  const pupils = () => root.querySelectorAll(".pupil");
  const fade = (el, to, ms = 200, delay = 0) =>
    el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: ms, delay, fill: "forwards" });

  function look(x, y, ms = 180) {
    x = Math.max(-5, Math.min(5, x));
    y = Math.max(-3.5, Math.min(4, y));
    pupils().forEach((p) => {
      p.style.transition = `transform ${ms}ms ease-out`;
      p.style.transform = `translate(${x}px,${y}px)`;
    });
  }

  function pose({ eyes = [0, 0], mouth = "smile", wide = 1, ms = 350 } = {}) {
    look(eyes[0], eyes[1], ms);
    $(".lids").style.transform = `scale(${wide})`;
    root.querySelectorAll(".mouth").forEach((m) => m.classList.toggle("on", m.classList.contains("m-" + mouth)));
  }

  function blink() {
    const l = $(".lids");
    const t = l.style.transform || "";
    l.animate([{ transform: t }, { transform: t + " scaleY(.1)" }, { transform: t }], { duration: 160 });
  }

  const rig = () => $(".rig");
  const squish = () =>
    rig().animate(
      [{ transform: "scale(1,1)" }, { transform: "scale(1.06,.9)", offset: 0.35 }, { transform: "scale(.97,1.05)", offset: 0.7 }, { transform: "scale(1,1)" }],
      { duration: 380, easing: "ease-out" },
    );
  const nod = (d = 1.4, ms = 340) =>
    rig().animate([{ transform: "translateY(0)" }, { transform: `translateY(${d * 2.2}px)`, offset: 0.45 }, { transform: "translateY(0)" }], { duration: ms, easing: "ease-in-out" });
  function tilt(deg, ms = 500) {
    const t = $(".tiltg");
    t.style.transitionDuration = ms + "ms";
    t.style.transform = `rotate(${deg}deg)`;
  }

  /* ---------- בועות רעיונות ---------- */

  const circ = (pts) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const shapes = [
    () => { const out = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; out.push([50 + Math.cos(a) * 30, 42 + Math.sin(a) * 26, 13]); } return circ(out) + '<ellipse cx="50" cy="42" rx="32" ry="28"/>'; },
    () => circ([[30, 46, 20], [48, 30, 22], [70, 36, 20], [76, 54, 15], [56, 60, 18], [36, 60, 14]]) + '<ellipse cx="52" cy="46" rx="30" ry="20"/>',
    () => '<path d="M50 10C74 9 90 24 89 44S72 76 49 75 10 63 11 42 27 11 50 10z"/>',
    () => '<rect x="8" y="14" width="86" height="56" rx="28"/>',
  ];
  const tail = '<path d="M30 64L16 88L48 70Z" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>';
  const pop = (el, delay, frames, dur) => el.animate(frames, { duration: dur, delay, easing: "cubic-bezier(.2,.9,.3,1.4)", fill: "forwards" });

  function openBubble() {
    side = -side;
    if (Math.random() < 0.25) side = -side;
    let k;
    do k = Math.floor(Math.random() * shapes.length); while (k === lastShape);
    lastShape = k;
    const u = rnd(0.85, 1.3), w = 26 * u, top = rnd(80, 88) - (u - 1) * 6, edge = rnd(2, 7);
    const b = document.createElement("div");
    b.className = "bd-think";
    b.style.cssText = `top:${top}cqw;${side > 0 ? "right" : "left"}:${edge}cqw;width:${w}cqw;transform-origin:${side > 0 ? "16%" : "84%"} 98%`;
    b.innerHTML = `<svg viewBox="0 0 100 90" style="${side > 0 ? "" : "transform:scaleX(-1)"}"><g fill="#fff">${shapes[k]()}${tail}</g></svg>
      <span class="emo" style="top:${k === 3 ? "14%" : "20%"};font-size:${11 * u}cqw">${IDEAS[idea]}</span>`;
    root.appendChild(b);
    bubble = b;
    const e = b.querySelector(".emo"), t = rnd(-6, 6);
    pop(b, 0, [{ transform: `scale(0) rotate(${-14 * side}deg)` }, { transform: `scale(1.12) rotate(${t + 4 * side}deg)`, offset: 0.6 }, { transform: `scale(.95) rotate(${t - side}deg)`, offset: 0.82 }, { transform: `scale(1) rotate(${t}deg)` }], 520);
    pop(e, 280, [{ transform: "scale(0) rotate(-30deg)" }, { transform: "scale(1.25) rotate(10deg)", offset: 0.6 }, { transform: `scale(1) rotate(${-t}deg)` }], 420);
  }

  function closeBubble() {
    const b = bubble;
    bubble = null;
    if (!b) return;
    const out = (el, delay) => el.animate([{ transform: getComputedStyle(el).transform }, { transform: "scale(1.1)", offset: 0.3 }, { transform: "scale(0)" }], { duration: 260, delay, easing: "ease-in", fill: "forwards" });
    out(b.querySelector(".emo"), 0);
    out(b, 90).finished.then(() => b.remove());
  }

  function clearBubbles() {
    closeBubble();
    setTimeout(() => root.querySelectorAll(".bd-think").forEach((t) => t.remove()), 420);
  }

  /* ---------- פתק ---------- */

  function setPaper(h) {
    paperH = h;
    N(".paper-clip").setAttribute("height", h);
    const b = 141 + h;
    N(".roll-body").setAttribute("y", b - 1.9);
    N(".roll-shadow").setAttribute("y", b - 3.4);
    N(".roll-drop").setAttribute("cy", b + 2.4);
  }

  function placePencil(x, y, r) {
    N(".pencil").setAttribute("transform", `translate(${x} ${y})`);
    N(".pencil-r").setAttribute("transform", `rotate(${r})`);
    N(".arm-write").setAttribute("d", `M76 160Q${(x + 76) / 2 + 4} ${y + 14} ${x} ${y - 1}`);
  }

  function showNote() {
    if (noteShown) return;
    noteShown = true;
    setPaper(12);
    placePencil(56, 141.4, -12);
    N(".note-g").animate(
      [{ opacity: 0, transform: "translateY(26px) rotate(8deg)" }, { opacity: 1, transform: "translateY(-2px) rotate(-3deg)", offset: 0.7 }, { opacity: 1, transform: "translateY(0) rotate(-2deg)" }],
      { duration: 520, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" },
    );
    fade(N(".arm-hold"), 1, 200, 250);
  }

  function hideNote() {
    if (!noteShown) return;
    noteShown = false;
    N(".note-g").animate([{ opacity: 1, transform: "translateY(0) rotate(-2deg)" }, { opacity: 0, transform: "translateY(26px) rotate(6deg)" }], { duration: 380, easing: "ease-in", fill: "forwards" });
    [".arm-hold", ".arm-write", ".arm-chin", ".pencil"].forEach((q) => fade(N(q), 0, 180));
  }

  function hand(writing) {
    fade(N(".arm-write"), writing ? 1 : 0, 160);
    fade(N(".pencil"), writing ? 1 : 0, 160);
    fade(N(".arm-chin"), writing ? 0 : 1, 160);
  }

  function nudgeNote() {
    N(".note-g").animate([{ transform: "translateY(0) rotate(-2deg)" }, { transform: "translateY(.7px) rotate(-2.4deg)" }, { transform: "translateY(0) rotate(-2deg)" }], { duration: 240, easing: "ease-out" });
  }

  function rollUp() {
    return new Promise((res) => {
      const h0 = paperH, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 420);
        setPaper(h0 - (h0 - 12) * (1 - Math.pow(1 - k, 3)));
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }

  /* שורה אחת: העיפרון זז מימין לשמאל מעל הדף, הדף נפרש למטה, והעיניים עוקבות */
  function writeLine(ms, e) {
    return new Promise((res) => {
      const t0 = performance.now(), startH = paperH;
      let lastNudge = -1;
      const step = (t) => {
        if (e !== epoch) return res();
        const k = Math.min(1, (t - t0) / ms);
        const x = 56 - 15 * k;
        placePencil(x, 141.4 + Math.abs(Math.sin(k * 30)) * 0.9, -12 + Math.sin(k * 30) * 6);
        look((x - 49) / 3.2, 3.6, 160);
        setPaper(Math.min(32, startH + 4 * k));
        if (Math.floor(k * 4) !== lastNudge) { lastNudge = Math.floor(k * 4); nudgeNote(); }
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- התנהגויות ---------- */

  async function ideaLoop(e) {
    if (still.matches) return;
    await sleep(700);
    while (e === epoch) {
      const ns = -side;
      pose(); await sleep(900); if (e !== epoch) return; blink();
      pose({ eyes: [3 * ns, -5], mouth: "smirk" }); await sleep(800); if (e !== epoch) return;
      pose({ eyes: [-3 * ns, -4], mouth: "smirk" }); await sleep(650); if (e !== epoch) return;
      pose({ eyes: [4 * ns, -6] }); await sleep(550); if (e !== epoch) return;
      idea = (idea + 1) % IDEAS.length;
      pose({ eyes: [0, -2], mouth: "aha", wide: 1.18 });
      openBubble(); await sleep(450); if (e !== epoch) return;
      pose({ eyes: [5 * side, -4], mouth: "grin" }); await sleep(2300); if (e !== epoch) return;
      closeBubble(); pose({ eyes: [0, 1] }); await sleep(400); if (e !== epoch) return;
      blink(); await sleep(1300);
    }
  }

  async function think(e, ms = 950) {
    hand(false);
    pose({ eyes: [3, -4], mouth: "smirk", ms: 320 });
    await sleep(ms);
    if (e !== epoch) return;
    hand(true);
    pose({ eyes: [2, 3.6], mouth: "focus", ms: 280 });
    await sleep(250);
  }

  async function writeLoop(e, lineMs) {
    fade(N(".arm-chin"), 1, 160);
    pose({ eyes: [3, -4], mouth: "smirk", ms: 320 });
    await sleep(noteShown ? 200 : 700);
    if (e !== epoch) return;
    showNote();
    await sleep(380);
    if (e !== epoch) return;
    hand(true);
    pose({ eyes: [2, 3.6], mouth: "focus", ms: 280 });
    await sleep(280);
    let n = 0;
    while (e === epoch) {
      await writeLine(lineMs, e);
      if (e !== epoch) break;
      n++;
      if (paperH >= 31) { await sleep(200); await rollUp(); }
      if (n % 2 === 0) await think(e);
      else { look(2, 3.8, 260); nod(0.8, 260); await sleep(260); }
    }
  }

  async function thinkingLoop(e) {
    showNote();
    hand(false);
    while (e === epoch) {
      pose({ eyes: [3, -4], mouth: "smirk", ms: 320 });
      await sleep(1100); if (e !== epoch) return;
      pose({ eyes: [-3, -4], mouth: "smirk", ms: 320 });
      await sleep(900); if (e !== epoch) return;
      blink();
    }
  }

  async function askLoop(e) {
    hideNote();
    pose({ eyes: [0, 1], mouth: "ooh", wide: 1.12 });
    while (e === epoch) {
      await sleep(1600); if (e !== epoch) return;
      nod(-1, 280); blink();
    }
  }

  async function shake(e) {
    hideNote();
    pose({ mouth: "smile", eyes: [0, 0] });
    for (const deg of [-9, 8, -6, 4, 0]) {
      tilt(deg, 120);
      await sleep(130);
      if (e !== epoch) return;
    }
  }

  /* ---------- ממשק ---------- */

  function set(next) {
    if (!root || next === state) return;
    state = next;
    epoch++;
    const e = epoch;
    tilt(0, 250);
    if (next !== "idle") clearBubbles();
    if (next === "idle" || next === "asking" || next === "shaking") hideNote();
    if (next === "idle") {
      hand(false);
      fade(N(".arm-chin"), 0, 160);
      pose({ mouth: "grin", wide: 1.08 });
      setTimeout(() => { if (e === epoch) { pose(); ideaLoop(e); } }, 900);
    } else if (next === "listening") writeLoop(e, 1100);
    else if (next === "writing") writeLoop(e, 900);
    else if (next === "thinking") thinkingLoop(e);
    else if (next === "asking") askLoop(e);
    else if (next === "shaking") shake(e);
  }

  function mount(el) {
    root = el;
    $ = (q) => root.querySelector(q);
    root.innerHTML = `<div class="bd-dome"></div>
      <svg class="bd-layer bd-bumps" viewBox="0 0 100 174" aria-hidden="true">${bumps}</svg>
      ${texSvg}
      <div class="bd-face">${faceSvg}</div>
      ${notesSvg}`;
    epoch++;
    ideaLoop(epoch);
  }

  window.Buddy = { mount, set, squish: () => root && squish() };
})();
