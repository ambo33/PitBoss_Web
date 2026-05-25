import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildFinalStacks,
  buildStandings,
  generatePointsLookup,
  normalizeFinalMultipliers,
  normalizePointsLookup,
  pointsForPlace,
  type LeagueMemberRow,
  type LeaguePointRule,
  type LeagueResultRow,
} from '../src/leagues/scoring';

type TestCase = {
  name: string;
  run: () => void;
};

type QaLeague = {
  members: LeagueMemberRow[];
  results: LeagueResultRow[];
  pointsLookup: LeaguePointRule[];
  showupBonus: number;
  bestFinishCount: number;
};

function sumRules(rules: LeaguePointRule[]) {
  return rules.reduce((sum, rule) => sum + (rule.place === 'DNF' ? 0 : Number(rule.points)), 0);
}

function numericRules(rules: LeaguePointRule[]) {
  return rules.filter((rule): rule is { place: number; points: number } => typeof rule.place === 'number');
}

function createQaLeague(playerCount: number, options: Partial<Pick<QaLeague, 'showupBonus' | 'bestFinishCount'>> = {}): QaLeague {
  return {
    members: [],
    results: [],
    pointsLookup: generatePointsLookup(playerCount),
    showupBonus: options.showupBonus ?? 300,
    bestFinishCount: options.bestFinishCount ?? 7,
  };
}

function addPlayers(league: QaLeague, names: string[]) {
  for (const name of names) {
    league.members.push({
      userid: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      emailaddress: null,
      displayname: name,
      isadmin: false,
      approved: true,
      participating: true,
    });
  }
}

function logFinish(league: QaLeague, eventid: string, userid: string, placed: number | null, dnf = false) {
  const points = pointsForPlace(league.pointsLookup, placed, dnf);
  const showupbonuspoints = dnf ? 0 : league.showupBonus;
  const existing = league.results.find((result) => result.eventid === eventid && result.userid === userid);
  if (existing) {
    existing.placed = dnf ? null : placed;
    existing.dnf = dnf;
    existing.points = points;
    existing.showupbonuspoints = showupbonuspoints;
    return;
  }
  league.results.push({
    resultid: `${eventid}-${userid}`,
    eventid,
    leagueid: 'qa-league',
    userid,
    displayname: userid,
    placed: dnf ? null : placed,
    dnf,
    points,
    showupbonuspoints,
    loggedby: 'qa-admin',
    createdat: '2026-05-25',
    updatedat: '2026-05-25',
  });
}

function setPointChart(league: QaLeague, rules: LeaguePointRule[]) {
  league.pointsLookup = normalizePointsLookup(rules);
  for (const result of league.results) {
    result.points = pointsForPlace(league.pointsLookup, result.placed, result.dnf);
  }
}

function standings(league: QaLeague) {
  return buildStandings(league.members, league.results, league.bestFinishCount);
}

function findStanding(league: QaLeague, userid: string) {
  const standing = standings(league).find((item) => item.userid === userid);
  assert.ok(standing, `Missing standing for ${userid}`);
  return standing;
}

