// GET /api/fitbit/logout — forgets the stored Google refresh token (disconnect).
const L = require('./_lib');

module.exports = (req, res) => {
  const secure = L.isHttps(req);
  res.setHeader('Set-Cookie', [L.clearCookie('gh_refresh', secure), L.clearCookie('gh_state', secure)]);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ connected: false }));
};
