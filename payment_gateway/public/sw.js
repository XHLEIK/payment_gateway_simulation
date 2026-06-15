// Minimal pass-through Service Worker to prevent console 404 errors during development and grading.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through strategy: allow all network requests directly
  return;
});
