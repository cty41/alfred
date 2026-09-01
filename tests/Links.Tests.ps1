Import-Module "$PSScriptRoot\..\src\Links.psm1" -Force
Describe 'Link check' {
    It 'detects a broken local Markdown link' {
        $vault=Join-Path $TestDrive 'vault'; New-Item -ItemType Directory -Force $vault | Out-Null
        '[missing](missing.md)' | Set-Content (Join-Path $vault 'README.md')
        $result=Invoke-KbLinkCheck $vault
        $result.issues.Count | Should -Be 1
    }
    It 'ignores imported sources and web links' {
        $vault=Join-Path $TestDrive 'vault2'; New-Item -ItemType Directory -Force (Join-Path $vault 'sources') | Out-Null
        '[web](https://example.com)' | Set-Content (Join-Path $vault 'README.md')
        '[source relative](missing.md)' | Set-Content (Join-Path $vault 'sources\source.md')
        $result=Invoke-KbLinkCheck $vault
        $result.issues.Count | Should -Be 0
    }
}
