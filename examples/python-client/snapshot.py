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
        print(f"{symbol}: {len(row.get('levels', []))} levels captured={row.get('capturedAt') or 'n/a'}")


def print_symbol(row):
    print(f"{row.get('symbol')}: {len(row.get('levels', []))} levels")
    for level in row.get('levels', []):
        print(f"{level.get('name')}\t{level.get('kind')}\t{float(level.get('price')):.2f}")


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