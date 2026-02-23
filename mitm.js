/**
 * TG-DL MITM — 跨域流式下载中转页（插桩版）
 */

(async function () {
  'use strict';

  const log = (...a) => console.log('[MITM]', ...a);
  const err = (...a) => console.error('[MITM]', ...a);

  if (!navigator.serviceWorker) {
    err('Service Worker not supported');
    return;
  }

  log('registering SW...');
  const reg = await navigator.serviceWorker.register('sw.js');
  log('SW registered, state:', reg.active ? 'active' : reg.waiting ? 'waiting' : reg.installing ? 'installing' : 'unknown');

  await navigator.serviceWorker.ready;
  log('SW ready, controller:', !!navigator.serviceWorker.controller);

  if (!navigator.serviceWorker.controller) {
    log('waiting for controllerchange...');
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
    log('controller acquired:', !!navigator.serviceWorker.controller);
  }

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'tgdl-mitm-ready' }, '*');
    log('sent ready to parent');
  }

  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (!e.data.type.startsWith('tgdl-')) return;

    const { type, downloadId, fileName, fileSize, data } = e.data;
    log('recv:', type, downloadId ? downloadId.slice(0, 8) : '', data ? data.byteLength + 'B' : '');

    if (type === 'tgdl-mitm-start') {
      const streamUrl = '/sw/stream/' + encodeURIComponent(downloadId) + '/file' +
        '?name=' + encodeURIComponent(fileName) +
        '&size=' + encodeURIComponent(String(fileSize));
      log('trigger download:', streamUrl);
      const a = document.createElement('a');
      a.href = streamUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'tgdl-mitm-started', downloadId }, '*');
      }
    } else if (type === 'tgdl-chunk' || type === 'tgdl-done' || type === 'tgdl-cancel') {
      const ctrl = navigator.serviceWorker.controller;
      if (!ctrl) {
        err('NO CONTROLLER when forwarding', type);
        return;
      }
      const msg = { type, downloadId };
      if (type === 'tgdl-chunk' && data) {
        msg.data = data;
        ctrl.postMessage(msg, [data]);
      } else {
        ctrl.postMessage(msg);
      }
      log('forwarded to SW:', type);
    }
  });
})();
