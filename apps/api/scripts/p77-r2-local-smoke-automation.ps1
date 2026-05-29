# P7.7-r2 — one-shot local smoke: safe fallback / resultState / canonical shadow audit.
# Read-only DB steps; no MatchResult writes.
param(
  [string]$RepoRoot = "",
  [string]$DotenvPath = "",
  [int]$AuditLimit = 20,
  [string]$AuditOutput = "artifacts/p76/r7r2/canonical-writer-shadow-audit.json",
  [switch]$SkipDbAudit,
  [switch]$SkipHttpSmoke,
  [switch]$Pretty,
  [string]$ViewerUserId = "",
  [string]$BatchId = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApiRoot = Resolve-Path (Join-Path $ScriptDir "..")
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $ApiRoot "../..")).Path
} else {
  $RepoRoot = (Resolve-Path $RepoRoot).Path
}
if ([string]::IsNullOrWhiteSpace($DotenvPath)) {
  $DotenvPath = Join-Path $RepoRoot ".env"
}
$AuditOutputAbs = if ([System.IO.Path]::IsPathRooted($AuditOutput)) {
  $AuditOutput
} else {
  Join-Path $RepoRoot $AuditOutput
}
$SummaryDir = Join-Path $RepoRoot "artifacts/p76/r7r2"
$SummaryJson = Join-Path $SummaryDir "local-smoke-summary.json"
$SummaryMd = Join-Path $SummaryDir "local-smoke-summary.md"
$ArtifactCheckScript = Join-Path $ApiRoot "scripts/p77-r2-local-smoke-artifact-check.mjs"
$R9bScript = Join-Path $ApiRoot "scripts/p76-r9b-http-get-smoke.mjs"
$R6aRunner = Join-Path $ApiRoot "dist/dev-cli/p710-r6a-canonical-writer-shadow-audit-runner.js"

$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$steps = [System.Collections.Generic.List[object]]::new()
$overallPass = $true

function Add-Step {
  param(
    [string]$Name,
    [string]$Status,
    [int]$ExitCode = 0,
    [string]$Detail = ""
  )
  $script:steps.Add([ordered]@{
      name     = $Name
      status   = $Status
      exitCode = $ExitCode
      detail   = $Detail
    })
  if ($Status -eq "FAIL") { $script:overallPass = $false }
}

function Test-DatabaseUrlConfigured {
  if (-not (Test-Path $DotenvPath)) { return $false }
  $lines = Get-Content $DotenvPath -ErrorAction SilentlyContinue
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t -match '^\s*#' -or $t -eq "") { continue }
    if ($t -match '^\s*DATABASE_URL\s*=\s*\S+') { return $true }
  }
  return $false
}

function Invoke-Pnpm {
  param([string[]]$PnpmArgs)
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $RepoRoot
  try {
    & pnpm @PnpmArgs 2>&1 | Out-Host
  } finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
  }
  return [int]$LASTEXITCODE
}

Write-Host "P7.7-r2 local smoke automation"
Write-Host "  RepoRoot:    $RepoRoot"
Write-Host "  DotenvPath:  $DotenvPath"
Write-Host "  ApiRoot:     $ApiRoot"
Write-Host ""

# 1. API build
Write-Host "[1/5] pnpm --filter @peima/api run build ..."
$buildCode = Invoke-Pnpm @("--filter", "@peima/api", "run", "build")
if ($buildCode -ne 0) {
  Add-Step -Name "api_build" -Status "FAIL" -ExitCode $buildCode
} else {
  Add-Step -Name "api_build" -Status "PASS" -ExitCode 0
}

# 2. Jest regression pack
Write-Host "[2/5] Jest regression pack ..."
$testCode = Invoke-Pnpm @(
  "--filter", "@peima/api", "test", "--",
  "p77-r1", "result-state", "matching-result-state",
  "p710-r4a", "p710-r6", "p710-r6a",
  "p76-read-path-env", "p76-read-path-display-resolver"
)
if ($testCode -ne 0) {
  Add-Step -Name "jest_regression" -Status "FAIL" -ExitCode $testCode
} else {
  Add-Step -Name "jest_regression" -Status "PASS" -ExitCode 0
}

$hasDb = Test-DatabaseUrlConfigured

# 3. r9b HTTP smoke (contract mode)
if ($SkipHttpSmoke) {
  Add-Step -Name "r9b_http_smoke_contract" -Status "SKIPPED" -Detail "SkipHttpSmoke"
  Write-Host "[3/5] r9b HTTP smoke SKIPPED (SkipHttpSmoke)"
} elseif (-not $hasDb) {
  Add-Step -Name "r9b_http_smoke_contract" -Status "SKIPPED" -Detail "DATABASE_URL not in .env"
  Write-Host "[3/5] r9b HTTP smoke SKIPPED (no DATABASE_URL)"
} else {
  Write-Host "[3/5] r9b HTTP smoke (P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT=1) ..."
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $ApiRoot
  try {
    $prevContract = $env:P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT
    $env:P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT = "1"
    $env:DOTENV_CONFIG_PATH = $DotenvPath
    & node -r dotenv/config $R9bScript 2>&1 | Out-Host
    $r9bCode = [int]$LASTEXITCODE
    if ($null -ne $prevContract) { $env:P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT = $prevContract }
    else { Remove-Item Env:P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT -ErrorAction SilentlyContinue }
  } finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
  }
  if ($r9bCode -ne 0) {
    Add-Step -Name "r9b_http_smoke_contract" -Status "FAIL" -ExitCode $r9bCode
  } else {
    Add-Step -Name "r9b_http_smoke_contract" -Status "PASS" -ExitCode 0
  }
}

