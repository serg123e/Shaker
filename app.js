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
  lastRecIndex: -1,
  voice: null,
  voiceURI: null,
  ttsPitch: 0.6,
  recPitch: 0.78,
  useRecordings: true,
  threshold: 3,
  peak: 0,
  events: 0,
  lastValue: 0,
  rotPeak: 0,
};

let audioCtx = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recordings = [];

const els = {
  start: document.getElementById('start'),
  status: document.getElementById('status'),
  last: document.getElementById('last'),
  bar: document.getElementById('bar'),
  sensitivity: document.getElementById('sensitivity'),
  sensitivityValue: document.getElementById('sensitivityValue'),
  testBtn: document.getElementById('testBtn'),
  debugBtn: document.getElementById('debugBtn'),
  dbgSecure: document.getElementById('dbgSecure'),
  dbgMotionApi: document.getElementById('dbgMotionApi'),
  dbgNeedsPerm: document.getElementById('dbgNeedsPerm'),
  dbgPerm: document.getElementById('dbgPerm'),
  dbgEvents: document.getElementById('dbgEvents'),
  dbgInterval: document.getElementById('dbgInterval'),
  dbgAccel: document.getElementById('dbgAccel'),
  dbgAccelMag: document.getElementById('dbgAccelMag'),
  dbgAccelG: document.getElementById('dbgAccelG'),
  dbgAccelGMag: document.getElementById('dbgAccelGMag'),
  dbgRot: document.getElementById('dbgRot'),
  dbgRotMag: document.getElementById('dbgRotMag'),
  dbgSignal: document.getElementById('dbgSignal'),
  voiceSelect: document.getElementById('voiceSelect'),
  ttsPitch: document.getElementById('ttsPitch'),
  ttsPitchValue: document.getElementById('ttsPitchValue'),
  recordBtn: document.getElementById('recordBtn'),
  recPitch: document.getElementById('recPitch'),
  recPitchValue: document.getElementById('recPitchValue'),
  useRecordingsToggle: document.getElementById('useRecordingsToggle'),
  recordingsList: document.getElementById('recordingsList'),
  clearRecordings: document.getElementById('clearRecordings'),
};

const debug = {
  listening: false,
  lastUpdate: 0,
};

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return (n >= 0 ? ' ' : '') + n.toFixed(2);
}

function updateDebug(e) {
  const now = performance.now();
  // Throttle to ~10 fps so the panel is readable.
  if (now - debug.lastUpdate < 100) return;
  debug.lastUpdate = now;

  const lin = e.acceleration || {};
  const grav = e.accelerationIncludingGravity || {};
  const rot = e.rotationRate || {};

  els.dbgEvents.textContent = String(state.events);
  els.dbgInterval.textContent = e.interval != null ? e.interval.toFixed(1) : '—';

  if (lin.x != null || lin.y != null || lin.z != null) {
    els.dbgAccel.textContent = fmt(lin.x) + ' / ' + fmt(lin.y) + ' / ' + fmt(lin.z);
    els.dbgAccelMag.textContent = Math.hypot(lin.x || 0, lin.y || 0, lin.z || 0).toFixed(2);
  } else {
    els.dbgAccel.textContent = 'null';
    els.dbgAccelMag.textContent = '—';
  }

  if (grav.x != null || grav.y != null || grav.z != null) {
    els.dbgAccelG.textContent = fmt(grav.x) + ' / ' + fmt(grav.y) + ' / ' + fmt(grav.z);
    els.dbgAccelGMag.textContent = Math.hypot(grav.x || 0, grav.y || 0, grav.z || 0).toFixed(2);
  } else {
    els.dbgAccelG.textContent = 'null';
    els.dbgAccelGMag.textContent = '—';
  }

  if (rot.alpha != null || rot.beta != null || rot.gamma != null) {
    els.dbgRot.textContent = fmt(rot.alpha) + ' / ' + fmt(rot.beta) + ' / ' + fmt(rot.gamma);
    els.dbgRotMag.textContent = Math.hypot(rot.alpha || 0, rot.beta || 0, rot.gamma || 0).toFixed(2);
  } else {
    els.dbgRot.textContent = 'null';
    els.dbgRotMag.textContent = '—';
  }

  els.dbgSignal.textContent = state.lastValue.toFixed(2) + ' / ' + state.threshold.toFixed(2);
}

function fillStaticDebug() {
  els.dbgSecure.textContent = window.isSecureContext ? 'да' : 'НЕТ (нужен HTTPS)';
  els.dbgMotionApi.textContent = ('DeviceMotionEvent' in window) ? 'есть' : 'нет';
  const needsPerm =
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function';
  els.dbgNeedsPerm.textContent = needsPerm ? 'да (iOS)' : 'нет';
}

