# Automates an already-open, already-connected SSMS window: opens a new
# query tab on the existing connection, types the given query, executes it,
# and screenshots the SSMS window. Windows-only (SSMS itself is Windows-only).
#
# Deliberately does NOT launch or log into SSMS - it expects a window titled
# "...Microsoft SQL Server Management Studio" to already be open and
# connected (the common case: VDI sessions persist SSMS across reconnects).
# If none is found, it fails fast with a clear message instead of guessing.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ssms-capture.ps1 `
#     -QueryFile "temp\query.sql" `
#     -OutputPath "temp\My_Rush_Jobs.png"
#
# The query is read from a file rather than accepted as a -Query string
# argument: powershell.exe's -File mode re-tokenizes the trailing argument
# list with PowerShell's own quoting/statement-separator rules, so a SQL
# query containing single quotes, a semicolon, or brackets gets mangled
# (the semicolon reads as a new statement) even when the caller passes it
# as one correctly-escaped argv entry.

param(
    [Parameter(Mandatory = $true)][string]$QueryFile,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [int]$WaitSeconds = 4
)

$Query = Get-Content -Raw -Path $QueryFile

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

# New query tab on the SAME connection - no re-login needed.
Write-Output "Opening a new query tab..."
[System.Windows.Forms.SendKeys]::SendWait("^n")
Start-Sleep -Milliseconds 1000

# Clear anything already in the tab, then paste the query.
[System.Windows.Forms.SendKeys]::SendWait("^a")
[System.Windows.Forms.SendKeys]::SendWait("{DEL}")
Start-Sleep -Milliseconds 300

# Paste via the clipboard instead of typing character-by-character with
# SendKeys - a clipboard paste is one atomic OS operation regardless of how
# long the text is, sidestepping SendKeys' per-line-no-chunking behavior
# (originally suspected as the corruption cause here) and the IntelliSense-
# popup-eats-Enter risk entirely.
#
# Confirmed live (2026-09-21) that SendKeys/SSMS/the clipboard content were
# all NOT the actual problem: the same clipboard content pasted perfectly
# both in Notepad and via a MANUAL Ctrl+V into SSMS. What differed in the
# automated run was timing - this script only waited a fixed 300ms between
# Set-Clipboard and sending ^v, while manually reaching SSMS to paste took
# much longer without anyone timing it. That's not reliably enough for the
# clipboard to fully propagate over the Citrix/RDP session in every case.
# Poll the actual clipboard content instead of guessing at a fixed delay -
# both more robust (won't paste before it's ready) and no slower than
# necessary (won't wait once it already is).
Write-Output "Pasting query..."
Set-Clipboard -Value $Query
$clipboardReady = $false
$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline) {
    if ((Get-Clipboard -Raw) -eq $Query) {
        $clipboardReady = $true
        break
    }
    Start-Sleep -Milliseconds 100
}
if (-not $clipboardReady) {
    Write-Error "Clipboard never reflected the query text within 10s - aborting rather than pasting stale/wrong content."
    exit 1
}
[System.Windows.Forms.SendKeys]::SendWait("^v")
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
    Write-Error "Could not read a valid SSMS window size - is the window minimized?"
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
