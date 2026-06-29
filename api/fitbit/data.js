// GET /api/fitbit/data — refreshes the Google access token, fetches sleep + resting HR
// from the Google Fit REST API and returns a vitals payload.
const L = require('./_lib');

function pad2(n) { return String(n).padStart(2, '0'); }
function toRfc3339(ms) { return new Date(ms).toISOString(); }

async function ghGet(path, token) {
  try {
    const r = await fetch(L.API_BASE + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

async function ghPost(path, body, token) {
  try {
    const r = await fetch(L.API_BASE + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cookies = L.parseCookies(req);
  const secure = L.isHttps(req);
  const refresh = cookies.gh_refresh;
  if (!refresh) { res.statusCode = 200; res.end(JSON.stringify({ connected: false })); return; }

  try { L.creds(); }
  catch { res.statusCode = 200; res.end(JSON.stringify({ connected: false, error: 'not_configured' })); return; }

  let tok;
  try {
    tok = await L.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch {
    res.statusCode = 200;
    res.setHeader('Set-Cookie', L.clearCookie('gh_refresh', secure));
    res.end(JSON.stringify({ connected: false, error: 'expired' }));
    return;
  }
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    res.setHeader('Set-Cookie', L.cookie('gh_refresh', tok.refresh_token, { maxAge: 60 * 60 * 24 * 365, secure }));
  }

  const at = tok.access_token;
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const dayAgo  = now - 86400000;

  // Fetch sleep sessions + resting HR aggregate in parallel.
  const [sleepData, rhrData] = await Promise.all([
    // Google Fit sessions endpoint — activityType 72 = sleep
    ghGet(`/users/me/sessions?startTime=${toRfc3339(weekAgo)}&endTime=${toRfc3339(now)}&activityType=72`, at),
    // Google Fit aggregate endpoint — resting heart rate
    ghPost('/users/me/dataset:aggregate', {
      aggregateBy: [{ dataTypeName: 'com.google.heart_rate.resting.summary' }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: String(dayAgo),
      endTimeMillis: String(now),
    }, at),
  ]);

  // Parse resting HR from aggregate buckets.
  let rhr = null;
  if (rhrData && Array.isArray(rhrData.bucket)) {
    for (const bucket of rhrData.bucket) {
      if (!bucket.dataset) continue;
      for (const ds of bucket.dataset) {
        if (!Array.isArray(ds.point)) continue;
        for (const pt of ds.point) {
          if (pt.value && pt.value[0] != null) {
            const v = pt.value[0].fpVal ?? pt.value[0].intVal;
            if (v != null) rhr = Math.round(Number(v));
          }
        }
      }
    }
  }

  // Most recent sleep session (Google Fit uses startTimeMillis / endTimeMillis as strings).
  let sleepHours = null, sleepPerf = null, bedtime = null, wakeTime = null;
  if (sleepData && Array.isArray(sleepData.session) && sleepData.session.length) {
    const sessions = sleepData.session
      .filter(s => s.activityType === 72)
      .sort((a, b) => Number(b.startTimeMillis) - Number(a.startTimeMillis));
    const s = sessions[0];
    if (s) {
      const startMs = Number(s.startTimeMillis);
      const endMs   = Number(s.endTimeMillis);
      const durMs   = endMs - startMs;
      if (durMs > 0) {
        sleepHours = Math.round((durMs / 3600000) * 100) / 100;
        const startD = new Date(startMs);
        const endD   = new Date(endMs);
        bedtime  = pad2(startD.getHours()) + ':' + pad2(startD.getMinutes());
        wakeTime = pad2(endD.getHours())   + ':' + pad2(endD.getMinutes());
        if (s.activeTimeMillis != null && durMs > 0) {
          sleepPerf = Math.round((Number(s.activeTimeMillis) / durMs) * 100);
        }
      }
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    recovery: null,   // Google Fit has no recovery score
    hrv: null,        // Google Fit aggregate HRV requires extra scope + Pixel Watch
    rhr,
    sleepPerf,
    sleepHours,
    sleepTargetHours: 8,
    bedtime,
    wakeTime,
    strain: null,
  }));
};
