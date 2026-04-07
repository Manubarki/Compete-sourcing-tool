const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  analyze:    (jd)  => ipcRenderer.invoke("analyze", jd),
  getUsage:   ()    => ipcRenderer.invoke("get-usage"),
  resetUsage: ()    => ipcRenderer.invoke("reset-usage"),
  getConfig:  ()    => ipcRenderer.invoke("get-config"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
});
