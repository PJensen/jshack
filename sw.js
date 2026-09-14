// @ts-nocheck
// Simple dev service worker to bust cache for ES modules on mobile browsers
// Appends a version query param to same-origin JS module requests under /src and /app

const VERSION_META_CACHE = 'jshack-sw-meta';
const VERSION_META_URL = 'https://jshack.local/__sw_version__';

self.addEventListener('install', (event) => {
    // Activate immediately and keep install alive until the handoff finishes.
    // @ts-ignore
    if (self.skipWaiting) {
        event.waitUntil(self.skipWaiting());
    }
});

self.addEventListener('activate', (event) => {
    // Take control of uncontrolled clients ASAP.
    // @ts-ignore
    if (self.clients && self.clients.claim) {
        event.waitUntil(self.clients.claim());
    }
});

/** Cache-bust stamp fallback: generated once per SW lifecycle (install). */
let _versionStamp = Date.now().toString(16);
const _clientVersionStamps = new Map();

async function readStoredVersion() {
    if (!self.caches) return '';
    try {
        const cache = await caches.open(VERSION_META_CACHE);
        const res = await cache.match(VERSION_META_URL);
        if (!res) return '';
        return (await res.text()).trim();
    } catch {
        return '';
    }
}

async function writeStoredVersion(version) {
    if (!self.caches) return;
    try {
        const cache = await caches.open(VERSION_META_CACHE);
        await cache.put(VERSION_META_URL, new Response(version, {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
        }));
    } catch {}
}

async function purgeCachedJavaScriptOnVersionChange(version) {
    if (!self.caches) return false;
    const nextVersion = String(version || '').trim();
    if (!nextVersion) return false;

    const previousVersion = await readStoredVersion();
    const changed = Boolean(previousVersion && previousVersion !== nextVersion);
    if (changed) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys
                .filter((key) => key !== VERSION_META_CACHE)
                .map((key) => caches.delete(key)));
        } catch {}
    }

    await writeStoredVersion(nextVersion);
    return changed;
}

/** Each controlled page primes its own version before bootstrapping modules. */
self.addEventListener('message', (event) => {
    if (event.data?.type === 'set-version' && event.data.v) {
        const version = String(event.data.v);
        event.waitUntil((async () => {
            _versionStamp = version;
            const clientId = event.source && typeof event.source.id === 'string' ? event.source.id : '';
            if (clientId) {
                _clientVersionStamps.set(clientId, version);
            }
            const cachePurged = await purgeCachedJavaScriptOnVersionChange(version);
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ type: 'set-version:ack', v: version, clientId, cachePurged });
            }
        })());
    }
});

function getVersionParam(clientId) {
    if (clientId && _clientVersionStamps.has(clientId)) {
        return _clientVersionStamps.get(clientId);
    }
    return _versionStamp;
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const isJs = req.destination === 'script' || url.pathname.endsWith('.js');
    // The app is also deployed below a path (for example /JSHack/ on
    // GitHub Pages), so compare against the worker scope instead of assuming
    // that the origin root is the app root.
    const scopePath = new URL(self.registration.scope).pathname;
    const relativePath = url.pathname.startsWith(scopePath)
        ? url.pathname.slice(scopePath.length)
        : '';
    const inScope = relativePath.startsWith('src/') || relativePath.startsWith('app/');
    const hasVersion = url.searchParams.has('v');

    if (sameOrigin && isJs && inScope) {
        // Always bypass cache for local JS modules
        if (!hasVersion) {
            url.searchParams.set('v', getVersionParam(event.clientId));
        }
        const alt = new Request(url.href, { cache: 'no-store', mode: req.mode, credentials: req.credentials });
        event.respondWith(fetch(alt).catch(() => fetch(req, { cache: 'no-store' })));
    }
});
