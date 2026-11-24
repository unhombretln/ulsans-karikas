// GET /api/draws -> courts and times of the draws that matter to Ulsans:
// our Saturday groups and the Sunday playoff brackets of the same leagues.
const { TOURNAMENT, fetchPage, parseDrawList, parseDrawMatches } = require('../lib/parse');

// Our groups per league (Saturday). Playoff draws of these leagues are always included.
const OUR_GROUPS = { 'Esiliiga': ['C'], '2.liiga': ['A', 'B', 'E'], '3.liiga': ['A', 'B', 'C', 'D'], 'Rahvaliiga': ['A', 'B'] };

function wanted(name) {
  const league = name.split(/\s+–\s+/)[0];
  if (!OUR_GROUPS[league]) return false;
  const g = name.match(/Group (\w+)\s*$/);
  return g ? OUR_GROUPS[league].includes(g[1]) : true;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const list = parseDrawList(await fetchPage('draws.aspx?id=' + TOURNAMENT)).filter(d => wanted(d.name));
    const draws = await inBatches(list, 5, async d => ({
      ...d,
      rows: parseDrawMatches(await fetchPage('drawmatches.aspx?id=' + TOURNAMENT + '&draw=' + d.id)),
    }));
    // Courts and brackets change rarely: one copy for everyone, refreshed every 5 minutes.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.end(JSON.stringify({ ok: true, fetched: new Date().toISOString(), draws }));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
