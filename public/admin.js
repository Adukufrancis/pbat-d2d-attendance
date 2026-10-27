import { $, $$, api, esc, toast } from '/common.js';

let S = null;                       // dashboard state from the server
const fmtDay = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, opts);
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: S?.timezone });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function call(path, body) {
  const r = await api(path, body);
  if (r.status === 401) location.reload();
  if (!r.ok) toast(r.data.error || 'Something went wrong.');
  return r;
}

// ---- Small dialog helper ----
function ask({ title, text = '', input = null, ok = 'Save', danger = false }) {
  const dlg = $('#dlg'), form = $('#dlg-form');
  form.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p class="muted">${text}</p>` : ''}
    ${input ? `<label class="field"><span>${esc(input.label)}</span><input id="dlg-in" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" required></label>` : ''}
    ${input?.check ? `<label class="check"><input type="checkbox" id="dlg-check" ${input.check.on ? 'checked' : ''}> ${input.check.label}</label>` : ''}
    <div class="dlg-actions"><button class="btn ${danger ? 'danger' : ''}" value="ok">${esc(ok)}</button>
    <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok'
      ? { value: $('#dlg-in')?.value.trim() ?? true, check: $('#dlg-check')?.checked } : null);
    dlg.showModal(); $('#dlg-in')?.select();
  });
}

// ---- Today / venues ----
async function loadState() {
  const r = await call('/api/admin/state'); if (!r.ok) return;
  S = r.data;
  const known = S.venues.filter((v) => v.networks.some((n) => n.here));
  $('#netbar').innerHTML = `<span class="dot ${known.length ? 'on' : ''}"></span>
    <div><b>Your network right now:</b> <code>${esc(S.here)}</code>
    <span class="muted">${known.length ? `saved for ${known.map((v) => esc(v.name)).join(', ')}` : 'not saved for any venue'}</span></div>`;
  $('#today-label').textContent = fmtDay(S.today);
  renderVenues();
  const sel = $('#venue-filter'), cur = sel.value;
  sel.innerHTML = '<option value="0">All offices</option>' + S.venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  sel.value = cur || '0';
}

function renderVenues() {
  const box = $('#venues');
  if (!S.venues.length) {
    box.innerHTML = `<div class="empty"><h3>Add your first office</h3>
      <p class="muted">Do this while you're <b>at the office, connected to its WiFi</b>. The app saves that WiFi, so check-ins only work there.</p>
      <button class="btn" data-act="add">+ Add office</button></div>`;
    return;
  }
  box.innerHTML = S.venues.map((v) => {
    const here = v.networks.some((n) => n.here);
    return `<article class="venue" data-id="${v.id}">
      <div class="venue-top">
        <div><h3>${esc(v.name)}</h3><p class="muted">${v.networks.length ? `${v.networks.length} WiFi network${v.networks.length > 1 ? 's' : ''} saved` : '<span class="bad">No WiFi saved yet: check-ins are refused</span>'}</p></div>
        <div class="big-count"><b>${v.today}</b><span>today</span></div>
      </div>
      <div class="venue-actions">
        <a class="btn" href="/admin/display/${v.id}">Show QR code</a>
        ${here ? '<span class="pill ok">✓ You\'re on this office\'s WiFi</span>' : '<button class="btn ghost" data-act="usenet">Use this network</button>'}
      </div>
      <details class="nets"><summary>WiFi networks & settings</summary>
        <ul>${v.networks.map((n) => `<li><code>${esc(n.address)}</code>${n.here ? ' <span class="pill ok">you are here</span>' : ''}
          <button class="linkish danger" data-act="delnet" data-nid="${n.id}">Remove</button></li>`).join('') || '<li class="muted">None yet.</li>'}</ul>
        <p class="fine">If the router restarts, its internet address can change. If people suddenly can't check in, come to the office and tap <b>Use this network</b> again. An office can have several networks (e.g. two routers).</p>
        <div class="venue-actions"><button class="btn ghost small" data-act="rename">Rename</button><button class="btn ghost small danger" data-act="delete">Delete office</button></div>
      </details>
    </article>`;
  }).join('');
}

