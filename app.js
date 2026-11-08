"use strict";

const home = document.getElementById("home");
const reader = document.getElementById("reader");
const stage = document.getElementById("stage");
const topicInput = document.getElementById("topic");

const DRAFT_KEY = "story-time-draft";
const createBtn = document.getElementById("create-btn");
const cancelBtn = document.getElementById("cancel-btn");
const note = document.getElementById("note");

const SAMPLE_NOTE = "בינתיים נפתח סיפור לדוגמה. יצירת סיפורים תחובר בקרוב.";
const WAIT_STATUS = "";
const PAGE_COUNT = 12;
/* כל חלק עובר עריכה וניקוד לבד. העמוד הראשון לבד, כדי שהספר ייפתח מהר,
   ואחריו זוגות שמתאימים לכפולות בספר */
const PARTS = [[0, 1], [1, 3], [3, 5], [5, 7], [7, 9], [9, 11], [11, 12]];
const ERROR_TEXT = {
  bad_topic: "כתבו רעיון קצר לסיפור.",
  refused: "לא הצלחתי לכתוב על זה. נסו רעיון אחר.",
  busy: "יש עומס כרגע. נסו שוב עוד רגע.",
};
const GENERIC_ERROR = "משהו השתבש. אפשר ללחוץ שוב.";

let pages = window.SAMPLE_STORY.pages;
let job = null;

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

function resetForm() {
  note.textContent = window.STORY_API_URL ? "" : SAMPLE_NOTE;
}

function bookPage(lines, i) {
  const words = lines.join(" ").split(/\s+/).length;
  const short = lines.length <= 2 && words <= 6;
  return { lines, folio: String(i + 1), ...(short ? { kind: "short" } : {}) };
}

/* עמוד שעוד לא מוכן. אפשר להגיע אליו, והוא מתמלא ברגע שהטקסט שלו מגיע */
function pendingPage(i) {
  return { kind: "pending", lines: ["· · ·"], folio: String(i + 1) };
}

function emptyBook() {
  const body = Array.from({ length: PAGE_COUNT }, (_, i) => pendingPage(i));
  return [{ kind: "title", lines: [""] }, ...body, { kind: "title", lines: ["הַסּוֹף"] }];
}

async function callStep(payload, signal) {
  const response = await fetch(window.STORY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.STORY_API_KEY,
    },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.story) throw new Error("bad_story");
  return data.story;
}

/* כתיבה בזרם: כל שורה בתשובה היא הודעה אחת, עם הכותרת, עם עמוד, או עם סיום */
async function streamWrite(topic, signal, onMessage) {
  const response = await fetch(window.STORY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.STORY_API_KEY,
    },
    body: JSON.stringify({ action: "write_stream", topic }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error("connection");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const handle = (line) => {
    if (!line.trim()) return;
    const message = JSON.parse(line);
    if (message.error) throw new Error(message.error);
    if (message.done) finished = true;
    else onMessage(message);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());
  if (!finished) throw new Error("connection");
}

/* כל חלק עובר עריכה ואז ניקוד. אם אחד מהם נכשל פעמיים, ממשיכים עם מה שיש,
   כדי שהילדה לא תיתקע באמצע הסיפור */
async function finishPart(part, signal) {
  let text = part;
  for (const action of ["edit_part", "vocalize_part"]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        text = await callStep({ action, story: text }, signal);
        break;
      } catch (error) {
        if (signal.aborted) throw error;
        console.error(action, error);
      }
    }
  }
  return text;
}

function setWaiting(on) {
  home.classList.toggle("waiting", on);
  cancelBtn.hidden = !on;
  setKoala(on ? "writing" : "idle", on ? "אני כותבת לך סיפור…" : undefined);
}

/* הסיפור נכתב בזרם. כל חלק שמגיע נערך ומנוקד, לפי הסדר,
   והספר נפתח כשהכותרת והעמוד הראשון מוכנים. השאר מתמלא בזמן הקריאה.
   speculative: מתחילים לכתוב עוד לפני שהילדה אישרה את הרעיון. כלום לא מוצג עד commit(),
   ואם היא אומרת "לא", הכתיבה נעצרת (גם בשרת) */
async function createStory(topic, { speculative = false } = {}) {
  cancelSpeculation();
  const controller = new AbortController();
  const { signal } = controller;
  const draft = { title: null, emoji: "", pages: [], error: null, waiters: [] };
  const wake = () => draft.waiters.splice(0).forEach((check) => check());
  const waitForPages = (count) =>
    new Promise((resolve, reject) => {
      const check = () => {
        if (draft.error) reject(draft.error);
        else if (draft.pages.length >= count) resolve();
        else draft.waiters.push(check);
      };
      check();
    });

  let confirm;
  const confirmed = new Promise((resolve) => (confirm = resolve));
  const thisJob = { controller, topic, speculative, committed: false };
  let announced = false;
  /* הדמות מכריזה על שם הסיפור ברגע שיש שם ושהילדה אישרה, כדי שההמתנה לא תהיה שקטה */
  const announce = () => {
    if (announced || !thisJob.committed || !draft.title || !reader.hidden) return;
    announced = true;
    koalaSays(`הסיפור שלנו נקרא: ${draft.title}`);
  };
  thisJob.commit = () => {
    if (thisJob.committed || signal.aborted) return;
    thisJob.committed = true;
    setWaiting(true);
    note.textContent = WAIT_STATUS;
    announce();
    confirm();
  };
  job = thisJob;
  if (!speculative) thisJob.commit();

  const writing = streamWrite(topic, signal, (message) => {
    if (message.title !== undefined) {
      draft.title = message.title;
      draft.emoji = message.emoji || "";
      announce();
    }
    if (message.lines) draft.pages[message.page] = message.lines;
    wake();
  }).catch((error) => {
    draft.error = error;
    wake();
    throw error;
  });
  writing.catch(() => {});

  try {
    const book = emptyBook();
    let opened = false;
    const open = () => {
      if (opened || signal.aborted) return;
      opened = true;
      pages = book;
      setWaiting(false);
      resetForm();
      openBook();
    };
    for (const [from, to] of PARTS) {
      await waitForPages(to);
      const part = await finishPart(
        { title: draft.title ?? "", pages: draft.pages.slice(from, to).map((lines) => ({ lines })) },
        signal,
      );
      if (from === 0) book[0] = { kind: "title", lines: [part.title] };
      part.pages.forEach((page, k) => {
        book[from + k + 1] = bookPage(page.lines, from + k);
      });
      // מקריאים מראש כל עמוד ברגע שהוא מוכן, כדי שההקראה תתחיל מיד כשפותחים אותו
      if (thisJob.committed) narration.prepare(book.slice(from + 1, to + 1));
      // הספר נפתח רק אחרי האישור. עד אז החלקים ממשיכים להיכתב ברקע
      if (from === 0) confirmed.then(() => {
        narration.prepare(book.slice(1));
        open();
      });
      else if (opened) refreshBook();
    }
    await writing;
    await confirmed;
    if (job === thisJob) job = null;
    saveStory({
      title: book[0].lines[0],
      emoji: draft.emoji,
      pages: book.slice(1, PAGE_COUNT + 1).map((page) => page.lines),
    });
  } catch (error) {
    if (job === thisJob) job = null;
    if (!thisJob.committed) {
      // כתיבה מוקדמת שבוטלה או נכשלה: אף אחד לא ראה אותה. אם הילדה תאשר, נכתוב מחדש
      if (!signal.aborted) console.error("early writing", error);
      return;
    }
    setWaiting(false);
    if (signal.aborted) {
      resetForm();
      return;
    }
    controller.abort();
    console.error(error);
    if (!reader.hidden) closeBook();
    note.textContent = ERROR_TEXT[error.message] || GENERIC_ERROR;
  }
}

