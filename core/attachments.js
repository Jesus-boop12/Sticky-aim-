/**
 * Attachments.
 *
 * Same honesty rule as the weapon rosters: the slots and the attachment names
 * are real, the numbers are estimates. Every effect here is a fraction applied
 * to the base weapon - `recoilVertical: -0.12` means "takes 12% off the
 * vertical kick" - and they are the kind of figures a player would recognise,
 * not values pulled out of a game's files.
 *
 * Attachments that change handling without changing recoil are listed with
 * zero effect and a note, so they still show up in the script header: a tune
 * built for a 4x optic is not the same tune as one built for a red dot, and
 * the header should say which one you were holding.
 */

export const SLOTS = [
  { id: 'muzzle', label: 'Muzzle' },
  { id: 'barrel', label: 'Barrel' },
  { id: 'optic', label: 'Optic' },
  { id: 'underbarrel', label: 'Underbarrel' },
  { id: 'stock', label: 'Stock' },
  { id: 'reargrip', label: 'Rear grip' },
  { id: 'magazine', label: 'Magazine' },
  { id: 'laser', label: 'Laser' }
];

/**
 * effects: recoilVertical / recoilHorizontal / rpm / adsTime, all fractions.
 * A positive recoil number means the attachment makes the gun kick harder.
 */
export const ATTACHMENTS = [
  /* ---- muzzle ---- */
  { id: 'compensator', slot: 'muzzle', name: 'Compensator', effects: { recoilVertical: -0.12, recoilHorizontal: 0.03 },
    note: 'Trades a little horizontal sway for vertical control.' },
  { id: 'muzzle-brake', slot: 'muzzle', name: 'Muzzle Brake', effects: { recoilVertical: -0.08, recoilHorizontal: -0.08 } },
  { id: 'suppressor', slot: 'muzzle', name: 'Suppressor', effects: { recoilVertical: -0.05, adsTime: 0.08 } },
  { id: 'flash-hider', slot: 'muzzle', name: 'Flash Hider', effects: {}, note: 'Visual only - no effect on the pull.' },

  /* ---- barrel ---- */
  { id: 'long-barrel', slot: 'barrel', name: 'Long / heavy barrel', effects: { recoilVertical: -0.10, adsTime: 0.12 } },
  { id: 'short-barrel', slot: 'barrel', name: 'Short / light barrel', effects: { recoilVertical: 0.08, adsTime: -0.10 } },
  { id: 'reinforced-barrel', slot: 'barrel', name: 'Reinforced barrel', effects: { recoilVertical: -0.06, recoilHorizontal: -0.04, adsTime: 0.06 } },

  /* ---- optic: zoom magnifies the recoil you have to correct ---- */
  { id: 'iron-sights', slot: 'optic', name: 'Iron sights', effects: {} },
  { id: 'reflex', slot: 'optic', name: 'Red dot / reflex', effects: { adsTime: 0.03 } },
  { id: 'holo', slot: 'optic', name: 'Holographic', effects: { adsTime: 0.05 } },
  { id: 'scope-3x', slot: 'optic', name: '3x scope', effects: { recoilVertical: 0.12, recoilHorizontal: 0.12, adsTime: 0.10 },
    note: 'Magnification multiplies what the recoil looks like, so the correction has to grow with it.' },
  { id: 'scope-4x', slot: 'optic', name: '4x / 4.5x scope', effects: { recoilVertical: 0.20, recoilHorizontal: 0.20, adsTime: 0.14 },
    note: 'Same again, harder.' },
  { id: 'scope-8x', slot: 'optic', name: '8x+ sniper scope', effects: { recoilVertical: 0.35, recoilHorizontal: 0.35, adsTime: 0.20 } },

  /* ---- underbarrel ---- */
  { id: 'vertical-grip', slot: 'underbarrel', name: 'Vertical foregrip', effects: { recoilVertical: -0.10, recoilHorizontal: 0.02 } },
  { id: 'angled-grip', slot: 'underbarrel', name: 'Angled foregrip', effects: { recoilHorizontal: -0.10, adsTime: -0.04 } },
  { id: 'ranger-grip', slot: 'underbarrel', name: 'Ranger foregrip', effects: { recoilVertical: -0.06, recoilHorizontal: -0.06 } },
  { id: 'bipod', slot: 'underbarrel', name: 'Bipod', effects: {},
    note: 'Only helps mounted or prone, which the script cannot know about - recorded, not applied.' },

  /* ---- stock ---- */
  { id: 'heavy-stock', slot: 'stock', name: 'Heavy stock', effects: { recoilVertical: -0.10, recoilHorizontal: -0.05, adsTime: 0.08 } },
  { id: 'light-stock', slot: 'stock', name: 'Light stock', effects: { recoilVertical: 0.06, adsTime: -0.12 } },
  { id: 'no-stock', slot: 'stock', name: 'No stock', effects: { recoilVertical: 0.14, recoilHorizontal: 0.08, adsTime: -0.18 } },

  /* ---- rear grip ---- */
  { id: 'rubber-grip', slot: 'reargrip', name: 'Rubberised grip', effects: { recoilVertical: -0.06 } },
  { id: 'quickdraw-grip', slot: 'reargrip', name: 'Quickdraw grip', effects: { adsTime: -0.10 } },
  { id: 'assault-grip', slot: 'reargrip', name: 'Assault grip', effects: { recoilHorizontal: -0.06 } },

  /* ---- magazine ---- */
  { id: 'extended-mag', slot: 'magazine', name: 'Extended magazine', effects: { adsTime: 0.05 },
    note: 'More rounds means the sustained phase of the pull matters more.' },
  { id: 'fast-mag', slot: 'magazine', name: 'Fast magazine', effects: {} },
  { id: 'heavy-rounds', slot: 'magazine', name: 'High-grain / heavy rounds', effects: { recoilVertical: 0.06, recoilHorizontal: 0.04 } },

  /* ---- laser ---- */
  { id: 'laser-steady', slot: 'laser', name: 'Steady aim laser', effects: { adsTime: -0.06 } },
  { id: 'laser-target', slot: 'laser', name: 'Target laser', effects: { recoilHorizontal: -0.04, adsTime: -0.04 } }
];

