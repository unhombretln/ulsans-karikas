// GET /api/results -> team scores of all Ulsans matches (one request to the tournament site).
const { TOURNAMENT, fetchPage, parseClubMatches } = require('../lib/parse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const html = await fetchPage('clubmatches.aspx?id=' + TOURNAMENT + '&cid=15');
    const matches = parseClubMatches(html);
    // The CDN answers everyone from one copy for 60 s, so the tournament site sees at most ~1 request a minute.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    res.end(JSON.stringify({ ok: true, fetched: new Date().toISOString(), matches }));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
