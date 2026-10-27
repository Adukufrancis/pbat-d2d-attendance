import { $, $$, api, esc, toast, EYE } from '/common.js';

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
  form.onkeydown = null;
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
        <div class="big-count"><b>${v.today}</b><span>in today</span>${v.out ? `<small>${v.out} out</small>` : ''}</div>
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
  $('#xlsx').href = `/admin/attendance.xlsx?${q}`;
  const r = await call(`/api/admin/attendance?${q}`); if (!r.ok) return;
  records = r.data.rows;
  const people = new Set(records.map((x) => x.person_id)).size;
  $('#rec-summary').textContent = `${records.length} check-in${records.length === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}`;
  const t = $('#records');
  if (!records.length) { t.innerHTML = '<tbody><tr><td class="empty-row">No check-ins for these dates.</td></tr></tbody>'; return; }
  const multiDay = $('#from').value !== $('#to').value;
  t.innerHTML = `<thead><tr>${multiDay ? '<th>Date</th>' : ''}<th>In</th><th>Out</th><th>Hours</th><th>Name</th><th>PBAT-D2D no.</th><th>Office</th><th></th></tr></thead><tbody>${
    records.map((x) => `<tr data-id="${x.id}">${multiDay ? `<td>${fmtDay(x.day, { day: 'numeric', month: 'short' })}</td>` : ''}
      <td>${fmtTime(x.at)}</td><td>${x.checkout_at ? fmtTime(x.checkout_at) : '<span class="muted-dash">not yet</span>'}</td>
      <td>${x.checkout_at ? (() => { const m = Math.round((x.checkout_at - x.at) / 60000); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; })() : '-'}</td><td><b>${esc(x.name)}</b>${x.by_admin ? ' <span class="pill" title="Signed in or out by an admin from the dashboard">by admin</span>' : ''}${x.new_device ? ' <span class="pill warn" title="This PBAT-D2D number checked in from a phone it had not used before">new phone</span>' : ''}</td>
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