/* כתיבה מוקדמת: מתחילה ברגע שיש רעיון, ונעצרת אם הרעיון משתנה או נדחה */
function speculate(idea) {
  if (!window.STORY_API_URL) return;
  createStory(idea, { speculative: true });
}

function cancelSpeculation() {
  if (job?.speculative && !job.committed) {
    job.controller.abort();
    job = null;
  }
}

cancelBtn.addEventListener("click", () => {
  if (job) job.controller.abort();
});

document.getElementById("topic-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (home.classList.contains("waiting")) return;
  if (!window.STORY_API_URL) {
    openBook();
    return;
  }
  const topic = topicInput.value.trim();
  if (!topic) {
    note.textContent = ERROR_TEXT.bad_topic;
    topicInput.focus();
    return;
  }
  createStory(topic);
});

document.getElementById("home-btn").addEventListener("click", closeBook);

function openBook() {
  stopKoalaVoice();
  home.hidden = true;
  reader.hidden = false;
  document.getElementById("theme-color").content = "#ffffff";
  document.documentElement.classList.add("reading");
  view.index = 0;
  layout();
  narration.start();
}

function openSaved(story) {
  pages = [
    { kind: "title", lines: [story.title] },
    ...story.pages.map(bookPage),
    { kind: "title", lines: ["הַסּוֹף"] },
  ];
  openBook();
}

function closeBook() {
  if (job) job.controller.abort();
  narration.stop();
  reader.hidden = true;
  home.hidden = false;
  document.getElementById("theme-color").content = "#ffeec4";
  document.documentElement.classList.remove("reading");
  cancelTurn();
}

/* מדף הספרים. הסיפורים נשמרים בשרת לפי קוד משפחה סודי, ועותק שלהם נשמר במכשיר
   כדי שהמדף יופיע מיד. סיפור שעוד לא הגיע לשרת מסומן כממתין ונשלח בהזדמנות הבאה */

const LIBRARY_KEY = "story-time-library";
const FAMILY_KEY = "story-time-family";
const LIBRARY_VIEW_KEY = "story-time-library-view";
const library = document.getElementById("library");
const storyList = document.getElementById("story-list");
const selectBtn = document.getElementById("select-btn");
const deleteBtn = document.getElementById("delete-btn");
const selectBar = document.getElementById("select-bar");
const selectCount = document.getElementById("select-count");
const shelf = { sort: "date", view: "grid", selecting: false, selected: new Set() };

function loadStories() {
  try {
    const stories = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(stories) ? stories : [];
  } catch {
    return [];
  }
}

function storeStories(stories) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(stories));
    return true;
  } catch {
    return false;
  }
}

const isDemo = (story) => String(story.id).startsWith("demo-");
const isPending = (story) => !story.synced && !isDemo(story);

/* קוד המשפחה: נוצר במכשיר הראשון, ועובר למכשירים נוספים בקישור #family=… */
function newFamilyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let family = null;
try {
  family = localStorage.getItem(FAMILY_KEY);
} catch {}
const linked = new URLSearchParams(location.hash.slice(1)).get("family");
if (linked && /^[a-f0-9]{32}$/.test(linked)) {
  family = linked;
  history.replaceState(null, "", location.pathname + location.search);
  /* סיפורים מהמשפחה הקודמת לא שייכים לכאן. ממתינים ודמה נשארים */
  storeStories(loadStories().filter((story) => !story.synced));
}
if (!family || !/^[a-f0-9]{32}$/.test(family)) family = newFamilyCode();
try {
  localStorage.setItem(FAMILY_KEY, family);
} catch {}

async function callApi(payload) {
  const response = await fetch(window.STORY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
    body: JSON.stringify({ ...payload, family }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* שולח סיפורים ממתינים, ואז מחליף את העותק במכשיר במה שיש בשרת */
let syncing = null;
function syncShelf() {
  if (!window.STORY_API_URL) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      for (const story of loadStories().filter(isPending)) {
        const { story: saved } = await callApi({
          action: "save_story",
          story: { title: story.title, emoji: story.emoji, pages: story.pages.map((lines) => ({ lines })) },
        });
        storeStories(loadStories().map((s) => (s.id === story.id ? toCached(saved) : s)));
      }
      const { stories } = await callApi({ action: "list_stories" });
      const local = loadStories().filter((story) => isPending(story) || isDemo(story));
      storeStories([...stories.map(toCached), ...local]);
    } catch (error) {
      console.error("sync", error);
    } finally {
      syncing = null;
      renderLibrary();
    }
  })();
  return syncing;
}