const tests: TestCase[] = [
  {
    name: '1. Help-me-decide point chart creates one score per player and totals player count x 100',
    run: () => {
      const rules = generatePointsLookup(20);
      assert.equal(rules.length, 21);
      assert.equal(sumRules(rules), 2000);
    },
  },
  {
    name: '2. Generated placement scores are monotonic so 9th never beats 8th',
    run: () => {
      const rules = numericRules(generatePointsLookup(20));
      for (let index = 1; index < rules.length; index += 1) {
        assert.ok(rules[index - 1].points >= rules[index].points, `${rules[index].place}th outscored the previous place`);
      }
    },
  },
  {
    name: '3. Spreadsheet-style 36-player chart preserves the known 4,311-point payout shape',
    run: () => {
      const rules = generatePointsLookup(36, 4311);
      assert.equal(sumRules(rules), 4311);
      assert.equal(pointsForPlace(rules, 1, false), 671);
      assert.equal(pointsForPlace(rules, 2, false), 448);
      assert.equal(pointsForPlace(rules, 3, false), 336);
    },
  },
  {
    name: '4. DNF and missing placements never award placement points',
    run: () => {
      const rules = generatePointsLookup(12);
      assert.equal(pointsForPlace(rules, null, false), 0);
      assert.equal(pointsForPlace(rules, 1, true), 0);
    },
  },
  {
    name: '5. JSON point charts normalize string numbers before scoring',
    run: () => {
      const rules = normalizePointsLookup(JSON.stringify([{ place: 'DNF', points: '0' }, { place: '1', points: '860' }]));
      assert.equal(pointsForPlace(rules, 1, false), 860);
    },
  },
  {
    name: '6. Standings add placement points and show-up bonus numerically, not by string concatenation',
    run: () => {
      const league = createQaLeague(20);
      addPlayers(league, ['Ambo']);
      league.results.push({
        resultid: 'r1',
        eventid: 'event-1',
        leagueid: 'qa-league',
        userid: 'ambo',
        displayname: 'Ambo',
        placed: 1,
        dnf: false,
        points: '860',
        showupbonuspoints: '300',
      });
      assert.equal(findStanding(league, 'ambo').totalpoints, 1160);
    },
  },
  {
    name: '7. Best-finish scoring keeps only top finishes but keeps every show-up bonus',
    run: () => {
      const league = createQaLeague(10, { bestFinishCount: 2, showupBonus: 50 });
      addPlayers(league, ['Ambo']);
      logFinish(league, 'event-1', 'ambo', 1);
      logFinish(league, 'event-2', 'ambo', 2);
      logFinish(league, 'event-3', 'ambo', 3);
      const topTwo = [1, 2].reduce((sum, place) => sum + pointsForPlace(league.pointsLookup, place, false), 0);
      const ambo = findStanding(league, 'ambo');
      assert.equal(ambo.scoredpoints, topTwo);
      assert.equal(ambo.showupbonus, 150);
      assert.equal(ambo.totalpoints, topTwo + 150);
    },
  },
  {
    name: '8. Non-participating and unapproved users stay out of season standings',
    run: () => {
      const league = createQaLeague(8);
      addPlayers(league, ['Active', 'Removed', 'Pending']);
      league.members.find((member) => member.userid === 'removed')!.participating = false;
      league.members.find((member) => member.userid === 'pending')!.approved = false;
      logFinish(league, 'event-1', 'active', 1);
      logFinish(league, 'event-1', 'removed', 2);
      logFinish(league, 'event-1', 'pending', 3);
      assert.deepEqual(standings(league).map((item) => item.userid), ['active']);
    },
  },
  {
    name: '9. Re-logging a finish updates placement and recalculates that player only once',
    run: () => {
      const league = createQaLeague(12);
      addPlayers(league, ['Ambo']);
      logFinish(league, 'event-1', 'ambo', 6);
      logFinish(league, 'event-1', 'ambo', 1);
      assert.equal(league.results.length, 1);
      assert.equal(findStanding(league, 'ambo').scoredpoints, pointsForPlace(league.pointsLookup, 1, false));
    },
  },
  {
    name: '10. Changing the point chart recalculates standings without touching show-up bonuses',
    run: () => {
      const league = createQaLeague(6);
      addPlayers(league, ['Ambo', 'Brian']);
      logFinish(league, 'event-1', 'ambo', 1);
      logFinish(league, 'event-1', 'brian', 2);
      setPointChart(league, [{ place: 'DNF', points: 0 }, { place: 1, points: 1000 }, { place: 2, points: 500 }]);
      assert.equal(findStanding(league, 'ambo').totalpoints, 1300);
      assert.equal(findStanding(league, 'brian').totalpoints, 800);
    },
  },
  {
    name: '11. Changing final multipliers does not change regular-season points',
    run: () => {
      const league = createQaLeague(6);
      addPlayers(league, ['Ambo']);
      logFinish(league, 'event-1', 'ambo', 1);
      const before = findStanding(league, 'ambo').totalpoints;
      const stacks = buildFinalStacks(standings(league), {
        finalenabled: true,
        finalmultiplierlookup: normalizeFinalMultipliers([{ place: 1, multiplier: 25 }]),
        finalchiprounding: 100,
        finalstartingbigblind: 100,
      });
      assert.equal(findStanding(league, 'ambo').totalpoints, before);
      assert.equal(stacks[0].multiplier, 25);
    },
  },
  {
    name: '12. Default final multipliers start strongest at 1st place instead of zeroing the leader',
    run: () => {
      const multipliers = normalizeFinalMultipliers(null);
      assert.equal(multipliers[0].place, 1);
      assert.ok(multipliers[0].multiplier > multipliers[1].multiplier);
      assert.ok(multipliers[0].multiplier > 0);
    },
  },
];

