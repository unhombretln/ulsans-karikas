// GET /api/all?day=28 -> every team match of the tournament on that day (27, 28 or 29 November):
// time, court, draw, both teams and the team score. Not used by the Ulsans view.
const { TOURNAMENT, fetchPage, parseMatchList, text } = require('../lib/parse');

const DAYS = { '27': '20261127', '28': '20261128', '29': '20261129' };
const ISO = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const day = String((req.query && req.query.day) || '');
  if (!DAYS[day]) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: 'day must be 27, 28 or 29' }));
  }
  try {
    const html = await fetchPage('matches.aspx?id=' + TOURNAMENT + '&d=' + DAYS[day]);
    const matches = parseMatchList(html, ISO(DAYS[day]));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    const out = { ok: true, day: +day, fetched: new Date().toISOString(), count: matches.length, matches };
    if (req.query.debug) {
      const t = html.indexOf('<table class="ruler matches');
      out.title = (html.match(/<title>([^<]*)/) || [])[1];
      out.rawHead = t >= 0 ? html.slice(t, t + 3000) : html.slice(0, 1500);
      out.dayLinks = [...new Set([...html.matchAll(/matches\.aspx\?[^"]*d=(\d{8})/g)].map(m => m[1]))];
    }
    res.end(JSON.stringify(out));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=20');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