function toCached(story) {
  return { ...story, pages: story.pages.map((page) => page.lines ?? page), synced: true };
}

function saveStory(story) {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stories = loadStories();
  stories.push({ id, created: Date.now(), ...story });
  if (!storeStories(stories)) note.textContent = "אין מקום לשמור את הסיפור במכשיר.";
  renderLibrary();
  syncShelf();
}

/* מיון לפי א–ת מתעלם מהניקוד, כדי שאותיות זהות ייחשבו זהות */
const plainTitle = (title) => title.normalize("NFD").replace(/[\u0591-\u05C7]/g, "");
const collator = new Intl.Collator("he");

function sortedStories() {
  const stories = loadStories();
  if (shelf.sort === "name") {
    return stories.sort((a, b) => collator.compare(plainTitle(a.title), plainTitle(b.title)));
  }
  return stories.sort((a, b) => b.created - a.created);
}

/* לכל סיפור צבע כריכה קבוע משלו, לפי המזהה שלו */
const ART_COLORS = ["#6fcf9b", "#ffc94d", "#f5a623", "#5cc0f5", "#4fd1a5", "#ff7b54", "#f48fb1", "#9fa8ff"];
function artColor(key) {
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return ART_COLORS[hash % ART_COLORS.length];
}

/* ---------- המדף בדף הבית: שורות, מועדפים, רעיונות, ומסך "עוד" ---------- */
const shelvesEl = document.getElementById("shelves");
const moreEl = document.getElementById("more");
const ideaGrid = document.getElementById("idea-grid");
const FAV_KEY = "story-time-favorites";
const ICONS = window.Icons;
let moreKind = null;
let ideaStart = Math.floor(Math.random() * (ICONS?.ideas.length || 1));

/* המועדפים נשמרים במכשיר (עוד לא בשרת) */
function loadFavs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function storeFavs(favs) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  } catch {}
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const refreshIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8.5A7.5 7.5 0 1 0 19.5 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 3.5V9H14.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* כרטיס סיפור: כריכה בצבע ובדוגמה משלו עם אייקון, השם, ולב בפינה */
function storyCard(story, favs, selecting) {
  const cover = ICONS ? ICONS.cover(story) : null;
  const pat = cover ? `--pat:${cover.pattern.url};--ps:${cover.pattern.size};` : "";
  const art = cover ? cover.svg : esc(story.emoji || "📖");
  const pressed = selecting ? ` aria-pressed="${shelf.selected.has(story.id)}"` : "";
  const fav = favs.has(story.id);
  return `<li class="story-li"><button type="button" class="story-item" data-id="${esc(story.id)}" style="--art:${artColor(story.id || story.title)};${pat}"${pressed}>
      <span class="story-emoji" aria-hidden="true">${art}</span><span class="story-name">${esc(story.title)}</span><span class="story-check" aria-hidden="true"></span></button>
    <button type="button" class="fav" data-fav="${esc(story.id)}" aria-pressed="${fav}" aria-label="מועדף: ${esc(story.title)}">${ICONS?.heart || "♥"}</button></li>`;
}

const ideaButton = (it) =>
  `<button type="button" class="idea" data-idea="${esc(it.name)}" style="--c:${it.color}"><i>${ICONS.idea(it.name)}</i><b>${esc(it.name)}</b></button>`;

const rowHead = (kind, title, count) =>
  `<div class="row-head"><h2><span class="row-icon" aria-hidden="true">${ICONS?.ui[kind] || ""}</span>${title}</h2>
    <button type="button" class="see" data-more="${kind}" aria-label="עוד ${title}, ${count} בסך הכול">עוד${chevron}</button></div>`;

const ideasFrom = (start, n) => [...Array(Math.min(n, ICONS.ideas.length))].map((_, k) => ICONS.ideas[(start + k) % ICONS.ideas.length]);

function renderShelves(stories, favs) {
  if (!ICONS) return;
  if (!stories.length) {
    shelvesEl.innerHTML = `<section class="first"><div class="first-head"><span class="row-icon" aria-hidden="true">${ICONS.ui.ideas}</span><h2>על מה יהיה הסיפור הראשון?</h2></div>
      <p>בחרו משהו, ונמציא יחד סיפור</p><div class="ideas-grid first-ideas">${ideasFrom(ideaStart, 12).map(ideaButton).join("")}</div>
      <button type="button" class="more-ideas">${refreshIcon}עוד רעיונות</button></section>`;
    return;
  }
  const recent = [...stories].sort((a, b) => b.created - a.created);
  const favList = recent.filter((s) => favs.has(s.id));
  /* שומרים את מיקום הגלילה של כל שורה, כדי שלב או סנכרון לא יקפיצו אותה להתחלה */
  const scroll = {};
  shelvesEl.querySelectorAll(".shelf").forEach((el) => (scroll[el.dataset.row] = el.scrollLeft));
  shelvesEl.innerHTML =
    `<section class="row">${rowHead("recent", "סיפורים אחרונים", recent.length)}<ul class="shelf" data-row="recent">${recent.slice(0, 10).map((s) => storyCard(s, favs)).join("")}</ul></section>` +
    (favList.length ? `<section class="row">${rowHead("favs", "מועדפים", favList.length)}<ul class="shelf" data-row="favs">${favList.slice(0, 10).map((s) => storyCard(s, favs)).join("")}</ul></section>` : "") +
    `<section class="row">${rowHead("ideas", "רעיונות לסיפור חדש", ICONS.ideas.length)}<div class="shelf" data-row="ideas">${ideasFrom(0, 10).map(ideaButton).join("")}</div></section>`;
  shelvesEl.querySelectorAll(".shelf").forEach((el) => {
    if (scroll[el.dataset.row]) el.scrollLeft = scroll[el.dataset.row];
  });
}

