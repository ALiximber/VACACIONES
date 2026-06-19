// Proceso principal de Electron (Node.js).
// Es el "backend" de la app: gestiona archivos JSON, sincronización con la nube
// y sincronización LAN entre equipos en la misma red local.
// Se comunica con la interfaz (index.js) a través de IPC (ipcMain/ipcRenderer).
const { app, BrowserWindow, ipcMain } = require('electron');
const { createHash, randomUUID } = require('node:crypto');
const dgram = require('node:dgram');
const fsNative = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow = null;
let apiConfig = null;
let syncTimer = null;
let lanDiscoverySocket = null;
let lanHttpServer = null;
let lanAnnouncementTimer = null;
let lanHttpPort = null;
const fileWatchListeners = new Map();
const lanPeers = new Map();
const lanPullInFlight = new Map();

const scheduleDays = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const reasonJsonKeys = {
  V: 'vacaciones',
  D: 'descansos_trabajados',
  I: 'incapacidades',
  P: 'permisos',
};
const knownVacationJsonKeys = Object.values(reasonJsonKeys);
const employeeCivilStatuses = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Union Libre'];
const employeeBloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const employeePhoneTypes = ['Personal', 'Emergencia1', 'Emergencia2', 'Casa'];
const syncSourceId = randomUUID();
const syncPollIntervalMs = 600000;
const syncRequestTimeoutMs = 15000;
const lanSyncAppId = 'vacaciones-lan-sync-v1';
const lanSyncDiscoveryPort = 41234;
const lanSyncHttpPreferredPort = 41235;
const lanSyncAnnouncementIntervalMs = 5000;
const lanSyncPeerTimeoutMs = 20000;
const lanSyncRequestTimeoutMs = 10000;
const lanSyncMaxPayloadBytes = 1024 * 1024;
// ─── ESTADO DE SINCRONIZACIÓN ────────────────────────────────────────────────
// Refleja el estado actual de cada dataset (empleados, vacaciones, expedientes)
// respecto a la nube. La UI lo consulta para mostrar el indicador de sincronización.
const syncState = {
  enabled: false,
  lastSyncAt: null,
  lastError: null,
  datasets: {
    employees: {
      label: 'Empleados',
      syncing: false,
      pendingUpload: false,
      lastDownloadAt: null,
      lastUploadAt: null,
      lastError: null,
    },
    vacations: {
      label: 'Vacaciones',
      syncing: false,
      pendingUpload: false,
      lastDownloadAt: null,
      lastUploadAt: null,
      lastError: null,
    },
    employeeDatabase: {
      label: 'Base empleados',
      syncing: false,
      pendingUpload: false,
      lastDownloadAt: null,
      lastUploadAt: null,
      lastError: null,
    },
  },
};
const datasetDefinitions = {
  employees: {
    configName: 'EMPLEADOS',
    fileName: 'empleados.json',
    fallback: { empleados: [] },
  },
  vacations: {
    configName: 'VACACIONES',
    fileName: 'vacaciones.json',
    fallback: { vacaciones: [], descansos_trabajados: [], incapacidades: [], permisos: [] },
  },
  employeeDatabase: {
    configName: 'EMPLEADOS_BD',
    fileName: 'empleados_bd.json',
    fallback: { empleados: [], puestos: [], areas: [], tiendas: [], telefonos: [], alergias: [] },
  },
};

// ─── RUTAS DE ARCHIVOS ───────────────────────────────────────────────────────
// En producción (app empaquetada), los datos del usuario se guardan en la carpeta
// userData de Electron para no mezclar con los archivos de la app instalada.
// En desarrollo (__dirname) los archivos están junto al código fuente.
const bundledDataFilePath = (fileName) => path.join(__dirname, fileName);
const dataDirectoryPath = () => (app.isPackaged ? app.getPath('userData') : __dirname);
const dataFilePath = (fileName) => path.join(dataDirectoryPath(), fileName);
const logDirectoryPath = () => path.join(dataDirectoryPath(), 'logs');
const logFilePath = () => path.join(logDirectoryPath(), 'vacaciones.log');
const previousLogFilePath = () => path.join(logDirectoryPath(), 'vacaciones.previous.log');
const logLevels = new Set(['debug', 'info', 'warn', 'error']);
const maxLogFileSizeBytes = 2 * 1024 * 1024;
const sensitiveLogKeys = new Set([
  'apikey',
  'apiendpoint',
  'authorization',
  'editkey',
  'password',
  'rawendpoint',
  'secret',
  'token',
]);
const writableDataFileNames = [
  'configapi.txt',
  'configuracion.json',
  ...Object.values(datasetDefinitions).map((definition) => definition.fileName),
];
let writableDataFilesReady = false;

const isSensitiveLogKey = (key) => sensitiveLogKeys.has(String(key).toLowerCase());

const errorToLogDetails = (error) => {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
  }

  if (typeof error === 'object') {
    return safeLogValue(error);
  }

  return { message: String(error) };
};

const safeLogValue = (value, depth = 0) => {
  if (value instanceof Error) {
    return errorToLogDetails(value);
  }

  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }

  if (depth >= 4) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => safeLogValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .slice(0, 50)
      .reduce((result, [key, item]) => {
        result[key] = isSensitiveLogKey(key) ? '[redacted]' : safeLogValue(item, depth + 1);
        return result;
      }, {});
  }

  return String(value);
};

