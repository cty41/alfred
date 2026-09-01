Import-Module "$PSScriptRoot\..\src\PrivacyScan.psm1" -Force
Describe 'Privacy scan' {
    It 'detects and redacts a token' {
        $file=Join-Path $TestDrive 'sample.txt'; 'token=abcdefghijk12345' | Set-Content $file
        $result=Invoke-KbPrivacyScan $file
        $result.findings.Count | Should -Be 1
        $result.findings[0].preview | Should -Not -Match 'abcdefghijk12345'
    }
    It 'marks supported binary files for manual review' {
        $file=Join-Path $TestDrive 'sample.pdf'; [IO.File]::WriteAllBytes($file,[byte[]](1,2,3))
        $result=Invoke-KbPrivacyScan $file
        $result.manualReview.Count | Should -Be 1
    }
}
