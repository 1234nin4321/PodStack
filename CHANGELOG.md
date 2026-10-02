## 0.1.6 Alpha (0.1.6-alpha)
* ESI rate limits: every request now stays within EVE's per-character limits, backs off when ESI asks
  (429/Retry-After, error limit), runs at most 8 at once, and a banner explains any slow-down.
* Characters refresh automatically about once an hour (character info daily-ish), spread out over time; each
  character page has "Refresh from ESI", usable once every 5 minutes, with a plain explanation of why.
* Skillbook costs are now shown at the top of each plan and the Training Queue, with a per-book list.
* Desktop and Start Menu shortcuts always use PodStack's icon, refreshed on every update; the window sets it too.
* Lint switched to ESLint 9 with bug-focused rules (now runs on every push); fixed what it found, including a
  popover losing its styling and dead code.

## 0.1.5 Alpha (0.1.5-alpha)
* New About page: what PodStack does, its heritage as a fork of Cerebral and what was modernised (new ESI versioning,
  EVE login for modern Electron, Electron 44), and a place to support the project with ISK donations.
* The sidebar's Contracts link is now "All Contracts".

## 0.1.4 Alpha (0.1.4-alpha)
* PodStack's icon now shows in Settings > Apps > Installed apps.
* Updates no longer bring back a desktop shortcut you deleted; existing shortcuts are kept up to date.
* README: install and uninstall instructions.

## 0.1.3 Alpha (0.1.3-alpha)
* Updates ask first: PodStack still checks automatically, but only downloads when you choose Update now.
* Implants & Boosters: implant sets are shown by name (Limited, Limited Beta, Basic, Standard, Improved) and your
  current attribute implants are listed; cerebral accelerators are picked from a searchable list of real items
  ("Name +X") with their duration filled in, or set up as a custom accelerator.

## 0.1.2 Alpha (0.1.2-alpha)
* New app icon.
* Update downloads show progress: percentage, size, speed and time left, then install progress.
* Updates are downloaded straight from the GitHub release and checked against its checksum before installing.

## 0.1.1 Alpha (0.1.1-alpha)
* Remap optimiser: compares your current attributes with the fastest possible remap for the plan, tells you exactly
  what to change and how much time it saves, and shows bonus/yearly remap availability.
* New remaps are added at the start of the plan, so the plan's times reflect them.

## 0.1 Alpha (0.1.0-alpha)
* First PodStack release.
* New app icon.
* Automatic updates from GitHub releases, with a manual check in Settings.
* Skill plans: multiple plans per character with priorities, on/off switches, a combined training queue, sorting and merging.
* Ship fitting import (EFT, Pyfa, EVE XML, DNA) with a generated plan to fly the fit.
* Skillbook costs, implant and booster profiler, and cross-account queue health.
* Themes, and progress while adding a character.
