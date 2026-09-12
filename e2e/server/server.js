// The fixture server the end-to-end flows drive the example app against. Plain Node, no
// dependencies. Every page is a Turbo page; each GET of a page is counted and the count
// printed in the page, so a flow can tell a render from a fetch. Scenario flags, set by
// the flows over HTTP, decide which pages redirect.

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 4567);
// A second host name for the same server: what the app considers another origin.
const otherOrigin = `http://127.0.0.1:${port}`;

const scripts = {
  '/turbo.js': fs.readFileSync(path.join(__dirname, 'turbo.js')),
  // The web side of bridge components: Stimulus and Strada, as the consuming app serves them.
  '/stimulus.js': fs.readFileSync(path.join(__dirname, 'stimulus.js')),
  '/strada.js': fs.readFileSync(path.join(__dirname, 'strada.js')),
};

let counts = {};
let scenario = {};

function reset() {
  counts = {};
  scenario = {};
}

// Bridge components on the web side, three of them, each sending on connect and showing
// the reply: `echo` expects a value back at once, `button` a reply when a native button
// is pressed, `failing` an error. The module is in the head, so Turbo runs it once.
const bridgeHead = `
<script type="importmap">{"imports":{"@hotwired/stimulus":"/stimulus.js","@hotwired/strada":"/strada.js"}}</script>
<script type="module">
import { Application } from "@hotwired/stimulus";
import { BridgeComponent } from "@hotwired/strada";
class Echo extends BridgeComponent {
  static component = "echo";
  connect() { super.connect(); this.send("ping", { text: this.element.dataset.text }, (m) => { this.element.textContent = "Reply: " + m.data.text; }); }
}
class NativeButton extends BridgeComponent {
  static component = "button";
  connect() { super.connect(); this.send("connect", { title: "Native action" }, () => { this.element.textContent = "Button pressed"; }); }
}
class Failing extends BridgeComponent {
  static component = "failing";
  connect() { super.connect(); this.send("boom", {}, (m) => { this.element.textContent = "Error: " + m.data.error.message; }); }
}
const app = Application.start();
app.register("echo", Echo);
app.register("button", NativeButton);
app.register("failing", Failing);
</script>`;

// The document title differs from the heading, "Home title" for "Home page", so a flow can
// tell the screen's title from the page's text.
// The flash of the request being rendered, set per request below.
let currentFlash = '';

function page(title, body, head = '') {
  const flash = currentFlash;
  const documentTitle = title.endsWith(' page') ? title.replace(/ page$/, ' title') : title;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${documentTitle}</title>
<script src="/turbo.js"></script>
${head}
<style>body { font-family: -apple-system, sans-serif; font-size: 20px; padding: 24px; } a, button { display: block; margin: 12px 0; font-size: 20px; }</style>
</head>
<body>
<h1>${title}</h1>
${flash ? `<p class="flash">${flash}</p>` : ''}
${body}
</body>
</html>`;
}

// One text node: Android exposes each node to the accessibility tree on its own.
function visits(pathname) {
  return `<p>Visits: ${counts[pathname] || 0}</p>`;
}

const link = (text, href) => `<a href="${href}">${text}</a>`;

const insetsHead = `<script>
  function readHotwireInsets() {
    var style = getComputedStyle(document.documentElement);
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      var value = style.getPropertyValue('--hotwire-inset-' + side).trim() || 'unset';
      document.getElementById('inset-' + side).textContent = 'inset-' + side + ': ' + value;
    });
  }
  document.addEventListener('turbo:load', readHotwireInsets);
  document.addEventListener('turbo:render', readHotwireInsets);
