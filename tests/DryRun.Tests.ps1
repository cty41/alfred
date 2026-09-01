Describe 'Dry-run' {
    It 'does not create a vault during init dry-run' {
        $vault=Join-Path $TestDrive 'vault'
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -DryRun -Json | Out-Null
        Test-Path $vault | Should -BeFalse
    }
    It 'returns a dry-run result' {
        $vault=Join-Path $TestDrive 'vault2'
        $result=& "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -DryRun -Json | ConvertFrom-Json
        $result.status | Should -Be 'dry-run'
    }
}
