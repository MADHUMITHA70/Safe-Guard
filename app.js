// ===== State =====
let sosActive = false;
let holdTimer = null;
let holdInterval = null;
let holdProgress = 0;
const HOLD_DURATION = 2000; // ms

let settings = {
  alertMessage: '🚨 EMERGENCY! I need help. My location: {location}',
  shakeEnabled: false,
  sirenEnabled: true,
};

let contacts = [];
let currentLocation = null;
let sirenAudio = null;

// ===== DOM =====
const sosBtn        = document.getElementById('sosBtn');
const statusBar     = document.getElementById('statusBar');
const locationCard  = document.getElementById('locationCard');
const locationText  = document.getElementById('locationText');
const coordsText    = document.getElementById('coordsText');
const mapsLink      = document.getElementById('mapsLink');
const alertCard     = document.getElementById('alertCard');
const alertList     = document.getElementById('alertList');
const contactsList  = document.getElementById('contactsList');
const holdHint      = document.getElementById('holdHint');
const themeToggle   = document.getElementById('themeToggle');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const contactModal  = document.getElementById('contactModal');

// ===== Init =====
loadFromStorage();
renderContacts();
buildProgressRing();

// ===== Theme =====
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☀️Ś';
}

// ===== Settings Modal =====
settingsBtn.addEventListener('click', () => {
  document.getElementById('alertMessage').value = settings.alertMessage;
  document.getElementById('shakeToggle').checked = settings.shakeEnabled;
  document.getElementById('sirenToggle').checked = settings.sirenEnabled;
  settingsModal.classList.remove('hidden');
});

document.getElementById('saveSettings').addEventListener('click', () => {
  settings.alertMessage = document.getElementById('alertMessage').value;
  settings.shakeEnabled = document.getElementById('shakeToggle').checked;
  settings.sirenEnabled = document.getElementById('sirenToggle').checked;
  localStorage.setItem('settings', JSON.stringify(settings));
  if (settings.shakeEnabled) initShakeDetection();
  settingsModal.classList.add('hidden');
});

document.getElementById('closeSettings').addEventListener('click', () => settingsModal.classList.add('hidden'));

// ===== Contact Modal =====
document.getElementById('addContactBtn').addEventListener('click', () => {
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  contactModal.classList.remove('hidden');
});

document.getElementById('saveContact').addEventListener('click', () => {
  const name  = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  if (!name || !phone) { alert('Please fill in both fields.'); return; }
  contacts.push({ name, phone });
  saveContacts();
  renderContacts();
  contactModal.classList.add('hidden');
});

document.getElementById('closeContact').addEventListener('click', () => contactModal.classList.add('hidden'));

// Close modals on backdrop click
[settingsModal, contactModal].forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
});

// ===== Progress Ring =====
function buildProgressRing() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('progress-ring');
  svg.setAttribute('viewBox', '0 0 156 156');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '78');
  circle.setAttribute('cy', '78');
  circle.setAttribute('r', '68');
  svg.appendChild(circle);
  document.querySelector('.sos-wrapper').appendChild(svg);
  window._progressCircle = circle;
}

function setProgress(pct) {
  const circumference = 2 * Math.PI * 68; // ~427
  const offset = circumference * (1 - pct);
  window._progressCircle.style.strokeDasharray = circumference;
  window._progressCircle.style.strokeDashoffset = offset;
}

// ===== SOS Hold Logic =====
function startHold() {
  if (sosActive) { deactivateSOS(); return; }
  holdProgress = 0;
  sosBtn.classList.add('holding');
  holdHint.textContent = 'Keep holding...';
  setProgress(0);

  const startTime = Date.now();
  holdInterval = setInterval(() => {
    holdProgress = Math.min((Date.now() - startTime) / HOLD_DURATION, 1);
    setProgress(holdProgress);
  }, 30);

  holdTimer = setTimeout(() => {
    clearInterval(holdInterval);
    setProgress(1);
    activateSOS();
  }, HOLD_DURATION);
}

function cancelHold() {
  if (sosActive) return;
  clearTimeout(holdTimer);
  clearInterval(holdInterval);
  sosBtn.classList.remove('holding');
  holdHint.textContent = 'Press and hold to activate';
  setProgress(0);
}

// Mouse events
sosBtn.addEventListener('mousedown', startHold);
sosBtn.addEventListener('mouseup', cancelHold);
sosBtn.addEventListener('mouseleave', cancelHold);

// Touch events
sosBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(); }, { passive: false });
sosBtn.addEventListener('touchend', cancelHold);
sosBtn.addEventListener('touchcancel', cancelHold);

// ===== Activate SOS =====
function activateSOS() {
  sosActive = true;
  sosBtn.classList.remove('holding');
  sosBtn.classList.add('active');
  sosBtn.querySelector('.sos-sub').textContent = 'TAP TO STOP';
  holdHint.textContent = 'SOS is active — tap button to cancel';

  statusBar.classList.remove('hidden');
  locationCard.classList.remove('hidden');
  alertCard.classList.remove('hidden');
  alertList.innerHTML = '';

  if (settings.sirenEnabled) playSiren();
  fetchLocation();
  sendAlerts();
  vibrateDevice([200, 100, 200, 100, 400]);
}

