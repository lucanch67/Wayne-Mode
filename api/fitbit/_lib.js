// Shared helpers for Google Fit OAuth serverless functions.
// Client secret lives only here (server-side, from env).
// Tokens are kept in httpOnly cookies — never exposed to the browser.
const crypto = require('crypto');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://health.googleapis.com/v1';
const SCOPE = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ');

function getOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}
function redirectUri(req) { return getOrigin(req) + '/api/fitbit/callback'; }
function isHttps(req) { return getOrigin(req).startsWith('https'); }

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function cookie(name, val, opts) {
  opts = opts || {};
  let s = name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; SameSite=Lax';
  if (opts.secure !== false) s += '; Secure';
  if (opts.maxAge != null) s += '; Max-Age=' + opts.maxAge;
  return s;
}
function clearCookie(name, secure) {
  return name + '=; Path=/; HttpOnly; SameSite=Lax' + (secure !== false ? '; Secure' : '') + '; Max-Age=0';
}

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) { const e = new Error('GOOGLE_NOT_CONFIGURED'); e.code = 'GOOGLE_NOT_CONFIGURED'; throw e; }
  return { id, secret };
}

// Google token requests use body params (client_id + client_secret in body).
async function tokenRequest(params) {
  const { id, secret } = creds();
  const body = new URLSearchParams({ ...params, client_id: id, client_secret: secret });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error_description || j.error || '';
    const e = new Error('token ' + r.status + ' ' + msg); e.status = r.status; throw e;
  }
  return j;
}

module.exports = { crypto, AUTH_URL, TOKEN_URL, API_BASE, SCOPE, getOrigin, redirectUri, isHttps, parseCookies, cookie, clearCookie, creds, tokenRequest };