# 4. r6a canonical writer shadow audit
$auditMetrics = $null
if ($SkipDbAudit) {
  Add-Step -Name "r6a_shadow_audit" -Status "SKIPPED" -Detail "SkipDbAudit"
  Write-Host "[4/5] r6a shadow audit SKIPPED (SkipDbAudit)"
} elseif (-not $hasDb) {
  Add-Step -Name "r6a_shadow_audit" -Status "SKIPPED" -Detail "DATABASE_URL not in .env"
  Write-Host "[4/5] r6a shadow audit SKIPPED (no DATABASE_URL)"
} elseif (-not (Test-Path $R6aRunner)) {
  Add-Step -Name "r6a_shadow_audit" -Status "FAIL" -ExitCode 1 -Detail "missing dist runner; run build first"
  Write-Host "[4/5] r6a shadow audit FAIL (dist not built)"
} else {
  Write-Host "[4/5] r6a canonical writer shadow audit ..."
  $auditArgs = @(
    "--limit=$AuditLimit",
    "--output=$AuditOutputAbs"
  )
  if ($Pretty) { $auditArgs += "--pretty" }
  if ($ViewerUserId) { $auditArgs += "--viewerUserId=$ViewerUserId" }
  if ($BatchId) { $auditArgs += "--batchId=$BatchId" }

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $ApiRoot
  try {
    $env:DOTENV_CONFIG_PATH = $DotenvPath
    & node -r dotenv/config $R6aRunner @auditArgs 2>&1 | Out-Host
    $r6aCode = [int]$LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
  }
  if ($r6aCode -ne 0) {
    Add-Step -Name "r6a_shadow_audit" -Status "FAIL" -ExitCode $r6aCode
  } else {
    Add-Step -Name "r6a_shadow_audit" -Status "PASS" -ExitCode 0
  }
}

# 5. Artifact safety check
if ($SkipDbAudit -or -not (Test-Path $AuditOutputAbs)) {
  if (-not $SkipDbAudit -and $hasDb) {
    Add-Step -Name "artifact_safety_check" -Status "FAIL" -ExitCode 1 -Detail "audit file missing"
    Write-Host "[5/5] artifact check FAIL (file missing)"
  } else {
    Add-Step -Name "artifact_safety_check" -Status "SKIPPED" -Detail "no audit artifact"
    Write-Host "[5/5] artifact check SKIPPED"
  }
} else {
  Write-Host "[5/5] artifact safety check ..."
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location $ApiRoot
  try {
    $checkOut = & node $ArtifactCheckScript $AuditOutputAbs 2>&1
    $checkCode = [int]$LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
  }
  if ($checkCode -ne 0) {
    Add-Step -Name "artifact_safety_check" -Status "FAIL" -ExitCode $checkCode -Detail ($checkOut -join " ")
  } else {
    try {
      $auditMetrics = $checkOut | ConvertFrom-Json
    } catch {
      $auditMetrics = $null
    }
    Add-Step -Name "artifact_safety_check" -Status "PASS" -ExitCode 0
  }
}

$finishedAt = (Get-Date).ToUniversalTime().ToString("o")
$statusToken = if ($overallPass) { "P7_7_R2_LOCAL_SMOKE_AUTOMATION_PASS" } else { "P7_7_R2_LOCAL_SMOKE_AUTOMATION_FAIL" }

$summary = [ordered]@{
  schemaVersion  = 1
  sourceType     = "p77_r2_local_smoke_automation"
  sourceVersion  = "p7.7-r2-local-smoke-automation-v1"
  startedAt      = $startedAt
  finishedAt     = $finishedAt
  status         = $statusToken
  overallPass    = $overallPass
  repoRoot       = $RepoRoot
  dotenvPath     = $DotenvPath
  auditOutput    = $AuditOutputAbs
  steps          = $steps
  auditMetrics   = $auditMetrics
}

New-Item -ItemType Directory -Force -Path $SummaryDir | Out-Null
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $SummaryJson -Encoding utf8

$md = @"
# P7.7-r2 — Local Smoke Automation Summary

## Status

``````text
$statusToken
``````

- startedAt: $startedAt
- finishedAt: $finishedAt
- overallPass: $overallPass

## Steps

| Step | Status | Exit | Detail |
|------|--------|------|--------|
"@

foreach ($s in $steps) {
  $md += "| $($s.name) | $($s.status) | $($s.exitCode) | $($s.detail) |`n"
}

if ($auditMetrics) {
  $md += @"

## Canonical shadow audit metrics

| Metric | Value |
|--------|-------|
| totalRows | $($auditMetrics.totalRows) |
| eligibleCount | $($auditMetrics.eligibleCount) |
| blockedCount | $($auditMetrics.blockedCount) |
| wouldChangeCandidateCount | $($auditMetrics.wouldChangeCandidateCount) |
| appliedToMatchResultCount | $($auditMetrics.appliedToMatchResultCount) |

Artifact: ``$AuditOutputAbs``

## Notes

- DB steps use ``DOTENV_CONFIG_PATH`` + ``node -r dotenv/config`` (Windows-friendly).
- r9b sets ``P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT=1``.
- No MatchResult / matchInsights writes in this automation.
"@
}

$md | Set-Content -Path $SummaryMd -Encoding utf8

Write-Host ""
Write-Host $statusToken
Write-Host "  Summary: $SummaryJson"
Write-Host "  Markdown: $SummaryMd"

if (-not $overallPass) { exit 1 }
exit 0
