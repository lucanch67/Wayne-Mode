// GET /api/fitbit/data — refresh token, fetch health data from Google Health API v4.
const L = require('./_lib');

function pad2(n) { return String(n).padStart(2, '0'); }
// Parse "7200s" or "-3600s" UTC offset strings into milliseconds.
function offsetMs(s) { const n = parseInt(s || '0', 10); return isNaN(n) ? 0 : n * 1000; }

// Pick the data point with the largest timeFn(point) value — don't trust API response
// order, since a differently-ordered page would otherwise make the shown value flip
// between syncs even with no new data.
function pickLatest(points, timeFn) {
  let best = null, bestT = -Infinity;
  for (const p of points) {
    const t = timeFn(p);
    if (t != null && t > bestT) { bestT = t; best = p; }
  }
  return best;
}

async function ghGet(path, token) {
  try {
    const r = await fetch(L.API_BASE + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
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

  // No filter — pageSize=3 gives enough recent entries to pick the actual latest from (see pickLatest).
  const [sleepRes, rhrRes, hrvRes] = await Promise.all([
    ghGet('/users/me/dataTypes/sleep/dataPoints?pageSize=3', at),
    ghGet('/users/me/dataTypes/daily-resting-heart-rate/dataPoints?pageSize=3', at),
    ghGet('/users/me/dataTypes/heart-rate-variability/dataPoints?pageSize=3', at),
  ]);

  // Detect auth failure → ask user to reconnect.
  if ((sleepRes?._err === 401 || sleepRes?._err === 403) &&
      (rhrRes?._err === 401 || rhrRes?._err === 403)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ connected: false, error: 'needs_reconnect' }));
    return;
  }

  // ── Parse most recent sleep session ──────────────────────────────────────
  // startUtcOffset / endUtcOffset ("7200s") must be applied to get local clock time.
  let sleepHours = null, sleepPerf = null, bedtime = null, wakeTime = null;
  if (sleepRes && !sleepRes._err && Array.isArray(sleepRes.dataPoints) && sleepRes.dataPoints.length) {
    const latest = pickLatest(sleepRes.dataPoints, p => {
      const t = p.sleep?.interval?.startTime;
      return t ? new Date(t).getTime() : null;
    });
    const s = latest?.sleep;
    if (s) {
      const startUtc = new Date(s.interval.startTime).getTime();
      const endUtc   = new Date(s.interval.endTime).getTime();
      const startLocal = startUtc + offsetMs(s.interval.startUtcOffset);
      const endLocal   = endUtc   + offsetMs(s.interval.endUtcOffset);
      const sd = new Date(startLocal), ed = new Date(endLocal);
      bedtime  = pad2(sd.getUTCHours()) + ':' + pad2(sd.getUTCMinutes());
      wakeTime = pad2(ed.getUTCHours()) + ':' + pad2(ed.getUTCMinutes());

      const asleep = s.summary?.minutesAsleep != null ? Number(s.summary.minutesAsleep) : null;
      const inBed  = s.summary?.minutesInSleepPeriod != null ? Number(s.summary.minutesInSleepPeriod) : null;
      const durMs  = endUtc - startUtc;
      sleepHours = asleep != null ? Math.round((asleep / 60) * 100) / 100
                                  : Math.round((durMs / 3600000) * 100) / 100;
      if (asleep != null && inBed != null && inBed > 0) {
        sleepPerf = Math.round((asleep / inBed) * 100);
      }
    }
  }

  // ── Parse resting HR (most recent daily value) ───────────────────────────
  let rhr = null;
  if (rhrRes && !rhrRes._err && Array.isArray(rhrRes.dataPoints) && rhrRes.dataPoints.length) {
    const latest = pickLatest(rhrRes.dataPoints, p => {
      const d = p.dailyRestingHeartRate?.date;
      return d ? d.year * 10000 + d.month * 100 + d.day : null;
    });
    const bpm = Number(latest?.dailyRestingHeartRate?.beatsPerMinute);
    if (bpm >= 30 && bpm <= 120) rhr = bpm;
  }

  // ── Parse HRV (most recent overnight reading) ────────────────────────────
  let hrv = null;
  if (hrvRes && !hrvRes._err && Array.isArray(hrvRes.dataPoints) && hrvRes.dataPoints.length) {
    const latest = pickLatest(hrvRes.dataPoints, p => {
      const t = p.heartRateVariability?.sampleTime?.physicalTime;
      return t ? new Date(t).getTime() : null;
    });
    const ms = Number(latest?.heartRateVariability?.rootMeanSquareOfSuccessiveDifferencesMilliseconds);
    if (ms > 0 && ms < 300) hrv = Math.round(ms);
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    recovery: null,
    hrv,
    rhr,
    sleepPerf,
    sleepHours,
    sleepTargetHours: 8,
    bedtime,
    wakeTime,
    strain: null,
  }));
};
