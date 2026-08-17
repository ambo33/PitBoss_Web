const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9341;
const userData = 'C:/Users/EricA/Projects/PokerPlanner/tmp/chrome-seat-qa';
fs.mkdirSync(userData, { recursive: true });

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=430,932',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  'about:blank',
], { stdio: 'ignore' });

function requestJson(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Bad JSON: ${data.slice(0, 120)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitEndpoint() {
  for (let index = 0; index < 50; index += 1) {
    try {
      return await requestJson('/json/version');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('Chrome did not start.');
}

let messageId = 0;
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const message = { id: ++messageId, method, params };
          pending.set(message.id, { res, rej });
          ws.send(JSON.stringify(message));
        });
      },
      close() {
        ws.close();
      },
    });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const pendingMessage = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) pendingMessage.rej(new Error(JSON.stringify(message.error)));
        else pendingMessage.res(message.result);
      }
    };
    ws.onerror = reject;
  });
}

(async () => {
  try {
    await waitEndpoint();
    const target = await requestJson('/json/new?http://localhost:5173/demo', 'PUT');
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    let reachedTournament = false;
    for (let index = 0; index < 120; index += 1) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: 'location.pathname',
        returnByValue: true,
      });
      if (String(result.result.value || '').startsWith('/tournament/')) {
        reachedTournament = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!reachedTournament) throw new Error('Demo did not reach tournament.');

    await cdp.send('Runtime.evaluate', {
      expression: "[...document.querySelectorAll('button')].find((button) => button.textContent && button.textContent.includes('Seat Chart'))?.click()",
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const metrics = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const heading = [...document.querySelectorAll('h3')].find((element) => element.textContent.includes('Table Assignments'));
        const board = heading?.closest('.rounded-xl');
        const cards = board
          ? [...board.querySelectorAll('.grid > div')].slice(0, 8).map((element) => ({
              text: element.innerText,
              rect: element.getBoundingClientRect().toJSON(),
            }))
          : [];
        return {
          path: location.pathname,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          heading: heading?.innerText,
          headingRect: heading?.getBoundingClientRect().toJSON(),
          cards,
        };
      })()`,
    });
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync('tmp/mobile-seat-chart.png', Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify(metrics.result.value, null, 2));
    cdp.close();
  } finally {
    proc.kill();
  }
})().catch((error) => {
  console.error(error);
  proc.kill();
  process.exit(1);
});
