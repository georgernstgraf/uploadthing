echo "Capturing Screenshots"
ipconfig /all > captures\ipconfig.txt
nircmd.exe loop 1000 36000 savescreenshot captures\nir_~$currdate.yyyy-MM-dd$_~$currtime.HH_mm_ss$.png
pause
