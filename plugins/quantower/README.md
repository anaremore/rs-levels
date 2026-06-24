# Quantower Plugin

Display-only Quantower indicators for drawing RS Levels overlays and VARIS Zones from the local API.

## Status

Initial Quantower indicator sources are included at:

- `RSLevelsDisplayQuantower.cs` for horizontal RS Levels overlays.
- `VARISZonesQuantower.cs` for VWAP-centered VARIS Zones using captured `RI`.

`RSLevels.csproj` is a portable build scaffold for both indicators. Keep both indicator classes in one project/DLL so users can add RS Levels Display and VARIS Zones Quantower from the same Quantower Scripts indicator package.


## API Path

```text
GET /status
GET /levels/:symbol?format=rows
GET /stats/:symbol?format=rows
```

The indicator uses generic text row feeds to keep parsing simple inside Quantower. `/levels/:symbol?format=rows` provides horizontal display levels. `/stats/:symbol?format=rows` provides chart-corner display context such as `DD`, `Res`, `MRes`, `WRes`, and `Map`. `/status` provides source freshness.

`VARISZonesQuantower.cs` polls `/status` and `/stats/:symbol?format=rows`, reads the `RI` row, then computes VWAP, half-RI bands, and full-RI bands from local chart bars. It falls back to a manual risk interval input when captured `RI` is unavailable.

## Build

Build from the repository root or from `plugins/quantower` with your installed Quantower root/version:

```powershell
dotnet build .\plugins\quantower\RSLevels.csproj `
  -c Release `
  -p:QuantowerRoot=D:\Quantower `
  -p:QuantowerVersion=v1.146.13
```

To build and place the DLL directly in Quantower's Scripts indicators folder, also pass `QuantowerScriptsDir`:

```powershell
dotnet build .\plugins\quantower\RSLevels.csproj `
  -c Release `
  -p:QuantowerRoot=D:\Quantower `
  -p:QuantowerVersion=v1.146.13 `
  -p:QuantowerScriptsDir=D:\Quantower\Settings\Scripts\Indicators
```

That command writes the DLL into:

```text
D:\Quantower\Settings\Scripts\Indicators\RSLevels\RSLevels.dll
```

The project targets the .NET runtime used by current Quantower builds and references `System.Drawing.Common` for chart painting. If Quantower updates its TradingPlatform runtime path, pass the matching `-p:QuantowerVersion=...` value.

## Indicator Settings

- service URL, default `http://127.0.0.1:8765`
- symbol override, optional
- refresh interval, default 1000 ms
- stale threshold, default 23 hours
- label visibility
- zone fill visibility
- zone fill opacity
- label vertical offset
- line width

`VARIS Zones Quantower` adds:

- manual Risk Interval fallback
- use captured `RI` when available
- Status panel bottom offset pixels, default 44, so the VARIS status does not overlap the RS Levels status when both indicators are on one chart
- show/hide VWAP, half-RI bands, full-RI bands, fills, and status
- fill opacity

## Install

1. Install a .NET SDK compatible with the Quantower build you are targeting.
2. Build `plugins/quantower/RSLevels.csproj` with `QuantowerRoot` and `QuantowerVersion` pointing at your local Quantower install.
3. Pass `QuantowerScriptsDir` when you want the build to install directly into Quantower's Scripts indicators folder; otherwise copy the output DLL manually.
4. Restart Quantower or reload Scripts after the DLL changes.
5. Add **RS Levels Display** and, optionally, **VARIS Zones Quantower** to a chart.
6. Set the service URL only when you intentionally use a trusted private-network/Tailscale URL instead of `http://127.0.0.1:8765`.
7. Leave symbol override on Auto unless the chart symbol cannot be detected.

If the settings panel only shows generic **VIEW**, **LINE1 DATA SERIES**, or **TIMEFRAME VISIBILITY** sections, Quantower loaded a generated template indicator rather than the repo's `RSLevelsDisplayQuantower` or `VARISZonesQuantower` class. Rebuild from `RSLevels.csproj` and add the named indicator class again. The VARIS Zones concept is credited to RocketScooter community member `IAmTheLiquidity2`.

## Rendering Plan

- Poll the local API from a timer that does not block chart rendering.
- Cache the latest symbol snapshot in memory.
- Draw horizontal overlays in the chart paint routine, including yellow-line, red-line, and CAT manual-line kinds from the row feed.
- Preserve multiple yellow-line and red-line rows when RocketScooter exposes several manual lines at different prices.
- Fill matched bull and bear zone top/bottom pairs with low-opacity zone color.
- Offset labels above or below the line to avoid struck-through text.
- Render DD/Res/MRes/WRes/Map context in the chart corner when available.
- Render a small freshness marker for waiting, stale, and offline states.

## Safety Boundary

This plugin must be display-only. It must not call Quantower trading, position, account, order, cancellation, or flatten APIs.

Static test coverage in `plugins/test/plugin-docs.test.cjs` checks the included source for display endpoints and blocks common Quantower trade/account API terms. The source paints chart lines, labels, and a status marker only.
