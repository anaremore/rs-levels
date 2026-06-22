const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const platforms = ['sierra-chart', 'ninjatrader', 'quantower', 'bookmap', 'tradingview'];
const pluginIds = [
  'sierra-chart',
  'sierra-chart-varis-zones',
  'ninjatrader',
  'ninjatrader-varis-zones',
  'quantower',
  'quantower-varis-zones',
  'bookmap',
  'bookmap-varis-zones',
  'tradingview',
  'tradingview-varis-zones'
];
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const validationDoc = readFileSync(join(root, '..', 'docs', 'platform-validation.md'), 'utf8');

assert.equal(manifest.schemaVersion, '0.1.0');
assert.deepEqual(manifest.plugins.map((plugin) => plugin.id).sort(), [...pluginIds].sort());

for (const plugin of manifest.plugins) {
  assert.equal(plugin.displayOnly, true, `${plugin.id} must be display-only`);
  assert.ok(existsSync(join(root, '..', plugin.entry)), `${plugin.id} entry file must exist`);
  assert.ok(existsSync(join(root, '..', plugin.readme)), `${plugin.id} readme must exist`);
  assert.ok(validationDoc.includes(plugin.entry), `${plugin.id} must appear in platform validation`);
  assert.ok(Array.isArray(plugin.api.endpoints) && plugin.api.endpoints.length > 0, `${plugin.id} must list API endpoints`);
  if (plugin.platform === 'TradingView') {
    assert.equal(plugin.api.mode, 'manual-paste');
    assert.ok(plugin.api.endpoints.includes('GET /tradingview'));
    assert.ok(plugin.api.endpoints.some((endpoint) => endpoint.includes('/tradingview/:symbol')));
  } else {
    assert.equal(plugin.api.mode, 'local-http');
    if (plugin.platform === 'Sierra Chart') {
      assert.ok(plugin.api.endpoints.includes('GET /sierra/:symbol'));
    } else {
      assert.ok(plugin.api.endpoints.includes('GET /status'), `${plugin.id} must poll status`);
      if (!plugin.id.includes('varis-zones'))
        assert.ok(plugin.api.endpoints.some((endpoint) => endpoint.includes('/levels/:symbol')), `${plugin.id} must poll symbol levels`);
      assert.ok(plugin.api.endpoints.some((endpoint) => endpoint.includes('/stats/:symbol')), `${plugin.id} must poll symbol stats`);
    }
  }
}

assert.match(validationDoc, /npm run scan:private/);
assert.match(validationDoc, /npm run scan:secrets/);
assert.match(validationDoc, /IAmTheLiquidity2/);
assert.match(validationDoc, /Copy TradingView/);
assert.match(validationDoc, /\/stats\/ES\?format=rows/);