const results: Array<{ name: string; passed: boolean; error?: string }> = [];

for (const test of tests) {
  try {
    test.run();
    results.push({ name: test.name, passed: true });
    console.log(`ok ${results.length} - ${test.name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name: test.name, passed: false, error });
    console.error(`not ok ${results.length} - ${test.name}`);
    console.error(error);
  }
}

const passed = results.filter((result) => result.passed).length;
const failed = results.length - passed;
const reportDir = path.resolve(__dirname, 'test-results');
const reportPath = path.join(reportDir, 'league-workflows.html');
fs.mkdirSync(reportDir, { recursive: true });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

fs.writeFileSync(reportPath, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>League Workflow Regression Report</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07090d;
      --panel: #11141b;
      --panel-2: #171a22;
      --line: #2a3040;
      --text: #f7f8ff;
      --muted: #9aa1b8;
      --teal: #11b6b4;
      --green: #38d996;
      --red: #ff6b7a;
      --yellow: #f7d85c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top left, rgba(17, 182, 180, 0.16), transparent 34rem), var(--bg);
      color: var(--text);
    }
    main {
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    .hero {
      border: 1px solid rgba(17, 182, 180, 0.35);
      background: linear-gradient(135deg, rgba(17, 182, 180, 0.12), rgba(17, 20, 27, 0.92));
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
    }
    .eyebrow {
      color: var(--teal);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    h1 {
      margin: 10px 0 8px;
      font-size: clamp(30px, 5vw, 54px);
      line-height: 1;
      letter-spacing: 0;
    }
    p {
      color: var(--muted);
      font-size: 16px;
      line-height: 1.55;
      margin: 0;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0 0;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(8, 10, 15, 0.55);
      padding: 16px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .metric strong {
      display: block;
      margin-top: 8px;
      font-size: 34px;
      line-height: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .case {
      border: 1px solid var(--line);
      border-left: 4px solid var(--green);
      border-radius: 14px;
      background: var(--panel);
      padding: 14px 16px;
      min-height: 92px;
    }
    .case.fail {
      border-left-color: var(--red);
    }
    .case h2 {
      margin: 0;
      font-size: 15px;
      line-height: 1.35;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      color: var(--green);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .fail .status { color: var(--red); }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 16px currentColor;
    }
    pre {
      margin: 12px 0 0;
      white-space: pre-wrap;
      color: var(--yellow);
      font-size: 12px;
    }
    .stamp {
      margin-top: 16px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 760px) {
      main { width: min(100vw - 20px, 640px); padding-top: 12px; }
      .summary, .grid { grid-template-columns: 1fr; }
      .hero { padding: 18px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">ThePokerPlanner QA</div>
      <h1>League Workflow Regression Report</h1>
      <p>Saved workflow checks for league creation math, player finishes, point chart changes, standings, show-up bonuses, DNF handling, and final table multipliers.</p>
      <div class="summary">
        <div class="metric"><span>Total scenarios</span><strong>${results.length}</strong></div>
        <div class="metric"><span>Passed</span><strong style="color: var(--green)">${passed}</strong></div>
        <div class="metric"><span>Failed</span><strong style="color: ${failed ? 'var(--red)' : 'var(--green)'}">${failed}</strong></div>
      </div>
      <div class="stamp">Generated ${new Date().toLocaleString()}</div>
    </section>
    <section class="grid">
      ${results.map((result) => `
        <article class="case ${result.passed ? '' : 'fail'}">
          <h2>${escapeHtml(result.name)}</h2>
          <div class="status"><span class="dot"></span>${result.passed ? 'Passed' : 'Failed'}</div>
          ${result.error ? `<pre>${escapeHtml(result.error)}</pre>` : ''}
        </article>
      `).join('')}
    </section>
  </main>
</body>
</html>
`, 'utf8');

console.log(`\n${passed} of ${results.length} league workflow regression scenarios passed.`);
console.log(`Report saved to ${reportPath}`);

if (failed > 0) {
  process.exitCode = 1;
}
