param(
  [int]$MaxAttempts = 5,
  [string]$Remote = 'origin',
  [string]$Branch = 'HEAD'
)

$ErrorActionPreference = 'Stop'

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
