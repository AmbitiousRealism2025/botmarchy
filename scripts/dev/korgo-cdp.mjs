// Drive/inspect the Korgo Bot renderer over CDP.
// Usage: node korgo-cdp.mjs screenshot [outfile]
//        node korgo-cdp.mjs eval "<js expression>"
import WebSocket from 'ws';
import fs from 'node:fs';

const cmd = process.argv[2] ?? 'screenshot';
const arg = process.argv[3];

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.on('message', raw => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
await new Promise(r => ws.on('open', r));

try {
  if (cmd === 'screenshot') {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = arg ?? '/tmp/korgo-ui.png';
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('saved', out);
  } else if (cmd === 'eval') {
    const res = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
    console.log(JSON.stringify(res.result?.value ?? res, null, 1).slice(0, 4000));
  }
} finally {
  ws.close();
}