async function addVenue() {
  const r = await ask({ title: 'Add an office', input: { label: 'Office name', placeholder: 'e.g. PBAT D2D Office, Wuse 2',
    check: { label: "I'm at this office now: use this WiFi", on: true } }, ok: 'Add office' });
  if (!r?.value) return;
  if ((await call('/api/admin/venues', { name: r.value, useThisNetwork: r.check })).ok) { toast('✓ Office added'); loadState(); }
}
$('#add-venue').addEventListener('click', addVenue);

$('#venues').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'add') return addVenue();
  const id = b.closest('[data-id]').dataset.id, v = S.venues.find((x) => String(x.id) === id);
  if (b.dataset.act === 'usenet') {
    const ok = await ask({ title: `Use this network for ${v.name}?`, ok: 'Use this network',
      text: `Only do this <b>at ${esc(v.name)}</b>, connected to its WiFi. Phones on <code>${esc(S.here)}</code> will be able to check in there.` });
    if (ok && (await call(`/api/admin/venues/${id}/networks`, {})).ok) { toast('✓ WiFi saved'); loadState(); }
  }
  if (b.dataset.act === 'delnet') {
    const ok = await ask({ title: 'Remove this network?', text: 'Phones on it will no longer be able to check in here.', ok: 'Remove', danger: true });
    if (ok && (await call(`/api/admin/venues/${id}/networks/${b.dataset.nid}/delete`, {})).ok) loadState();
  }
  if (b.dataset.act === 'rename') {
    const r = await ask({ title: 'Rename office', input: { label: 'Office name', value: v.name } });
    if (r?.value && (await call(`/api/admin/venues/${id}/rename`, { name: r.value })).ok) loadState();
  }
  if (b.dataset.act === 'delete') {
    const ok = await ask({ title: `Delete ${v.name}?`, text: 'This also deletes all of its attendance records. This cannot be undone.', ok: 'Delete', danger: true });
    if (ok && (await call(`/api/admin/venues/${id}/delete`, {})).ok) { toast('Office deleted'); loadState(); }
  }
});

// ---- Attendance records ----
let records = [];
async function loadRecords() {
  const q = new URLSearchParams({ from: $('#from').value, to: $('#to').value, venue: $('#venue-filter').value });
  $('#csv').href = `/admin/attendance.csv?${q}`;
  const r = await call(`/api/admin/attendance?${q}`); if (!r.ok) return;
  records = r.data.rows;
  const people = new Set(records.map((x) => x.person_id)).size;
  $('#rec-summary').textContent = `${records.length} check-in${records.length === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}`;
  const t = $('#records');
  if (!records.length) { t.innerHTML = '<tbody><tr><td class="empty-row">No check-ins for these dates.</td></tr></tbody>'; return; }
  const multiDay = $('#from').value !== $('#to').value;
  t.innerHTML = `<thead><tr>${multiDay ? '<th>Date</th>' : ''}<th>Time</th><th>Name</th><th>PBAT-D2D no.</th><th>Office</th><th></th></tr></thead><tbody>${
    records.map((x) => `<tr data-id="${x.id}">${multiDay ? `<td>${fmtDay(x.day, { day: 'numeric', month: 'short' })}</td>` : ''}
      <td>${fmtTime(x.at)}</td><td><b>${esc(x.name)}</b>${x.new_device ? ' <span class="pill warn" title="This PBAT-D2D number checked in from a phone it had not used before">new phone</span>' : ''}</td>
      <td>${esc(x.member_no)}</td><td>${esc(x.venue)}</td>
      <td><button class="linkish danger" data-del>Remove</button></td></tr>`).join('')}</tbody>`;
}
$('#records').addEventListener('click', async (e) => {
  if (!e.target.matches('[data-del]')) return;
  const id = e.target.closest('tr').dataset.id, x = records.find((r) => String(r.id) === id);
  const ok = await ask({ title: 'Remove this check-in?', text: `${esc(x.name)} on ${fmtDay(x.day)}.`, ok: 'Remove', danger: true });
  if (ok && (await call(`/api/admin/attendance/${id}/delete`, {})).ok) loadRecords();
});
for (const el of ['#from', '#to', '#venue-filter']) $(el).addEventListener('change', () => {
  if ($('#from').value > $('#to').value) $('#to').value = $('#from').value;
  loadRecords();
});
$$('[data-range]').forEach((c) => c.addEventListener('click', () => {
  const n = Number(c.dataset.range);
  $('#to').value = n === 1 ? addDays(S.today, -1) : S.today;
  $('#from').value = n <= 1 ? $('#to').value : addDays(S.today, -(n - 1));
  loadRecords();
}));

