'use strict';

let state = null;
let openExclusions = null; // id of the person whose exclusion panel is open
let mutual = true;
let peek = false;

const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Please log in.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function act(method, url, body, okMsg) {
  try {
    state = await api(method, url, body);
    render();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

const linkFor = (p) => `${location.origin}/s/${p.token}`;
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const nameOf = (id) => state.participants.find((p) => p.id === id)?.name ?? '?';
const isDrawn = () => Boolean(state.assignments);

function confirmIfDrawn(what) {
  return !isDrawn() || confirm(`${what} will cancel the current draw. You'll need to draw again and everyone's links will show the new result.\n\nContinue?`);
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(msg);
}

function inviteText(p) {
  const ev = state.event;
  const lines = [`Hi ${p.name}! 🎅`, ``, `You're in our ${ev.name || 'Secret Santa'}. Open your private link to see who you're buying for:`, linkFor(p)];
  if (ev.budget) lines.push(``, `Budget: ${ev.budget}`);
  if (ev.date) lines.push(`Gift exchange: ${ev.date}`);
  lines.push(``, `Keep it secret! 🤫`);
  return lines.join('\n');
}

/* ---------- render ---------- */

function render() {
  const { event, participants } = state;
  $('topTitle').textContent = event.name || 'Secret Santa';
  document.title = `${event.name || 'Secret Santa'} · Admin`;

  // Event form (don't clobber while typing)
  if (!$('eventForm').contains(document.activeElement)) {
    $('evName').value = event.name || '';
    $('evBudget').value = event.budget || '';
    $('evDate').value = event.date || '';
    $('evMsg').value = event.message || '';
  }

  // People
  const list = $('people');
  list.replaceChildren(...participants.map(renderPerson));
  $('empty').classList.toggle('hidden', participants.length > 0);

  // Draw panel
  const drawn = isDrawn();
  const viewed = participants.filter((p) => p.viewedAt).length;
  $('drawDot').classList.toggle('on', drawn);
  $('drawText').textContent = drawn
    ? `Drawn ${new Date(state.drawnAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
    : participants.length < 2 ? 'Add at least 2 people' : 'Ready to draw';
  $('drawBtn').textContent = drawn ? 'Redraw' : 'Draw names';
  $('drawBtn').disabled = participants.length < 2;
  $('resetBtn').classList.toggle('hidden', !drawn);
  $('viewedWrap').classList.toggle('hidden', !drawn);
  $('viewedText').textContent = `${viewed} of ${participants.length} have opened their link`;
  $('viewedBar').style.width = participants.length ? `${(viewed / participants.length) * 100}%` : '0';

  $('pairsWrap').classList.toggle('hidden', !drawn);
  $('peekBtn').textContent = peek ? '🙈 Hide who got who' : '👀 Show who got who';
  $('pairs').classList.toggle('hidden', !peek);
  if (drawn) {
    $('pairs').replaceChildren(
      ...participants.map((p) => h('li', {}, h('span', {}, `${p.name} →`), h('span', {}, nameOf(state.assignments[p.id]))))
    );
  }
}

function renderPerson(p) {
  const others = state.participants.filter((o) => o.id !== p.id);
  const count = p.exclusions.length;
  const open = openExclusions === p.id;
  const drawn = isDrawn();

  const status = drawn
    ? h('span', { class: `pill ${p.viewedAt ? 'seen' : 'wait'}` }, p.viewedAt ? '✓ Opened' : 'Not opened')
    : null;

  const sub = count
    ? `Can't draw: ${p.exclusions.map(nameOf).join(', ')}`
    : 'No exclusions';

  const main = h('div', { class: 'person-main' },
    h('div', { class: 'avatar' }, initials(p.name)),
    h('div', { class: 'person-name' }, p.name, h('small', {}, sub)),
    status,
    h('div', { class: 'person-actions' },
      h('button', { class: 'btn small primary', title: 'Copy their private link', onclick: () => copy(linkFor(p), `Link for ${p.name} copied`) }, '🔗 Copy link'),
      h('button', { class: 'btn small', title: 'Copy a ready-to-send message with their link', onclick: () => copy(inviteText(p), `Message for ${p.name} copied`) }, '✉️ Message'),
      h('button', { class: 'btn small', onclick: () => { openExclusions = open ? null : p.id; render(); } }, `🚫 Exclusions${count ? ` (${count})` : ''}`),
      h('button', { class: 'btn small ghost', title: 'Rename', onclick: () => rename(p) }, '✏️'),
      h('button', { class: 'btn small ghost', title: 'Make a new link (old one stops working)', onclick: () => newLink(p) }, '♻️'),
      h('button', { class: 'btn small ghost danger', title: 'Remove', onclick: () => remove(p) }, '🗑️'),
    ),
  );

  const panel = open
    ? h('div', { class: 'excl-panel' },
        h('p', {}, `Tap the people ${p.name} should NOT get:`),
        others.length
          ? h('div', { class: 'chips' }, others.map((o) => {
              const on = p.exclusions.includes(o.id);
              return h('span', { class: `chip${on ? ' on' : ''}`, onclick: () => toggleExclusion(p, o, !on) }, o.name);
            }))
          : h('p', {}, 'Add more people first.'),
        h('label', { class: 'mutual' },
          h('input', { type: 'checkbox', checked: mutual ? '' : false, onchange: (e) => { mutual = e.target.checked; } }),
          'Apply both ways (e.g. couples can’t draw each other)'),
      )
    : null;

  return h('li', { class: 'person' }, main, panel);
}

/* ---------- actions ---------- */

async function toggleExclusion(p, o, excluded) {
  if (!confirmIfDrawn('Changing exclusions')) return;
  await act('POST', '/api/admin/exclusions', { from: p.id, to: o.id, excluded, mutual });
}

async function rename(p) {
  const name = prompt('New name:', p.name);
  if (name && name.trim() && name.trim() !== p.name) {
    await act('PATCH', `/api/admin/participants/${p.id}`, { name }, 'Renamed');
  }
}

async function newLink(p) {
  if (!confirm(`Make a new link for ${p.name}? Their old link will stop working.`)) return;
  if (await act('POST', `/api/admin/participants/${p.id}/new-link`)) {
    const fresh = state.participants.find((x) => x.id === p.id);
    copy(linkFor(fresh), `New link for ${p.name} copied`);
  }
}

async function remove(p) {
  if (!confirm(`Remove ${p.name}?`)) return;
  if (!confirmIfDrawn(`Removing ${p.name}`)) return;
  if (openExclusions === p.id) openExclusions = null;
  await act('DELETE', `/api/admin/participants/${p.id}`, null, `${p.name} removed`);
}

$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('addName').value.trim();
  if (!name) return;
  if (!confirmIfDrawn(`Adding ${name}`)) return;
  if (await act('POST', '/api/admin/participants', { name }, `${name} added`)) {
    $('addName').value = '';
    $('addName').focus();
  }
});

