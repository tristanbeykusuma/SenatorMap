// Single source of truth for merchant status labels, their map
// marker colours and marker glyphs. The KET column of the branch
// tracking sheets carries these nine values; anything else a
// workbook introduces still renders, just in the fallback grey.

export const STATUS_OPTIONS: string[] = [
  'Belum FU',
  'Tutup Permanent',
  'Belum Merchant',
  'DONE AKUISISI MERCHANT',
  'Merchant Tidak ditemukan',
  'Merchant Existing',
  'Merchant Tidak Layak Akuisisi',
  'Merchant Menolak',
  'On Renovation',
];

export const STATUS_COLORS: Record<string, string> = {
  'Belum FU': '#ef4444',
  'Tutup Permanent': '#7c3aed',
  'Belum Merchant': '#f59e0b',
  'DONE AKUISISI MERCHANT': '#22c55e',
  'Merchant Tidak ditemukan': '#9ca3af',
  'Merchant Existing': '#3b82f6',
  'Merchant Tidak Layak Akuisisi': '#f97316',
  'Merchant Menolak': '#e11d48',
  'On Renovation': '#06b6d4',
};

export const STATUS_GLYPHS: Record<string, string> = {
  'Belum FU': '●',
  'Tutup Permanent': '✕',
  'Belum Merchant': '◆',
  'DONE AKUISISI MERCHANT': '✓',
  'Merchant Tidak ditemukan': '?',
  'Merchant Existing': '★',
  'Merchant Tidak Layak Akuisisi': '▲',
  'Merchant Menolak': '✖',
  'On Renovation': '◐',
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#6b7280';
}

export function getStatusGlyph(status: string): string {
  return STATUS_GLYPHS[status] || '●';
}