function renderLibrary() {
  const stories = loadStories();
  const favs = loadFavs();
  home.classList.add("has-library");
  renderShelves(stories, favs);
  if (!stories.length && moreKind && moreKind !== "ideas") closeMore();
  if (!stories.length && shelf.selecting) setSelecting(false);
  /* מסך "עוד" */
  if (moreKind === "recent" || moreKind === "favs") {
    const list = moreKind === "favs" ? sortedStories().filter((s) => favs.has(s.id)) : sortedStories();
    storyList.className = `story-list ${moreKind === "favs" ? "grid" : shelf.view}`;
    storyList.classList.toggle("selecting", shelf.selecting);
    storyList.innerHTML = list.map((s) => storyCard(s, favs, shelf.selecting)).join("");
  }
  document.querySelectorAll("[data-sort]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.sort === shelf.sort));
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === shelf.view));
  });
  const count = shelf.selected.size;
  deleteBtn.disabled = count === 0;
  selectCount.textContent =
    count === 0 ? "בחרו סיפורים" : count === 1 ? "נבחר סיפור אחד" : `נבחרו ${count} סיפורים`;
}

function openMore(kind) {
  moreKind = kind;
  const titles = { recent: "כל הסיפורים", favs: "מועדפים", ideas: "כל הרעיונות" };
  document.getElementById("more-title").textContent = titles[kind];
  document.getElementById("more-icon").innerHTML = ICONS?.ui[kind] || "";
  document.getElementById("more-tools").hidden = kind !== "recent";
  document.getElementById("link-row").hidden = kind !== "recent";
  storyList.hidden = kind === "ideas";
  ideaGrid.hidden = kind !== "ideas";
  if (kind === "ideas") ideaGrid.innerHTML = ICONS.ideas.map(ideaButton).join("");
  moreEl.hidden = false;
  moreEl.scrollTop = 0;
  requestAnimationFrame(() => moreEl.classList.add("open"));
  renderLibrary();
}

function closeMore() {
  if (moreEl.hidden) return;
  if (shelf.selecting) setSelecting(false);
  moreKind = null;
  moreEl.classList.remove("open");
  setTimeout(() => {
    if (!moreKind) moreEl.hidden = true;
  }, 380);
}

document.getElementById("more-back").addEventListener("click", closeMore);

/* לב: מסמן ומוריד מועדף, עם קפיצה קטנה ונקודות */
function toggleFav(button) {
  const id = button.dataset.fav;
  const favs = loadFavs();
  const on = !favs.has(id);
  if (on) favs.add(id);
  else favs.delete(id);
  storeFavs(favs);
  document.querySelectorAll(".fav").forEach((b) => {
    if (b.dataset.fav === id) b.setAttribute("aria-pressed", String(on));
  });
  button.classList.remove("pop");
  void button.offsetWidth;
  button.classList.add("pop");
  if (on) {
    const burst = document.createElement("span");
    burst.className = "burst";
    burst.innerHTML = [...Array(7)].map((_, k) => {
      const a = (k / 7) * Math.PI * 2;
      return `<i style="--x:${(Math.cos(a) * 22).toFixed(1)}px;--y:${(Math.sin(a) * 22).toFixed(1)}px"></i>`;
    }).join("");
    button.append(burst);
    setTimeout(() => burst.remove(), 600);
  }
  setTimeout(renderLibrary, on ? 380 : 220);
}

/* כל הנגיעות במדף ובמסך "עוד" */
function onShelfClick(event) {
  const fav = event.target.closest(".fav");
  if (fav) return toggleFav(fav);
  const see = event.target.closest("[data-more]");
  if (see) return openMore(see.dataset.more);
  const idea = event.target.closest("[data-idea]");
  if (idea) return startIdea(idea.dataset.idea);
  if (event.target.closest(".more-ideas")) {
    ideaStart = (ideaStart + 12) % ICONS.ideas.length;
    renderLibrary();
    shelvesEl.querySelector(".first-ideas")?.classList.add("swap");
    return;
  }
  const item = event.target.closest(".story-item");
  if (!item) return;
  const { id } = item.dataset;
  if (shelf.selecting) {
    if (shelf.selected.has(id)) shelf.selected.delete(id);
    else shelf.selected.add(id);
    renderLibrary();
    return;
  }
  const story = loadStories().find((s) => s.id === id);
  if (story) openSaved(story);
}
shelvesEl.addEventListener("click", onShelfClick);
moreEl.addEventListener("click", onShelfClick);

function setSelecting(on) {
  shelf.selecting = on;
  shelf.selected.clear();
  selectBtn.setAttribute("aria-pressed", String(on));
  selectBtn.textContent = on ? "סיום" : "בחירה";
  moreEl.classList.toggle("selecting", on);
  selectBar.hidden = !on;
  renderLibrary();
}

function rememberShelfView() {
  try {
    localStorage.setItem(LIBRARY_VIEW_KEY, JSON.stringify({ sort: shelf.sort, view: shelf.view }));
  } catch {}
}

try {
  const saved = JSON.parse(localStorage.getItem(LIBRARY_VIEW_KEY) || "{}");
  if (saved.sort === "name" || saved.sort === "date") shelf.sort = saved.sort;
  if (saved.view === "grid" || saved.view === "list") shelf.view = saved.view;
} catch {}

document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    shelf.sort = button.dataset.sort;
    rememberShelfView();
    renderLibrary();
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    shelf.view = button.dataset.view;
    rememberShelfView();
    renderLibrary();
  });
});

selectBtn.addEventListener("click", () => setSelecting(!shelf.selecting));

/* סיפורי דמה לבדיקת המדף, בלי קריאה לשרת.
   ‎?demo מוסיף אותם, ‎?demo=clear מוחק רק אותם, והסיפורים האמיתיים נשארים */
const DEMO_STORIES = [
  ["בְּרוּנוֹ רוֹקֵד בָּלֵט", "🦕"],
  ["שׁוֹקוֹ וְהַחֹשֶׁךְ", "🦉"],
  ["פִּלְפֵּל, קַו שֶׁבַע", "🚌"],
  ["מָיָה וְהַיָּרֵחַ", "🌙"],
  ["אַרְנָב בַּיָּרֵחַ", "🐰"],
  ["גְּלִידָה שֶׁלֹּא נָמַסָּה", "🍦"],
  ["זהבה והכתר שנפל לתוך המרק החם של סבתא ביום שישי בצהריים", "👑"],
  ["האסטרונאוטית הקטנה", "👩‍🚀"],
  ["עננה", ""],
  ["תות", "🍓"],
  ["אוטובוס", "🚍"],
  ["ים של בועות", "🫧"],
  ["הדרקון שהתעטש פרחים", "🐉"],
  ["1, 2, 3, הפתעה!", "🎁"],
];

