Dim WshShell, fso, projectPath, found, drive
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

found = False
Dim drives(5)
drives(0) = "D"
drives(1) = "E"
drives(2) = "F"
drives(3) = "G"
drives(4) = "H"
drives(5) = "I"

For Each drive In drives
    projectPath = drive & ":\accademia\accademia-admin-desktop"
    If fso.FolderExists(projectPath) Then
        WshShell.CurrentDirectory = projectPath
        WshShell.Run "cmd /c npm start", 0, False
        found = True
        Exit For
    End If
Next

If Not found Then
    MsgBox "Cartella accademia-admin-desktop non trovata. Verifica che l'hard disk esterno sia collegato.", 16, "AccademIA Desktop"
End If

Set WshShell = Nothing
Set fso = Nothing
