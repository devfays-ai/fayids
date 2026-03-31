// ══════════════════════════════════════════════════════════
//  FayDevs - Site — Main App
//  Real Discord OAuth · No demo login · Vercel backend
// ══════════════════════════════════════════════════════════

const CONFIG = {
  DISCORD_CLIENT_ID: '',
  DISCORD_REDIRECT_URI: window.location.origin + '/callback',
  DISCORD_SCOPE: 'identify',
  API: '/api',
};

let currentUser     = null;
let typewriterTimer = null;

// ══════════════════════════════════════════════════════════
//  DISCORD OAUTH
// ══════════════════════════════════════════════════════════

async function fetchConfig() {
  try {
    const res = await fetch(`${CONFIG.API}/config`);
    if (res.ok) {
      const d = await res.json();
      if (d.clientId) CONFIG.DISCORD_CLIENT_ID = d.clientId;
    }
  } catch (_) {}
}

function handleDiscordLogin() {
  if (!CONFIG.DISCORD_CLIENT_ID) {
    showToast('⚙️ Discord not configured. Set DISCORD_CLIENT_ID in Vercel env vars.', 'warn');
    return;
  }

  const state = crypto.randomUUID?.()
    ?? (Math.random().toString(36).slice(2) + Date.now().toString(36));
  sessionStorage.setItem('discord_oauth_state', state);

  const params = new URLSearchParams({
    client_id:     CONFIG.DISCORD_CLIENT_ID,
    redirect_uri:  CONFIG.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         CONFIG.DISCORD_SCOPE,
    state,
  });

  window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
}

// Popup postMessage fallback
window.addEventListener('message', async (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type !== 'DISCORD_CALLBACK') return;
  const { code, state } = e.data;
  const saved = sessionStorage.getItem('discord_oauth_state');
  if (saved && state !== saved) { showToast('❌ Security check failed', 'error'); return; }
  await exchangeCode(code);
});

// Redirect flow — callback.html stored code in sessionStorage
async function handleSessionCallback() {
  const code  = sessionStorage.getItem('discord_callback_code');
  const state = sessionStorage.getItem('discord_callback_state');
  if (!code) return;

  sessionStorage.removeItem('discord_callback_code');
  sessionStorage.removeItem('discord_callback_state');

  const saved = sessionStorage.getItem('discord_oauth_state');
  if (saved && state !== saved) {
    showToast('❌ State mismatch — please try again', 'error');
    return;
  }
  await exchangeCode(code);
}

// ?code= fallback in URL
async function handleURLCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const state  = params.get('state');
  if (!code) return;
  window.history.replaceState({}, '', window.location.pathname);
  const saved = sessionStorage.getItem('discord_oauth_state');
  if (saved && state !== saved) {
    showToast('❌ State mismatch — please try again', 'error');
    return;
  }
  await exchangeCode(code);
}

