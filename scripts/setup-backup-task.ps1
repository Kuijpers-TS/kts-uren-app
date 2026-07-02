# =============================================================================
# KTS Uren App · Eenmalige setup van de automatische backup
# =============================================================================
# 1. Maakt %USERPROFILE%\.kts-backup\config.json aan (als die nog niet bestaat)
#    en opent hem in Kladblok zodat je de service_role key kunt plakken.
# 2. Registreert een Windows Taakplanner-taak die backup-kts.ps1 elke nacht
#    om 02:00 draait (of zodra de PC daarna weer aan staat).
#
# Draaien:  powershell -NoProfile -ExecutionPolicy Bypass -File setup-backup-task.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$configDir = Join-Path $env:USERPROFILE '.kts-backup'
$configPath = Join-Path $configDir 'config.json'
$scriptPath = Join-Path $PSScriptRoot 'backup-kts.ps1'

# --- 1. Config aanmaken indien nodig ---
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Force -Path $configDir | Out-Null }
if (-not (Test-Path $configPath)) {
    $defaultBackupRoot = Join-Path $env:USERPROFILE 'OneDrive\Administratie KTS BV\Backups\kts-uren'
    $template = [ordered]@{
        supabaseUrl    = 'https://fvrbirghjydkxslbewny.supabase.co'
        serviceRoleKey = 'PLAK-HIER-JE-SERVICE-ROLE-KEY'
        backupRoot     = $defaultBackupRoot
        retentionDays  = 30
    }
    $json = ConvertTo-Json -InputObject $template -Depth 5
    [System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ""
    Write-Host "Config aangemaakt: $configPath" -ForegroundColor Green
    Write-Host "LET OP: plak nu je service_role key in het config-bestand." -ForegroundColor Yellow
    Write-Host "Die vind je in Supabase Dashboard -> Project Settings -> API -> service_role (secret)." -ForegroundColor Yellow
    Start-Process notepad.exe $configPath
} else {
    Write-Host "Config bestaat al: $configPath" -ForegroundColor Green
}

# --- 2. Geplande taak registreren ---
$taskName = 'KTS Uren App Backup'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Set-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings | Out-Null
    Write-Host "Bestaande taak '$taskName' bijgewerkt." -ForegroundColor Green
} else {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
        -Description 'Dagelijkse backup van KTS Uren App (Supabase database + storage) naar OneDrive.' | Out-Null
    Write-Host "Taak '$taskName' geregistreerd · draait elke nacht om 02:00." -ForegroundColor Green
}

Write-Host ""
Write-Host "Klaar. Test de backup nu handmatig met:" -ForegroundColor Cyan
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -ForegroundColor Cyan