function applyDemo(mode) {
  const real = loadStories().filter((story) => !String(story.id).startsWith("demo-"));
  if (mode === "clear") {
    storeStories(real);
    return;
  }
  const pages = window.SAMPLE_STORY.pages.filter((page) => page.folio).map((page) => page.lines);
  const day = 24 * 60 * 60 * 1000;
  const demo = DEMO_STORIES.map(([title, emoji], i) => ({
    id: `demo-${i}`,
    created: Date.now() - i * 2.3 * day,
    title,
    emoji,
    pages,
  }));
  storeStories([...real, ...demo]);
}

const demoMode = new URLSearchParams(location.search).get("demo");
if (demoMode !== null) {
  applyDemo(demoMode);
  history.replaceState(null, "", location.pathname);
}

/* מחיקה מהשרת קודם. אם היא נכשלת, הסיפורים נשארים במדף ולא נעלמים רק מהמכשיר */
deleteBtn.addEventListener("click", async () => {
  if (!shelf.selected.size) return;
  const chosen = loadStories().filter((story) => shelf.selected.has(story.id));
  const onServer = chosen.filter((story) => story.synced).map((story) => story.id);
  deleteBtn.disabled = true;
  try {
    if (onServer.length) await callApi({ action: "delete_stories", ids: onServer });
  } catch (error) {
    console.error("delete", error);
    selectCount.textContent = "המחיקה לא הצליחה. נסו שוב.";
    deleteBtn.disabled = false;
    return;
  }
  storeStories(loadStories().filter((story) => !shelf.selected.has(story.id)));
  setSelecting(false);
});

/* קישור שמחבר מכשיר נוסף לאותו מדף */
document.getElementById("link-btn").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}#family=${family}`;
  const linkNote = document.getElementById("link-note");
  try {
    if (navigator.share) {
      await navigator.share({ title: "Story Time", url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    linkNote.textContent = "הקישור הועתק. פתחו אותו במכשיר השני.";
  } catch (error) {
    if (error.name !== "AbortError") linkNote.textContent = link;
  }
});

renderLibrary();
syncShelf();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && reader.hidden) syncShelf();
});

/* הדמות: ציור חי שהאפליקציה מזיזה בין מצבים (buddy.js) */
const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* השיחה עם הקואלה. נוגעים בה, והיא מקשיבה ורושמת. הקלטה נעצרת לבד אחרי שתיקה,
   הקואלה חוזרת על מה ששמעה ומחכה לתשובה בבועות: אגודל ירוק והיא כותבת את הסיפור,
   אגודל אדום והיא מנענעת את הראש ומקשיבה שוב. בלי מיקרופון, מקלידים בתיבה */

const koalaStage = document.getElementById("koala-stage");
const homeScroll = document.getElementById("home-scroll");
/* הכדור בזמן כתיבה רחב מהמסך. אם הדף נגלל הצידה (iOS עושה את זה לפעמים), מחזירים אותו מיד */
homeScroll.addEventListener("scroll", () => {
  if (homeScroll.scrollLeft !== 0) homeScroll.scrollLeft = 0;
}, { passive: true });
const koalaBtn = document.getElementById("koala-btn");
const micLabel = document.getElementById("mic-label");
const heard = document.getElementById("heard");
const yesBtn = document.getElementById("yes-btn");
const noBtn = document.getElementById("no-btn");
const typeUi = document.getElementById("type-ui");

const MAX_RECORDING_MS = 30_000;
const SILENCE_MS = 1500; // שתיקה אחרי דיבור שמסיימת את ההקלטה (היה 2000; אם מיה נקטעת באמצע מחשבה, להחזיר)
const NO_SPEECH_MS = 7000; // אם לא נשמע כלום, מוותרים
const TAP_MS = 450;
const STREAM_IDLE_MS = 60_000; // המיקרופון נסגר אם לא משתמשים בו
const SHAKE_MS = 700;

const READ_BACK = (idea) => `רצית סיפור על ${idea}?`;
/* תגובה קצרה לפני שהדמות חוזרת על הרעיון. מתחלפת בכל פעם, ונשמרת מראש כדי להתנגן מיד */
const REACTIONS = [
  "וואו! רעיון מגניב!",
  "איזה רעיון!",
  "אוהו, זה נשמע מעולה!",
  "יש! אני אוהבת את זה!",
  "רעיון נהדר!",
  "מגניב! אני כבר מתרגשת!",
  "איזה כיף של רעיון!",
];
/* אחרי תיקון: הדמות מראה שהפעם הבינה */
const UNDERSTOOD = ["אה, עכשיו הבנתי!", "אהה, סליחה! עכשיו זה ברור.", "אוקיי, תיקנתי!"];
/* אחרי "לא": הדמות כנראה פספסה משהו, ומבקשת הסבר. אפשר לתקן רק חלק ("לא דגים! בגדים!") */
const ASK_AGAIN = "אופס! נראה לי שלא הבנתי משהו. תסבירי לי מה התכוונת?";
const lastPick = new Map();
function pick(list) {
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastPick.get(list)) i = (i + 1) % list.length;
  lastPick.set(list, i);
  return list[i];
}
const LABELS = {
  idle: "",
  listening: "אני מקשיבה…",
  thinking: "רגע, אני רושמת…",
  asking: "",
  shaking: "אופס, לא הבנתי משהו. תסבירי לי?",
  writing: "",
};
/* משפט קטן מעל השם, שמתחלף כשהדמות מחכה */
const IDLE_LINES = ["אז מה ניצור היום?", "על מה נחלום הלילה?", "יש לך רעיון לסיפור?", "ספרי לי על מה הסיפור"];
let idleLine = 0;
let lineLocked = false;
const NOT_HEARD = "לא שמעתי. געו בי ונסו שוב.";

const dictation = {
  stream: null,
  context: null,
  recorder: null,
  chunks: [],
  watcher: null,
  pressedAt: 0,
  starting: false,
  busy: false,
  idleTimer: null,
  text: "",
  reaction: "",
  /* הרעיון הקודם, כשהילדה מתקנת אותו (correct), מוסיפה לרעיון מוכן (extend) או מדברת שוב (more) */
  about: null,
};
const koalaVoice = new Audio();
/* עוצר את הקול של הדמות, גם אם הוא מגיע בזרם */
function stopKoalaVoice() {
  koalaVoice.pause();
  window.speechPlayer.stop();
}

