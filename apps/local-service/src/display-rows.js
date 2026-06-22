export function levelsToDisplayRowsText(levels) {
  const rows = levels.map((level) => {
    const [r, g, b] = hexToRgb(level.color || kindColor(level.kind));
    return [
      csvCell(displayLevelName(level)),
      Number(level.price).toFixed(2),
      r,
      g,
      b,
      csvCell(level.kind || 'unknown')
    ].join(',');
  });
  return rows.length ? `${rows.join('\n')}\n` : '\n';
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
      return '#00BCD4';
    case 'hp':
      return '#2962FF';
    case 'mhp':
      return '#FF9800';
    case 'open-close':
      return '#FFFFFF';
    case 'reference':
      return '#FFEB3B';
    case 'yellow-line':
      return '#FFEB3B';
    case 'red-line':
      return '#F23645';
    case 'cat':
      return '#7E57C2';
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
  if (level?.kind === 'red-line') return 'Red Line';
  if (level?.kind === 'yellow-line') return 'Yellow Line';
  if (level?.kind === 'cat') return 'CAT';
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (/^RL\d*$/.test(compact) || compact.includes('REDLINE')) return 'Red Line';
  if (/^YL\d*$/.test(compact) || compact.includes('YELLOWLINE')) return 'Yellow Line';
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
