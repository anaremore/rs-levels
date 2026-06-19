export function levelsToSierraText(levels) {
  return levels.map((level) => {
    const [r, g, b] = hexToRgb(level.color || '#FFFFFF');
    return [
      csvCell(level.name),
      Number(level.price).toFixed(2),
      r,
      g,
      b
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

function csvCell(value) {
  return String(value || '').replace(/,/g, ' ');
}