$('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.activeElement.blur();
  await act('PUT', '/api/admin/event', {
    name: $('evName').value, budget: $('evBudget').value, date: $('evDate').value, message: $('evMsg').value,
  }, 'Details saved');
});

$('drawBtn').addEventListener('click', async () => {
  if (isDrawn() && !confirm('Redraw? Everyone will get a NEW person, so anyone who already looked will need to check again.')) return;
  peek = false;
  await act('POST', '/api/admin/draw', null, '🎉 Names drawn! Send everyone their link.');
});

$('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset the draw? Links will show "not drawn yet" until you draw again.')) return;
  peek = false;
  await act('DELETE', '/api/admin/draw', null, 'Draw reset');
});

$('peekBtn').addEventListener('click', () => {
  if (!peek && !confirm('This shows every pairing, including yours if you’re playing. Continue?')) return;
  peek = !peek;
  render();
});

/* ---------- auth ---------- */

function showLogin() {
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('pw').focus();
}

async function showApp() {
  state = await api('GET', '/api/admin/state');
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  render();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    await api('POST', '/api/login', { password: $('pw').value });
    $('pw').value = '';
    await showApp();
  } catch (err) {
    $('loginErr').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  showLogin();
});

(async () => {
  const { admin } = await api('GET', '/api/me');
  admin ? showApp() : showLogin();
})();