// ---- People and the office list ----
let people = [], numPrefix = 'PBAT-D2D-2027-', numDigits = 4, peopleTz;
async function loadPeople() {
  const r = await call('/api/admin/people'); if (!r.ok) return;
  people = r.data.people; numPrefix = r.data.prefix; numDigits = r.data.digits; peopleTz = r.data.timezone; renderPeople();
}
function renderPeople() {
  const q = $('#people-search').value.trim().toLowerCase();
  const list = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.member_no.toLowerCase().includes(q.replace(/\s/g, '')));
  const listed = people.filter((p) => p.listed).length, linked = people.filter((p) => p.devices > 0).length;
  $('#people-summary').textContent = `${listed} on the office list · ${linked} with a phone linked`;
  $('#list-banner').innerHTML = listed
    ? `<span class="dot on"></span><div><b>Office list is on.</b> Only people on the list can register, their name must match, and each number works on one phone only.</div>`
    : `<span class="dot"></span><div><b>No office list yet.</b> Anyone with a PBAT-D2D number can register. Upload the list (Excel or CSV) or add people one by one to switch checking on.</div>`;
  const t = $('#people');
  if (!list.length) { t.innerHTML = `<tbody><tr><td class="empty-row">${people.length ? 'No matches.' : 'Nobody yet. Upload the office list or add people.'}</td></tr></tbody>`; return; }
  const hm = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: peopleTz });
  const todayCell = (p) => (p.today_open ? `<span class="pill ok">In ${hm(p.today_in)}</span>`
    : p.today_out ? `<span class="pill">Out ${hm(p.today_out)}</span>` : '<span class="muted-dash">-</span>');
  const signBtn = (p) => (p.today_open ? '<button class="btn small" data-act="sign">Sign out</button>'
    : p.today_out ? '' : '<button class="btn small" data-act="sign">Sign in</button>');
  t.innerHTML = `<thead><tr><th>Name</th><th>PBAT-D2D no.</th><th>Today</th><th>Office list</th><th>Phone</th><th>Days</th><th></th></tr></thead><tbody>${
    list.map((p) => `<tr data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${esc(p.member_no)}</td>
      <td>${todayCell(p)}</td>
      <td>${p.listed ? '<span class="pill ok">On list</span>' : '<span class="pill warn">Not on list</span>'}</td>
      <td>${p.devices ? '<span class="pill ok">Linked</span>' : '<span class="muted-dash">Not yet</span>'}</td>
      <td>${p.days}</td>
      <td class="row-actions">${signBtn(p)}<button class="linkish" data-act="rename">Rename</button>
      ${p.listed ? '' : '<button class="linkish" data-act="list">Add to list</button>'}
      ${p.devices ? '<button class="linkish" data-act="reset" title="Unlink their phone, e.g. a new or lost phone">Reset phone</button>' : ''}
      <button class="linkish danger" data-act="delete">Delete</button></td></tr>`).join('')}</tbody>`;
}
$('#people-search').addEventListener('input', renderPeople);
$('#people').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, p = people.find((x) => String(x.id) === id);
  if (b.dataset.act === 'rename') {
    const r = await ask({ title: 'Rename', text: 'People must type their name as it is here when they first register.', input: { label: 'Full name', value: p.name } });
    if (r?.value && (await call(`/api/admin/people/${id}/rename`, { name: r.value })).ok) loadPeople();
  }
  if (b.dataset.act === 'sign') {
    const out = Boolean(p.today_open);
    const venues = S?.venues || [];
    if (!venues.length) return toast('Add an office first (Today tab).');
    let venue = venues[0].id;
    if (venues.length > 1) {
      const dlg = $('#dlg'), form = $('#dlg-form');
      form.onkeydown = null;
      form.innerHTML = `<h3>Sign ${out ? 'out' : 'in'} ${esc(p.name)}</h3><p class="muted">Recorded as now, marked "by admin".</p>
        <label class="field"><span>Office</span><select id="sign-venue">${venues.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></label>
        <div class="dlg-actions"><button class="btn" value="ok">Sign ${out ? 'out' : 'in'}</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
      const choice = await new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? $('#sign-venue').value : null); dlg.showModal(); });
      if (!choice) return;
      venue = Number(choice);
    } else {
      const ok = await ask({ title: `Sign ${out ? 'out' : 'in'} ${p.name}?`, text: `At ${esc(venues[0].name)}, recorded as now and marked "by admin".`, ok: `Sign ${out ? 'out' : 'in'}` });
      if (!ok) return;
    }
    const r = await call(`/api/admin/people/${id}/sign`, { venue });
    if (r.ok) { toast(r.data.action === 'in' ? `✓ ${r.data.name} signed in` : r.data.action === 'out' ? `✓ ${r.data.name} signed out` : `${r.data.name} already signed out today`); loadPeople(); }
  }
  if (b.dataset.act === 'list') {
    if ((await call(`/api/admin/people/${id}/listed`, { listed: true })).ok) { toast('✓ Added to the office list'); loadPeople(); }
  }
  if (b.dataset.act === 'reset') {
    const ok = await ask({ title: `Reset ${p.name}'s phone?`, text: 'Their phone is unlinked. Next time they scan, they register again (name and number) on the phone they use now. Only do this if they really changed or lost their phone.', ok: 'Reset' });
    if (ok && (await call(`/api/admin/people/${id}/reset-devices`, {})).ok) { toast('✓ Phone reset'); loadPeople(); }
  }
  if (b.dataset.act === 'delete') {
    const ok = await ask({ title: `Delete ${p.name}?`, text: 'Removes them from the list and deletes all their attendance records. This cannot be undone.', ok: 'Delete', danger: true });
    if (ok && (await call(`/api/admin/people/${id}/delete`, {})).ok) { toast('Deleted'); loadPeople(); }
  }
});

