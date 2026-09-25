/**
 * Store categories, colour themes and the icon set. Categories drive the
 * default theme and the template copy when no AI key is configured.
 */

export const THEMES = {
  midnight: { name: 'Midnight', primary: '#1f2a44', primaryInk: '#ffffff', accent: '#f5a524', bg: '#ffffff', surface: '#f5f6f8', ink: '#141821', muted: '#5b6272', line: '#e3e6eb', heading: "'Poppins', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fonts: 'Poppins:wght@600;700&family=Inter:wght@400;500;600' },
  coral: { name: 'Coral', primary: '#e8505b', primaryInk: '#ffffff', accent: '#1d3557', bg: '#fffaf8', surface: '#fff0ec', ink: '#1f1a1a', muted: '#6b5f5c', line: '#f1ddd6', heading: "'Poppins', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fonts: 'Poppins:wght@600;700&family=Inter:wght@400;500;600' },
  forest: { name: 'Forest', primary: '#2f5d50', primaryInk: '#ffffff', accent: '#d9a441', bg: '#fbfaf6', surface: '#eef2ec', ink: '#1c2421', muted: '#5a6660', line: '#dfe5dd', heading: "'Fraunces', Georgia, serif", body: "'Inter', system-ui, sans-serif", fonts: 'Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600' },
  ocean: { name: 'Ocean', primary: '#0b6bcb', primaryInk: '#ffffff', accent: '#12b886', bg: '#ffffff', surface: '#eef5fc', ink: '#0f1b2a', muted: '#526173', line: '#dbe6f2', heading: "'Poppins', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fonts: 'Poppins:wght@600;700&family=Inter:wght@400;500;600' },
  blush: { name: 'Blush', primary: '#b4577a', primaryInk: '#ffffff', accent: '#c9a227', bg: '#fffafb', surface: '#fbeff3', ink: '#2a1d22', muted: '#6e5a62', line: '#f0dde4', heading: "'Playfair Display', Georgia, serif", body: "'Inter', system-ui, sans-serif", fonts: 'Playfair+Display:wght@600;700&family=Inter:wght@400;500;600' },
  sand: { name: 'Sand', primary: '#8a5a33', primaryInk: '#ffffff', accent: '#3d6b5a', bg: '#fdfbf7', surface: '#f5eee4', ink: '#2b231c', muted: '#6d6258', line: '#eadfce', heading: "'Fraunces', Georgia, serif", body: "'Inter', system-ui, sans-serif", fonts: 'Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600' },
  mono: { name: 'Mono', primary: '#111111', primaryInk: '#ffffff', accent: '#ff5a1f', bg: '#ffffff', surface: '#f4f4f4', ink: '#111111', muted: '#5c5c5c', line: '#e4e4e4', heading: "'Space Grotesk', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fonts: 'Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600' },
  citrus: { name: 'Citrus', primary: '#ff7a00', primaryInk: '#ffffff', accent: '#2b2d42', bg: '#fffdf8', surface: '#fff4e6', ink: '#1f1f1f', muted: '#65605a', line: '#f3e3cc', heading: "'Poppins', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", fonts: 'Poppins:wght@600;700&family=Inter:wght@400;500;600' }
};

export const CATEGORIES = {
  kitchen: {
    label: 'Kitchen & dining', theme: 'sand', prefixes: ['Prep', 'Hearth', 'Pantry', 'Kitchen'], endings: ['ware', ' Table', ' Co.', ' & Co.'],
    words: ['kitchen', 'cook', 'cooking', 'knife', 'knives', 'pan', 'pot', 'cutting board', 'chopper', 'blender', 'bake', 'baking', 'coffee', 'tea', 'mug', 'bottle', 'spice', 'utensil', 'grater', 'peeler', 'slicer', 'lunch', 'food', 'drink', 'cup', 'dish', 'fryer', 'oven'],
    tagline: 'Better tools for everyday cooking', verb: "Make everyday cooking easier", icons: ['sparkle', 'leaf', 'check', 'clock']
  },
  pets: {
    label: 'Pets', theme: 'citrus', prefixes: ['Paw', 'Tail', 'Fur', 'Pup'], endings: ['nest', 'haven', ' Supply', ' & Co.'],
    words: ['dog', 'cat', 'pet', 'puppy', 'kitten', 'leash', 'collar', 'paw', 'litter', 'chew', 'harness', 'aquarium', 'bird', 'hamster', 'groom'],
    tagline: 'Happy pets, happy homes', verb: "Made for life with pets", icons: ['heart', 'shield', 'sparkle', 'check']
  },
  beauty: {
    label: 'Beauty & care', theme: 'blush', prefixes: ['Glow', 'Lux', 'Bloom', 'Velvet'], endings: [' Studio', ' Beauty', ' & Co.', ' Lab'],
    words: ['skin', 'skincare', 'face', 'facial', 'hair dryer', 'hair straightener', 'hairbrush', 'beauty', 'makeup', 'makeup brush', 'nail', 'lash', 'serum', 'massager', 'spa', 'curler', 'mirror', 'cosmetic', 'lip', 'eyebrow', 'shaver', 'razor', 'face roller', 'jade roller', 'ice roller', 'gua sha'],
    tagline: 'Your routine, upgraded', verb: "Upgrade your daily routine", icons: ['sparkle', 'heart', 'leaf', 'check']
  },
  fitness: {
    label: 'Fitness & wellness', theme: 'midnight', prefixes: ['Peak', 'Core', 'Flex', 'Stride'], endings: [' Fit', ' Athletics', ' Lab', ' Gear'],
    words: ['fitness', 'gym', 'workout', 'yoga', 'exercise', 'resistance band', 'dumbbell', 'posture', 'massage gun', 'running', 'sport', 'training', 'jump rope', 'muscle', 'stretch', 'ab ', 'protein', 'shaker'],
    tagline: 'Train smarter, every day', verb: "Level up your training", icons: ['bolt', 'shield', 'check', 'star']
  },
  tech: {
    label: 'Tech & gadgets', theme: 'ocean', prefixes: ['Volt', 'Pixel', 'Nova', 'Byte'], endings: [' Gear', ' Labs', 'wave', ' Tech'],
    words: ['phone', 'charger', 'charging', 'fan', 'rechargeable', 'battery', 'wireless', 'bluetooth', 'usb', 'cable', 'earbuds', 'headphone', 'speaker', 'led', 'smart', 'camera', 'laptop', 'tablet', 'keyboard', 'mouse', 'power bank', 'projector', 'drone', 'gadget', 'magsafe', 'watch', 'gaming', 'controller', 'tripod', 'ring light'],
    tagline: 'Smart gear that just works', verb: "Smart tech, made simple", icons: ['bolt', 'shield', 'sparkle', 'check']
  },
  home: {
    label: 'Home & living', theme: 'forest', prefixes: ['Nest', 'Haven', 'Linen', 'Hearth'], endings: [' Home', ' Living', 'wood', ' & Co.'],
    words: ['home', 'lamp', 'light', 'pillow', 'blanket', 'bed', 'sheet', 'towel', 'organizer', 'storage', 'decor', 'candle', 'diffuser', 'rug', 'curtain', 'shelf', 'cleaning', 'mop', 'vacuum', 'humidifier', 'plant', 'garden', 'bathroom', 'shower', 'furniture', 'hanger', 'closet'],
    tagline: 'Make your space feel like home', verb: "Make your home work for you", icons: ['leaf', 'sparkle', 'heart', 'check']
  },
  baby: {
    label: 'Baby & kids', theme: 'coral', prefixes: ['Tiny', 'Little', 'Sprout', 'Bloom'], endings: [' Nest', ' Kids', ' & Co.', ' Things'],
    words: ['baby', 'toddler', 'infant', 'kid', 'kids', 'child', 'children', 'nursery', 'stroller', 'toy', 'toys', 'teether', 'bib', 'diaper', 'puzzle', 'montessori', 'plush'],
    tagline: 'Little things for little ones', verb: "Made for busy parents", icons: ['heart', 'shield', 'star', 'check']
  },
  outdoor: {
    label: 'Outdoor & travel', theme: 'forest', prefixes: ['Trail', 'Summit', 'Wild', 'Camp'], endings: [' Gear', ' Supply', ' Outfitters', ' Co.'],
    words: ['camping', 'camp', 'hiking', 'outdoor', 'travel', 'backpack', 'tent', 'fishing', 'bike', 'cycling', 'car', 'flashlight', 'lantern', 'cooler', 'hammock', 'luggage', 'suitcase', 'beach', 'survival'],
    tagline: 'Gear up for your next trip', verb: "Built for your next adventure", icons: ['shield', 'bolt', 'check', 'star']
  },
  fashion: {
    label: 'Fashion & accessories', theme: 'mono', prefixes: ['Muse', 'Thread', 'Mode', 'Luxe'], endings: [' Studio', ' Label', ' Supply', ' & Co.'],
    words: ['shirt', 't-shirt', 'hoodie', 'dress', 'jacket', 'jeans', 'pants', 'shoes', 'sneaker', 'boot', 'sock', 'hat', 'cap', 'bag', 'wallet', 'belt', 'jewelry', 'necklace', 'bracelet', 'ring', 'earring', 'sunglasses', 'scarf', 'leggings', 'tee', 'apparel', 'runner'],
    tagline: 'Everyday pieces, done right', verb: "Your new everyday favourite", icons: ['star', 'sparkle', 'heart', 'check']
  },
  general: {
    label: 'General store', theme: 'midnight', prefixes: ['Nova', 'Bright', 'Kindred', 'Everyday'], endings: [' Goods', ' Supply', ' Co.', ' Market'],
    words: [],
    tagline: 'Thoughtfully chosen, delivered to your door', verb: "The upgrade you didn't know you needed", icons: ['star', 'shield', 'sparkle', 'check']
  }
};

/** Pick the category whose keywords appear most in the product text. */
export function detectCategory(product) {
  const hay = ` ${[product.title, product.category, (product.tags || []).join(' '), (product.bullets || []).slice(0, 3).join(' ')].join(' ').toLowerCase()} `;
  let best = 'general';
  let bestScore = 0;
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const w of cat.words) {
      const re = new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?[^a-z]`, 'g');
      const hits = hay.match(re);
      if (hits) score += hits.length * (product.title?.toLowerCase().includes(w) ? 2 : 1);
    }
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** 24px stroke icons, currentColor. */
export const ICONS = {
  truck: '<path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-6 10-8"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  gift: '<path d="M4 11h16v9H4z"/><path d="M3 7h18v4H3z"/><path d="M12 7v13"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  return: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6.2"/>'
};

export const ICON_NAMES = Object.keys(ICONS);

export function icon(name, size = 24) {
  const body = ICONS[name] || ICONS.check;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
