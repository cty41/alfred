Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Config.psm1') -Force

function Test-AlfredCommand {
    param([Parameter(Mandatory)][string]$Name)
    [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-AlfredDoctor {
    [CmdletBinding()]
    param([switch]$Quick)
    $root = Get-AlfredRoot
    $issues = [Collections.Generic.List[object]]::new()
    $tools = [Collections.Generic.List[object]]::new()
    try { $manifest = Read-AlfredManifest -Root $root }
    catch { return New-AlfredResult -Command 'doctor' -Status 'failed' -Issues @($_.Exception.Message) }

    foreach ($tool in @($manifest.tools)) {
        $path = Resolve-AlfredToolPath -Tool $tool -Root $root
        $present = Test-Path -LiteralPath $path -PathType Container
        $gitFile = Join-Path $path '.git'
        $initialized = $present -and (Test-Path -LiteralPath $gitFile)
        $dirty = $false
        $head = $null
        if ($initialized) {
            $status = @(& git -C $path status --porcelain 2>$null)
            $dirty = $status.Count -gt 0
            if($dirty){$issues.Add("submodule-dirty:$($tool.id)")}
            $head = (& git -C $path rev-parse HEAD 2>$null)
        }
        if (-not $initialized) { $issues.Add("submodule-not-initialized:$($tool.id)") }
        $tools.Add([ordered]@{ id=[string]$tool.id; path=[string]$tool.path; initialized=$initialized; dirty=$dirty; head=$head })
    }

    $runtime = [ordered]@{
        git = Test-AlfredCommand git
        powershell = [bool]((Get-Command pwsh -ErrorAction SilentlyContinue) -or (Get-Command powershell -ErrorAction SilentlyContinue))
        node = Test-AlfredCommand node
        npm = Test-AlfredCommand npm
        uv = Test-AlfredCommand uv
        pnpm = Test-AlfredCommand pnpm
        dshHome = [bool]$env:DSH_HOME
    }
    foreach ($required in @('git','powershell')) { if (-not $runtime[$required]) { $issues.Add("runtime-missing:$required") } }
    if (-not $Quick) {
        foreach ($recommended in @('node','npm','uv','pnpm')) { if (-not $runtime[$recommended]) { $issues.Add("runtime-missing:$recommended") } }
    }
    New-AlfredResult -Command 'doctor' -Status $(if ($issues.Count -eq 0) {'ok'} else {'issues'}) -Issues $issues.ToArray() -Data @{ quick=[bool]$Quick; tools=$tools.ToArray(); runtime=$runtime }
}

Export-ModuleMember -Function Invoke-AlfredDoctor