const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.STORY_API_URL);
typeUi.hidden = canRecord;

/* מצב הקואלה: התנועה, הבועות והמשפט שמתחתיה */
function setLine(text) {
  if (micLabel.textContent === text) return;
  micLabel.classList.add("out");
  setTimeout(() => {
    micLabel.textContent = text;
    micLabel.classList.remove("out");
  }, 250);
}

function setKoala(state, label) {
  koalaStage.dataset.state = state;
  if (state === "idle") {
    dictation.about = null;
    cancelSpeculation();
  }
  const confirming = state === "asking" && !!dictation.text && dictation.confirm;
  yesBtn.hidden = !confirming;
  noBtn.hidden = !confirming;
  koalaBtn.disabled = state === "thinking" || state === "shaking" || state === "writing";
  heard.textContent = dictation.text;
  /* בכל מצב חוץ ממנוחה מתקרבים לדמות, והספרייה יוצאת מהפריים */
  const focus = state !== "idle";
  if (focus && !home.classList.contains("focus")) {
    homeScroll.scrollTo({ top: 0, behavior: "smooth" });
    closeMore();
  }
  home.classList.toggle("focus", focus);
  document.documentElement.classList.toggle("focus", focus);
  window.Buddy?.set(state);
  const readBack = dictation.text ? `${dictation.reaction ? `${dictation.reaction} ` : ""}${READ_BACK(dictation.text)}` : "";
  const text = label ?? (state === "asking" && readBack ? readBack : LABELS[state]);
  lineLocked = !!text;
  setLine(text || IDLE_LINES[idleLine]);
}

setInterval(() => {
  if (lineLocked || koalaStage.dataset.state !== "idle" || stillMotion.matches) return;
  idleLine = (idleLine + 1) % IDLE_LINES.length;
  setLine(IDLE_LINES[idleLine]);
}, 4000);

function recordingType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

/* המיקרופון נשאר פתוח לאורך כל השיחה עם הקואלה, כדי שאפשר יהיה להקשיב שוב בלי נגיעה */
async function openMicrophone() {
  clearTimeout(dictation.idleTimer);
  if (dictation.stream?.active) return true;
  try {
    dictation.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    console.error("microphone", error);
    // רק סירוב אמיתי מבקש אישור. שגיאה אחרת (מיקרופון תפוס, לא נמצא) מקבלת הודעה משלה
    note.textContent = error?.name === "NotAllowedError"
      ? "צריך לאשר גישה למיקרופון כדי לספר לי על הסיפור."
      : "המיקרופון לא נפתח. נסו שוב עוד רגע.";
    return false;
  }
  return true;
}

function closeMicrophoneLater() {
  clearTimeout(dictation.idleTimer);
  dictation.idleTimer = setTimeout(closeMicrophone, STREAM_IDLE_MS);
}

function closeMicrophone() {
  clearTimeout(dictation.idleTimer);
  dictation.stream?.getTracks().forEach((track) => track.stop());
  dictation.stream = null;
}

/* מאזין לעוצמת הקול: הקואלה גדלה קצת עם הקול, וההקלטה נעצרת אחרי שתיקה */
function watchSilence(onEnd) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return () => {};
  dictation.context ||= new AudioContextClass();
  dictation.context.resume().catch(() => {});
  const source = dictation.context.createMediaStreamSource(dictation.stream);
  const analyser = dictation.context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const started = performance.now();
  let noise = 0;
  let spoke = false;
  let lastSound = started;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);
    const now = performance.now();
    if (now - started < 300) {
      noise = Math.max(noise, level);
      return;
    }
    const threshold = Math.max(0.02, noise * 2.5);
    if (level > threshold) {
      spoke = true;
      lastSound = now;
    }
    koalaStage.style.setProperty("--level", Math.min(1, level / 0.15).toFixed(2));
    if (spoke && now - lastSound > SILENCE_MS) onEnd("silence");
    else if (!spoke && now - started > NO_SPEECH_MS) onEnd("nothing");
  }, 60);
  return () => {
    clearInterval(timer);
    source.disconnect();
  };
}

async function startListening() {
  if (dictation.recorder || dictation.starting || dictation.busy) return;
  dictation.starting = true;
  stopKoalaVoice();
  /* נגינה קצרה בזמן הנגיעה מאשרת לדפדפן להשמיע אחר כך את הקול של הקואלה */
  if (!dictation.unlocked) {
    dictation.unlocked = true;
    koalaVoice.src = SILENCE;
    koalaVoice.play().catch(() => {});
    // התגובות הקבועות נטענות ברקע, כדי שיתנגנו מיד כשהילדה מסיימת לדבר
    window.speechPlayer.warm([...REACTIONS, ...UNDERSTOOD], window.narrationSettings());
  }
  window.speechPlayer.unlock();
  // אם כבר יש רעיון שמחכה לאישור והילדה מדברת שוב, היא כנראה מתקנת או מוסיפה
  if (!dictation.about && dictation.text) dictation.about = { idea: dictation.text, why: "more" };
  cancelSpeculation();
  const ready = await openMicrophone();
  dictation.starting = false;
  if (!ready) {
    setKoala("idle", "");
    return;
  }
  const type = recordingType();
  const recorder = new MediaRecorder(dictation.stream, type ? { mimeType: type } : undefined);
  dictation.recorder = recorder;
  dictation.chunks = [];
  let reason = "manual";
  recorder.ondataavailable = (event) => {
    if (event.data.size) dictation.chunks.push(event.data);
  };
  recorder.onstop = () => {
    dictation.watcher?.();
    dictation.watcher = null;
    dictation.recorder = null;
    finishListening(recorder.mimeType || type, reason);
  };
  const stop = (why) => {
    reason = why;
    stopListening();
  };
  dictation.watcher = watchSilence(stop);
  dictation.maxTimer = setTimeout(() => stop("limit"), MAX_RECORDING_MS);
  recorder.start();
  note.textContent = "";
  dictation.text = "";
  dictation.confirm = false;
  setKoala("listening");
}

