'use strict';

import {ipcRenderer} from 'electron';
import log from 'electron-log';

import SsoClientv2 from './eve/SsoClientv2';
import {httpRequest} from './eve/HttpClient';
import Character from '../models/Character';
import AuthorizedCharacter from '../models/AuthorizedCharacter';
import FarmCharacter from '../models/FarmCharacter';
import AccountStore from './AccountStore';
import SkillPlanStore from './SkillPlanStore';

import StructureHelper from './StructureHelper';

import appProperties from '../../resources/properties.js';

export default class CharacterHelper {
    /**
     * Removes a character from PodStack: revokes its EVE login (so the stored token stops working even if a copy
     * exists somewhere), then deletes its tokens, data, skill plans, farm entry and account assignment.
     *
     * @returns {Promise<boolean>} whether EVE confirmed the revocation (the character is removed either way)
     */
    static async removeCharacter(characterId) {
        characterId = characterId.toString();
        const auth = AuthorizedCharacter.get(characterId);

        let revoked = false;
        if (auth !== undefined && auth.ssoVersion === 2 && auth.refreshToken) {
            try {
                await httpRequest({
                    method: 'POST',
                    url: appProperties.eve_sso_revoke_url,
                    form: {token_type_hint: 'refresh_token', token: auth.refreshToken, client_id: appProperties.eve_sso_client_id},
                    headers: {'User-Agent': `podstack/${appProperties.version}`},
                });
                revoked = true;
            } catch (err) {
                log.warn(`[SSOv2] Couldn't revoke the token of character #${characterId}`, err.message);
            }
        }

        AuthorizedCharacter.delete(characterId);
        Character.delete(characterId);
        FarmCharacter.delete(characterId);
        SkillPlanStore.deleteAllForCharacter(characterId);
        AccountStore.assign(characterId, undefined);

        log.info(`[Character] Removed character #${characterId}${revoked ? ', token revoked' : ''}`);
        return revoked;
    }

    // onStatus receives {stage, message, done?, total?} as the add progresses. stage is one of
    // 'login', 'token', 'loading', 'done', 'error' or 'idle' (cancelled).
    static async addCharacter(onStatus) {
        const status = typeof onStatus === 'function' ? onStatus : () => {};

        let client = new SsoClientv2();
        const challenge = SsoClientv2.generateCodeChallenge();
        let redirect = client.redirect(appProperties.scopes.map(a => a.name), challenge);

        // The login window is opened by the main process, see authorizeWithEve in index.js.
        status({stage: 'login', message: 'Waiting for EVE login…'});
        const result = await ipcRenderer.invoke('sso:authorize', redirect);

        if (result.cancelled) {
            status({stage: 'idle'});
            return;
        }

        if (result.error === 'client') {
            status({stage: 'error', message: 'Authorization failed: EVE application misconfigured'});
            alert("Failed to authorize your character: EVE rejected the application's client ID or callback URL. Check eve_sso_client_id and eve_sso_callback_url in resources/properties.js against the application on the EVE Developers website.");
            return;
        }

        if (result.error !== undefined) {
            status({stage: 'error', message: 'Authorization failed'});
            alert("Failed to authorize your character, please try again.");
            return;
        }

        let character;
        try {
            status({stage: 'token', message: 'Verifying authorization…'});
            character = await client.authorize(result.code, challenge);
            character.save();
        } catch (err) {
            log.error('[SSOv2] Token exchange failed', err);
            status({stage: 'error', message: 'Authorization failed'});
            alert("Failed to authorize your character, please try again.");
            return;
        }

        // mark for a force refresh (this might be a re-authorization)
        Character.markCharacterForForceRefresh(character.id);

        // we go into the structures cache and we clear this character id from anywhere it appears in an attempted list
        // this ensures that on next refresh structures will be attempted to be repulled
        StructureHelper.removeCharacterIdFromAttemptedLists(character.id);

        try {
            const loaded = await Character.refreshOne(character.id, ({label, done, total}) => {
                status({stage: 'loading', message: `Loading ${label}…`, done, total});
            });
            status({stage: 'done', message: `Added ${loaded.name || 'character'}`});
        } catch (err) {
            // The character is authorized; whatever failed will be retried by the periodic refresh.
            log.error('[SSOv2] Initial character load failed', err);
            status({stage: 'error', message: 'Character added, but some data failed to load. It will retry shortly.'});
        }
    }
}
