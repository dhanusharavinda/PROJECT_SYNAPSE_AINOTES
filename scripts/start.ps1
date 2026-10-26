param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:4317'
try {
    $existingPage = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
    if ($existingPage.Content -match 'Synapse') { if (-not $NoBrowser) { Start-Process $appUrl }; exit 0 }
    throw 'Port 4317 is occupied by another application.'
} catch {
    if ($_.Exception.Message -match 'occupied') { throw }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist\index.html'))) {
    Push-Location $projectDirectory
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } } finally { Pop-Location }
}
$nodeExecutable = (Get-Command node.exe).Source
$runtimeScript = Join-Path $projectDirectory 'node_modules\tsx\dist\cli.mjs'
$serverScript = Join-Path $projectDirectory 'server\index.ts'
$logDirectory = Join-Path $projectDirectory 'work'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $runtimeScript + '"', '"' + $serverScript + '"', '--production') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'server.log') -RedirectStandardError (Join-Path $logDirectory 'server-error.log')
Set-Content -LiteralPath (Join-Path $logDirectory 'server-launcher.pid') -Value $serverProcess.Id
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $readyPage = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
        if ($readyPage.StatusCode -eq 200 -and $readyPage.Content -match 'Synapse') { if (-not $NoBrowser) { Start-Process $appUrl }; exit 0 }
    } catch { }
    Start-Sleep -Milliseconds 500
}
throw 'Synapse did not become ready. Read work\server-error.log.'
