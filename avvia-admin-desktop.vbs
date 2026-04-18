Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\accademia\accademia-admin-desktop"
WshShell.Run "cmd /c npm start", 0, False
Set WshShell = Nothing
