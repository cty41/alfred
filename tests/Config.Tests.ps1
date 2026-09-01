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
}
