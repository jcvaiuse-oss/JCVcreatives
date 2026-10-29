@echo off
title JCVcreatives Photobooth - 1-Click Automatic Silent Print Setup
echo ====================================================================
echo   JCVcreatives Photobooth - Automatic Silent Print Setup
echo   Configures EPSON / USB / Thermal Printers to print automatically
echo   with ZERO pop-up windows in Brave, Chrome, and Microsoft Edge.
echo ====================================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$lines = Get-Content -LiteralPath '%~f0'; $idx = [Array]::IndexOf($lines, ':: === PS_PAYLOAD ==='); $code = ($lines[($idx + 1)..($lines.Length - 1)] -join [Environment]::NewLine); Invoke-Expression $code"
exit /b
:: === PS_PAYLOAD ===
$ErrorActionPreference = 'SilentlyContinue'

$appDir = Join-Path $env:APPDATA 'JCVPhotobooth'
if (-not (Test-Path $appDir)) {
  New-Item -ItemType Directory -Path $appDir -Force | Out-Null
}

# 1. Detect EPSON / Thermal Receipt Printer and set as Windows Default Printer
Write-Host "[1/4] Detecting USB / Thermal Receipt Printer..." -ForegroundColor Cyan
$printers = Get-CimInstance -ClassName Win32_Printer
$thermal = $printers | Where-Object { $_.Name -match 'EPSON|TM-T|Receipt|POS|Thermal|58|80|Star|Xprinter|Bixolon' } | Select-Object -First 1
if (-not $thermal) {
  $thermal = $printers | Where-Object { $_.Default -eq $true } | Select-Object -First 1
}
$detectedPrinterName = "Default Windows Printer"
if ($thermal) {
  $detectedPrinterName = $thermal.Name
  Invoke-CimMethod -InputObject $thermal -MethodName SetDefaultPrinter | Out-Null
  Write-Host "      -> Default Printer set to: $detectedPrinterName" -ForegroundColor Green
} else {
  Write-Host "      -> Using active Windows Default Printer" -ForegroundColor Yellow
}

# 2. Configure SilentPrintingEnabled Registry Policies for Brave, Chrome, and Edge
Write-Host "[2/4] Enabling Silent Printing policy for Brave, Chrome & Edge..." -ForegroundColor Cyan
$regPaths = @(
  'HKCU:\Software\Policies\BraveSoftware\Brave',
  'HKCU:\Software\Policies\Google\Chrome',
  'HKCU:\Software\Policies\Microsoft\Edge',
  'HKLM:\Software\Policies\BraveSoftware\Brave',
  'HKLM:\Software\Policies\Google\Chrome',
  'HKLM:\Software\Policies\Microsoft\Edge'
)
foreach ($rp in $regPaths) {
  if (-not (Test-Path $rp)) {
    New-Item -Path $rp -Force | Out-Null
  }
  Set-ItemProperty -Path $rp -Name 'SilentPrintingEnabled' -Value 1 -Type DWord
  Set-ItemProperty -Path $rp -Name 'InsecurePrivateNetworkRequestsAllowed' -Value 1 -Type DWord
}

# 3. Create & Start Background Local Silent Print Spooler (http://127.0.0.1:19100)
Write-Host "[3/4] Installing Local Silent Print Spooler service (port 19100)..." -ForegroundColor Cyan
$bridgePath = Join-Path $appDir 'silent-print-bridge.ps1'

$bridgeCode = @'
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web

function Get-TargetPrinterName {
  try {
    $printers = Get-CimInstance -ClassName Win32_Printer
    $thermal = $printers | Where-Object { $_.Name -match 'EPSON|TM-T|Receipt|POS|Thermal|58|80|Star|Xprinter|Bixolon' } | Select-Object -First 1
    if ($thermal) { return $thermal.Name }
    $def = $printers | Where-Object { $_.Default -eq $true } | Select-Object -First 1
    if ($def) { return $def.Name }
  } catch {}
  return $null
}

