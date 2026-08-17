import fs from 'node:fs/promises';

const port = process.argv[2] ?? '9225';
const width = Number(process.argv[3] ?? 1280);
const height = Number(process.argv[4] ?? 800);
const directDemoPath = process.argv[5];
const suffix = `${width}x${height}`;
const base = `http://127.0.0.1:${port}`;
let nextId = 1;

async function createPage(url) {
  const res = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Could not create page: ${res.status} ${await res.text()}`);
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    events.push(message);
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      const send = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
        const id = nextId++;
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
        ws.send(JSON.stringify({ id, method, params }));
      });
      resolve({ ws, send, events });
    });
    ws.addEventListener('error', reject);
  });
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }
  return result.result.value;
}

async function waitFor(send, predicateExpression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(send, predicateExpression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${predicateExpression}`);
}

async function screenshot(send, path) {
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path, Buffer.from(image.data, 'base64'));
}

const page = await createPage('about:blank');
const { send, ws } = await connect(page.webSocketDebuggerUrl);
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 700,
});

if (directDemoPath) {
  const demo = JSON.parse(await fs.readFile(directDemoPath, 'utf8'));
  await send('Page.navigate', { url: 'http://localhost:5173/landing' });
  await waitFor(send, `document.body && document.body.innerText.length > 0`);
  await evaluate(send, `(async () => {
    const token = ${JSON.stringify(demo.token)};
    localStorage.setItem('pb_token', token);
    const profile = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).then((res) => res.json());
    localStorage.setItem('pitboss-auth', JSON.stringify({ state: { token, user: profile }, version: 0 }));
    history.replaceState({ usr: { tab: 'run', demoCoach: 'start' }, key: 'qa', idx: 0 }, '', '/tournament/${demo.tournamentId}');
    location.reload();
    return true;
  })()`);
} else {
  await send('Page.navigate', { url: 'http://localhost:5173/demo' });
}

await waitFor(send, `document.body && document.body.innerText.includes("Click Start to continue the demo.")`);
await screenshot(send, `C:/Users/EricA/Projects/PokerPlanner/tmp/qa-start-toast-${suffix}.png`);

const startState = await evaluate(send, `(() => {
  const startButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Start');
  const tip = [...document.querySelectorAll('p')].find((paragraph) => paragraph.textContent.includes('Click Start to continue the demo.'));
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  };
  return { text: document.body.innerText, startButton: rect(startButton), tip: rect(tip?.closest('div')) };
})()`);

await evaluate(send, `(() => {
  const startButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Start');
  startButton?.click();
  return Boolean(startButton);
})()`);

await waitFor(send, `document.body && document.body.innerText.includes("Now play around with the room.")`);
await screenshot(send, `C:/Users/EricA/Projects/PokerPlanner/tmp/qa-explore-toast-${suffix}.png`);

const exploreState = await evaluate(send, `(() => {
  const playerActionsButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Player Actions'));
  const tip = [...document.querySelectorAll('p')].find((paragraph) => paragraph.textContent.includes('Now play around with the room.'));
  const playerSelect = document.querySelector('select');
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  };
  return { text: document.body.innerText, playerActionsButton: rect(playerActionsButton), playerSelect: rect(playerSelect), tip: rect(tip?.closest('div')) };
})()`);

const actionsOpened = await evaluate(send, `(() => {
  const select = document.querySelector('select');
  if (!select || select.options.length < 2) return { changed: false, text: document.body.innerText };
  select.selectedIndex = 1;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return { changed: true, selected: select.options[select.selectedIndex]?.textContent ?? '' };
})()`);

await waitFor(send, `document.body && document.body.innerText.includes("Knockout")`, 10000);
await screenshot(send, `C:/Users/EricA/Projects/PokerPlanner/tmp/qa-player-actions-${suffix}.png`);

const actionsState = await evaluate(send, `(() => {
  const menuButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Player Actions'));
  const knockoutButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Knockout'));
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  };
  return { menuButton: rect(menuButton), knockoutButton: rect(knockoutButton), text: document.body.innerText };
})()`);

console.log(JSON.stringify({ startState, exploreState, actionsOpened, actionsState }, null, 2));
ws.close();
