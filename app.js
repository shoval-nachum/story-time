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
const WAIT_STATUS = "הירח כותב סיפור…";
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
  moon.classList.toggle("happy", on);
}

/* הסיפור נכתב בזרם. כל חלק שמגיע נערך ומנוקד, לפי הסדר,
   והספר נפתח כשהכותרת והעמוד הראשון מוכנים. השאר מתמלא בזמן הקריאה */
async function createStory(topic) {
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

  job = { controller };
  setWaiting(true);
  note.textContent = WAIT_STATUS;

  const writing = streamWrite(topic, signal, (message) => {
    if (message.title !== undefined) {
      draft.title = message.title;
      draft.emoji = message.emoji || "";
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
      if (from === 0) {
        pages = book;
        setWaiting(false);
        resetForm();
        openBook();
      } else {
        refreshBook();
      }
    }
    await writing;
    job = null;
    saveStory({
      title: book[0].lines[0],
      emoji: draft.emoji,
      pages: book.slice(1, PAGE_COUNT + 1).map((page) => page.lines),
    });
  } catch (error) {
    job = null;
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
  document.getElementById("theme-color").content = "#2bb3ff";
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

function renderLibrary() {
  const stories = sortedStories();
  library.hidden = stories.length === 0;
  home.classList.toggle("has-library", stories.length > 0);
  if (!stories.length && shelf.selecting) setSelecting(false);
  storyList.className = `story-list ${shelf.view}`;
  storyList.classList.toggle("selecting", shelf.selecting);
  storyList.replaceChildren(
    ...stories.map((story) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "story-item";
      button.dataset.id = story.id;
      if (shelf.selecting) button.setAttribute("aria-pressed", String(shelf.selected.has(story.id)));
      const emoji = document.createElement("span");
      emoji.className = "story-emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = story.emoji || "📖";
      const name = document.createElement("span");
      name.className = "story-name";
      name.textContent = story.title;
      const check = document.createElement("span");
      check.className = "story-check";
      check.setAttribute("aria-hidden", "true");
      button.append(emoji, name, check);
      item.append(button);
      return item;
    }),
  );
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

function setSelecting(on) {
  shelf.selecting = on;
  shelf.selected.clear();
  selectBtn.setAttribute("aria-pressed", String(on));
  selectBtn.textContent = on ? "סיום" : "בחירה";
  library.classList.toggle("selecting", on);
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

storyList.addEventListener("click", (event) => {
  const button = event.target.closest(".story-item");
  if (!button) return;
  const { id } = button.dataset;
  if (shelf.selecting) {
    if (shelf.selected.has(id)) shelf.selected.delete(id);
    else shelf.selected.add(id);
    renderLibrary();
    return;
  }
  const story = loadStories().find((s) => s.id === id);
  if (story) openSaved(story);
});

renderLibrary();
syncShelf();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && reader.hidden) syncShelf();
});

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

/* הכתבה: הילדה מספרת לירח על מה הסיפור. לוחצים ומחזיקים ומדברים, או נוגעים פעם אחת
   כדי להתחיל ופעם נוספת כדי לסיים. הטקסט נכנס לתיבה, והירח מקריא אותו בחזרה לאישור */

const micBtn = document.getElementById("mic-btn");
const micLabel = document.getElementById("mic-label");
const MAX_RECORDING_MS = 30_000;
const TAP_MS = 450;
const dictation = { recorder: null, stream: null, chunks: [], pressedAt: 0, timer: null, busy: false, starting: false };
const readBack = new Audio();

const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.STORY_API_URL);
micBtn.hidden = !canRecord;

function recordingType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function setMic(state) {
  micBtn.classList.toggle("recording", state === "recording");
  micBtn.classList.toggle("busy", state === "busy");
  micLabel.textContent = state === "recording" ? "הירח מקשיב…" : state === "busy" ? "רגע…" : "ספרו לירח";
  moon.classList.toggle("happy", state !== "idle");
}

async function startRecording() {
  if (dictation.recorder || dictation.busy || dictation.starting) return;
  dictation.starting = true;
  readBack.pause();
  /* נגינה קצרה בזמן הלחיצה מאשרת לדפדפן להשמיע אחר כך את הקול של הירח */
  readBack.src = SILENCE;
  readBack.play().catch(() => {});
  try {
    dictation.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.error("microphone", error);
    note.textContent = "צריך לאשר גישה למיקרופון כדי לספר לירח.";
    return;
  } finally {
    dictation.starting = false;
  }
  const type = recordingType();
  const recorder = new MediaRecorder(dictation.stream, type ? { mimeType: type } : undefined);
  dictation.recorder = recorder;
  dictation.chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) dictation.chunks.push(event.data);
  };
  recorder.onstop = () => finishRecording(recorder.mimeType || type);
  recorder.start();
  dictation.timer = setTimeout(stopRecording, MAX_RECORDING_MS);
  note.textContent = "";
  setMic("recording");
  lookAt(0, 8);
}

function stopRecording() {
  clearTimeout(dictation.timer);
  if (dictation.recorder?.state === "recording") dictation.recorder.stop();
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function finishRecording(type) {
  dictation.stream?.getTracks().forEach((track) => track.stop());
  dictation.stream = null;
  dictation.recorder = null;
  const blob = new Blob(dictation.chunks, { type });
  dictation.chunks = [];
  if (blob.size < 1000) {
    setMic("idle");
    note.textContent = "לא שמעתי. לחצו והחזיקו, ודברו.";
    return;
  }
  dictation.busy = true;
  setMic("busy");
  try {
    const response = await fetch(window.STORY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
      body: JSON.stringify({ action: "transcribe", audio: await toBase64(blob), type: blob.type }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const text = (data.text || "").trim();
    if (!text) {
      note.textContent = "לא שמעתי. נסו שוב.";
      return;
    }
    topicInput.value = text;
    topicInput.dispatchEvent(new Event("input"));
    note.textContent = "";
    speakBack(text);
  } catch (error) {
    console.error("dictation", error);
    note.textContent = "לא הצלחתי לשמוע. נסו שוב.";
  } finally {
    dictation.busy = false;
    setMic("idle");
  }
}

/* הירח חוזר על הרעיון, כדי שהילדה תדע שהבין אותה */
async function speakBack(text) {
  try {
    const url = await window.fetchSpeech(`רצית סיפור על ${text}?`, window.narrationSettings());
    readBack.src = url;
    await readBack.play();
  } catch (error) {
    console.error("read back", error);
  }
}

micBtn.addEventListener("contextmenu", (event) => event.preventDefault());

micBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (dictation.recorder) {
    stopRecording();
    return;
  }
  dictation.pressedAt = performance.now();
  micBtn.setPointerCapture(event.pointerId);
  startRecording();
});

/* שחרור אחרי לחיצה ארוכה מסיים את ההקלטה. נגיעה קצרה משאירה אותה פתוחה עד הנגיעה הבאה */
micBtn.addEventListener("pointerup", () => {
  if (dictation.recorder && performance.now() - dictation.pressedAt > TAP_MS) stopRecording();
});

micBtn.addEventListener("pointercancel", stopRecording);

micBtn.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (dictation.recorder) stopRecording();
  else startRecording();
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