// ─── SISTEMA DE LOGGING ──────────────────────────────────────────────────────
// Escribe una línea por evento en un archivo .log con rotación automática
// al superar 2 MB. Las claves sensibles (apikey, token, etc.) se redactan.
const rotateLogFileIfNeeded = async () => {
  try {
    const stats = await fs.stat(logFilePath());

    if (stats.size < maxLogFileSizeBytes) {
      return;
    }

    await fs.rm(previousLogFilePath(), { force: true });
    await fs.rename(logFilePath(), previousLogFilePath());
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const writeAppLog = async (level, message, details = null) => {
  const safeLevel = logLevels.has(level) ? level : 'info';
  const timestamp = new Date().toISOString();
  const safeMessage = String(message || 'Evento sin mensaje').replace(/\s+/g, ' ').trim();
  const safeDetails = details == null ? null : safeLogValue(details);
  const detailsText = safeDetails == null ? '' : ` ${JSON.stringify(safeDetails)}`;
  const line = `[${timestamp}] [${safeLevel.toUpperCase()}] ${safeMessage}${detailsText}\n`;

  await fs.mkdir(logDirectoryPath(), { recursive: true });
  await rotateLogFileIfNeeded();
  await fs.appendFile(logFilePath(), line, 'utf8');

  const consoleMethod = safeLevel === 'error' ? 'error' : safeLevel === 'warn' ? 'warn' : 'log';
  console[consoleMethod](`[Vacaciones] ${safeMessage}`, safeDetails || '');
};

const logAppEvent = (level, message, details = null) => {
  writeAppLog(level, message, details).catch(() => {});
};

process.on('uncaughtException', (error) => {
  logAppEvent('error', 'Excepcion no controlada en proceso principal', { error });
});

process.on('unhandledRejection', (reason) => {
  logAppEvent('error', 'Promesa rechazada no controlada en proceso principal', { reason });
});

// ─── GESTIÓN DE ARCHIVOS DE DATOS ───────────────────────────────────────────
// En una app empaquetada los archivos de la instalación son de solo lectura,
// por eso se copian a userData la primera vez y desde ahí se leen/escriben.
const ensureWritableDataFile = async (fileName) => {
  if (!app.isPackaged) {
    return;
  }

  const targetPath = dataFilePath(fileName);

  try {
    await fs.access(targetPath);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  let content = '';

  try {
    content = await fs.readFile(bundledDataFilePath(fileName), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const datasetDefinition = Object.values(datasetDefinitions).find((definition) => definition.fileName === fileName);
    content = fileName.endsWith('.json')
      ? `${JSON.stringify(datasetDefinition?.fallback || {}, null, 2)}\n`
      : '';
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
};

const ensureWritableDataFiles = async () => {
  if (writableDataFilesReady) {
    return;
  }

  await Promise.all(writableDataFileNames.map(ensureWritableDataFile));
  writableDataFilesReady = true;
};

// ─── LECTURA / ESCRITURA DE ARCHIVOS JSON ───────────────────────────────────
// Abstraen el acceso a disco; siempre aseguran que los archivos existan antes
// de leerlos y escriben con sangría de 2 espacios para que sean legibles.
const readJsonFile = async (fileName, fallback) => {
  await ensureWritableDataFiles();

  try {
    const content = await fs.readFile(dataFilePath(fileName), 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
};

const writeJsonFile = async (fileName, data) => {
  await ensureWritableDataFiles();
  await fs.mkdir(path.dirname(dataFilePath(fileName)), { recursive: true });
  await fs.writeFile(dataFilePath(fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const stableJson = (value) => JSON.stringify(value);

// ─── HELPERS DE SINCRONIZACIÓN CON LA NUBE ──────────────────────────────────
// Algunos servicios de hosting devuelven el JSON envuelto en texto extra o
// doblemente codificado; parseLastJsonDocument extrae el último JSON válido del string.
// incomingDatasetWins compara timestamps __sync.updatedAt para resolver conflictos:
// gana el dato más reciente sin importar de dónde venga.
const parseLastJsonDocument = (text) => {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastParsed = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) {
        startIndex = index;
      }

      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;

      if (depth === 0 && startIndex >= 0) {
        try {
          lastParsed = JSON.parse(text.slice(startIndex, index + 1));
        } catch (_error) {
          lastParsed = null;
        }
      }
    }
  }

  return lastParsed;
};

const decodeHostedJson = (value) => {
  let decoded = value;

  for (let attempt = 0; attempt < 3 && typeof decoded === 'string'; attempt += 1) {
    const text = decoded.trim();

    try {
      decoded = JSON.parse(text);
    } catch (_error) {
      const parsedDocument = parseLastJsonDocument(text);

      if (!parsedDocument) {
        break;
      }

      decoded = parsedDocument;
    }
  }

  return decoded;
};

const normalizeSyncMetadata = (metadata) =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : null;

const withSyncMetadata = (data, datasetKey, pendingUpload) => ({
  ...data,
  __sync: {
    ...(normalizeSyncMetadata(data.__sync) || {}),
    version: 1,
    dataset: datasetKey,
    source: syncSourceId,
    updatedAt: new Date().toISOString(),
    pendingUpload,
  },
});

const hasCloudSyncConfig = () =>
  Object.keys(datasetDefinitions).some((datasetKey) => Boolean(apiConfig?.[datasetKey]));

const setDatasetSyncState = (datasetKey, patch) => {
  syncState.datasets[datasetKey] = {
    ...syncState.datasets[datasetKey],
    ...patch,
  };
  syncState.enabled = hasCloudSyncConfig();
  syncState.lastError = Object.values(syncState.datasets).find((dataset) => dataset.lastError)?.lastError || null;
  emitSyncStatus();
};

const syncStatusSnapshot = () => JSON.parse(JSON.stringify(syncState));

const datasetUpdatedAt = (data) => normalizeSyncMetadata(data?.__sync)?.updatedAt || null;

const datasetSyncSource = (data) => String(normalizeSyncMetadata(data?.__sync)?.source || '');

const timestampToMs = (value) => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const datasetSyncDetails = (data) => ({
  updatedAt: datasetUpdatedAt(data),
  source: datasetSyncSource(data),
  pendingUpload: Boolean(normalizeSyncMetadata(data?.__sync)?.pendingUpload),
});

const compareDatasetsForSync = (incomingData, currentData) => {
  if (stableJson(incomingData) === stableJson(currentData)) {
    return 'same';
  }

  const incomingStamp = timestampToMs(datasetUpdatedAt(incomingData));
  const currentStamp = timestampToMs(datasetUpdatedAt(currentData));

  if (incomingStamp && !currentStamp) {
    return 'incoming';
  }

  if (!incomingStamp && currentStamp) {
    return 'current';
  }

  if (incomingStamp !== currentStamp) {
    return incomingStamp > currentStamp ? 'incoming' : 'current';
  }

  const incomingSource = datasetSyncSource(incomingData);
  const currentSource = datasetSyncSource(currentData);

  if (!incomingSource && !currentSource) {
    return 'current';
  }

  if (incomingSource === currentSource) {
    return 'current';
  }

  return incomingSource > currentSource ? 'incoming' : 'current';
};

const incomingDatasetWins = (incomingData, currentData) =>
  compareDatasetsForSync(incomingData, currentData) === 'incoming';

const syncReasonUsesLan = (reason = '') => String(reason).startsWith('lan-');

// ─── UTILIDADES DE RED LOCAL (LAN) ───────────────────────────────────────────
// La sincronización LAN usa UDP para descubrimiento (broadcast) y HTTP para
// transferir datasets entre equipos en la misma red.
// Solo se aceptan conexiones desde direcciones privadas (10.x, 192.168.x, etc.)
// para evitar acceso desde internet.
const normalizeIpAddress = (value = '') => value.replace(/^::ffff:/, '');

const isPrivateLanAddress = (value = '') => {
  const address = normalizeIpAddress(value);

  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
};

const ipv4ToInt = (address) =>
  address
    .split('.')
    .map((part) => Number(part))
    .reduce((result, part) => ((result << 8) + part) >>> 0, 0);

const intToIpv4 = (value) =>
  [24, 16, 8, 0].map((shift) => String((value >>> shift) & 255)).join('.');

const lanBroadcastAddresses = () => {
  const addresses = new Set(['255.255.255.255']);

  Object.values(os.networkInterfaces())
    .flat()
    .forEach((details) => {
      if (!details || details.family !== 'IPv4' || details.internal || !details.address || !details.netmask) {
        return;
      }

      try {
        const address = ipv4ToInt(details.address);
        const netmask = ipv4ToInt(details.netmask);
        addresses.add(intToIpv4((address | (~netmask >>> 0)) >>> 0));
      } catch (_error) {
        // Ignore malformed interface data and keep the remaining broadcast targets.
      }
    });

  return [...addresses];
};

// El token LAN es un hash SHA-256 de las claves de edición configuradas.
// Así solo los equipos que comparten la misma configuración pueden intercambiar datos.
const localLanSyncToken = () => {
  const tokenSource = {
    appId: lanSyncAppId,
    employees: apiConfig?.employees?.editKey || '',
    vacations: apiConfig?.vacations?.editKey || '',
  };

  if (apiConfig?.employeeDatabase?.editKey) {
    tokenSource.employeeDatabase = apiConfig.employeeDatabase.editKey;
  }

  return createHash('sha256').update(JSON.stringify(tokenSource)).digest('hex');
};

const jsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(`${JSON.stringify(payload)}\n`);
};

const readJsonRequestBody = (request) =>
  new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', (chunk) => {
      rawBody += chunk;

      if (Buffer.byteLength(rawBody, 'utf8') > lanSyncMaxPayloadBytes) {
        reject(new Error('El payload LAN excede el tamano permitido.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });

const fetchWithCustomTimeout = async (url, options = {}, timeoutMs = syncRequestTimeoutMs) => {
  if (typeof fetch !== 'function') {
    throw new Error('La version de Electron no tiene fetch disponible en el proceso principal.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const lanFetchJson = async (url, options = {}) => {
  const response = await fetchWithCustomTimeout(url, options, lanSyncRequestTimeoutMs);

  if (!response.ok) {
    throw new Error(`LAN sync HTTP ${response.status}`);
  }

  return response.json().catch(() => ({}));
};

const trimInactiveLanPeers = () => {
  const now = Date.now();

  [...lanPeers.entries()].forEach(([peerId, peer]) => {
    if (now - peer.lastSeenAt > lanSyncPeerTimeoutMs) {
      lanPeers.delete(peerId);
    }
  });
};

const activeLanPeers = () => {
  trimInactiveLanPeers();
  return [...lanPeers.values()];
};

const localDatasetVersions = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.keys(datasetDefinitions).map(async (datasetKey) => [
        datasetKey,
        datasetUpdatedAt(await readDatasetData(datasetKey)),
      ]),
    ),
  );

const sendToAllWindows = (channel, payload) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
};

const emitSyncStatus = () => {
  sendToAllWindows('vacaciones:sync-status', syncStatusSnapshot());
};

const emitCloudUpdated = (datasetKey) => {
  sendToAllWindows('vacaciones:cloud-updated', { dataset: datasetKey });
};

const emitDataUpdated = (datasetKey, reason = 'changed') => {
  sendToAllWindows('vacaciones:data-updated', { dataset: datasetKey, reason });
};

const applyIncomingDataset = async (datasetKey, data, reason = 'lan-update') => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const incomingData = normalizeDatasetData(datasetKey, data);
  const currentData = await readDatasetData(datasetKey);
  const changed = stableJson(incomingData) !== stableJson(currentData);

  if (!changed) {
    return false;
  }

  if (apiConfigForDataset(datasetKey) && syncReasonUsesLan(reason)) {
    logAppEvent('info', 'Actualizacion LAN recibida; se usara nube como autoridad', {
      datasetKey,
      reason,
      incoming: datasetSyncDetails(incomingData),
      current: datasetSyncDetails(currentData),
    });
    syncDatasetFromCloud(datasetKey, { notify: true }).catch(() => {});
    return false;
  }

  if (!incomingDatasetWins(incomingData, currentData)) {
    logAppEvent('info', 'Dataset entrante ignorado por no ser mas reciente', {
      datasetKey,
      reason,
      incoming: datasetSyncDetails(incomingData),
      current: datasetSyncDetails(currentData),
      incomingSummary: datasetLogSummary(datasetKey, incomingData),
      currentSummary: datasetLogSummary(datasetKey, currentData),
    });
    return false;
  }

  await writeDatasetData(datasetKey, incomingData);
  logAppEvent('info', 'Dataset recibido por sincronizacion', {
    datasetKey,
    reason,
    summary: datasetLogSummary(datasetKey, incomingData),
  });

  const pendingUpload = Boolean(incomingData.__sync?.pendingUpload && apiConfigForDataset(datasetKey));
  setDatasetSyncState(datasetKey, {
    pendingUpload,
    lastError: null,
  });
  emitDataUpdated(datasetKey, reason);
  broadcastLanAnnouncement().catch(() => {});

  if (pendingUpload) {
    syncDatasetToCloud(datasetKey).catch(() => {});
  }

  return true;
};

const shouldPullDatasetFromPeer = async (datasetKey, peerUpdatedAt) => {
  if (!peerUpdatedAt) {
    return false;
  }

  const localUpdatedAt = datasetUpdatedAt(await readDatasetData(datasetKey));
  return timestampToMs(peerUpdatedAt) > timestampToMs(localUpdatedAt);
};

const pullDatasetFromPeer = async (peer, datasetKey) => {
  const requestKey = `${peer.instanceId}:${datasetKey}`;

  if (lanPullInFlight.has(requestKey)) {
    return lanPullInFlight.get(requestKey);
  }

  const request = (async () => {
    const address = normalizeIpAddress(peer.address);
    const payload = await lanFetchJson(`http://${address}:${peer.httpPort}/lan-sync/dataset/${datasetKey}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Lan-Sync-App': lanSyncAppId,
        'X-Lan-Sync-Token': localLanSyncToken(),
      },
    });

    return applyIncomingDataset(datasetKey, payload?.data, 'lan-pull');
  })();

  lanPullInFlight.set(requestKey, request);

  try {
    return await request;
  } finally {
    lanPullInFlight.delete(requestKey);
  }
};

const pullNewerDatasetsFromPeer = async (peer) => {
  const versions = peer.datasetVersions || {};

  for (const datasetKey of Object.keys(datasetDefinitions)) {
    if (await shouldPullDatasetFromPeer(datasetKey, versions[datasetKey])) {
      if (apiConfigForDataset(datasetKey)) {
        await syncDatasetFromCloud(datasetKey, { notify: true }).catch((error) => {
          logAppEvent('warn', 'No se pudo sincronizar desde nube tras aviso LAN', {
            datasetKey,
            peer: normalizeIpAddress(peer.address),
            port: peer.httpPort,
            error,
          });
        });
        continue;
      }

      await pullDatasetFromPeer(peer, datasetKey).catch((error) => {
        logAppEvent('warn', 'No se pudo traer dataset desde equipo LAN', {
          datasetKey,
          peer: normalizeIpAddress(peer.address),
          port: peer.httpPort,
          error,
        });
      });
    }
  }
};

const pushDatasetToPeer = async (peer, datasetKey, data) => {
  const address = normalizeIpAddress(peer.address);

  await lanFetchJson(`http://${address}:${peer.httpPort}/lan-sync/dataset/${datasetKey}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Lan-Sync-App': lanSyncAppId,
      'X-Lan-Sync-Token': localLanSyncToken(),
    },
    body: JSON.stringify({
      appId: lanSyncAppId,
      datasetKey,
      data,
      sourceId: syncSourceId,
    }),
  });
};

const broadcastDatasetToLanPeers = async (datasetKey, data) => {
  const peers = activeLanPeers();

  if (peers.length === 0) {
    return;
  }

  await Promise.allSettled(
    peers.map((peer) =>
      pushDatasetToPeer(peer, datasetKey, data).catch((error) => {
        logAppEvent('warn', 'No se pudo enviar dataset a equipo LAN', {
          datasetKey,
          peer: normalizeIpAddress(peer.address),
          port: peer.httpPort,
          error,
        });
      }),
    ),
  );
};

// ─── CONFIGURACIÓN DE API EN LA NUBE ─────────────────────────────────────────
// Lee configapi.txt, un archivo de texto con bloques { Name: ..., API Endpoint: ..., Edit Key: ... }
// Soporta múltiples bloques para distintos datasets (EMPLEADOS, VACACIONES, EMPLEADOS_BD).
const parseApiConfig = (content) => {
  const blocks = content.match(/\{[\s\S]*?\}/g) || [];

  return blocks.reduce((result, block) => {
    const entry = {};

    block
      .replace(/[{}]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const match = line.match(/^([^:]+):\s*(.*)$/);

        if (!match) {
          return;
        }

        const key = match[1].trim().toLowerCase();
        const value = match[2].trim();

        if (key === 'name') {
          entry.name = value.toUpperCase();
        } else if (key === 'raw json endpoint') {
          entry.rawEndpoint = value;
        } else if (key === 'api endpoint') {
          entry.apiEndpoint = value;
        } else if (key === 'edit key') {
          entry.editKey = value;
        }
      });

    if (entry.name && entry.rawEndpoint && entry.apiEndpoint && entry.editKey) {
      result[entry.name] = entry;
    }

    return result;
  }, {});
};

const loadApiConfig = async () => {
  await ensureWritableDataFiles();

  try {
    const content = await fs.readFile(dataFilePath('configapi.txt'), 'utf8');
    const parsedConfig = parseApiConfig(content);
    apiConfig = {
      employees: parsedConfig.EMPLEADOS || null,
      vacations: parsedConfig.VACACIONES || null,
      employeeDatabase: parsedConfig.EMPLEADOS_BD || null,
    };
    syncState.enabled = hasCloudSyncConfig();
    syncState.lastError = null;
  } catch (error) {
    apiConfig = { employees: null, vacations: null, employeeDatabase: null };
    syncState.enabled = false;
    syncState.lastError = error.message;
    logAppEvent('warn', 'No se pudo leer configapi.txt; se usara modo local/LAN', { error });
  }

  emitSyncStatus();
};

const apiConfigForDataset = (datasetKey) => apiConfig?.[datasetKey] || null;

const cacheBustUrl = (url) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_sync=${Date.now()}`;
};

const fetchWithTimeout = async (url, options = {}) => {
  if (typeof fetch !== 'function') {
    throw new Error('La version de Electron no tiene fetch disponible en el proceso principal.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), syncRequestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

// ─── DESCARGA Y SUBIDA A LA NUBE ─────────────────────────────────────────────
// downloadCloudJson descarga desde el rawEndpoint (URL pública de solo lectura).
// uploadCloudJson sube via PATCH al apiEndpoint con la clave de edición en el header.
const downloadCloudJson = async (datasetKey) => {
  const config = apiConfigForDataset(datasetKey);

  if (!config) {
    return null;
  }

  const response = await fetchWithTimeout(cacheBustUrl(config.rawEndpoint), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${datasetDefinitions[datasetKey].configName}: HTTP ${response.status}`);
  }

  return decodeHostedJson(await response.json());
};

const uploadCloudJson = async (datasetKey, data) => {
  const config = apiConfigForDataset(datasetKey);

  if (!config) {
    return null;
  }

  const response = await fetchWithTimeout(config.apiEndpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Edit-Key': config.editKey,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`No se pudo subir ${datasetDefinitions[datasetKey].configName}: HTTP ${response.status}`);
  }

  return response.json().catch(() => null);
};

// ─── NORMALIZACIÓN DE DATOS ──────────────────────────────────────────────────
// Espejo de las funciones de index.js: validan y limpian los datos antes de
// escribirlos en disco, garantizando consistencia independientemente del origen.
const normalizeSchedule = (schedule = {}) =>
  scheduleDays.reduce((result, day) => {
    const hours = schedule?.[day];

    if (Array.isArray(hours) && hours[0] && hours[1]) {
      result[day] = [hours[0], hours[1]];
    }

    return result;
  }, {});

const normalizeEmployee = (employee) => {
  const normalized = {
    id: employee.id,
    nombre: employee.nombre || '',
    apellido_paterno: employee.apellido_paterno || '',
    apellido_materno: employee.apellido_materno || '',
    fecha_ingreso: employee.fecha_ingreso || '',
    salario_diario: Number(employee.salario_diario || 0),
    estado: employee.estado ?? 1,
    lugar: employee.lugar ?? 0,
    puesto: employee.puesto || '',
    horario: normalizeSchedule(employee.horario),
  };

  if (employee.comentario) {
    normalized.comentario = employee.comentario;
  }

  return normalized;
};

const normalizeEmployeeData = (data = {}) => {
  const source = data && typeof data === 'object' ? data : {};
  const employees = Array.isArray(data) ? data : source.empleados || [];
  const normalized = {
    empleados: (Array.isArray(employees) ? employees : []).map(normalizeEmployee),
  };
  const syncMetadata = normalizeSyncMetadata(source.__sync);

  if (syncMetadata) {
    normalized.__sync = syncMetadata;
  }

  return normalized;
};

const trimmedText = (value, maxLength = 255) =>
  String(value ?? '').trim().slice(0, maxLength);

const positiveIntegerOrNull = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
};

const normalizeDateString = (value) => {
  const text = trimmedText(value, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const normalizeMoney = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : 0;
};

const normalizeCivilStatus = (value) => {
  const text = trimmedText(value, 20).replace('Uni\u00f3n Libre', 'Union Libre');

  return employeeCivilStatuses.includes(text) ? text : '';
};

const normalizeBloodType = (value) => {
  const text = trimmedText(value, 3).toUpperCase();

  return employeeBloodTypes.includes(text) ? text : '';
};

const normalizeSocialSecurityNumber = (value) =>
  trimmedText(value, 20).replace(/\D/g, '').slice(0, 11);

const normalizeTableById = (rows = [], normalizer, idKey) => {
  const normalizedById = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const normalized = normalizer(row);

    if (normalized[idKey] != null) {
      normalizedById.set(String(normalized[idKey]), normalized);
    }
  });

  return [...normalizedById.values()].sort((a, b) => Number(a[idKey]) - Number(b[idKey]));
};

const normalizeEmployeeDatabaseEmployee = (employee = {}) => ({
  id_empleado: positiveIntegerOrNull(employee.id_empleado ?? employee.id),
  nombre: trimmedText(employee.nombre, 100),
  curp: trimmedText(employee.curp, 18).toUpperCase(),
  nss: normalizeSocialSecurityNumber(employee.nss ?? employee.numero_seguridad_social),
  fecha_nacimiento: normalizeDateString(employee.fecha_nacimiento),
  estado_civil: normalizeCivilStatus(employee.estado_civil),
  tipo_sangre: normalizeBloodType(employee.tipo_sangre),
  direccion: trimmedText(employee.direccion, 255),
  correo: trimmedText(employee.correo, 120).toLowerCase(),
  num_cuenta: trimmedText(employee.num_cuenta, 20),
  num_tarjeta: trimmedText(employee.num_tarjeta, 20),
  escolaridad: trimmedText(employee.escolaridad, 50),
  num_hijos: Math.max(0, Math.min(99, Number.parseInt(employee.num_hijos, 10) || 0)),
  fecha_ingreso: normalizeDateString(employee.fecha_ingreso),
  salario: normalizeMoney(employee.salario),
  id_puesto: positiveIntegerOrNull(employee.id_puesto),
  id_tienda: positiveIntegerOrNull(employee.id_tienda),
});

const normalizeArea = (area = {}) => ({
  id_area: positiveIntegerOrNull(area.id_area ?? area.id),
  nombre_area: trimmedText(area.nombre_area ?? area.nombre, 80),
});

const normalizeStore = (store = {}) => ({
  id_tienda: positiveIntegerOrNull(store.id_tienda ?? store.id),
  nombre_tienda: trimmedText(store.nombre_tienda ?? store.nombre, 80),
  direccion_tienda: trimmedText(store.direccion_tienda ?? store.direccion, 255),
});

const normalizePosition = (position = {}) => ({
  id_puesto: positiveIntegerOrNull(position.id_puesto ?? position.id),
  nombre_puesto: trimmedText(position.nombre_puesto ?? position.nombre, 80),
  id_area: positiveIntegerOrNull(position.id_area),
});

const normalizePhone = (phone = {}) => {
  const type = trimmedText(phone.tipo, 20);

  return {
    id_telefono: positiveIntegerOrNull(phone.id_telefono ?? phone.id),
    id_empleado: positiveIntegerOrNull(phone.id_empleado),
    numero: trimmedText(phone.numero, 20),
    tipo: employeePhoneTypes.includes(type) ? type : 'Personal',
  };
};

const normalizeAllergy = (allergy = {}) => ({
  id_alergia: positiveIntegerOrNull(allergy.id_alergia ?? allergy.id),
  id_empleado: positiveIntegerOrNull(allergy.id_empleado),
  descripcion: trimmedText(allergy.descripcion, 120),
});

const normalizeEmployeeDatabaseData = (data = {}) => {
  const source = data && typeof data === 'object' ? data : {};
  const areas = normalizeTableById(source.areas, normalizeArea, 'id_area').filter((area) => area.nombre_area);
  const stores = normalizeTableById(source.tiendas, normalizeStore, 'id_tienda').filter(
    (store) => store.nombre_tienda,
  );
  const areaIds = new Set(areas.map((area) => String(area.id_area)));
  const positions = normalizeTableById(source.puestos, normalizePosition, 'id_puesto')
    .filter((position) => position.nombre_puesto)
    .map((position) => ({
      ...position,
      id_area: areaIds.has(String(position.id_area)) ? position.id_area : null,
    }));
  const positionIds = new Set(positions.map((position) => String(position.id_puesto)));
  const storeIds = new Set(stores.map((store) => String(store.id_tienda)));
  const employees = normalizeTableById(source.empleados, normalizeEmployeeDatabaseEmployee, 'id_empleado')
    .filter((employee) => employee.nombre)
    .map((employee) => ({
      ...employee,
      id_puesto: positionIds.has(String(employee.id_puesto)) ? employee.id_puesto : null,
      id_tienda: storeIds.has(String(employee.id_tienda)) ? employee.id_tienda : null,
    }));
  const employeeIds = new Set(employees.map((employee) => String(employee.id_empleado)));
  const phones = normalizeTableById(source.telefonos, normalizePhone, 'id_telefono').filter(
    (phone) => employeeIds.has(String(phone.id_empleado)) && phone.numero,
  );
  const allergies = normalizeTableById(source.alergias, normalizeAllergy, 'id_alergia').filter(
    (allergy) => employeeIds.has(String(allergy.id_empleado)) && allergy.descripcion,
  );
  const normalized = {
    empleados: employees,
    puestos: positions,
    areas,
    tiendas: stores,
    telefonos: phones,
    alergias: allergies,
  };
  const syncMetadata = normalizeSyncMetadata(source.__sync);

  if (syncMetadata) {
    normalized.__sync = syncMetadata;
  }

  return normalized;
};

const normalizeDays = (days = []) =>
  [...new Set(days.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))]
    .sort();