function deactivateSOS() {
  sosActive = false;
  sosBtn.classList.remove('active');
  sosBtn.querySelector('.sos-sub').textContent = 'Hold 2s';
  holdHint.textContent = 'Press and hold to activate';
  statusBar.classList.add('hidden');
  stopSiren();
  setProgress(0);
}

// ===== Location =====
function fetchLocation() {
  locationText.textContent = 'Fetching your location...';
  coordsText.textContent = '';
  mapsLink.classList.add('hidden');

  if (!navigator.geolocation) {
    locationText.textContent = 'Geolocation not supported by your browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      currentLocation = { lat, lng };
      coordsText.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}  (±${Math.round(accuracy)}m)`;
      locationText.textContent = 'Location acquired successfully.';
      mapsLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
      mapsLink.classList.remove('hidden');
    },
    err => {
      const msgs = {
        1: 'Location permission denied. Please allow access.',
        2: 'Location unavailable. Check your GPS.',
        3: 'Location request timed out.',
      };
      locationText.textContent = msgs[err.code] || 'Could not get location.';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ===== Alerts =====
function sendAlerts() {
  if (contacts.length === 0) {
    addAlertItem('⚠️', 'No emergency contacts added.', 'pending');
    return;
  }

  contacts.forEach((contact, i) => {
    const locationStr = currentLocation
      ? `https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`
      : 'Location unavailable';

    const message = settings.alertMessage.replace('{location}', locationStr);

    // Simulate SMS/API send with delay
    addAlertItem('⏳', `Sending to ${contact.name} (${contact.phone})...`, 'pending');

    setTimeout(() => {
      simulateSMSSend(contact, message, i);
    }, 800 + i * 600);
  });
}

function simulateSMSSend(contact, message, index) {
  // Placeholder: replace with real SMS API (e.g., Twilio, Fast2SMS)
  console.log(`[SMS API] To: ${contact.phone} | Message: ${message}`);

  const items = alertList.querySelectorAll('li');
  if (items[index]) {
    items[index].innerHTML = `<span class="alert-sent">✅</span> Alert sent to <strong>${contact.name}</strong>`;
  }
}

function addAlertItem(icon, text, type) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="${type === 'sent' ? 'alert-sent' : 'alert-pending'}">${icon}</span> ${text}`;
  alertList.appendChild(li);
}

// ===== Siren =====
function playSiren() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);

    // Wailing siren effect
    const now = ctx.currentTime;
    for (let i = 0; i < 20; i++) {
      oscillator.frequency.setValueAtTime(880, now + i * 0.5);
      oscillator.frequency.linearRampToValueAtTime(440, now + i * 0.5 + 0.25);
      oscillator.frequency.linearRampToValueAtTime(880, now + i * 0.5 + 0.5);
    }

    oscillator.start(now);
    oscillator.stop(now + 10);
    sirenAudio = { ctx, oscillator };
  } catch (e) {
    console.warn('Audio not supported:', e);
  }
}

function stopSiren() {
  if (sirenAudio) {
    try { sirenAudio.oscillator.stop(); } catch (_) {}
    try { sirenAudio.ctx.close(); } catch (_) {}
    sirenAudio = null;
  }
}

// ===== Vibration =====
function vibrateDevice(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// ===== Shake Detection =====
let lastX = null, lastY = null, lastZ = null;
const SHAKE_THRESHOLD = 18;

function initShakeDetection() {
  if (typeof DeviceMotionEvent === 'undefined') return;

  // iOS 13+ requires permission
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(state => { if (state === 'granted') listenForShake(); })
      .catch(console.warn);
  } else {
    listenForShake();
  }
}

function listenForShake() {
  window.addEventListener('devicemotion', e => {
    if (!settings.shakeEnabled || sosActive) return;
    const { x, y, z } = e.accelerationIncludingGravity || {};
    if (lastX === null) { lastX = x; lastY = y; lastZ = z; return; }

    const delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
    if (delta > SHAKE_THRESHOLD) activateSOS();

    lastX = x; lastY = y; lastZ = z;
  });
}

// ===== Contacts =====
function renderContacts() {
  contactsList.innerHTML = '';
  if (contacts.length === 0) {
    contactsList.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted)">No contacts added yet.</p>';
    return;
  }
  contacts.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
      <div class="contact-info">
        <span class="contact-name">👤 ${c.name}</span>
        <span class="contact-phone">${c.phone}</span>
      </div>
      <button onclick="removeContact(${i})" aria-label="Remove ${c.name}">🗑️</button>
    `;
    contactsList.appendChild(div);
  });
}

function removeContact(index) {
  contacts.splice(index, 1);
  saveContacts();
  renderContacts();
}

// ===== Storage =====
function saveContacts() {
  localStorage.setItem('contacts', JSON.stringify(contacts));
}

function loadFromStorage() {
  const saved = localStorage.getItem('contacts');
  if (saved) contacts = JSON.parse(saved);

  const savedSettings = localStorage.getItem('settings');
  if (savedSettings) settings = { ...settings, ...JSON.parse(savedSettings) };

  if (settings.shakeEnabled) initShakeDetection();
}