// ---- People ----
let people = [];
async function loadPeople() {
  const r = await call('/api/admin/people'); if (!r.ok) return;
  people = r.data.people; renderPeople();
}
function renderPeople() {
  const q = $('#people-search').value.trim().toLowerCase();
  const list = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.member_no.toLowerCase().includes(q.replace(/\s/g, '')));
  $('#people-summary').textContent = `${people.length} registered`;
  const t = $('#people');
  if (!list.length) { t.innerHTML = `<tbody><tr><td class="empty-row">${people.length ? 'No matches.' : 'Nobody has checked in yet.'}</td></tr></tbody>`; return; }
  t.innerHTML = `<thead><tr><th>Name</th><th>PBAT-D2D no.</th><th>Days</th><th>Last check-in</th><th>Phones</th><th></th></tr></thead><tbody>${
    list.map((p) => `<tr data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${esc(p.member_no)}</td><td>${p.days}</td>
      <td>${p.last_seen ? new Date(p.last_seen).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '-'}</td>
      <td>${p.devices}${p.devices > 1 ? ' <span class="pill warn">check</span>' : ''}</td>
      <td class="row-actions"><button class="linkish" data-act="rename">Rename</button>
      <button class="linkish" data-act="reset" title="Unlink their phone(s), e.g. a new or lost phone">Reset phone</button>
      <button class="linkish danger" data-act="delete">Delete</button></td></tr>`).join('')}</tbody>`;
}
$('#people-search').addEventListener('input', renderPeople);
$('#people').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, p = people.find((x) => String(x.id) === id);
  if (b.dataset.act === 'rename') {
    const r = await ask({ title: 'Rename', input: { label: 'Full name', value: p.name } });
    if (r?.value && (await call(`/api/admin/people/${id}/rename`, { name: r.value })).ok) loadPeople();
  }
  if (b.dataset.act === 'reset') {
    const ok = await ask({ title: `Reset ${p.name}'s phone?`, text: 'Their phone is unlinked. Next time they scan, they enter their name and PBAT-D2D number again on whichever phone they use.', ok: 'Reset' });
    if (ok && (await call(`/api/admin/people/${id}/reset-devices`, {})).ok) { toast('✓ Phone reset'); loadPeople(); }
  }
  if (b.dataset.act === 'delete') {
    const ok = await ask({ title: `Delete ${p.name}?`, text: 'Also deletes all their attendance records. This cannot be undone.', ok: 'Delete', danger: true });
    if (ok && (await call(`/api/admin/people/${id}/delete`, {})).ok) { toast('Deleted'); loadPeople(); }
  }
});

// ---- Tabs ----
function show(tab) {
  $$('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  if (tab === 'records') loadRecords();
  if (tab === 'people') loadPeople();
  if (tab === 'today') loadState();
  history.replaceState(null, '', tab === 'today' ? '/admin' : `/admin#${tab}`);
}
$$('[role=tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
$('#logout').addEventListener('click', async () => { await api('/api/admin/logout', {}); location.reload(); });

await loadState();
$('#from').value = $('#to').value = S.today;
show(['records', 'people'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today');
setInterval(() => { if (!$('[data-panel=today]').hidden && !$('#dlg').open) loadState(); }, 20000);