const vacationRecordList = (data, reasonId = 'V') => {
  const jsonKey = reasonJsonKeys[reasonId] || reasonJsonKeys.V;

  if (Array.isArray(data)) {
    return reasonId === 'V' ? data : [];
  }

  if (Array.isArray(data?.[jsonKey])) {
    return data[jsonKey];
  }

  if (
    data &&
    typeof data === 'object' &&
    reasonId === 'V' &&
    !knownVacationJsonKeys.some((key) => Object.prototype.hasOwnProperty.call(data, key))
  ) {
    return Object.entries(data).map(([employeeId, days]) => ({
      empleado_id: employeeId,
      dias: days,
    }));
  }

  return [];
};

const normalizeVacationRecords = (records = [], reasonId = 'V') =>
  vacationRecordList(records, reasonId)
    .map((record) => ({
      empleado_id: record.empleado_id ?? record.id,
      dias: normalizeDays(record.dias || record[reasonJsonKeys[reasonId]] || []),
    }))
    .filter((record) => record.empleado_id != null && record.dias.length > 0)
    .sort((a, b) => Number(a.empleado_id) - Number(b.empleado_id));

const normalizeVacationData = (data = {}) => {
  const source = data && typeof data === 'object' ? data : {};
  const syncMetadata = normalizeSyncMetadata(source.__sync);

  return {
    [reasonJsonKeys.V]: normalizeVacationRecords(source, 'V'),
    [reasonJsonKeys.D]: normalizeVacationRecords(source, 'D'),
    [reasonJsonKeys.I]: normalizeVacationRecords(source, 'I'),
    [reasonJsonKeys.P]: normalizeVacationRecords(source, 'P'),
    ...(syncMetadata ? { __sync: syncMetadata } : {}),
  };
};

