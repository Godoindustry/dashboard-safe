$ErrorActionPreference = 'Stop'
$safeProject = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$safeOutput = Join-Path $safeProject 'DASHBOARD-SAFE-NETLIFY.zip'
$safeAllowed = @('dist','netlify','src','scripts','tests','docs','package.json','package-lock.json','netlify.toml','.gitignore','.env.example','README.md','LEIA-ME.html','PUBLICAR-NETLIFY.cmd')
$safeFiles = $safeAllowed | ForEach-Object { Join-Path $safeProject $_ }
foreach ($safeFile in $safeFiles) { if (!(Test-Path -LiteralPath $safeFile)) { throw "Arquivo ausente: $safeFile" } }
if (Test-Path -LiteralPath $safeOutput) { throw 'O ZIP já existe. Renomeie-o antes de gerar outra entrega.' }
Compress-Archive -LiteralPath $safeFiles -DestinationPath $safeOutput -CompressionLevel Optimal
Add-Type -AssemblyName System.IO.Compression.FileSystem
$safeArchive = [System.IO.Compression.ZipFile]::OpenRead($safeOutput)
try {
  foreach ($safeEntry in $safeArchive.Entries) {
    if ($safeEntry.FullName -match '(^|/|\\)(\.env\.local|node_modules|\.local-state|\.npm-cache)(/|\\|$)') { throw "Conteúdo privado no ZIP: $($safeEntry.FullName)" }
    $safeReader = New-Object System.IO.StreamReader($safeEntry.Open())
    try { $safeText = $safeReader.ReadToEnd(); if ($safeText -match 'gsk_[A-Za-z0-9]{30,}') { throw 'O ZIP contém uma chave Groq; não compartilhe.' } } finally { $safeReader.Dispose() }
  }
  Write-Output "ZIP validado: $safeOutput"
  Write-Output "$($safeArchive.Entries.Count) arquivos; nenhuma chave Groq no pacote."
} finally { $safeArchive.Dispose() }
