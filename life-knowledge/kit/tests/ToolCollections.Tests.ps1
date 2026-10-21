Import-Module "$PSScriptRoot\..\src\Config.psm1" -Force

Describe 'Optional tool collections' {
    BeforeEach {
        $env:LIFE_KNOWLEDGE_PROFILE = Join-Path $TestDrive 'profile.json'
        $script:vault = Join-Path $TestDrive 'vault'
        New-Item -ItemType Directory -Force $script:vault | Out-Null
    }

    It 'keeps an old config without collections compatible' {
        @{schemaVersion='1.0';controlRepository='https://example.test/kit';skillsRepository='https://example.test/skills';managedDirectory='00_System/managed';storageMode='local'} |
            ConvertTo-Json | Set-Content (Join-Path $script:vault 'knowledge-config.json')
        @(Get-KbToolCollections -VaultPath $script:vault).Count | Should -Be 0
    }

    It 'reports configured available collections without exposing their local path' {
        $collectionPath = Join-Path $TestDrive 'collection'
        New-Item -ItemType Directory -Force $collectionPath | Out-Null
        @{toolCollectionPaths=@{research=$collectionPath}} | ConvertTo-Json | Set-Content $env:LIFE_KNOWLEDGE_PROFILE
        @{toolCollections=@(@{id='research';repository='https://github.com/example/research';intents=@('research');entryPoints=@{skills=@('research-skill');tools=@('research_query')}})} |
            ConvertTo-Json -Depth 10 | Set-Content (Join-Path $script:vault 'knowledge-config.json')
        $result = @(Get-KbToolCollections -VaultPath $script:vault)
        $result[0].state | Should -Be 'available'
        ($result[0] | ConvertTo-Json -Depth 10) | Should -Not -Match ([regex]::Escape($collectionPath))
    }

    It 'reports a missing configured path as an optional unavailable capability' {
        @{toolCollectionPaths=@{research=(Join-Path $TestDrive 'missing')}} | ConvertTo-Json | Set-Content $env:LIFE_KNOWLEDGE_PROFILE
        @{toolCollections=@(@{id='research';repository='https://github.com/example/research';intents=@('research');entryPoints=@{skills=@();tools=@()}})} |
            ConvertTo-Json -Depth 10 | Set-Content (Join-Path $script:vault 'knowledge-config.json')
        $result = @(Get-KbToolCollections -VaultPath $script:vault)
        $result[0].state | Should -Be 'unavailable'
        $result[0].available | Should -BeFalse
    }
}
