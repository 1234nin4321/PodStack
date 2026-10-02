'use strict';

import pkg from '../package.json';

// "0.1.0-alpha" -> "0.1 Alpha", for display; version stays semver for update checks and User-Agents.
function displayVersion(version) {
    const [, major, minor, patch, pre] = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)(?:\.(\d+))?)?/i) || [];
    if (major === undefined) {
        return version;
    }

    const number = patch === '0' ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
    return pre ? `${number} ${pre.charAt(0).toUpperCase()}${pre.slice(1)}` : number;
}

export default {
    'version': pkg.version,
    'display_version': displayVersion(pkg.version),

    // In-game character that receives ISK donations (shown on the About page); empty hides the details.
    'donation_character': '1234nin4321',

    'eve_sso_url': 'https://login.eveonline.com/oauth',
    'eve_sso_url_no_oauth': 'https://login.eveonline.com',

    'eve_sso_v2_url': 'https://login.eveonline.com/v2/oauth',
    'eve_sso_url_v2_no_oauth': 'https://login.eveonline.com/v2',

    // PodStack's application on developers.eveonline.com (no secret: the login uses PKCE). It must have every scope
    // below enabled, or EVE rejects them (see CharacterHelper.addCharacter).
    'eve_sso_client_id': '113d91f366b143b482676d8dcf517d1f',
    // The application inherited from Cerebral, which characters added before 0.2.3 were authorized with. Their refresh
    // tokens only work with it, so they keep using it until they're authorized again.
    'eve_sso_legacy_client_id': 'c9fde897cdfb45208fb5254e3ee98d19',
    // Must match the callback URL registered for the client id on developers.eveonline.com.
    'eve_sso_callback_url': 'https://localhost/callback',
    'eve_sso_revoke_url': 'https://login.eveonline.com/v2/oauth/revoke',

    'scopes': [
        {
            'name': 'esi-location.read_location.v1',
            'description': 'Read Current Location'
        },
        {
            'name': 'esi-location.read_ship_type.v1',
            'description': 'Read Active Ship Type'
        },
        {
            'name': 'esi-location.read_online.v1',
            'description': 'Read Online Status'
        },
        {
            'name': 'esi-skills.read_skills.v1',
            'description': 'Read Skills'
        },
        {
            'name': 'esi-skills.read_skillqueue.v1',
            'description': 'Read Skill Queue'
        },
        {
            'name': 'esi-clones.read_clones.v1',
            'description': 'Read Jump Clones'
        },
        {
            'name': 'esi-clones.read_implants.v1',
            'description': 'Read Active Implants'
        },
        {
            'name': 'esi-wallet.read_character_wallet.v1',
            'description': 'Read Wallet'
        },
        {
            'name': 'esi-mail.read_mail.v1',
            'description': 'Read EVE Mail'
        },
        {
            'name': 'esi-universe.read_structures.v1',
            'description': 'Read Dockable Structure Information'
        },
        {
            'name': 'esi-characters.read_fatigue.v1',
            'description': 'Read Jump Fatigue'
        },
        {
            'name': 'esi-characters.read_loyalty.v1',
            'description': 'Read Loyalty Points'
        },
        {
            'name': 'esi-contracts.read_character_contracts.v1',
            'description': 'Read Contracts'
        },
        {
            'name': 'esi-assets.read_assets.v1',
            'description': 'Read Assets'
        },
        {
            'name': 'esi-industry.read_character_jobs.v1',
            'description': 'Read Industry Jobs'
        },
        {
            'name': 'esi-planets.manage_planets.v1',
            'description': 'Read Planetary Colonies'
        },
    ],

    'eve_esi_url': 'https://esi.evetech.net',
    'eve_esi_tenant': 'tranquility',
    // ESI API behaviour is pinned to this date, see https://esi.evetech.net/meta/compatibility-dates
    'eve_esi_compatibility_date': '2026-08-18',

    'manual_refresh_cooldown': 300,

    // Buying a skill straight from the in-game skill window costs its NPC base price plus this markup (CCP's
    // "Skills On Demand": +30%). Base prices are in resources/skill_base_prices.js.
    'skill_window_markup': 1.3,

    // Seconds between automatic ESI refreshes of each kind of character data. Every character is refreshed about
    // hourly (rarely-changing data every 6 hours); the "Refresh from ESI" button allows one manual refresh every
    // manual_refresh_cooldown seconds per character.
    'refresh_intervals': {
        'character_info': 21600,
        'portrait': 21600,
        'corporation': 21600,
        'alliance': 21600,
        'attributes': 3600,
        'loyalty_points': 3600,
        'wallet': 3600,
        'wallet_journal': 3600,
        'wallet_transactions': 3600,
        'implants': 3600,
        'clones': 3600,
        'skills': 3600,
        'skill_queue': 3600,
        'contracts': 3600,
        'location': 3600,
        'ship': 3600,
        'fatigue': 3600,
        'mails': 3600,
        'maillabels': 3600,
        'mailinglists': 3600,
        // ESI caches assets for an hour, industry jobs for 5 minutes and colonies for 10 minutes
        'assets': 3600,
        'industry_jobs': 900,
        'planets': 1800,
    },

    'contract_completed_statuses': [
        'finished_issuer',
        'finished_contractor',
        'finished',
        'cancelled',
        'rejected',
        'failed',
        'deleted',
        'reversed'
    ],

    'cache_policies': {
        'types': {
            'base': 2592000,
            'deviation': 604800,
            'invalid_before': 1524052913,
        },
    }
};