// Add one person by hand
$('#add-person').addEventListener('click', () => {
  const dlg = $('#dlg'), form = $('#dlg-form');
  form.innerHTML = `<h3>Add a person</h3><p class="muted">They can register on their phone the next time they scan the QR code.</p>
    <label class="field" data-f="name"><span>Full name (as on their ID)</span><input id="ap-name" autocomplete="off" required><em class="err"></em></label>
    <label class="field" data-f="number"><span>PBAT-D2D number <small class="hint">last ${numDigits} digits</small></span>
      <span class="prefixed"><b>${esc(numPrefix)}</b><input id="ap-number" inputmode="numeric" maxlength="${numDigits}" placeholder="${'0'.repeat(numDigits)}" autocomplete="off" required></span><em class="err"></em></label>
    <div class="dlg-actions"><button class="btn" id="ap-save" type="button">Add person</button>
    <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  dlg.onclose = null; dlg.showModal(); $('#ap-name').focus();
  $('#ap-number').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, numDigits); });
  const err = (f, text) => { const box = $(`[data-f="${f}"]`, form); box.classList.toggle('invalid', Boolean(text)); $('.err', box).textContent = text || ''; };
  const save = async () => {
    err('name'); err('number');
    const btn = $('#ap-save'); btn.disabled = true;
    const r = await api('/api/admin/people/add', { name: $('#ap-name').value, number: $('#ap-number').value });
    btn.disabled = false;
    if (!r.ok) { for (const [f, t] of Object.entries(r.data.fields || {})) err(f, t); if (!r.data.fields) toast(r.data.error || 'Something went wrong.'); return; }
    dlg.close(); toast(`✓ Added ${r.data.number}`); loadPeople();
  };
  $('#ap-save').addEventListener('click', save);
  form.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); } };
});

// Upload the office list: preview first, then save
// The button is a <label for="list-file">, so the browser opens the file picker itself (works in Safari too).
$('#upload-list').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#list-file').click(); } });
$('#list-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (file.size > 5e6) return toast('That file is too big (5 MB max).');
  const data = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(file); });
  const send = (dryRun) => api('/api/admin/people/import', { filename: file.name, data, dryRun });
  const r = await send(true);
  if (!r.ok) return toast(r.data.error || 'Could not read that file.');
  const d = r.data, dlg = $('#dlg'), form = $('#dlg-form');
  form.onkeydown = null;
  form.innerHTML = `<h3>Upload ${esc(file.name)}</h3>
    <p class="muted">Names from <b>${esc(d.columns.name)}</b>, numbers from <b>${esc(d.columns.number)}</b>.</p>
    <div class="import-stats">
      <div><b>${d.added}</b><span>new</span></div><div><b>${d.updated}</b><span>updated</span></div>
      <div><b>${d.unchanged}</b><span>already on list</span></div><div class="${d.skipped.length ? 'bad' : ''}"><b>${d.skipped.length}</b><span>skipped</span></div>
    </div>
    ${d.sample.length ? `<p class="fine">For example: ${d.sample.slice(0, 3).map((s) => `${esc(s.name)} · ${esc(s.number)}`).join('; ')}</p>` : ''}
    ${d.skipped.length ? `<details class="skipped"><summary>See skipped rows</summary><ul>${d.skipped.slice(0, 50).map((s) =>
      `<li>Row ${s.line}: ${esc(s.name || '(no name)')} · ${esc(s.number || '(no number)')} <em>${esc(s.reason)}</em></li>`).join('')}</ul></details>` : ''}
    <div class="dlg-actions"><button class="btn" id="imp-save" type="button" ${d.total ? '' : 'disabled'}>Save ${d.added + d.updated} to the list</button>
    <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  dlg.onclose = null; dlg.showModal();
  $('#imp-save').addEventListener('click', async () => {
    $('#imp-save').disabled = true;
    const s = await send(false);
    if (!s.ok) { $('#imp-save').disabled = false; return toast(s.data.error || 'Something went wrong.'); }
    dlg.close(); toast(`✓ Office list saved: ${s.data.added} new, ${s.data.updated} updated`); loadPeople();
  });
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

// ---- Change password ----
$('#change-pw').addEventListener('click', () => {
  const dlg = $('#dlg'), form = $('#dlg-form');
  const pw = (id, label, auto) => `<label class="field" data-f="${id}"><span>${label}</span><span class="pw-wrap">
    <input id="${id}" type="password" autocomplete="${auto}" required>${EYE}</span><em class="err"></em></label>`;
  form.innerHTML = `<h3>Change password</h3><p class="muted">Other devices logged in to this dashboard will be logged out.</p>
    ${pw('pw-current', 'Current password', 'current-password')}${pw('pw-next', 'New password (at least 8 characters)', 'new-password')}
    ${pw('pw-again', 'Type the new password again', 'new-password')}
    <div class="dlg-actions"><button class="btn" id="pw-save" type="button">Change password</button>
    <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  dlg.onclose = null; dlg.showModal(); $('#pw-current').focus();
  const err = (id, text) => { const f = $(`[data-f="${id}"]`); f.classList.toggle('invalid', Boolean(text)); $('.err', f).textContent = text || ''; };
  const save = async () => {
    ['pw-current', 'pw-next', 'pw-again'].forEach((id) => err(id));
    const current = $('#pw-current').value, next = $('#pw-next').value;
    if (next.length < 8) return err('pw-next', 'Use at least 8 characters.');
    if (next !== $('#pw-again').value) return err('pw-again', "The two new passwords don't match.");
    const btn = $('#pw-save'); btn.disabled = true;
    const r = await api('/api/admin/password', { current, next });
    btn.disabled = false;
    if (!r.ok) return err(r.data.field === 'current' ? 'pw-current' : 'pw-next', r.data.error || 'Something went wrong.');
    dlg.close(); toast('✓ Password changed');
  };
  $('#pw-save').addEventListener('click', save);
  form.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); } };
});

await loadState();
$('#from').value = $('#to').value = S.today;
show(['records', 'people'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today');
setInterval(() => { if (!$('[data-panel=today]').hidden && !$('#dlg').open) loadState(); }, 20000);
