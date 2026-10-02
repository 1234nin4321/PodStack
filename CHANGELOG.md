## 0.2.7 Alpha (0.2.7-alpha)
* 94 new skills from EVE's latest static data (512 in total), including Precursor and Vorton weapons and ships,
  EDENCOM and Upwell ships, Lancer Dreadnoughts, Breacher Pods, the new ore processing skills and the new
  Sequencing group. The 15 retired ore processing skills are gone and 9 renamed skills use their current names.
* Skillbook prices for every skill with an NPC price (102 were missing), and Alpha skill limits from CCP's data, so
  Alpha characters with renamed skills are no longer taken for Omega.
* Skill plans: Delete asks for confirmation first.
* Skill plans: "+ Level N" asks whether to add the next level right after the skill or at the end of the plan.
* Fixed: the plan list didn't update a plan's skill count and time after importing or adding a level.
* `npm run update-skills` refreshes skills, skillbook prices and Alpha limits from the latest static data.

## 0.2.6 Alpha (0.2.6-alpha)
* Fixed: "Cannot read properties of undefined (reading 'readText')" when importing a skill plan from EVE or pasting
  a skill list. The clipboard works again everywhere: plan import and export, the Fit Planner's paste, Copy name on
  the About page and Copy error details. Links in EVE mails open in your browser again.
* Closing the window asks whether to minimise PodStack to the taskbar or quit it, with "Remember my choice".
  Settings → When closing the window changes it later (ask, minimise, hide to the system tray, or quit).
* The minimise button now minimises to the taskbar instead of hiding PodStack in the system tray (unless you choose
  the tray in Settings).

## 0.2.5 Alpha (0.2.5-alpha)
* Fixed: the window could go blank, e.g. when opening a character or importing a plan, if some of a character's data
  hadn't loaded (just added, a failed refresh, or an empty answer from EVE). Characters still loading show a short
  message, sections that haven't loaded say so, and missing lists are repaired.
* If part of the app ever fails to show, you now get a message with Try again, Copy error details and Reload
  instead of a blank window; the rest keeps working, and the error is written to the log file.
* Auto-update now removes the previous versions' program folders (and leftover update downloads) after updating.
  Your characters, plans and settings are stored elsewhere and aren't touched.
* Download stats: per-month downloads and the last 30 days (`npm run stats`), and a "this month" badge in the README.

## 0.2.4 Alpha (0.2.4-alpha)
* About: ISK donations can now go to 1234nin4321 in game (Copy name copies it for the Give Money window).
* Download stats: `npm run stats` shows installs, portable downloads and in-app updates per release as a running
  total, kept in stats/downloads.json and recorded daily by a GitHub workflow, so counts survive releases being
  deleted. The README's downloads badge shows the all-time total.

## 0.2.3 Alpha (0.2.3-alpha)
* PodStack now has its own EVE application, so EVE's login page says PodStack and can grant every permission,
  including assets, industry jobs and planets. Characters you already added keep working; their API tab shows
  "Cerebral (older login)": use Add missing scopes to move them over and turn on Assets, Industry and PI.
* Fixed: adding or re-authorizing characters failed with "invalid_scope" since 0.2.0. If EVE ever rejects a
  permission again, PodStack logs in without it and explains on the API tab.
* SP farm profitability: an Update prices button fetches the latest market prices now.
* Fixed: PLEX prices are read from New Eden's single PLEX market (Jita has no PLEX orders, so the PLEX price was
  missing). MCT is priced from the New Eden Store in PLEX, as the certificate can no longer be traded, and is only
  needed for farms that pay for MCT.

## 0.2.2 Alpha (0.2.2-alpha)
* SP farm profitability: choose Jita prices or your own for each cost (PLEX in ISK; Omega, MCT, Skill Extractors and
  Large Skill Injectors in PLEX, e.g. New Eden Store sale prices), with Omega at 500 PLEX a month by default. Each farm
  shows SP/min, injectors per 30 days, injector sales, extractor and subscription costs, and its profit, with a total
  monthly profit or loss and the maths behind it.
