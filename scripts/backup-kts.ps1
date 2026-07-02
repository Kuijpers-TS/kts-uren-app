# =============================================================================
# KTS Uren App · Automatische Supabase backup
# =============================================================================
# Dumpt alle database-tabellen (via REST API met service_role key) en alle
# Storage-buckets naar een tijdgestempelde zip in de backup-map (OneDrive).
# Oude backups worden na <retentionDays> dagen opgeruimd.
#
# Configuratie staat BUITEN de repo in: %USERPROFILE%\.kts-backup\config.json
# (de service_role key mag nooit in git belanden). Draai eenmalig
# setup-backup-task.ps1 om de config aan te maken en de geplande taak te
# registreren.
#
# Handmatig draaien:  powershell -NoProfile -ExecutionPolicy Bypass -File backup-kts.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

# --- Config laden ---
$configPath = Join-Path $env:USERPROFILE '.kts-backup\config.json'
if (-not (Test-Path $configPath)) {
    Write-Error "Config niet gevonden: $configPath. Draai eerst setup-backup-task.ps1."
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$baseUrl = $config.supabaseUrl.TrimEnd('/')
$key = $config.serviceRoleKey
$backupRoot = $config.backupRoot
$retentionDays = 30
if ($config.retentionDays) { $retentionDays = [int]$config.retentionDays }

if (-not $key -or $key -like '*PLAK-HIER*') {
    Write-Error "Service role key nog niet ingevuld in $configPath"
    exit 1
}
if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
}

$logFile = Join-Path $backupRoot 'backup.log'
function Write-Log($msg) {
    $line = ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg)
    Add-Content -Path $logFile -Value $line -Encoding utf8
    Write-Host $line
}

