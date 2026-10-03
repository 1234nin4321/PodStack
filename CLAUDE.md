# CLAUDE.md

Guidance for Claude Code working in this repository. PodStack is an Electron + React desktop app for monitoring EVE
Online characters (a fork of Cerebral), with a 3D ship viewer that reads models straight from the player's EVE client.

## Working rules

- **Commits** are authored and committed as `1234nin4321 <203164353+1234nin4321@users.noreply.github.com>` (set in the
  repo's git config). Never add a `Co-Authored-By: Claude` trailer or other Claude attribution to commits or PRs.
- **Push only when the user says so.** Commit locally as you go; pushing `dev` starts a dev build, and the user decides
  when they want one.
- Never push to the old fork (`upstream`, PrometheusSatyen/Cerebral) if that remote exists.
- Match the surrounding code: comments explain why, in plain sentences; `npx eslint <files>` must pass.

## Builds and releases

- `npm install`, then `npm start` runs the app in development (electron-forge). `npm run lint` lints everything.
- **Dev builds:** pushing `dev` runs `.github/workflows/dev-build.yml`, which builds the Windows Setup .exe + zip as a
  run artifact (kept 30 days), versioned `<base>-dev<run number, 4 digits>`, e.g. `0.2.16-dev0028`. No tag or release,
  so installed copies never auto-update to it. Give the user the artifact link from the run.
- **Releases:** bump `version` in package.json (semver, e.g. 0.2.17-alpha), push tag `v<version>`;
  `.github/workflows/release.yml` builds and uploads a draft release. Publish it with prerelease=false: the app's own
  updater (`src/updater.js`, GitHub releases API) ignores drafts and pre-releases. `master` is the release line.
- `npm run update-ships [-- <extracted SDE folder>]` regenerates `resources/ships.js` from CCP's static data export
  (ships, SKINs and their paint, and the nebula names). It prints new/removed ships; review and commit the result.

## EVE SSO and ESI

- `eve_sso_client_id` in `resources/properties.js` is the user's own EVE application; `eve_sso_legacy_client_id` is the
  original Cerebral app. Refresh tokens only work with the client id that issued them, so each character stores
  `clientId` (missing = legacy).
- Adding an ESI scope means the user must tick it on their app at developers.eveonline.com first. Never assume it is.
- If a user says PodStack's skill plan time is shorter than the in-game plan: the in-game plan prices each level as if
  training from 0 SP, so its total is longer. That's not a PodStack bug (`src/models/PlanCharacter.js` is right).

## The 3D ship viewer

Files: `src/components/ships/ShipViewer.jsx` (three.js scene, shaders, UI), `src/helpers/ShipModelHelper.js` (finds
the EVE client, its file index and models/textures), `src/helpers/ShipSof.js` (space object factory data: paint,
patterns, decals, effects, lights), `src/helpers/ShipPaint.js` (SDE paint fallback), and `src/helpers/granny/`:
`GrannyFile.js` (Granny 2 models, 32/64-bit), `BitKnit.js` + `Oodle1.js` (their compression), `Dds.js`
(BC1/2/3/4/5/7 and uncompressed DDS), `BlackFile.js` (SOF ".black" files, field types declared per class),
`RedFile.js` (effect ".red" files, stored by the client as .black).

Nothing of CCP's is shipped: everything is read at run time from the user's install (`tq\resfileindex*.txt` maps
`res:/...` paths to files under `ResFiles\`). Never bundle or fetch third-party decoder code (GPL BitKnit/ooz/pybg3 are
off limits; BitKnit was written from libbg3's MIT spec, Oodle1 ported from nwn2mdk's Boost-licensed code).

How the client paints a hull, as worked out from its files and its decompiled shaders (quadv5, ubershader):

- **Hull areas:** a hull's SOF file (`spaceobjectfactory/hulls/<hull>.black`) lists `opaqueAreas` (also transparent,
  additive, decal, distortion lists). Each area = one mesh material slot (`index` = the gr2 MaterialIndex, absent 0),
  with a shader, its own textures (often shared plating/tech or another hull's) and an `areaType` (0 Primary, 1 Glass,
  2 Sails, 3 Reactor, 4 Darkhull, 5 Rock; 6-9 unknown, painted as Primary). The viewer builds one hull material per
  (texture set, area type). A SKIN's materials replace only Primary; other area types use the faction's.
- **Geometry:** a gr2 vertex's `Tangent` (4 bytes) packs the tangent frame: each byte an angle (b/255·2π − π); T and
  B are spherical unit vectors (angles 0-1, 2-3), N = T × B, negated unless angles 1 and 3 are both > 0 (quadv5's
  vertex shader). The viewer uses these normals and tangents; working normals out from triangles is wrong on most hulls
  (authored bevels, and seams where vertices are split). A hull area's `index` is the mesh's group **position**, not its
  MaterialIndex (Tech III cruisers' full-detail meshes name material 0 for nearly every group).
- **Tech III cruisers:** every subsystem combination is its own model, `<folder>/<hull>_all/<hull>_<core><def><off>
  <prop>.gr2` (variants 1-3; the hull's own model is its default combination, e.g. csc1_t3 = 2213). Its mesh groups
  are each subsystem's SOF hull areas in turn (`<hull>_s<slot>v<variant>.black`: area 0 hull, 1 engine where it has
  one; checked on all 324 models). Subsystem decals count vertices from their subsystem's first vertex; their decals and
  lights sit at their subsystem's offset: the core at the origin, each next one at the previous one's `next_subsystem`
  locator. The SDE names each subsystem's SOF hull (graphics `sofHullName`), so `update-ships` lists them per ship.
- **Parts by shader** (all of a hull's area lists, `ShipModelHelper.slotPasses`): quadv5/quadsails/quaddetail painted;
  quadheatv5 (engines, reactors) painted too, its glow map in the faction's Booster (Reactor for area type 3) colour;
  quadglassv5 glass; additive fxv5/fxdirectionalv5 areas drawn as glowing layers over their slot; fxdistortionv5 (heat
  shimmer) and slots no area names aren't drawn.
- **Textures:** `_a` colour (BC7; the shader declares it sRGB: base = sRGB(_a) × paint), `_n` normal (BC5, no z:
  normalize(N + xT + yB)), `_m` four-area material mask (levels 0/85/170/255, linear blend between), `_r` gloss
  multiplier (R = 1 - gloss*_r), `_g` glow (raised to 2.4), `_p3` PaintMaskMap (where set: unpainted, F0 0.04, gloss
  0.4; only 21 of 386 aren't empty; not drawn), `_d` dirt (the client's main pass doesn't use it either).
  A look's `resPathInsert` (SKIN, else faction) picks a texture set, e.g. "nefantar"; most hulls lack most sets and the
  game falls back to the hull's own.
- **Paint chain:** SKIN (SDE) → faction `factions/<name>.black` `areaTypes.<type>.material1-4` → `materials/<name>.black`
  (DiffuseColor, FresnelColor, Gloss, DustDiffuseColor). The SDE writes "None" for "not set". Paint brightness factor
  0.7 was calibrated against in-game screenshots.
- **Patterns:** two layers projected through boxes in hull space (box local Y/Z = texture U/V, no depth limit,
  mirror = x→|x|). Projection type per axis: 0/absent repeat, 1 clamp, 2 nothing outside the box. Layer material 0-3 =
  the hull's areas, 4/5 = the SKIN's custom materials. `isTargetMtl1-4` limit which areas a layer paints. Layer 1 lies
  over layer 2 (the shader has other variants; no file says which a SKIN uses).
- **Effects:** hull `childSets` whose `visibilityGroup` the faction enables carry effect files (holograms, trails,
  auroras), drawn with a port of ubershader.fx (scrolling textures × mask × colour × Fresnel, additive) plus their point
  lights. Particles and animation curves aren't drawn.
- **Running lights:** hull `spriteSets` items; `colorType` indexes Primary, Secondary, Tertiary, Black (not stored),
  White, Yellow, Orange, Red, Blue, ... of the faction's colour set. Drawn ×4 brightness, ×0.5 size (user approved).
- **Lighting** (from quadv5's disassembly, `effect.dx11/.../quadv5.sm_hi`): one white sun (the preview scenes' 1.5 =
  1.5π in three.js) and the nebula's reflection cube `<name>_cube_refl.dds` (128², DXT3, 7 mips; sRGB, as quadv5 tags
  EveSpaceSceneEnvMap `Tr2sRGB`: read linear, reflections come out ~10× too strong) at mip
  `7 − log2(2/a⁴ − 1)/4` (a = roughness²) × the scene's reflectionIntensity (1.55; 1.4 for m nebulas), its smallest
  mip along N as ambient; no other lights. Backdrop `<name>_cube_lowdetail.dds` (BC6H); each race in its preview
  nebula (`dx9/scene/preview/`). Tone mapping is Uncharted 2 (`H(2x)/H(11.2)`, the client's postprocess shader);
  exposure (1.2), backdrop (1.5) and bloom are set by eye, as the client's exposure is automatic.
- **Checking a change:** `npm start` bundles once (esbuild, no watch): run `node scripts/build.js --dev` and reload
  the window (Ctrl+R) to see edits.

## Open items (as of 2026-10-03)

- **Not yet drawn:** engine glows and trails (each hull's `booster` items: nozzle transforms; colours and shapes from
  `spaceobjectfactory/races/<race>.black`, textures `dx9/model/booster/`), textured glass (alpha = 1 − PaintMask,
  tint, reflections; drawn two-sided), spotlights, glow planes, haze, killmarks.
- **Pattern blend modes:** the viewer draws layer 2 only outside layer 1 (quadv5's NESTED_INVERTED); the shader's
  default permutation is OVERLAY (layer 2 on top). No file found says which a SKIN uses.
- **47 SKIN looks** have pattern layers whose custom material the SDE leaves blank (e.g. Raven State Police, Scope
  Syndication YC122): the viewer leaves the layer off; an in-game screenshot would show if that's right.
- **Faction default patterns** (`defaultPattern` in ~10 factions, mostly Sansha) aren't drawn.
- **24 SKIN looks** reference materials/factions/patterns that don't exist in the client (CCP data errors, e.g. pattern
  `igc_xx_edencomm` vs file `igc_xx_edencom`); nothing to fix.
- Also not drawn: detail maps (`quaddetailv5`), sail detail maps, particles, animations (bind pose only).
