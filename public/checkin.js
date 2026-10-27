import { $, api, esc } from '/common.js';

const card = $('#card');
const venue = card.dataset.venue, code = card.dataset.code;
const view = $('#view');

const ICONS = {
  ok: '<svg viewBox="0 0 48 48"><path d="M14 25l7 7 14-15"/></svg>',
  out: '<svg viewBox="0 0 48 48"><path d="M20 12h-6a2 2 0 00-2 2v20a2 2 0 002 2h6M28 17l7 7-7 7M35 24H19"/></svg>',
  wifi: '<svg viewBox="0 0 48 48"><path d="M8 19a23 23 0 0132 0M14 25a14 14 0 0120 0M20 31a6 6 0 018 0"/><circle cx="24" cy="37" r="1.6"/></svg>',
  clock: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16"/><path d="M24 15v10l6 4"/></svg>',
  x: '<svg viewBox="0 0 48 48"><path d="M16 16l16 16M32 16L16 32"/></svg>',
};

function state(kind, title, text, actions = '') {
  view.innerHTML = `<div class="state ${kind}">
    <div class="state-icon">${ICONS[{ ok: 'ok', out: 'out', network: 'wifi', expired: 'clock' }[kind] || 'x']}</div>
    <h1>${title}</h1><p class="muted">${text}</p>${actions}</div>`;
}

const time = (t, tz) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });

function registerForm(venueName, prev = {}) {
  view.innerHTML = `<form class="register" novalidate>
    <p class="kicker">${esc(venueName)}</p>
    <h1>First time here?</h1>
    <p class="muted">Enter your name and PBAT-D2D number once. Next time, one scan checks you in.</p>
    <label class="field" data-f="name"><span>Full name</span>
      <input name="name" autocomplete="name" value="${esc(prev.name)}" required><em class="err"></em></label>
    <label class="field" data-f="number"><span>PBAT-D2D number</span>
      <input name="number" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="e.g. PBAT-D2D-00123" value="${esc(prev.number)}" required><em class="err"></em></label>
    <button class="btn block" type="submit">Check me in</button>
    <p class="msg err" hidden></p>
    <p class="fine">This phone will be linked to you, so please don't check in for anyone else.</p>
  </form>`;
  const form = $('form', view);
  form.name.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run({ name: form.name.value.trim(), number: form.number.value.trim() }, form);
  });
}

async function run(extra = {}, form = null) {
  const btn = form && $('button[type=submit]', form);
  if (btn) { btn.disabled = true; btn.textContent = 'Checking in…'; }
  const { ok, data } = await api('/api/checkin', { venue, code, ...extra });
  if (btn) { btn.disabled = false; btn.textContent = 'Check me in'; }

  if (ok && data.status === 'register') return registerForm(data.venue);
  if (ok && data.status === 'ok') {
    const first = esc(data.name.split(' ')[0]), place = `<b>${esc(data.venue)}</b>`;
    const tIn = `<b>${time(data.at, data.timezone)}</b>`, tOut = data.outAt ? `<b>${time(data.outAt, data.timezone)}</b>` : '';
    const who = `<p class="fine">Signed in as ${esc(data.name)}${data.number ? ` · ${esc(data.number)}` : ''}. Not you? Tell the office admin.</p>`;
    const hours = data.outAt ? (() => { const m = Math.round((data.outAt - data.at) / 60000); return `${Math.floor(m / 60)}h ${m % 60}m`; })() : '';
    const later = `<p class="note">Leaving? Scan again from <b>${esc(data.checkoutTime)}</b> to check out.</p>`;
    if (data.action === 'out') return state('out', `Goodbye, ${first}!`, `Checked out of ${place} at ${tOut}.<br>You were in from ${tIn} (${hours}).`, who);
    if (data.action === 'already-out') return state('out', "You've already checked out", `You checked out of ${place} at ${tOut} today.`, who);
    if (data.action === 'already-in') return state('ok', "You're already checked in", `You checked in at ${place} at ${tIn}.`, later + who);
    return state('ok', `Welcome, ${first}!`, `Checked in at ${place} at ${tIn}.`, (data.checkoutOpen ? `<p class="note">It's after ${esc(data.checkoutTime)}: scan again when you leave to check out.</p>` : later) + who);
  }
  if (form && data.fields) {
    for (const f of ['name', 'number']) {
      const box = $(`[data-f="${f}"]`, form);
      box.classList.toggle('invalid', Boolean(data.fields[f]));
      $('.err', box).textContent = data.fields[f] || '';
    }
    return;
  }
  const retry = '<button class="btn block" id="retry">Try again</button>';
  if (data.reason === 'network') {
    state('network', 'Join the office WiFi', esc(data.error), `<ol class="steps small">
      <li>Open <b>Settings → Wi-Fi</b> and connect to the office network.</li>
      <li>Turn <b>mobile data off</b> for a moment.</li>
      <li>Come back here and tap <b>Try again</b>.</li></ol>${retry}`);
  } else if (data.reason === 'expired') {
    state('expired', 'Old QR code', esc(data.error));
  } else if (data.reason === 'offline') {
    state('network', 'No connection', esc(data.error), retry);
  } else {
    state('error', "Can't check in", esc(data.error || 'Something went wrong.'), data.reason === 'invalid' ? '' : retry);
  }
  $('#retry')?.addEventListener('click', () => {
    view.innerHTML = '<div class="state"><div class="ring-spin"></div><h1>Checking…</h1></div>';
    run(extra);
  });
}

run();
