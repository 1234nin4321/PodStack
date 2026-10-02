'use strict';

// Attribute implants and cerebral accelerators, from EVE's static data (ESI universe/types, dogma attributes 175-179
// for the attribute bonus and 330 for booster duration). Generated 2026-10-02.

// Attribute implant grades; every grade has one implant per attribute, in slots 1-5.
export const IMPLANT_SLOTS = [
    {slot: 1, attribute: 'perception', base: 'Ocular Filter'},
    {slot: 2, attribute: 'memory', base: 'Memory Augmentation'},
    {slot: 3, attribute: 'willpower', base: 'Neural Boost'},
    {slot: 4, attribute: 'intelligence', base: 'Cybernetic Subprocessor'},
    {slot: 5, attribute: 'charisma', base: 'Social Adaptation Chip'},
];

export const IMPLANT_GRADES = [
    {bonus: 1, grade: 'Limited', name: base => `Limited ${base}`},
    {bonus: 2, grade: 'Limited Beta', name: base => `Limited ${base} - Beta`},
    {bonus: 3, grade: 'Basic', name: base => `${base} - Basic`},
    {bonus: 4, grade: 'Standard', name: base => `${base} - Standard`},
    {bonus: 5, grade: 'Improved', name: base => `${base} - Improved`},
];

// Cerebral accelerators currently in the game with a fixed duration, weakest first. Left out: Serenity-only and
// expired event items, and the new-player Standard/Prototype/Advanced Cerebral Accelerators, whose data has no
// duration (model those with a custom accelerator).
export const ACCELERATORS = [
    {typeId: 57242, name: "Festival-only Outpost Cerebral Accelerator I", bonus: 1, days: 1},
    {typeId: 57243, name: "Festival-only Outpost Cerebral Accelerator III", bonus: 1, days: 3},
    {typeId: 57244, name: "Festival-only Outpost Cerebral Accelerator VII", bonus: 1, days: 7},
    {typeId: 72238, name: "Basic 'Boost' Cerebral Accelerator", bonus: 2, days: 2},
    {typeId: 57245, name: "Festival-only Vanguard Cerebral Accelerator I", bonus: 3, days: 1},
    {typeId: 57246, name: "Festival-only Vanguard Cerebral Accelerator III", bonus: 3, days: 3},
    {typeId: 57247, name: "Festival-only Vanguard Cerebral Accelerator VII", bonus: 3, days: 7},
    {typeId: 72239, name: "Standard 'Boost' Cerebral Accelerator", bonus: 4, days: 4},
    {typeId: 57248, name: "Festival-only Commander Cerebral Accelerator I", bonus: 5, days: 1},
    {typeId: 57249, name: "Festival-only Commander Cerebral Accelerator III", bonus: 5, days: 3},
    {typeId: 57250, name: "Festival-only Commander Cerebral Accelerator VII", bonus: 5, days: 7},
    {typeId: 72240, name: "Advanced 'Boost' Cerebral Accelerator", bonus: 6, days: 6},
    {typeId: 72241, name: "Specialist 'Boost' Cerebral Accelerator", bonus: 8, days: 8},
    {typeId: 55826, name: "Expert Cerebral Accelerator", bonus: 8, days: 12.5},
    {typeId: 57251, name: "Festival-only Marshal Cerebral Accelerator I", bonus: 10, days: 1},
    {typeId: 48582, name: "Master-at-Arms Cerebral Accelerator", bonus: 10, days: 1},
    {typeId: 57252, name: "Festival-only Marshal Cerebral Accelerator III", bonus: 10, days: 3},
    {typeId: 57253, name: "Festival-only Marshal Cerebral Accelerator VII", bonus: 10, days: 7},
    {typeId: 72242, name: "Expert 'Boost' Cerebral Accelerator", bonus: 10, days: 10},
    {typeId: 77919, name: "Genius 'Boost' Cerebral Accelerator", bonus: 12, days: 12},
    // event accelerators (EVE's static data, build 3569502)
    {typeId: 56659, name: "Festival-only New Eden Vanguard Pack", bonus: 3, days: 7},
    {typeId: 77934, name: "Heimatar Rise Accelerator", bonus: 6, days: 2},
    {typeId: 49753, name: "Onslaught Accelerator", bonus: 10, days: 3},
    {typeId: 56661, name: "Festival-only New Eden Commander Pack", bonus: 10, days: 7},
    {typeId: 85279, name: "Totality Day Accelerator", bonus: 13, days: 3},
    {typeId: 56662, name: "Festival-only New Eden Marshal Pack", bonus: 15, days: 7},
];
