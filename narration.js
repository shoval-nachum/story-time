"use strict";

/* הגדרות ההקראה. משנים אותן במעבדת הקול (voice-lab.html).
   הערכים כאן הם ברירת המחדל לכל המכשירים. מה שנשמר במעבדה חל רק על המכשיר שבו נשמר */
window.NARRATION_DEFAULTS = {
  speed: 0.85, // מהירות הקול: 0.7 עד 1.2
  stability: 0.5, // יציבות הקול: 0 משתנה ומלא הבעה, 1 אחיד ושקט
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

/* תוכנית Starter של ElevenLabs מקבלת עד 3 בקשות בבת אחת, אז שולחים לכל היותר 2.
   המשפטים נשלחים לפי הסדר שבו ביקשו אותם, כך שהמשפט הבא תמיד מוכן ראשון */
const SPEECH_AT_ONCE = 2;
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