const ATTACHMENT_BY_ID = new Map(ATTACHMENTS.map((a) => [a.id, a]));

export function getAttachment(id) {
  return ATTACHMENT_BY_ID.get(id) || null;
}

export function attachmentsForSlot(slotId) {
  return ATTACHMENTS.filter((a) => a.slot === slotId);
}

/** Catalog shaped for the UI: slots, each with the attachments that fit it. */
export function attachmentCatalog() {
  return SLOTS.map((slot) => ({
    ...slot,
    options: attachmentsForSlot(slot.id).map(({ id, name, effects, note }) => ({ id, name, effects, note: note || '' }))
  }));
}

/**
 * Turn a picked-attachment list (ids, or {slot, id} pairs) into the modifier
 * shape the weapon model expects. Unknown ids are dropped rather than guessed.
 */
export function resolveAttachments(picked) {
  if (!Array.isArray(picked)) return [];
  const bySlot = new Map();
  for (const entry of picked) {
    const id = typeof entry === 'string' ? entry : entry?.id;
    const attachment = getAttachment(id);
    if (!attachment) continue;
    bySlot.set(attachment.slot, attachment);   // one attachment per slot
  }
  return [...bySlot.values()].map((a) => ({
    id: a.id,
    name: a.name,
    slot: a.slot,
    recoilVertical: a.effects.recoilVertical || 0,
    recoilHorizontal: a.effects.recoilHorizontal || 0,
    rpm: a.effects.rpm || 0,
    adsTime: a.effects.adsTime || 0,
    note: a.note || ''
  }));
}
