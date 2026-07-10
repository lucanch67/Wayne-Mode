// GET /api/fitbit/debug — probes for the Google Health sleep-score data type.
// TEMPORARY — remove after debugging.
const L = require('./_lib');

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
  const candidates = [
    'sleep-score', 'daily-sleep-score', 'daily-sleep', 'sleep-summary',
    'daily-readiness', 'readiness', 'daily-sleep-summary', 'sleep-stages-summary',
  ];
  const [dataTypesList, ...probes] = await Promise.all([
    ghGet('/users/me/dataTypes', at),
    ...candidates.map(c => ghGet('/users/me/dataTypes/' + c + '/dataPoints?pageSize=1', at)),
  ]);

  res.end(JSON.stringify({
    scopes_in_token: tok.scope || '(not returned)',
    all_data_types: dataTypesList,
    sleep_score_candidates: Object.fromEntries(candidates.map((c, i) => [c, probes[i]])),
  }, null, 2));
};
