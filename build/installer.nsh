!macro customInstall
  CreateShortCut "$DESKTOP\Dots.lnk" "$INSTDIR\Dots.exe" "" "$INSTDIR\resources\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Dots.lnk" "$INSTDIR\Dots.exe" "" "$INSTDIR\resources\icon.ico" 0
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0x1000, 0, 0)'
!macroend
