#!/usr/bin/env python3
import json
import os
import sys
from urllib.error import URLError
from urllib.request import urlopen


def clean_base_url(value):
    return (value or 'http://127.0.0.1:8765').strip().rstrip('/')


def stream_events(url):
    with urlopen(url, timeout=30) as response:
        event = 'message'
        data_lines = []
        for raw in response:
            line = raw.decode('utf-8').rstrip('\r\n')
            if not line:
                if data_lines:
                    yield event, '\n'.join(data_lines)
                event = 'message'
                data_lines = []
                continue
            if line.startswith('event:'):
                event = line[6:].strip()
            elif line.startswith('data:'):
                data_lines.append(line[5:].strip())


def main():
    base_url = clean_base_url(os.environ.get('RS_LEVELS_URL') or (sys.argv[1] if len(sys.argv) > 1 else None))
    stream_url = f"{base_url}/stream"
    print(f"connected {stream_url}")
    try:
        for event, data in stream_events(stream_url):
            if event != 'snapshot' or not data:
                continue
            snapshot = json.loads(data)
            symbols = snapshot.get('symbols', {})
            level_count = sum(len(row.get('levels', [])) for row in symbols.values())
            print(f"{snapshot.get('generatedAt')} state={snapshot.get('source', {}).get('state', 'unknown')} symbols={len(symbols)} levels={level_count}")
    except URLError as exc:
        print(f"RS Levels stream unavailable: {exc.reason}", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())