$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeCommand = wsl.exe -u root --exec hermes --print-runtime-command | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $runtimeCommand[0]) { throw 'Install and configure Hermes in WSL first.' }
$targetPath = Join-Path $projectRoot 'work\voice-runtime'
$targetWsl = '/mnt/' + $targetPath.Substring(0,1).ToLower() + $targetPath.Substring(2).Replace('\','/')
wsl.exe -u root --exec /root/.local/bin/uv pip install --python $runtimeCommand[0] --target $targetWsl --upgrade 'edge-tts==7.3.1'
if ($LASTEXITCODE -ne 0) { throw 'Voice compatibility dependency installation failed.' }
Write-Output 'Synapse voice runtime ready. Hermes settings are unchanged.'
