"use strict";

/* הגדרות ההקראה. משנים אותן במעבדת הקול (voice-lab.html).
   הערכים כאן הם ברירת המחדל לכל המכשירים. מה שנשמר במעבדה חל רק על המכשיר שבו נשמר */
window.NARRATION_DEFAULTS = {
  speed: 0.85, // קצב הקול: 0.7 עד 1.2 (ב-Gemini הופך להוראה במילים: לאט, רגוע, טבעי, מהיר)
  stability: 0.5, // הבעה: 0 משחקת את הדמויות, 0.5 חמה, 1 שקטה ומרגיעה
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
      // באייפון, Web Audio מושתק כשהמתג בצד על שקט. "playback" משמיע בכל מקרה
      try {
        if (navigator.audioSession) navigator.audioSession.type = "playback";
      } catch {}
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

  /* אומר משפט ומחכה עד שנגמר. נזרקת שגיאה אם ההקראה נכשלה */
  async function say(text, settings) {
    stop();
    const mine = run;
    const c = context();
    // בלי נגיעה קודמת הדפדפן לא תמיד מאשר, אז לא מחכים לנצח
    if (c.state !== "running") {
      await Promise.race([c.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 300))]);
    }
    controller = new AbortController();
    const response = await fetch(window.STORY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.STORY_API_KEY },
      body: JSON.stringify({
        action: "speak",
        stream: true,
        text,
        voice: { speed: settings.speed, stability: settings.stability },
      }),
      signal: controller.signal,
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.startsWith("audio/")) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "speech_failed");
    }
    let end = 0;
    if (type.startsWith("audio/wav")) {
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      if (mine !== run) return;
      end = schedule(buffer, c.currentTime + 0.02);
    } else {
      const reader = response.body.getReader();
      let rest = new Uint8Array(0);
      let at = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (mine !== run) return;
        if (done) break;
        const bytes = new Uint8Array(rest.length + value.length);
        bytes.set(rest);
        bytes.set(value, rest.length);
        const even = bytes.length & ~1;
        rest = bytes.slice(even);
        if (!even) continue;
        if (!at) at = c.currentTime + LEAD;
        at = schedule(pcmBuffer(bytes.slice(0, even)), at);
      }
      end = at;
    }
    controller = null;
    const wait = Math.max(0, end - c.currentTime);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000 + 50));
  }

  return { unlock, stop, say };
})();
