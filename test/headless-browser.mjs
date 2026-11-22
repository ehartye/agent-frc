/** Test helper: render a served page in headless Chrome or Edge and read back a JSON probe result. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function browser() {
  const candidates = [process.env.CHROME_PATH,
    ...(process.platform === 'win32'
      ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
      : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'])];
  return candidates.find(p => p && existsSync(p));
}

const types = {'.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.js': 'text/javascript', '.json': 'application/json'};

/**
 * Serve `folder` over HTTP and open `page` at the given window size. `probe` is the body of an async
 * function run after load and font loading; its JSON-serialisable return value is returned here.
 */
export async function probePage(folder, page, probe, {width = 1280, height = 900} = {}) {
  const script = `<script>addEventListener('load',async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));
 let out;try{out=await (async()=>{${probe}})()}catch(e){out={probeError:String(e)}}
 const pre=document.createElement('pre');pre.id='headless-probe';pre.textContent=JSON.stringify(out);document.body.append(pre);});</script>`;
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const file = path.join(folder, name);
    if (!file.startsWith(folder) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = readFileSync(file);
    if (name === page) body = Buffer.from(body.toString('utf8').replace(/<\/body>|$/i, m => script + m));
    res.writeHead(200, {'content-type': types[path.extname(file)] ?? 'application/octet-stream'}); res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profileDir = mkdtempSync(path.join(tmpdir(), 'headless-'));
  let dom = '';
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/' + page;
    const child = spawn(browser(), [...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--headless=new', '--disable-gpu',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--user-data-dir=' + profileDir,
      '--window-size=' + width + ',' + height, '--virtual-time-budget=15000', '--dump-dom', url], {timeout: 60_000, killSignal: 'SIGKILL'});
    child.stdout.on('data', d => { dom += d; });
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  } finally {
    server.close();
    // Browser helpers can briefly hold profile files on Windows.
    try { rmSync(profileDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); } catch {}
  }
  const match = /<pre id="headless-probe">([^<]*)<\/pre>/.exec(dom);
  if (!match) throw Error('The page did not report a probe result');
  return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
