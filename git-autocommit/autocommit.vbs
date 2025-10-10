Option Explicit

Dim sh, fso, scriptDir, rc, intervalMs
Dim localAppData, logDir, logPath

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

' 5 minutes in milliseconds
intervalMs = 300000

Do
  ' Append stdout and stderr of both commands to the log
  rc = sh.Run( _
    "cmd.exe /c ""git add . >> " & Q(logPath) & " 2>&1""", _
    0, True _
  )

  rc = sh.Run( _
    "cmd.exe /c ""git commit -m """"autocommit"""" >> " & _
      Q(logPath) & " 2>&1""", _
    0, True _
  )

  WScript.Sleep intervalMs
Loop
