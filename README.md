# PodStack

[![license: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-red.svg)](https://www.gnu.org/licenses/agpl-3.0)

PodStack is a desktop app for monitoring your EVE Online characters. It is built for ease of use and speed, especially for people who manage a lot of characters.

PodStack is in beta. Expect bugs: it may lose tokens, crash or freeze.

Features
-------------------------
* Add characters through EVE SSO v2.
* Overview of all characters: Alpha/Omega status, corp/alliance, ISK, SP, current skill in training and time remaining.
* SP farming overview: mark characters as SP farms with a base SP to keep (un-extractable), then see:
    * Injectors ready to extract
    * Time until the next injector is ready
    * Total time left in the training queue
    * Current SP/hour
* Contracts across all characters:
    * Type, status, title, issuer, assignee/acceptor, date issued and date completed.
    * Origin, destination and volume for courier contracts.
    * Separate tables for active and completed (including deleted, reversed, etc.) contracts.
* Per-character pages:
    * Summary: date of birth, security status, SP, wallet, home/current location, active ship, unallocated SP, attributes and remaps, implants, skill queue, jump clones, jump fatigue, loyalty points
    * Skills: trained skills by group, SP per skill and group, partially trained skills
    * Skill plans: basic skill planning, with import/export
    * Mail: your EVE mail
    * Contracts: pending/completed contracts involving the character
    * API: token scopes, data refresh intervals and token health

Planned
-------------------------
* Account manager for subscriptions/MPT expiry
* Configurable alerts (training stopped, lapsed to Alpha, ready for extraction, etc.)
* Skill extraction planner
* Deleting characters

Install
-------------------------
1. Download `PodStack-<version>.Setup.exe` from the [latest release](https://github.com/1234nin4321/PodStack/releases/latest) and run it.
2. PodStack installs for your Windows user (no admin rights needed), adds a **Desktop shortcut** and a **Start Menu** entry, and starts.
3. Windows SmartScreen may say the installer is unrecognised, because it isn't code-signed yet. Choose **More info**, then **Run anyway**.

PodStack checks for new versions and tells you when one is available; choose **Update now** to download and install it.
Removing the desktop shortcut is fine: updates won't put it back.

The `.zip` on the release page is a portable copy: unzip and run `PodStack.exe`. It doesn't install, add shortcuts or update itself.

Uninstall
-------------------------
Open **Settings → Apps → Installed apps** (or Control Panel → Programs and Features), find **PodStack** and choose
**Uninstall**. This removes the app and its shortcuts.

Your characters, plans and settings stay in `%APPDATA%\PodStack` so a reinstall picks them up. Delete that folder as
well to remove everything, including your EVE login tokens.

Development
-------------------------
```
npm install
npm start          # run in development mode
npm run make       # build installers into out/make
```

Usage
-------------------------
1. Create an application on the [EVE Developers website](https://developers.eveonline.com/) and enter its client ID on the Settings page.
2. Add characters with the "Authorize Character" button. Data refreshes automatically.
3. SP farming:
    * Click "Add Farm", choose a character and enter the SP to always keep on it (for example the 11,000,000 SP a JF pilot needs).
    * To change a farm's base SP, add it again with the new value.
    * To remove a farm, add it again with the Base SP box empty.

FAQ
-------------------------
**Where are my tokens stored?**

In your user data folder, e.g. `%APPDATA%/PodStack/authorized-characters.json` on Windows. You can back this file up and restore it later. Keep it private: its contents let anyone query your character data from CCP.

PodStack only talks to CCP's servers; token data never goes anywhere else.

**Why is there no Alpha/Omega icon next to my character?**

The API doesn't expose Alpha/Omega status directly, so PodStack infers it from several checks. No icon means it couldn't tell.

**Why does PodStack use an embedded browser for authorization?**

Adding many characters is much faster with an embedded login window than bouncing through your system browser. The login window loads EVE's own page, and the source is open so you can verify that credentials are not intercepted.

**What is PodStack built with?**

Electron and React.

License
-------------------------
AGPL v3.0, see [LICENSE.md](LICENSE.md).
