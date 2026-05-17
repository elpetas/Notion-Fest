# Run ntn inside Docker from Windows PowerShell.
# Usage:
#   .\ntn.ps1 workers list
#   .\ntn.ps1 workers exec sayHello -Json @{ name = "Johan" }
#   .\exec-tool.ps1 -Tool sayHello -Payload @{ name = "Johan" }

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [object[]]$CommandLine = @()
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

# PowerShell binds "workers" to [hashtable]$Json if that param is declared — parse manually.
$Json = $null
$WorkerId = $null
$parsedArgs = [System.Collections.Generic.List[string]]::new()

$i = 0
while ($i -lt $CommandLine.Count) {
  $token = $CommandLine[$i]
  if ($token -is [hashtable]) {
    $Json = $token
    $i++
    continue
  }
  $s = [string]$token
  if ($s -eq "-Json") {
    if ($i + 1 -ge $CommandLine.Count) {
      throw "-Json requires a hashtable, e.g. -Json @{ name = 'Johan' }"
    }
    $next = $CommandLine[$i + 1]
    if ($next -isnot [hashtable]) {
      throw "-Json must be followed by a hashtable"
    }
    $Json = $next
    $i += 2
    continue
  }
  if ($s -eq "-WorkerId") {
    if ($i + 1 -ge $CommandLine.Count) {
      throw "-WorkerId requires a worker UUID"
    }
    $WorkerId = [string]$CommandLine[$i + 1]
    $i += 2
    continue
  }
  $parsedArgs.Add($s)
  $i++
}

$NtnArgs = [string[]]$parsedArgs.ToArray()

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is not installed or not on PATH. Install Docker Desktop for Windows."
}

$envFile = Join-Path (Split-Path $here -Parent) ".env"
if (-not (Test-Path $envFile)) {
  Write-Warning "Missing $envFile. Copy .env.local.example to .env and set NOTION_API_TOKEN and NOTION_WORKSPACE_ID."
}

function Read-ParentEnvVar {
  param([string]$Name)
  $path = Join-Path (Split-Path $here -Parent) ".env"
  if (-not (Test-Path $path)) {
    return $null
  }
  foreach ($line in Get-Content $path) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

function Get-ConfiguredWorkerId {
  param([string]$OverrideId)

  $uuidRe = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  if ($OverrideId -and $OverrideId -match $uuidRe) {
    return $OverrideId
  }

  $fromEnv = Read-ParentEnvVar -Name "NOTION_WORKER_ID"
  if ($fromEnv -and $fromEnv -match $uuidRe) {
    return $fromEnv
  }

  $cfgPath = Join-Path $here "workers.json"
  if (-not (Test-Path $cfgPath)) {
    return $null
  }
  try {
    $cfg = Get-Content -Raw $cfgPath | ConvertFrom-Json
    $id = [string]$cfg.workerId
    if ($id -match $uuidRe) {
      return $id
    }
    return $null
  } catch {
    return $null
  }
}

function Invoke-NtnDocker {
  param([string[]]$NtnCliArgs)

  & docker compose run --rm ntn @NtnCliArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Error "ntn exited with code $LASTEXITCODE"
  }
}

function Invoke-WorkerExec {
  param(
    [string]$Tool,
    [string]$JsonBody,
    [string[]]$SuffixArgs = @()
  )

  $id = Get-ConfiguredWorkerId -OverrideId $WorkerId

  # JSON via stdin (-T). Do not pipe into "docker @splat" — PowerShell reorders args.
  if ($id -and $SuffixArgs -and $SuffixArgs.Count -gt 0) {
    $JsonBody | docker compose run --rm -T ntn workers exec $Tool --worker-id $id @SuffixArgs
  } elseif ($id) {
    $JsonBody | docker compose run --rm -T ntn workers exec $Tool --worker-id $id
  } elseif ($SuffixArgs -and $SuffixArgs.Count -gt 0) {
    $JsonBody | docker compose run --rm -T ntn workers exec $Tool @SuffixArgs
  } else {
    $JsonBody | docker compose run --rm -T ntn workers exec $Tool
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Error "ntn exited with code $LASTEXITCODE"
  }
}

Push-Location $here
try {
  if ($Json -and ($NtnArgs -contains "exec")) {
    $execIdx = [array]::IndexOf($NtnArgs, "exec")
    $tool = $NtnArgs[$execIdx + 1]
    $suffix = [string[]]@()
    if ($execIdx + 2 -lt $NtnArgs.Count) {
      $suffix = [string[]]$NtnArgs[($execIdx + 2)..($NtnArgs.Count - 1)]
    }
    $body = $Json | ConvertTo-Json -Compress
    Invoke-WorkerExec -Tool $tool -JsonBody $body -SuffixArgs $suffix
    exit $LASTEXITCODE
  }

  if ($NtnArgs.Count -eq 0) {
    Invoke-NtnDocker -NtnCliArgs @("workers", "--help")
    exit $LASTEXITCODE
  }

  $execIdx = [array]::IndexOf($NtnArgs, "exec")
  if ($execIdx -ge 0 -and $execIdx + 1 -lt $NtnArgs.Count) {
    $tool = $NtnArgs[$execIdx + 1]
    $dataIdx = -1
    for ($j = $execIdx + 2; $j -lt $NtnArgs.Count; $j++) {
      if ($NtnArgs[$j] -in "-d", "--data") {
        $dataIdx = $j
        break
      }
    }
    if ($dataIdx -ge 0 -and $dataIdx + 1 -lt $NtnArgs.Count) {
      $suffix = [string[]]@()
      if ($dataIdx + 2 -lt $NtnArgs.Count) {
        $suffix = [string[]]$NtnArgs[($dataIdx + 2)..($NtnArgs.Count - 1)]
      }
      Invoke-WorkerExec -Tool $tool -JsonBody $NtnArgs[$dataIdx + 1] -SuffixArgs $suffix
      exit $LASTEXITCODE
    }
  }

  Invoke-NtnDocker -NtnCliArgs $NtnArgs
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
