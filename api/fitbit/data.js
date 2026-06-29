// GET /api/fitbit/data — refresh token, fetch health data from Google Health API v4.
// Endpoints: /v4/users/me/dataTypes/{type}/dataPoints
// Scopes: googlehealth.sleep.readonly + googlehealth.health_metrics_and_measurements.readonly
const L = require('./_lib');

function pad2(n) { return String(n).padStart(2, '0'); }
function toIso(ms) { return new Date(ms).toISOString(); }
function toDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function qs(params) { return '?' + new URLSearchParams(params).toString(); }

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
  const now = Date.now();
  const today     = toDate(now);
  const yesterday = toDate(now - 86400000);
  const weekAgo   = toIso(now - 7 * 86400000);
  const nowIso    = toIso(now);

  // Fetch sleep, resting HR, and HRV in parallel via Google Health API v4.
  // Endpoint path: /v4/users/me/dataTypes/{kebab-case}/dataPoints
  // Filter uses snake_case data type names per AIP-160 spec.
  const [sleepRes, rhrRes, hrvRes] = await Promise.all([
    ghGet('/users/me/dataTypes/sleep/dataPoints' + qs({
      filter: `sleep.interval.start_time >= "${weekAgo}" AND sleep.interval.start_time <= "${nowIso}"`,
      pageSize: 7,
    }), at),
    ghGet('/users/me/dataTypes/daily-resting-heart-rate/dataPoints' + qs({
      filter: `daily_resting_heart_rate.date >= "${yesterday}" AND daily_resting_heart_rate.date <= "${today}"`,
    }), at),
    ghGet('/users/me/dataTypes/heart-rate-variability/dataPoints' + qs({
      filter: `heart_rate_variability.date >= "${yesterday}" AND heart_rate_variability.date <= "${today}"`,
    }), at),
  ]);

  // If sleep + resting HR both fail with auth errors → token needs new scopes → ask to reconnect.
  if ((sleepRes?._err === 401 || sleepRes?._err === 403) &&
      (rhrRes?._err === 401 || rhrRes?._err === 403)) {
    res.statusCode = 200;
    res.end(JSON.stringify({ connected: false, error: 'needs_reconnect' }));
    return;
  }

  // ── Parse most recent sleep session ──────────────────────────────────────
  let sleepHours = null, sleepPerf = null, bedtime = null, wakeTime = null;
  if (sleepRes && !sleepRes._err && Array.isArray(sleepRes.dataPoints) && sleepRes.dataPoints.length) {
    const sessions = sleepRes.dataPoints
      .filter(p => p.sleep?.interval?.startTime && p.sleep?.interval?.endTime)
      .sort((a, b) => new Date(b.sleep.interval.startTime) - new Date(a.sleep.interval.startTime));
    const s = sessions[0]?.sleep;
    if (s) {
      const startMs = new Date(s.interval.startTime).getTime();
      const endMs   = new Date(s.interval.endTime).getTime();
      const durMs   = endMs - startMs;
      if (durMs > 0) {
        const sd = new Date(startMs), ed = new Date(endMs);
        bedtime  = pad2(sd.getHours()) + ':' + pad2(sd.getMinutes());
        wakeTime = pad2(ed.getHours()) + ':' + pad2(ed.getMinutes());
        // minutesAsleep is actual sleep time; minutesInSleepPeriod is total time in bed.
        const asleep = s.summary?.minutesAsleep != null ? Number(s.summary.minutesAsleep) : null;
        const inBed  = s.summary?.minutesInSleepPeriod != null ? Number(s.summary.minutesInSleepPeriod) : null;
        sleepHours = asleep != null ? Math.round((asleep / 60) * 100) / 100
                                    : Math.round((durMs / 3600000) * 100) / 100;
        if (asleep != null && inBed != null && inBed > 0) {
          sleepPerf = Math.round((asleep / inBed) * 100);
        }
      }
    }
  }

  // ── Parse resting HR ─────────────────────────────────────────────────────
  // Response field: dataPoints[].dailyRestingHeartRate.beatsPerMinute (int64 string)
  let rhr = null;
  if (rhrRes && !rhrRes._err && Array.isArray(rhrRes.dataPoints) && rhrRes.dataPoints.length) {
    const sorted = rhrRes.dataPoints
      .filter(p => p.dailyRestingHeartRate?.beatsPerMinute != null)
      .sort((a, b) => {
        const da = a.dailyRestingHeartRate.date, db = b.dailyRestingHeartRate.date;
        return (db.year * 10000 + db.month * 100 + db.day) -
               (da.year * 10000 + da.month * 100 + da.day);
      });
    const bpm = Number(sorted[0]?.dailyRestingHeartRate?.beatsPerMinute);
    if (bpm >= 30 && bpm <= 120) rhr = bpm;
  }

  // ── Parse HRV (RMSSD ms) ─────────────────────────────────────────────────
  // Response field: dataPoints[].dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds
  let hrv = null;
  if (hrvRes && !hrvRes._err && Array.isArray(hrvRes.dataPoints) && hrvRes.dataPoints.length) {
    const sorted = hrvRes.dataPoints
      .filter(p => p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds != null)
      .sort((a, b) => {
        const da = a.dailyHeartRateVariability.date, db = b.dailyHeartRateVariability.date;
        return (db.year * 10000 + db.month * 100 + db.day) -
               (da.year * 10000 + da.month * 100 + da.day);
      });
    const ms = Number(sorted[0]?.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds);
    if (ms > 0 && ms < 300) hrv = Math.round(ms);
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    readiness: null,   // Fitbit Daily Readiness requires Fitbit Web API (not Google Health)
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
