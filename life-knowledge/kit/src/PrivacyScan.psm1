Set-StrictMode -Version Latest

function Protect-KbPreview {
    param([string]$Text)
    if(-not $Text){return ''}
    if($Text.Length -le 4){return '***'}
    return $Text.Substring(0,2) + '***' + $Text.Substring($Text.Length-2)
}

function Invoke-KbPrivacyScan {
    param([Parameter(Mandatory)][string]$Path)
    $patterns = @(
        @{category='identity-number'; regex='(?<!\d)\d{17}[0-9Xx](?!\d)'},
        @{category='phone'; regex='(?<!\d)1[3-9]\d{9}(?!\d)'},
        @{category='private-key'; regex='-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'},
        @{category='token'; regex='(?i)(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["'']?[^\s"'']{8,}'},
        @{category='brokerage-account'; regex='(?i)(?:证券|券商|资金账号|brokerage account)\s*[:：=]\s*\w{6,}'}
    )
    $textExt = @('.md','.txt','.csv','.json','.html','.htm','.xml','.ini','.yaml','.yml','.ps1','.psm1','.py','.lua','.log')
    $findings = [Collections.Generic.List[object]]::new()
    $manual = [Collections.Generic.List[string]]::new()
    $files = if(Test-Path -LiteralPath $Path -PathType Leaf){@(Get-Item -LiteralPath $Path)}else{@(Get-ChildItem -LiteralPath $Path -Recurse -File -Force)}
    foreach($file in $files){
        if($textExt -notcontains $file.Extension.ToLowerInvariant()){
            if($file.Extension -in @('.pdf','.doc','.docx','.jpg','.jpeg','.png','.zip','.rar','.7z','.db')){$manual.Add($file.FullName)}
            continue
        }
        $lines = @(Get-Content -LiteralPath $file.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)
        for($i=0;$i -lt $lines.Count;$i++){
            foreach($p in $patterns){
                $m=[regex]::Match([string]$lines[$i],$p.regex)
                if($m.Success){$findings.Add([pscustomobject]@{file=$file.FullName;line=$i+1;category=$p.category;preview=(Protect-KbPreview $m.Value)})}
            }
        }
    }
    [pscustomobject]@{findings=$findings.ToArray();manualReview=$manual.ToArray();scannedAt=(Get-Date).ToString('o')}
}

Export-ModuleMember -Function Invoke-KbPrivacyScan,Protect-KbPreview
