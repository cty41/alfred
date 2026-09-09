$ErrorActionPreference='Stop'
$module=Import-Module (Join-Path $PSScriptRoot '../src/Configure.psm1') -Force -PassThru
$root=Join-Path ([IO.Path]::GetTempPath()) ('alf-dispatch-test-'+[guid]::NewGuid())
New-Item -ItemType Directory $root|Out-Null
function Put([string]$name,[string]$text){$p=Join-Path $root $name;[IO.File]::WriteAllText($p,$text,[Text.UTF8Encoding]::new($false));return $p}
function Bytes([string]$p){[Convert]::ToBase64String([IO.File]::ReadAllBytes($p))}
function Migrate([string[]]$paths){& $module {param($p,$s) Move-AlfredFinValueConfigToDispatch -ProfilePatches $p -PresetPath $s -ManagedInstall} $paths $script:preset}
try {
    $script:preset=Put 'preset.yml' "- id: fin-value`n  name: dsh-fin-value`n  config:`n    timeoutMs: 22222`n    tushareToken: stale-test-token`n"
    $current="# BEGIN managed ALF dispatch config`r`n- id: dsh-alfred-bootstrap`r`n  config:`r`n    finValue:`r`n      timeoutMs: 12345`r`n      dbPath: fixture.db`r`n# END managed ALF dispatch config`r`n"
    $p=Put 'current.yml' $current;$before=Bytes $p
    Migrate @($p);Migrate @($p)
    if((Bytes $p) -ne $before){throw 'current configuration bytes changed'}
    $empty=Put 'empty.yml' "# BEGIN managed ALF dispatch config`n- id: dsh-alfred-bootstrap`n  config:`n    finValue: {}`n# END managed ALF dispatch config"
    $before=Bytes $empty;Migrate @($empty);if((Bytes $empty) -ne $before){throw 'explicit empty map changed'}
    $legacy=Put 'legacy.yml' "- id: dsh-fin-value`n  config:`n    timeoutMs: 33333`n    tushareToken: synthetic-token`n"
    $currentBytes=Bytes $p;Migrate @($p,$legacy)
    if((Bytes $p) -ne $currentBytes){throw 'mixed migration overwrote current profile'}
    $text=[IO.File]::ReadAllText($legacy)
    if($text -notmatch '33333' -or $text -match '22222'){throw 'legacy profile lost precedence'}
    $before=Bytes $legacy;Migrate @($legacy);if((Bytes $legacy) -ne $before){throw 'second migration changed bytes'}
    $fallback=Put 'fallback.yml' "# unrelated`n[]`n"
    Migrate @($fallback)
    if([IO.File]::ReadAllText($fallback) -notmatch '22222'){throw 'preset fallback missing'}
    foreach($invalid in @(
        $current.Replace('# END managed ALF dispatch config',''),
        ($current+$current),
        "# END managed ALF dispatch config`n# BEGIN managed ALF dispatch config",
        ($current+"- id: dsh-fin-value`n  config:`n    timeoutMs: 9`n"),
        "- id: dsh-alfred-bootstrap`n  config:`n    finValue: {}`n",
        $current.Replace('    finValue:','    other:'),
        $current.Replace('timeoutMs: 12345','timeoutMs: ['),
        $current.Replace('timeoutMs: 12345','- unexpected-list-item'),
        $current.Replace('timeoutMs: 12345','timeoutMs: "unterminated'),
        $current.Replace('timeoutMs: 12345','timeoutMs: :'),
        "- id: dsh-fin-value`n  config:`n    timeoutMs: :`n",
        "- id: dsh-fin-value`n  config:`n    timeoutMs: [`n"
    )) {
        $first=Put 'first.yml' "- id: dsh-fin-value`n  config:`n    timeoutMs: 99`n"
        $bad=Put 'bad.yml' $invalid;$one=Bytes $first;$two=Bytes $bad;$rejected=$false
        try{Migrate @($first,$bad)}catch{$rejected=$true;if($_.Exception.Message -match 'synthetic-token|stale-test-token'){throw 'error leaked secret'}}
        if(-not $rejected){throw 'invalid input accepted'}
        if((Bytes $first) -ne $one -or (Bytes $bad) -ne $two){throw 'preflight failure wrote files'}
    }
    $script:preset=Put 'no-config.yml' "- id: fin-value`n  name: dsh-fin-value`n"
    $none=Put 'none.yml' "# untouched`r`n[]`r`n";$before=Bytes $none;Migrate @($none)
    if((Bytes $none) -ne $before){throw 'absent sources changed file'}
    'dispatch migration tests passed'
} finally {Remove-Item -LiteralPath $root -Recurse -Force}