function stopListening() {
  clearTimeout(dictation.maxTimer);
  if (dictation.recorder?.state === "recording") dictation.recorder.stop();
}

function cancelDictation() {
  cancelSpeculation();
  if (dictation.recorder) {
    dictation.cancelled = true;
    stopListening();
  }
  stopKoalaVoice();
  closeMicrophone();
  dictation.text = "";
  if (!home.classList.contains("waiting")) setKoala("idle");
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function finishListening(type, reason) {
  const blob = new Blob(dictation.chunks, { type });
  dictation.chunks = [];
  if (dictation.cancelled) {
    dictation.cancelled = false;
    return;
  }
  if (reason === "nothing" || blob.size < 1000) {
    closeMicrophoneLater();
    setKoala("idle", NOT_HEARD);
    return;
  }
  dictation.busy = true;
  setKoala("thinking");
  const about = dictation.about;
  try {
    /* השרת מתמלל ומסכם את הרעיון בקריאה אחת. כשיש רעיון קודם, הוא מצורף כדי שתיקון חלקי יעבוד */
    const response = await fetch(window.STORY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
      body: JSON.stringify({
        action: "transcribe",
        audio: await toBase64(blob),
        type: blob.type,
        ...(about ? { context: about } : {}),
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    // הרעיון נכנס ל"רצית סיפור על ___?", אז בלי "סיפור על" כפול ובלי נקודה בסוף (גם השרת מנקה, ליתר ביטחון)
    let idea = (data.idea || "").trim().replace(/^(סיפור\s+)?על\s+/, "").replace(/[\s.,!?;:…]+$/, "");
    const heardText = (data.text || "").trim().replace(/[\s.,!?…]+$/, "");
    if (!idea && heardText) idea = about?.why === "extend" ? `${about.idea}, ${heardText}` : heardText;
    dictation.about = null;
    if (!idea) {
      closeMicrophoneLater();
      setKoala("idle", NOT_HEARD);
      return;
    }
    dictation.text = idea;
    dictation.reaction = pick(about?.why === "correct" ? UNDERSTOOD : REACTIONS);
    topicInput.value = idea;
    try {
      localStorage.setItem(DRAFT_KEY, idea);
    } catch {}
    // הסיפור מתחיל להיכתב כבר עכשיו. אם הילדה תאשר, הוא יהיה מוכן מוקדם יותר
    speculate(idea);
    /* התגובה ("וואו!") שמורה ומתנגנת מיד, ובזמן הזה השאלה כבר נוצרת. הבועות מופיעות בסוף */
    setKoala("asking");
    await koalaSays([dictation.reaction, READ_BACK(idea)], [dictation.reaction]);
    if (dictation.text !== idea) return;
    dictation.confirm = true;
    setKoala("asking");
    closeMicrophoneLater();
  } catch (error) {
    console.error("dictation", error);
    closeMicrophoneLater();
    setKoala("idle", "לא הצלחתי לשמוע. געו בי ונסו שוב.");
  } finally {
    dictation.busy = false;
  }
}

/* הקואלה מדברת, ומחכים עד שסיימה. אפשר כמה משפטים ברצף. remember: משפטים קבועים לשמור לפעם הבאה.
   אם הקול לא נטען, ממשיכים בלי לחכות */
async function koalaSays(texts, remember = []) {
  try {
    await window.speechPlayer.say(texts, window.narrationSettings(), { remember });
  } catch (error) {
    if (error?.name !== "AbortError") console.error("koala voice", error);
  }
}

/* נגיעה ברעיון: הדמות שואלת "רצית סיפור על גלידה?" ומחכה. אפשר לענות בבועות,
   או לגעת בה ולספר מה יקרה בסיפור, ואז מה שהילדה אמרה מתווסף לרעיון */
function startIdea(name) {
  if (home.classList.contains("waiting") || dictation.busy || dictation.recorder) return;
  closeMore();
  stopKoalaVoice();
  window.speechPlayer.unlock();
  dictation.text = name;
  dictation.reaction = "";
  dictation.confirm = false;
  topicInput.value = name;
  setKoala("asking");
  dictation.about = { idea: name, why: "extend" };
  speculate(name);
  koalaSays(`${READ_BACK(name)} אפשר גם לספר לי מה יקרה בו.`).then(() => {
    if (dictation.text !== name || koalaStage.dataset.state !== "asking") return;
    dictation.confirm = true;
    setKoala("asking");
  });
}

yesBtn.addEventListener("click", () => {
  stopKoalaVoice();
  const topic = dictation.text;
  dictation.text = "";
  dictation.about = null;
  dictation.confirm = false;
  closeMicrophone();
  if (!topic) return;
  // אם הסיפור כבר נכתב ברקע על אותו רעיון, רק מציגים אותו
  if (job?.speculative && !job.committed && job.topic === topic) job.commit();
  else createStory(topic);
});

noBtn.addEventListener("click", async () => {
  stopKoalaVoice();
  cancelSpeculation();
  // הרעיון הקודם נשמר, כדי שהילדה תוכל לתקן רק את מה שלא הבנתי
  if (dictation.text) dictation.about = { idea: dictation.text, why: "correct" };
  dictation.text = "";
  dictation.reaction = "";
  dictation.confirm = false;
  setKoala("shaking");
  await Promise.all([koalaSays(ASK_AGAIN), new Promise((resolve) => setTimeout(resolve, SHAKE_MS))]);
  if (koalaStage.dataset.state === "shaking") startListening();
});

koalaBtn.addEventListener("contextmenu", (event) => event.preventDefault());

koalaBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (koalaBtn.disabled || home.classList.contains("waiting")) return;
  if (!canRecord) {
    topicInput.focus();
    return;
  }
  if (dictation.recorder) {
    stopListening();
    return;
  }
  dictation.pressedAt = performance.now();
  window.Buddy?.squish();
  koalaBtn.setPointerCapture(event.pointerId);
  startListening();
});

/* מי שמחזיקה ומשחררת מסיימת את ההקלטה. נגיעה קצרה משאירה אותה פתוחה עד שתיקה או נגיעה נוספת */
koalaBtn.addEventListener("pointerup", () => {
  if (dictation.recorder && performance.now() - dictation.pressedAt > TAP_MS) stopListening();
});

koalaBtn.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (dictation.recorder) stopListening();
  else startListening();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") cancelDictation();
});

