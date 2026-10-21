Import-Module "$PSScriptRoot\..\src\Config.psm1" -Force
Describe 'Config' {
    It 'rejects a path outside the vault' {
        $root=Join-Path $TestDrive 'vault'; New-Item -ItemType Directory $root | Out-Null
        { Assert-KbPathWithin $root (Join-Path $TestDrive 'outside.txt') } | Should -Throw
    }
    It 'accepts a path inside the vault' {
        $root=Join-Path $TestDrive 'vault'; New-Item -ItemType Directory -Force $root | Out-Null
        Assert-KbPathWithin $root (Join-Path $root 'inside.txt') | Should -Match 'inside.txt$'
    }
    It 'resolves a managed runtime application directory inside the vault' {
        $root=Join-Path $TestDrive 'vault'; New-Item -ItemType Directory -Force $root | Out-Null
        '{"managedDirectory":"00_System/managed"}' | Set-Content -LiteralPath (Join-Path $root 'knowledge-config.json') -Encoding UTF8
        Get-KbManagedApplicationPath -VaultPath $root -ApplicationId 'fin-value' | Should -Match '00_System[\\/]managed[\\/]runtime-data[\\/]fin-value$'
    }
    It 'rejects an escaping managed directory' {
        $root=Join-Path $TestDrive 'vault'; New-Item -ItemType Directory -Force $root | Out-Null
        '{"managedDirectory":"../outside"}' | Set-Content -LiteralPath (Join-Path $root 'knowledge-config.json') -Encoding UTF8
        { Get-KbManagedApplicationPath -VaultPath $root -ApplicationId 'fin-value' } | Should -Throw
    }
    It 'excludes runtime data from the managed template hash' {
        $root=Join-Path $TestDrive 'managed'; New-Item -ItemType Directory -Force (Join-Path $root 'runtime-data/fin-value') | Out-Null
        'policy' | Set-Content -LiteralPath (Join-Path $root 'policy.md')
        $before=Get-KbFileTreeHash $root
        'private snapshot' | Set-Content -LiteralPath (Join-Path $root 'runtime-data/fin-value/data.db')
        Get-KbFileTreeHash $root | Should -Be $before
    }
}
