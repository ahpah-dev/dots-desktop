$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutPath = Join-Path $DesktopPath "Dots.lnk"

# Ensure icon.ico exists in stable AppData directory
$appDataDots = Join-Path $env:APPDATA "Dots"
if (-not (Test-Path $appDataDots)) {
    New-Item -ItemType Directory -Path $appDataDots -Force | Out-Null
}
$stableIconPath = Join-Path $appDataDots "icon.ico"
$sourceIcon = Join-Path $PSScriptRoot "..\assets\icon.ico"
if (Test-Path $sourceIcon) {
    Copy-Item $sourceIcon -Destination $stableIconPath -Force
}

$installedExe = "C:\Program Files\Dots\Dots.exe"
$unpackedExe = Join-Path $PSScriptRoot "..\release\win-unpacked\Dots.exe"

$targetExe = if (Test-Path $installedExe) { $installedExe } else { $unpackedExe }
$workingDir = Split-Path $targetExe -Parent

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $targetExe
$Shortcut.WorkingDirectory = $workingDir
$Shortcut.IconLocation = "$stableIconPath,0"
$Shortcut.Description = "Dots - Persistent Autonomous AI Agents"
$Shortcut.Save()

# Remove any orphaned public shortcut that might have stale icon
$publicLnk = "C:\Users\Public\Desktop\Dots.lnk"
if (Test-Path $publicLnk) {
    Remove-Item $publicLnk -Force -ErrorAction SilentlyContinue
}

# Flush shell icon cache so the new icon appears immediately
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ShellNotifier2 {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellNotifier2]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "Shortcut created at $ShortcutPath with icon $stableIconPath"
