"use strict";

/* הדמות של דף הבית: כדור לילך עם תלתלים גדולים שזזים בקצב נמוך, צל מגע, פנים חיות, בועות רעיונות ופתק שהיא כותבת עליו.
   האפליקציה קובעת את המצב (Buddy.set), והדמות מתנהגת לפיו:
   idle מחפשת רעיונות ובועות קופצות, listening שולפת פתק וכותבת מה שהילדה אומרת,
   thinking יד לסנטר, asking מחכה לתשובה, shaking מנענעת את הראש, writing כותבת את הסיפור.
   המיקום והגודל של הכדור, הפנים והצל נקבעים ב-CSS (משתנים --bx, --by, --br, --fy, --fw, --sy, --sw),
   כך שאותה דמות משנה גודל ומקום בין מסך הבית למצב הכתיבה, ובין טלפון לטאבלט.
   הפנים והפתק מצוירים ביחידות של עמודה ברוחב 100, ומוקטנים או מוגדלים כשכבה אחת */

(() => {
  const INK = "#151515";
  /* הרעיונות שהדמות חושבת עליהם: אותם רעיונות, צבעים ואייקונים כמו בעיגולי הרעיונות (icons.js) */
  const IDEAS = window.Icons?.ideas || [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  let root = null;
  let $ = null;
  let state = "idle";
  let epoch = 0;
  let bubble = null;
  let side = Math.random() < 0.5 ? 1 : -1;
  let idea = -1;
  let paperH = 12;
  let noteShown = false;
  let ball = null;
  let boilTimer = 0;

  /* ---------- ציור ---------- */

  const eye = (cx, s) => `<g class="eye"><ellipse cx="${cx}" cy="128" rx="12" ry="10.5" fill="#fff"/>
    <g clip-path="url(#bd-eye-${s})"><circle class="pupil" cx="${cx + 1}" cy="129" r="5.8" fill="${INK}"/></g></g>`;

  /* הכדור: שלוש גרסאות של התלתלים, כל אחת קצת שונה, ומחליפים ביניהן 5 פעמים בשנייה כמו אנימציה מצוירת ביד */
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const ballSvg = (() => {
    const r = 0.17, n = Math.round((2 * Math.PI) / (r * 1.55));
    let frames = "";
    for (let f = 0; f < 3; f++) {
      let g = "";
      for (let i = 0; i < n; i++) {
        const k = f * 1000 + i;
        const a = ((i + (hash(k) - 0.5) * 0.32) / n) * 2 * Math.PI;
        const d = 1 + (hash(k + 7) - 0.5) * r * 0.36;
        const rr = r * (1 + (hash(k + 13) - 0.5) * 0.3);
        g += `<circle cx="${(Math.cos(a) * d).toFixed(4)}" cy="${(Math.sin(a) * d).toFixed(4)}" r="${rr.toFixed(4)}"/>`;
      }
      frames += `<g class="bd-f${f}">${g}</g>`;
    }
    let dots = "";
    for (let i = 0; i < 52; i++) {
      const a = hash(i) * 6.283, d = Math.sqrt(hash(i + 500)) * 0.9;
      dots += `<circle cx="${(Math.cos(a) * d).toFixed(3)}" cy="${(Math.sin(a) * d).toFixed(3)}" r="${(0.009 + (i % 3) * 0.006).toFixed(3)}"/>`;
    }
    return `<svg viewBox="-1 -1 2 2" aria-hidden="true"><g class="bd-curls"><circle r="1"/>${frames}</g><g class="bd-dots">${dots}</g></svg>`;
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
    <path class="arm-write" d="M72 156Q64 155 56 147" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity="0"/>
    <g class="pencil" opacity="0"><g class="pencil-r"><rect x="-1" y="-11" width="2" height="10.5" rx=".4" fill="#ffc94d"/><rect x="-1" y="-12.4" width="2" height="1.8" rx=".5" fill="#f6a9c8"/><rect x="-1" y="-10.8" width="2" height=".6" fill="#e0a92e"/><ellipse cx="0" cy="-1" rx="2.3" ry="1.5" fill="${INK}"/></g></g>
    <g class="note-g">
      <g clip-path="url(#bd-paper)"><rect x="38.5" y="141" width="21" height="34" fill="#fff"/>
        <g stroke="#e4dff0" stroke-width=".45">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M41 ${147 + i * 4}h16"/>`).join("")}</g></g>
      <path d="M54.4 141h5.1v5.6q-1.2-3.2-5.1-5.6z" fill="#ebe7f5"/><path d="M54.4 141q3.9 2.4 5.1 5.6l-3.6-1.2q-.4-2.6-1.5-4.4z" fill="url(#bd-roll)"/>
      <ellipse class="roll-drop" cx="49" cy="155" rx="11" ry="1.1" fill="#2b1f4a" opacity=".12"/>
      <rect class="roll-shadow" x="38.5" y="150" width="21" height="1.6" fill="#2b1f4a" opacity=".07"/>
      <rect class="roll-body" x="37.8" y="151" width="22.4" height="3.8" rx="1.9" fill="url(#bd-roll2)"/>
    </g>
    <g class="arm-hold" opacity="0"><path d="M26 157q7 3.6 12.6-1.4" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="39.6" cy="154.4" rx="2.3" ry="1.5" fill="${INK}" transform="rotate(-15 39.6 154.4)"/></g>
    <g class="arm-chin" opacity="0"><path d="M67.5 148.5C65.6 144.6 63.4 140.2 60.4 136.6" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="59.2" cy="136.4" rx="2.3" ry="1.5" fill="${INK}" transform="rotate(20 59.2 136.4)"/></g>
  </svg>`;

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
  const squish = () => {
    root.querySelector(".bd-ball svg").animate(
      [{ transform: "scale(1,1)" }, { transform: "scale(1.05,.93)", offset: 0.35 }, { transform: "scale(.98,1.03)", offset: 0.7 }, { transform: "scale(1,1)" }],
      { duration: 380, easing: "ease-out" },
    );
    return rig().animate(
      [{ transform: "scale(1,1)" }, { transform: "scale(1.06,.9)", offset: 0.35 }, { transform: "scale(.97,1.05)", offset: 0.7 }, { transform: "scale(1,1)" }],
      { duration: 380, easing: "ease-out" },
    );
  };
  const nod = (d = 1.4, ms = 340) =>
    rig().animate([{ transform: "translateY(0)" }, { transform: `translateY(${d * 2.2}px)`, offset: 0.45 }, { transform: "translateY(0)" }], { duration: ms, easing: "ease-in-out" });
  function tilt(deg, ms = 500) {
    const t = $(".tiltg");
    t.style.transitionDuration = ms + "ms";
    t.style.transform = `rotate(${deg}deg)`;
  }

  /* ---------- בועות רעיונות ---------- */

  /* בועת מחשבה: ענן לבן ושטוח עם בליטות, ושתי נקודות קטנות שמובילות אל הראש. בלי קו מתאר.
     צל שטוח קטן מתחת, כמו בכרטיסים, כדי שהלבן ייראה גם על הרקע הקרם.
     הקופסה 100 על 90: הענן למעלה, מרכזו ב-(51, 34), והנקודות למטה משמאל (בצד השני הכול הפוך במראה) */
  const CLOUD = [[51, 35, 34, 19], [21, 40, 13], [30, 24, 14], [49, 17, 16], [68, 20, 14.5], [82, 33, 13.5], [76, 47, 12], [58, 51, 13], [38, 50, 12.5]];
  const cloud = (dy = 0) => CLOUD.map(([x, y, r, ry]) => (ry ? `<ellipse cx="${x}" cy="${y + dy}" rx="${r}" ry="${ry}"/>` : `<circle cx="${x}" cy="${y + dy}" r="${r}"/>`)).join("");
  const bubbleSvg = () => `<svg viewBox="0 0 100 90" aria-hidden="true">
    <g class="bt-dot2"><circle cx="12" cy="85" r="4.4" fill="#2b1f4a" opacity=".08"/><circle cx="12" cy="83.4" r="4.4" fill="#fff"/></g>
    <g class="bt-dot1"><circle cx="23.5" cy="72.5" r="6.6" fill="#2b1f4a" opacity=".08"/><circle cx="23.5" cy="70.5" r="6.6" fill="#fff"/></g>
    <g class="bt-main"><g fill="#2b1f4a" opacity=".08">${cloud(2.6)}</g><g fill="#fff">${cloud()}</g></g></svg>`;
  const pop = (el, delay, frames, dur) => el.animate(frames, { duration: dur, delay, easing: "cubic-bezier(.2,.9,.3,1.4)", fill: "forwards" });

  function openBubble() {
    side = -side;
    if (Math.random() < 0.25) side = -side;
    /* הבועה יוצאת מהחלק העליון של הכדור, לצד, ולא עולה אף פעם על העיניים או על השם.
       מודדים איפה הם על המסך: אם הבועה חופפת לעיניים בצד, היא עולה מעליהן,
       ואם אין מספיק מקום בין השם לעיניים, היא קטנה. בסוף ממירים לאחוזים מרוחב הכדור */
    const B = ball.getBoundingClientRect(), px = B.width / 100;
    const eyes = [...root.querySelectorAll(".eye ellipse")].map((el) => el.getBoundingClientRect());
    const eyeL = Math.min(...eyes.map((r) => r.left)) - 0.1 * B.width;
    const eyeR = Math.max(...eyes.map((r) => r.right)) + 0.1 * B.width;
    const eyeT = Math.min(...eyes.map((r) => r.top)) - 0.05 * B.width;
    const nameBox = document.getElementById("child-name")?.getBoundingClientRect();
    const ceiling = nameBox && nameBox.width ? nameBox.bottom + 0.03 * B.width : 6;
    /* גבולות: קצוות המסך, ובטאבלט גם הלוח של הספרייה משמאל */
    const lib = document.getElementById("library")?.getBoundingClientRect();
    const minX = lib && lib.width && lib.right < B.left + 1 ? lib.right + 6 : 6;
    const maxX = document.documentElement.clientWidth - 6;
    const out = rnd(6, 12) * px;
    const place = (w) => (side > 0 ? Math.min(maxX, B.right + out) - w : Math.max(minX, B.left - out));
    let w = 42 * rnd(0.85, 1.2) * px;
    let left = place(w);
    let top = B.top + rnd(-16, -8) * px;
    /* הסיבוב והקפיצה בפתיחה מגדילים את הבועה לרגע, אז משאירים מרווח */
    const gap = () => w * 0.9 + w * 0.2;
    const overEyes = () => left < eyeR && left + w > eyeL;
    /* קודם מנסים להזיז את הבועה הצידה, מחוץ לאזור העיניים. רק אם אין מקום, היא עולה מעליהן */
    if (overEyes()) {
      const aside = side > 0 ? eyeR : eyeL - w;
      if (aside >= minX && aside + w <= maxX) left = aside;
    }
    if (overEyes() && top + gap() > eyeT) top = eyeT - gap();
    if (top < ceiling) {
      const floor = overEyes() ? eyeT : B.top + 0.3 * B.width;
      w = Math.max(18 * px, (floor - ceiling) / 1.1);
      left = place(w);
      top = overEyes() ? Math.max(ceiling, eyeT - gap()) : ceiling;
    }
    const b = document.createElement("div");
    const it = IDEAS[idea] || {};
    b.className = "bd-think";
    b.style.cssText = `top:${(top - B.top) / px}cqw;left:${(left - B.left) / px}cqw;width:${w / px}cqw;transform-origin:${side > 0 ? "16%" : "84%"} 98%`;
    /* האייקון במרכז הענן: ברוחב 38 מתוך 100 */
    b.innerHTML = `<div class="bt-flip" style="${side > 0 ? "" : "transform:scaleX(-1)"}">${bubbleSvg()}</div>
      <span class="ico" style="left:${side > 0 ? 32 : 30}%;top:${((34 - 19) / 90) * 100}%;width:38%">${it.name && window.Icons ? window.Icons.idea(it.name) : ""}</span>`;
    ball.appendChild(b);
    bubble = b;
    /* קודם הנקודה הקטנה ליד הראש, אחריה הבינונית, ואז העיגול הגדול קופץ, והאייקון בתוכו */
    const e = b.querySelector(".ico"), t = rnd(-5, 5), q = (c) => b.querySelector(c);
    b.style.transform = `rotate(${t}deg)`;
    const grow = [{ transform: "scale(0)" }, { transform: "scale(1.2)", offset: 0.6 }, { transform: "scale(1)" }];
    pop(q(".bt-dot2"), 0, grow, 260);
    pop(q(".bt-dot1"), 90, grow, 280);
    pop(q(".bt-main"), 180, [{ transform: "scale(0)" }, { transform: "scale(1.1)", offset: 0.6 }, { transform: "scale(.96)", offset: 0.82 }, { transform: "scale(1)" }], 480);
    pop(e, 380, [{ transform: "scale(0) rotate(-20deg)" }, { transform: "scale(1.18) rotate(8deg)", offset: 0.6 }, { transform: `scale(1) rotate(${-t}deg)` }], 420);
  }

  function closeBubble() {
    const b = bubble;
    bubble = null;
    if (!b) return;
    const out = (el, delay) => el.animate([{ transform: getComputedStyle(el).transform }, { transform: "scale(1.1)", offset: 0.3 }, { transform: "scale(0)" }], { duration: 260, delay, easing: "ease-in", fill: "forwards" });
    out(b.querySelector(".ico"), 0);
    out(b.querySelector(".bt-main"), 60);
    out(b.querySelector(".bt-dot1"), 140);
    out(b.querySelector(".bt-dot2"), 200).finished.then(() => b.remove());
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
    N(".arm-write").setAttribute("d", `M72 156Q${(x + 72) / 2 + 3} ${y + 11} ${x} ${y - 1}`);
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
      idea = idea < 0 ? Math.floor(Math.random() * (IDEAS.length || 1)) : (idea + 1) % (IDEAS.length || 1);
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

  /* התלתלים: מחליפים פריים כל 200 מילישניות. מי שביקש פחות תנועה רואה אותם קבועים */
  function boil() {
    clearInterval(boilTimer);
    let f = 0;
    root.dataset.f = 0;
    if (still.matches) return;
    boilTimer = setInterval(() => {
      if (document.hidden) return;
      f = (f + 1) % 3;
      root.dataset.f = f;
    }, 200);
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
    root.innerHTML = `<div class="bd-shadow"></div>
      <div class="bd-ball">${ballSvg}</div>
      <div class="bd-fx"><div class="bd-face">${faceSvg}</div>${notesSvg}</div>`;
    ball = root.querySelector(".bd-ball");
    boil();
    still.addEventListener?.("change", boil);
    epoch++;
    ideaLoop(epoch);
  }

  window.Buddy = { mount, set, squish: () => root && squish() };
})();
