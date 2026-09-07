# Installation and offline behavior

The manifest declares a stable app ID, `/home` start URL, root scope and standalone display. PNG icons at 192 and 512 pixels are generated from the existing repository SVG; an Apple touch icon is included. Settings explains browser installation and Safari's Add to Home Screen path. There is no automatic install prompt or push-notification subscription.

The service worker caches exactly four public files: the reconnect page and three icons. Each asset must have the explicit public-asset response header before it can enter this cache. Navigation uses the network; only a network failure returns the reconnect page. The worker never stores authenticated HTML, APIs, recordings, maps, access tokens or query results. Existing browser memory can still show a previously open page; offline edits are not supported.

Development mode does not register this worker. Production builds serve the worker with revalidation and a restricted script policy. The offline document has no scripts. Deployments must preserve the public asset headers; otherwise installation fails rather than caching a login or protection response.

The implementation follows the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), checked on 7 September 2026. Mobile OS installation and the complete browser matrix remain separate acceptance checks. No private data is added to an offline store.

## Verification

The local production build registered the worker and Chrome reported no installability errors. Its cache contained only the four expected public files. With the local server stopped, navigation to `/home` displayed the reconnect document. After restarting the server, the document's workspace link returned to the online application. The cache still contained only the public files. This check used no Convex requests and did not install an app on the user's device.
