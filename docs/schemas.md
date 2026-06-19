# Schemas Draft

Schemas are intentionally display-oriented. They describe visible levels and source freshness, not trading decisions.

## Level

```json
{
  "name": "OVNHP",
  "symbol": "MES",
  "price": 7612.5,
  "kind": "hp",
  "color": "#2962ff",
  "source": "rocketscooter",
  "capturedAt": "2026-06-19T14:30:00.000Z"
}
```

## Symbol Snapshot

```json
{
  "symbol": "MES",
  "displaySymbol": "ES/MES",
  "price": 7610.25,
  "levels": [],
  "stats": {
    "dd": null,
    "resilience": null,
    "weeklyResilience": null,
    "monthlyResilience": null
  },
  "capturedAt": "2026-06-19T14:30:00.000Z"
}
```

## Source Freshness

```json
{
  "connected": true,
  "lastCaptureAt": "2026-06-19T14:30:00.000Z",
  "ageMs": 250,
  "warnings": []
}
```

