<#
.SYNOPSIS
    Startar ett RPMWorks-bygge via API och laddar ner resultatet.

.EXAMPLE
    .\rpmbuild-windows.ps1 -ProjectId 17
    .\rpmbuild-windows.ps1 -ProjectId 16 -ChangelogMessage "Fix for X"
#>

param(
    [Parameter(Mandatory=$true)]
    [int]$ProjectId,

    [string]$ChangelogMessage = "",

    [string]$Server = "http://rpmworks.vpn.fhd.se:8005",
    [string]$Username = "admin",
    [string]$Password = "<SATT_LOSENORD_HAR>"
)

$ErrorActionPreference = "Stop"

Write-Host "=== RPMWorks Remote Build ==="
Write-Host "Server: $Server"
Write-Host "Projekt-ID: $ProjectId"
Write-Host ""

# 1. Hamta token
Write-Host "Loggar in..."
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$Server/api/token" `
    -ContentType "application/x-www-form-urlencoded" `
    -Body "username=$Username&password=$Password"

$token = $tokenResponse.access_token
if (-not $token) {
    Write-Error "Inloggning misslyckades!"
    exit 1
}
$headers = @{ Authorization = "Bearer $token" }
Write-Host "Inloggad."

# 2. Hamta projektnamn
$project = Invoke-RestMethod -Method Get -Uri "$Server/api/projects/$ProjectId" -Headers $headers
Write-Host ""
Write-Host "Startar bygge av: $($project.name) (id: $ProjectId)"

# 3. Starta bygge
$body = @{ project_id = $ProjectId }
if ($ChangelogMessage) {
    $body.changelog_message = $ChangelogMessage
}
$buildResponse = Invoke-RestMethod -Method Post -Uri "$Server/api/build/start" `
    -Headers $headers -ContentType "application/json" `
    -Body ($body | ConvertTo-Json)

$buildId = $buildResponse.build_ids[0]
if (-not $buildId) {
    Write-Error "Kunde inte starta bygge: $($buildResponse | ConvertTo-Json)"
    exit 1
}
Write-Host "Bygge startat (build_id: $buildId)"

# 4. Vanta tills bygget ar klart
Write-Host -NoNewline "Vantar"
while ($true) {
    Start-Sleep -Seconds 5
    $project = Invoke-RestMethod -Method Get -Uri "$Server/api/projects/$ProjectId" -Headers $headers
    $build = $project.builds | Where-Object { $_.id -eq $buildId }
    $status = $build.status

    if ($status -eq "success") {
        Write-Host ""
        Write-Host "Bygge KLART! Paketet publiceras till repository."
        break
    }
    elseif ($status -eq "failed") {
        Write-Host ""
        Write-Host "Bygge MISSLYCKAT!"
        ($build.build_log -split "`n") | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
        exit 1
    }

    Write-Host -NoNewline "."
}
