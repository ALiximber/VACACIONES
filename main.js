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
const syncSourceId = randomUUID();
const syncPollIntervalMs = 600000;
const syncRequestTimeoutMs = 15000;
const lanSyncAppId = 'vacaciones-lan-sync-v1';
const lanSyncDiscoveryPort = 41234;
const lanSyncHttpPreferredPort = 41235;
const lanSyncAnnouncementIntervalMs = 5000;
const lanSyncPeerTimeoutMs = 20000;
const lanSyncRequestTimeoutMs = 3000;
const lanSyncMaxPayloadBytes = 1024 * 1024;
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
};

const bundledDataFilePath = (fileName) => path.join(__dirname, fileName);
const dataDirectoryPath = () => (app.isPackaged ? app.getPath('userData') : __dirname);
const dataFilePath = (fileName) => path.join(dataDirectoryPath(), fileName);
const writableDataFileNames = [
  'configapi.txt',
  'configuracion.json',
  ...Object.values(datasetDefinitions).map((definition) => definition.fileName),
];
let writableDataFilesReady = false;

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

const setDatasetSyncState = (datasetKey, patch) => {
  syncState.datasets[datasetKey] = {
    ...syncState.datasets[datasetKey],
    ...patch,
  };
  syncState.enabled = Boolean(apiConfig?.employees || apiConfig?.vacations);
  syncState.lastError = Object.values(syncState.datasets).find((dataset) => dataset.lastError)?.lastError || null;
  emitSyncStatus();
};

const syncStatusSnapshot = () => JSON.parse(JSON.stringify(syncState));

const datasetUpdatedAt = (data) => normalizeSyncMetadata(data?.__sync)?.updatedAt || null;

const timestampToMs = (value) => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const incomingDatasetWins = (incomingData, currentData) => {
  const incomingStamp = timestampToMs(datasetUpdatedAt(incomingData));
  const currentStamp = timestampToMs(datasetUpdatedAt(currentData));

  if (!incomingStamp && !currentStamp) {
    return stableJson(incomingData) !== stableJson(currentData);
  }

  return incomingStamp >= currentStamp;
};

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

const localLanSyncToken = () =>
  createHash('sha256')
    .update(
      JSON.stringify({
        appId: lanSyncAppId,
        employees: apiConfig?.employees?.editKey || '',
        vacations: apiConfig?.vacations?.editKey || '',
      }),
    )
    .digest('hex');

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

  if (!changed || !incomingDatasetWins(incomingData, currentData)) {
    return false;
  }

  await writeDatasetData(datasetKey, incomingData);

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
      await pullDatasetFromPeer(peer, datasetKey).catch(() => {});
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
      pushDatasetToPeer(peer, datasetKey, data).catch(() => {
        // A missed LAN push will be recovered by the next announcement or cloud sync.
      }),
    ),
  );
};

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
    };
    syncState.enabled = Boolean(apiConfig.employees || apiConfig.vacations);
    syncState.lastError = null;
  } catch (error) {
    apiConfig = { employees: null, vacations: null };
    syncState.enabled = false;
    syncState.lastError = error.message;
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
    : normalizeVacationData(data);

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
    const changed = stableJson(localData) !== stableJson(cloudData);

    if (changed) {
      await writeDatasetData(datasetKey, cloudData);
      if (notify) {
        emitCloudUpdated(datasetKey);
      }
    }

    syncState.lastSyncAt = new Date().toISOString();
    setDatasetSyncState(datasetKey, {
      syncing: false,
      pendingUpload: false,
      lastDownloadAt: syncState.lastSyncAt,
      lastError: null,
    });
    return changed;
  } catch (error) {
    setDatasetSyncState(datasetKey, {
      syncing: false,
      lastError: error.message,
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
    return true;
  } catch (error) {
    setDatasetSyncState(datasetKey, {
      syncing: false,
      pendingUpload: true,
      lastError: error.message,
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
    });
  }, syncPollIntervalMs);
};

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
      socket.on('error', () => {});
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
};

const stopLanSync = async () => {
  await stopLanDiscovery();
  await stopLanHttpServer();
};

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

ipcMain.handle('vacaciones:get-employees', async () => {
  await loadApiConfig();
  await syncDatasetFromCloud('employees', { notify: false });
  return (await readDatasetData('employees')).empleados;
});

ipcMain.handle('vacaciones:get-vacations', async () => {
  await loadApiConfig();
  await syncDatasetFromCloud('vacations', { notify: false });
  return readDatasetData('vacations');
});

ipcMain.handle('vacaciones:get-config', async () => {
  return readJsonFile('configuracion.json', {});
});

ipcMain.handle('vacaciones:save-employees', async (_event, employees) => {
  const normalizedEmployees = employees.map(normalizeEmployee);
  const savedData = await saveDatasetAndSync('employees', { empleados: normalizedEmployees });
  return savedData.empleados;
});

ipcMain.handle('vacaciones:save-vacations', async (_event, records) => {
  return saveDatasetAndSync('vacations', records);
});

ipcMain.handle('vacaciones:get-sync-status', async () => {
  await loadApiConfig();
  return syncStatusSnapshot();
});

ipcMain.handle('vacaciones:sync-now', async () => {
  return syncAllDatasets({ notify: true });
});

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
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(async () => {
  await ensureWritableDataFiles().catch(() => {});
  await loadApiConfig().catch(() => {});
  createWindow();
  await startLanSync().catch(() => {});
  startDatasetFileWatchers();
  startCloudSync();
  syncAllDatasets({ notify: true }).catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
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
