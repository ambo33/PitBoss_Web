import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const siteUrl = 'https://pokerplanner.bet';
const appUrl = 'https://app.pokerplanner.bet';

const sharedFaq = [
  {
    q: 'Is PokerPlanner free to use?',
    a: 'All features are free during the beta and a free model will always be available. Hosts can create groups, build tournaments, run the clock, use the TV board, track players, and use the core planning tools.',
  },
  {
    q: 'Can I use it for a casual home poker game?',
    a: 'Yes. The tool is designed for home poker tournaments first, with simple setup for buy-ins, blinds, breaks, seats, rebuys, add-ons, payouts, and player check-in.',
  },
  {
    q: 'Does the poker timer work on a TV?',
    a: 'Yes. PokerPlanner includes a TV-friendly tournament clock that can be opened on a shared screen so players can see the current level, next blinds, and timer.',
  },
  {
    q: 'Do players need to download an app?',
    a: 'No. PokerPlanner runs in the browser. Players can use links or QR codes to view lobby information, check in, and follow tournament status without installing anything.',
  },
];

const relatedLinks = [
  ['/poker-timer/', 'Poker timer'],
  ['/poker-tournament-clock/', 'Tournament clock'],
  ['/poker-tournament-director/', 'Tournament director'],
  ['/home-poker-tournament/', 'Home poker tournament guide'],
  ['/poker-blinds-schedule/', 'Blind schedule'],
  ['/poker-chip-calculator/', 'Chip calculator'],
];

