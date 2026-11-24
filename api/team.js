// GET /api/team?id=57 -> lineup of one team (for opponents that appear on Sunday).
const { TOURNAMENT, fetchPage, parseTeamPlayers } = require('../lib/parse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = String((req.query && req.query.id) || '');
  if (!/^\d{1,5}$/.test(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: 'id must be a team number' }));
  }
  try {
    const html = await fetchPage('teamplayers.aspx?id=' + TOURNAMENT + '&tid=' + id);
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=3600');
    res.end(JSON.stringify({ ok: true, id: +id, ...parseTeamPlayers(html) }));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
