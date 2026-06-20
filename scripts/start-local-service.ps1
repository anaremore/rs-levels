$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $Root
try {
  & node "apps/local-service/src/cli.js" @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
