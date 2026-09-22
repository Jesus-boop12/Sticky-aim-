/**
 * Range-testing notes, written without a model.
 *
 * Shared by the server's AI coach (as its no-key fallback) and by the
 * standalone build, which has no server to call at all.
 */

export function offlineCoachNotes(entries) {
  const lines = entries.map(({ weapon, tuning }) => {
    const ar = tuning.antiRecoil;
    const bullets = [
      `- Confidence in the source stats: ${Math.round(tuning.confidence * 100)}%.`,
      '- On the range: hold the trigger on a wall at about 20m and watch where the shots land.',
      '- Landing above the dot means PH_V is too low, below the dot means too high. Trim 2 at a time.',
      ar.horizontal === 0
        ? '- No horizontal correction is applied; this weapon has no consistent drift.'
        : `- Horizontal correction of ${ar.horizontal} counters its ${ar.horizontal > 0 ? 'left' : 'right'} walk.`
    ];
    if (ar.vertical > 60) {
      bullets.push(`- ${ar.vertical} is a heavy pull. If your crosshair drags off target, cut the strength trim rather than the weapon stats.`);
    }
    if (tuning.sticky.enabled && tuning.sticky.radius > 10) {
      bullets.push(`- Sticky aim at ${tuning.sticky.radius} is wide enough to feel. Drop it if your aim wanders at range.`);
    }
    if (tuning.rapidFire.enabled) {
      bullets.push(`- Check the fire rate in game: ${tuning.rapidFire.effectiveRpm} RPM should not drop rounds.`);
    }
    return [`**${weapon.name}** (V:${ar.vertical} H:${ar.horizontal})`, ...bullets].join('\n');
  });
  return lines.join('\n\n');
}
