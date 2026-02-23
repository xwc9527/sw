const CACHE_NAME = 'tgdl-mitm-v1';
const activeStreams = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 接收来自 mitm.html 的 chunk / done / cancel 消息
self.addEventListener('message', (event) => {
  const { type, downloadId, data } = event.data;

  if (type === 'tgdl-chunk') {
    const entry = activeStreams.get(downloadId);
    if (entry) {
      try {
        entry.controller.enqueue(new Uint8Array(data));
      } catch (_) {}
    }
  } else if (type === 'tgdl-done') {
    const entry = activeStreams.get(downloadId);
    if (entry) {
      try { entry.controller.close(); } catch (_) {}
      activeStreams.delete(downloadId);
    }
  } else if (type === 'tgdl-cancel') {
    const entry = activeStreams.get(downloadId);
    if (entry) {
      try { entry.controller.error(new Error('cancelled')); } catch (_) {}
      activeStreams.delete(downloadId);
    }
  }
});

// 拦截 /stream/<downloadId>/<filename> 请求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/sw\/stream\/([^/]+)\//);
  if (!match) return;

  const downloadId = decodeURIComponent(match[1]);
  const params = url.searchParams;
  const fileName = params.get('name') || 'download';
  const fileSize = params.get('size') || '0';

  let streamController;
  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      activeStreams.delete(downloadId);
    },
  });

  activeStreams.set(downloadId, { controller: streamController });

  const encodedFilename = encodeURIComponent(fileName);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodedFilename,
  };
  if (fileSize !== '0') {
    headers['Content-Length'] = fileSize;
  }

  event.respondWith(new Response(stream, { headers }));
});