const normalizeDatasetData = (datasetKey, data) =>
  datasetKey === 'employees'
    ? normalizeEmployeeData(data)
    : datasetKey === 'employeeDatabase'
      ? normalizeEmployeeDatabaseData(data)
      : normalizeVacationData(data);

const recordDayCount = (records = []) =>
  (Array.isArray(records) ? records : []).reduce((total, record) => total + normalizeDays(record.dias || []).length, 0);

const datasetLogSummary = (datasetKey, data = {}) => {
  if (datasetKey === 'employees') {
    return {
      empleados: Array.isArray(data.empleados) ? data.empleados.length : 0,
    };
  }

  if (datasetKey === 'employeeDatabase') {
    return {
      expedientes: Array.isArray(data.empleados) ? data.empleados.length : 0,
      puestos: Array.isArray(data.puestos) ? data.puestos.length : 0,
      areas: Array.isArray(data.areas) ? data.areas.length : 0,
      tiendas: Array.isArray(data.tiendas) ? data.tiendas.length : 0,
      telefonos: Array.isArray(data.telefonos) ? data.telefonos.length : 0,
      alergias: Array.isArray(data.alergias) ? data.alergias.length : 0,
    };
  }

  return {
    vacaciones: {
      empleados: Array.isArray(data.vacaciones) ? data.vacaciones.length : 0,
      dias: recordDayCount(data.vacaciones),
    },
    descansos_trabajados: {
      empleados: Array.isArray(data.descansos_trabajados) ? data.descansos_trabajados.length : 0,
      dias: recordDayCount(data.descansos_trabajados),
    },
    incapacidades: {
      empleados: Array.isArray(data.incapacidades) ? data.incapacidades.length : 0,
      dias: recordDayCount(data.incapacidades),
    },
    permisos: {
      empleados: Array.isArray(data.permisos) ? data.permisos.length : 0,
      dias: recordDayCount(data.permisos),
    },
  };
};

