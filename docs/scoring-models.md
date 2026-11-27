# HeaderCheck scoring model

**Model ID:** SCM-2026.1 (HeaderCheck 0.3.1 and later)

This is exactly what the code in `popup.js` does. If the two ever disagree, the code is right and this page is a bug.

## What gets checked

| Header | Weight | Critical | Passes when |
|--------|:------:|:--------:|-------------|
| Content-Security-Policy | 4 | yes | sent with a non-empty value |
| Strict-Transport-Security | 4 | yes | `max-age` is above 0 |
| X-Frame-Options | 3 | | `DENY` or `SAMEORIGIN`, or the CSP has a `frame-ancestors` directive |
| X-Content-Type-Options | 1 | | exactly `nosniff` |
| Referrer-Policy | 1 | | any policy except `unsafe-url` or `no-referrer-when-downgrade` (the last one listed is the one browsers use) |
| Permissions-Policy | 1 | | sent with a non-empty value |

Total weight: 14.

Shown but not scored: Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy, Cross-Origin-Resource-Policy.

Header names are matched case-insensitively. A header sent more than once is combined into one value, as HTTP says to.

## States

- **OK**: the header passes.
- **Weak**: the header is sent, but its value doesn't protect anything (for example `max-age=0`). Scores the same as missing.
- **Missing**: the header isn't sent.

## Score

```
score = round(weight of passing headers / 14 × 100)
```

## Grade

| Score | Grade |
|-------|:-----:|
| 85% and up | A |
| 70 to 84% | B |
| 55 to 69% | C |
| 40 to 54% | D |
| under 40% | F |

Then two overrides for the critical headers:

- both fail: F
- one fails: D at most (a score that would be an F stays an F)

## Risk

| Condition | Risk |
|-----------|------|
| Score under 60%, or both critical headers fail, or one fails and the score is under 85% | High |
| 60 to 84% | Medium |
| 85% and up | Low |

## What it doesn't do

It checks that each header is there and set to something that protects. It doesn't judge how strong a Content-Security-Policy is: a policy with only `upgrade-insecure-requests` passes, even though it does nothing against script injection. A good grade means the basic headers are in place, not that the site is secure, and a bad grade doesn't mean the site has a vulnerability.

## Where the headers come from

HeaderCheck reads the headers of the page as it loads. If it didn't see the page load, it requests the page again, without cookies, and reads the headers from that response. If the site redirects that request to a different page (a login or bot check, for example), the popup says so, and reloading the page gives the exact result.

## History

- **SCM-2026.1** (0.3.1): values are validated, the Weak state is added, and this doc matches the code.
- **SCM-2025.1** (0.3.0 and earlier): presence only. The earlier version of this doc listed weights that the code never used.
