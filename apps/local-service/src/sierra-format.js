export function levelsToSierraText(levels) {
  return levels.map((level) => {
    const [r, g, b] = hexToRgb(level.color || kindColor(level.kind));
    return [
      csvCell(displayLevelName(level)),
      Number(level.price).toFixed(2),
      r,
      g,
      b,
      csvCell(level.kind || 'unknown')
    ].join(',');
  }).join('\n') + (levels.length ? '\n' : '');
}

function hexToRgb(hex) {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'FFFFFF';
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function kindColor(kind) {
  switch (kind) {
    case 'dd-band':
      return '#29B6F6';
    case 'hp':
      return '#2962FF';
    case 'mhp':
      return '#FF9800';
    case 'open-close':
      return '#E0E0E0';
    case 'reference':
      return '#FFEB3B';
    case 'zone':
    case 'zone-bull':
      return '#4CAF50';
    case 'zone-bear':
      return '#F06292';
    default:
      return '#9E9E9E';
  }
}

function csvCell(value) {
  return String(value || '').replace(/,/g, ' ');
}

function displayLevelName(level) {
  const raw = csvCell(level?.name || 'Level');
  if (!raw) return 'Level';
  if (!/horizontal|liquidity\s*map|\btext\b|liq-map-history/i.test(raw)) return raw;
  const upper = raw.toUpperCase();
  const displayMatch = raw.match(/\b(BrZT\d*|BrZB\d*|BZT\d*|BZB\d*|OVNMHP|OVNHP|PrevDayClose|LastOpen|MidGap|HalfGap|HG|man_MHP|man_HP)\b/i);
  if (displayMatch) return normalizedDisplayMatch(displayMatch[1]);
  if (/\bOPEN\b/.test(upper) && !/\bCLOSE\b/.test(upper)) return 'Open';
  if (/\bCLOSE\b/.test(upper)) return 'Close';
  if (/\bMHP\b/.test(upper)) return 'MHP';
  if (/\bHP\b/.test(upper)) return 'HP';
  if (/\bDD\b/.test(upper)) return 'DD';
  return csvCell(raw
    .replace(/horizontal[_\s-]*(line|ray)?/ig, ' ')
    .replace(/\btext\b/ig, ' ')
    .replace(/\bLiquidity\s*Map\b/ig, ' ')
    .replace(/\bliq-map-history\b/ig, ' ')
    .replace(/\s*:\s*/g, ' ')) || 'Level';
}

function normalizedDisplayMatch(matchText) {
  const text = csvCell(matchText);
  if (/^man_mhp$/i.test(text)) return 'MHP';
  if (/^man_hp$/i.test(text)) return 'HP';
  if (/^midgap$/i.test(text) || /^halfgap$/i.test(text) || /^hg$/i.test(text)) return 'Mid Gap';
  if (/^lastopen$/i.test(text)) return 'Open';
  if (/^prevdayclose$/i.test(text)) return 'Prev Close';
  return text;
}
