const PHRASES = [
  'А ну положил быстро, нахуй!',
  'Куда полез, козёл?',
  'Не трожь чужое!',
  'Положь на место, сука!',
  'Кому говорю — положи телефон!',
  'Ты что творишь, охуел?',
  'Руки убрал, быстро!',
  'Чё ты лапаешь?',
  'Положи телефон, мудила!',
  'Поставь на место, я кому сказал!',
  'Не лезь, куда не просят!',
  'Полегче с моим телефоном, блядь!',
  'Куда поднял, баран?',
  'А ну отпустил, быстро!',
  'Слышь, положи нахуй!',
  'Ты охуел вообще?',
  'Опусти телефон, дебил!',
  'Я тебе сейчас руки оторву!',
  'Стоять, не двигаться!',
  'Ну-ка положил обратно!',
  'Ты куда лезешь, придурок?',
  'Закрой глазки и отойди!',
  'Это не твоё, понял?',
  'Положь, пока цел!',
  'Тебя тут не стояло!',
];

const state = {
  armed: false,
  cooldownUntil: 0,
  lastPhraseIndex: -1,
  voice: null,
  threshold: 3,
  peak: 0,
  events: 0,
  lastValue: 0,
  rotPeak: 0,
};

const els = {
  start: document.getElementById('start'),
  status: document.getElementById('status'),
  last: document.getElementById('last'),
  bar: document.getElementById('bar'),
  sensitivity: document.getElementById('sensitivity'),
  sensitivityValue: document.getElementById('sensitivityValue'),
  testBtn: document.getElementById('testBtn'),
};

function pickPhrase() {
  if (PHRASES.length <= 1) return PHRASES[0];
  let i;
  do { i = Math.floor(Math.random() * PHRASES.length); } while (i === state.lastPhraseIndex);
  state.lastPhraseIndex = i;
  return PHRASES[i];
}

function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices();
  state.voice =
    voices.find(v => v.lang === 'ru-RU') ||
    voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ru')) ||
    null;
}

function speak(text) {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ru-RU';
  if (state.voice) u.voice = state.voice;
  u.rate = 1.05;
  u.pitch = 0.85;
  u.volume = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function trigger() {
  const phrase = pickPhrase();
  els.last.textContent = '«' + phrase + '»';
  speak(phrase);
}

function motionValue(e) {
  // Prefer linear acceleration (gravity removed) — most accurate.
  const lin = e.acceleration;
  if (lin && (lin.x != null || lin.y != null || lin.z != null)) {
    return Math.hypot(lin.x || 0, lin.y || 0, lin.z || 0);
  }
  // Fallback: total acceleration minus gravity magnitude.
  const a = e.accelerationIncludingGravity;
  if (!a) return 0;
  const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  return Math.abs(mag - 9.81);
}

function rotationValue(e) {
  const r = e.rotationRate;
  if (!r) return 0;
  // deg/s magnitude. Scale down so it's comparable to accel m/s².
  return Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) / 50;
}

function onMotion(e) {
  if (!state.armed) return;

  const accel = motionValue(e);
  const rot = rotationValue(e);
  const value = Math.max(accel, rot);

  state.events++;
  state.lastValue = value;
  // Decaying peak so the meter has visible history.
  state.peak = Math.max(state.peak * 0.9, value);

  const norm = Math.min(1, state.peak / Math.max(0.5, state.threshold * 1.5));
  els.bar.style.width = (norm * 100) + '%';

  if (state.events % 20 === 0) {
    els.status.textContent =
      'События: ' + state.events +
      ' · сейчас: ' + value.toFixed(2) +
      ' · порог: ' + state.threshold.toFixed(2);
  }

  const now = performance.now();
  if (value > state.threshold && now > state.cooldownUntil) {
    state.cooldownUntil = now + 2500;
    trigger();
  }
}

async function requestSensorPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    const r = await DeviceMotionEvent.requestPermission();
    if (r !== 'granted') throw new Error('Доступ к датчикам запрещён');
  }
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { await DeviceOrientationEvent.requestPermission(); } catch (_) { /* not critical */ }
  }
}

async function arm() {
  try {
    await requestSensorPermission();
  } catch (e) {
    els.status.textContent = e.message;
    return;
  }

  if (!('DeviceMotionEvent' in window)) {
    els.status.textContent = 'Этот браузер не даёт доступ к датчикам движения.';
    return;
  }

  // Speak once on user gesture so the engine warms up and is allowed to speak later.
  speak('Охрана включена. Не трогай.');

  state.events = 0;
  state.peak = 0;
  state.cooldownUntil = performance.now() + 1500; // grace period after arming
  window.addEventListener('devicemotion', onMotion);
  state.armed = true;
  els.start.textContent = 'Выключить';
  els.start.classList.add('armed');
  els.status.textContent = 'Охрана активна. Положи телефон.';
}

function disarm() {
  state.armed = false;
  window.removeEventListener('devicemotion', onMotion);
  els.start.textContent = 'Включить охрану';
  els.start.classList.remove('armed');
  els.status.textContent = 'Остановлено';
  els.bar.style.width = '0%';
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

els.start.addEventListener('click', () => {
  if (state.armed) disarm(); else arm();
});

els.sensitivity.addEventListener('input', () => {
  // Slider value is "sensitivity" 1..8; we invert into a threshold so
  // higher slider = lower threshold = more sensitive.
  const s = parseFloat(els.sensitivity.value);
  state.threshold = 9 - s;
  els.sensitivityValue.textContent = s.toFixed(1);
});

els.testBtn.addEventListener('click', () => {
  pickVoice();
  trigger();
});

// Voices populate asynchronously in some browsers.
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = pickVoice;
  pickVoice();
}

// Initialize threshold from default slider.
state.threshold = 9 - parseFloat(els.sensitivity.value);
els.sensitivityValue.textContent = parseFloat(els.sensitivity.value).toFixed(1);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('SW registration failed:', e);
    });
  });
}