// ─── ACCESO A DATASETS ───────────────────────────────────────────────────────
// readDatasetData y writeDatasetData son los únicos puntos de acceso al disco
// para los tres datasets principales; siempre normalizan antes de retornar o escribir.
const readDatasetData = async (datasetKey) => {
  const definition = datasetDefinitions[datasetKey];
  return normalizeDatasetData(datasetKey, await readJsonFile(definition.fileName, definition.fallback));
};

const writeDatasetData = async (datasetKey, data) => {
  const definition = datasetDefinitions[datasetKey];
  const normalizedData = normalizeDatasetData(datasetKey, data);
  await writeJsonFile(definition.fileName, normalizedData);
  return normalizedData;
};

// ─── LÓGICA DE SINCRONIZACIÓN CON LA NUBE ───────────────────────────────────
// syncDatasetFromCloud descarga si no hay cambios pendientes de subir.
// syncDatasetToCloud sube los cambios locales y limpia el flag pendingUpload.
// saveDatasetAndSync guarda localmente y luego intenta subir a la nube;
//   si la subida falla, marca pendingUpload=true para reintentar en el siguiente ciclo.
const syncDatasetFromCloud = async (datasetKey, options = {}) => {
  const { notify = true } = options;
  const config = apiConfigForDataset(datasetKey);

  if (!config) {
    return false;
  }

  const localData = await readDatasetData(datasetKey);

  if (localData.__sync?.pendingUpload) {
    await syncDatasetToCloud(datasetKey);
    return true;
  }

  setDatasetSyncState(datasetKey, { syncing: true, pendingUpload: false, lastError: null });

  try {
    const cloudData = normalizeDatasetData(datasetKey, await downloadCloudJson(datasetKey));
    const syncDecision = compareDatasetsForSync(cloudData, localData);

    if (syncDecision === 'incoming') {
      await writeDatasetData(datasetKey, cloudData);
      logAppEvent('info', 'Dataset descargado desde la nube', {
        datasetKey,
        summary: datasetLogSummary(datasetKey, cloudData),
      });
      if (notify) {
        emitCloudUpdated(datasetKey);
      }
    }

    if (syncDecision === 'current') {
      logAppEvent('info', 'Dataset local mas reciente que nube; se subira para reparar sincronizacion', {
        datasetKey,
        local: datasetSyncDetails(localData),
        cloud: datasetSyncDetails(cloudData),
        localSummary: datasetLogSummary(datasetKey, localData),
        cloudSummary: datasetLogSummary(datasetKey, cloudData),
      });
      await syncDatasetToCloud(datasetKey);
      return true;
    }

    syncState.lastSyncAt = new Date().toISOString();
    setDatasetSyncState(datasetKey, {
      syncing: false,
      pendingUpload: false,
      lastDownloadAt: syncState.lastSyncAt,
      lastError: null,
    });
    return syncDecision === 'incoming';
  } catch (error) {
    setDatasetSyncState(datasetKey, {
      syncing: false,
      lastError: error.message,
    });
    logAppEvent('warn', 'No se pudo sincronizar dataset desde la nube', {
      datasetKey,
      error,
    });
    return false;
  }
};

