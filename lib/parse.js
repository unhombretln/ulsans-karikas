// Parsing helpers for tournamentsoftware.com pages (no dependencies).
const TOURNAMENT = '9CA77EC2-61DB-4937-B9AC-024A0704CA09';
const BASE = 'https://www.tournamentsoftware.com/sport/';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENT[e]);
}
// Text of an HTML fragment, without the hidden "[EST]" print-only flag labels.
function text(html) {
  return decode(
    html
      .replace(/<span class="printonly[^"]*">[\s\S]*?<\/span>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
function rows(html) {
  return html.match(/<tr[\s>][\s\S]*?<\/tr>/g) || [];
}
function cells(rowHtml) {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
}
function players(cellHtml) {
  return [...cellHtml.matchAll(/<a[^>]*player\.aspx[^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1]));
}
// "3-2", "3 - 2" -> [3, 2]
function pair(s) {
  const m = (s || '').match(/(\d+)\s*[-–:]\s*(\d+)/);
  return m ? [+m[1], +m[2]] : null;
}

// Club matches page: one row per team match, team score in the cell after the away team.
function parseClubMatches(html) {
  const out = {};
  for (const r of rows(html)) {
    const mm = r.match(/teammatch\.aspx\?[^"]*match=(\d+)/);
    if (!mm) continue;
    const c = cells(r);
    const awayIdx = c.findIndex((x, i) => i > 3 && /class="teamname/.test(x));
    const scoreCell = awayIdx >= 0 ? c[awayIdx + 1] || '' : '';
    const t = text(scoreCell);
    out[mm[1]] = { score: pair(t), note: t && !pair(t) ? t : null };
  }
  return out;
}

// Team match page: header table (Score) + "Match overview" table with one row per game.
function parseTeamMatch(html) {
  const head = html.match(/<th>\s*Score:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/);
  const score = head ? pair(text(head[1])) : null;
  const tableStart = html.indexOf('Match overview');
  const games = [];
  if (tableStart >= 0) {
    const tableHtml = html.slice(tableStart, html.indexOf('</table>', tableStart));
    const body = tableHtml.slice(tableHtml.indexOf('<tbody'));
    for (const r of rows(body)) {
      const c = cells(r);
      if (c.length < 6) continue;
      const ev = text(c[1]);
      if (!/^[A-Z]{2}\d*$/.test(ev)) continue;
      const scoreText = text(c[5]);
      const sets = [...scoreText.matchAll(/(\d{1,2})\s*-\s*(\d{1,2})/g)].map(m => [+m[1], +m[2]]);
      const note = scoreText.replace(/(\d{1,2})\s*-\s*(\d{1,2})/g, '').replace(/[\s,]+/g, ' ').trim() || null;
      let won = [0, 0];
      sets.forEach(([a, b]) => { if (a > b) won[0]++; else if (b > a) won[1]++; });
      let w = 0;
      if (won[0] >= 2 && won[0] > won[1]) w = 1;
      else if (won[1] >= 2 && won[1] > won[0]) w = 2;
      // Walkover / retirement: the site marks the winner's cell; fall back to the points column.
      if (!w && note) { const p = pair(text(c[6] || '')); if (p && p[0] !== p[1]) w = p[0] > p[1] ? 1 : 2; }
      games.push({ ev, h: players(c[2]), a: players(c[4]), sets, note, w });
    }
  }
  return { score, games };
}

async function fetchPage(path) {
  const r = await fetch(BASE + path, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UlsansSchedule/1.0)',
      'Accept-Language': 'en',
      // Accepts the site's cookie notice so the page itself is served.
      Cookie: 'st=l=1033&exp=46400&c=1&cp=23',
    },
  });
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('location') || '';
    throw new Error(/cookiewall/i.test(loc) ? 'cookiewall' : 'redirect ' + r.status + ' ' + loc);
  }
  if (!r.ok) throw new Error('status ' + r.status);
  return r.text();
}

module.exports = { TOURNAMENT, fetchPage, parseClubMatches, parseTeamMatch, text };
