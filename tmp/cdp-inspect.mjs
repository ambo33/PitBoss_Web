import fs from 'node:fs/promises';

const wsUrl = process.argv[2];
const outPath = process.argv[3];
if (!wsUrl) throw new Error('Usage: node tmp/cdp-inspect.mjs <ws-url> [screenshot-path]');

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

await send('Runtime.enable');
await send('Page.enable');
const text = await send('Runtime.evaluate', {
  expression: 'document.body?.innerText ?? ""',
  returnByValue: true,
});
if (outPath) {
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(outPath, Buffer.from(image.data, 'base64'));
}
console.log(text.result.value);
ws.close();