const pages = [
  {
    slug: 'poker-timer',
    title: 'Free Poker Timer & Tournament Clock | PokerPlanner',
    description: 'Run a home poker tournament with a free poker timer, blind structure, player tracking, breaks, and TV-friendly tournament clock.',
    h1: 'Free Poker Timer for Home Tournaments',
    eyebrow: 'Free poker timer',
    primaryKeyword: 'free poker timer for home game',
    screenshot: 'timer-board.svg',
    screenshotAlt: 'PokerPlanner poker timer showing current blinds, next blinds, and remaining level time',
    intro: 'PokerPlanner gives home-game hosts a clean poker timer that is built for the real pace of a tournament night. Instead of juggling a phone timer, a spreadsheet, and a group chat, you can create the event, set the blind structure, display the clock, and keep players informed from one browser-based workspace.',
    sections: [
      ['A timer made for live poker nights', 'A useful poker timer needs to do more than count down. Players want to know the current blinds, the next jump, when the break is coming, and how much time is left before the room changes pace. PokerPlanner keeps that information visible without turning the host screen into a cluttered control panel. The timer view is easy to read from across the room, and the host controls stay close enough for quick pauses, starts, and level changes.'],
      ['Plan before cards are in the air', 'Good home tournaments start before the first hand. PokerPlanner lets you connect the timer to the tournament setup: buy-in, field size, rebuys, add-ons, payout estimates, saved structures, and player registration. That means the timer is not an isolated stopwatch. It is part of the same workflow that tells you who is checked in, how many chips are in play, what the current level should be, and what needs attention next.'],
      ['TV-friendly by default', 'Many poker timer apps look fine on a phone but fall apart on a shared screen. PokerPlanner includes a tournament clock view that can be opened on a TV or spare monitor. It highlights the active level, current blinds, next blinds, and key tournament details so players do not need to ask the host every ten minutes. For a home game, that alone removes a surprising amount of friction.'],
      ['No download required', 'PokerPlanner runs in a web browser. Hosts can use it from a laptop or tablet, while players can open QR links on their phones. That makes it easier for a rotating group of players because nobody needs to install a special poker timer app just to follow the night. The goal is simple: give the host enough structure to run a cleaner tournament without making casual players learn new software.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'What makes this different from a simple phone timer?',
        a: 'A phone timer counts down one interval. PokerPlanner connects the timer to blinds, players, check-in, seats, payouts, group links, and the TV clock.',
      },
    ],
  },
  {
    slug: 'poker-tournament-clock',
    title: 'Free Poker Tournament Clock for TV | PokerPlanner',
    description: 'Use a browser-based poker tournament clock for home games with blind levels, breaks, next blinds, player tracking, and TV display.',
    h1: 'Free Poker Tournament Clock for Home Games',
    eyebrow: 'Tournament clock',
    primaryKeyword: 'home poker tournament clock',
    screenshot: 'clock-tv.svg',
    screenshotAlt: 'TV poker tournament clock with large time, current blinds, next blinds, and payout panel',
    intro: 'A poker tournament clock should be obvious from across the room. PokerPlanner gives hosts a free browser-based clock that can be used on a laptop, tablet, or TV display, with the blind level, countdown, next level, and tournament context visible at a glance.',
    sections: [
      ['Built for the shared screen', 'The best tournament clock is not just for the host. It is for everyone at the table. When the clock is easy to read, players stop asking what the blinds are, how much time is left, and when the next level starts. PokerPlanner keeps the most important information large and centered, then surrounds it with useful details like structure, payouts, field size, and room status.'],
      ['Control the flow of the night', 'Home tournaments often slow down because the host has too many small jobs. Someone needs to start the timer, pause for a ruling, handle a rebuy, announce a break, and answer questions about payouts. PokerPlanner puts the clock inside a broader tournament workflow so those actions can happen from the same place. The clock becomes the center of the night instead of another separate tab.'],
      ['Useful for casual and recurring groups', 'For a one-night home game, you can build a structure and run the clock quickly. For a recurring group, saved structures and group tools help you repeat what works. The tournament clock can be paired with player registration, check-in, seating, and announcements, which makes the setup feel more consistent over time.'],
      ['Browser-based and simple to share', 'Because PokerPlanner is web-based, you can open the TV clock on a device connected to the room display and keep host controls nearby on another screen. Players can also use phone-friendly links to see tournament information. The result feels more polished than a kitchen timer, but it stays approachable for casual poker nights.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'Can I put the tournament clock on a television?',
        a: 'Yes. PokerPlanner has a TV display built for shared screens with large timer text and visible blind information.',
      },
    ],
  },
  {
    slug: 'poker-tournament-director',
    title: 'Poker Tournament Director Software for Home Games | PokerPlanner',
    description: 'Run home poker tournaments with director tools for blind levels, player check-in, seating, payouts, rebuys, add-ons, and TV clocks.',
    h1: 'Poker Tournament Director for Home Games',
    eyebrow: 'Tournament director tools',
    primaryKeyword: 'poker tournament director for home games',
    screenshot: 'director-dashboard.svg',
    screenshotAlt: 'PokerPlanner tournament director dashboard with players, timer, payouts, and controls',
    intro: 'PokerPlanner acts like a lightweight poker tournament director for home games. It helps the host organize players, structure, blinds, seats, payouts, and the clock without turning a friendly poker night into spreadsheet maintenance.',
    sections: [
      ['Keep the host out of the weeds', 'Most home-game hosts are also playing. That makes tournament administration tricky. You need to know who has arrived, who is registered, whether the blinds are moving, how many players are left, and what the payout math looks like. PokerPlanner keeps those jobs in one place so the host can make quick decisions and get back to the table.'],
      ['Manage players and tournament state', 'A good poker tournament director tool should understand the players, not just the timer. PokerPlanner supports player check-in, guest players, group members, rebuys, add-ons, knockouts, and seats. When players can use QR links and phone-friendly pages, they do not need to crowd the host to ask basic questions or report status.'],
      ['Make the room feel organized', 'The TV board gives the room a central source of truth. The host dashboard gives the organizer the controls they need. Player lobbies give each participant a phone-sized view of the information that matters. Together, those pieces make a home tournament feel smoother without requiring casino-level equipment.'],
      ['Use it as much or as little as you need', 'Some hosts only need a tournament clock and blind schedule. Others want check-in, player tracking, saved structures, group messages, and payouts. PokerPlanner is built so a casual game can stay simple, while recurring groups can add more organization as the night grows. You can start with the essentials and add director-style controls only when they solve a real problem at the table.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'Is PokerPlanner the same as casino tournament director software?',
        a: 'No. It is built for home and private poker groups, with practical host tools instead of casino operations complexity.',
      },
    ],
  },
  {
    slug: 'home-poker-tournament',
    title: 'How to Run a Home Poker Tournament | PokerPlanner',
    description: 'A practical guide to running a home poker tournament with blinds, chips, players, breaks, payouts, seating, and a tournament clock.',
    h1: 'How to Run a Home Poker Tournament',
    eyebrow: 'Home poker guide',
    primaryKeyword: 'how to run a home poker tournament',
    screenshot: 'home-tournament.svg',
    screenshotAlt: 'Home poker tournament setup with players, chip stacks, blind schedule, and tournament timer',
    intro: 'Running a home poker tournament is mostly about clear structure. If players know the buy-in, chips, blind levels, breaks, payouts, and timing, the night feels smooth. PokerPlanner helps hosts put those pieces in one place and keep the game moving.',
    sections: [
      ['Start with the field size and time limit', 'Before choosing blinds, decide how many players you expect and how long the tournament should last. A 6-player weeknight game has different needs than a 16-player Saturday event. The blind schedule, starting chips, rebuy rules, and break timing should all support the length of night you want. PokerPlanner helps connect those choices so the timer and structure match the actual game.'],
      ['Choose a blind schedule players can follow', 'The blind schedule should rise steadily without making the early levels meaningless or the late levels chaotic. Home tournaments often work best with simple levels, clear breaks, and enough time for players to settle in. Showing current and next blinds on a TV or laptop keeps everyone oriented, especially when a host is also playing.'],
      ['Make check-in and seating clear', 'A little organization before cards are dealt saves time later. Decide who is in, whether guests can register, how seating will work, and how late arrivals are handled. PokerPlanner supports group members, player check-in, table seating, and player-facing lobby links so the host can spend less time answering the same setup questions.'],
      ['Set payouts before the bubble', 'Payout arguments are avoidable. Decide how many places pay and what percentages make sense for the field before the tournament starts. PokerPlanner includes payout tools and tournament state so the prize pool can stay visible as players register, rebuy, or add on. That keeps the night friendly when the money gets real.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'How long should a home poker tournament last?',
        a: 'Many casual home tournaments run two to four hours. Field size, starting chips, blind level length, and rebuy rules all affect the finish time.',
      },
    ],
  },
  {
    slug: 'poker-blinds-schedule',
    title: 'Poker Blind Schedule Generator for Home Tournaments | PokerPlanner',
    description: 'Build a poker blinds schedule for home tournaments with level timing, breaks, starting stacks, chip planning, and a TV timer.',
    h1: 'Poker Blinds Schedule for Home Tournaments',
    eyebrow: 'Blind structure planning',
    primaryKeyword: 'poker tournament blind structure generator',
    screenshot: 'blind-schedule.svg',
    screenshotAlt: 'Poker blind schedule table with highlighted current level and next blind level',
    intro: 'A clear poker blinds schedule is the backbone of a good home tournament. PokerPlanner helps hosts build and run blind structures that are easy to understand, visible on the clock, and connected to the rest of the tournament setup.',
    sections: [
      ['The blind schedule controls the pace', 'If blinds climb too slowly, the tournament drags. If they jump too quickly, players feel rushed and short-stacked before the game has developed. A good home poker blind schedule balances starting chips, level length, antes, breaks, and expected field size. PokerPlanner gives the host a practical place to manage that structure and then use it directly in the tournament clock.'],
      ['Make current and next levels visible', 'Players do not only need the current blinds. They also want to know what is coming next. PokerPlanner highlights the active level and shows upcoming levels so the room can prepare for the next jump. That is especially helpful near breaks, after rebuys close, or when players are deciding whether to take a marginal spot.'],
      ['Save structures for recurring groups', 'Many home games eventually find a structure that feels right. Once that happens, a host should not need to rebuild it every week. PokerPlanner supports saved group blind structures so recurring games can start from a proven schedule and adjust only when the format changes.'],
      ['Use the blind schedule with the timer', 'A blind schedule is useful on paper, but it is better when tied to the actual countdown. PokerPlanner connects blind levels to the tournament timer and TV board, reducing manual announcements and keeping the room aligned. The host can focus on decisions instead of remembering which level comes next.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'What is a good blind level length for a home game?',
        a: 'Fifteen to twenty minutes is common for casual home tournaments, but shorter or longer levels can work depending on the player count and desired finish time.',
      },
    ],
  },
  {
    slug: 'poker-chip-calculator',
    title: 'Poker Chip Calculator for Home Tournaments | PokerPlanner',
    description: 'Plan poker chips for a home tournament with starting stacks, blinds, rebuys, add-ons, chip counts, and tournament structure.',
    h1: 'Poker Chip Calculator for Home Tournaments',
    eyebrow: 'Chip planning',
    primaryKeyword: 'poker chip calculator for home tournament',
    screenshot: 'chip-calculator.svg',
    screenshotAlt: 'Poker chip calculator showing starting stacks, blind levels, and chips in play',
    intro: 'A poker chip calculator helps you avoid awkward setup problems before the first hand. PokerPlanner helps home-game hosts think through starting stacks, blind levels, rebuys, add-ons, and tournament pacing so the chip plan matches the night.',
    sections: [
      ['Start with the tournament format', 'Chip planning depends on the number of players, starting stack, blinds, rebuy rules, and how long you want the tournament to last. A deep-stack game needs a different chip mix than a quick weeknight tournament. PokerPlanner keeps chip decisions connected to the blind structure and tournament settings so the host can see the bigger picture.'],
      ['Avoid chip chaos at the table', 'The best chip setup is easy for players to use. Too many small chips slow down betting. Too few useful denominations create awkward change problems. A poker chip calculator should help the host think about practical denominations, chips in play, and how rebuys or add-ons affect the room. PokerPlanner pairs those planning decisions with live tournament tracking.'],
      ['Track rebuys and add-ons clearly', 'Rebuys and add-ons can change the prize pool and chips in play quickly. When the host tracks them in the same tool as the tournament clock, there is less chance of losing count or misquoting the pool. PokerPlanner includes player-level actions so the chip and payout picture stays easier to manage.'],
      ['Plan chips alongside blinds', 'Chip stacks only make sense relative to the blind schedule. If the opening blinds are too high for the starting stack, players feel short immediately. If the structure is too deep, the night may run long. PokerPlanner helps hosts plan chips and blinds together so the tournament has a realistic rhythm. That makes chip planning less about guessing and more about matching the stacks to the experience you want players to have.'],
    ],
    faq: [
      ...sharedFaq,
      {
        q: 'How many chips should each player start with?',
        a: 'Many home tournaments use starting stacks between 5,000 and 20,000 chips. The right number depends on blind levels, player count, and desired tournament length.',
      },
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pageUrl(slug) {
  return `${siteUrl}/${slug}/`;
}

function renderLinks(currentSlug) {
  return relatedLinks
    .filter(([href]) => href !== `/${currentSlug}/`)
    .map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`)
    .join('\n');
}

function renderFaq(faq) {
  return faq.map((item) => `
    <details>
      <summary>${escapeHtml(item.q)}</summary>
      <p>${escapeHtml(item.a)}</p>
    </details>`).join('\n');
}

function renderSchema(page) {
  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'PokerPlanner',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web browser',
    url: pageUrl(page.slug),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: page.description,
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: page.h1, item: pageUrl(page.slug) },
    ],
  };
  return [software, faq, breadcrumb]
    .map((schema) => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`)
    .join('\n');
}

function renderPage(page) {
  const articleSections = page.sections.map(([heading, body]) => `
        <section>
          <h2>${escapeHtml(heading)}</h2>
          <p>${escapeHtml(body)}</p>
        </section>`).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <link rel="canonical" href="${pageUrl(page.slug)}">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl(page.slug)}">
    <meta property="og:image" content="${siteUrl}/seo-assets/${page.screenshot}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    ${renderSchema(page)}
    <style>
      :root { color-scheme: dark; --bg:#101114; --surface:#181a1f; --card:#20232a; --text:#eef2f6; --muted:#a7b0be; --line:#333842; --teal:#14b8a6; --gold:#f4b24a; --red:#ef4444; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.65; }
      a { color: inherit; }
      .skip { position:absolute; left:-999px; top:auto; }
      .skip:focus { left: 1rem; top: 1rem; z-index: 10; background: var(--teal); color: #041010; padding: .65rem .9rem; border-radius: .5rem; }
      header { border-bottom: 1px solid var(--line); background: rgba(16,17,20,.92); position: sticky; top: 0; z-index: 3; backdrop-filter: blur(14px); }
      .nav { max-width: 1120px; margin: 0 auto; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .brand { display: flex; align-items: center; gap: .7rem; text-decoration: none; font-weight: 800; letter-spacing: 0; }
      .brand img { width: 34px; height: 34px; }
      .navlinks { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; justify-content: flex-end; }
      .navlinks a { text-decoration: none; color: var(--muted); font-size: .92rem; font-weight: 650; padding: .45rem .65rem; border-radius: .5rem; }
      .navlinks a:hover { color: var(--text); background: rgba(255,255,255,.06); }
      .cta { background: var(--teal); color: #041010 !important; }
      main { max-width: 1120px; margin: 0 auto; padding: 0 1.25rem 4rem; }
      .hero { display: grid; gap: 2rem; grid-template-columns: minmax(0, 1fr); padding: 4.5rem 0 3rem; }
      .eyebrow { display: inline-flex; color: var(--teal); border: 1px solid rgba(20,184,166,.35); background: rgba(20,184,166,.1); border-radius: 999px; padding: .35rem .7rem; font-size: .78rem; font-weight: 750; text-transform: uppercase; }
      h1 { font-size: clamp(2.45rem, 7vw, 5.1rem); line-height: .98; margin: 1rem 0 1.1rem; letter-spacing: 0; max-width: 860px; }
      h2 { font-size: clamp(1.45rem, 2.6vw, 2rem); line-height: 1.16; margin: 0 0 .75rem; letter-spacing: 0; }
      h3 { font-size: 1.08rem; margin: 0 0 .4rem; }
      p { color: var(--muted); margin: 0 0 1rem; }
      .lead { font-size: 1.12rem; max-width: 780px; color: #d3dae3; }
      .buttons { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.45rem; }
      .button { border: 1px solid var(--line); background: var(--card); color: var(--text); text-decoration: none; padding: .82rem 1rem; border-radius: .55rem; font-weight: 750; display: inline-flex; }
      .button.primary { border-color: var(--teal); background: var(--teal); color: #041010; }
      .screenshot { margin-top: .8rem; border: 1px solid var(--line); border-radius: .8rem; overflow: hidden; background: var(--surface); box-shadow: 0 24px 70px rgba(0,0,0,.35); }
      .screenshot img { display: block; width: 100%; height: auto; }
      .grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
      .content { display: grid; gap: 1rem; margin-top: 1rem; }
      section, .panel { border: 1px solid var(--line); background: var(--surface); border-radius: .8rem; padding: 1.2rem; }
      .links { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .7rem; }
      .links a { text-decoration: none; border: 1px solid var(--line); background: var(--card); border-radius: .55rem; padding: .75rem; font-weight: 700; color: #d9e2ea; }
      details { border: 1px solid var(--line); border-radius: .65rem; background: rgba(255,255,255,.03); padding: .9rem 1rem; }
      details + details { margin-top: .7rem; }
      summary { cursor: pointer; font-weight: 800; color: var(--text); }
      details p { margin-top: .65rem; margin-bottom: 0; }
      footer { border-top: 1px solid var(--line); padding: 2rem 1.25rem; color: var(--muted); text-align: center; }
      @media (min-width: 840px) {
        .hero { grid-template-columns: minmax(0, .85fr) minmax(390px, 1fr); align-items: center; }
        .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .content { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px) {
        .nav { align-items: flex-start; }
        .navlinks a:not(.cta) { display: none; }
        main { padding-left: 1rem; padding-right: 1rem; }
        .hero { padding-top: 3rem; }
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>
    <header>
      <nav class="nav" aria-label="Primary">
        <a class="brand" href="/">
          <img src="/branding/pokerplanner-logo-compact.png" alt="" width="34" height="34">
          <span>PokerPlanner</span>
        </a>
        <div class="navlinks">
          <a href="/poker-timer/">Poker timer</a>
          <a href="/home-poker-tournament/">Home game guide</a>
          <a href="${appUrl}/login?mode=register" class="cta">Create account</a>
        </div>
      </nav>
    </header>
    <main id="content">
      <article>
        <div class="hero">
          <div>
            <span class="eyebrow">${escapeHtml(page.eyebrow)}</span>
            <h1>${escapeHtml(page.h1)}</h1>
            <p class="lead">${escapeHtml(page.intro)}</p>
            <div class="buttons">
              <a class="button primary" href="${appUrl}/login?mode=register">Start free</a>
              <a class="button" href="/poker-tournament-clock/">See tournament clock</a>
            </div>
          </div>
          <figure class="screenshot">
            <img src="/seo-assets/${page.screenshot}" alt="${escapeHtml(page.screenshotAlt)}" width="960" height="620" loading="eager">
          </figure>
        </div>
        <div class="content">
${articleSections}
        </div>
        <section style="margin-top:1rem">
          <h2>Related poker tournament tools and guides</h2>
          <div class="links">
            ${renderLinks(page.slug)}
          </div>
        </section>
        <section style="margin-top:1rem">
          <h2>FAQ</h2>
          ${renderFaq(page.faq)}
        </section>
      </article>
    </main>
    <footer>
      <p>PokerPlanner.bet helps home-game hosts plan tournaments, run the clock, and keep players informed.</p>
    </footer>
  </body>
</html>
`;
}

function screenshotSvg(title, subtitle, rows, accent = '#14b8a6') {
  const rowMarkup = rows.map((row, index) => {
    const y = 300 + index * 46;
    const fill = index === 1 ? '#f6d36d' : '#22262e';
    const text = index === 1 ? '#2b2107' : '#f1f5f9';
    return `<rect x="70" y="${y}" width="820" height="34" rx="8" fill="${fill}"/><text x="92" y="${y + 23}" fill="${text}" font-size="17" font-weight="700">${escapeHtml(row)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="620" viewBox="0 0 960 620" role="img" aria-label="${escapeHtml(title)}">
  <rect width="960" height="620" fill="#101114"/>
  <rect x="34" y="34" width="892" height="552" rx="28" fill="#181a1f" stroke="#333842" stroke-width="2"/>
  <rect x="70" y="70" width="820" height="78" rx="18" fill="#20232a" stroke="#333842"/>
  <circle cx="112" cy="109" r="20" fill="${accent}" opacity=".22"/>
  <text x="150" y="103" fill="#f8fafc" font-size="24" font-weight="800">${escapeHtml(title)}</text>
  <text x="150" y="130" fill="#a7b0be" font-size="15">${escapeHtml(subtitle)}</text>
  <rect x="70" y="178" width="510" height="94" rx="20" fill="#0b0c0f" stroke="#333842"/>
  <text x="105" y="236" fill="#f8fafc" font-size="58" font-family="ui-monospace, Menlo, monospace" font-weight="900">18:42</text>
  <text x="370" y="216" fill="#a7b0be" font-size="16" font-weight="700">Level 4</text>
  <text x="370" y="244" fill="${accent}" font-size="25" font-weight="900">300 / 600</text>
  <rect x="610" y="178" width="280" height="94" rx="20" fill="#20232a" stroke="#333842"/>
  <text x="638" y="216" fill="#a7b0be" font-size="15">Next blinds</text>
  <text x="638" y="248" fill="#f8fafc" font-size="31" font-weight="900">500 / 1K</text>
  ${rowMarkup}
  <rect x="70" y="532" width="250" height="30" rx="8" fill="${accent}" opacity=".16"/>
  <text x="92" y="553" fill="${accent}" font-size="15" font-weight="800">Browser based, no download</text>
</svg>`;
}

const screenshots = {
  'timer-board.svg': screenshotSvg('Poker Timer', 'Current level, next blinds, and live countdown', ['Level 3  200 / 400', 'Level 4  300 / 600', 'Level 5  500 / 1K', 'Break  10 minutes']),
  'clock-tv.svg': screenshotSvg('Tournament Clock', 'TV-friendly view for the whole room', ['Players left  12', 'Level 4  300 / 600', 'Next break  24 minutes', 'Prize pool  $860'], '#f4b24a'),
  'director-dashboard.svg': screenshotSvg('Tournament Director', 'Host controls, player status, and payouts', ['Checked in  14 / 16', 'Active level  300 / 600', 'Rebuys  5', 'Paid places  3']),
  'home-tournament.svg': screenshotSvg('Home Poker Tournament', 'Plan the night before cards are dealt', ['Players  10', 'Starting stack  10,000', 'Levels  18 minutes', 'Breaks  every hour'], '#ef4444'),
  'blind-schedule.svg': screenshotSvg('Blind Schedule', 'Structure levels tied to the clock', ['Level 1  100 / 200', 'Level 2  150 / 300', 'Level 3  200 / 400', 'Level 4  300 / 600']),
  'chip-calculator.svg': screenshotSvg('Chip Calculator', 'Starting stacks, rebuys, add-ons, chips in play', ['Starting stack  10,000', 'Players  12', 'Rebuy chips  5,000', 'Total chips  145,000'], '#f4b24a'),
};

async function main() {
  await mkdir(path.join(publicDir, 'seo-assets'), { recursive: true });

  for (const [filename, svg] of Object.entries(screenshots)) {
    await writeFile(path.join(publicDir, 'seo-assets', filename), svg, 'utf8');
  }

  for (const page of pages) {
    const pageDir = path.join(publicDir, page.slug);
    await mkdir(pageDir, { recursive: true });
    await writeFile(path.join(pageDir, 'index.html'), renderPage(page), 'utf8');
  }

  const urls = pages.map((page) => `/${page.slug}/`);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${siteUrl}${url}</loc></url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');

  const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
  await writeFile(path.join(publicDir, 'robots.txt'), robots, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
