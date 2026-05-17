# Writes workers.json (UTF-8, no BOM) from ../.env — required field is spaceId, not workspaceId.
param(
  [string]$WorkerId,
  [string]$SpaceId
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

function Read-ParentEnvVar {
  param([string]$Name)
  $path = Join-Path (Split-Path $here -Parent) ".env"
  if (-not (Test-Path $path)) { return $null }
  foreach ($line in Get-Content $path) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

if (-not $WorkerId) {
  $WorkerId = Read-ParentEnvVar "NOTION_WORKER_ID"
}

if (-not $SpaceId) {
  $SpaceId = Read-ParentEnvVar "NOTION_WORKSPACE_ID"
}

if (-not $WorkerId) {
  Write-Error "Set NOTION_WORKER_ID in .env or pass -WorkerId (from: ntn workers list)."
}
if (-not $SpaceId) {
  Write-Error "Set NOTION_WORKSPACE_ID in .env or pass -SpaceId."
}

$json = (@{
  spaceId  = $SpaceId
  workerId = $WorkerId
} | ConvertTo-Json -Compress)

$outPath = Join-Path $here "workers.json"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outPath, $json, $utf8)

Write-Host "Wrote $outPath"
