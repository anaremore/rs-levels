#!/usr/bin/env python3
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


def clean_base_url(value):
    return (value or 'http://127.0.0.1:8765').strip().rstrip('/')


def get_json(url):
    with urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode('utf-8'))


def print_snapshot(snapshot):
    symbols = snapshot.get('symbols', {})
    print(f"RS Levels {snapshot.get('schemaVersion', '')}".strip())
    print(f"source={snapshot.get('source', {}).get('state', 'unknown')} symbols={len(symbols)}")
    for symbol, row in symbols.items():
        stats = format_stats(row.get('stats', {}))
        suffix = f" {stats}" if stats else ""
        print(f"{display_symbol(symbol, row)}: {len(row.get('levels', []))} levels captured={row.get('capturedAt') or 'n/a'}{suffix}")


def print_symbol(row):
    print(f"{display_symbol(row.get('symbol'), row)}: {len(row.get('levels', []))} levels")
    stats = format_stats(row.get('stats', {}))
    if stats:
        print(stats)
    for level in row.get('levels', []):
        print(f"{level.get('name')}\t{level.get('kind')}\t{float(level.get('price')):.2f}")


def display_symbol(symbol, row=None):
    raw = str((row or {}).get('displaySymbol') or symbol or '').upper()
    if raw == 'MES':
        return 'ES'
    if raw == 'MNQ':
        return 'NQ'
    return raw or 'MES'


def format_stats(stats):
    parts = []
    append_metric(parts, 'DD', stats.get('dd'))
    append_metric(parts, 'Res', stats.get('resilience'))
    append_metric(parts, 'MRes', stats.get('monthlyResilience'))
    append_metric(parts, 'WRes', stats.get('weeklyResilience'))
    if stats.get('mapCode'):
        parts.append(f"Map={stats.get('mapCode')}")
    return ' '.join(parts)


def append_metric(parts, label, value):
    if value is None or value == '':
        return
    try:
        number = float(value)
    except (TypeError, ValueError):
        return
    parts.append(f"{label}={number:.2f}".rstrip('0').rstrip('.'))


def main():
    base_url = clean_base_url(os.environ.get('RS_LEVELS_URL') or (sys.argv[1] if len(sys.argv) > 1 else None))
    symbol = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get('RS_LEVELS_SYMBOL', '')).upper()
    path = f"/levels/{quote(symbol)}" if symbol else '/snapshot'
    try:
        data = get_json(f"{base_url}{path}")
    except HTTPError as exc:
        print(f"RS Levels API returned {exc.code}", file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"RS Levels API unavailable: {exc.reason}", file=sys.stderr)
        return 1
    if symbol:
        print_symbol(data)
    else:
        print_snapshot(data)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
