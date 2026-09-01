Set-StrictMode -Version Latest

function Invoke-KbLinkCheck {
    param([Parameter(Mandatory)][string]$VaultPath)
    $issues=[Collections.Generic.List[object]]::new()
    foreach($file in Get-ChildItem -LiteralPath $VaultPath -Recurse -File -Filter '*.md' | Where-Object { $_.FullName -notmatch '[\\/]sources[\\/]' }){
        $lines=@(Get-Content -LiteralPath $file.FullName -Encoding UTF8)
        for($i=0;$i -lt $lines.Count;$i++){
            foreach($match in [regex]::Matches([string]$lines[$i],'\[[^\]]*\]\(([^)]+)\)')){
                $raw=$match.Groups[1].Value.Trim()
                if($raw -match '^(?:https?://|mailto:|#)' -or $raw -match '^<https?://'){continue}
                $pathPart=($raw -split '#',2)[0].Trim('<>')
                if(-not $pathPart){continue}
                try{$pathPart=[Uri]::UnescapeDataString($pathPart)}catch{}
                $target=Join-Path $file.DirectoryName $pathPart
                if(-not (Test-Path -LiteralPath $target)){
                    $issues.Add([pscustomobject]@{file=$file.FullName;line=$i+1;target=$pathPart})
                }
            }
        }
    }
    [pscustomobject]@{issues=$issues.ToArray();checkedAt=(Get-Date).ToString('o')}
}

Export-ModuleMember -Function Invoke-KbLinkCheck
