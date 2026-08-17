import fs from 'node:fs/promises';

const wsUrl = process.argv[2];
const outPath = process.argv[3];
if (!wsUrl || !outPath) throw new Error('Usage: node tmp/cdp-click-knockout.mjs <ws-url> <screenshot-path>');

let nextId = 1;
const ws = new WebSocket(wsUrl);
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Evaluation failed');
  return result.result.value;
}

await send('Runtime.enable');
await send('Page.enable');
const state = await evaluate(`(() => {
  const knockout = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Knockout'));
  knockout?.click();
  const text = document.body.innerText;
  const creditLabel = [...document.querySelectorAll('*')].find((node) => node.textContent === 'Who got them?');
  const candidates = [...document.querySelectorAll('button')].filter((button) => button.textContent.includes('No knockout credit') || button.textContent.includes('Bubble Bob') || button.textContent.includes('Kicker Kyle')).map((button) => button.textContent.trim());
  return { clicked: Boolean(knockout), hasCreditLabel: Boolean(creditLabel), candidates, text };
})()`);

await new Promise((resolve) => setTimeout(resolve, 300));
const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(outPath, Buffer.from(image.data, 'base64'));
console.log(JSON.stringify(state, null, 2));
ws.close();
