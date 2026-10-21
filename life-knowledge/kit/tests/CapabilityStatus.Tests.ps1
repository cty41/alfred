Import-Module "$PSScriptRoot\..\src\CapabilityStatus.psm1" -Force

Describe 'Capability status' {
    BeforeEach {
        $env:LIFE_KNOWLEDGE_PROFILE = Join-Path $TestDrive 'profile.json'
        $script:vault = Join-Path $TestDrive 'vault'
        New-Item -ItemType Directory -Force $script:vault | Out-Null
    }

    It 'reports vault association and configuration without exposing paths' {
        $collectionPath = Join-Path $TestDrive 'collection'
        New-Item -ItemType Directory -Force $collectionPath | Out-Null
        @{vaultPath=$script:vault;toolCollectionPaths=@{research=$collectionPath}} |
            ConvertTo-Json -Depth 10 | Set-Content $env:LIFE_KNOWLEDGE_PROFILE
        @{schemaVersion='1.0';controlRepository='https://example.test/kit';skillsRepository='https://example.test/skills';managedDirectory='00_System/managed';storageMode='local';toolCollections=@(@{id='research';repository='https://github.com/example/research';intents=@('research');entryPoints=@{skills=@('research-skill');tools=@('research_query')}})} |
            ConvertTo-Json -Depth 10 | Set-Content (Join-Path $script:vault 'knowledge-config.json')

        $result = Invoke-KbCapabilityStatus
        $json = $result | ConvertTo-Json -Depth 10

        $result.vault.association | Should -Be 'associated'
        $result.vault.configuration | Should -Be 'configured'
        $result.collections[0].state | Should -Be 'available'
        $result.runtimeEntryPoints | Should -Be 'not-assessed'
        $result.collections[0].PSObject.Properties.Name | Should -Not -Contain 'entryPoints'
        $json | Should -Not -Match ([regex]::Escape($script:vault))
        $json | Should -Not -Match ([regex]::Escape($collectionPath))
    }

    It 'uses coarse states for an unavailable optional collection' {
        @{toolCollectionPaths=@{research=(Join-Path $TestDrive 'missing')}} |
            ConvertTo-Json | Set-Content $env:LIFE_KNOWLEDGE_PROFILE
        @{toolCollections=@(@{id='research';repository='https://github.com/example/research';intents=@();entryPoints=@{skills=@();tools=@()}})} |
            ConvertTo-Json -Depth 10 | Set-Content (Join-Path $script:vault 'knowledge-config.json')

        $result = Invoke-KbCapabilityStatus -VaultPath $script:vault

        $result.collections[0].state | Should -Be 'unavailable'
        $result.collections[0].PSObject.Properties.Name.Count | Should -Be 2
    }

    It 'redacts an unavailable explicit vault path' {
        $missingVault = Join-Path $TestDrive 'private-vault'
        $result = Invoke-KbCapabilityStatus -VaultPath $missingVault
        $json = $result | ConvertTo-Json -Depth 10

        $result.vault.association | Should -Be 'associated'
        $result.vault.configuration | Should -Be 'unavailable'
        $json | Should -Not -Match ([regex]::Escape($missingVault))
    }

    It 'reports invalid configuration without leaking parser paths' {
        Set-Content -LiteralPath (Join-Path $script:vault 'knowledge-config.json') -Value '{invalid'
        $result = Invoke-KbCapabilityStatus -VaultPath $script:vault

        $result.status | Should -Be 'ok'
        $result.vault.configuration | Should -Be 'invalid'
        @($result.collections).Count | Should -Be 0
    }

    It 'supports stable JSON output from the command interface' {
        $output = & "$PSScriptRoot\..\kb.ps1" capability-status -VaultPath $script:vault -Json | ConvertFrom-Json

        $output.command | Should -Be 'capability-status'
        $output.vault.association | Should -Be 'associated'
        $output.runtimeEntryPoints | Should -Be 'not-assessed'
        $output.PSObject.Properties.Name | Should -Not -Contain 'vaultPath'
    }

    It 'has a privacy-safe schema for the interface' {
        $schema = Get-Content "$PSScriptRoot\..\schemas\capability-status.schema.json" -Raw | ConvertFrom-Json

        $schema.required | Should -Contain 'runtimeEntryPoints'
        $schema.properties.PSObject.Properties.Name | Should -Not -Contain 'vaultPath'
        $schema.additionalProperties | Should -BeFalse
    }
}
