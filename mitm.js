/**
 * TG-DL MITM — 跨域流式下载中转页
 *
 * 职责：
 *   1. 注册并激活 Web Service Worker
 *   2. 接收来自 TG 页面扩展的 postMessage (chunk/done/cancel)
 *   3. 转发给 SW，并在 SW 就绪后触发浏览器原生下载
 */

(async function () {
  'use strict';

  // 注册 SW
  if (!navigator.serviceWorker) {
    console.error('[MITM] Service Worker not supported');
    return;
  }

  const reg = await navigator.serviceWorker.register('sw.js');

  // 等待 SW 激活并控制本页
  await navigator.serviceWorker.ready;

  // 通知父页面：SW 已就绪
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'tgdl-mitm-ready' }, '*');
  }

  // 监听来自 TG 页面的消息
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.type !== 'string') return;

    const { type, downloadId, fileName, fileSize, data } = e.data;

    if (type === 'tgdl-mitm-start') {
      // 触发浏览器下载：创建 <a> 指向 SW 拦截的 URL
      const streamUrl = '/sw/stream/' + encodeURIComponent(downloadId) + '/file' +
        '?name=' + encodeURIComponent(fileName) +
        '&size=' + encodeURIComponent(String(fileSize));
      const a = document.createElement('a');
      a.href = streamUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // 回传确认
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'tgdl-mitm-started', downloadId }, '*');
      }
    } else if (type === 'tgdl-chunk' || type === 'tgdl-done' || type === 'tgdl-cancel') {
      // 转发给 SW
      if (navigator.serviceWorker.controller) {
        const msg = { type, downloadId };
        if (type === 'tgdl-chunk' && data) {
          msg.data = data;
          navigator.serviceWorker.controller.postMessage(msg, [data]);
        } else {
          navigator.serviceWorker.controller.postMessage(msg);
        }
      }
    }
  });
})();
