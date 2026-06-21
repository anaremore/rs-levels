# HTML Dashboard Example

Static browser dashboard for the RS Levels local API.

Open `index.html` in a browser, or serve this folder with any static file server. The dashboard defaults to:

```text
http://127.0.0.1:8765
```

It can:

- read `/snapshot`
- subscribe to `/stream`
- render per-symbol level rows
- copy TradingView paste payloads from `/tradingview/:symbol`

For Tailscale or another trusted private network, change the API field in the dashboard to the service URL you enabled in the local service.

This example is display-only.
