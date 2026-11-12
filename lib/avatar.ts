// Everything about how an avatar is put together. The art lives in public/avatar/<slot>/<id>.svg,
// every file is a transparent 100x100 layer, and layers are stacked in SLOT_ORDER (first = furthest back).

export const SLOT_ORDER = [
  'background', 'body', 'socks', 'shoes', 'shorts', 'shirt', 'belt', 'necklace', 'watch', 'wristband',
  'hair', 'eyeblack', 'sunglasses', 'headphones', 'hat', 'held', 'pet',
] as const
export type Slot = (typeof SLOT_ORDER)[number]
export type Slots = Partial<Record<Slot, string>>

// The order the editor shows the tabs in, with friendly names. Body can't be removed.
export const SLOT_TABS: { slot: Slot; label: string; required?: boolean }[] = [
  { slot: 'hat', label: 'Hats & crowns' },
  { slot: 'hair', label: 'Hair' },
  { slot: 'sunglasses', label: 'Sunglasses' },
  { slot: 'eyeblack', label: 'Eye black' },
  { slot: 'headphones', label: 'Headphones' },
  { slot: 'shirt', label: 'Shirts' },
  { slot: 'necklace', label: 'Chains' },
  { slot: 'watch', label: 'Watches' },
  { slot: 'wristband', label: 'Wristbands' },
  { slot: 'belt', label: 'Belts' },
  { slot: 'shorts', label: 'Shorts' },
  { slot: 'socks', label: 'Socks' },
  { slot: 'shoes', label: 'Shoes' },
  { slot: 'held', label: 'Holding' },
  { slot: 'pet', label: 'Pets' },
  { slot: 'background', label: 'Backgrounds' },
  { slot: 'body', label: 'Skin tone', required: true },
]

export const DEFAULT_SLOTS: Slots = {
  body: 'body_yellow', hair: 'hair_short', shirt: 'shirt_white', shorts: 'shorts_gray',
  shoes: 'shoes_white', background: 'bg_grass',
}

export type Item = {
  id: string; slot: Slot; name: string; price: number | null; rarity: string
  starter: boolean; season_year: number | null; sort: number
}

export const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
}

export const itemUrl = (slot: string, id: string) => `/avatar/${slot}/${id}.svg`

// Turn whatever is stored in profiles.avatar_config into a set of slots.
// New shape: { slots: { shirt: 'shirt_red', ... } }.  Old shape: { color, emoji } (still shows as a default look on that color).
export function readSlots(config: unknown): { slots: Slots; legacyColor?: string } {
  const c = (config ?? {}) as { slots?: Slots; color?: string }
  if (c.slots && typeof c.slots === 'object') return { slots: c.slots }
  return { slots: { ...DEFAULT_SLOTS, background: undefined }, legacyColor: typeof c.color === 'string' ? c.color : undefined }
}