* The window can no longer be made so small that pages break: every column, button and tab stays visible. It opens a
  little wider, and fits small screens.
* Character pages: all tabs fit on one row, the refresh info no longer covers long character names, and plans keep
  room for skill names when comparing implants or accelerators.
* API tab: Add missing scopes logs the character in again with every permission PodStack uses.
* SP Farming page: fixed a stray horizontal scrollbar and the farm row overflowing in narrow windows.

## 0.2.1 Alpha (0.2.1-alpha)
* Skill plans: Import → EVE In-Game Plan imports a skill plan copied from the EVE client (Skills window → Skill
  Plans → ☰ → copy to clipboard), including the localised format non-English clients copy. Paste Skill List reads it
  too.
* Remap optimiser: when a plan takes over a year even with the best remap, it suggests a second remap once the yearly
  remap is available again: where to put it, what to remap to and how much time it saves. "Use both remaps" adds both.

## 0.2 Alpha (0.2.0-alpha)
* Assets tab on every character: everything it owns grouped by station, structure or system, searchable by item,
  ship/container name or location, with estimated values (EVE average prices).
* Industry: an Industry tab per character and an Industry Jobs page for all characters, with progress, time left and
  jobs ready to deliver (also counted on the nav).
* Planetary Industry: a PI tab per character and a Planetary Industry page for all characters, with each colony's
  extractors and when they stop, and its stored goods; stopped extractors are counted on the nav.
* These need three new EVE permissions (assets, industry jobs, planets): authorize existing characters again to grant
  them. The API tab shows which are missing.
* Alerts (Settings): desktop notifications when training stops or runs low, a character lapses to Alpha, an SP farm
  has an injector ready, a contract completes, mail arrives, jump fatigue ends, an industry job is ready or a PI
  extractor stops. Each can be switched on or off; each event alerts once, and clicking it opens the character.
* SP farm profit: ISK per farm per 30 days from Jita prices, after sales fees, Skill Extractors and each farm's
  subscription (Omega via PLEX, an MCT certificate, or already paid), plus the value of injectors ready now.
* Skill plans: Import → Paste Skill List adds skills pasted from the EVE client, EVEMon or a forum post.
* Backup & Restore (Settings): save characters, skill plans, farms, accounts, alerts and settings to one
  password-encrypted file, and restore it on any computer.
* Remove a character from its API tab: signs it out with EVE and deletes its data, plans and farm entry.
* Security: EVE login tokens are no longer written to the log file, and failed requests can no longer log them.
* Replaced the deprecated `request` library and updated other dependencies; `npm audit` reports no known
  vulnerabilities.

## 0.1.10 Alpha (0.1.10-alpha)
* Fixed overlapping text in skill plans when comparing implants/accelerators: short "With setup" / "Change"
  headers (the setup is named in the plan's subtitle), times rounded to the minute, and the skill name column gives
  way so all columns stay visible in narrow windows.
* The hover "+ Level N" button now overlays the end of the skill name instead of pushing long names onto two lines.

## 0.1.9 Alpha (0.1.9-alpha)
* Implants & Boosters: pick an implant set and/or a cerebral accelerator and the open plan (and the Training Queue)
  gains two columns: each skill's time with that setup, and the change from your current clone, plus totals.
* Fixed: opening a plan from the Plans list showed an empty plan until it was clicked a second time.

## 0.1.8 Alpha (0.1.8-alpha)
* Skill plans: hovering a skill below level V shows "+ Level N" to add the next level straight after it; the plan's
  training times are recalculated.

## 0.1.7 Alpha (0.1.7-alpha)
* Skillbooks: each plan's cost strip and book list now include the price of buying straight from the in-game skill
  window (NPC base price + 30%), next to Jita and the EVE average, with the cheaper option highlighted per book.

## 0.1.6 Alpha (0.1.6-alpha)
* ESI rate limits: every request now stays within EVE's per-character limits, backs off when ESI asks
  (429/Retry-After, error limit), runs at most 8 at once, and a banner explains any slow-down.
* Characters refresh automatically about once an hour (character info, portrait and corporation every 6 hours), spread out over time; each
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