$headers = @{
    'apikey'        = $key
    'Authorization' = "Bearer $key"
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$workDir = Join-Path $backupRoot ("kts-backup-$stamp")
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Write-Log "=== Backup gestart -> $workDir ==="

$manifest = [ordered]@{
    backupName = "kts-backup-$stamp"
    exportedAt = (Get-Date).ToString('o')
    tables     = [ordered]@{}
    storage    = [ordered]@{}
    authUsers  = 0
}

# --- 1. Database-tabellen dumpen (met paginatie per 1000 rijen) ---
$tables = @(
    'users', 'companies', 'projects', 'user_projects',
    'time_entries', 'week_status', 'week_summaries', 'expenses', 'rates',
    'inkooporders', 'inkooporder_weeks', 'invoices', 'facturen',
    'inspection_templates', 'inspections',
    'document_numbers', 'error_log', 'audit_log'
)
$dbDir = Join-Path $workDir 'database'
New-Item -ItemType Directory -Force -Path $dbDir | Out-Null

$totalRecords = 0
foreach ($table in $tables) {
    try {
        $allRows = @()
        $pageSize = 1000
        $offset = 0
        while ($true) {
            $rangeHeaders = $headers.Clone()
            $rangeHeaders['Range-Unit'] = 'items'
            $rangeHeaders['Range'] = ('{0}-{1}' -f $offset, ($offset + $pageSize - 1))
            $url = "$baseUrl/rest/v1/$table" + '?select=*'
            $page = Invoke-RestMethod -Uri $url -Headers $rangeHeaders -Method Get
            if ($null -eq $page) { $page = @() }
            # Een enkel object wordt door PS niet als array gezien · forceer array
            $page = @($page)
            $allRows += $page
            if ($page.Count -lt $pageSize) { break }
            $offset += $pageSize
        }
        $json = ConvertTo-Json -InputObject $allRows -Depth 100 -Compress
        $outFile = Join-Path $dbDir "$table.json"
        [System.IO.File]::WriteAllText($outFile, $json, (New-Object System.Text.UTF8Encoding($false)))
        $manifest.tables[$table] = $allRows.Count
        $totalRecords += $allRows.Count
        Write-Log ("Tabel {0}: {1} rijen" -f $table, $allRows.Count)
    } catch {
        $manifest.tables[$table] = "FOUT: $($_.Exception.Message)"
        Write-Log ("Tabel {0} OVERGESLAGEN: {1}" -f $table, $_.Exception.Message)
    }
}

# --- 2. Auth-gebruikers dumpen (admin API) ---
try {
    $authUsers = @()
    $pageNum = 1
    while ($true) {
        $url = "$baseUrl/auth/v1/admin/users?page=$pageNum" + '&per_page=200'
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        $batch = @()
        if ($resp -and $resp.users) { $batch = @($resp.users) }
        if ($batch.Count -eq 0) { break }
        $authUsers += $batch
        if ($batch.Count -lt 200) { break }
        $pageNum++
    }
    $json = ConvertTo-Json -InputObject $authUsers -Depth 20 -Compress
    $outFile = Join-Path $dbDir 'auth_users.json'
    [System.IO.File]::WriteAllText($outFile, $json, (New-Object System.Text.UTF8Encoding($false)))
    $manifest.authUsers = $authUsers.Count
    Write-Log ("Auth users: {0}" -f $authUsers.Count)
} catch {
    $manifest.authUsers = "FOUT: $($_.Exception.Message)"
    Write-Log ("Auth users OVERGESLAGEN: {0}" -f $_.Exception.Message)
}

# --- 3. Storage-buckets downloaden (recursief) ---
# Werkelijke bucketnamen · geverifieerd via storage.buckets query 2026-07-02
$buckets = @('weekstaten', 'approvals', 'facturen', 'inkooporders', 'inspections')

function Get-BucketFiles($bucket, $prefix) {
    # Recursief bestandslijst opbouwen · mappen hebben geen id in de response
    $body = @{ prefix = $prefix; limit = 1000; offset = 0; sortBy = @{ column = 'name'; order = 'asc' } } | ConvertTo-Json
    $url = "$baseUrl/storage/v1/object/list/$bucket"
    $items = Invoke-RestMethod -Uri $url -Headers $headers -Method Post -Body $body -ContentType 'application/json'
    $files = @()
    foreach ($item in @($items)) {
        if ($null -eq $item -or -not $item.name) { continue }
        $itemPath = $item.name
        if ($prefix) { $itemPath = "$prefix/$($item.name)" }
        if ($item.id) {
            $files += $itemPath
        } else {
            $files += Get-BucketFiles $bucket $itemPath
        }
    }
    return $files
}

$totalFiles = 0
foreach ($bucket in $buckets) {
    try {
        $files = @(Get-BucketFiles $bucket '')
        $bucketDir = Join-Path $workDir "storage\$bucket"
        New-Item -ItemType Directory -Force -Path $bucketDir | Out-Null
        $count = 0
        foreach ($filePath in $files) {
            try {
                # Padveilige lokale naam · submappen behouden
                $safeRel = ($filePath -replace '[<>:"|?*]', '_')
                $localPath = Join-Path $bucketDir $safeRel
                $localDir = Split-Path $localPath -Parent
                if (-not (Test-Path $localDir)) { New-Item -ItemType Directory -Force -Path $localDir | Out-Null }
                $encPath = [uri]::EscapeDataString($filePath) -replace '%2F', '/'
                $url = "$baseUrl/storage/v1/object/$bucket/$encPath"
                Invoke-WebRequest -Uri $url -Headers $headers -OutFile $localPath -UseBasicParsing | Out-Null
                $count++
            } catch {
                Write-Log ("  Download mislukt {0}/{1}: {2}" -f $bucket, $filePath, $_.Exception.Message)
            }
        }
        $manifest.storage[$bucket] = $count
        $totalFiles += $count
        Write-Log ("Bucket {0}: {1} bestanden" -f $bucket, $count)
    } catch {
        $manifest.storage[$bucket] = "NIET BESCHIKBAAR"
        Write-Log ("Bucket {0} overgeslagen (bestaat mogelijk niet)" -f $bucket)
    }
}

# --- 4. Manifest schrijven ---
$manifestJson = ConvertTo-Json -InputObject $manifest -Depth 10
[System.IO.File]::WriteAllText((Join-Path $workDir 'manifest.json'), $manifestJson, (New-Object System.Text.UTF8Encoding($false)))

# --- 5. Zippen en werkmap opruimen ---
$zipPath = Join-Path $backupRoot ("kts-backup-$stamp.zip")
Compress-Archive -Path (Join-Path $workDir '*') -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $workDir -Confirm:$false
Write-Log ("Zip geschreven: {0} ({1:N1} MB)" -f $zipPath, ((Get-Item $zipPath).Length / 1MB))

# --- 6. Retentie: oude zips opruimen ---
$cutoff = (Get-Date).AddDays(-$retentionDays)
$oldZips = Get-ChildItem -Path $backupRoot -Filter 'kts-backup-*.zip' | Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($old in $oldZips) {
    Remove-Item $old.FullName -Force -Confirm:$false
    Write-Log ("Oude backup verwijderd: {0}" -f $old.Name)
}

Write-Log ("=== Backup klaar · {0} records + {1} bestanden ===" -f $totalRecords, $totalFiles)
exit 0
