// GET /api/fitbit/data — refreshes the Google access token, fetches sleep / resting HR
// from Google Health API and returns a vitals payload. Same-origin → no CORS.
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
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cookies = L.parseCookies(req);
  const secure = L.isHttps(req);
  const refresh = cookies.gh_refresh;
  if (!refresh) { res.statusCode = 200; res.end(JSON.stringify({ connected: false })); return; }

  try { L.creds(); }
  catch (e) { res.statusCode = 200; res.end(JSON.stringify({ connected: false, error: 'not_configured' })); return; }

  let tok;
  try {
    tok = await L.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch (e) {
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

  // Fetch sleep sessions (activityType 72 = sleep) and health metrics in parallel.
  const [sleepData, metricsData] = await Promise.all([
    ghGet(`/users/-/sessions?startTime=${toRfc3339(weekAgo)}&endTime=${toRfc3339(now)}&activityType=72`, at),
    ghGet(`/users/-/healthMetrics?startTime=${toRfc3339(now - 86400000)}&endTime=${toRfc3339(now)}`, at),
  ]);

  // Resting HR from health metrics.
  let rhr = null;
  if (metricsData && Array.isArray(metricsData.healthMetrics)) {
    const hrMetric = metricsData.healthMetrics.find(m => m.metricType === 'METRIC_TYPE_RESTING_HEART_RATE');
    if (hrMetric && hrMetric.value != null) rhr = Math.round(Number(hrMetric.value));
  }

  // Most recent sleep session.
  let sleepHours = null, sleepPerf = null, bedtime = null, wakeTime = null;
  if (sleepData && Array.isArray(sleepData.session) && sleepData.session.length) {
    const sessions = sleepData.session
      .filter(s => s.activityType === 72)
      .sort((a, b) => String(b.startTime).localeCompare(String(a.startTime)));
    const s = sessions[0];
    if (s) {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const durationMs = end - start;
      sleepHours = Math.round((durationMs / 3600000) * 100) / 100;
      bedtime = pad2(start.getHours()) + ':' + pad2(start.getMinutes());
      wakeTime = pad2(end.getHours()) + ':' + pad2(end.getMinutes());
      // activeTime vs total time gives efficiency if available.
      if (s.activeTimeMillis != null && durationMs > 0) {
        sleepPerf = Math.round((Number(s.activeTimeMillis) / durationMs) * 100);
      }
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    connected: true, source: 'fitbit', ts: Date.now(),
    recovery: null,
    hrv: null,
    rhr,
    sleepPerf,
    sleepHours,
    sleepTargetHours: 8,
    bedtime,
    wakeTime,
    strain: null,
  }));
};
