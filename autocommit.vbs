Option Explicit

Dim sh, fso, scriptDir, rc, intervalMs
Dim localAppData, logDir, logPath, lockPath
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
lockPath = fso.BuildPath(logDir, "autocommit.lock")

Function Q(s)
  Q = """" & s & """"
End Function

Sub LogMessage(msg)
  Dim logFile, ts
  On Error Resume Next
  Set logFile = fso.GetFile(logPath)
  Set ts = logFile.OpenAsTextStream(8) ' 8 = ForAppending
  If Err.Number = 0 Then
    ts.WriteLine Now & " - " & msg
    ts.Close
  End If
  On Error Goto 0
End Sub

' Check if another instance is running
If fso.FileExists(lockPath) Then
  LogMessage "Instance already running"
  WScript.Quit 1
End If

' Create lock file
On Error Resume Next
fso.CreateTextFile(lockPath, True).Close
If Err.Number <> 0 Then
  ' Log the error if possible, then exit
  LogMessage "Failed to create lock file"
  WScript.Quit 1
End If
On Error Goto 0

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

' 5 minutes in milliseconds
intervalMs = 300000

Do
  ' Stage changes
  rc = sh.Run( _
    "cmd.exe /c ""git add . >> " & Q(logPath) & " 2>&1""", _
    0, True _
  )

  ' Check if there are staged changes
  rc = sh.Run("cmd.exe /c git diff --cached --quiet >nul 2>&1", 0, True)

  If rc = 0 Then
    ' No staged changes - create empty commit
    rc = sh.Run( _
      "cmd.exe /c ""git commit --allow-empty -m """"empty"""" >> " & _
      Q(logPath) & " 2>&1""", _
      0, True _
    )
  Else
    ' Staged changes exist - commit normally
    rc = sh.Run( _
      "cmd.exe /c ""git commit -m """"autocommit"""" >> " & _
      Q(logPath) & " 2>&1""", _
      0, True _
    )
  End If

  WScript.Sleep intervalMs
Loop
