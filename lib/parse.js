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

// "Sat 11/28/2026 9:00 AM" -> { date: "2026-11-28", time: "09:00" }
function when(s) {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/);
  if (!m) return { date: null, time: null };
  let h = +m[4];
  if (m[6] === 'PM' && h !== 12) h += 12;
  if (m[6] === 'AM' && h === 12) h = 0;
  return { date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, time: `${String(h).padStart(2, '0')}:${m[5]}` };
}

// Club matches page: one row per team match (all days): time, draw, both teams, and the team score.
function parseClubMatches(html) {
  const out = {};
  for (const r of rows(html)) {
    const mm = r.match(/teammatch\.aspx\?[^"]*match=(\d+)/);
    if (!mm) continue;
    const c = cells(r);
    const teams = [...r.matchAll(/<a class="teamname[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1]));
    const awayIdx = c.findIndex((x, i) => i > 3 && /class="teamname/.test(x));
    const t = text(awayIdx >= 0 ? c[awayIdx + 1] || '' : '');
    const draw = (r.match(/draw\.aspx[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    out[mm[1]] = {
      ...when(text(c.find(x => /\d+\/\d+\/\d{4}/.test(x)) || '')),
      draw: draw ? text(draw) : null,
      home: teams[0] || null,
      away: teams[1] || null,
      score: pair(t),
      note: t && !pair(t) ? t : null,
    };
  }
  return out;
}

// Team lineup page: men and women columns.
function parseTeamPlayers(html) {
  const col = cls => {
    const m = html.match(new RegExp('<td class="' + cls + '">([\\s\\S]*?)</table>'));
    return m ? players(m[1]) : [];
  };
  return { men: col('maleplayers'), women: col('femaleplayers'), other: col('unknownplayers') };
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
      // Club cup format: each game is one set to 20 (the team total runs to 100).
      // A single set counts as finished once a side has reached 20.
      else if (sets.length === 1 && Math.max(...sets[0]) >= 20 && sets[0][0] !== sets[0][1]) w = sets[0][0] > sets[0][1] ? 1 : 2;
      // Walkover / retirement: the site marks the winner's cell; fall back to the points column.
      if (!w && note) { const p = pair(text(c[6] || '')); if (p && p[0] !== p[1]) w = p[0] > p[1] ? 1 : 2; }
      games.push({ ev, h: players(c[2]), a: players(c[4]), sets, note, w });
    }
  }
  // Team ids of both sides, from the overview table header (home first).
  let homeId = null, awayId = null;
  if (tableStart >= 0) {
    const thead = html.slice(tableStart, html.indexOf('</thead>', tableStart));
    const ids = [...thead.matchAll(/team\.aspx\?[^"]*team=(\d+)/g)].map(m => +m[1]);
    homeId = ids[0] || null; awayId = ids[1] || null;
  }
  // Planned time from the header table ("Time: Sat 11/28/2026 9:00 AM").
  const t = html.match(/<th>\s*Time:\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/);
  const { date, time } = when(t ? text(t[1]) : '');
  return { score, games, homeId, awayId, date, time };
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

// Draws page: every draw of the tournament as { id, name }.
function parseDrawList(html) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/draw\.aspx\?id=[^"]*?draw=(\d+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const name = text(m[2]);
    if (!name || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: +m[1], name });
  }
  return out;
}

// Matches of one draw: time, court and both sides. A side is a team name once known,
// a placeholder like "Group A #1" before that, or empty for "winner of an earlier round".
function parseDrawMatches(html) {
  const out = [];
  for (const r of rows(html)) {
    const c = cells(r);
    const dash = c.findIndex((x, i) => i > 1 && text(x) === '-');
    if (dash < 1) continue;
    const home = text(c[dash - 1]) || null, away = text(c[dash + 1] || '') || null;
    const w = when(text((r.match(/class="plannedtime"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || ''));
    if (!w.date && !home && !away) continue;
    if (home === 'Home' && away === 'Away') continue; // table header
    const court = (r.match(/court\.aspx[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    const mid = (r.match(/teammatch\.aspx\?[^"]*match=(\d+)/) || [])[1];
    out.push({
      mid: mid ? +mid : null,
      date: w.date,
      time: w.time,
      court: court ? (text(court).match(/(\d+)\s*$/) || [])[1] || null : null,
      venue: court ? text(court).replace(/\s*-\s*\d+\s*$/, '').split(/\s+/)[0] || null : null,
      home,
      away,
    });
  }
  return out;
}

// Any list of team matches (whole tournament, one day): one row per match with time, draw,
// both teams, team score, court and venue. Same row layout as the club's match list.
function parseMatchList(html) {
  const out = [];
  for (const r of rows(html)) {
    const mm = r.match(/teammatch\.aspx\?[^"]*match=(\d+)/);
    if (!mm) continue;
    const c = cells(r);
    const teams = [...r.matchAll(/<a class="teamname[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1]));
    const awayIdx = c.findIndex((x, i) => i > 3 && /class="teamname/.test(x));
    const t = text(awayIdx >= 0 ? c[awayIdx + 1] || '' : '');
    const draw = (r.match(/draw\.aspx[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    const court = (r.match(/court\.aspx[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    out.push({
      mid: +mm[1],
      ...when(text((r.match(/class="plannedtime"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '')),
      draw: draw ? text(draw) : null,
      home: teams[0] || null,
      away: teams[1] || null,
      score: pair(t),
      note: t && !pair(t) ? t : null,
      court: court ? (text(court).match(/(\d+)\s*$/) || [])[1] || null : null,
      venue: court ? text(court).replace(/\s*-\s*\d+\s*$/, '').split(/\s+/)[0] || null : null,
    });
  }
  return out;
}

module.exports = { TOURNAMENT, fetchPage, parseClubMatches, parseMatchList, parseTeamMatch, parseTeamPlayers, parseDrawList, parseDrawMatches, text };
