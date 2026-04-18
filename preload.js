const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accademiaAdmin', {
  getAppInfo: async () => ipcRenderer.invoke('accademia-admin:get-app-info'),
  storage: {
    loadState: async () => ipcRenderer.invoke('accademia-admin:load-state'),
    saveState: async (raw) => ipcRenderer.invoke('accademia-admin:save-state', { raw }),
    saveStateSync: (raw) => ipcRenderer.sendSync('accademia-admin:save-state-sync', { raw }),
    exportBackup: async (raw, defaultFileName) => ipcRenderer.invoke('accademia-admin:export-backup', { raw, defaultFileName }),
    saveExportFile: async (payload) => ipcRenderer.invoke('accademia-admin:save-export-file', payload),
    importBackup: async () => ipcRenderer.invoke('accademia-admin:import-backup'),
    revealStateFolder: async () => ipcRenderer.invoke('accademia-admin:reveal-state-folder'),
    exportDocx: async (payload) => ipcRenderer.invoke('accademia-admin:export-docx', payload),
    exportPdf: async (payload) => ipcRenderer.invoke('accademia-admin:export-pdf', payload)
  },
  diagnostics: {
    runPreflightCheck: async () => ipcRenderer.invoke('accademia-admin:run-preflight-check')
  }
});
