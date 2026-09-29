param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('wait', 'screenshot', 'searchshot')]
  [string]$Action,

  [string]$DestPath = '',
  [string]$SearchQuery = '',
  [int]$TimeoutSec = 300
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class OutlookNative {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static List<string> WindowDump() {
    var rows = new List<string>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      rows.Add(pid + "|" + sb.ToString());
      return true;
    }, IntPtr.Zero);
    return rows;
  }

  public static IntPtr FindMailWindow() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
      var title = sb.ToString();
      if (title.IndexOf("Outlook", StringComparison.OrdinalIgnoreCase) >= 0 &&
          (title.IndexOf("Mail", StringComparison.OrdinalIgnoreCase) >= 0 ||
           title.IndexOf("Inbox", StringComparison.OrdinalIgnoreCase) >= 0 ||
           title.IndexOf("Search", StringComparison.OrdinalIgnoreCase) >= 0)) {
        found = hWnd;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static string TitleOf(IntPtr hWnd) {
    var sb = new StringBuilder(512);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }

  public static void ClickScreen(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
  }
}
"@

function Get-MailHwnd {
  $hwnd = [OutlookNative]::FindMailWindow()
  if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
  $proc = Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -match 'Outlook' -and $_.MainWindowTitle -match 'Mail|Inbox|Search' } |
    Select-Object -First 1
  if ($proc) { return $proc.MainWindowHandle }
  return [IntPtr]::Zero
}

function Wait-MailWindow([int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    $hwnd = Get-MailHwnd
    if ($hwnd -ne [IntPtr]::Zero) {
      $title = [OutlookNative]::TitleOf($hwnd)
      Write-Host "Outlook window ready: $title"
      return $hwnd
    }
    Start-Sleep -Seconds 2
  }
  $dump = [OutlookNative]::WindowDump() | Where-Object { $_ -match 'Outlook|Mail|Chrome|Sign in' }
  Write-Error "Outlook did not finish loading. Visible windows: $($dump -join ' || ')"
}

function Escape-SendKeys([string]$text) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $text.ToCharArray()) {
    switch ($ch) {
      '+' { [void]$sb.Append('{+}'); break }
      '^' { [void]$sb.Append('{^}'); break }
      '%' { [void]$sb.Append('{%}'); break }
      '~' { [void]$sb.Append('{~}'); break }
      '(' { [void]$sb.Append('{(}'); break }
      ')' { [void]$sb.Append('{)}'); break }
      '{' { [void]$sb.Append('{{}'); break }
      '}' { [void]$sb.Append('{}}'); break }
      '[' { [void]$sb.Append('{[}'); break }
      ']' { [void]$sb.Append('{]}'); break }
      default { [void]$sb.Append($ch); break }
    }
  }
  return $sb.ToString()
}

function Save-WindowPng([IntPtr]$hwnd, [string]$path) {
  Add-Type -AssemblyName System.Drawing
  $rect = New-Object OutlookNative+RECT
  [void][OutlookNative]::GetWindowRect($hwnd, [ref]$rect)
  $width = [Math]::Max(1, $rect.Right - $rect.Left)
  $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bmp.Dispose()
}

function Focus-OutlookSearchBar([IntPtr]$hwnd) {
  [void][OutlookNative]::ShowWindow($hwnd, 9)
  [void][OutlookNative]::SetForegroundWindow($hwnd)
  Start-Sleep -Seconds 2

  # IMPORTANT: Do NOT use Ctrl+E / Ctrl+L / Ctrl+K — those focus Chrome's address bar.
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $scope = [System.Windows.Automation.TreeScope]::Descendants

  $candidates = @()

  $nameSearch = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, 'Search')
  $editType = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit)
  $comboType = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::ComboBox)

  $andEdit = New-Object System.Windows.Automation.AndCondition($nameSearch, $editType)
  $andCombo = New-Object System.Windows.Automation.AndCondition($nameSearch, $comboType)

  foreach ($cond in @($andEdit, $andCombo, $nameSearch, $editType)) {
    $found = $root.FindAll($scope, $cond)
    if ($found -and $found.Count -gt 0) {
      for ($i = 0; $i -lt $found.Count; $i++) {
        $el = $found.Item($i)
        $n = $el.Current.Name
        $ct = $el.Current.ControlType.ProgrammaticName
        # Skip Chrome omnibox / address bar heuristics
        if ($n -match 'Address|Omnibox|URL|Open with') { continue }
        if ($ct -match 'Edit|ComboBox' -or $n -eq 'Search') {
          $candidates += $el
        }
      }
    }
    if ($candidates.Count -gt 0) { break }
  }

  if ($candidates.Count -gt 0) {
    $el = $candidates[0]
    try {
      $point = $el.GetClickablePoint()
      Write-Host ("Outlook: clicking on-screen Search control at {0},{1}" -f $point.X, $point.Y)
      [OutlookNative]::ClickScreen([int]$point.X, [int]$point.Y)
      Start-Sleep -Milliseconds 500
      try { $el.SetFocus() } catch {}
      return $true
    } catch {
      Write-Host "Outlook: Search UIA click failed ($($_.Exception.Message)); falling back to coordinates."
    }
  }

  # Fallback: click the center of the Outlook header search area (below Chrome tabs/omnibox).
  $rect = New-Object OutlookNative+RECT
  [void][OutlookNative]::GetWindowRect($hwnd, [ref]$rect)
  $x = [int](($rect.Left + $rect.Right) / 2)
  $y = [int]($rect.Top + 95)
  Write-Host ("Outlook: clicking Search region by coordinates {0},{1}" -f $x, $y)
  [OutlookNative]::ClickScreen($x, $y)
  Start-Sleep -Milliseconds 600
  return $true
}

function Invoke-OutlookSearch([IntPtr]$hwnd, [string]$query) {
  Focus-OutlookSearchBar $hwnd | Out-Null
  Start-Sleep -Milliseconds 400

  # Clear any existing text, type into the focused Outlook search box.
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $query))
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Write-Host "Outlook: submitted on-screen search for [$query]"
  Start-Sleep -Seconds 6

  # Open the first result.
  [System.Windows.Forms.SendKeys]::SendWait('{DOWN}')
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Seconds 4
}

if ($Action -eq 'wait') {
  [void](Wait-MailWindow $TimeoutSec)
  exit 0
}

if ($Action -eq 'screenshot') {
  if (-not $DestPath) {
    Write-Error 'DestPath is required for screenshot.'
    exit 1
  }
  $hwnd = Wait-MailWindow $TimeoutSec
  [void][OutlookNative]::ShowWindow($hwnd, 9)
  [void][OutlookNative]::SetForegroundWindow($hwnd)
  Start-Sleep -Seconds 3
  Save-WindowPng $hwnd $DestPath
  Write-Host "Outlook: screenshot $DestPath"
  exit 0
}

if ($Action -eq 'searchshot') {
  if (-not $DestPath) {
    Write-Error 'DestPath is required for searchshot.'
    exit 1
  }
  if (-not $SearchQuery) {
    Write-Error 'SearchQuery is required for searchshot.'
    exit 1
  }
  $hwnd = Wait-MailWindow $TimeoutSec
  Invoke-OutlookSearch $hwnd $SearchQuery
  Save-WindowPng $hwnd $DestPath
  Write-Host "Outlook: screenshot $DestPath"
  exit 0
}
