// GET /api/match?id=578 -> the five games of one team match (players, set scores, winner).
// Add &debug=1 to also get the raw text of each row, for checking the parser against a real page.
const { TOURNAMENT, fetchPage, parseTeamMatch, text } = require('../lib/parse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = String((req.query && req.query.id) || '');
  if (!/^\d{1,5}$/.test(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: 'id must be a match number' }));
  }
  try {
    const html = await fetchPage('teammatch.aspx?id=' + TOURNAMENT + '&match=' + id);
    const data = parseTeamMatch(html);
    if (req.query.meta) {
      // Which two teams play: this does not change, so the CDN may keep it for 6 hours.
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=3600');
      return res.end(JSON.stringify({ ok: true, id: +id, homeId: data.homeId, awayId: data.awayId }));
    }
    const done = data.games.length > 0 && data.games.every(g => g.w);
    // A finished match does not change, so it can be cached for an hour; a running one for a minute.
    res.setHeader('Cache-Control', done ? 'public, s-maxage=3600' : 'public, s-maxage=60, stale-while-revalidate=60');
    const out = { ok: true, id: +id, fetched: new Date().toISOString(), done, ...data };
    if (req.query.debug) {
      const t = html.indexOf('Match overview');
      out.raw = t >= 0 ? text(html.slice(t, html.indexOf('</table>', t))).split('\n') : null;
    }
    res.end(JSON.stringify(out));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
