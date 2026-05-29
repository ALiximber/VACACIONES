const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vacacionesData', {
  getEmployees: () => ipcRenderer.invoke('vacaciones:get-employees'),
  getVacations: () => ipcRenderer.invoke('vacaciones:get-vacations'),
  getEmployeeDatabase: () => ipcRenderer.invoke('vacaciones:get-employee-database'),
  getConfig: () => ipcRenderer.invoke('vacaciones:get-config'),
  saveEmployees: (employees) => ipcRenderer.invoke('vacaciones:save-employees', employees),
  saveVacations: (records) => ipcRenderer.invoke('vacaciones:save-vacations', records),
  saveEmployeeDatabase: (database) => ipcRenderer.invoke('vacaciones:save-employee-database', database),
  getSyncStatus: () => ipcRenderer.invoke('vacaciones:get-sync-status'),
  syncNow: () => ipcRenderer.invoke('vacaciones:sync-now'),
  log: (entry) => ipcRenderer.invoke('vacaciones:log', entry),
  getLogPath: () => ipcRenderer.invoke('vacaciones:get-log-path'),
  onDataUpdated: (callback) => {
    ipcRenderer.on('vacaciones:data-updated', (_event, payload) => callback(payload));
  },
  onCloudUpdated: (callback) => {
    ipcRenderer.on('vacaciones:cloud-updated', (_event, payload) => callback(payload));
  },
  onSyncStatus: (callback) => {
    ipcRenderer.on('vacaciones:sync-status', (_event, status) => callback(status));
  },
});
