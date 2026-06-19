# Install

RS Levels is in early development. The current developer flow works on Windows, macOS, and Linux with Node.js 20 or newer.

## Clone

```powershell
git clone git@github.com:anaremore/rs-levels.git
cd rs-levels
```

## Run Tests

```powershell
npm test
npm run scan:private
npm run scan:secrets
```

## Start The Local Service

```powershell
npm start
```

Default URL:

```text
http://127.0.0.1:8765
```

Check health:

```powershell
curl http://127.0.0.1:8765/health
```

## Trusted Private Network Use

Loopback is the default. For Tailscale or another trusted private network, intentionally opt in:

```powershell
$env:RS_LEVELS_HOST = "0.0.0.0"
$env:RS_LEVELS_ALLOW_REMOTE = "1"
npm start
```

On macOS/Linux:

```bash
RS_LEVELS_HOST=0.0.0.0 RS_LEVELS_ALLOW_REMOTE=1 npm start
```

Only use remote binding on networks you trust. The browser extension should continue to default to localhost unless the user explicitly changes the service URL.

## Browser Extension

The browser extension is not packaged yet. The first extension milestone will be an unpacked Manifest V3 build that posts allowlisted RocketScooter responses to `/capture/api` and shows local service status.

## Platform Plugins

Plugins are display-only and will consume the read-only API. TradingView is handled differently because Pine scripts cannot call arbitrary localhost HTTP; see [platform plugins](platform-plugins.md).