'use strict';

import FarmCharacter from '../models/FarmCharacter';

export default class FarmHelper {
    static addFarm(id, baseSp) {
        if (baseSp < 5000000) {
            baseSp = 5000000;
        }

        // updating a farm's base SP keeps its subscription setting
        const existing = FarmCharacter.get(id);
        let character = new FarmCharacter(id, baseSp);
        if (existing !== undefined && existing.subscription !== undefined) {
            character.subscription = existing.subscription;
        }
        character.save();
    }

    static setSubscription(id, subscription) {
        const farm = FarmCharacter.get(id);
        if (farm !== undefined) {
            farm.subscription = subscription;
            farm.save();
        }
    }

    static deleteFarm(id) {
        FarmCharacter.delete(id);
    }
}