function pickPhrase() {
  if (PHRASES.length <= 1) return PHRASES[0];
  let i;
  do { i = Math.floor(Math.random() * PHRASES.length); } while (i === state.lastPhraseIndex);
  state.lastPhraseIndex = i;
  return PHRASES[i];
}

function pickRecording() {
  if (recordings.length <= 1) return recordings[0];
  let i;
  do { i = Math.floor(Math.random() * recordings.length); } while (i === state.lastRecIndex);
  state.lastRecIndex = i;
  return recordings[i];
}

function populateVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;

  const sorted = voices.slice().sort((a, b) => {
    const ar = a.lang.toLowerCase().startsWith('ru') ? 0 : 1;
    const br = b.lang.toLowerCase().startsWith('ru') ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  els.voiceSelect.innerHTML = '';
  for (const v of sorted) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = v.name + ' (' + v.lang + ')' + (v.default ? ' ★' : '');
    els.voiceSelect.append(opt);
  }

  let chosen = state.voiceURI ? voices.find(v => v.voiceURI === state.voiceURI) : null;
  if (!chosen) {
    chosen =
      voices.find(v => v.lang === 'ru-RU') ||
      voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ru')) ||
      voices.find(v => v.default) ||
      voices[0] ||
      null;
  }
  state.voice = chosen;
  state.voiceURI = chosen ? chosen.voiceURI : null;
  if (chosen) els.voiceSelect.value = chosen.voiceURI;
}

function speak(text) {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = (state.voice && state.voice.lang) || 'ru-RU';
  if (state.voice) u.voice = state.voice;
  u.rate = 1.0;
  u.pitch = state.ttsPitch;
  u.volume = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function playRecording(rec) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const bytes = base64ToBytes(rec.data);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let buf;
  try {
    buf = await ctx.decodeAudioData(ab);
  } catch (e) {
    console.warn('decodeAudioData failed', e);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = state.recPitch;

  // Bass boost so the lower-pitched voice has body.
  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 220;
  bass.gain.value = 6;

  // Lowpass to shave the highs — sounds like rough/muffled speech.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;

  const gain = ctx.createGain();
  gain.gain.value = 1.3;

  src.connect(bass).connect(lp).connect(gain).connect(ctx.destination);
  src.start();
}

function trigger() {
  if (state.useRecordings && recordings.length > 0) {
    const rec = pickRecording();
    els.last.textContent = '▶ запись «' + (rec.label || rec.id) + '»';
    playRecording(rec);
  } else {
    const phrase = pickPhrase();
    els.last.textContent = '«' + phrase + '»';
    speak(phrase);
  }
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
  const accel = motionValue(e);
  const rot = rotationValue(e);
  const value = Math.max(accel, rot);

  state.events++;
  state.lastValue = value;
  state.peak = Math.max(state.peak * 0.9, value);

  updateDebug(e);

  if (!state.armed) return;

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

function ensureMotionListener() {
  if (debug.listening) return;
  window.addEventListener('devicemotion', onMotion);
  debug.listening = true;
}

async function requestSensorPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    const r = await DeviceMotionEvent.requestPermission();
    els.dbgPerm.textContent = r;
    if (r !== 'granted') throw new Error('Доступ к датчикам запрещён');
  } else {
    els.dbgPerm.textContent = 'не требуется';
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

  // Unlock audio + speech engines while we still have a user gesture.
  ensureAudioCtx();
  speak('Охрана включена. Не трогай.');

  state.events = 0;
  state.peak = 0;
  state.cooldownUntil = performance.now() + 1500; // grace period after arming
  ensureMotionListener();
  state.armed = true;
  els.start.textContent = 'Выключить';
  els.start.classList.add('armed');
  els.status.textContent = 'Охрана активна. Положи телефон.';
}

function disarm() {
  state.armed = false;
  // Keep the listener alive if the debug panel is using it; otherwise drop it.
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
  ensureAudioCtx();
  trigger();
});

els.debugBtn.addEventListener('click', async () => {
  try {
    await requestSensorPermission();
  } catch (e) {
    els.dbgPerm.textContent = 'отказ';
    els.status.textContent = e.message;
    return;
  }
  ensureMotionListener();
  els.debugBtn.value = 'Датчики стримят…';
  els.debugBtn.disabled = true;
});

// Recording controls
function loadStoredSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('shaker:settings') || '{}');
    if (s.voiceURI) state.voiceURI = s.voiceURI;
    if (typeof s.ttsPitch === 'number') state.ttsPitch = s.ttsPitch;
    if (typeof s.recPitch === 'number') state.recPitch = s.recPitch;
    if (typeof s.useRecordings === 'boolean') state.useRecordings = s.useRecordings;
  } catch (_) { /* ignore */ }
}

