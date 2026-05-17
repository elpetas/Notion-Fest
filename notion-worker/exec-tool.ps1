# Invoke one worker tool by name (JSON via stdin - safe on Windows PowerShell).
# Usage:
#   .\exec-tool.ps1 -Tool sayHello -Payload @{ name = "Johan" }
#   .\exec-tool.ps1 -Tool planFestivalCalendar  # Demo mode - auto-populates defaults!
#   .\exec-tool.ps1 -Tool planFestivalCalendar -Payload @{ writeToNotion = "true" }
# Auto-discovers the first worker in your workspace (no .env config needed).

param(
  [Parameter(Mandatory = $true)]
  [string]$Tool,
  [hashtable]$Payload = @{},
  [string]$WorkerId
)

# Auto-populate demo-friendly defaults for planFestivalCalendar
if ($Tool -eq "planFestivalCalendar") {
  $defaults = @{
    writeToNotion = "false"
    weeksBefore = "4"
    weeksAfter = "1"
  }
  
  # Merge user payload with defaults (user values take precedence)
  foreach ($key in $defaults.Keys) {
    if (-not $Payload.ContainsKey($key)) {
      $Payload[$key] = $defaults[$key]
    }
  }
  
  Write-Host "planFestivalCalendar payload:"
  Write-Host "  writeToNotion = $($Payload.writeToNotion)"
  Write-Host "  weeksBefore = $($Payload.weeksBefore)"
  Write-Host "  weeksAfter = $($Payload.weeksAfter)"
  Write-Host ""
}

# Auto-discover the first worker if no WorkerId provided
if (-not $WorkerId) {
  Write-Host "Discovering workers..."
  $listOutput = & "$PSScriptRoot\ntn.ps1" workers list 2>&1
  
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to list workers. Make sure you're authenticated."
    exit $LASTEXITCODE
  }
  
  # Parse the output: look for lines starting with a UUID pattern
  $workerIdPattern = '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
  $foundWorkerId = $null
  
  foreach ($line in $listOutput) {
    if ($line -match $workerIdPattern) {
      $foundWorkerId = $Matches[1]
      break
    }
  }
  
  if ($foundWorkerId) {
    $WorkerId = $foundWorkerId
    Write-Host "Auto-discovered worker: $($WorkerId.Substring(0, 8))..."
  } else {
    Write-Error "No workers found. Run 'ntn workers deploy' first."
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
