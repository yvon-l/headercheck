# Security

HeaderCheck runs entirely in your browser. It has no server, no account and no telemetry.

## Reporting a problem

Please don't open a public issue for a security or privacy problem. Use GitHub's private reporting instead:

https://github.com/yvon-l/headercheck/security/advisories/new

Include the HeaderCheck version, your browser version, what you did, and what happened.

## What counts

- Anything that sends data off your device
- Header data kept longer than described in the privacy section linked below
- Untrusted header values rendered as HTML in the popup or report
- Permissions broader than the extension needs
- A score that says a site is safer than its headers show

## Supported versions

Only the current release on the Chrome Web Store and Firefox Add-ons gets fixes. Fixes land on `main` and ship as a patch release.

What HeaderCheck stores, and why, is described at https://kimberly-wood.com/privacy/#browser-extensions