const syncDatasetToCloud = async (datasetKey) => {
  const config = apiConfigForDataset(datasetKey);

  if (!config) {
    return false;
  }

  setDatasetSyncState(datasetKey, { syncing: true, pendingUpload: true, lastError: null });

  try {
    const localData = await readDatasetData(datasetKey);
    const remoteData = normalizeDatasetData(datasetKey, await downloadCloudJson(datasetKey));
    const remoteDecision = compareDatasetsForSync(remoteData, localData);

    if (remoteDecision === 'incoming') {
      await writeDatasetData(datasetKey, remoteData);

      syncState.lastSyncAt = new Date().toISOString();
      setDatasetSyncState(datasetKey, {
        syncing: false,
        pendingUpload: false,
        lastDownloadAt: syncState.lastSyncAt,
        lastError: null,
      });
      emitDataUpdated(datasetKey, 'cloud-newer');
      logAppEvent('warn', 'Subida cancelada porque la nube tiene datos mas recientes', {
        datasetKey,
        local: datasetSyncDetails(localData),
        cloud: datasetSyncDetails(remoteData),
        localSummary: datasetLogSummary(datasetKey, localData),
        cloudSummary: datasetLogSummary(datasetKey, remoteData),
      });
      return false;
    }

    const cloudData = withSyncMetadata(localData, datasetKey, false);

    await uploadCloudJson(datasetKey, cloudData);
    await writeDatasetData(datasetKey, cloudData);

    syncState.lastSyncAt = new Date().toISOString();
    setDatasetSyncState(datasetKey, {
      syncing: false,
      pendingUpload: false,
      lastUploadAt: syncState.lastSyncAt,
      lastError: null,
    });
    logAppEvent('info', 'Dataset subido a la nube', {
      datasetKey,
      summary: datasetLogSummary(datasetKey, cloudData),
    });
    return true;
  } catch (error) {
    setDatasetSyncState(datasetKey, {
      syncing: false,
      pendingUpload: true,
      lastError: error.message,
    });
    logAppEvent('error', 'No se pudo subir dataset a la nube', {
      datasetKey,
      error,
    });
    return false;
  }
};

const saveDatasetAndSync = async (datasetKey, data) => {
  const normalizedData = normalizeDatasetData(datasetKey, data);
  const canUpload = Boolean(apiConfigForDataset(datasetKey));
  const localData = withSyncMetadata(normalizedData, datasetKey, canUpload);

  await writeDatasetData(datasetKey, localData);
  setDatasetSyncState(datasetKey, { pendingUpload: canUpload, lastError: null });
  logAppEvent('info', 'Dataset guardado localmente', {
    datasetKey,
    pendingUpload: canUpload,
    summary: datasetLogSummary(datasetKey, localData),
  });

  if (canUpload) {
    await syncDatasetToCloud(datasetKey);
  }

  const savedData = await readDatasetData(datasetKey);
  emitDataUpdated(datasetKey, 'local-save');
  broadcastDatasetToLanPeers(datasetKey, savedData).catch(() => {});
  broadcastLanAnnouncement().catch(() => {});
  return savedData;
};