</script>`;

const insetsBody = (nextHref, nextText) =>
  ['top', 'right', 'bottom', 'left'].map((side) => `<p id="inset-${side}">inset-${side}: pending</p>`).join('') +
  link(nextText, nextHref);

const pages = {
  '/': () =>
    page(
      'Home page',
      visits('/') +
        `<button type="button" onclick="Turbo.visit(window.location.href, { action: 'replace' })">Refresh page</button>` +
        link('Bridge page', '/bridge') +
        link('Insets page', '/insets') +
        link('List page', '/list') +
        link('Pages page', '/pages') +
        link('Private page', '/private') +
        link('Refresh by rule', '/refresh') +
        link('Elsewhere link', `${otherOrigin}/elsewhere`) +
        link('Push page', '/page') +
        link('Redirect to page', '/redirect/page') +
        link('Redirect twice', '/redirect/redirect') +
        link('Redirect to modal', '/redirect/modal') +
        link('Redirect away', '/redirect/external') +
        link('Form page', '/form') +
        link('Replace page', '/js-replace') +
        link('Open modal', '/modal/verify')
    ),
  '/bridge': () =>
    page(
      'Bridge page',
      visits('/bridge') +
        `<p data-controller="echo" data-text="hello">Waiting for echo</p>` +
        `<p data-controller="button">Waiting for button</p>` +
        `<p data-controller="failing">Waiting for error</p>` +
        link('Push bridge two', '/bridge/two') +
        link('Go back', '/close'),
      bridgeHead
    ),
  '/bridge/two': () =>
    page('Bridge two', visits('/bridge/two') + `<p data-controller="echo" data-text="two">Waiting for echo</p>` + link('Go back', '/close'), bridgeHead),
  '/components': () => page('Components page', visits('/components')),
  '/resources': () => page('Resources page', visits('/resources') + link('Push page', '/page')),
  '/page': () => page('Pushed page', visits('/page') + link('Open modal', '/modal/verify') + link('Go back', '/close')),
  '/modal/verify': () =>
    page('Verification modal', visits('/modal/verify') + link('Close modal', '/close') + link('Push page', '/page')),
  '/form': () =>
    page(
      'Form page',
      visits('/form') +
        `<form method="post" action="/form"><button type="submit">Submit form</button></form>` +
        link('Go back', '/close')
    ),
  '/js-replace': () =>
    page(
      'Replace page',
      visits('/js-replace') +
        `<button type="button" onclick="Turbo.visit('/page', { action: 'replace' })">Replace now</button>`
    ),
  '/elsewhere': () => page('Elsewhere page', visits('/elsewhere')),
  // Reads back the CSS custom properties the library sets from the native chrome, so a
  // flow can assert the page received them and that they survive a Turbo render. The read
  // runs on turbo:load (the first render) and again on every turbo:render.
  '/insets': () => page('Insets page', insetsBody('/insets/two', 'Push insets two'), insetsHead),
  '/insets/two': () => page('Insets two', insetsBody('/close', 'Go back'), insetsHead),
  // `?page=N` is the same page under the replace rule for /list, another page under /pages.
  '/list': (url) => page('List page', visits('/list') + `<p>Showing ${url.searchParams.get('page') || 1}</p>` + link('Next list page', '/list?page=2') + link('Go back', '/close')),
  '/pages': (url) => page('Pages page', visits('/pages') + `<p>Showing ${url.searchParams.get('page') || 1}</p>` + link('Next pages page', '/pages?page=2') + link('Go back', '/close')),
  '/session/new': () => page('Sign in page', visits('/session/new')),
  '/close': () => page('Close', ''),
};

// Where a page redirects, by scenario flag. A flag names the target path.
const redirects = {
  '/': () => scenario.homeRedirect,
  '/resources': () => scenario.resourcesRedirect,
  '/redirect/page': () => '/page',
  '/redirect/redirect': () => '/redirect/page',
  // A modal-context page that sends the visitor on to a default-context page.
  '/modal/redirect': () => '/page',
  '/redirect/modal': () => '/modal/verify',
  '/redirect/external': () => `${otherOrigin}/elsewhere`,
};

const flashCookie = (text) => `flash=${encodeURIComponent(text)}; Path=/`;

function flashFrom(req) {
  const match = /(?:^|;\s*)flash=([^;]*)/.exec(req.headers.cookie || '');
  return match ? decodeURIComponent(match[1]) : '';
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  console.log(req.method, req.headers.host, req.url, req.headers.cookie ? `cookie=${req.headers.cookie}` : '');

  if (scripts[pathname]) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(scripts[pathname]);
  }
  if (pathname === '/__reset') {
    reset();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  if (pathname === '/__scenario') {
    Object.assign(scenario, JSON.parse((await readBody(req)) || '{}'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(scenario));
  }
  if (pathname === '/__state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ counts, scenario }));
  }

  if (req.method === 'POST' && pathname === '/form') {
    await readBody(req);
    res.writeHead(303, { Location: '/page', 'Set-Cookie': flashCookie('Saved!') });
    return res.end();
  }

  const target = redirects[pathname]?.();
  if (target) {
    res.writeHead(302, { Location: target, 'Set-Cookie': flashCookie('Redirected!') });
    return res.end();
  }

  if (pathname === '/private') {
    res.writeHead(401, { 'Content-Type': 'text/html' });
    return res.end(page('Unauthorized', ''));
  }

  const render = pages[pathname];
  if (!render) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end(page('Not found', `<p>${pathname}</p>`));
  }
  counts[pathname] = (counts[pathname] || 0) + 1;
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  if (scenario.corsOpen) headers['Access-Control-Allow-Origin'] = '*';
  // A flash set by a redirect is shown once, on the next page, as Rails' session flash is.
  currentFlash = flashFrom(req);
  if (currentFlash) headers['Set-Cookie'] = 'flash=; Path=/; Max-Age=0';
  res.writeHead(200, headers);
  res.end(render(url));
});

server.listen(port, () => {
  console.log(`fixture server on http://localhost:${port} (other origin ${otherOrigin})`);
});
