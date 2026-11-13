#!/usr/bin/env node
// 렌더 도구: 로컬 HTTP 서버 + 헤드리스 Chromium(Playwright) 로 프레임을 하나씩 그리고 ffmpeg 로 인코딩한다.
//   node render.js check                 폰트/자막 검사만
//   node render.js stills 5,12.5,40      지정 시각(초)의 PNG 저장  → $WORK_DIR/stills/
//   node render.js frames [workers]      전체 프레임 JPEG 저장     → $WORK_DIR/frames/
//   node render.js encode                프레임 → MP4
//   node render.js all [workers]         frames + encode
// 환경변수: MODULES_DIR (three, @fontsource 가 든 node_modules, 기본 ./node_modules)
//           WORK_DIR    (프레임 등 중간 파일, 기본 ./.work)
//           OUT         (최종 MP4 경로, 기본 ../12주차_업무압박_데이터_3D.mp4)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const SRC = __dirname;
const MOD = path.resolve(process.env.MODULES_DIR || path.join(SRC, 'node_modules'));
const WORK = path.resolve(process.env.WORK_DIR || path.join(SRC, '.work'));
const OUT = path.resolve(process.env.OUT || path.join(SRC, '..', '12주차_업무압박_데이터_3D.mp4'));
const FPS = 30;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const file = u.startsWith('/node_modules/') ? path.join(MOD, u.slice('/node_modules/'.length)) : path.join(SRC, u === '/' ? 'index.html' : u);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function openPage(port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const info = await page.evaluate(() => ({ err: window.__error, font: window.__fontReport, text: window.__textCheck, caps: window.__checkCaptions, dur: window.DURATION }));
  if (info.err) throw new Error(info.err);
  const fontOk = Object.values(info.font.check).every(Boolean) && info.text.notCovered.length === 0;
  if (!fontOk) throw new Error('Korean font not fully loaded: ' + JSON.stringify(info));
  if (info.caps.length) throw new Error('Caption overlap: ' + info.caps.join('; '));
  return { browser, page, info };
}

async function shot(page, t, file, type) {
  await page.evaluate((tt) => window.renderAt(tt), t);
  const buf = await page.screenshot(type === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 94 });
  fs.writeFileSync(file, buf);
}

async function main() {
  const cmd = process.argv[2] || 'all';
  const srv = await serve();
  const port = srv.address().port;
  try {
    if (cmd === 'check') {
      const { browser, info } = await openPage(port);
      console.log(JSON.stringify(info, null, 1));
      await browser.close();
    } else if (cmd === 'stills') {
      const times = (process.argv[3] || '4').split(',').map(Number);
      const dir = path.join(WORK, 'stills'); fs.mkdirSync(dir, { recursive: true });
      const { browser, page, info } = await openPage(port);
      console.log('font', JSON.stringify(info.font), 'drawn texts', info.text.drawn);
      for (const t of times) {
        const t0 = Date.now();
        const f = path.join(dir, `t_${t.toFixed(2).padStart(6, '0')}.png`);
        await shot(page, t, f, 'png');
        console.log(f, (Date.now() - t0) + 'ms');
      }
      await browser.close();
    } else if (cmd === 'frames' || cmd === 'all') {
      const workers = Number(process.argv[3] || 3);
      const dir = path.join(WORK, 'frames'); fs.mkdirSync(dir, { recursive: true });
      const probe = await openPage(port);
      const total = Math.round(probe.info.dur * FPS);
      await probe.browser.close();
      const start = Date.now();
      let done = 0;
      const todo = [];
      for (let f = 0; f < total; f++) if (!fs.existsSync(path.join(dir, `f_${String(f).padStart(5, '0')}.jpg`)) || process.env.FORCE) todo.push(f);
      console.log(`frames: ${total}, to render: ${todo.length}, workers: ${workers}`);
      await Promise.all(Array.from({ length: workers }, async (_, w) => {
        const { browser, page } = await openPage(port);
        for (let i = w; i < todo.length; i += workers) {
          const f = todo[i];
          await shot(page, f / FPS, path.join(dir, `f_${String(f).padStart(5, '0')}.jpg`), 'jpeg');
          done++;
          if (done % 150 === 0) console.log(`${done}/${todo.length}  ${((Date.now() - start) / 1000).toFixed(0)}s`);
        }
        await browser.close();
      }));
      console.log(`rendered ${todo.length} frames in ${((Date.now() - start) / 1000).toFixed(0)}s`);
      if (cmd === 'all') encode(dir);
    } else if (cmd === 'encode') {
      encode(path.join(WORK, 'frames'));
    } else throw new Error('unknown command ' + cmd);
  } finally { srv.close(); }
}

function encode(dir) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const args = ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f_%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF || '21', '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-r', String(FPS),
    '-movflags', '+faststart', '-an', OUT];
  console.log('ffmpeg', args.join(' '));
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2) + ' MB');
}

main().catch((e) => { console.error(e); process.exit(1); });