const syncAllDatasets = async (options = {}) => {
  await loadApiConfig();

  for (const datasetKey of Object.keys(datasetDefinitions)) {
    const localData = await readDatasetData(datasetKey);

    if (localData.__sync?.pendingUpload || syncState.datasets[datasetKey].pendingUpload) {
      await syncDatasetToCloud(datasetKey);
    } else {
      await syncDatasetFromCloud(datasetKey, options);
    }
  }

  return syncStatusSnapshot();
};

const startCloudSync = () => {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(() => {
    syncAllDatasets({ notify: true }).catch((error) => {
      syncState.lastError = error.message;
      emitSyncStatus();
      logAppEvent('error', 'Error en sincronizacion programada', { error });
    });
  }, syncPollIntervalMs);
};

// ─── SINCRONIZACIÓN LAN (RED LOCAL) ─────────────────────────────────────────
// Mecanismo en dos capas:
//   1. UDP broadcast: cada instancia anuncia su presencia y versiones de datasets cada 5 s.
//   2. HTTP: cuando un par detecta datos más nuevos, los descarga con pullDatasetFromPeer()
//      o los recibe vía POST cuando el otro equipo guarda cambios.
// El token LAN impide que apps ajenas accedan al servidor HTTP interno.
const lanAnnouncementPayload = async () => ({
  appId: lanSyncAppId,
  instanceId: syncSourceId,
  httpPort: lanHttpPort,
  datasetVersions: await localDatasetVersions(),
  sentAt: new Date().toISOString(),
});

const broadcastLanAnnouncement = async () => {
  if (!lanDiscoverySocket || !lanHttpPort) {
    return;
  }

  const payload = Buffer.from(JSON.stringify(await lanAnnouncementPayload()));

  lanBroadcastAddresses().forEach((address) => {
    lanDiscoverySocket.send(payload, lanSyncDiscoveryPort, address, () => {});
  });
};

const handleLanRequest = async (request, response) => {
  const remoteAddress = normalizeIpAddress(request.socket.remoteAddress || '');
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const datasetMatch = url.pathname.match(/^\/lan-sync\/dataset\/([a-z-]+)$/i);

  if (!isPrivateLanAddress(remoteAddress)) {
    jsonResponse(response, 403, { ok: false, error: 'Direccion LAN no permitida.' });
    return;
  }

  if (
    request.headers['x-lan-sync-app'] !== lanSyncAppId ||
    request.headers['x-lan-sync-token'] !== localLanSyncToken()
  ) {
    jsonResponse(response, 403, { ok: false, error: 'Credenciales LAN invalidas.' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/lan-sync/ping') {
    jsonResponse(response, 200, { ok: true, instanceId: syncSourceId });
    return;
  }

  if (!datasetMatch || !datasetDefinitions[datasetMatch[1]]) {
    jsonResponse(response, 404, { ok: false, error: 'Ruta LAN no encontrada.' });
    return;
  }

  const datasetKey = datasetMatch[1];

  if (request.method === 'GET') {
    jsonResponse(response, 200, {
      ok: true,
      dataset: datasetKey,
      data: await readDatasetData(datasetKey),
    });
    return;
  }

  if (request.method === 'POST') {
    const body = await readJsonRequestBody(request);

    if (body.appId !== lanSyncAppId || body.datasetKey !== datasetKey || !body.data) {
      jsonResponse(response, 400, { ok: false, error: 'Payload LAN invalido.' });
      return;
    }

    const changed = await applyIncomingDataset(datasetKey, body.data, 'lan-push');
    jsonResponse(response, 200, { ok: true, changed });
    return;
  }

  jsonResponse(response, 405, { ok: false, error: 'Metodo no soportado.' });
};

const createLanHttpServer = () =>
  http.createServer((request, response) => {
    handleLanRequest(request, response).catch((error) => {
      logAppEvent('error', 'Error atendiendo solicitud LAN', {
        method: request.method,
        url: request.url,
        remoteAddress: normalizeIpAddress(request.socket.remoteAddress || ''),
        error,
      });
      jsonResponse(response, 500, { ok: false, error: error.message });
    });
  });

const listenLanHttpServer = (port) =>
  new Promise((resolve, reject) => {
    const server = createLanHttpServer();

    const cleanup = () => {
      server.removeAllListeners('error');
      server.removeAllListeners('listening');
    };

    server.once('error', (error) => {
      cleanup();
      server.close(() => {});
      reject(error);
    });

    server.once('listening', () => {
      cleanup();
      resolve(server);
    });

    server.listen(port, '0.0.0.0');
  });

const startLanHttpServer = async () => {
  try {
    lanHttpServer = await listenLanHttpServer(lanSyncHttpPreferredPort);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') {
      throw error;
    }

    lanHttpServer = await listenLanHttpServer(0);
  }

  lanHttpPort = lanHttpServer.address()?.port || lanSyncHttpPreferredPort;
  logAppEvent('info', 'Servidor LAN listo', { port: lanHttpPort });
};

const stopLanHttpServer = () =>
  new Promise((resolve) => {
    if (!lanHttpServer) {
      resolve();
      return;
    }

    lanHttpServer.close(() => {
      lanHttpServer = null;
      lanHttpPort = null;
      resolve();
    });
  });

const handleLanAnnouncement = async (buffer, remoteInfo) => {
  let payload;

  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch (_error) {
    return;
  }

  const address = normalizeIpAddress(remoteInfo.address || '');
  const httpPort = Number(payload.httpPort || 0);

  if (
    payload.appId !== lanSyncAppId ||
    payload.instanceId === syncSourceId ||
    !httpPort ||
    !isPrivateLanAddress(address)
  ) {
    return;
  }

  const previousPeer = lanPeers.get(payload.instanceId);
  const peer = {
    instanceId: payload.instanceId,
    address,
    httpPort,
    datasetVersions: payload.datasetVersions || {},
    lastSeenAt: Date.now(),
  };

  lanPeers.set(payload.instanceId, peer);

  if (!previousPeer || previousPeer.address !== peer.address || previousPeer.httpPort !== peer.httpPort) {
    logAppEvent('info', 'Equipo LAN detectado', {
      peer: peer.address,
      port: peer.httpPort,
    });
    await pullNewerDatasetsFromPeer(peer).catch(() => {});
    return;
  }

  await pullNewerDatasetsFromPeer(peer).catch(() => {});
};

const startLanDiscovery = async () =>
  new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.once('error', reject);
    socket.on('message', (message, remoteInfo) => {
      handleLanAnnouncement(message, remoteInfo).catch(() => {});
    });
    socket.bind(lanSyncDiscoveryPort, () => {
      socket.removeAllListeners('error');
      socket.on('error', (error) => {
        logAppEvent('warn', 'Error en discovery LAN', { error });
      });
      socket.setBroadcast(true);
      lanDiscoverySocket = socket;
      resolve();
    });
  });
