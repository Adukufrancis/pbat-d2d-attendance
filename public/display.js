import { $, api } from '/common.js';

const id = $('#display').dataset.venue, screen = $('#display').dataset.screen;
let day = null;
if (screen) $('#d-back').hidden = true;                     // screen link: no dashboard for passers-by

async function load() {
  const { ok, status, data } = await api(screen ? `/api/screen/${encodeURIComponent(screen)}` : `/api/admin/venues/${id}/qr`);
  if (status === 401) return location.replace('/admin');
  $('#d-err').hidden = ok || status === 0;                  // keep showing the last code if the internet blips
  if (!ok) {
    if (status && data?.error) { $('#d-err').textContent = data.error; $('#d-qr').innerHTML = ''; day = null; }
    return;
  }
  if (data.day !== day) {                                    // first load, or the day changed: new code
    day = data.day;
    $('#d-qr').innerHTML = data.svg;
    $('#d-name').textContent = data.name;
    document.title = `${data.name} · QR screen`;
    $('#d-date').textContent = new Date(`${data.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  for (const [el, n] of [[$('#d-count'), data.count], [$('#d-out'), data.out]]) {
    if (el.textContent !== String(n)) { el.textContent = n; el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }
  }
  $('#d-out-time').textContent = data.checkoutTime;
  $('#d-warn').hidden = data.networks > 0;
}

load();
setInterval(load, 15000);                                    // live count, and picks up the new code after midnight
$('#d-full').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
// Keep the screen awake while the code is shown, where supported.
const awake = () => navigator.wakeLock?.request('screen').catch(() => {});
awake(); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && awake());
