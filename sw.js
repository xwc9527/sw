const activeStreams = new Map();

self.addEventListener('install', (event) => {
  console.log('[SW] install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate, claiming clients');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, downloadId, data } = event.data;
  console.log('[SW] message:', type, downloadId ? downloadId.slice(0, 8) : '', 'streams:', activeStreams.size);

  if (type === 'tgdl-chunk') {
    const entry = activeStreams.get(downloadId);
    if (!entry) {
      console.error('[SW] chunk: NO stream entry for', downloadId.slice(0, 8));
      return;
    }
    try {
      entry.controller.enqueue(new Uint8Array(data));
      console.log('[SW] enqueued', data.byteLength, 'bytes');
    } catch (e) {
      console.error('[SW] enqueue error:', e.message);
    }
  } else if (type === 'tgdl-done') {
    const entry = activeStreams.get(downloadId);
    if (!entry) {
      console.error('[SW] done: NO stream entry for', downloadId.slice(0, 8));
      return;
    }
    try { entry.controller.close(); } catch (e) { console.error('[SW] close error:', e.message); }
    activeStreams.delete(downloadId);
    console.log('[SW] stream closed');
  } else if (type === 'tgdl-cancel') {
    const entry = activeStreams.get(downloadId);
    if (entry) {
      try { entry.controller.error(new Error('cancelled')); } catch (_) {}
      activeStreams.delete(downloadId);
    }
    console.log('[SW] stream cancelled');
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/sw\/stream\/([^/]+)\/(.+)/);
  if (!match) return;

  const downloadId = decodeURIComponent(match[1]);
  const fileName = decodeURIComponent(match[2]);
  const fileSize = url.searchParams.get('size') || '0';

  console.log('[SW] fetch intercepted:', downloadId.slice(0, 8), fileName, fileSize);

  let streamController;
  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      console.log('[SW] stream cancelled by consumer');
      activeStreams.delete(downloadId);
      self.clients.matchAll().then(cls => {
        cls.forEach(c => c.postMessage({ type: 'tgdl-browser-cancel', downloadId }));
      });
    },
  });

  activeStreams.set(downloadId, { controller: streamController });
  console.log('[SW] stream created, activeStreams:', activeStreams.size);

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