function saveStoredSettings() {
  try {
    localStorage.setItem('shaker:settings', JSON.stringify({
      voiceURI: state.voiceURI,
      ttsPitch: state.ttsPitch,
      recPitch: state.recPitch,
      useRecordings: state.useRecordings,
    }));
  } catch (_) { /* quota */ }
}

function loadRecordings() {
  try {
    recordings = JSON.parse(localStorage.getItem('shaker:recordings') || '[]');
    if (!Array.isArray(recordings)) recordings = [];
  } catch (_) { recordings = []; }
}

function saveRecordings() {
  try {
    localStorage.setItem('shaker:recordings', JSON.stringify(recordings));
  } catch (e) {
    alert('Не удалось сохранить запись — кончилось место в localStorage. Удали часть записей.');
  }
}

function renderRecordings() {
  els.recordingsList.innerHTML = '';
  if (recordings.length === 0) {
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = 'Записей пока нет — сработает синтез голоса.';
    els.recordingsList.append(p);
    return;
  }
  recordings.forEach((rec, idx) => {
    const row = document.createElement('div');
    row.className = 'rec-row';

    const playBtn = document.createElement('button');
    playBtn.className = 'play';
    playBtn.textContent = '▶';
    playBtn.title = 'Проиграть с эффектом';
    playBtn.addEventListener('click', () => playRecording(rec));

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '#' + (idx + 1) + '  ·  ' + Math.round((rec.size || 0) / 1024) + ' КБ';

    const delBtn = document.createElement('button');
    delBtn.className = 'del';
    delBtn.textContent = '✕';
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', () => {
      recordings = recordings.filter(r => r.id !== rec.id);
      saveRecordings();
      renderRecordings();
    });

    row.append(playBtn, label, delBtn);
    els.recordingsList.append(row);
  });
}

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Браузер не даёт доступ к микрофону.');
    return;
  }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    alert('Микрофон не разрешён: ' + e.message);
    return;
  }
  const mime = pickRecorderMime();
  try {
    mediaRecorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
  } catch (e) {
    alert('MediaRecorder не поддерживается: ' + e.message);
    recordingStream.getTracks().forEach(t => t.stop());
    return;
  }
  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    recordingStream = null;
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || mime || 'audio/webm' });
    if (blob.size === 0) {
      els.recordBtn.value = '🎙 Записать фразу';
      els.recordBtn.classList.remove('active');
      return;
    }
    const buf = await blob.arrayBuffer();
    const data = bytesToBase64(new Uint8Array(buf));
    recordings.push({
      id: Date.now(),
      mime: blob.type,
      size: blob.size,
      data,
    });
    saveRecordings();
    renderRecordings();
    els.recordBtn.value = '🎙 Записать фразу';
    els.recordBtn.classList.remove('active');
  };
  mediaRecorder.start();
  els.recordBtn.value = '⏹ Стоп';
  els.recordBtn.classList.add('active');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

els.recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});

els.clearRecordings.addEventListener('click', () => {
  if (recordings.length === 0) return;
  if (!confirm('Удалить все записи?')) return;
  recordings = [];
  saveRecordings();
  renderRecordings();
});

els.voiceSelect.addEventListener('change', () => {
  const voices = speechSynthesis.getVoices();
  state.voiceURI = els.voiceSelect.value;
  state.voice = voices.find(v => v.voiceURI === state.voiceURI) || null;
  saveStoredSettings();
});

els.ttsPitch.addEventListener('input', () => {
  state.ttsPitch = parseFloat(els.ttsPitch.value);
  els.ttsPitchValue.textContent = state.ttsPitch.toFixed(2);
  saveStoredSettings();
});

els.recPitch.addEventListener('input', () => {
  state.recPitch = parseFloat(els.recPitch.value);
  els.recPitchValue.textContent = state.recPitch.toFixed(2);
  saveStoredSettings();
});

els.useRecordingsToggle.addEventListener('change', () => {
  state.useRecordings = els.useRecordingsToggle.checked;
  saveStoredSettings();
});

// Voices populate asynchronously in some browsers.
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
}

// Load persisted state and reflect in UI.
loadStoredSettings();
loadRecordings();
populateVoices();
renderRecordings();
els.ttsPitch.value = state.ttsPitch;
els.ttsPitchValue.textContent = state.ttsPitch.toFixed(2);
els.recPitch.value = state.recPitch;
els.recPitchValue.textContent = state.recPitch.toFixed(2);
els.useRecordingsToggle.checked = state.useRecordings;

// Initialize threshold from default slider.
state.threshold = 9 - parseFloat(els.sensitivity.value);
els.sensitivityValue.textContent = parseFloat(els.sensitivity.value).toFixed(1);

fillStaticDebug();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('SW registration failed:', e);
    });
  });
}
