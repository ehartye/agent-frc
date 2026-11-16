param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(-not $env:JAVA_HOME -or -not $env:GRADLE_USER_HOME){throw 'Set JAVA_HOME to existing JDK17 and GRADLE_USER_HOME to the existing populated WPILib Gradle cache. No software is installed.'}
if(-not $OutputDirectory){$OutputDirectory=Join-Path $root ('examples/java-2026-sim/build/prototype-'+[guid]::NewGuid().ToString())}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
python (Join-Path $PSScriptRoot 'run-integrated-prototype.py') --output $OutputDirectory --java-home $env:JAVA_HOME --gradle-home $env:GRADLE_USER_HOME
if($LASTEXITCODE -ne 0){throw 'Prototype execution failed; diagnostic directory retained.'}
python (Join-Path $PSScriptRoot 'integrated-prototype-targets.py') --receipt (Join-Path $OutputDirectory 'receipt.json') --output (Join-Path $OutputDirectory 'targets.json')
if($LASTEXITCODE -ne 0){throw 'Target report failed; runtime receipt retained.'}
foreach($study in @(@('note-prototype-body.py','note-body.json'),@('coral-placement.py','coral-placement.json'))){
 python (Join-Path $PSScriptRoot $study[0]) --receipt (Join-Path $OutputDirectory 'receipt.json') --targets (Join-Path $OutputDirectory 'targets.json') --output (Join-Path $OutputDirectory $study[1])
 if($LASTEXITCODE -ne 0){throw 'Finite-body report failed; runtime and target reports retained.'}
}
Write-Output "Prototype results: $OutputDirectory"
