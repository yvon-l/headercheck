# Changelog  

All notable changes to **HeaderCheck** are documented here.  

HeaderCheck follows semantic-style versioning during its pre-1.0 phase.  

---

## [0.3.1] - 2026-11-26

### security
- page headers now kept in session storage instead of local storage, and removed when the tab closes
- cookie headers are no longer stored at all
- on update, removes header data left in local storage by earlier versions
- removed the activeTab permission, which it never needed

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