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
