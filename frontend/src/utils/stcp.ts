export const STCP_COLORS = {
  blue: '#006CB7',
  cyan: '#00A6B6',
  yellow: '#F5C400',
  orange: '#F37021',
  green: '#178A49',
  red: '#D8232A',
  violet: '#782F8F',
  night: '#111827',
  electricGold: '#C79A2B',
  electricRed: '#C62828',
} as const;

export function lineColor(line: string): string {
  const normalized = line.toUpperCase().trim();
  const metroColors: Record<string, string> = { A: '#199FDA', B: '#C63920', BX: '#C63920', C: '#A3BE31', D: '#EBBC14', E: '#736EB0', F: '#EE731C' };
  if (metroColors[normalized]) return metroColors[normalized];

  if (/^(?:[1-9]|1[0-4])M$/.test(normalized)) return STCP_COLORS.night;
  if (normalized === '1') return STCP_COLORS.electricGold;
  if (normalized === '18') return STCP_COLORS.electricRed;
  if (normalized.startsWith('Z')) return STCP_COLORS.blue;

  const number = Number.parseInt(normalized, 10);
  if (number >= 200 && number <= 209) return STCP_COLORS.blue;
  if (number >= 300 && number <= 309) return STCP_COLORS.cyan;
  if (number >= 400 && number <= 409) return STCP_COLORS.blue;
  if (number >= 500 && number <= 509) return STCP_COLORS.yellow;
  if (number >= 600 && number <= 609) return STCP_COLORS.green;
  if (number >= 700 && number <= 709) return STCP_COLORS.red;
  if (number >= 800 && number <= 809) return STCP_COLORS.violet;
  if (number >= 900 && number <= 909) return STCP_COLORS.orange;

  return STCP_COLORS.blue;
}

export function lineTextColor(line: string): string {
  const color = lineColor(line);
  if (color === '#EBBC14' || color === '#A3BE31' || color === STCP_COLORS.cyan || color === STCP_COLORS.yellow || color === STCP_COLORS.electricGold) {
    return '#10212B';
  }
  return '#FFFFFF';
}

export function agoLabel(seconds: number): string {
  if (seconds < 10) return 'agora';
  if (seconds < 60) return `há ${Math.round(seconds)} s`;
  return `há ${Math.round(seconds / 60)} min`;
}
