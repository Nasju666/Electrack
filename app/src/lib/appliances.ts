// What can be plugged into each kind of ElecTrack device, and how it is drawn.
import type { IconName, Tone } from './ui';

const LOOK: Record<string, { icon: IconName; tone: Tone }> = {
  'Air Conditioner': { icon: 'snow-outline', tone: 'danger' },
  Refrigerator: { icon: 'cube-outline', tone: 'info' },
  'Rice Cooker': { icon: 'restaurant-outline', tone: 'warn' },
  'Microwave Oven': { icon: 'grid-outline', tone: 'warn' },
  Television: { icon: 'tv-outline', tone: 'info' },
  Monitor: { icon: 'desktop-outline', tone: 'ok' },
  Laptop: { icon: 'laptop-outline', tone: 'info' },
  'Electric Fan': { icon: 'aperture-outline', tone: 'ok' },
  Other: { icon: 'flash-outline', tone: 'muted' },
};

export const lookOf = (category: string | null | undefined) => LOOK[category ?? ''] ?? LOOK.Other;

const tiles = (names: string[]) => names.map((id) => ({ id, icon: LOOK[id].icon }));

/** One heavy appliance on the High-Power Plug; light appliances on the strip. */
export const CATEGORIES = {
  'High-Power Plug': tiles(['Air Conditioner', 'Refrigerator', 'Rice Cooker', 'Microwave Oven', 'Other']),
  'Power Strip': tiles(['Television', 'Monitor', 'Laptop', 'Electric Fan', 'Other']),
} as const;

// The validated limits from the approved scope.
export const LIMIT_W = { 'High-Power Plug': 1760, 'Power Strip': 150 } as const;

/** Appliances that draw far more than a strip outlet's 150 W. */
const HEAVY = /air\s?-?con|aircon|\bac\b|refrigerator|\bref\b|fridge|freezer|rice\s?cooker|microwave|oven|heater|kettle|\biron\b|washing|dryer|toaster|induction|stove|pump/i;
export const looksHeavy = (name: string) => HEAVY.test(name);
