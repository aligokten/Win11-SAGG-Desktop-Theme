# SAGG Desktop Theme - native helper.
# Long-running process: reads one command per line on stdin, writes JSON lines on stdout.
# Keep this file ASCII-only and C# 5 compatible (Windows PowerShell 5.1).
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$src = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class SaggNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct APPBARDATA {
    public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge;
    public RECT rc; public IntPtr lParam;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }

  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("shell32.dll")] public static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode)]
  public static extern bool SpiRect(uint action, uint param, ref RECT r, uint flags);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode)]
  public static extern bool SpiStr(uint action, uint param, string s, uint flags);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

  public static bool IsFullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return false;
    StringBuilder sb = new StringBuilder(256);
    GetClassName(h, sb, 256);
    string cls = sb.ToString();
    if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return false;
    if (IsZoomed(h)) return false;
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    IntPtr mon = MonitorFromWindow(h, 2);
    MONITORINFO mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(mon, ref mi)) return false;
    return Math.Abs(r.Left - mi.rcMonitor.Left) <= 1 && Math.Abs(r.Top - mi.rcMonitor.Top) <= 1
        && Math.Abs(r.Right - mi.rcMonitor.Right) <= 1 && Math.Abs(r.Bottom - mi.rcMonitor.Bottom) <= 1;
  }

  public static void TaskbarAutoHide(bool on) {
    APPBARDATA d = new APPBARDATA();
    d.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    d.hWnd = FindWindow("Shell_TrayWnd", null);
    d.lParam = (IntPtr)(on ? 1 : 2);
    SHAppBarMessage(10, ref d);
  }

  public static bool IsTaskbarAutoHide() {
    APPBARDATA d = new APPBARDATA();
    d.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    return (SHAppBarMessage(4, ref d).ToUInt64() & 1) == 1;
  }

  public static void AppBarSet(long hwnd, int px, bool register) {
    APPBARDATA d = new APPBARDATA();
    d.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    d.hWnd = new IntPtr(hwnd);
    if (register) { d.uCallbackMessage = 0x8000 + 0x3F1; SHAppBarMessage(0, ref d); }
    int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
    d.uEdge = 3;
    d.rc.Left = 0; d.rc.Right = w; d.rc.Top = h - px; d.rc.Bottom = h;
    SHAppBarMessage(2, ref d);
    d.rc.Top = d.rc.Bottom - px;
    SHAppBarMessage(3, ref d);
  }

  public static void AppBarRemove(long hwnd) {
    APPBARDATA d = new APPBARDATA();
    d.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    d.hWnd = new IntPtr(hwnd);
    SHAppBarMessage(1, ref d);
  }

  public static RECT GetWorkArea() {
    RECT r = new RECT();
    SpiRect(0x30, 0, ref r, 0);
    return r;
  }

  public static void SetWorkArea(RECT r) { SpiRect(0x2F, 0, ref r, 2); }

  public static void SetWallpaper(string path) { SpiStr(20, 0, path, 3); }

  public static void PressWin() {
    keybd_event(0x5B, 0, 0, UIntPtr.Zero);
    keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }

  public static void SendToBottom(long hwnd) {
    SetWindowPos(new IntPtr(hwnd), new IntPtr(1), 0, 0, 0, 0, 0x13);
  }
}
"@

$nativeOk = $true
try { Add-Type -TypeDefinition $src -ErrorAction Stop } catch { $nativeOk = $false }
try { [void][SaggNative]::SetProcessDPIAware() } catch {}

function Emit($obj) {
  try {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } catch {}
}

$script:reserved = $false
$script:barHwnd = 0
$script:taskbarHidden = $false

# Undo every system change we made; called on quit and when the parent process dies.
function Restore-All {
  Set-Reserve 0 0
  if ($script:taskbarHidden) {
    try { [SaggNative]::TaskbarAutoHide($false) } catch {}
    $script:taskbarHidden = $false
  }
}

# Reserve a strip at the bottom of the primary screen by registering the dock window as an AppBar.
function Set-Reserve([long]$hwnd, [int]$px) {
  try {
    if ($px -le 0 -or $hwnd -eq 0) {
      if ($script:reserved) { [SaggNative]::AppBarRemove($script:barHwnd) }
      $script:reserved = $false
      return
    }
    if ($script:reserved -and $script:barHwnd -ne $hwnd) { [SaggNative]::AppBarRemove($script:barHwnd); $script:reserved = $false }
    [SaggNative]::AppBarSet($hwnd, $px, (-not $script:reserved))
    $script:barHwnd = $hwnd
    $script:reserved = $true
  } catch {}
}

function Invoke-Command-Line([string]$line) {
  $line = $line.Trim()
  if ($line.Length -eq 0) { return }
  $idx = $line.IndexOf(' ')
  if ($idx -lt 0) { $cmd = $line; $arg = '' } else { $cmd = $line.Substring(0, $idx); $arg = $line.Substring($idx + 1).Trim() }
  try {
    switch ($cmd) {
      'taskbar'   { [SaggNative]::TaskbarAutoHide($arg -eq '1'); $script:taskbarHidden = ($arg -eq '1') }
      'reserve'   { $p = $arg.Split(' '); Set-Reserve ([long]$p[0]) ([int]$p[1]) }
      'start'     { [SaggNative]::PressWin() }
      'wallpaper' { [SaggNative]::SetWallpaper($arg) }
      'bottom'    { [SaggNative]::SendToBottom([long]$arg) }
      'query'     {
        $w = [SaggNative]::GetWorkArea()
        Emit @{ t = 'info'; autohide = [bool][SaggNative]::IsTaskbarAutoHide(); work = @($w.Left, $w.Top, $w.Right, $w.Bottom)
                screen = @([SaggNative]::GetSystemMetrics(0), [SaggNative]::GetSystemMetrics(1)) }
      }
      'quit'      { Restore-All; exit 0 }
    }
  } catch {
    Emit @{ t = 'error'; cmd = $cmd; message = "$($_.Exception.Message)" }
  }
}

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), (New-Object System.Text.UTF8Encoding($false)))
$lastState = ''
Emit @{ t = 'ready'; native = $nativeOk }

$task = $stdin.ReadLineAsync()
$nextTick = [DateTime]::UtcNow
while ($true) {
  $got = $false
  try { $got = $task.Wait(250) } catch { $got = $true }
  if ($got) {
    $line = $null
    try { $line = $task.Result } catch {}
    if ($line -eq $null) { Restore-All; exit 0 }   # parent closed stdin
    Invoke-Command-Line $line
    $task = $stdin.ReadLineAsync()
  }
  if ([DateTime]::UtcNow -ge $nextTick) {
    $nextTick = [DateTime]::UtcNow.AddMilliseconds(2000)
    $fs = $false
    try { $fs = [SaggNative]::IsFullscreen() } catch {}
    $names = @()
    try {
      $names = @(Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
        ForEach-Object { $_.ProcessName.ToLower() + '.exe' } | Sort-Object -Unique)
    } catch {}
    $key = "$fs|" + ($names -join ',')
    if ($key -ne $lastState) {
      $lastState = $key
      Emit @{ t = 'state'; fullscreen = [bool]$fs; procs = $names }
    }
  }
}
