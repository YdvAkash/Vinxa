<#
.SYNOPSIS
    Vinxa Live — Pre-Push EC2 Readiness Check & Auto-Installer + Git Push Wrapper
.DESCRIPTION
    Connects to your AWS EC2 instance via SSH BEFORE pushing code to GitHub,
    checks all required dependencies (Java 21, Maven, Node.js 20, npm, Docker,
    Docker Compose, Nginx, Git, Swap, and /opt/vinxa directories), automatically
    installs any missing packages, and then executes `git push` to trigger the
    GitHub Actions CI/CD pipeline.
.PARAMETER Ec2Host
    EC2 Public IPv4 address, Public DNS, or SSH Config Host alias.
.PARAMETER Ec2User
    SSH username (default: ubuntu).
.PARAMETER KeyPath
    Path to the .pem private key file (optional if using an SSH config alias).
.PARAMETER Branch
    Git branch to push after EC2 readiness succeeds (default: master).
.PARAMETER SkipPush
    Only run the EC2 prerequisite check & auto-install without running git push.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Ec2Host,

    [string]$Ec2User = "ubuntu",

    [string]$KeyPath = "",

    [string]$Branch = "master",

    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$PreflightScript = Join-Path $RepoRoot "infrastructure\scripts\ec2-preflight-setup.sh"

if (-not (Test-Path $PreflightScript)) {
    Write-Error "Pre-flight script not found at: $PreflightScript"
    exit 1
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Vinxa Live — Step 1: Checking & Installing Prerequisites on EC2 ($Ec2Host)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$SshTarget = if ($Ec2Host -match "@") { $Ec2Host } else { "$Ec2User@$Ec2Host" }
$SshArgs = @("-o", "StrictHostKeyChecking=accept-new")
$ScpArgs = @("-o", "StrictHostKeyChecking=accept-new")

if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
    if (-not (Test-Path $KeyPath)) {
        Write-Error "SSH Key file not found at: $KeyPath"
        exit 1
    }
    $SshArgs += @("-i", $KeyPath)
    $ScpArgs += @("-i", $KeyPath)
}

# Normalize CRLF -> LF before uploading to Linux EC2
$TempLfScript = Join-Path $env:TEMP "ec2-preflight-setup.sh"
(Get-Content -Raw $PreflightScript) -replace "`r`n", "`n" | Set-Content -NoNewline -Encoding utf8 $TempLfScript

Write-Host "-> Uploading ec2-preflight-setup.sh to $SshTarget..." -ForegroundColor Yellow
& scp @ScpArgs $TempLfScript "${SshTarget}:/tmp/ec2-preflight-setup.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload pre-flight script to EC2 ($SshTarget)."
    exit $LASTEXITCODE
}

Write-Host "-> Executing pre-flight check & auto-installer on EC2..." -ForegroundColor Yellow
& ssh @SshArgs $SshTarget "chmod +x /tmp/ec2-preflight-setup.sh && bash /tmp/ec2-preflight-setup.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Error "EC2 pre-flight setup failed with exit code $LASTEXITCODE. Aborting git push."
    exit $LASTEXITCODE
}

Write-Host "-> EC2 machine has all required dependencies installed and verified!" -ForegroundColor Green

if (-not $SkipPush) {
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Write-Host " Vinxa Live — Step 2: Pushing Code to GitHub ($Branch) to Trigger CI/CD" -ForegroundColor Cyan
    Write-Host "==============================================================================" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        & git push origin $Branch
        if ($LASTEXITCODE -ne 0) {
            Write-Error "git push failed with exit code $LASTEXITCODE."
            exit $LASTEXITCODE
        }
        Write-Host "-> Code pushed successfully! GitHub Actions CI/CD pipeline is now running." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}