for (const platform of platforms) {
  const text = readFileSync(join(root, platform, 'README.md'), 'utf8');
  assert.match(text, /display-only/i, `${platform} must state display-only boundary`);
  assert.match(text, /Safety Boundary/i, `${platform} must include a safety boundary`);
  if (platform !== 'tradingview') {
    if (platform === 'sierra-chart') {
      assert.match(text, /GET \/sierra\//, `${platform} must document Sierra feed polling`);
    } else {
      assert.match(text, /GET \/status/, `${platform} must document status polling`);
      assert.match(text, /GET \/levels\//, `${platform} must document levels polling`);
      assert.match(text, /GET \/stats\//, `${platform} must document stats polling`);
    }
    assert.match(text, /stale/i, `${platform} must document stale handling`);
  } else {
    assert.match(text, /RSLEVELS\|2/, 'tradingview must document the short paste payload');
  }
}

const contract = readFileSync(join(root, '..', 'docs', 'plugin-contract.md'), 'utf8');
assert.match(contract, /GET \/levels\/:symbol/);
assert.match(contract, /GET \/stats\/:symbol/);
assert.match(contract, /Freshness Rules/);
assert.match(contract, /Safety Tests/);
assert.match(contract, /name,price,red,green,blue,kind/);
assert.match(contract, /Other levels/);
assertManualKinds(contract);

const sierraSource = readFileSync(join(root, 'sierra-chart', 'rs-levels-sierra.cpp'), 'utf8');
assert.match(sierraSource, /SCSFExport scsf_RSLevelsDisplay/);
assert.match(sierraSource, /\/sierra\/%s/);
assert.match(sierraSource, /STATE/);
assert.match(sierraSource, /FindFeedSourceState/);
assert.doesNotMatch(sierraSource, /ParseLevelsJson/);
assert.doesNotMatch(sierraSource, /FormatStatsJson/);
assert.doesNotMatch(sierraSource, /JsonStringField/);
assert.match(sierraSource, /DrawStats/);
assert.match(sierraSource, /DRAWING_LINE/);
assert.match(sierraSource, /DRAWING_RECTANGLEHIGHLIGHT/);
assert.match(sierraSource, /RS_MAX_LEVELS = 500/);
assert.match(sierraSource, /fields\.size\(\) >= 6/);
assert.match(sierraSource, /Label offset ticks/);
assert.match(sierraSource, /Show labels/);
assert.match(sierraSource, /DD band color/);
assert.match(sierraSource, /HP color/);
assert.match(sierraSource, /MHP color/);
assert.match(sierraSource, /CAT color/);
assert.match(sierraSource, /Bull zone color/);
assert.match(sierraSource, /Bear zone color/);
assert.match(sierraSource, /LevelColor/);
assert.match(sierraSource, /HTTP timeout/);
assert.match(sierraSource, /RS_SIERRA_BUILD/);
assert.match(sierraSource, /Show debug status/);
assert.match(sierraSource, /ShowDebugStatus\.SetYesNo\(0\)/);
assert.match(sierraSource, /DrawDebug/);
assert.match(sierraSource, /ResponseShape/);
assert.match(sierraSource, /parsed=%d/);
assert.match(sierraSource, /zone-bull/);
assert.match(sierraSource, /zone-bear/);
assert.doesNotMatch(sierraSource, /std::(?:min|max)\s*\(/, 'Sierra headers define min/max macros, so avoid std::min/std::max call syntax');
assertManualKinds(sierraSource);
assertNoPlatformApiTerms(sierraSource);

const sierraVarisSource = readFileSync(join(root, 'sierra-chart', 'varis-zones-sierra.cpp'), 'utf8');
assert.match(sierraVarisSource, /SCSFExport scsf_VARISZones/);
assert.match(sierraVarisSource, /IAmTheLiquidity2/);
assert.match(sierraVarisSource, /\/sierra\/%s/);
assert.match(sierraVarisSource, /FindRiskInterval/);
assert.match(sierraVarisSource, /Upper Half RI/);
assert.match(sierraVarisSource, /Lower Full RI/);
assert.match(sierraVarisSource, /cumulativeTpv/);
assert.match(sierraVarisSource, /sc\.Volume\[i\]/);
assert.match(sierraVarisSource, /Session reset hour ET/);
assert.match(sierraVarisSource, /VARIS_BUILD/);
assertNoPlatformApiTerms(sierraVarisSource);

const ninjaSource = readFileSync(join(root, 'ninjatrader', 'RSLevelsDisplay.cs'), 'utf8');
assert.match(ninjaSource, /class RSLevelsDisplay : Indicator/);
assert.match(ninjaSource, /\/status/);
assert.match(ninjaSource, /format=rows/);
assert.match(ninjaSource, /\/stats\//);
assert.match(ninjaSource, /ParseStats/);
assert.match(ninjaSource, /FormatStats/);
assert.match(ninjaSource, /Draw\.HorizontalLine/);
assert.match(ninjaSource, /Draw\.Rectangle/);
assert.match(ninjaSource, /Draw\.TextFixed/);
assert.match(ninjaSource, /MaxLevels = 500/);
assert.match(ninjaSource, /ShowZoneFills/);
assert.match(ninjaSource, /ZoneFillOpacity/);
assert.match(ninjaSource, /LabelOffsetTicks/);
assert.match(ninjaSource, /string kind = parts\.Length >= 6/);
assert.match(ninjaSource, /Kind = kind/);
assert.match(ninjaSource, /zone-bull/);
assert.match(ninjaSource, /zone-bear/);
assert.doesNotMatch(ninjaSource, /DashStyleHelper/);
assertManualKinds(ninjaSource);
assertNoPlatformApiTerms(ninjaSource);

const ninjaVarisSource = readFileSync(join(root, 'ninjatrader', 'VARISZones.cs'), 'utf8');
assert.match(ninjaVarisSource, /class VARISZones : Indicator/);
assert.match(ninjaVarisSource, /IAmTheLiquidity2/);
assert.match(ninjaVarisSource, /\/stats\//);
assert.match(ninjaVarisSource, /ParseRiskInterval/);
assert.match(ninjaVarisSource, /AddPlot\(Brushes\.Red, "VWAP"\)/);
assert.match(ninjaVarisSource, /Upper Half RI/);
assert.match(ninjaVarisSource, /Values\[0\]\[0\]/);
assert.match(ninjaVarisSource, /Volume\[0\]/);
assert.match(ninjaVarisSource, /TimeZoneInfo/);
assert.match(ninjaVarisSource, /ManualRiskInterval/);
assertNoPlatformApiTerms(ninjaVarisSource);

const quantowerSource = readFileSync(join(root, 'quantower', 'RSLevelsDisplayQuantower.cs'), 'utf8');
assert.match(quantowerSource, /class RSLevelsDisplayQuantower : Indicator/);
assert.match(quantowerSource, /\/status/);
assert.match(quantowerSource, /format=rows/);
assert.match(quantowerSource, /\/stats\//);
assert.match(quantowerSource, /ParseStats/);
assert.match(quantowerSource, /DrawStats/);
assert.match(quantowerSource, /OnPaintChart/);
assert.match(quantowerSource, /DrawLine/);
assert.match(quantowerSource, /DrawZoneFills/);
assert.match(quantowerSource, /FillRectangle/);
assert.match(quantowerSource, /MaxLevels = 500/);
assert.match(quantowerSource, /ShowZoneFills/);
assert.match(quantowerSource, /ZoneFillOpacity/);
assert.match(quantowerSource, /LabelVerticalOffsetPixels/);
assert.match(quantowerSource, /string kind = parts\.Length >= 6/);
assert.match(quantowerSource, /Kind = kind/);
assert.match(quantowerSource, /zone-bull/);
assert.match(quantowerSource, /zone-bear/);
assertManualKinds(quantowerSource);
assertNoPlatformApiTerms(quantowerSource);

const quantowerVarisSource = readFileSync(join(root, 'quantower', 'VARISZonesQuantower.cs'), 'utf8');
assert.match(quantowerVarisSource, /class VARISZonesQuantower : Indicator/);
assert.match(quantowerVarisSource, /\/stats\//);
assert.match(quantowerVarisSource, /ParseRiskInterval/);
assert.match(quantowerVarisSource, /AddLineSeries\("VWAP"/);
assert.match(quantowerVarisSource, /Upper Half RI/);
assert.match(quantowerVarisSource, /this\.Volume\(\)/);
assert.match(quantowerVarisSource, /this\.Time\(\)/);
assert.match(quantowerVarisSource, /BeginCloud/);
assert.match(quantowerVarisSource, /ManualRiskInterval/);
assertNoPlatformApiTerms(quantowerVarisSource);

const bookmapSource = readFileSync(join(root, 'bookmap', 'src', 'main', 'java', 'com', 'rslevels', 'bookmap', 'RSLevelsDisplayBookmap.java'), 'utf8');
assert.match(bookmapSource, /class RSLevelsDisplayBookmap implements CustomModule/);
assert.match(bookmapSource, /\/status/);
assert.match(bookmapSource, /format=rows/);
assert.match(bookmapSource, /\/stats\//);
assert.match(bookmapSource, /formatStatsSummary/);
assert.match(bookmapSource, /setHorizontalValueLinesInfo/);
assert.match(bookmapSource, /MAX_LEVELS = 500/);
assert.match(bookmapSource, /parts\.length >= 6/);
assert.match(bookmapSource, /COLOR_PINK/);
assert.match(bookmapSource, /new Color\(0, 188, 212\)/);
assert.match(bookmapSource, /new Color\(255, 255, 255\)/);
assert.match(bookmapSource, /zone-bull/);
assert.match(bookmapSource, /zone-bear/);
assertManualKinds(bookmapSource);
assertNoPlatformApiTerms(bookmapSource);

const bookmapVarisSource = readFileSync(join(root, 'bookmap', 'src', 'main', 'java', 'com', 'rslevels', 'bookmap', 'VARISZonesBookmap.java'), 'utf8');
assert.match(bookmapVarisSource, /class VARISZonesBookmap implements CustomModule, BarDataListener/);
assert.match(bookmapVarisSource, /IAmTheLiquidity2/);
assert.match(bookmapVarisSource, /\/stats\//);
assert.match(bookmapVarisSource, /parseRiskInterval/);
assert.match(bookmapVarisSource, /registerLine\("VARIS VWAP"/);
assert.match(bookmapVarisSource, /api\.registerIndicator\(name/);
assert.match(bookmapVarisSource, /Intervals\.INTERVAL_1_MINUTE/);
assert.match(bookmapVarisSource, /bar\.getVwap\(\)/);
assert.match(bookmapVarisSource, /bar\.getVolumeTotal\(\)/);
assert.match(bookmapVarisSource, /currentEasternSessionKey/);
assert.match(bookmapVarisSource, /manualRiskInterval/);
assertNoPlatformApiTerms(bookmapVarisSource);

const tradingViewSource = readFileSync(join(root, 'tradingview', 'rs-levels.pine'), 'utf8');
assert.match(tradingViewSource, /^indicator\(/m);
assertManualKinds(tradingViewSource);
assert.doesNotMatch(tradingViewSource, /\bstrategy\s*\(/i);
assert.doesNotMatch(tradingViewSource, /\bstrategy\./i);
assert.doesNotMatch(tradingViewSource, /\balertcondition\s*\(/i);

const varisTradingViewSource = readFileSync(join(root, 'tradingview', 'varis-zones.pine'), 'utf8');
assert.match(varisTradingViewSource, /indicator\("VARIS Zones"/);
assert.match(varisTradingViewSource, /IAmTheLiquidity2/);
assert.match(varisTradingViewSource, /RSLEVELS/);
assert.match(varisTradingViewSource, /statValue\(levelText, "RI"\)/);
assert.doesNotMatch(varisTradingViewSource, /\bstrategy\s*\(/i);
assert.doesNotMatch(varisTradingViewSource, /\bstrategy\./i);
assert.doesNotMatch(varisTradingViewSource, /\balertcondition\s*\(/i);
assert.doesNotMatch(varisTradingViewSource, /\brequest\./i);

console.log('plugin documentation tests passed');

function assertManualKinds(source) {
  assert.match(source, /yellow-line/);
  assert.match(source, /red-line/);
  assert.match(source, /cat/);
}

function assertNoPlatformApiTerms(source) {
  for (const term of [
    'ord' + 'er',
    'acc' + 'ount',
    'flat' + 'ten',
    'can' + 'cel',
    'exec' + 'ution',
    'strat' + 'egy'
  ]) {
    assert.doesNotMatch(source, new RegExp('\\b' + term + '\\b', 'i'));
  }
}