async function exchangeCode(code) {
  showToast('🔄 Authenticating...', 'info');
  sessionStorage.removeItem('discord_oauth_state');

  try {
    const res = await fetch(`${CONFIG.API}/auth/discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: CONFIG.DISCORD_REDIRECT_URI }),
    });

    const user = await res.json();

    if (!res.ok || user.error) {
      throw new Error(user.error || `HTTP ${res.status}`);
    }

    setUser(user);
  } catch (err) {
    console.error('[OAuth]', err);
    showToast('❌ Login failed — ' + (err.message || 'try again'), 'error');
  }
}

function setUser(user) {
  currentUser = user;
  localStorage.setItem('faydevs_user', JSON.stringify(user));
  updateUserUI();
  showToast(`✅ Welcome, ${user.username}!`, 'success');
  if (window.Rating) Rating.onLogin(user);
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('faydevs_user');
  updateUserUI();
  if (window.Rating) Rating.onLogout();
  showToast('👋 Logged out.', 'info');
}

function updateUserUI() {
  const loginBtn    = document.getElementById('discordLoginBtn');
  const userProfile = document.getElementById('userProfile');
  const userAvatar  = document.getElementById('userAvatar');
  const userName    = document.getElementById('userName');

  if (currentUser) {
    loginBtn?.classList.add('hidden');
    userProfile?.classList.remove('hidden');
    if (userAvatar) userAvatar.src = currentUser.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
    if (userName)  userName.textContent = currentUser.username;
  } else {
    loginBtn?.classList.remove('hidden');
    userProfile?.classList.add('hidden');
  }
}

function restoreSession() {
  try {
    const saved = localStorage.getItem('faydevs_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      updateUserUI();
      if (window.Rating) Rating.onLogin(currentUser);
    }
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════
//  MOBILE DRAWER
// ══════════════════════════════════════════════════════════
function initMobileDrawer() {
  const hamburger = document.getElementById('hamburger');
  const drawer    = document.getElementById('mobileDrawer');
  const overlay   = document.getElementById('drawerOverlay');
  if (!hamburger || !drawer) return;

  hamburger.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    if (overlay) overlay.classList.toggle('hidden', !isOpen);
    drawer.setAttribute('aria-hidden', String(!isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });
}

window.closeMobileDrawer = function () {
  const hamburger = document.getElementById('hamburger');
  const drawer    = document.getElementById('mobileDrawer');
  const overlay   = document.getElementById('drawerOverlay');
  drawer?.classList.remove('open');
  hamburger?.classList.remove('open');
  overlay?.classList.add('hidden');
  drawer?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
};

// ══════════════════════════════════════════════════════════
//  TYPEWRITER
// ══════════════════════════════════════════════════════════
function startTypewriter() {
  const el = document.getElementById('heroTagline');
  if (!el) return;
  clearTimeout(typewriterTimer);
  el.textContent = '';

  const lines = ['DISCORD BOT DEVELOPER', 'ROBLOX CREATOR', '3D MODELLER', 'LUA SCRIPTER', 'WEB BUILDER'];

  let li = 0, ci = 0, deleting = false;

  function tick() {
    const line = lines[li];
    if (!deleting) {
      el.textContent = line.slice(0, ++ci);
      if (ci === line.length) { deleting = true; typewriterTimer = setTimeout(tick, 2000); return; }
    } else {
      el.textContent = line.slice(0, --ci);
      if (ci === 0) { deleting = false; li = (li + 1) % lines.length; }
    }
    typewriterTimer = setTimeout(tick, deleting ? 50 : 80);
  }
  tick();
}

// ══════════════════════════════════════════════════════════
//  ACTIVE NAV ON SCROLL
// ══════════════════════════════════════════════════════════
function updateActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const links    = document.querySelectorAll('.nav-link');
  let current    = '';
  sections.forEach(s => { if (window.scrollY >= s.offsetTop - 110) current = s.id; });
  links.forEach(l => l.classList.toggle('active', l.dataset.section === current));
}

// ══════════════════════════════════════════════════════════
//  REVEAL ON SCROLL
// ══════════════════════════════════════════════════════════
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed'); });
  }, { threshold: 0.08 });

  document.querySelectorAll(
    '.skill-card, .terminal-card, .about-info, .section-header, ' +
    '.rating-stats-panel, .rating-form-panel, .bot-card, .roblox-card, .contact-card'
  ).forEach(el => { el.classList.add('reveal-target'); obs.observe(el); });
}

// ══════════════════════════════════════════════════════════
//  SKILL BAR ANIMATION
// ══════════════════════════════════════════════════════════
function animateSkillBars() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.style.width = e.target.dataset.pct + '%';
      obs.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.skill-fill[data-pct]').forEach(el => obs.observe(el));
}

// ══════════════════════════════════════════════════════════
//  CUSTOM CURSOR
// ══════════════════════════════════════════════════════════
function initCursor() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const cursor = document.getElementById('cursor');
  const trail  = document.getElementById('cursorTrail');
  if (!cursor) return;

  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });
  if (trail) {
    (function loop() {
      tx += (mx - tx) * 0.1; ty += (my - ty) * 0.1;
      trail.style.left = tx + 'px'; trail.style.top = ty + 'px';
      requestAnimationFrame(loop);
    })();
  }
  document.querySelectorAll('a, button, .star-opt').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
  });
}

// ══════════════════════════════════════════════════════════
//  SMOOTH SCROLL
// ══════════════════════════════════════════════════════════
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      closeMobileDrawer();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ══════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}
window.showToast = showToast;

// ══════════════════════════════════════════════════════════
//  NAVBAR SCROLL
// ══════════════════════════════════════════════════════════
function initNavbarScroll() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfig();
  await handleSessionCallback();
  await handleURLCallback();
  restoreSession();

  initCursor();
  initMobileDrawer();
  initSmoothScroll();
  initReveal();
  initNavbarScroll();
  animateSkillBars();

  setTimeout(startTypewriter, 150);

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();
});
