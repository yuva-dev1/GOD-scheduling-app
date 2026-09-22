<#
.SYNOPSIS
  Creates (or adds a new version to) the Secret Manager secrets this app's
  Cloud Run service reads via --set-secrets: APPS_SCRIPT_URL,
  APPS_SCRIPT_TOKEN, TOKEN_SIGNING_SECRET.

.DESCRIPTION
  Safe to re-run — creates each secret only if it doesn't already exist,
  otherwise adds a new version. Does not deploy anything; run the
  `gcloud run deploy` command this script prints afterwards once you're
  ready.

  Does NOT run automatically as part of any PR/CI — this only touches real
  GCP resources when a person explicitly runs it.

.EXAMPLE
  ./scripts/setup-secrets.ps1 -Project namabiksha-v1 `
    -AppsScriptUrl "https://script.google.com/macros/s/XXX/exec" `
    -AppsScriptToken "..." -TokenSigningSecret "..."
#>
param(
    [Parameter(Mandatory = $true)][string]$Project,
    [Parameter(Mandatory = $true)][string]$AppsScriptUrl,
    [Parameter(Mandatory = $true)][string]$AppsScriptToken,
    [Parameter(Mandatory = $true)][string]$TokenSigningSecret,
    [string]$Service = "god-scheduling-app",
    [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

function Set-GcloudSecret {
    param([string]$Name, [string]$Value)

    $existing = gcloud secrets describe $Name --project $Project 2>$null
    if (-not $existing) {
        Write-Host "Creating secret '$Name'..."
        gcloud secrets create $Name --project $Project --replication-policy="automatic" | Out-Null
    }
    Write-Host "Adding new version to '$Name'..."
    $Value | gcloud secrets versions add $Name --project $Project --data-file=- | Out-Null
}

Set-GcloudSecret -Name "apps-script-url" -Value $AppsScriptUrl
Set-GcloudSecret -Name "apps-script-token" -Value $AppsScriptToken
Set-GcloudSecret -Name "token-signing-secret" -Value $TokenSigningSecret

Write-Host ""
Write-Host "Secrets are set. Deploy (or update) the Cloud Run service with:"
Write-Host ""
Write-Host "  gcloud run deploy $Service ``" -ForegroundColor Cyan
Write-Host "    --project $Project ``" -ForegroundColor Cyan
Write-Host "    --region $Region ``" -ForegroundColor Cyan
Write-Host "    --source . ``" -ForegroundColor Cyan
Write-Host "    --allow-unauthenticated ``" -ForegroundColor Cyan
Write-Host "    --set-secrets APPS_SCRIPT_URL=apps-script-url:latest,APPS_SCRIPT_TOKEN=apps-script-token:latest,TOKEN_SIGNING_SECRET=token-signing-secret:latest ``" -ForegroundColor Cyan
Write-Host "    --set-env-vars CORS_ORIGINS=https://<your-subdomain>" -ForegroundColor Cyan