const stopLanDiscovery = () =>
  new Promise((resolve) => {
    if (lanAnnouncementTimer) {
      clearInterval(lanAnnouncementTimer);
      lanAnnouncementTimer = null;
    }
    if (!lanDiscoverySocket) {
      resolve();
      return;
    }
    lanDiscoverySocket.close(() => {
      lanDiscoverySocket = null;
      lanPeers.clear();
      resolve();
    });
  }); 
const startLanSync = async () => {
  await startLanHttpServer();
  await startLanDiscovery();

  await broadcastLanAnnouncement().catch(() => {});
  lanAnnouncementTimer = setInterval(() => {
    broadcastLanAnnouncement().catch(() => {});
  }, lanSyncAnnouncementIntervalMs);
  logAppEvent('info', 'Sincronizacion LAN iniciada', {
    discoveryPort: lanSyncDiscoveryPort,
    httpPort: lanHttpPort,
  });
};

const stopLanSync = async () => {
  await stopLanDiscovery();
  await stopLanHttpServer();
};

// ─── VIGILANCIA DE ARCHIVOS ──────────────────────────────────────────────────
// Detecta cambios externos en los archivos JSON (por ejemplo, edición manual
// o sincronización de nube como Dropbox) y notifica a la UI para que recargue.
const startDatasetFileWatchers = () => {
  if (fileWatchListeners.size > 0) {
    return;
  }

  Object.entries(datasetDefinitions).forEach(([datasetKey, definition]) => {
    const filePath = dataFilePath(definition.fileName);
    const listener = (current, previous) => {
      const changed =
        current.mtimeMs !== previous.mtimeMs ||
        current.size !== previous.size ||
        current.ctimeMs !== previous.ctimeMs;

      if (!changed) {
        return;
      }

      emitDataUpdated(datasetKey, 'file-watch');
    };

    fileWatchListeners.set(filePath, listener);
    fsNative.watchFile(filePath, { interval: 350 }, listener);
  });
};

const stopDatasetFileWatchers = () => {
  fileWatchListeners.forEach((listener, filePath) => {
    fsNative.unwatchFile(filePath, listener);
  });
  fileWatchListeners.clear();
};

// ─── MANEJADORES IPC ─────────────────────────────────────────────────────────
// Cada manejador responde a una llamada desde la interfaz (preload.js expone estos canales).
// registerLoggedIpcHandle envuelve todos con captura de errores y logging automático.
const registerLoggedIpcHandle = (channel, handler) => {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      await writeAppLog('error', 'Error en solicitud IPC', {
        channel,
        error,
      });
      throw error;
    }
  });
};

registerLoggedIpcHandle('vacaciones:log', async (_event, entry = {}) => {
  await writeAppLog(entry.level, `Interfaz: ${entry.message || 'Evento'}`, entry.details || null);
  return { ok: true, logPath: logFilePath() };
});

registerLoggedIpcHandle('vacaciones:get-log-path', async () => logFilePath());

registerLoggedIpcHandle('vacaciones:get-employees', async () => {
  await loadApiConfig();
  await syncDatasetFromCloud('employees', { notify: false });
  return (await readDatasetData('employees')).empleados;
});

registerLoggedIpcHandle('vacaciones:get-vacations', async () => {
  await loadApiConfig();
  await syncDatasetFromCloud('vacations', { notify: false });
  return readDatasetData('vacations');
});

registerLoggedIpcHandle('vacaciones:get-employee-database', async () => {
  return readDatasetData('employeeDatabase');
});

registerLoggedIpcHandle('vacaciones:get-config', async () => {
  return readJsonFile('configuracion.json', {});
});

registerLoggedIpcHandle('vacaciones:save-employees', async (_event, employees) => {
  const normalizedEmployees = employees.map(normalizeEmployee);
  const savedData = await saveDatasetAndSync('employees', { empleados: normalizedEmployees });
  return savedData.empleados;
});

registerLoggedIpcHandle('vacaciones:save-vacations', async (_event, records) => {
  return saveDatasetAndSync('vacations', records);
});

registerLoggedIpcHandle('vacaciones:save-employee-database', async (_event, database) => {
  return saveDatasetAndSync('employeeDatabase', database);
});

registerLoggedIpcHandle('vacaciones:get-sync-status', async () => {
  await loadApiConfig();
  return syncStatusSnapshot();
});

registerLoggedIpcHandle('vacaciones:sync-now', async () => {
  return syncAllDatasets({ notify: true });
});

// ─── VENTANA PRINCIPAL ───────────────────────────────────────────────────────
// Crea la ventana de Electron con contexto aislado (contextIsolation: true)
// para que el preload sea el único puente entre el renderer y Node.js.
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'logo.png'),
    backgroundColor: '#1b1b1b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logAppEvent('error', 'Proceso de interfaz terminado', { details });
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logAppEvent('error', 'No se pudo cargar la interfaz', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2) {
      return;
    }

    logAppEvent(level >= 3 ? 'error' : 'warn', 'Mensaje de consola de interfaz', {
      message,
      line,
      sourceId,
    });
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

// ─── CICLO DE VIDA DE LA APLICACIÓN ─────────────────────────────────────────
// Secuencia de arranque: archivos → configapi → ventana → LAN sync → file watchers → cloud sync.
// El orden importa: la ventana se abre antes de que la sync termine para que la UI
// no bloquee al usuario mientras se descargan datos de la nube.
app.whenReady().then(async () => {
  await writeAppLog('info', 'Aplicacion iniciada', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    dataDirectory: dataDirectoryPath(),
    logFile: logFilePath(),
  });
  await ensureWritableDataFiles()
    .then(() => {
      logAppEvent('info', 'Archivos de datos listos');
    })
    .catch((error) => {
      logAppEvent('error', 'No se pudieron preparar los archivos de datos', { error });
    });
  await loadApiConfig().catch((error) => {
    logAppEvent('warn', 'No se pudo cargar configapi.txt', { error });
  });
  createWindow();
  await startLanSync().catch((error) => {
    logAppEvent('warn', 'No se pudo iniciar la sincronizacion LAN', { error });
  });
  startDatasetFileWatchers();
  logAppEvent('info', 'Vigilancia de archivos iniciada', {
    files: Object.values(datasetDefinitions).map((definition) => definition.fileName),
  });
  startCloudSync();
  logAppEvent('info', 'Sincronizacion periodica iniciada', { intervalMs: syncPollIntervalMs });
  syncAllDatasets({ notify: true })
    .then(() => {
      logAppEvent('info', 'Sincronizacion inicial terminada');
    })
    .catch((error) => {
      logAppEvent('error', 'Error en sincronizacion inicial', { error });
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  logAppEvent('error', 'Error fatal al iniciar la aplicacion', { error });
  app.quit();
});

app.on('before-quit', () => {
  logAppEvent('info', 'Aplicacion cerrandose');
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  stopLanSync().catch(() => {});
  stopDatasetFileWatchers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
