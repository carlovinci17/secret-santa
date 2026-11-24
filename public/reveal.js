'use strict';

const root = document.getElementById('root');
const token = location.pathname.split('/').pop();

function message(emoji, title, text) {
  const box = document.createElement('div');
  box.className = 'msg';
  const e = document.createElement('div'); e.className = 'emoji'; e.textContent = emoji;
  const h = document.createElement('h1'); h.style.margin = '10px 0 8px'; h.textContent = title;
  const p = document.createElement('p'); p.style.margin = '0'; p.style.opacity = '.85'; p.textContent = text;
  box.append(e, h, p);
  root.replaceChildren(box);
}

function snow() {
  const wrap = document.getElementById('snow');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 40; i++) {
    const f = document.createElement('span');
    f.className = 'flake';
    f.textContent = Math.random() > 0.5 ? '❄' : '•';
    f.style.left = Math.random() * 100 + 'vw';
    f.style.fontSize = 6 + Math.random() * 14 + 'px';
    f.style.animationDuration = 6 + Math.random() * 10 + 's';
    f.style.animationDelay = -Math.random() * 15 + 's';
    wrap.append(f);
  }
}

async function load() {
  snow();
  let data;
  try {
    const res = await fetch(`/api/reveal/${encodeURIComponent(token)}`);
    data = await res.json();
    if (!res.ok) return message('🔒', 'Link not found', data.error || 'Ask the organiser for a new link.');
  } catch {
    return message('📡', 'Can’t connect', 'Check your internet connection and try again.');
  }

  const eventName = data.event?.name || 'Secret Santa';
  document.title = `${eventName} · ${data.name}`;

  if (!data.drawn) {
    return message('⏳', `Hi ${data.name}!`, `You’re in ${eventName}. Names haven’t been drawn yet, so check this link again soon.`);
  }

  root.replaceChildren(document.getElementById('tplReveal').content.cloneNode(true));
  root.querySelector('[data-name]').textContent = data.name;
  root.querySelector('[data-event]').textContent = eventName;
  root.querySelector('[data-receiver]').textContent = data.receiver;

  const meta = root.querySelector('[data-meta]');
  if (data.event.budget) meta.append(Object.assign(document.createElement('span'), { textContent: `💰 Budget: ${data.event.budget}` }));
  if (data.event.date) meta.append(Object.assign(document.createElement('span'), { textContent: `📅 ${data.event.date}` }));
  if (data.event.message) {
    const note = root.querySelector('[data-note]');
    note.textContent = data.event.message;
    note.classList.remove('hidden');
  }

  const gift = document.getElementById('gift');
  gift.addEventListener('click', () => {
    gift.classList.add('opened');
    setTimeout(() => {
      document.getElementById('giftWrap').style.display = 'none';
      document.getElementById('result').classList.add('show');
    }, 550);
  }, { once: true });
}

load();
