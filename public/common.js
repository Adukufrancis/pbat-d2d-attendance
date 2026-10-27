export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export async function api(path, body) {
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.', reason: 'offline' } };
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const prettyPhone = (p) => {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(p || '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : (p || '');
};

export function toast(text) {
  const t = $('#toast'); if (!t) return;
  t.textContent = text; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 300); }, 2600);
}

// Eye button next to a password box: tap to show or hide what you typed.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-eye]'); if (!btn) return;
  const input = btn.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('on', show);
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.title = btn.getAttribute('aria-label');
  input.focus({ preventScroll: true });
});
export const EYE = `<button type="button" class="eye" data-eye aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M4 4l16 16"/></svg></button>`;

/**
 * Turns a plain <select> into a styled dropdown (the <select> stays in the page, hidden, and keeps
 * its value and 'change' events, so existing code keeps working). Rebuilds itself when options change.
 */
export function fancySelect(sel) {
  if (sel._fancy) return sel._fancy;
  const wrap = document.createElement('div'); wrap.className = 'fsel';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fsel-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  const list = document.createElement('div'); list.className = 'fsel-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
  sel.after(wrap); wrap.append(btn, list); sel.classList.add('fsel-native'); sel.tabIndex = -1;
  const icon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>';
  const pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  const tick = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>';
  const render = () => {
    const cur = sel.options[sel.selectedIndex];
    btn.innerHTML = `<span class="fsel-ico">${pin}</span><span class="fsel-val">${esc(cur ? cur.text : '')}</span>${icon}`;
    list.innerHTML = [...sel.options].map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${o.selected}" class="${o.selected ? 'on' : ''}">
      <span>${esc(o.text)}</span>${o.selected ? tick : ''}</button>`).join('');
  };
  const close = () => { list.hidden = true; wrap.classList.remove('open'); };
  btn.addEventListener('click', () => { const open = list.hidden; document.querySelectorAll('.fsel.open').forEach((w) => w._close?.()); if (open) { list.hidden = false; wrap.classList.add('open'); list.querySelector('.on')?.focus(); } });
  list.addEventListener('click', (e) => {
    const o = e.target.closest('[data-i]'); if (!o) return;
    sel.selectedIndex = Number(o.dataset.i); render(); close(); btn.focus();
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('[data-i]')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)]?.focus(); }
    if (e.key === 'Escape') { close(); btn.focus(); }
  });
  wrap._close = close;
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  new MutationObserver(render).observe(sel, { childList: true, subtree: true, attributes: true });
  sel.addEventListener('change', render);
  render();
  return (sel._fancy = { render });
}
