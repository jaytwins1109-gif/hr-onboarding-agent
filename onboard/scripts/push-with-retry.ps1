param(
  [int]$MaxAttempts = 5,
  [string]$Remote = 'origin',
  [string]$Branch = 'HEAD'
)

$ErrorActionPreference = 'Stop'

# 脚本位于 <仓库根>/onboard/scripts/，从自身位置反推仓库根，换台电脑也不用改路径。
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  Write-Output "Repo: $repoRoot"
  Write-Output "Pushing $Remote/$Branch, max $MaxAttempts attempts..."

  for ($i = 1; $i -le $MaxAttempts; $i++) {
    Write-Output "--- attempt $i / $MaxAttempts ---"
    git push $Remote $Branch

    if ($LASTEXITCODE -eq 0) {
      Write-Output "Push succeeded on attempt $i."
      exit 0
    }

    if ($i -lt $MaxAttempts) {
      Write-Output "Failed, retrying in 2 seconds..."
      Start-Sleep -Seconds 2
    }
  }

  Write-Output "All $MaxAttempts attempts failed. Stopping. Check network and run again."
  exit 1
} finally {
  Pop-Location
}
