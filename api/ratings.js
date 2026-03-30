// api/ratings.js — Vercel Serverless Function
// GET  /api/ratings  → fetch all ratings
// POST /api/ratings  → submit or update a rating
//
// Storage: Vercel KV (Redis-backed)
// Setup:   vercel.com → Project → Storage → Create KV Store → Link to project
// Env var: KV_REST_API_URL and KV_REST_API_TOKEN are auto-injected by Vercel KV
//
// Falls back to in-memory store (resets on cold-start) if KV is not configured.

const RATINGS_KEY = 'fayid:ratings';

// ── Vercel KV helpers (uses REST API directly, no SDK needed) ─────────────────
async function kvGet(key) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;

  try {
    const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return false;

  try {
    const res = await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── In-memory fallback (no KV configured) ─────────────────────────────────────
const memStore = { reviews: [] };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(str, max = 300) {
  return String(str || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET /api/ratings ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const raw = await kvGet(RATINGS_KEY);
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!data) data = memStore;

    return res.status(200).json(data);
  }

  // ── POST /api/ratings ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const { userId, username, avatar, stars, text } = body || {};

    if (!userId || !stars) {
      return res.status(400).json({ error: 'Missing userId or stars' });
    }
    if (typeof stars !== 'number' || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Stars must be 1–5' });
    }

    // Load existing
    const raw = await kvGet(RATINGS_KEY);
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!data) data = { reviews: [...memStore.reviews] };

    const review = {
      userId: sanitize(userId, 50),
      username: sanitize(username || 'Anonymous', 50),
      avatar: sanitize(avatar || '', 200),
      stars: Math.round(stars),
      text: sanitize(text || '', 300),
      timestamp: Date.now(),
    };

    const idx = data.reviews.findIndex(r => r.userId === review.userId);
    if (idx >= 0) {
      data.reviews[idx] = review;
    } else {
      data.reviews.push(review);
    }

    // Persist
    const saved = await kvSet(RATINGS_KEY, JSON.stringify(data));
    if (!saved) {
      // Update memory fallback too
      const mi = memStore.reviews.findIndex(r => r.userId === review.userId);
      if (mi >= 0) memStore.reviews[mi] = review;
      else memStore.reviews.push(review);
    }

    return res.status(200).json({ success: true, review });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
