import { app, BrowserWindow, dialog, Menu, protocol, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_SCHEME, APP_URL, WINDOW_SECURITY, allowDownload, allowNavigation, lockSession } from './policy.mjs';
import { createAssetHandler } from './assets.mjs';

// No development URL, server, updater, telemetry, preload bridge or renderer Node API.
app.enableSandbox();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('no-pings');
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

/** @type {BrowserWindow | undefined} */
let window;
/** @type {import('electron').Session | undefined} */
let localSession;
function createWindow() {
  if (!localSession) throw new Error('Local session is not ready.');
  window = new BrowserWindow({
    title: 'Privacy X-Ray Desktop', width: 1280, height: 900, minWidth: 820, minHeight: 650,
    show: false, backgroundColor: '#f7f7fc',
    webPreferences: { ...WINDOW_SECURITY, session: localSession },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => { if (!allowNavigation(event.url)) event.preventDefault(); });
  window.webContents.on('will-frame-navigate', event => { if (!event.isMainFrame || !allowNavigation(event.url)) event.preventDefault(); });
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = undefined; });
  void window.loadURL(APP_URL).catch(() => {
    dialog.showErrorBox('Privacy X-Ray could not start', 'The local application could not be loaded. Reinstall the complete application.');
    app.quit();
  });
}

app.whenReady().then(async () => {
  lockSession(session.defaultSession);
  // A fresh, non-persistent partition: no browser history, cookies or model cache on disk.
  localSession = session.fromPartition(`privacy-xray-${randomUUID()}`, { cache: false });
  lockSession(localSession);
  const manifest = JSON.parse(await readFile(join(app.getAppPath(), 'asset-manifest.json'), 'utf8'));
  const handler = await createAssetHandler(join(app.getAppPath(), 'web'), manifest);
  localSession.protocol.handle(APP_SCHEME, handler);
  localSession.on('will-download', (event, item) => {
    if (!allowDownload(item.getURL(), item.getMimeType())) { event.preventDefault(); return; }
    item.setSaveDialogOptions({
      title: 'Save covered image', defaultPath: 'privacy-redacted.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
  });
  app.on('login', event => event.preventDefault());
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const menu = [
    { role: 'fileMenu' }, { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  if (process.platform === 'darwin') menu.unshift({ role: 'appMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}).catch(() => {
  dialog.showErrorBox('Privacy X-Ray installation is incomplete', 'A bundled file is missing or damaged. Reinstall the complete application. No files were sent to a server.');
  app.quit();
});

app.on('window-all-closed', () => app.quit());
