import { SpiroConfig } from './types';

export const DEFAULT_CONFIG: SpiroConfig = {
  outerRadius: 150,
  innerRadius: 52,
  penOffset: 70,
  penColor: '#22c55e', // green-500
  speed: 1,
  opacity: 1,
  lineWidth: 1.5,
  showGears: true,
  statorAspect: 1.0,
  rotorAspect: 1.0,
  numerator: 2,
  denominator: 3,
};

export const PRESET_COLORS = [
  // Row 1: Warm & Earthy & Greens
  '#dc2626', // Red
  '#ea580c', // Orange
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#65a30d', // Olive
  '#16a34a', // Green
  '#15803d', // Dark Green

  // Row 2: Cool Greens, Blues & Purples
  '#10b981', // Emerald
  '#0d9488', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue (Distinct from Cyan)
  '#6366f1', // Indigo
  '#a855f7', // Purple (Replaces Navy/Black-ish)
  '#8b5cf6', // Violet

  // Row 3: Pinks, Neutrals
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#78350f', // Brown
  '#000000', // Black
  '#6b7280', // Gray
  '#ffffff', // White
];

export const COLOR_NAMES: Record<string, string> = {
  '#dc2626': 'Red',
  '#ea580c': 'Orange',
  '#eab308': 'Yellow',
  '#84cc16': 'Lime',
  '#65a30d': 'Olive',
  '#16a34a': 'Green',
  '#15803d': 'Dark Green',
  '#10b981': 'Emerald',
  '#0d9488': 'Teal',
  '#06b6d4': 'Cyan',
  '#3b82f6': 'Blue',
  '#6366f1': 'Indigo',
  '#a855f7': 'Purple',
  '#8b5cf6': 'Violet',
  '#d946ef': 'Fuchsia',
  '#ec4899': 'Pink',
  '#f43f5e': 'Rose',
  '#78350f': 'Brown',
  '#000000': 'Black',
  '#6b7280': 'Gray',
  '#ffffff': 'White',
};