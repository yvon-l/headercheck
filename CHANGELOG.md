# Changelog  

All notable changes to **HeaderCheck** are documented here.  

HeaderCheck follows semantic-style versioning during its pre-1.0 phase.  

---

## [0.3.1] - 2026-11-26

### fixed
- tabs that were open before HeaderCheck started (or before an update) showed "No headers captured". If nothing was captured, HeaderCheck now requests the page again, without cookies, and reads the headers
- if the site redirects that request (a login page or bot check, for example), the popup says so and shows no grade, instead of grading the wrong page
- pages that aren't http or https get a clear message instead of an empty result
- the popup footer showed v0.3.0; it now reads the version from the manifest
- a header sent more than once is combined instead of keeping only the last copy
- one missing critical header could raise an F to a D; it now only caps the grade at D
- a Content-Security-Policy with no script-src or default-src still passes, but now gets a note that it doesn't restrict scripts
- dropped the High / Medium / Low risk label. Missing headers aren't a vulnerability, so the popup, history and report now show the grade and score only
- a frame-ancestors directive in a second CSP header is now recognised
- Copy report pasted as raw Markdown into Docs, Word and email. It now copies a formatted table (with each header's value) for those, and clean Markdown for GitHub, Slack and plain-text editors

### security
- Copy cURL now single-quotes the address, so a crafted URL can't run commands when pasted into a terminal
- the Markdown report escapes the URL so it can't change the report's formatting or links
- scan history keeps only the site and path, never query strings or fragments, which can hold tokens
- page headers are kept in session storage instead of local storage, and removed when the tab closes
- cookie headers are no longer stored at all
- on update, removes header data left in local storage by earlier versions
- removed the activeTab permission, which it never needed
- messages to the background script are only accepted from HeaderCheck itself

### added
- automated tests in a real Chromium, run on every push

### model (SCM-2026.1)
- headers are checked for valid values, not just presence. A header that's sent but doesn't protect anything shows as Weak and scores as missing:
  - Strict-Transport-Security needs a max-age above 0
  - X-Content-Type-Options must be nosniff
  - X-Frame-Options must be DENY or SAMEORIGIN, unless the CSP has a frame-ancestors directive
  - Referrer-Policy fails on unsafe-url or no-referrer-when-downgrade
- docs/scoring-models.md rewritten to match the code (the old doc listed different weights)


### changed
- moved to github.com/yvon-l/headercheck; links in the popup and report updated
- scoring model doc now lives in this repo (docs/scoring-models.md)
- full MIT license text in LICENSE

---

## [Unreleased]

### docs
- added privacy and security links  
- created product page with scoring bands  
- not yet released — internal development build only  

### model
- introduced deterministic Boolean scoring logic (`SCM-2025.1`)  
- defined fixed weight distribution across five header categories  
- added transparency and versioning section for reproducibility  

### changed
- updated README branding and badges  

> **Note:** `SCM-2025.1` logic is implemented in documentation only.  
> The extension code continues to operate under pre-1.0 deterministic evaluation rules.

---

## [0.1.0-dev] – 2025-10-24  

**Initial release**  
- Inspect HTTP response headers for the active tab  
- Weighted privacy and security score with quick guidance  
- 100% local-only processing (no telemetry)