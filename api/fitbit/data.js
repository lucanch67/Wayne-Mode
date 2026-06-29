// GET /api/fitbit/data — refreshes the Google access token, fetches sleep + resting HR
// from the Google Fit REST API and returns a vitals payload.
const L = require('./_lib');

function pad2(n) { return String(n).padStart(2, '0'); }
function toRfc3339(ms) { return new Date(ms).toISOString(); }

// Returns parsed JSON on success, or { _err: statusCode } on HTTP error.
async function ghGet(path, token) {
  try {
    const r = await fetch(L.API_BASE + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    if (!r.ok) return { _err: r.status };
    return await r.json().catch(() => null);
  } catch { return { _err: 'fetch' }; }
}

async function ghPost(path, body, token) {
  try {
    const r = await fetch(L.API_BASE + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { _err: r.status };
    return await r.json().catch(() => null);
  } catch { return { _err: 'fetch' }; }
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
  const [sleepRes, rhrRes] = await Promise.all([
    // Sleep sessions — activityType 72 = sleep
    ghGet(`/users/me/sessions?startTime=${toRfc3339(weekAgo)}&endTime=${toRfc3339(now)}&activityType=72`, at),
    // Daily heart rate aggregate — min value over the day ≈ resting HR
    ghPost('/users/me/dataset:aggregate', {
      aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: String(dayAgo),
      endTimeMillis: String(now),
    }, at),
  ]);

  // If both API calls hit auth errors, the stored token lacks the required scopes.
  // Return connected:false so the UI shows the "Connect" button → user re-authorises.
  const sleepErrCode = sleepRes && sleepRes._err;
  const rhrErrCode   = rhrRes   && rhrRes._err;
  if ((sleepErrCode === 401 || sleepErrCode === 403) && (rhrErrCode === 401 || rhrErrCode === 403)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ connected: false, error: 'needs_reconnect' }));
    return;
  }

  // Parse resting HR: take the minimum plausible value across all aggregate points.
  // (min over the day is a reasonable resting-HR proxy when sleep data isn't segmented.)
  let rhr = null;
  if (rhrRes && !rhrRes._err && Array.isArray(rhrRes.bucket)) {
    let minVal = Infinity;
    for (const bucket of rhrRes.bucket) {
      if (!bucket.dataset) continue;
      for (const ds of bucket.dataset) {
        if (!Array.isArray(ds.point)) continue;
        for (const pt of ds.point) {
          if (!pt.value) continue;
          for (const v of pt.value) {
            const n = v.fpVal ?? v.intVal;
            // Sanity check: resting HR must be in the 30–120 bpm range
            if (n != null && n >= 30 && n <= 120 && n < minVal) minVal = n;
          }
        }
      }
    }
    if (minVal !== Infinity) rhr = Math.round(minVal);
  }

  // Parse most recent sleep session.
  const sleepData = (sleepRes && !sleepRes._err) ? sleepRes : null;
  let sleepHours = null, sleepPerf = null, bedtime = null, wakeTime = null;
  if (sleepData && Array.isArray(sleepData.session) && sleepData.session.length) {
    const sessions = sleepData.session
      .filter(s => Number(s.activityType) === 72)   // coerce — API may return string
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
        if (s.activeTimeMillis != null) {
          sleepPerf = Math.round((Number(s.activeTimeMillis) / durMs) * 100);
        }
      }
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    recovery: null,   // Google Fit has no recovery score
    hrv: null,        // HRV requires extra scope + Pixel Watch 2+
    rhr,
    sleepPerf,
    sleepHours,
    sleepTargetHours: 8,
    bedtime,
    wakeTime,
    strain: null,
  }));
};