function Invoke-SilentImagePrint([string]$dataUrl, [int]$copies = 1) {
  $cleanBase64 = $dataUrl -replace '^data:image/[a-zA-Z0-9+-]+;base64,', ''
  $bytes = [Convert]::FromBase64String($cleanBase64)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $script:currentPrintBitmap = [System.Drawing.Image]::FromStream($ms)

  $targetPrinter = Get-TargetPrinterName
  $count = [Math]::Max(1, [Math]::Min(50, $copies))

  for ($c = 0; $c -lt $count; $c++) {
    $pd = New-Object System.Drawing.Printing.PrintDocument
    if ($targetPrinter) {
      $pd.PrinterSettings.PrinterName = $targetPrinter
    }
    $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $pd.OriginAtMargins = $false
    $pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController

    $pd.add_PrintPage({
      param($sender, $e)
      $bmp = $script:currentPrintBitmap
      if ($bmp -ne $null) {
        $pageW = $e.PageBounds.Width
        if ($pageW -le 0 -or $pageW -gt 400) { $pageW = 284 }
        $ratio = [double]$bmp.Height / [double]$bmp.Width
        $drawW = $pageW
        $drawH = [int]([math]::Round($drawW * $ratio))
        $rect = New-Object System.Drawing.Rectangle(0, 0, $drawW, $drawH)
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $e.Graphics.DrawImage($bmp, $rect)
      }
      $e.HasMorePages = $false
    })

    $pd.Print()
    $pd.Dispose()
    if ($c -lt ($count - 1)) {
      Start-Sleep -Milliseconds 400
    }
  }

  if ($script:currentPrintBitmap -ne $null) {
    $script:currentPrintBitmap.Dispose()
    $script:currentPrintBitmap = $null
  }
  $ms.Dispose()
  return $targetPrinter
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:19100/')
$listener.Prefixes.Add('http://localhost:19100/')
try {
  $listener.Start()
} catch {
  exit
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type, Accept')
    $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $path = $req.Url.AbsolutePath.ToLower()

    if ($path -eq '/status') {
      $pName = Get-TargetPrinterName
      if (-not $pName) { $pName = 'System Thermal Printer' }
      $escapedName = $pName.Replace('\', '\\').Replace('"', '\"')
      $json = "{`"ok`":true,`"printerName`":`"$escapedName`"}"
      $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = 'application/json'
      $res.ContentLength64 = $buf.Length
      $res.OutputStream.Write($buf, 0, $buf.Length)
      $res.Close()
      continue
    }

    if ($path -eq '/ping') {
      $pName = Get-TargetPrinterName
      if (-not $pName) { $pName = 'System Thermal Printer' }
      $escapedName = $pName.Replace('\', '\\').Replace('"', '\"')
      $html = "<!DOCTYPE html><html><body><script>window.parent.postMessage({type:'JCV_BRIDGE_STATUS',ok:true,printerName:'$escapedName'},'*');</script></body></html>"
      $buf = [System.Text.Encoding]::UTF8.GetBytes($html)
      $res.ContentType = 'text/html'
      $res.ContentLength64 = $buf.Length
      $res.OutputStream.Write($buf, 0, $buf.Length)
      $res.Close()
      continue
    }

    if ($req.HttpMethod -eq 'POST' -and ($path -eq '/print' -or $path -eq '/print-form')) {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()

      $imgDataUrl = $null
      $copiesCount = 1
      if ($path -eq '/print-form' -or $body.StartsWith('imageDataUrl=')) {
        $rawVal = ($body -split '&')[0] -replace '^imageDataUrl=', ''
        $imgDataUrl = [System.Uri]::UnescapeDataString($rawVal.Replace('+', ' '))
        if ($body -match 'copies=(\d+)') {
          $copiesCount = [int]$matches[1]
        }
      } else {
        if ($body -match '"imageDataUrl"\s*:\s*"([^"]+)"') {
          $imgDataUrl = $matches[1]
        }
        if ($body -match '"copies"\s*:\s*(\d+)') {
          $copiesCount = [int]$matches[1]
        }
      }

      if ($imgDataUrl) {
        $usedPrinter = Invoke-SilentImagePrint $imgDataUrl $copiesCount
        if ($path -eq '/print-form') {
          $html = "<!DOCTYPE html><html><body><script>window.parent.postMessage({type:'JCV_SILENT_PRINT_OK',ok:true},'*');</script></body></html>"
          $buf = [System.Text.Encoding]::UTF8.GetBytes($html)
          $res.ContentType = 'text/html'
          $res.ContentLength64 = $buf.Length
          $res.OutputStream.Write($buf, 0, $buf.Length)
        } else {
          $json = '{"ok":true,"printed":true}'
          $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
          $res.ContentType = 'application/json'
          $res.ContentLength64 = $buf.Length
          $res.OutputStream.Write($buf, 0, $buf.Length)
        }
      } else {
        $res.StatusCode = 400
      }
      $res.Close()
      continue
    }

    $res.StatusCode = 404
    $res.Close()
  } catch {
    try { $context.Response.Close() } catch {}
  }
}
'@

Set-Content -Path $bridgePath -Value $bridgeCode -Encoding UTF8

# Stop any older instance on port 19100 and start fresh hidden background listener
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*silent-print-bridge.ps1*' } | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$bridgePath`""

# Register in Windows Startup so it runs automatically every time the PC turns on
$startupDir = [Environment]::GetFolderPath('Startup')
$vbsPath = Join-Path $startupDir 'JCV-Silent-Print-Bridge.vbs'
$vbsContent = "CreateObject(`"WScript.Shell`").Run `"powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"`"$bridgePath`"`"`", 0, False"
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII
Write-Host "      -> Silent Print Bridge running on http://127.0.0.1:19100 (Auto-starts with Windows)" -ForegroundColor Green

# 4. Launch Browser with --kiosk-printing and create Desktop Shortcut
Write-Host "[4/4] Configuring Browser for Kiosk Auto-Print (--kiosk-printing)..." -ForegroundColor Cyan

$browserCandidates = @(
  @{ Name = 'Brave'; Exe = 'brave.exe'; Paths = @(
      "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
      "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
      "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
    )
  },
  @{ Name = 'Chrome'; Exe = 'chrome.exe'; Paths = @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
  },
  @{ Name = 'Edge'; Exe = 'msedge.exe'; Paths = @(
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
  }
)

$chosenBrowser = $null
$chosenPath = $null

# Prefer currently running browser (e.g. Brave)
foreach ($b in $browserCandidates) {
  $proc = Get-Process -Name ($b.Exe -replace '\.exe$','') -ErrorAction SilentlyContinue
  if ($proc) {
    foreach ($p in $b.Paths) {
      if (Test-Path $p) {
        $chosenBrowser = $b
        $chosenPath = $p
        break
      }
    }
  }
  if ($chosenPath) { break }
}

if (-not $chosenPath) {
  foreach ($b in $browserCandidates) {
    foreach ($p in $b.Paths) {
      if (Test-Path $p) {
        $chosenBrowser = $b
        $chosenPath = $p
        break
      }
    }
    if ($chosenPath) { break }
  }
}

$targetUrl = "https://jcvcreatives.github.io/photobooth/"
$kioskArgs = "--kiosk-printing --disable-features=BlockInsecurePrivateNetworkRequests `"$targetUrl`""

if ($chosenPath) {
  # Create Desktop Shortcut
  $desktopDir = [Environment]::GetFolderPath('Desktop')
  $lnkPath = Join-Path $desktopDir 'JCVcreatives Photobooth (Auto-Print).lnk'
  $wsh = New-Object -ComObject WScript.Shell
  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath = $chosenPath
  $shortcut.Arguments = $kioskArgs
  $shortcut.WorkingDirectory = Split-Path $chosenPath
  $shortcut.Description = "JCVcreatives Photobooth with Instant Silent Auto-Printing"
  $shortcut.Save()
  Write-Host "      -> Created Desktop shortcut: JCVcreatives Photobooth (Auto-Print)" -ForegroundColor Green

  # Restart active browser with --kiosk-printing and session restore so current tabs reopen with silent printing active
  Write-Host "      -> Activating silent auto-print in $($chosenBrowser.Name)..." -ForegroundColor Green
  Stop-Process -Name ($chosenBrowser.Exe -replace '\.exe$','') -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 900
  Start-Process -FilePath $chosenPath -ArgumentList "--kiosk-printing --restore-last-session --disable-features=BlockInsecurePrivateNetworkRequests `"$targetUrl`""
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Automatic Silent Printing is now ACTIVE!" -ForegroundColor Green
Write-Host "  When you press Print in JCVcreatives Photobooth, it will print" -ForegroundColor Green
Write-Host "  immediately to $detectedPrinterName with NO pop-up window!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Start-Sleep -Seconds 3
