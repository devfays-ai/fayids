// api/auth/discord.js — Vercel Serverless Function
// POST /api/auth/discord
//
// Required Vercel Environment Variables:
//   DISCORD_CLIENT_ID      — Discord App Client ID
//   DISCORD_CLIENT_SECRET  — Discord App Client Secret
//
// NOTE: DISCORD_REDIRECT_URI is sent from the frontend in the request body.
// This means whatever URI you use on the frontend must ALSO be registered in
// the Discord Developer Portal → OAuth2 → Redirects.
//
// Register BOTH of these in Discord:
//   https://fayid.qzz.io/callback
//   https://fayid.qzz.io/callback.html

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } = process.env;

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.error('[discord] Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET env vars');
    return res.status(500).json({
      error: 'Server not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in Vercel Environment Variables.',
    });
  }

  // ── Parse request body ──────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { code, redirect_uri } = body || {};

  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }
  if (!redirect_uri) {
    return res.status(400).json({ error: 'Missing redirect_uri' });
  }

  // ── Step 1: Exchange code → access token ────────────────────
  let tokenData;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri,  // must match the URI used when the user clicked Login
      }),
    });

    const text = await tokenRes.text();

    try {
      tokenData = JSON.parse(text);
    } catch {
      console.error('[discord] Token response not JSON:', text);
      return res.status(502).json({ error: 'Invalid response from Discord' });
    }

    if (!tokenRes.ok || tokenData.error) {
      console.error('[discord] Token exchange error:', tokenData);
      return res.status(401).json({
        error: 'Discord token exchange failed',
        detail: tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`,
      });
    }
  } catch (err) {
    console.error('[discord] Token fetch threw:', err);
    return res.status(502).json({ error: 'Could not reach Discord API' });
  }

  // ── Step 2: Fetch user profile ───────────────────────────────
  let discordUser;
  try {
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Failed to fetch Discord user' });
    }

    discordUser = await userRes.json();
  } catch (err) {
    console.error('[discord] User fetch threw:', err);
    return res.status(502).json({ error: 'Could not fetch Discord profile' });
  }

  // ── Step 3: Build safe user object ───────────────────────────
  const disc = discordUser.discriminator && discordUser.discriminator !== '0'
    ? `#${discordUser.discriminator}`
    : '';

  // Safe avatar URL
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 5n)}.png`;

  return res.status(200).json({
    id:          discordUser.id,
    username:    `${discordUser.global_name || discordUser.username}${disc}`,
    avatar_url:  avatarUrl,
  });
}
