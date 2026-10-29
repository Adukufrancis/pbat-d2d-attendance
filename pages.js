// HTML page shells. Values in {{double braces}} are filled in by page(); they are escaped by the server.
const shell = (title, body, { script = '', bodyClass = '' } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="#06492a">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v={{v}}">
</head>
<body class="${bodyClass}">
${body}
${script ? `<script type="module" src="${script}?v={{v}}"></script>` : ''}
</body>
</html>`;

const brand = `<a class="brand" href="/"><img src="/images/logo-transparent.png" alt="PBAT Door to Door Movement" width="900" height="563"><span>Office<br>Attendance</span></a>`;

export const PAGES = {
  home: shell('{{appName}}', `
<main class="center-page">
  <div class="phone-card">
    ${brand}
    <div class="hero-icon" aria-hidden="true">
      <svg viewBox="0 0 64 64"><rect x="6" y="6" width="20" height="20" rx="3"/><rect x="38" y="6" width="20" height="20" rx="3"/><rect x="6" y="38" width="20" height="20" rx="3"/><path d="M38 38h8v8h-8zM50 50h8v8h-8zM50 38h8M38 54h4"/></svg>
    </div>
    <p class="kicker">PBAT D2D Office</p>
    <h1>Check in with a scan</h1>
    <ol class="steps">
      <li><b>Join the office WiFi</b> and turn off mobile data.</li>
      <li><b>Open your camera</b> and point it at today's QR code.</li>
      <li><b>Tap the link.</b> The first time, add your name and PBAT-D2D number.</li>
      <li><b>Leaving after 5 PM?</b> Scan again to check out.</li>
    </ol>
    <p class="fine">Office admin? <a href="/admin">Log in to the dashboard</a></p>
  </div>
</main>`),

  checkin: shell('Check in · {{appName}}', `
<main class="center-page">
  <div class="phone-card" id="card" data-venue="{{venue}}" data-code="{{code}}">
    ${brand}
    <div id="view" aria-live="polite">
      <div class="state">
        <div class="ring-spin" aria-hidden="true"></div>
        <h1>Checking you in…</h1>
        <p class="muted">Making sure you're on the office WiFi.</p>
      </div>
    </div>
  </div>
</main>`, { script: '/checkin.js' }),

  login: shell('Admin login · {{appName}}', `
<main class="center-page">
  <form class="phone-card" id="login" novalidate>
    ${brand}
    <h1>Office admin login</h1>
    <p class="muted">Manage offices, show today's QR code and see who came in.</p>
    <label class="field"><span>Username</span><input id="username" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="admin"></label>
    <label class="field"><span>Password</span><span class="pw-wrap"><input id="password" type="password" autocomplete="current-password" required><button type="button" class="eye" data-eye aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M4 4l16 16"/></svg></button></span></label>
    <button class="btn block" type="submit">Log in</button>
    <p class="msg err" id="err" hidden></p>
  </form>
</main>`, { script: '/login.js' }),

  admin: shell('Dashboard · {{appName}}', `
<header class="topbar">
  <div class="wrap topbar-in">
    ${brand}
    <nav class="tabs" role="tablist">
      <button role="tab" data-tab="today" aria-selected="true">Today</button>
      <button role="tab" data-tab="records">Attendance</button>
      <button role="tab" data-tab="people">People</button>
    </nav>
    <details class="dropdown me-menu" id="me-menu">
      <summary class="me-chip"><span class="avatar" id="me-avatar">A</span><span class="me-name" id="me-name">Admin</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg></summary>
      <div class="menu" role="menu">
        <p class="menu-head" id="me-head"></p>
        <a href="#" role="menuitem" id="manage-admins" hidden><b>Manage admins</b><span>Add or remove admin logins</span></a>
        <a href="#" role="menuitem" id="change-pw"><b>Change password</b><span>Your own login</span></a>
        <a href="#" role="menuitem" id="logout"><b>Log out</b><span>This device</span></a>
      </div>
    </details>
  </div>
</header>
<main class="wrap dash">
  <section class="netbar" id="netbar"></section>

  <section data-panel="today">
    <div class="stats" id="stats"></div>
    <div class="panel-head">
      <div><h2>Offices</h2><p class="muted" id="today-label"></p></div>
      <button class="btn" id="add-venue">+ Add office</button>
    </div>
    <div class="venues" id="venues"></div>
    <section class="card absent-card" id="absent-card" hidden>
      <div class="panel-head">
        <div><h2>Not in yet</h2><p class="muted" id="absent-sub"></p></div>
        <label class="field small search"><span class="sr">Search</span><input id="absent-search" placeholder="Search name or number"></label>
      </div>
      <div class="absent-list" id="absent-list"></div>
    </section>
  </section>

  <section data-panel="records" hidden>
    <div class="panel-head">
      <div><h2>Attendance</h2><p class="muted" id="rec-summary"></p></div>
      <details class="dropdown" id="download">
        <summary class="btn">Download <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg></summary>
        <div class="menu" role="menu">
          <a role="menuitem" id="xlsx" href="#"><b>Excel</b><span>.xlsx with a summary sheet</span></a>
          <a role="menuitem" id="pdf" href="#"><b>PDF</b><span>Printable report</span></a>
          <a role="menuitem" id="csv" href="#"><b>CSV</b><span>Plain data for other apps</span></a>
        </div>
      </details>
    </div>
    <div class="filters">
      <label class="field small"><span>From</span><input type="date" id="from"></label>
      <label class="field small"><span>To</span><input type="date" id="to"></label>
      <label class="field small"><span>Office</span><select id="venue-filter"><option value="0">All offices</option></select></label>
      <div class="quick">
        <button class="chip" data-range="0">Today</button>
        <button class="chip" data-range="1">Yesterday</button>
        <button class="chip" data-range="7">Last 7 days</button>
        <button class="chip" data-range="30">Last 30 days</button>
      </div>
    </div>
    <div class="table-wrap"><table class="table" id="records"></table></div>
  </section>

  <section data-panel="people" hidden>
    <div class="panel-head">
      <div><h2>People</h2><p class="muted" id="people-summary"></p></div>
      <div class="people-actions">
        <label class="btn ghost" id="upload-list" for="list-file" role="button" tabindex="0">Upload office list</label>
        <input type="file" id="list-file" class="file-hidden" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv">
        <button class="btn" id="add-person">+ Add person</button>
      </div>
    </div>
    <div class="list-banner" id="list-banner"></div>
    <label class="field small search"><span class="sr">Search</span><input id="people-search" placeholder="Search name or number"></label>
    <div class="table-wrap"><table class="table" id="people"></table></div>
  </section>
</main>
<dialog id="dlg"><form method="dialog" id="dlg-form"></form></dialog>
<div class="toast" id="toast" hidden></div>`, { script: '/admin.js' }),

  display: shell('QR screen · {{appName}}', `
<main class="display" id="display" data-venue="{{venue}}" data-screen="{{screen}}">
  <div class="display-left">
    ${brand}
    <p class="kicker" id="d-date"></p>
    <h1 id="d-name">…</h1>
    <ol class="steps big">
      <li><b>Join the office WiFi</b> and turn off mobile data</li>
      <li><b>Scan</b> this code with your camera</li>
      <li><b>Tap the link</b> to check in</li>
      <li><b>From <span id="d-out-time">5:00 PM</span></b>, scan again to check out</li>
    </ol>
    <div class="counts"><div class="count"><span id="d-count">0</span> checked in</div><div class="count out"><span id="d-out">0</span> checked out</div></div>
    <div class="display-actions">
      <button class="btn ghost small" id="d-full">Full screen</button>
      <button class="btn ghost small" onclick="print()">Print today's code</button>
      <a class="btn ghost small" href="/admin" id="d-back">Back to dashboard</a>
    </div>
  </div>
  <div class="display-right">
    <div class="qr" id="d-qr"></div>
    <p class="qr-note">This code changes at midnight.</p>
    <p class="qr-note staff-link" id="d-link" hidden>No camera? Open <b id="d-link-url"></b> on the office WiFi.</p>
    <p class="warn" id="d-err" hidden></p>
    <p class="warn" id="d-warn" hidden>No WiFi saved for this office yet: check-ins will be refused. Open the dashboard on the office WiFi and tap <b>Use this network</b>.</p>
  </div>
</main>`, { script: '/display.js', bodyClass: 'dark' }),
};

export function page(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
}
