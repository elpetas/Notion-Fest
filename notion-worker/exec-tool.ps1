# Invoke one worker tool by name (JSON via stdin - safe on Windows PowerShell).
# Usage:
#   .\exec-tool.ps1 -Tool sayHello -Payload @{ name = "Johan" }
#   .\exec-tool.ps1 -Tool planFestivalCalendar -Payload @{}
# Auto-discovers the first worker in your workspace (no .env config needed).

param(
  [Parameter(Mandatory = $true)]
  [string]$Tool,
  [hashtable]$Payload = @{},
  [string]$WorkerId
)

# Auto-discover the first worker if no WorkerId provided
if (-not $WorkerId) {
  Write-Host "Discovering workers..."
  $listOutput = & "$PSScriptRoot\ntn.ps1" workers list 2>&1 | Out-String
  
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to list workers. Make sure you're authenticated."
    exit $LASTEXITCODE
  }
  
  # Parse the output: skip header line, grab first worker ID
  $lines = $listOutput -split "`n" | Where-Object { $_.Trim() -ne "" }
  if ($lines.Count -lt 2) {
    Write-Error "No workers found. Run 'ntn workers deploy' first."
    exit 1
  }
  
  # First line is header, second line is first worker
  $firstWorkerLine = $lines[1]
  if ($firstWorkerLine -match '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') {
    $WorkerId = $Matches[1]
    Write-Host "Auto-discovered worker: $($WorkerId.Substring(0, 8))..."
  } else {
    Write-Error "Could not parse worker ID from output"
    exit 1
  }
}

if ($WorkerId) {
  & "$PSScriptRoot\ntn.ps1" workers exec $Tool -Json $Payload -WorkerId $WorkerId
} else {
  & "$PSScriptRoot\ntn.ps1" workers exec $Tool -Json $Payload
}
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
