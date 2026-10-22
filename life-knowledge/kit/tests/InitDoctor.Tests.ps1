Describe 'Init and doctor' {
    BeforeAll { $script:savedProfile = $env:LIFE_KNOWLEDGE_PROFILE }
    AfterAll { $env:LIFE_KNOWLEDGE_PROFILE = $script:savedProfile }
    It 'initializes idempotently and doctor is healthy' {
        $env:LIFE_KNOWLEDGE_PROFILE=Join-Path $TestDrive 'profile.json'
        $vault=Join-Path $TestDrive 'vault'
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -Json | Out-Null
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -Json | Out-Null
        $result=& "$PSScriptRoot\..\kb.ps1" doctor -VaultPath $vault -Quick -Json | ConvertFrom-Json
        $result.state | Should -Be 'HEALTHY'
    }
    It 'preserves runtime data during a managed-template upgrade' {
        $env:LIFE_KNOWLEDGE_PROFILE=Join-Path $TestDrive 'profile-upgrade.json'
        $vault=Join-Path $TestDrive 'vault-upgrade'
        & "$PSScriptRoot\..\kb.ps1" init -VaultPath $vault -Json | Out-Null
        $snapshot=Join-Path $vault '00_System\managed\runtime-data\app\snapshot.db'
        New-Item -ItemType Directory -Force (Split-Path -Parent $snapshot) | Out-Null
        Set-Content -LiteralPath $snapshot -Value 'private runtime data'
        & "$PSScriptRoot\..\kb.ps1" upgrade -VaultPath $vault -Json | Out-Null
        Get-Content -LiteralPath $snapshot -Raw | Should -Match 'private runtime data'
        $result=& "$PSScriptRoot\..\kb.ps1" doctor -VaultPath $vault -Quick -Json | ConvertFrom-Json
        $result.state | Should -Be 'HEALTHY'
    }
}
