// Optional real-browser checks. No package dependencies; speaks Chromium CDP.
// deno run -A tools/check-hud-browser.mjs [--baseline=REV] [--output=/tmp/jshack-hud]
// CHROMIUM_PATH may point to any locally installed Chromium executable.
const baseline = Deno.args.find((arg) => arg.startsWith('--baseline='))?.slice(11);
const before = Deno.args.includes('--before') || !!baseline;
const output = Deno.args.find((arg) => arg.startsWith('--output='))?.slice(9) || '/tmp/jshack-hud';
const executable = Deno.env.get('CHROMIUM_PATH') || 'chromium';
const repo = new URL('../', import.meta.url).pathname;
await Deno.mkdir(output, { recursive: true });
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (request) => {
  const path = decodeURIComponent(new URL(request.url).pathname);
  if (path.includes('..')) return new Response('', { status: 400 });
  try {
    let body;
    if (baseline && path.startsWith('/src/')) {
      const result = await new Deno.Command('git', { args: ['show', `${baseline}:${path.slice(1)}`], cwd: repo, stdout: 'piped', stderr: 'null' }).output();
      if (!result.success) return new Response('', { status: 404 });
      body = result.stdout;
    } else body = await Deno.readFile(repo + (path === '/' ? 'index.html' : path.slice(1)));
    const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') || path === '/' ? 'text/html' : 'application/octet-stream';
    return new Response(body, { headers: { 'Content-Type': type } });
  } catch { return new Response('', { status: 404 }); }
});
const profile = await Deno.makeTempDir({ prefix: 'jshack-hud-chrome-' });
const child = new Deno.Command(executable, {
  args: ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  stdout: 'null', stderr: 'piped',
}).spawn();
let socket;
try {
  let stderr = '';
  for await (const chunk of child.stderr.pipeThrough(new TextDecoderStream())) {
    stderr += chunk;
    if (stderr.includes('DevTools listening on')) break;
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  if (!endpoint) throw new Error(stderr);
  const address = new URL(endpoint).host;
  const target = await (await fetch(`http://${address}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  const reports = [];
  for (const width of [320, 360, 375, 390, 430, 768, 1920]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.addr.port}/tests/browser/hud.html` });
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (await evaluate('!!window.ready')) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) throw new Error(`Fixture failed: ${JSON.stringify(errors)}`);
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const screenshot = async (name) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await Deno.writeFile(`${output}/${before ? 'before' : 'after'}-${width}-${name}.png`, Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    };
    await screenshot('normal');
    if (!before) {
      const report = await evaluate(`(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right }; };
        const bars = [...document.querySelectorAll('[data-resource]')];
        return { width: innerWidth, pageWidth: document.documentElement.scrollWidth,
          bars: bars.map(el => ({ ...rect(el), text:el.textContent })),
          top: rect(document.querySelector('#hud-top')),
          objective: rect(document.querySelector('#hud-objective')),
          ticker: rect(window.overlays.ticker),
          tickerOffset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--jshack-ticker-height')),
          controls: [...document.querySelector('#hud-world-controls').children].map(rect),
          action: rect(document.querySelector('#btn-character-sheet')),
        };
      })()`);
      const assert = (condition, message) => { if (!condition) throw new Error(`${width}: ${message}\n${JSON.stringify(report)}`); };
      assert(report.pageWidth === width, 'page overflows');
      assert(report.bars.length === 3 && report.bars.every((bar) => bar.y === report.bars[0].y && Math.abs(bar.width - report.bars[0].width) < 1), 'vitals must be three equal columns');
      assert(report.bars[2].text === 'S103/115', 'complete stamina');
      assert(report.controls.every((control) => control.height === report.controls[0].height), 'controls must align');
      assert(report.objective.height <= 46, 'normal objective must be compact');
      assert(report.action.bottom < report.ticker.y, 'actions overlap ticker');
      assert(report.tickerOffset >= report.ticker.height, 'ticker offset is stale');
      reports.push(report);
      await evaluate('window.questOpenCount=0; window.addEventListener("ui:openQuests",()=>window.questOpenCount++)');
      const plus = report.controls[1];
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: plus.right - 12, y: plus.y + plus.height / 2, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: plus.right - 12, y: plus.y + plus.height / 2, button: 'left', clickCount: 1 });
      assert(await evaluate('document.querySelector("#hud-world-controls").children[1].textContent.includes("120%")'), 'zoom control action');
      const questButton = report.controls[2];
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: questButton.x + questButton.width / 2, y: questButton.y + questButton.height / 2, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: questButton.x + questButton.width / 2, y: questButton.y + questButton.height / 2, button: 'left', clickCount: 1 });
      assert(await evaluate('window.questOpenCount === 1'), 'quest button opens journal');
      await evaluate('document.querySelector("#hud-objective").firstChild.focus()');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert(await evaluate('window.questOpenCount === 2'), 'objective keyboard activation opens journal');
      await evaluate('window.fixture({effects:20,longQuest:true})');
      await screenshot('overflow');
      const effects = await evaluate(`(() => { const el = document.querySelector('#hud-status-effects'); el.scrollLeft = el.scrollWidth; return { client:el.clientWidth, scroll:el.scrollWidth, left:el.scrollLeft, page:document.documentElement.scrollWidth, squares:[...el.children].every(c=>Math.abs(c.offsetWidth-c.offsetHeight)<1) }; })()`);
      assert((effects.scroll <= effects.client || effects.left > 0) && effects.page === width && effects.squares, 'contained square effect overflow');
      if (width === 320) {
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        const box = await evaluate('(() => { const r=document.querySelector("#hud-status-effects").getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()');
        const y = box.y + box.height / 2;
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 294, y, id: 1 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 40, y, id: 1 }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert(await evaluate('document.querySelector("#hud-status-effects").scrollLeft > 0'), 'touch swipe scrolls status effects under input lockdown');
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
      }
      await evaluate('window.overlays.ticker.click()');
      assert(await evaluate('window.overlays.ticker.textContent.includes("An older message")'), 'expanded history missing');
      await screenshot('history');
      await evaluate(`window.dispatchEvent(new CustomEvent('ui:messageMoreShow',{detail:{message:{text:'A pending combat message',type:'combat'},hasMore:true}}))`);
      assert(await evaluate('!!window.overlays.ticker._moreRow?.isConnected'), 'More renderer not active');
      await screenshot('more');
      await evaluate(`window.dispatchEvent(new CustomEvent('ui:messageMoreClear',{detail:{entries:[{text:'Queue cleared'}]}})); window.fixture({effects:0})`);
      assert(await evaluate('document.querySelector("#hud-status-effects").children.length === 0'), 'empty effects take up slots');
      await screenshot('empty');
    }
    if (errors.length) throw new Error(JSON.stringify(errors));
  }
  await Deno.writeTextFile(`${output}/${before ? 'before' : 'after'}-geometry.json`, JSON.stringify(reports, null, 2));
  console.log(`HUD browser checks passed; screenshots: ${output}`);
} finally {
  socket?.close();
  child.kill('SIGTERM');
  await child.status;
  await server.shutdown();
  await Deno.remove(profile, { recursive: true });
}
