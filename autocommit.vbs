Option Explicit

Dim sh, fso, scriptDir, rc, intervalMs
Dim localAppData, logDir, logPath
Dim accountName, userName, userEmail

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Work in the folder where this .vbs resides (repo root)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = scriptDir

' Log file: %LOCALAPPDATA%\autocommit\autocommit.log
localAppData = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
logDir = fso.BuildPath(localAppData, "autocommit")
If Not fso.FolderExists(logDir) Then
  fso.CreateFolder logDir
End If
logPath = fso.BuildPath(logDir, "autocommit.log")

Function Q(s)
  Q = """" & s & """"
End Function

' Build identity from the Windows account name
accountName = sh.ExpandEnvironmentStrings("%USERNAME%")
userName = accountName
userEmail = accountName & "@plf.spengergasse.at"

' Configure Git globally if missing
rc = sh.Run("cmd.exe /c git config --global --get user.name >nul 2>&1", 0, True)
If rc <> 0 Then
  rc = sh.Run( _
    "cmd.exe /c ""git config --global user.name " & Q(userName) & _
    " >> " & Q(logPath) & " 2>&1""", 0, True _
  )
End If

rc = sh.Run("cmd.exe /c git config --global --get user.email >nul 2>&1", 0, True)
If rc <> 0 Then
  rc = sh.Run( _
    "cmd.exe /c ""git config --global user.email " & Q(userEmail) & _
    " >> " & Q(logPath) & " 2>&1""", 0, True _
  )
End If

' 30 seconds in milliseconds
intervalMs = 30000

Do
  ' Stage changes
  rc = sh.Run( _
    "cmd.exe /c ""git add . >> " & Q(logPath) & " 2>&1""", _
    0, True _
  )

  ' Commit; non-zero exit is fine when there's nothing to commit
  rc = sh.Run( _
    "cmd.exe /c ""git commit -m """"autocommit"""" >> " & _
    Q(logPath) & " 2>&1""", _
    0, True _
  )

  WScript.Sleep intervalMs
Loop