window.Buddy?.mount(koalaStage);
setKoala("idle");


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
  if (bookChanged) refreshBook();
  else renderStatic();
  if (completed) narration.start();
}

/* עמודים חדשים נכנסים לספר רק כשהדף לא באמצע דפדוף */
let bookChanged = false;
function refreshBook() {
  if (reader.hidden) return;
  if (turn || animating) {
    bookChanged = true;
    return;
  }
  bookChanged = false;
  fitText();
  renderStatic();
  narration.resumeIfWaiting();
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

/* ב-Safari גרירה מהקצה היא מחוות חזרה של הדפדפן, אז הספר תופס את המגע לפניו */
stage.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });

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

/* הקראה. הכפתור נשאר דלוק או כבוי גם בפעם הבאה שהספר נפתח.
   כשהוא דלוק, הדפים שעל המסך מוקראים לפי הסדר, ואז הספר מדפדף לבד */

const NARRATION_KEY = "story-time-narration";
const narrateBtn = document.getElementById("narrate-btn");
/* קובץ קול ריק: מנגנים אותו בלחיצה, כדי שהדפדפן ירשה להשמיע אחר כך בלי לחיצה */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const narration = {
  on: false,
  audio: new Audio(),
  run: 0,
  waiting: false,
  clips: new Map(),

  sentences(page) {
    if (!page || page.kind === "pending") return [];
    return window.splitSentences(page.lines);
  },

  visible() {
    const at = view.spread ? [view.index, view.index + 1] : [view.index];
    return at.map((i) => pages[i]);
  },

  /* קול לכל משפט נטען פעם אחת בכל פתיחה של האפליקציה, לכל הגדרות קול */
  clip(text, settings) {
    const key = `${settings.speed}|${settings.stability}|${text}`;
    if (!this.clips.has(key)) {
      const request = window.fetchSpeech(text, settings);
      request.catch(() => this.clips.delete(key));
      this.clips.set(key, request);
    }
    return this.clips.get(key);
  },

  /* מכין מראש הקראה לעמודים, ברקע. כל משפט נוצר פעם אחת ונשמר בשרת */
  prepare(list) {
    const settings = window.narrationSettings();
    list.forEach((page) => this.sentences(page).forEach((text) => this.clip(text, settings).catch(() => {})));
  },

  /* מכין מראש את הכפולה הבאה, כדי שלא תהיה הפסקה אחרי הדפדוף */
  prefetchNext(settings) {
    const step = view.spread ? 2 : 1;
    for (let i = view.index + step; i < view.index + 2 * step; i++) {
      this.sentences(pages[i]).forEach((text) => this.clip(text, settings).catch(() => {}));
    }
  },

  play(url, run) {
    return new Promise((resolve) => {
      if (run !== this.run) return resolve(false);
      const audio = this.audio;
      const done = (ok) => {
        audio.onended = audio.onerror = null;
        resolve(ok && run === this.run);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.src = url;
      audio.play().catch(() => done(false));
    });
  },

  pause(ms, run) {
    return new Promise((resolve) => setTimeout(() => resolve(run === this.run), ms));
  },

  async start() {
    const run = ++this.run;
    this.audio.pause();
    this.waiting = false;
    narrateBtn.classList.remove("speaking");
    if (!this.on || reader.hidden) return;
    const visible = this.visible();
    if (visible.some((page) => page?.kind === "pending")) {
      this.waiting = true;
      return;
    }
    const settings = window.narrationSettings();
    const pagesToRead = visible.map((page) => this.sentences(page)).filter((list) => list.length);
    pagesToRead.flat().forEach((text) => this.clip(text, settings).catch(() => {}));
    this.prefetchNext(settings);
    this.prepare(pages);
    narrateBtn.classList.add("speaking");
    try {
      for (const [p, sentences] of pagesToRead.entries()) {
        if (p > 0 && !(await this.pause(settings.pageGap, run))) return;
        for (const [s, text] of sentences.entries()) {
          if (s > 0 && !(await this.pause(settings.sentenceGap, run))) return;
          const url = await this.clip(text, settings);
          if (!(await this.play(url, run))) return;
        }
      }
    } catch (error) {
      console.error("narration", error);
      return;
    } finally {
      if (run === this.run) narrateBtn.classList.remove("speaking");
    }
    if (run !== this.run || !canTurn(1)) return;
    setTimeout(() => {
      if (run === this.run && this.on && !reader.hidden) autoTurn(1, view.h);
    }, settings.turnDelay);
  },

  resumeIfWaiting() {
    if (this.waiting && !this.visible().some((page) => page?.kind === "pending")) this.start();
  },

  stop() {
    this.run++;
    this.waiting = false;
    this.audio.pause();
    narrateBtn.classList.remove("speaking");
  },

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.src = SILENCE;
    this.audio.play().catch(() => {});
  },

  set(on) {
    this.on = on;
    narrateBtn.setAttribute("aria-pressed", String(on));
    narrateBtn.setAttribute("aria-label", on ? "הקראה פועלת" : "הקראה כבויה");
    try {
      localStorage.setItem(NARRATION_KEY, on ? "on" : "off");
    } catch {}
  },
};

try {
  narration.set(localStorage.getItem(NARRATION_KEY) === "on");
} catch {
  narration.set(false);
}

narrateBtn.addEventListener("click", () => {
  narration.unlock();
  narration.set(!narration.on);
  if (narration.on) narration.start();
  else narration.stop();
});

/* כל לחיצה בספר מאשרת לדפדפן להשמיע קול */
reader.addEventListener("pointerdown", () => narration.unlock(), { capture: true });
document.addEventListener("click", () => narration.unlock(), { capture: true, once: true });

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 120);
});

if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

resetForm();

/* הספר לא נכנס להיסטוריה של הדפדפן, כדי שהחלקה מהקצה לא תחזור לדף הפתיחה */
if (location.hash) history.replaceState(null, "", location.pathname);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
