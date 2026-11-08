"use strict";

/* הגדרות ההקראה. משנים אותן במעבדת הקול (voice-lab.html).
   הערכים כאן הם ברירת המחדל לכל המכשירים. מה שנשמר במעבדה חל רק על המכשיר שבו נשמר */
window.NARRATION_DEFAULTS = {
  speed: 1, // קצב הקול: 0.7 עד 1.2 (ב-Gemini הופך להוראה במילים: לאט, רגוע, טבעי, מהיר)
  stability: 0.2, // הבעה: 0 משחקת את הדמויות, 0.5 חמה, 1 שקטה ומרגיעה. 1 ו-0.2 נבחרו בהאזנה (דוגמה 5, 8 בנובמבר 2026)
  sentenceGap: 700, // שקט בין משפטים, באלפיות שנייה
  pageGap: 1000, // שקט בין שני העמודים של כפולה
  turnDelay: 1500, // שקט בסוף העמודים, לפני שהספר מדפדף לבד
};

window.NARRATION_LIMITS = {
  speed: [0.7, 1.2],
  stability: [0, 1],
  sentenceGap: [0, 3000],
  pageGap: [0, 4000],
  turnDelay: [0, 5000],
};

window.NARRATION_OVERRIDE_KEY = "story-time-voice";

window.narrationSettings = function () {
  const settings = { ...window.NARRATION_DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(window.NARRATION_OVERRIDE_KEY) || "{}");
    for (const [name, [min, max]] of Object.entries(window.NARRATION_LIMITS)) {
      const value = Number(saved[name]);
      if (Number.isFinite(value) && value >= min && value <= max) settings[name] = value;
    }
  } catch {}
  return settings;
};

/* מחלק עמוד למשפטים. שורות בעמוד הן לרוב חלקים של אותו משפט, אז קודם מחברים אותן,
   ואז חותכים אחרי נקודה, סימן שאלה, סימן קריאה או שלוש נקודות, כולל מירכאות שאחריהם */
