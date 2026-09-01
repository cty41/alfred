Describe 'Init and doctor' {
    It 'initializes idempotently and doctor is healthy' {
        $env:LIFE_KNOWLEDGE_PROFILE=Join-Path $TestDrive 'profile.json'
        $vault=Join-Path $TestDrive 'vault'
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -Json | Out-Null
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -Json | Out-Null
        $result=& "$PSScriptRoot\..\kb.ps1" doctor -VaultPath $vault -Quick -Json | ConvertFrom-Json
        $result.state | Should -Be 'HEALTHY'
    }
}
