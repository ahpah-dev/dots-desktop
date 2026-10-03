$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$ShortcutPath = Join-Path $DesktopPath "Dots.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "C:\Users\David\Downloads\New folder (16)\release\win-unpacked\Dots.exe"
$Shortcut.WorkingDirectory = "C:\Users\David\Downloads\New folder (16)\release\win-unpacked"
$Shortcut.IconLocation = "C:\Users\David\Downloads\New folder (16)\assets\icon.ico,0"
$Shortcut.Description = "Dots - Persistent Autonomous AI Agents"
$Shortcut.Save()
Write-Output "Shortcut created at $ShortcutPath"