window.splitSentences = function (lines) {
  const text = lines.join(" ").replaceAll("**", "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  return text
    .split(/(?<=[.!?…]["'”״]?)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[א-ת]/.test(sentence));
};

/* ההקראה עוברת דרך Gemini TTS. שולחים עד 3 משפטים בבת אחת,
   לפי הסדר שבו ביקשו אותם, כך שהמשפט הבא תמיד מוכן ראשון */
const SPEECH_AT_ONCE = 3;
let speechActive = 0;
const speechQueue = [];

function speechSlot() {
  if (speechActive < SPEECH_AT_ONCE) {
    speechActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => speechQueue.push(resolve));
}

function releaseSpeechSlot() {
  const next = speechQueue.shift();
  if (next) next();
  else speechActive--;
}

/* קול למשפט אחד, בהגדרות הנוכחיות */
window.fetchSpeech = async function (text, settings, signal) {
  await speechSlot();
  try {
    return await requestSpeech(text, settings, signal);
  } finally {
    releaseSpeechSlot();
  }
};

async function requestSpeech(text, settings, signal) {
  const response = await fetch(window.STORY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
    body: JSON.stringify({
      action: "speak",
      text,
      voice: { speed: settings.speed, stability: settings.stability },
    }),
    signal,
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "speech_failed");
  }
  return URL.createObjectURL(await response.blob());
}

/* קול בזרם, לשורות של הדמות: הצליל מתחיל ברגע שהחלק הראשון מגיע, בלי לחכות לכל המשפט.
   אם המשפט כבר שמור בשרת, מגיע WAV שלם. מנגנים דרך Web Audio, שצריך אישור בנגיעה (unlock) */
window.speechPlayer = (() => {
  const RATE = 24000;
  const LEAD = 0.15; // מרווח קטן לפני החלק הראשון, כדי שלא יהיו קפיצות
  let ctx = null;
  let run = 0;
  let sources = [];
  let controller = null;

  function context() {
    if (!ctx) {
      // לא קובעים כאן navigator.audioSession.type = "playback": זה חוסם את המיקרופון בספארי ובאפליקציה.
      // בזמן השיחה המיקרופון פתוח, ואז הקול נשמע גם כשהמתג בצד על שקט
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  function unlock() {
    const c = context();
    if (c.state !== "running") c.resume().catch(() => {});
  }

  function stop() {
    run++;
    controller?.abort();
    controller = null;
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    sources = [];
  }

  /* מנגן חלק ומחזיר מתי הוא נגמר */
  function schedule(buffer, at) {
    const c = context();
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    const start = Math.max(at, c.currentTime + 0.02);
    source.start(start);
    sources.push(source);
    source.onended = () => (sources = sources.filter((s) => s !== source));
    return start + buffer.duration;
  }

  function pcmBuffer(bytes) {
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
    const buffer = context().createBuffer(1, samples.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    return buffer;
  }

  /* מבקש קול למשפט. use: "chat" הוא הקול המהיר של השיחה */
  function request(text, settings, signal) {
    return fetch(window.STORY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
      body: JSON.stringify({
        action: "speak",
        stream: true,
        text,
        voice: { speed: settings.speed, stability: settings.stability, use: "chat" },
      }),
      signal,
    });
  }

  /* משפטים קבועים (כמו "וואו!") נשמרים גם כאן, כדי שיתנגנו מיד בלי לפנות לשרת */
  const saved = new Map();

  /* מנגן תשובה אחת אחרי הנקודה at, ומחזיר מתי היא נגמרת */
  async function playResponse(response, at, mine) {
    const c = context();
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.startsWith("audio/")) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "speech_failed");
    }
    if (type.startsWith("audio/wav")) {
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      if (mine !== run) return null;
      return { end: schedule(buffer, at), buffer };
    }
    const reader = response.body.getReader();
    let rest = new Uint8Array(0);
    let next = at;
    let first = true;
    while (true) {
      const { value, done } = await reader.read();
      if (mine !== run) return null;
      if (done) break;
      const bytes = new Uint8Array(rest.length + value.length);
      bytes.set(rest);
      bytes.set(value, rest.length);
      const even = bytes.length & ~1;
      rest = bytes.slice(even);
      if (!even) continue;
      if (first) next = Math.max(next, c.currentTime + LEAD);
      first = false;
      next = schedule(pcmBuffer(bytes.slice(0, even)), next);
    }
    return { end: next };
  }

  /* אומר משפט, או כמה משפטים ברצף, ומחכה עד שנגמרו. כל המשפטים מתבקשים מיד ובמקביל,
     כך שבזמן ש"וואו!" מתנגן, המשפט הבא כבר נוצר. נזרקת שגיאה אם ההקראה נכשלה */
  async function say(texts, settings, { remember = [] } = {}) {
    const list = Array.isArray(texts) ? texts : [texts];
    stop();
    const mine = run;
    const c = context();
    // בלי נגיעה קודמת הדפדפן לא תמיד מאשר, אז לא מחכים לנצח
    if (c.state !== "running") {
      await Promise.race([c.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 300))]);
    }
    controller = new AbortController();
    const signal = controller.signal;
    const key = (text) => `${settings.speed}|${settings.stability}|${text}`;
    const pending = list.map((text) => (saved.has(key(text)) ? null : request(text, settings, signal)));
    pending.forEach((request) => request?.catch(() => {}));
    let at = c.currentTime + 0.02;
    for (const [i, text] of list.entries()) {
      if (mine !== run) return;
      const buffer = saved.get(key(text));
      if (buffer) {
        at = schedule(buffer, Math.max(at, c.currentTime + 0.02));
        continue;
      }
      const played = await playResponse(await pending[i], at, mine);
      if (!played) return;
      at = played.end;
      if (played.buffer && remember.includes(text)) saved.set(key(text), played.buffer);
    }
    controller = null;
    const wait = Math.max(0, at - c.currentTime);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000 + 50));
  }

  /* מכין מראש משפטים קבועים, בשקט: נשמרים בשרת וכאן, ומתנגנים מיד כשצריך אותם */
  async function warm(texts, settings) {
    for (const text of texts) {
      const k = `${settings.speed}|${settings.stability}|${text}`;
      if (saved.has(k)) continue;
      try {
        let response = await request(text, settings);
        // משפט חדש מגיע בזרם ונשמר בשרת בסוף. מבקשים שוב כדי לקבל את הקובץ השמור
        if (!(response.headers.get("content-type") || "").startsWith("audio/wav")) {
          await response.arrayBuffer();
          response = await request(text, settings);
        }
        if (!(response.headers.get("content-type") || "").startsWith("audio/wav")) continue;
        saved.set(k, await context().decodeAudioData(await response.arrayBuffer()));
      } catch (error) {
        console.error("warm voice", error);
      }
    }
  }

  return { unlock, stop, say, warm };
})();
