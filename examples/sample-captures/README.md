# Sample Captures

Public-safe demo captures for local onboarding and smoke tests.

Start the local API in one terminal:

```powershell
npm start
```

Post the sample capture in another terminal:

```powershell
npm run demo:capture
```

The demo poster stamps the fixture with the current time so freshness checks and extension diagnostics behave like a new local capture.

Use a custom service URL:

```powershell
$env:RS_LEVELS_URL = "http://127.0.0.1:8765"
npm run demo:capture
```

The sample data is synthetic display-level data. It is not advice, user-specific data, broker data, or a redistribution of private captures.
