import appProperties from './../../resources/properties';
import AllSkills from '../../resources/all_skills';
import NativeHelper from './NativeHelper';

const fs = require('fs');
const xml2js = require('xml2js');

const romanLevels = {I: 1, II: 2, III: 3, IV: 4, V: 5};

let skillsByName;
function skillIdByName(name) {
    if (skillsByName === undefined) {
        skillsByName = new Map(Object.values(AllSkills.skills).map(skill => [skill.name.toLowerCase(), skill.type_id]));
    }
    return skillsByName.get(name.toLowerCase());
}

const levelMap = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
}


export default class ImportExportHelper {

    static ExportPlan(filePath, items) {
        if (filePath !== undefined && items !== undefined) {
            const skills = [];
            try {
                items.forEach((item) => {
                    if (item.type === 'skill') {
                        skills.push({ typeId: item.id, level: item.level });
                    }
                });

                const content = JSON.stringify({
                    formatVersion: 1,
                    source: `podstack/${appProperties.version}`,
                    created: Date.now(),
                    skills: [...skills],
                });

                fs.writeFileSync(filePath, content, 'utf8');
            } catch (e) {
                console.log(e);
            }
        }
    }

    static ExportClipboard(items) {
        if (items !== undefined) {
            let clipboardData = '';
            items.forEach((item, index) => {
                if (index <= 50) {
                    if (item.type === 'skill') {
                        clipboardData += `${item.name} ${levelMap[item.level]}\r\n`;
                    }
                }
            });
            NativeHelper.writeClipboard(clipboardData);
        }
    }

    static ImportPlan(filePath) {
        const skills = [];
        if (filePath !== undefined) {
            try {
                const content = fs.readFileSync(filePath);
                const plan = JSON.parse(content);
                if (plan !== undefined) {
                    if (plan.formatVersion === 1) {
                        plan.skills.forEach((skill) => {
                            skills.push({ typeId: skill.typeId, level: skill.level });
                        });
                    }
                }
            } catch (e) {
                console.log(e);
            }
        }
        return skills;
    }

    /**
     * Reads a pasted skill list: one skill per line, as the EVE client, EVEMon and forums write them, e.g.
     * "Caldari Cruiser IV", "Caldari Cruiser 4", "1. Caldari Cruiser Level 4", "Caldari Cruiser\tIV (2d 3h)".
     *
     * The EVE client's skill plan export ("Copy to clipboard" in the Skills window) writes one line per level, e.g.
     * "Spaceship Command 1", and in non-English clients wraps the name in a localisation tag with the English name
     * marked by an asterisk: '<localized hint="宇宙船操作">Spaceship Command*</localized> 1'.
     *
     * @returns {object} {skills: [{typeId, level}], unknown: [lines that aren't a skill and level]}
     */
    static ParseSkillText(text) {
        const skills = [];
        const unknown = [];

        for (let line of (text || '').split(/\r?\n/)) {
            // the English name is the tag's text or, in some clients, its hint
            const names = [];
            line = line.replace(/<localized\s+hint="([^"]*)"\s*>(.*?)<\/localized>/gi, (m, hint, inner) => {
                names.push(hint.replace(/\*$/, '').trim());
                return inner;
            });

            line = line
                .replace(/\(.*?\)|\[.*?\]/g, ' ')          // "(2d 3h)", "[x]"
                .replace(/^\s*(\d+[.)]|[-*•])\s+/, '')      // "1. ", "2) ", "- "
                .replace(/\s+/g, ' ')
                .trim();
            if (line === '') {
                continue;
            }

            const match = line.match(/^(.+?)\*?\s+(?:level\s+)?(I{1,3}|IV|V|[1-5])$/i);
            let typeId = match ? skillIdByName(match[1].trim()) : undefined;
            if (match && typeId === undefined) {
                typeId = names.map(skillIdByName).find(id => id !== undefined);
            }
            if (typeId === undefined) {
                unknown.push(line);
                continue;
            }

            const level = romanLevels[match[2].toUpperCase()] || parseInt(match[2], 10);
            skills.push({typeId, level});
        }

        return {skills, unknown};
    }

    static ImportEVEMonXML(filePath) {
        const skills = [];
        if (filePath !== undefined) {
            const parser = new xml2js.Parser({ attrValueProcessors: [xml2js.processors.parseNumbers], preserveChildrenOrder: true });

            try {
                const content = fs.readFileSync(filePath);
                parser.parseString(content, (err, result) => {
                    if (result !== undefined) {
                        try {
                            result.plan.entry.forEach((element) => {
                                if (element.$.hasOwnProperty('skillID') && element.$.hasOwnProperty('level')) {
                                    skills.push({ typeId: element.$.skillID, level: element.$.level });
                                }
                            });
                        } catch (e) {
                            console.log(e);
                        }
                    }
                });
            } catch (e) {
                console.log(e);
            }
        }
        return skills;
    }
}
