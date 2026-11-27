<p align="center">
  <img src="images/headercheck_logo.png" alt="HeaderCheck logo" width="280">
</p>

# HeaderCheck

A browser extension for Chrome and Firefox that checks the security headers on the page you're looking at and gives it a score.

Open it on any page and it reads that page's HTTP response headers, weighs them against a fixed model, and shows a percentage, a letter grade and what's missing. You can copy the result as a report that pastes as a formatted table into a doc or email, or as Markdown into GitHub or Slack.

It all runs in the browser. Nothing gets sent anywhere except to the site you're scanning.

[Chrome Web Store](https://chromewebstore.google.com/detail/headercheck/hpjigpjlgonbnneifjfkgeoghpobcncj) · [What it stores](https://kimberly-wood.com/privacy/#browser-extensions)

## What it looks at

Graded, so they count toward the score:

- Content-Security-Policy
- Strict-Transport-Security
- Referrer-Policy
- Permissions-Policy
- X-Content-Type-Options
- X-Frame-Options, or `frame-ancestors` in the CSP

Shown but not scored: Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy and Cross-Origin-Resource-Policy.

A header only passes if its value actually protects something. For example, HSTS with `max-age=0` or `X-Frame-Options: ALLOWALL` shows as Weak and scores as missing. The full rules and weights are in [docs/scoring-models.md](docs/scoring-models.md).

## Grades

| Score | Grade |
|-------|-------|
| 85% and up | A |
| 70 to 84% | B |
| 55 to 69% | C |
| 40 to 54% | D |
| under 40% | F |

CSP and HSTS matter most. Missing both is an F. Missing one is a D at best.

A bad grade means the headers are missing or weak. It doesn't mean the site has a vulnerability.

## How it gets the headers

It reads them as the page loads, so it grades exactly what your browser got. If it didn't see the page load (say the tab was already open when HeaderCheck started), it requests the page again from your browser, without cookies, and reads the headers from that. That request only goes to the site you're scanning. Some sites send a request like that to a login page or bot check instead; HeaderCheck tells you when that happens, and reloading the page fixes it.

## What it keeps

- The headers for the page in each open tab, in session storage. They go away when you close the tab or the browser. Cookie headers aren't kept at all.
- Your last 10 scans (site and path, time, score) and whether you picked light or dark mode, in local storage on your machine. Query strings are never saved. Clear history in the popup deletes the scans.

## Permissions

- `webRequest` and access to all sites, to read the response headers for the page
- `storage`, for what's listed above

## Running it from source

In Chrome:

1. Clone the repo.
2. Go to `chrome://extensions/` and turn on Developer mode.
3. Click Load unpacked and pick the folder.

In Firefox:

1. Clone the repo and run `npm run package` (it needs Node.js and the `zip` command).
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on and pick `dist/headercheck-<version>-firefox.zip`. It stays until you close Firefox.

## Firefox

The code is the same in both browsers. Only the manifest differs: Firefox runs `background.js` as a background script rather than a service worker, and needs an add-on ID and a statement that HeaderCheck collects no data. `npm run package` builds both store zips into `dist/` from the one `manifest.json`.

Firefox lets you turn off an extension's access to websites after installing it. HeaderCheck can't read any headers without it, so the popup then asks for access again with an Allow access button.

## Tests

The tests load the extension into a real Chromium and check it against a local server with known headers: grading, Weak values, the CSP note, re-requests and bot checks, history, Copy report and Copy cURL, and the upgrade from 0.3.0. A second set loads the Firefox build into real Firefox and checks grading, what's stored, re-requests and the access prompt. Both run on every push.

```
npm ci
npx playwright install chromium
npm test
npm run test:firefox   # needs Firefox and geckodriver installed
```

You don't need any of this to use or load the extension.

## Bugs and security issues

Bugs go in [issues](https://github.com/yvon-l/headercheck/issues). For anything security related, use [private reporting](https://github.com/yvon-l/headercheck/security/advisories/new) instead. More in [SECURITY.md](SECURITY.md).

MIT license. Built by K.Y. Wood.
