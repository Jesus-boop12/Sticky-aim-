/**
 * One script for every gun.
 *
 * Instead of a slot per weapon, a universal script carries one profile per
 * weapon CLASS, built from every weapon of that class in the game's roster. An
 * assault rifle profile that suits the middle of the AR roster is wrong for no
 * AR by much, which is the trade you are making: one script that is decent
 * everywhere instead of eight that are right somewhere.
 *
 * The class is chosen by following your weapon-swap button - see gpc.js. The
 * device cannot see the game, so that is as close to "automatic" as the
 * hardware allows, and the generated script says so.
 */

import { catalogFor } from './catalog.js';
import { getCategory } from './games.js';
import { computeTuning, normalizeProfile } from './tuning.js';

/** Middle value, so one freak weapon cannot drag a whole class. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Classes worth their own profile, in the order they appear in the script. */
export const UNIVERSAL_CLASSES = ['ar', 'smg', 'lmg', 'battle', 'marksman', 'sniper', 'shotgun', 'pistol'];

/**
 * @param {string} gameId
 * @param {object} rawProfile  the player's settings
 * @returns {Array} one entry per class present in that game's roster
 */
export function buildClassProfiles(gameId, rawProfile = {}) {
  const profile = normalizeProfile({ ...rawProfile, game: gameId });
  const roster = catalogFor(gameId);
  if (!roster.length) throw new Error('That game has no bundled roster to build a universal script from.');

  const profiles = [];
  for (const classId of UNIVERSAL_CLASSES) {
    const members = roster.filter((w) => w.category === classId);
    if (!members.length) continue;

    const tunings = members.map((weapon) => computeTuning(weapon, profile));
    const representative = tunings[Math.floor(tunings.length / 2)];

    // Phase timings are medianed slot by slot so the timeline stays ordered.
    const phases = representative.antiRecoil.phases.map((_, i) => ({
      untilMs: median(tunings.map((t) => t.antiRecoil.phases[i].untilMs)),
      vertical: median(tunings.map((t) => t.antiRecoil.phases[i].vertical)),
      horizontal: 0   // a class has no shared drift direction; see below
    }));

    const rapid = tunings.filter((t) => t.rapidFire.enabled);
    const sticky = tunings.filter((t) => t.sticky.enabled);

    profiles.push({
      id: classId,
      label: getCategory(classId).label,
      weaponCount: members.length,
      // the guns whose numbers sit closest to the middle, for the header
      examples: members.slice(0, 3).map((w) => w.name),
      spread: {
        low: Math.min(...tunings.map((t) => t.antiRecoil.vertical)),
        high: Math.max(...tunings.map((t) => t.antiRecoil.vertical))
      },
      tuning: {
        ...representative,
        weaponName: `${getCategory(classId).label} (${members.length} weapons)`,
        antiRecoil: {
          ...representative.antiRecoil,
          vertical: median(tunings.map((t) => t.antiRecoil.vertical)),
          horizontal: 0,
          kickMs: median(tunings.map((t) => t.antiRecoil.kickMs)),
          releaseThreshold: median(tunings.map((t) => t.antiRecoil.releaseThreshold)),
          phases
        },
        // A class profile only turns a mod on when most of the class wants it.
        rapidFire: {
          ...representative.rapidFire,
          enabled: rapid.length > members.length / 2,
          holdMs: median(rapid.map((t) => t.rapidFire.holdMs)) || representative.rapidFire.holdMs,
          restMs: median(rapid.map((t) => t.rapidFire.restMs)) || representative.rapidFire.restMs
        },
        sticky: {
          ...representative.sticky,
          enabled: sticky.length > members.length / 2,
          radius: median(sticky.map((t) => t.sticky.radius)),
          periodMs: median(sticky.map((t) => t.sticky.periodMs)) || representative.sticky.periodMs
        },
        diagnostics: [
          `Built from all ${members.length} ${getCategory(classId).label.toLowerCase()}s in the roster; ` +
          `their individual pulls run ${Math.min(...tunings.map((t) => t.antiRecoil.vertical))}-` +
          `${Math.max(...tunings.map((t) => t.antiRecoil.vertical))}, this profile sits at the middle.`,
          'Horizontal correction is off for a class profile: the guns in a class drift different ways, ' +
          'so a shared value would be wrong for half of them.',
          rapid.length && rapid.length <= members.length / 2
            ? `Rapid fire left off: only ${rapid.length} of ${members.length} want it. Build a single-weapon script for those.`
            : null
        ].filter(Boolean),
        overridden: [],
        confidence: Number((median(tunings.map((t) => Math.round(t.confidence * 100))) / 100).toFixed(2))
      }
    });
  }

  return profiles;
}
