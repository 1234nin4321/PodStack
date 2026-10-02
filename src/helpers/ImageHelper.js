'use strict';

// CCP's image server. The old image.eveonline.com host is deprecated.
const IMAGE_SERVER = 'https://images.evetech.net';

export default class ImageHelper {
    static characterPortrait(id, size = 128) {
        return `${IMAGE_SERVER}/characters/${id}/portrait?size=${size}`;
    }

    static corporationLogo(id, size = 64) {
        return `${IMAGE_SERVER}/corporations/${id}/logo?size=${size}`;
    }

    static allianceLogo(id, size = 64) {
        return `${IMAGE_SERVER}/alliances/${id}/logo?size=${size}`;
    }

    static typeIcon(id, size = 32) {
        return `${IMAGE_SERVER}/types/${id}/icon?size=${size}`;
    }
}
