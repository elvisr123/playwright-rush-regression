# Automates an already-open, already-connected SSMS window: opens a new
# query tab on the existing connection, types the given query, executes it,
# and screenshots the SSMS window. Windows-only (SSMS itself is Windows-only).
#
# Deliberately does NOT launch or log into SSMS — it expects a window titled
# "...Microsoft SQL Server Management Studio" to already be open and
# connected (the common case: VDI sessions persist SSMS across reconnects).
# If none is found, it fails fast with a clear message instead of guessing.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ssms-capture.ps1 `
#     -Query "SELECT * FROM [SOA].[dbo].[My_Rush_Jobs] WHERE Stage_Key = 'NE-19825552TEST000PDPPL';" `
#     -OutputPath "temp\My_Rush_Jobs.png"

param(
    [Parameter(Mandatory = $true)][string]$Query,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [int]$WaitSeconds = 4
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SsmsCaptureWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$SW_RESTORE = 9
$SW_MAXIMIZE = 3

function Escape-SendKeys([string]$text) {
    # SendKeys treats these as control characters — wrap each in braces so
    # it's typed literally instead of interpreted.
    $specials = @('+', '^', '%', '~', '(', ')', '{', '}', '[', ']')
    foreach ($ch in $specials) {
        $text = $text.Replace($ch, '{' + $ch + '}')
    }
    return $text
}

Write-Output "Looking for an open, connected SSMS window..."
$proc = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "*Microsoft SQL Server Management Studio*" } |
    Select-Object -First 1

if (-not $proc) {
    Write-Error "No open SSMS window found. Open SSMS, connect to the database, then re-run this script."
    exit 1
}

Write-Output "Found: $($proc.MainWindowTitle)"
$hwnd = $proc.MainWindowHandle

[SsmsCaptureWin32]::ShowWindow($hwnd, $SW_RESTORE) | Out-Null
[SsmsCaptureWin32]::ShowWindow($hwnd, $SW_MAXIMIZE) | Out-Null
Start-Sleep -Milliseconds 500
[SsmsCaptureWin32]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 500

# New query tab on the SAME connection — no re-login needed.
Write-Output "Opening a new query tab..."
[System.Windows.Forms.SendKeys]::SendWait("^n")
Start-Sleep -Milliseconds 1000

# Clear anything already in the tab, then type the query.
[System.Windows.Forms.SendKeys]::SendWait("^a")
[System.Windows.Forms.SendKeys]::SendWait("{DEL}")
Start-Sleep -Milliseconds 300

$flatQuery = ($Query -replace '\s+', ' ').Trim()
$escapedQuery = Escape-SendKeys $flatQuery
Write-Output "Typing query..."
[System.Windows.Forms.SendKeys]::SendWait($escapedQuery)
Start-Sleep -Milliseconds 500

Write-Output "Executing (F5)..."
[System.Windows.Forms.SendKeys]::SendWait("{F5}")
Start-Sleep -Seconds $WaitSeconds

Write-Output "Capturing screenshot..."
$rect = New-Object SsmsCaptureWin32+RECT
[SsmsCaptureWin32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

if ($width -le 0 -or $height -le 0) {
    Write-Error "Could not read a valid SSMS window size — is the window minimized?"
    exit 1
}

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))

$outDir = Split-Path -Path $OutputPath -Parent
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Saved screenshot to $OutputPath"
