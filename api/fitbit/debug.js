// GET /api/fitbit/debug — returns raw Google Health API v4 responses for diagnosis.
// TEMPORARY — remove after debugging.
const L = require('./_lib');

function toIso(ms) { return new Date(ms).toISOString(); }
function toDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function qs(params) { return '?' + new URLSearchParams(params).toString(); }

async function ghGet(path, token) {
  try {
    const url = L.API_BASE + path;
    const r = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, ok: r.ok, url, body };
  } catch (e) { return { status: 0, ok: false, error: e.message }; }
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cookies = L.parseCookies(req);
  const refresh = cookies.gh_refresh;
  if (!refresh) { res.end(JSON.stringify({ error: 'no_refresh_cookie' })); return; }

  let tok;
  try {
    tok = await L.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  } catch (e) {
    res.end(JSON.stringify({ error: 'token_refresh_failed', detail: e.message }));
    return;
  }

  const at = tok.access_token;
  const now = Date.now();
  const today     = toDate(now);
  const yesterday = toDate(now - 86400000);
  const weekAgo   = toIso(now - 7 * 86400000);
  const nowIso    = toIso(now);

  const [sleep, rhr, hrv, sleepNoFilter, rhrNoFilter] = await Promise.all([
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
    // Also try without filter to see if ANY data exists at all
    ghGet('/users/me/dataTypes/sleep/dataPoints?pageSize=3', at),
    ghGet('/users/me/dataTypes/daily-resting-heart-rate/dataPoints?pageSize=3', at),
  ]);

  res.end(JSON.stringify({
    meta: { now: nowIso, today, yesterday, weekAgo, apiBase: L.API_BASE },
    scopes_in_token: tok.scope || '(not returned)',
    sleep_with_filter: sleep,
    rhr_with_filter: rhr,
    hrv_with_filter: hrv,
    sleep_no_filter: sleepNoFilter,
    rhr_no_filter: rhrNoFilter,
  }, null, 2));
};
