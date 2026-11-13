'use strict';
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

async function inspector(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Inspector closed')); }
    pending.clear();
  });
  return {
    send(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector timed out: ${method}`)); }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

async function launchPackaged({ executablePath, args, env }) {
  const child = spawn(executablePath, ['--inspect=0', '--remote-debugging-port=0', ...args], { env, windowsHide: true });
  let browser, node;
  try {
    const endpoints = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Packaged application did not expose its QA endpoints: ${output.slice(-2000)}`)), 120000);
      child.once('error', (err) => { clearTimeout(timer); reject(err); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Packaged application exited at launch: ${code}`)); });
      child.stderr.on('data', (data) => {
        output = (output + data).slice(-10000);
        const nodeUrl = /Debugger listening on (ws:\/\/[^\s]+)/.exec(output)?.[1];
        const browserUrl = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output)?.[1];
        if (nodeUrl && browserUrl) { clearTimeout(timer); resolve({ nodeUrl, browserUrl }); }
      });
    });
    node = await inspector(endpoints.nodeUrl);
    const diagnostics = await node.send('Runtime.evaluate', { expression: "JSON.stringify({ready:require('electron').app.isReady(),windows:require('electron').BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),loading:w.webContents.isLoading()}))})", includeCommandLineAPI: true, returnByValue: true });
    console.log('PACKAGED STARTUP', diagnostics.result?.value || diagnostics.exceptionDetails);
    await node.send('Runtime.evaluate', { expression: "globalThis.rendererFailures=[];require('electron').app.on('web-contents-created',(_event,wc)=>{wc.on('render-process-gone',(_e,detail)=>globalThis.rendererFailures.push(detail));wc.on('did-fail-load',(_e,code,text)=>globalThis.rendererFailures.push({code,text}));});", includeCommandLineAPI: true });
    await new Promise(done => setTimeout(done, 5000));
    const observed = await node.send('Runtime.evaluate', { expression: "({failures:globalThis.rendererFailures,windows:require('electron').BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),loading:w.webContents.isLoading()})),metrics:require('electron').app.getAppMetrics().map(m=>({type:m.type,pid:m.pid,memory:m.memory}))})", includeCommandLineAPI: true, returnByValue: true });
    console.log('PACKAGED RENDERER', JSON.stringify(observed.result?.value || observed.exceptionDetails));
    browser = await chromium.connectOverCDP(endpoints.browserUrl, { timeout: 30000 });
    const evaluate = async (fn, argument) => {
      const expression = `(${fn.toString()})(require('electron'), ${JSON.stringify(argument) || 'undefined'})`;
      let response = await node.send('Runtime.evaluate', { expression, includeCommandLineAPI: true, returnByValue: true });
      if (response.result?.subtype === 'promise') response = await node.send('Runtime.awaitPromise', { promiseObjectId: response.result.objectId, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    await evaluate(async ({ app }) => { await app.whenReady(); });
    return {
      evaluate,
      async firstWindow() {
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.waitForEvent('page', { timeout: 30000 });
        await page.waitForLoadState('domcontentloaded');
        return page;
      },
      async close() {
        await evaluate(({ app }) => app.quit()).catch(() => {});
        node.close();
        await browser.close().catch(() => {});
        if (child.exitCode === null) await new Promise((resolve) => {
          const timer = setTimeout(() => { stopChild(); resolve(); }, 5000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
      },
    };
  } catch (err) {
    node?.close();
    await browser?.close().catch(() => {});
    stopChild();
    throw err;
  }
  function stopChild() {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15000 });
    else child.kill();
  }
}

module.exports = { launchPackaged };
