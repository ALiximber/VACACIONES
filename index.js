(function () {
  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const dayNames = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  const scheduleDays = [
    { key: 'Lunes', short: 'L' },
    { key: 'Martes', short: 'M' },
    { key: 'Miercoles', short: 'M' },
    { key: 'Jueves', short: 'J' },
    { key: 'Viernes', short: 'V' },
    { key: 'Sabado', short: 'S' },
    { key: 'Domingo', short: 'D' },
  ];
  const calendarStorageKey = 'calendario-vacaciones-eventos';
  const matrixStorageKey = 'calendario-vacaciones-cuadricula';
  const employeesStorageKey = 'calendario-vacaciones-empleados';
  const vacationsStorageKey = 'calendario-vacaciones-registros';
  const employeeDatabaseStorageKey = 'calendario-vacaciones-empleados-bd';
  const themeStorageKey = 'calendario-vacaciones-tema';
  const themes = ['light', 'dark'];

  const reasons = [
    { id: 'V', label: 'Vacaciones', className: 'reason-v' },
    { id: 'D', label: 'Descanso trabajado', className: 'reason-d' },
    { id: 'I', label: 'Incapacidad', className: 'reason-i' },
    { id: 'P', label: 'Permiso', className: 'reason-p' },
  ];
  const calendarSpecialReasons = {
    birthday: { id: '🎂', label: 'Cumpleaños', className: 'reason-birthday' },
    workAnniversary: { id: 'A', label: 'Aniversario laboral', className: 'reason-anniversary' },
  };
  const reasonJsonKeys = {
    V: 'vacaciones',
    D: 'descansos_trabajados',
    I: 'incapacidades',
    P: 'permisos',
  };
  const supplementalReasonIds = reasons
    .map((reason) => reason.id)
    .filter((reasonId) => reasonId !== 'V');
  const knownVacationJsonKeys = Object.values(reasonJsonKeys);
  const employeeCivilStatuses = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Union Libre'];
  const employeeBloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
  const employeePhoneTypes = ['Personal', 'Emergencia1', 'Emergencia2', 'Casa'];
  const employeeDatabaseSortDefaults = {
    employee: 'asc',
    curp: 'asc',
    age: 'desc',
    birthday: 'asc',
    status: 'asc',
    blood: 'asc',
    position: 'asc',
    store: 'asc',
    phones: 'asc',
    allergies: 'asc',
  };
  const textCollator = new Intl.Collator('es-MX', {
    sensitivity: 'base',
    numeric: true,
  });
  const emptyEmployeeDatabase = () => ({
    empleados: [],
    puestos: [],
    areas: [],
    tiendas: [],
    telefonos: [],
    alergias: [],
  });

  const fallbackEmployees = [
    { id: 1, nombre: 'USER', apellido_paterno: 'USER', apellido_materno: 'USER', fecha_ingreso: '2026-04-10', salario_diario: 652, horario: {} },
    { id: 2, nombre: 'Demian', apellido_paterno: 'Tellez', apellido_materno: 'Calzada', fecha_ingreso: '2025-10-14', salario_diario: 0, horario: { Lunes: ['09:00', '17:00'], Martes: ['09:00', '17:00'], Miercoles: ['09:00', '17:00'], Jueves: ['09:00', '17:00'], Viernes: ['09:00', '17:00'] } },
    { id: 3, nombre: 'Juan', apellido_paterno: 'Perez', apellido_materno: 'Garcia', fecha_ingreso: '2019-03-12', salario_diario: 320, horario: { Lunes: ['08:00', '16:00'], Martes: ['08:00', '16:00'], Miercoles: ['08:00', '16:00'], Jueves: ['08:00', '16:00'], Viernes: ['08:00', '16:00'], Sabado: ['08:00', '13:00'] } },
    { id: 4, nombre: 'Luis', apellido_paterno: 'Ramirez', apellido_materno: 'Soto', fecha_ingreso: '2018-06-20', salario_diario: 280, horario: { Lunes: ['07:00', '15:00'], Martes: ['07:00', '15:00'], Miercoles: ['07:00', '15:00'], Jueves: ['07:00', '15:00'], Viernes: ['07:00', '15:00'] } },
    { id: 5, nombre: 'Maria', apellido_paterno: 'Lopez', apellido_materno: 'Hernandez', fecha_ingreso: '2021-01-15', salario_diario: 250, horario: { Lunes: ['10:00', '18:00'], Martes: ['10:00', '18:00'], Miercoles: ['10:00', '18:00'], Jueves: ['10:00', '18:00'], Viernes: ['10:00', '18:00'], Sabado: ['10:00', '14:00'] } },
  ];

  const fallbackVacationRecords = [
    { empleado_id: 3, dias: ['2022-07-10', '2022-07-11', '2023-08-05'] },
    { empleado_id: 4, dias: ['2020-12-01', '2021-12-01'] },
    { empleado_id: 5, dias: ['2022-04-10', '2024-04-10'] },
  ];

  const defaultConfig = {
    tablaVacaciones: [
      { antiguedadMinima: 1, antiguedadMaxima: 1, dias: 12 },
      { antiguedadMinima: 2, antiguedadMaxima: 2, dias: 14 },
      { antiguedadMinima: 3, antiguedadMaxima: 3, dias: 16 },
      { antiguedadMinima: 4, antiguedadMaxima: 4, dias: 18 },
      { antiguedadMinima: 5, antiguedadMaxima: 5, dias: 20 },
      { antiguedadMinima: 6, antiguedadMaxima: 10, dias: 22 },
      { antiguedadMinima: 11, antiguedadMaxima: 15, dias: 24 },
      { antiguedadMinima: 16, antiguedadMaxima: 20, dias: 26 },
      { antiguedadMinima: 21, antiguedadMaxima: 25, dias: 28 },
      { antiguedadMinima: 26, antiguedadMaxima: 30, dias: 30 },
      { antiguedadMinima: 31, antiguedadMaxima: null, dias: 32 },
    ],
  };

  const today = new Date();
  const state = {
    year: today.getFullYear(),
    month: today.getMonth(),
    view: 'calendar',
    events: {},
    employeeDayEvents: {},
    vacationsByEmployeeId: {},
    legacyVacationsByEmployeeId: {},
    employees: [],
    employeeDatabase: emptyEmployeeDatabase(),
    config: defaultConfig,
    editingEmployeeId: null,
    editingEmployeeDatabaseEmployeeId: null,
    editingSchedule: null,
    theme: 'light',
    needsVacationDataSave: false,
    birthdayMonthFilter: null,
    employeeDatabaseSort: {
      key: null,
      direction: 'asc',
    },
  };

  const calendarPage = document.querySelector('#calendar-page');
  const matrixPage = document.querySelector('#matrix-page');
  const schedulesPage = document.querySelector('#schedules-page');
  const employeesPage = document.querySelector('#employees-page');
  const employeeDatabasePage = document.querySelector('#employee-database-page');
  const calendar = document.querySelector('#calendar');
  const employeeGrid = document.querySelector('#employee-grid');
  const scheduleGrid = document.querySelector('#schedule-grid');
  const addEmployeeButton = document.querySelector('#add-employee-button');
  const employeeForm = document.querySelector('#employee-form');
  const employeeNameInput = document.querySelector('#employee-name');
  const employeeLastname1Input = document.querySelector('#employee-lastname-1');
  const employeeLastname2Input = document.querySelector('#employee-lastname-2');
  const employeeStartDateInput = document.querySelector('#employee-start-date');
  const employeeSalaryInput = document.querySelector('#employee-salary');
  const employeeCommentInput = document.querySelector('#employee-comment');
  const employeesCount = document.querySelector('#employees-count');
  const employeesTableBody = document.querySelector('#employees-table-body');
  const employeeModal = document.querySelector('#employee-modal');
  const employeeModalKicker = document.querySelector('#employee-modal-kicker');
  const employeeModalTitle = document.querySelector('#employee-modal-title');
  const employeeModalSubmit = document.querySelector('#employee-modal-submit');
  const closeEmployeeModalButton = document.querySelector('#close-employee-modal');
  const scheduleModal = document.querySelector('#schedule-modal');
  const scheduleModalKicker = document.querySelector('#schedule-modal-kicker');
  const scheduleModalTitle = document.querySelector('#schedule-modal-title');
  const closeScheduleModalButton = document.querySelector('#close-schedule-modal');
  const scheduleForm = document.querySelector('#schedule-form');
  const scheduleTypeInput = document.querySelector('#schedule-type');
  const scheduleStartInput = document.querySelector('#schedule-start');
  const scheduleEndInput = document.querySelector('#schedule-end');
  const addEmployeeDatabaseButton = document.querySelector('#add-employee-database-button');
  const birthdayMonthFilterInput = document.querySelector('#birthday-month-filter');
  const employeeDatabaseCount = document.querySelector('#employee-database-count');
  const employeeDatabaseTableBody = document.querySelector('#employee-database-table-body');
  const employeeDatabaseSortButtons = [...document.querySelectorAll('.employee-database-sort')];
  const employeeDatabaseModal = document.querySelector('#employee-database-modal');
  const employeeDatabaseForm = document.querySelector('#employee-database-form');
  const employeeDatabaseModalKicker = document.querySelector('#employee-database-modal-kicker');
  const employeeDatabaseModalTitle = document.querySelector('#employee-database-modal-title');
  const closeEmployeeDatabaseModalButton = document.querySelector('#close-employee-database-modal');
  const employeeDatabaseSubmit = document.querySelector('#employee-database-submit');
  const employeeDatabaseEmployeeInput = document.querySelector('#employee-database-employee');
  const employeeDatabaseCurpInput = document.querySelector('#employee-database-curp');
  const employeeDatabaseBirthDateInput = document.querySelector('#employee-database-birth-date');
  const employeeDatabaseCivilStatusInput = document.querySelector('#employee-database-civil-status');
  const employeeDatabaseBloodTypeInput = document.querySelector('#employee-database-blood-type');
  const employeeDatabaseAddressInput = document.querySelector('#employee-database-address');
  const employeeDatabaseEmailInput = document.querySelector('#employee-database-email');
  const employeeDatabaseSchoolingInput = document.querySelector('#employee-database-schooling');
  const employeeDatabaseChildrenInput = document.querySelector('#employee-database-children');
  const employeeDatabaseAreaInput = document.querySelector('#employee-database-area');
  const employeeDatabasePositionInput = document.querySelector('#employee-database-position');
  const employeeDatabaseStoreInput = document.querySelector('#employee-database-store');
  const employeeDatabaseStoreAddressInput = document.querySelector('#employee-database-store-address');
  const employeeDatabaseAccountInput = document.querySelector('#employee-database-account');
  const employeeDatabaseCardInput = document.querySelector('#employee-database-card');
  const employeeDatabasePhonePersonalInput = document.querySelector('#employee-database-phone-personal');
  const employeeDatabasePhoneEmergency1Input = document.querySelector('#employee-database-phone-emergency-1');
  const employeeDatabasePhoneEmergency2Input = document.querySelector('#employee-database-phone-emergency-2');
  const employeeDatabasePhoneHomeInput = document.querySelector('#employee-database-phone-home');
  const employeeDatabaseAllergiesInput = document.querySelector('#employee-database-allergies');
  const employeeAreaOptions = document.querySelector('#employee-area-options');
  const employeePositionOptions = document.querySelector('#employee-position-options');
  const employeeStoreOptions = document.querySelector('#employee-store-options');
  const matrixTitle = document.querySelector('#matrix-title');
  const dayModal = document.querySelector('#day-modal');
  const dayModalTitle = document.querySelector('#day-modal-title');
  const dayModalContent = document.querySelector('#day-modal-content');
  const closeDayModalButton = document.querySelector('#close-day-modal');
  const yearTitle = document.querySelector('#year-title');
  const monthsBar = document.querySelector('#months');
  const monthButtons = [...document.querySelectorAll('.month-button')];
  const viewButtons = [...document.querySelectorAll('.view-button')];
  const themeButtons = [...document.querySelectorAll('.theme-button')];
  const syncStatusButton = document.querySelector('#sync-status');
  const syncStatusText = document.querySelector('#sync-status-text');
  const prevYearButton = document.querySelector('#prev-year');
  const nextYearButton = document.querySelector('#next-year');
  let localOnlySaveWarningShown = false;
  const liveSyncSourceId =
    window.crypto?.randomUUID?.() || `vacaciones-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const liveSyncChannel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel('calendario-vacaciones-live-sync') : null;
  const externalRefreshTimes = {};

  const errorDetails = (error) => {
    if (!error) {
      return null;
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (typeof error === 'object') {
      return {
        name: error.name,
        message: error.message || String(error),
      };
    }

    return { message: String(error) };
  };

  const appLog = (level, message, details = {}) => {
    const payload = {
      ...(details || {}),
      view: state.view,
      year: state.year,
      month: state.month + 1,
    };

    if (window.vacacionesData?.log) {
      window.vacacionesData.log({ level, message, details: payload }).catch(() => {});
      return;
    }

    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[Vacaciones] ${message}`, payload);
  };

  const logInfo = (message, details) => appLog('info', message, details);
  const logWarn = (message, details) => appLog('warn', message, details);
  const logError = (message, details) => appLog('error', message, details);

  window.addEventListener('error', (event) => {
    logError('Error no controlado en interfaz', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: errorDetails(event.error),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('Promesa rechazada no controlada en interfaz', {
      reason: errorDetails(event.reason),
    });
  });

  const pad = (value) => String(value).padStart(2, '0');
  const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

  const escapeHtml = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const readStorage = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      logWarn('No se pudo leer localStorage', { key, error: errorDetails(error) });
      return fallback;
    }
  };

  const readTheme = () => {
    try {
      const savedTheme = localStorage.getItem(themeStorageKey);
      return themes.includes(savedTheme) ? savedTheme : 'light';
    } catch (error) {
      logWarn('No se pudo leer el tema guardado', { error: errorDetails(error) });
      return 'light';
    }
  };

  const applyTheme = (theme) => {
    const nextTheme = themes.includes(theme) ? theme : 'light';
    state.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;

    themeButtons.forEach((button) => {
      const isActive = button.dataset.theme === nextTheme;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  };

  const saveTheme = (theme) => {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      logWarn('No se pudo guardar el tema en localStorage', { theme, error: errorDetails(error) });
      // The visual change can still be applied if localStorage is unavailable.
    }

    announceLiveSync('theme');
  };

  const announceLiveSync = (scope) => {
    if (!scope) {
      return;
    }

    try {
      liveSyncChannel?.postMessage({
        type: 'state-changed',
        scope,
        sourceId: liveSyncSourceId,
      });
    } catch (error) {
      logWarn('No se pudo anunciar cambio local en ventana activa', { scope, error: errorDetails(error) });
      // The storage event still covers standard browser tabs and windows.
    }
  };

  const shouldSkipExternalRefresh = (scope) => {
    const now = Date.now();
    const lastRefreshAt = externalRefreshTimes[scope] || 0;

    if (now - lastRefreshAt < 150) {
      return true;
    }

    externalRefreshTimes[scope] = now;
    return false;
  };

  const applyLocalSnapshot = (scope) => {
    if (scope === 'theme') {
      applyTheme(readTheme());
      return;
    }

    if (scope === 'calendar') {
      state.events = readStorage(calendarStorageKey, {});
      renderCalendar();
      return;
    }

    if (scope === 'employees') {
      setEmployees(readStorage(employeesStorageKey, fallbackEmployees));
      renderAll();
      return;
    }

    if (scope === 'employeeDatabase') {
      state.employeeDatabase = normalizeEmployeeDatabaseData(readStorage(employeeDatabaseStorageKey, emptyEmployeeDatabase()));
      renderAll();
      return;
    }

    if (scope === 'matrix' || scope === 'vacations') {
      state.employeeDayEvents = readStorage(matrixStorageKey, {});
      applyVacationData(readStorage(vacationsStorageKey, fallbackVacationRecords));
      renderAll();
    }
  };

  const handleLocalSyncMessage = (scope) => {
    if (!scope || shouldSkipExternalRefresh(scope)) {
      return;
    }

    applyLocalSnapshot(scope);
  };

  const handleExternalDatasetUpdate = async (datasetKey) => {
    if (!datasetKey || shouldSkipExternalRefresh(datasetKey)) {
      return;
    }

    try {
      if (datasetKey === 'employees') {
        await loadEmployees();
      } else if (datasetKey === 'vacations') {
        await loadVacations();
      } else if (datasetKey === 'employeeDatabase') {
        await loadEmployeeDatabase();
      } else {
        await reloadSyncedData();
        return;
      }

      renderAll();
    } catch (error) {
      logError('No se pudo aplicar actualizacion externa', { datasetKey, error: errorDetails(error) });
      // Keep current data if the external refresh fails.
    }
  };

  const updateSyncStatus = (status = {}) => {
    if (!syncStatusButton || !syncStatusText) {
      return;
    }

    const datasets = Object.values(status.datasets || {});
    const isSyncing = datasets.some((dataset) => dataset.syncing);
    const hasPendingUpload = datasets.some((dataset) => dataset.pendingUpload);
    const hasError = Boolean(status.lastError || datasets.find((dataset) => dataset.lastError));
    let syncState = 'idle';
    let text = 'Nube al dia';

    if (!window.vacacionesData?.getSyncStatus) {
      syncState = 'disabled';
      text = 'Solo local';
    } else if (status.enabled === false) {
      syncState = 'disabled';
      text = 'Solo LAN';
    } else if (isSyncing) {
      syncState = 'syncing';
      text = 'Sincronizando';
    } else if (hasPendingUpload) {
      syncState = 'pending';
      text = 'Por subir';
    } else if (hasError) {
      syncState = 'error';
      text = 'Sin conexion';
    }

    syncStatusButton.dataset.syncState = syncState;
    syncStatusText.textContent = text;
    syncStatusButton.title =
      syncState === 'idle'
        ? 'Nube al dia. Click para sincronizar ahora.'
        : `${text}. Click para sincronizar ahora.`;
  };

  const refreshSyncStatus = async () => {
    if (!window.vacacionesData?.getSyncStatus) {
      updateSyncStatus({ enabled: false });
      return;
    }

    try {
      updateSyncStatus(await window.vacacionesData.getSyncStatus());
    } catch (error) {
      logWarn('No se pudo leer el estado de sincronizacion', { error: errorDetails(error) });
      updateSyncStatus({ enabled: true, lastError: 'No se pudo leer el estado de sincronizacion.' });
    }
  };

  const reloadSyncedData = async () => {
    await loadEmployees();
    await loadEmployeeDatabase();
    await loadVacations();
    renderAll();
  };

  const normalizeDays = (days = []) =>
    [...new Set(days.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))]
      .sort();

  const normalizeSchedule = (schedule = {}) =>
    scheduleDays.reduce((result, day) => {
      const hours = schedule?.[day.key];

      if (Array.isArray(hours) && hours[0] && hours[1]) {
        result[day.key] = [hours[0], hours[1]];
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

    if (source.__sync && typeof source.__sync === 'object' && !Array.isArray(source.__sync)) {
      normalized.__sync = { ...source.__sync };
    }

    return normalized;
  };

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

  const vacationRecordsToMap = (records, reasonId = 'V') => {
    const vacationMap = {};

    vacationRecordList(records, reasonId).forEach((record) => {
      const employeeId = record.empleado_id ?? record.id;

      if (employeeId == null) {
        return;
      }

      const key = String(employeeId);
      const days = normalizeDays(record.dias || record[reasonJsonKeys[reasonId]] || []);
      vacationMap[key] = normalizeDays([...(vacationMap[key] || []), ...days]);
    });

    return vacationMap;
  };

  const parseEmployeeDayEventKey = (key) => {
    const match = String(key).match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);

    if (!match) {
      return null;
    }

    return {
      employeeId: match[1],
      date: match[2],
    };
  };

  const employeeDayEventsFromVacationData = (data) =>
    supplementalReasonIds.reduce((result, reasonId) => {
      vacationRecordList(data, reasonId).forEach((record) => {
        const employeeId = record.empleado_id ?? record.id;

        if (employeeId == null) {
          return;
        }

        normalizeDays(record.dias || record[reasonJsonKeys[reasonId]] || []).forEach((day) => {
          result[`${employeeId}-${day}`] = reasonId;
        });
      });

      return result;
    }, {});

  const mergeVacationMaps = (...maps) =>
    maps.reduce((result, map) => {
      Object.entries(map || {}).forEach(([employeeId, days]) => {
        result[employeeId] = normalizeDays([...(result[employeeId] || []), ...days]);

        if (result[employeeId].length === 0) {
          delete result[employeeId];
        }
      });

      return result;
    }, {});

  const setEmployees = (employees) => {
    const legacyVacationRecords = [];

    state.employees = (Array.isArray(employees) ? employees : []).map((employee) => {
      if (Array.isArray(employee.vacaciones)) {
        legacyVacationRecords.push({ empleado_id: employee.id, dias: employee.vacaciones });
      }

      return normalizeEmployee(employee);
    });

    state.legacyVacationsByEmployeeId = vacationRecordsToMap(legacyVacationRecords);
  };

  const databaseRowById = (rows = [], idKey, id) =>
    rows.find((row) => String(row[idKey]) === String(id)) || null;

  const employeeDatabaseDetailById = (employeeId) =>
    databaseRowById(state.employeeDatabase.empleados, 'id_empleado', employeeId);

  const employeeDatabasePhonesForEmployee = (employeeId) =>
    state.employeeDatabase.telefonos.filter((phone) => String(phone.id_empleado) === String(employeeId));

  const employeeDatabaseAllergiesForEmployee = (employeeId) =>
    state.employeeDatabase.alergias.filter((allergy) => String(allergy.id_empleado) === String(employeeId));

  const employeeDatabasePhoneInputs = () => ({
    Personal: employeeDatabasePhonePersonalInput,
    Emergencia1: employeeDatabasePhoneEmergency1Input,
    Emergencia2: employeeDatabasePhoneEmergency2Input,
    Casa: employeeDatabasePhoneHomeInput,
  });

  const databaseTextKey = (value) => trimmedText(value).toLowerCase();

  const nextDatabaseId = (rows = [], idKey) =>
    rows.reduce((maxId, row) => Math.max(maxId, Number(row[idKey]) || 0), 0) + 1;

  const databaseRowByName = (rows = [], nameKey, name) => {
    const key = databaseTextKey(name);

    if (!key) {
      return null;
    }

    return rows.find((row) => databaseTextKey(row[nameKey]) === key) || null;
  };

  const upsertDatabaseArea = (name) => {
    const areaName = trimmedText(name, 80);

    if (!areaName) {
      return null;
    }

    const existing = databaseRowByName(state.employeeDatabase.areas, 'nombre_area', areaName);
    if (existing) {
      existing.nombre_area = areaName;
      return existing.id_area;
    }

    const area = {
      id_area: nextDatabaseId(state.employeeDatabase.areas, 'id_area'),
      nombre_area: areaName,
    };
    state.employeeDatabase.areas.push(area);
    return area.id_area;
  };

  const upsertDatabaseStore = (name, address) => {
    const storeName = trimmedText(name, 80);
    const storeAddress = trimmedText(address, 255);

    if (!storeName) {
      return null;
    }

    const existing = databaseRowByName(state.employeeDatabase.tiendas, 'nombre_tienda', storeName);
    if (existing) {
      existing.nombre_tienda = storeName;
      existing.direccion_tienda = storeAddress || existing.direccion_tienda || '';
      return existing.id_tienda;
    }

    const store = {
      id_tienda: nextDatabaseId(state.employeeDatabase.tiendas, 'id_tienda'),
      nombre_tienda: storeName,
      direccion_tienda: storeAddress,
    };
    state.employeeDatabase.tiendas.push(store);
    return store.id_tienda;
  };

  const upsertDatabasePosition = (name, areaId) => {
    const positionName = trimmedText(name, 80);

    if (!positionName) {
      return null;
    }

    const existing = databaseRowByName(state.employeeDatabase.puestos, 'nombre_puesto', positionName);
    if (existing) {
      existing.nombre_puesto = positionName;
      existing.id_area = positiveIntegerOrNull(areaId);
      return existing.id_puesto;
    }

    const position = {
      id_puesto: nextDatabaseId(state.employeeDatabase.puestos, 'id_puesto'),
      nombre_puesto: positionName,
      id_area: positiveIntegerOrNull(areaId),
    };
    state.employeeDatabase.puestos.push(position);
    return position.id_puesto;
  };

  const ageFromBirthDate = (birthDate) => {
    const birth = new Date(`${birthDate}T00:00:00`);

    if (Number.isNaN(birth.getTime())) {
      return '';
    }

    let years = today.getFullYear() - birth.getFullYear();
    const birthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

    if (birthday > today) {
      years -= 1;
    }

    return Math.max(0, years);
  };

  const shortMonthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const formatBirthMonthDay = (birthDate) => {
    const parts = dateParts(birthDate);
    if (!parts) return '';
    return `${parts.day} ${shortMonthNames[parts.month - 1]}`;
  };

  const dateParts = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return { year, month, day };
  };

  const recurringDateForYear = (sourceDate, year) => {
    const parts = dateParts(sourceDate);

    if (!parts || year < parts.year) {
      return null;
    }

    const daysInMonth = new Date(year, parts.month, 0).getDate();
    const recurringDay = Math.min(parts.day, daysInMonth);

    return {
      key: `${year}-${pad(parts.month)}-${pad(recurringDay)}`,
      years: year - parts.year,
    };
  };

  const birthDateFromCurp = (curp) => {
    const match = trimmedText(curp, 18).toUpperCase().match(/^[A-Z]{4}(\d{2})(\d{2})(\d{2})/);

    if (!match) {
      return '';
    }

    const shortYear = Number(match[1]);
    const month = match[2];
    const day = match[3];
    const currentShortYear = today.getFullYear() % 100;
    const year = (shortYear <= currentShortYear ? 2000 : 1900) + shortYear;
    const birthDate = `${year}-${month}-${day}`;

    return dateParts(birthDate) ? birthDate : '';
  };

  const employeeBirthDate = (employee) => {
    const detail = employeeDatabaseDetailById(employee.id);

    return detail?.fecha_nacimiento || birthDateFromCurp(detail?.curp);
  };

  const duplicateEmployeeDatabaseValue = (field, value, employeeId) => {
    const normalizedValue = field === 'curp'
      ? trimmedText(value, 18).toUpperCase()
      : field === 'correo'
        ? trimmedText(value, 120).toLowerCase()
        : trimmedText(value, 20);

    if (!normalizedValue) {
      return null;
    }

    return state.employeeDatabase.empleados.find((detail) => {
      if (String(detail.id_empleado) === String(employeeId)) {
        return false;
      }

      const candidate = field === 'curp'
        ? trimmedText(detail[field], 18).toUpperCase()
        : field === 'correo'
          ? trimmedText(detail[field], 120).toLowerCase()
          : trimmedText(detail[field], 20);

      return candidate === normalizedValue;
    }) || null;
  };

  const validateEmployeeDatabaseUniqueFields = (detail) => {
    const fieldLabels = {
      curp: 'CURP',
      correo: 'correo',
      num_cuenta: 'cuenta bancaria',
      num_tarjeta: 'tarjeta',
    };

    return Object.keys(fieldLabels).every((field) => {
      const duplicate = duplicateEmployeeDatabaseValue(field, detail[field], detail.id_empleado);

      if (!duplicate) {
        return true;
      }

      window.alert(`El ${fieldLabels[field]} ya esta registrado en otro empleado.`);
      return false;
    });
  };

  const removeEmployeeDatabaseRecord = (employeeId) => {
    const before = JSON.stringify(state.employeeDatabase);
    const key = String(employeeId);

    state.employeeDatabase.empleados = state.employeeDatabase.empleados.filter(
      (detail) => String(detail.id_empleado) !== key,
    );
    state.employeeDatabase.telefonos = state.employeeDatabase.telefonos.filter(
      (phone) => String(phone.id_empleado) !== key,
    );
    state.employeeDatabase.alergias = state.employeeDatabase.alergias.filter(
      (allergy) => String(allergy.id_empleado) !== key,
    );

    return before !== JSON.stringify(state.employeeDatabase);
  };

  const syncEmployeeDatabaseCoreFields = (employee) => {
    const detail = employeeDatabaseDetailById(employee.id);

    if (!detail) {
      return false;
    }

    const updatedDetail = {
      ...detail,
      nombre: employeeName(employee),
      fecha_ingreso: employee.fecha_ingreso || '',
      salario: normalizeMoney(employee.salario_diario),
    };
    const changed = JSON.stringify(detail) !== JSON.stringify(updatedDetail);

    if (changed) {
      state.employeeDatabase.empleados = state.employeeDatabase.empleados.map((item) =>
        String(item.id_empleado) === String(employee.id) ? updatedDetail : item,
      );
    }

    return changed;
  };

  const vacationDaysForRecord = (employeeId) => state.vacationsByEmployeeId[String(employeeId)] || [];

  const vacationDaysForEmployeeRecord = (employee) => vacationDaysForRecord(employee.id);

  const setEmployeeVacationDay = (employeeId, day, enabled) => {
    const key = String(employeeId);
    const days = new Set(state.vacationsByEmployeeId[key] || []);

    if (enabled) {
      days.add(day);
    } else {
      days.delete(day);
    }

    const normalizedDays = normalizeDays([...days]);

    if (normalizedDays.length > 0) {
      state.vacationsByEmployeeId[key] = normalizedDays;
    } else {
      delete state.vacationsByEmployeeId[key];
    }
  };

  const employeeExists = (employeeId) =>
    state.employees.some((employee) => String(employee.id) === String(employeeId));

  const recordsFromEmployeeDays = (daysByEmployeeId) =>
    Object.entries(daysByEmployeeId)
      .map(([employeeId, days]) => ({
        empleado_id: Number.isNaN(Number(employeeId)) ? employeeId : Number(employeeId),
        dias: normalizeDays(days),
      }))
      .filter((record) => employeeExists(record.empleado_id) && record.dias.length > 0)
      .sort((a, b) => {
        const aNumber = Number(a.empleado_id);
        const bNumber = Number(b.empleado_id);

        if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
          return aNumber - bNumber;
        }

        return String(a.empleado_id).localeCompare(String(b.empleado_id));
      });

  const vacationRecordsFromState = () => recordsFromEmployeeDays(state.vacationsByEmployeeId);

  const employeeDayRecordsFromState = (reasonId) => {
    const daysByEmployeeId = {};

    Object.entries(state.employeeDayEvents).forEach(([key, storedReasonId]) => {
      if (storedReasonId !== reasonId) {
        return;
      }

      const parsedKey = parseEmployeeDayEventKey(key);
      if (!parsedKey || !employeeExists(parsedKey.employeeId)) {
        return;
      }

      daysByEmployeeId[parsedKey.employeeId] = normalizeDays([
        ...(daysByEmployeeId[parsedKey.employeeId] || []),
        parsedKey.date,
      ]);
    });

    return recordsFromEmployeeDays(daysByEmployeeId);
  };

  const vacationDataFromState = () => ({
    [reasonJsonKeys.V]: vacationRecordsFromState(),
    [reasonJsonKeys.D]: employeeDayRecordsFromState('D'),
    [reasonJsonKeys.I]: employeeDayRecordsFromState('I'),
    [reasonJsonKeys.P]: employeeDayRecordsFromState('P'),
  });

  const recordDayCount = (records = []) =>
    (Array.isArray(records) ? records : []).reduce((total, record) => total + normalizeDays(record.dias || []).length, 0);

  const vacationDataSummary = (data = {}) =>
    Object.entries(reasonJsonKeys).reduce((summary, [reasonId, jsonKey]) => {
      const records = vacationRecordList(data, reasonId);
      summary[jsonKey] = {
        empleados: records.length,
        dias: recordDayCount(records),
      };
      return summary;
    }, {});

  const employeeDatabaseSummary = (database = state.employeeDatabase) => ({
    expedientes: database.empleados.length,
    puestos: database.puestos.length,
    areas: database.areas.length,
    tiendas: database.tiendas.length,
    telefonos: database.telefonos.length,
    alergias: database.alergias.length,
  });

  const saveCalendarEvents = () => {
    localStorage.setItem(calendarStorageKey, JSON.stringify(state.events));
    announceLiveSync('calendar');
  };

  const saveMatrixEvents = () => {
    localStorage.setItem(matrixStorageKey, JSON.stringify(state.employeeDayEvents));
  };

  const warnLocalOnlySave = () => {
    if (localOnlySaveWarningShown) {
      return;
    }

    localOnlySaveWarningShown = true;
    window.alert(
      'Para guardar cambios en los archivos JSON, abre la app con npm start. En el navegador solo se guarda localmente.',
    );
  };

  const saveEmployees = async () => {
    try {
      state.employees = state.employees.map(normalizeEmployee);
      localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));

      if (!window.vacacionesData?.saveEmployees) {
        warnLocalOnlySave();
        announceLiveSync('employees');
        logWarn('Empleados guardados solo en navegador', { total: state.employees.length });
        return;
      }

      state.employees = await window.vacacionesData.saveEmployees(state.employees);
      localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));
      announceLiveSync('employees');
      await refreshSyncStatus();
      logInfo('Empleados guardados', { total: state.employees.length });
    } catch (error) {
      logError('No se pudieron guardar empleados', {
        total: state.employees.length,
        error: errorDetails(error),
      });
      throw error;
    }
  };

  const saveVacations = async () => {
    const vacationData = vacationDataFromState();

    try {
      localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
      saveMatrixEvents();

      if (!window.vacacionesData?.saveVacations) {
        warnLocalOnlySave();
        announceLiveSync('vacations');
        logWarn('Vacaciones guardadas solo en navegador', { summary: vacationDataSummary(vacationData) });
        return;
      }

      const savedData = await window.vacacionesData.saveVacations(vacationData);
      state.vacationsByEmployeeId = mergeVacationMaps(vacationRecordsToMap(savedData, 'V'));
      state.employeeDayEvents = employeeDayEventsFromVacationData(savedData);
      state.needsVacationDataSave = false;
      localStorage.setItem(vacationsStorageKey, JSON.stringify(savedData));
      saveMatrixEvents();
      announceLiveSync('vacations');
      await refreshSyncStatus();
      logInfo('Vacaciones y eventos de empleados guardados', { summary: vacationDataSummary(savedData) });
    } catch (error) {
      logError('No se pudieron guardar vacaciones y eventos', {
        summary: vacationDataSummary(vacationData),
        error: errorDetails(error),
      });
      throw error;
    }
  };

  const saveEmployeeDatabase = async () => {
    try {
      state.employeeDatabase = normalizeEmployeeDatabaseData(state.employeeDatabase);
      localStorage.setItem(employeeDatabaseStorageKey, JSON.stringify(state.employeeDatabase));

      if (!window.vacacionesData?.saveEmployeeDatabase) {
        warnLocalOnlySave();
        announceLiveSync('employeeDatabase');
        logWarn('Expedientes guardados solo en navegador', { summary: employeeDatabaseSummary() });
        return;
      }

      state.employeeDatabase = normalizeEmployeeDatabaseData(
        await window.vacacionesData.saveEmployeeDatabase(state.employeeDatabase),
      );
      localStorage.setItem(employeeDatabaseStorageKey, JSON.stringify(state.employeeDatabase));
      announceLiveSync('employeeDatabase');
      await refreshSyncStatus();
      logInfo('Expedientes guardados', { summary: employeeDatabaseSummary() });
    } catch (error) {
      logError('No se pudieron guardar expedientes', {
        summary: employeeDatabaseSummary(),
        error: errorDetails(error),
      });
      throw error;
    }
  };

  const employeeName = (employee) =>
    [employee.nombre, employee.apellido_paterno, employee.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || `Empleado ${employee.id}`;

  const isEmptySortValue = (value) => value == null || value === '';

  const compareEmployeeDatabaseSortValues = (aValue, bValue, direction) => {
    const aEmpty = isEmptySortValue(aValue);
    const bEmpty = isEmptySortValue(bValue);

    if (aEmpty || bEmpty) {
      return Number(aEmpty) - Number(bEmpty);
    }

    const multiplier = direction === 'desc' ? -1 : 1;
    const result = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : textCollator.compare(String(aValue), String(bValue));

    return result * multiplier;
  };

  const employeeDatabaseRowData = (employee) => {
    const detail = employeeDatabaseDetailById(employee.id);
    const position = detail?.id_puesto
      ? databaseRowById(state.employeeDatabase.puestos, 'id_puesto', detail.id_puesto)
      : null;
    const area = position?.id_area
      ? databaseRowById(state.employeeDatabase.areas, 'id_area', position.id_area)
      : null;
    const store = detail?.id_tienda
      ? databaseRowById(state.employeeDatabase.tiendas, 'id_tienda', detail.id_tienda)
      : null;
    const phones = employeeDatabasePhonesForEmployee(employee.id);
    const allergies = employeeDatabaseAllergiesForEmployee(employee.id);
    const birthDate = employeeBirthDate(employee);
    const birthParts = dateParts(birthDate);
    const age = detail?.fecha_nacimiento ? ageFromBirthDate(detail.fecha_nacimiento) : '';
    const birthdayLabel = birthDate ? formatBirthMonthDay(birthDate) : '';
    const positionLabel = position
      ? `${position.nombre_puesto}${area ? ` / ${area.nombre_area}` : ''}`
      : '';
    const phoneText = phones.map((phone) => `${phone.tipo}: ${phone.numero}`).join(' ');
    const phoneLabel = phones
      .map((phone) => `${escapeHtml(phone.tipo)}: ${escapeHtml(phone.numero)}`)
      .join('<br>');
    const allergyLabel = allergies.map((allergy) => allergy.descripcion).join(', ');

    return {
      employee,
      detail,
      age,
      birthdayLabel,
      positionLabel,
      storeLabel: store?.nombre_tienda || '',
      phoneLabel,
      allergyLabel,
      sortValues: {
        employee: employeeName(employee),
        curp: detail?.curp || '',
        age: age === '' ? null : age,
        birthday: birthParts ? birthParts.month * 100 + birthParts.day : null,
        status: detail?.estado_civil || '',
        blood: detail?.tipo_sangre || '',
        position: positionLabel,
        store: store?.nombre_tienda || '',
        phones: phoneText,
        allergies: allergyLabel,
      },
    };
  };

  const sortedEmployeeDatabaseRows = (rows) => {
    const { key, direction } = state.employeeDatabaseSort;

    if (!employeeDatabaseSortDefaults[key]) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const result = compareEmployeeDatabaseSortValues(a.sortValues[key], b.sortValues[key], direction);

      if (result !== 0) {
        return result;
      }

      const nameResult = textCollator.compare(a.sortValues.employee, b.sortValues.employee);
      if (nameResult !== 0) {
        return nameResult;
      }

      return textCollator.compare(String(a.employee.id), String(b.employee.id));
    });
  };

  const renderEmployeeDatabaseSortControls = () => {
    employeeDatabaseSortButtons.forEach((button) => {
      const active = button.dataset.sortKey === state.employeeDatabaseSort.key;
      const direction = active ? state.employeeDatabaseSort.direction : '';
      const header = button.closest('th');

      button.classList.toggle('active', active);
      button.dataset.sortDirection = direction;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.title = active
        ? `Orden ${direction === 'desc' ? 'descendente' : 'ascendente'}. Click para invertir.`
        : 'Click para ordenar esta columna.';

      if (header) {
        header.setAttribute(
          'aria-sort',
          active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none',
        );
      }
    });
  };

  const setEmployeeDatabaseSort = (sortKey) => {
    if (!employeeDatabaseSortDefaults[sortKey]) {
      return;
    }

    const current = state.employeeDatabaseSort;
    const direction = current.key === sortKey
      ? (current.direction === 'asc' ? 'desc' : 'asc')
      : employeeDatabaseSortDefaults[sortKey];

    state.employeeDatabaseSort = { key: sortKey, direction };
    renderEmployeeDatabase();
  };

  const getReason = (reasonId) => reasons.find((reason) => reason.id === reasonId);

  const hasEmployeeVacation = (employee, key) => vacationDaysForEmployeeRecord(employee).includes(key);

  const getEmployeeDayReason = (employee, key) =>
    state.employeeDayEvents[`${employee.id}-${key}`] || (hasEmployeeVacation(employee, key) ? 'V' : '');

  const completedYears = (startDate) => {
    const start = new Date(`${startDate}T00:00:00`);

    if (Number.isNaN(start.getTime())) {
      return 0;
    }

    let years = today.getFullYear() - start.getFullYear();
    const anniversary = new Date(today.getFullYear(), start.getMonth(), start.getDate());

    if (anniversary > today) {
      years -= 1;
    }

    return Math.max(0, years);
  };

  // Returns the labor year (año laboral) that contains referenceDate, anchored to the employee's start date.
  // The labor year runs from one anniversary to the next, not from Jan 1.
  const getLaborYearRange = (startDate, referenceDate = today) => {
    const start = new Date(`${startDate}T00:00:00`);

    if (Number.isNaN(start.getTime())) {
      return null;
    }

    let anniversaryYear = referenceDate.getFullYear();
    let anniversary = new Date(anniversaryYear, start.getMonth(), start.getDate());

    if (anniversary > referenceDate) {
      anniversaryYear -= 1;
      anniversary = new Date(anniversaryYear, start.getMonth(), start.getDate());
    }

    // Employee has not yet reached their first anniversary
    if (anniversary < start) {
      return null;
    }

    return {
      laborStartStr: `${anniversaryYear}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      laborEndStr: `${anniversaryYear + 1}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      yearsCompleted: anniversaryYear - start.getFullYear(),
    };
  };

  const vacationDaysForEmployee = (employee, referenceDate = today) => {
    const range = getLaborYearRange(employee.fecha_ingreso, referenceDate);
    const years = range ? range.yearsCompleted : completedYears(employee.fecha_ingreso);
    const table = state.config?.tablaVacaciones || defaultConfig.tablaVacaciones;
    const rule = table.find(
      (item) =>
        years >= item.antiguedadMinima &&
        (item.antiguedadMaxima == null || years <= item.antiguedadMaxima),
    );

    return rule?.dias || 0;
  };

  const vacationDaysTakenForEmployee = (employee, referenceDate = today) => {
    const range = getLaborYearRange(employee.fecha_ingreso, referenceDate);

    if (!range) {
      return 0;
    }

    const { laborStartStr, laborEndStr } = range;
    const inLaborYear = (date) => date >= laborStartStr && date < laborEndStr;
    const dates = new Set();
    const eventPrefix = `${employee.id}-`;

    vacationDaysForEmployeeRecord(employee).forEach((date) => {
      if (!inLaborYear(date)) {
        return;
      }

      const override = state.employeeDayEvents[`${employee.id}-${date}`];
      if (!override || override === 'V') {
        dates.add(date);
      }
    });

    Object.entries(state.employeeDayEvents).forEach(([key, reasonId]) => {
      if (!key.startsWith(eventPrefix)) {
        return;
      }

      const date = key.slice(eventPrefix.length);
      if (!inLaborYear(date)) {
        return;
      }

      if (reasonId === 'V') {
        dates.add(date);
      } else {
        dates.delete(date);
      }
    });

    return dates.size;
  };

  const remainingVacationDaysForEmployee = (employee, referenceDate = today) =>
    Math.max(0, vacationDaysForEmployee(employee, referenceDate) - vacationDaysTakenForEmployee(employee, referenceDate));

  const nextEmployeeId = () =>
    state.employees.reduce((maxId, employee) => Math.max(maxId, Number(employee.id) || 0), 0) + 1;

  const getCalendarSpecialEntries = (key) => {
    const [yearText] = key.split('-');
    const calendarYear = Number(yearText);

    if (!Number.isFinite(calendarYear)) {
      return [];
    }

    return state.employees.flatMap((employee) => {
      const entries = [];
      const birthday = recurringDateForYear(employeeBirthDate(employee), calendarYear);
      const anniversary = recurringDateForYear(employee.fecha_ingreso, calendarYear);

      if (birthday?.key === key) {
        entries.push({
          type: 'birthday',
          employee,
          name: employeeName(employee),
          reason: {
            ...calendarSpecialReasons.birthday,
            label: `${calendarSpecialReasons.birthday.label} (${birthday.years} años)`,
          },
        });
      }

      if (anniversary?.key === key && anniversary.years > 0) {
        entries.push({
          type: 'work-anniversary',
          employee,
          name: employeeName(employee),
          reason: {
            ...calendarSpecialReasons.workAnniversary,
            label: `${calendarSpecialReasons.workAnniversary.label} (${anniversary.years} años)`,
          },
        });
      }

      return entries;
    });
  };

  const getDayEntries = (key) => {
    const specialEntries = getCalendarSpecialEntries(key);
    const employeeEntries = state.employees
      .map((employee) => {
        const reasonId = getEmployeeDayReason(employee, key);
        const reason = getReason(reasonId);

        if (!reason) {
          return null;
        }

        return {
          type: 'employee',
          employee,
          name: employeeName(employee),
          reason,
        };
      })
      .filter(Boolean);

    const notes = (state.events[key] || []).map((note) => ({
      type: 'note',
      name: note,
      reason: { id: 'N', label: 'Nota', className: 'reason-note' },
    }));

    return [...specialEntries, ...employeeEntries, ...notes];
  };

  const validEmployeeDayEvents = (events = {}) =>
    Object.entries(events).reduce((result, [key, reasonId]) => {
      const parsedKey = parseEmployeeDayEventKey(key);

      if (!parsedKey || !employeeExists(parsedKey.employeeId) || !getReason(reasonId)) {
        return result;
      }

      result[key] = reasonId;
      return result;
    }, {});

  const applyVacationData = (data) => {
    const storedEmployeeDayEvents = validEmployeeDayEvents(state.employeeDayEvents);
    const jsonEmployeeDayEvents = employeeDayEventsFromVacationData(data);
    const hasJsonSupplementalEvents = Object.keys(jsonEmployeeDayEvents).length > 0;
    const hasStoredSupplementalEvents = Object.keys(storedEmployeeDayEvents).some(
      (key) => storedEmployeeDayEvents[key] !== 'V',
    );

    state.vacationsByEmployeeId = mergeVacationMaps(
      state.legacyVacationsByEmployeeId,
      vacationRecordsToMap(data, 'V'),
    );
    state.employeeDayEvents = hasJsonSupplementalEvents
      ? jsonEmployeeDayEvents
      : { ...jsonEmployeeDayEvents, ...storedEmployeeDayEvents };
    state.needsVacationDataSave = !hasJsonSupplementalEvents && hasStoredSupplementalEvents;
  };

  const loadEmployees = async () => {
    if (window.vacacionesData?.getEmployees) {
      try {
        const employees = await window.vacacionesData.getEmployees();
        setEmployees(employees);
        localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));
        logInfo('Empleados cargados', { source: 'archivo-json', total: state.employees.length });
        return;
      } catch (error) {
        setEmployees(fallbackEmployees);
        logError('No se pudieron cargar empleados desde archivo; usando respaldo', {
          error: errorDetails(error),
          total: state.employees.length,
        });
        return;
      }
    }

    try {
      const response = await fetch('empleados.json');
      const data = await response.json();
      setEmployees(data.empleados || fallbackEmployees);
      localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));
      logInfo('Empleados cargados', { source: 'fetch-json', total: state.employees.length });
    } catch (error) {
      setEmployees(readStorage(employeesStorageKey, fallbackEmployees));
      logWarn('No se pudieron cargar empleados por fetch; usando localStorage', {
        error: errorDetails(error),
        total: state.employees.length,
      });
    }
  };

  const loadVacations = async () => {
    if (window.vacacionesData?.getVacations) {
      try {
        const vacationData = await window.vacacionesData.getVacations();
        applyVacationData(vacationData);
        localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
        localStorage.setItem(matrixStorageKey, JSON.stringify(state.employeeDayEvents));
        logInfo('Vacaciones cargadas', { source: 'archivo-json', summary: vacationDataSummary(vacationData) });
        return;
      } catch (error) {
        applyVacationData(fallbackVacationRecords);
        logError('No se pudieron cargar vacaciones desde archivo; usando respaldo', {
          error: errorDetails(error),
          summary: vacationDataSummary(fallbackVacationRecords),
        });
        return;
      }
    }

    try {
      const response = await fetch('vacaciones.json');
      const vacationData = await response.json();
      applyVacationData(vacationData);
      localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
      localStorage.setItem(matrixStorageKey, JSON.stringify(state.employeeDayEvents));
      logInfo('Vacaciones cargadas', { source: 'fetch-json', summary: vacationDataSummary(vacationData) });
    } catch (error) {
      applyVacationData(readStorage(vacationsStorageKey, fallbackVacationRecords));
      logWarn('No se pudieron cargar vacaciones por fetch; usando localStorage', {
        error: errorDetails(error),
        summary: vacationDataSummary(readStorage(vacationsStorageKey, fallbackVacationRecords)),
      });
    }
  };

  const loadEmployeeDatabase = async () => {
    if (window.vacacionesData?.getEmployeeDatabase) {
      try {
        state.employeeDatabase = normalizeEmployeeDatabaseData(await window.vacacionesData.getEmployeeDatabase());
        localStorage.setItem(employeeDatabaseStorageKey, JSON.stringify(state.employeeDatabase));
        logInfo('Expedientes cargados', { source: 'archivo-json', summary: employeeDatabaseSummary() });
        return;
      } catch (error) {
        state.employeeDatabase = normalizeEmployeeDatabaseData(readStorage(employeeDatabaseStorageKey, emptyEmployeeDatabase()));
        logError('No se pudieron cargar expedientes desde archivo; usando localStorage', {
          error: errorDetails(error),
          summary: employeeDatabaseSummary(),
        });
        return;
      }
    }

    try {
      const response = await fetch('empleados_bd.json');
      state.employeeDatabase = normalizeEmployeeDatabaseData(await response.json());
      localStorage.setItem(employeeDatabaseStorageKey, JSON.stringify(state.employeeDatabase));
      logInfo('Expedientes cargados', { source: 'fetch-json', summary: employeeDatabaseSummary() });
    } catch (error) {
      state.employeeDatabase = normalizeEmployeeDatabaseData(readStorage(employeeDatabaseStorageKey, emptyEmployeeDatabase()));
      logWarn('No se pudieron cargar expedientes por fetch; usando localStorage', {
        error: errorDetails(error),
        summary: employeeDatabaseSummary(),
      });
    }
  };

  const migrateMatrixVacationEvents = async () => {
    let changedMatrix = false;
    let changedVacations = false;

    Object.entries(state.employeeDayEvents).forEach(([key, reasonId]) => {
      const parsedKey = parseEmployeeDayEventKey(key);

      if (!parsedKey || !employeeExists(parsedKey.employeeId) || !getReason(reasonId)) {
        delete state.employeeDayEvents[key];
        changedMatrix = true;
        return;
      }

      if (reasonId !== 'V') {
        if (state.vacationsByEmployeeId[String(parsedKey.employeeId)]?.includes(parsedKey.date)) {
          setEmployeeVacationDay(parsedKey.employeeId, parsedKey.date, false);
          changedVacations = true;
        }

        return;
      }

      setEmployeeVacationDay(parsedKey.employeeId, parsedKey.date, true);
      delete state.employeeDayEvents[key];
      changedMatrix = true;
      changedVacations = true;
    });

    if (changedMatrix) {
      saveMatrixEvents();
    }

    if (state.needsVacationDataSave || changedMatrix || changedVacations) {
      await saveVacations();
      logInfo('Migracion de eventos de vacaciones aplicada', {
        changedMatrix,
        changedVacations,
        needsVacationDataSave: state.needsVacationDataSave,
      });
    }
  };

  const loadConfig = async () => {
    if (window.vacacionesData?.getConfig) {
      try {
        state.config = await window.vacacionesData.getConfig();
        logInfo('Configuracion cargada', { source: 'archivo-json' });
        return;
      } catch (error) {
        state.config = defaultConfig;
        logWarn('No se pudo cargar configuracion desde archivo; usando valores por defecto', {
          error: errorDetails(error),
        });
        return;
      }
    }

    try {
      const response = await fetch('configuracion.json');
      state.config = await response.json();
      logInfo('Configuracion cargada', { source: 'fetch-json' });
    } catch (error) {
      state.config = defaultConfig;
      logWarn('No se pudo cargar configuracion por fetch; usando valores por defecto', {
        error: errorDetails(error),
      });
    }
  };

  const renderView = () => {
    const showsMonths = state.view === 'calendar' || state.view === 'matrix';

    monthsBar.classList.toggle('hidden', !showsMonths);
    calendarPage.classList.toggle('hidden', state.view !== 'calendar');
    calendarPage.classList.toggle('active-page', state.view === 'calendar');
    matrixPage.classList.toggle('hidden', state.view !== 'matrix');
    matrixPage.classList.toggle('active-page', state.view === 'matrix');
    schedulesPage.classList.toggle('hidden', state.view !== 'schedules');
    schedulesPage.classList.toggle('active-page', state.view === 'schedules');
    employeesPage.classList.toggle('hidden', state.view !== 'employees');
    employeesPage.classList.toggle('active-page', state.view === 'employees');
    employeeDatabasePage.classList.toggle('hidden', state.view !== 'employee-database');
    employeeDatabasePage.classList.toggle('active-page', state.view === 'employee-database');

    viewButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.view);
    });
  };

  const buildDayCell = ({ year, month, day, isCurrentMonth }) => {
    if (!isCurrentMonth) {
      return `
        <div class="cell adjacent">
          <div class="cell-header">
            <span class="day-number">${day}</span>
          </div>
          <div class="cell-content"></div>
        </div>
      `;
    }

    const key = dateKey(year, month, day);
    const entries = getDayEntries(key);
    const isToday =
      year === today.getFullYear() &&
      month === today.getMonth() &&
      day === today.getDate();

    return `
      <button class="cell ${entries.length ? 'has-events' : ''} ${isToday ? 'today' : ''}" type="button" data-date="${key}">
        <div class="cell-header">
          <span class="day-number">${day}</span>
          <span class="day-badge">${entries.length}</span>
        </div>
        <div class="cell-content">
          ${entries
            .slice(0, 4)
            .map(
              (entry) => `
                <div class="calendar-event ${entry.reason.className}">
                  <b>${escapeHtml(entry.reason.id)}</b>
                  <span>${escapeHtml(entry.name)}</span>
                </div>
              `,
            )
            .join('')}
          ${entries.length > 4 ? `<div class="calendar-more">+${entries.length - 4} mas</div>` : ''}
        </div>
      </button>
    `;
  };

  const renderCalendar = () => {
    const firstDay = new Date(state.year, state.month, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const cells = Array.from({ length: 42 }, (_item, index) => {
      const cellDate = new Date(state.year, state.month, index - mondayOffset + 1);

      return {
        year: cellDate.getFullYear(),
        month: cellDate.getMonth(),
        day: cellDate.getDate(),
        isCurrentMonth:
          cellDate.getFullYear() === state.year && cellDate.getMonth() === state.month,
      };
    });

    calendar.innerHTML = `
      <div class="row">
        ${dayNames.map((name) => `<div class="day-name">${name}</div>`).join('')}
      </div>
      ${Array.from({ length: 6 }, (_row, rowIndex) => {
        const rowCells = cells.slice(rowIndex * 7, rowIndex * 7 + 7);
        return `<div class="row">${rowCells.map(buildDayCell).join('')}</div>`;
      }).join('')}
    `;
  };

  const renderMatrix = () => {
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_item, index) => index + 1);
    const weekdayInitials = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const matrixRefDate = new Date(state.year, state.month + 1, 0);

    matrixTitle.textContent = `Cuadricula de ${monthNames[state.month]} ${state.year}`;

    if (state.employees.length === 0) {
      employeeGrid.style.gridTemplateColumns = '1fr';
      employeeGrid.innerHTML = '<div class="matrix-empty">No hay empleados registrados.</div>';
      return;
    }

    employeeGrid.style.gridTemplateColumns = `260px repeat(${daysInMonth}, 38px)`;
    employeeGrid.innerHTML = `
      <div class="matrix-corner">Empleado</div>
      ${days.map((day) => `<div class="matrix-day">${day}</div>`).join('')}
      <div class="matrix-weekday-corner"></div>
      ${days
        .map((day) => {
          const weekday = new Date(state.year, state.month, day).getDay();
          return `<div class="matrix-weekday">${weekdayInitials[weekday]}</div>`;
        })
        .join('')}
      ${state.employees
        .map((employee) => {
          const name = escapeHtml(employeeName(employee));
          const remainingDays = remainingVacationDaysForEmployee(employee, matrixRefDate);
          return `
            <div class="matrix-employee" title="${name}">
              <span>${name}</span>
              <b>${remainingDays} dias</b>
            </div>
            ${days
              .map((day) => {
                const key = dateKey(state.year, state.month, day);
                const reasonId = getEmployeeDayReason(employee, key);
                const reason = getReason(reasonId);
                const title = reason ? `${employeeName(employee)} - ${key} - ${reason.label}` : `${employeeName(employee)} - ${key}`;

                return `
                  <button
                    class="matrix-cell ${reason?.className || ''}"
                    type="button"
                    data-employee-id="${employee.id}"
                    data-date="${key}"
                    title="${escapeHtml(title)}"
                  >${reasonId}</button>
                `;
              })
              .join('')}
          `;
        })
        .join('')}
    `;
  };

  const renderSchedules = () => {
    if (state.employees.length === 0) {
      scheduleGrid.style.gridTemplateColumns = '1fr';
      scheduleGrid.innerHTML = '<div class="matrix-empty">No hay empleados registrados.</div>';
      return;
    }

    scheduleGrid.style.gridTemplateColumns = '260px repeat(7, minmax(74px, 1fr))';
    scheduleGrid.innerHTML = `
      <div class="schedule-corner">Empleado</div>
      ${scheduleDays
        .map((day) => `<div class="schedule-day"><b>${day.short}</b><span>${day.key}</span></div>`)
        .join('')}
      ${state.employees
        .map((employee) => {
          const name = escapeHtml(employeeName(employee));

          return `
            <div class="schedule-employee" title="${name}">${name}</div>
            ${scheduleDays
              .map((day) => {
                const hours = employee.horario?.[day.key];
                const hasSchedule = Array.isArray(hours) && hours[0] && hours[1];
                const label = hasSchedule ? `${hours[0]}-${hours[1]}` : 'Descanso';

                return `
                  <button
                    class="schedule-cell ${hasSchedule ? 'schedule-work' : 'schedule-rest'}"
                    type="button"
                    data-employee-id="${employee.id}"
                    data-day="${day.key}"
                    title="${escapeHtml(`${employeeName(employee)} - ${day.key} - ${label}`)}"
                  >
                    <span>${escapeHtml(label)}</span>
                  </button>
                `;
              })
              .join('')}
          `;
        })
        .join('')}
    `;
  };

  const renderEmployees = () => {
    employeesCount.textContent = `${state.employees.length} registrados`;

    employeesTableBody.innerHTML =
      state.employees.length === 0
        ? '<tr><td colspan="8" class="employees-empty">No hay empleados registrados.</td></tr>'
        : state.employees
            .map((employee) => {
              const fullName = escapeHtml(employee.nombre || '');
              const lastNames = escapeHtml(
                [employee.apellido_paterno, employee.apellido_materno].filter(Boolean).join(' '),
              );
              const salary = Number(employee.salario_diario || 0).toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN',
              });
              const vacationDays = vacationDaysForEmployee(employee);
              const remainingDays = remainingVacationDaysForEmployee(employee);

              return `
                <tr class="employee-row" data-employee-id="${employee.id}" title="Click para modificar">
                  <td><strong>${fullName}</strong></td>
                  <td>${escapeHtml(employee.fecha_ingreso || '')}</td>
                  <td>${lastNames}</td>
                  <td>${vacationDays}</td>
                  <td><span class="days-pill">${remainingDays}</span></td>
                  <td>${salary}</td>
                  <td>${escapeHtml(employee.comentario || '')}</td>
                  <td>
                    <button class="delete-employee-button" type="button" data-employee-id="${employee.id}">Eliminar</button>
                  </td>
                </tr>
              `;
            })
            .join('');
  };

  const renderEmployeeDatabase = () => {
    renderEmployeeDatabaseSortControls();

    const currentEmployeeIds = new Set(state.employees.map((employee) => String(employee.id)));
    const filterMonth = state.birthdayMonthFilter;

    const filteredEmployees = filterMonth != null
      ? state.employees.filter((employee) => {
          const birthDate = employeeBirthDate(employee);
          if (!birthDate) return false;
          const parts = dateParts(birthDate);
          return parts && parts.month - 1 === filterMonth;
        })
      : state.employees;

    const detailsCount = state.employeeDatabase.empleados.filter((detail) =>
      currentEmployeeIds.has(String(detail.id_empleado))
    ).length;

    if (filterMonth != null) {
      employeeDatabaseCount.textContent = `${filteredEmployees.length} con cumpleaños en ${monthNames[filterMonth]} · ${detailsCount} expedientes de ${state.employees.length} empleados`;
    } else {
      employeeDatabaseCount.textContent = `${detailsCount} expedientes de ${state.employees.length} empleados`;
    }

    if (state.employees.length === 0) {
      employeeDatabaseTableBody.innerHTML =
        '<tr><td colspan="11" class="employees-empty">No hay empleados registrados.</td></tr>';
      return;
    }

    if (filteredEmployees.length === 0) {
      const monthLabel = filterMonth != null ? monthNames[filterMonth] : '';
      employeeDatabaseTableBody.innerHTML =
        `<tr><td colspan="11" class="employees-empty">Ningún empleado cumple años en ${monthLabel}.</td></tr>`;
      return;
    }

    const employeeRows = sortedEmployeeDatabaseRows(filteredEmployees.map(employeeDatabaseRowData));

    employeeDatabaseTableBody.innerHTML = employeeRows
      .map((row) => {
        const {
          employee,
          detail,
          age,
          birthdayLabel,
          positionLabel,
          storeLabel,
          phoneLabel,
          allergyLabel,
        } = row;
        const statusClass = detail ? 'database-status complete' : 'database-status';
        const statusText = detail ? 'Completo' : 'Sin expediente';
        const buttonText = detail ? 'Editar' : 'Agregar';

        return `
          <tr class="employee-database-row" data-employee-id="${employee.id}" title="Click para editar expediente">
            <td>
              <strong>${escapeHtml(employeeName(employee))}</strong>
              <span class="database-subtext">#${escapeHtml(employee.id)}</span>
              <span class="${statusClass}">${statusText}</span>
            </td>
            <td>${detail?.curp ? escapeHtml(detail.curp) : '<span class="database-muted">-</span>'}</td>
            <td>${age !== '' ? `${age} a&ntilde;os` : '<span class="database-muted">-</span>'}</td>
            <td>${birthdayLabel ? `<span class="birthday-date-badge">&#127874; ${escapeHtml(birthdayLabel)}</span>` : '<span class="database-muted">-</span>'}</td>
            <td>${detail?.estado_civil ? escapeHtml(detail.estado_civil) : '<span class="database-muted">-</span>'}</td>
            <td>${detail?.tipo_sangre ? escapeHtml(detail.tipo_sangre) : '<span class="database-muted">-</span>'}</td>
            <td>${positionLabel ? escapeHtml(positionLabel) : '<span class="database-muted">-</span>'}</td>
            <td>${storeLabel ? escapeHtml(storeLabel) : '<span class="database-muted">-</span>'}</td>
            <td>${phoneLabel || '<span class="database-muted">-</span>'}</td>
            <td>${allergyLabel ? escapeHtml(allergyLabel) : '<span class="database-muted">-</span>'}</td>
            <td>
              <button class="employee-table-action employee-database-edit-button" type="button" data-employee-id="${employee.id}">${buttonText}</button>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const renderControls = () => {
    yearTitle.textContent = state.year;
    monthButtons.forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.month) === state.month);
    });
  };

  const renderAll = () => {
    renderControls();
    renderView();
    renderCalendar();
    renderMatrix();
    renderSchedules();
    renderEmployees();
    renderEmployeeDatabase();
  };

  const openDayModal = (date) => {
    const entries = getDayEntries(date);
    const [_year, month, day] = date.split('-').map(Number);

    dayModalTitle.textContent = `${day} de ${monthNames[month - 1]} ${state.year}`;
    dayModalContent.innerHTML =
      entries.length === 0
        ? '<div class="modal-empty">No hay eventos registrados.</div>'
        : entries
            .map(
              (entry) => `
                <div class="modal-row">
                  <span class="modal-reason ${entry.reason.className}">${escapeHtml(entry.reason.id)}</span>
                  <div>
                    <strong>${escapeHtml(entry.name)}</strong>
                    <span>${escapeHtml(entry.reason.label)}</span>
                  </div>
                </div>
              `,
            )
            .join('');

    dayModal.classList.remove('hidden');
    closeDayModalButton.focus();
  };



  const closeDayModal = () => {
    dayModal.classList.add('hidden');
  };

  const openEmployeeModal = (employeeId = null) => {
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));
    state.editingEmployeeId = employee ? employee.id : null;

    employeeForm.reset();
    employeeSalaryInput.value = '0';

    if (employee) {
      employeeModalKicker.textContent = `Empleado #${employee.id}`;
      employeeModalTitle.textContent = 'Modificar empleado';
      employeeModalSubmit.textContent = 'Guardar cambios';
      employeeNameInput.value = employee.nombre || '';
      employeeLastname1Input.value = employee.apellido_paterno || '';
      employeeLastname2Input.value = employee.apellido_materno || '';
      employeeStartDateInput.value = employee.fecha_ingreso || '';
      employeeSalaryInput.value = employee.salario_diario ?? 0;
      employeeCommentInput.value = employee.comentario || '';
    } else {
      employeeModalKicker.textContent = 'Nuevo empleado';
      employeeModalTitle.textContent = 'Agregar empleado';
      employeeModalSubmit.textContent = 'Agregar empleado';
    }

    employeeModal.classList.remove('hidden');
    employeeNameInput.focus();
  };

  const closeEmployeeModal = () => {
    employeeModal.classList.add('hidden');
    state.editingEmployeeId = null;
  };

  const renderEmployeeDatabaseOptions = () => {
    employeeDatabaseEmployeeInput.innerHTML = state.employees
      .map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employeeName(employee))}</option>`)
      .join('');
    employeeAreaOptions.innerHTML = state.employeeDatabase.areas
      .map((area) => `<option value="${escapeHtml(area.nombre_area)}"></option>`)
      .join('');
    employeePositionOptions.innerHTML = state.employeeDatabase.puestos
      .map((position) => `<option value="${escapeHtml(position.nombre_puesto)}"></option>`)
      .join('');
    employeeStoreOptions.innerHTML = state.employeeDatabase.tiendas
      .map((store) => `<option value="${escapeHtml(store.nombre_tienda)}"></option>`)
      .join('');
  };

  const fillEmployeeDatabaseForm = (employeeId) => {
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));

    if (!employee) {
      return;
    }

    const detail = employeeDatabaseDetailById(employee.id);
    const position = detail?.id_puesto
      ? databaseRowById(state.employeeDatabase.puestos, 'id_puesto', detail.id_puesto)
      : null;
    const area = position?.id_area
      ? databaseRowById(state.employeeDatabase.areas, 'id_area', position.id_area)
      : null;
    const store = detail?.id_tienda
      ? databaseRowById(state.employeeDatabase.tiendas, 'id_tienda', detail.id_tienda)
      : null;
    const phoneInputs = employeeDatabasePhoneInputs();

    state.editingEmployeeDatabaseEmployeeId = employee.id;
    employeeDatabaseForm.reset();
    employeeDatabaseEmployeeInput.value = employee.id;
    employeeDatabaseModalKicker.textContent = `Empleado #${employee.id}`;
    employeeDatabaseModalTitle.textContent = employeeName(employee);
    employeeDatabaseSubmit.textContent = detail ? 'Guardar cambios' : 'Guardar expediente';
    employeeDatabaseCurpInput.value = detail?.curp || '';
    employeeDatabaseBirthDateInput.value = detail?.fecha_nacimiento || '';
    employeeDatabaseCivilStatusInput.value = detail?.estado_civil || '';
    employeeDatabaseBloodTypeInput.value = detail?.tipo_sangre || '';
    employeeDatabaseAddressInput.value = detail?.direccion || '';
    employeeDatabaseEmailInput.value = detail?.correo || '';
    employeeDatabaseSchoolingInput.value = detail?.escolaridad || '';
    employeeDatabaseChildrenInput.value = detail?.num_hijos ?? 0;
    employeeDatabaseAreaInput.value = area?.nombre_area || '';
    employeeDatabasePositionInput.value = position?.nombre_puesto || '';
    employeeDatabaseStoreInput.value = store?.nombre_tienda || '';
    employeeDatabaseStoreAddressInput.value = store?.direccion_tienda || '';
    employeeDatabaseAccountInput.value = detail?.num_cuenta || '';
    employeeDatabaseCardInput.value = detail?.num_tarjeta || '';

    Object.values(phoneInputs).forEach((input) => {
      input.value = '';
    });
    employeeDatabasePhonesForEmployee(employee.id).forEach((phone) => {
      if (phoneInputs[phone.tipo]) {
        phoneInputs[phone.tipo].value = phone.numero;
      }
    });
    employeeDatabaseAllergiesInput.value = employeeDatabaseAllergiesForEmployee(employee.id)
      .map((allergy) => allergy.descripcion)
      .join('\n');
  };

  const openEmployeeDatabaseModal = (employeeId = null) => {
    if (state.employees.length === 0) {
      window.alert('Primero agrega un empleado.');
      return;
    }

    renderEmployeeDatabaseOptions();
    fillEmployeeDatabaseForm(employeeId ?? state.employees[0].id);
    employeeDatabaseModal.classList.remove('hidden');
    employeeDatabaseCurpInput.focus();
  };

  const closeEmployeeDatabaseModal = () => {
    employeeDatabaseModal.classList.add('hidden');
    state.editingEmployeeDatabaseEmployeeId = null;
  };

  const saveEmployeeDatabaseFromForm = async () => {
    const employeeId = positiveIntegerOrNull(employeeDatabaseEmployeeInput.value);
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));

    if (!employee) {
      window.alert('Selecciona un empleado valido.');
      return;
    }

    const curp = trimmedText(employeeDatabaseCurpInput.value, 18).toUpperCase();
    const birthDate = normalizeDateString(employeeDatabaseBirthDateInput.value);

    if (curp.length !== 18) {
      window.alert('La CURP debe tener 18 caracteres.');
      employeeDatabaseCurpInput.focus();
      return;
    }

    if (!birthDate) {
      window.alert('Selecciona la fecha de nacimiento.');
      employeeDatabaseBirthDateInput.focus();
      return;
    }

    const detailBase = normalizeEmployeeDatabaseEmployee({
      id_empleado: employee.id,
      nombre: employeeName(employee),
      curp,
      fecha_nacimiento: birthDate,
      estado_civil: employeeDatabaseCivilStatusInput.value,
      tipo_sangre: employeeDatabaseBloodTypeInput.value,
      direccion: employeeDatabaseAddressInput.value,
      correo: employeeDatabaseEmailInput.value,
      num_cuenta: employeeDatabaseAccountInput.value,
      num_tarjeta: employeeDatabaseCardInput.value,
      escolaridad: employeeDatabaseSchoolingInput.value,
      num_hijos: employeeDatabaseChildrenInput.value,
      fecha_ingreso: employee.fecha_ingreso,
      salario: employee.salario_diario,
    });

    if (!validateEmployeeDatabaseUniqueFields(detailBase)) {
      return;
    }

    const areaId = upsertDatabaseArea(employeeDatabaseAreaInput.value);
    const positionId = upsertDatabasePosition(employeeDatabasePositionInput.value, areaId);
    const storeId = upsertDatabaseStore(employeeDatabaseStoreInput.value, employeeDatabaseStoreAddressInput.value);
    const detail = {
      ...detailBase,
      id_puesto: positionId,
      id_tienda: storeId,
    };
    const existingDetail = employeeDatabaseDetailById(employee.id);

    if (existingDetail) {
      state.employeeDatabase.empleados = state.employeeDatabase.empleados.map((item) =>
        String(item.id_empleado) === String(employee.id) ? detail : item,
      );
    } else {
      state.employeeDatabase.empleados.push(detail);
    }

    const previousPhonesByType = new Map(
      employeeDatabasePhonesForEmployee(employee.id).map((phone) => [phone.tipo, phone]),
    );
    let nextPhoneId = nextDatabaseId(state.employeeDatabase.telefonos, 'id_telefono');
    const newPhones = employeePhoneTypes
      .map((type) => {
        const numero = trimmedText(employeeDatabasePhoneInputs()[type].value, 20);

        if (!numero) {
          return null;
        }

        return {
          id_telefono: previousPhonesByType.get(type)?.id_telefono ?? nextPhoneId++,
          id_empleado: employee.id,
          numero,
          tipo: type,
        };
      })
      .filter(Boolean);

    state.employeeDatabase.telefonos = [
      ...state.employeeDatabase.telefonos.filter((phone) => String(phone.id_empleado) !== String(employee.id)),
      ...newPhones,
    ];

    const allergyDescriptions = [
      ...new Set(
        employeeDatabaseAllergiesInput.value
          .split(/\r?\n/)
          .map((line) => trimmedText(line, 120))
          .filter(Boolean),
      ),
    ];
    const previousAllergies = employeeDatabaseAllergiesForEmployee(employee.id);
    let nextAllergyId = nextDatabaseId(state.employeeDatabase.alergias, 'id_alergia');
    const newAllergies = allergyDescriptions.map((description, index) => ({
      id_alergia: previousAllergies[index]?.id_alergia ?? nextAllergyId++,
      id_empleado: employee.id,
      descripcion,
    }));

    state.employeeDatabase.alergias = [
      ...state.employeeDatabase.alergias.filter((allergy) => String(allergy.id_empleado) !== String(employee.id)),
      ...newAllergies,
    ];

    await saveEmployeeDatabase();
    logInfo('Expediente de empleado guardado', {
      employeeId: employee.id,
      action: existingDetail ? 'actualizado' : 'creado',
      employeeName: employeeName(employee),
      phones: newPhones.length,
      allergies: newAllergies.length,
    });
    closeEmployeeDatabaseModal();
    renderAll();
  };

  const setScheduleTimeInputsEnabled = () => {
    const isWorkday = scheduleTypeInput.value === 'work';
    scheduleStartInput.disabled = !isWorkday;
    scheduleEndInput.disabled = !isWorkday;
    scheduleStartInput.required = isWorkday;
    scheduleEndInput.required = isWorkday;
  };

  const openScheduleModal = (employeeId, day) => {
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));
    if (!employee) {
      return;
    }

    const hours = employee.horario?.[day];
    const hasSchedule = Array.isArray(hours) && hours[0] && hours[1];

    state.editingSchedule = { employeeId: employee.id, day };
    scheduleModalKicker.textContent = day;
    scheduleModalTitle.textContent = employeeName(employee);
    scheduleTypeInput.value = hasSchedule ? 'work' : 'rest';
    scheduleStartInput.value = hasSchedule ? hours[0] : '';
    scheduleEndInput.value = hasSchedule ? hours[1] : '';
    setScheduleTimeInputsEnabled();

    scheduleModal.classList.remove('hidden');
    scheduleTypeInput.focus();
  };

  const closeScheduleModal = () => {
    scheduleModal.classList.add('hidden');
    state.editingSchedule = null;
  };

  const saveScheduleFromForm = async () => {
    if (!state.editingSchedule) {
      return;
    }

    const { employeeId, day } = state.editingSchedule;
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));
    if (!employee) {
      return;
    }

    employee.horario = employee.horario || {};

    if (scheduleTypeInput.value === 'rest') {
      delete employee.horario[day];
    } else {
      employee.horario[day] = [scheduleStartInput.value, scheduleEndInput.value];
    }

    await saveEmployees();
    logInfo('Horario guardado', {
      employeeId: employee.id,
      employeeName: employeeName(employee),
      day,
      type: scheduleTypeInput.value === 'rest' ? 'descanso' : 'laboral',
      hours: employee.horario[day] || null,
    });
    closeScheduleModal();
    renderSchedules();
  };

  const saveEmployeeFromForm = async () => {
    const existing = state.employees.find(
      (employee) => String(employee.id) === String(state.editingEmployeeId),
    );
    const employee = {
      ...(existing || {}),
      id: existing?.id ?? nextEmployeeId(),
      nombre: employeeNameInput.value.trim(),
      apellido_paterno: employeeLastname1Input.value.trim(),
      apellido_materno: employeeLastname2Input.value.trim(),
      fecha_ingreso: employeeStartDateInput.value,
      estado: existing?.estado ?? 1,
      salario_diario: Number(employeeSalaryInput.value || 0),
      comentario: employeeCommentInput.value.trim(),
      lugar: existing?.lugar ?? 0,
      puesto: existing?.puesto ?? '',
      horario: existing?.horario ?? {},
    };

    if (existing) {
      state.employees = state.employees.map((item) =>
        String(item.id) === String(existing.id) ? employee : item,
      );
    } else {
      state.employees.push(employee);
    }

    const employeeDatabaseChanged = syncEmployeeDatabaseCoreFields(employee);
    await saveEmployees();
    if (employeeDatabaseChanged) {
      await saveEmployeeDatabase();
    }
    logInfo('Empleado guardado', {
      employeeId: employee.id,
      action: existing ? 'actualizado' : 'creado',
      employeeName: employeeName(employee),
      employeeDatabaseChanged,
    });
    closeEmployeeModal();
    renderAll();
  };

  const deleteEmployee = async (employeeId) => {
    const deletedEmployee = state.employees.find((employee) => String(employee.id) === String(employeeId));
    const employeeDatabaseChanged = removeEmployeeDatabaseRecord(employeeId);
    state.employees = state.employees.filter((employee) => String(employee.id) !== String(employeeId));
    delete state.vacationsByEmployeeId[String(employeeId)];

    Object.keys(state.employeeDayEvents).forEach((key) => {
      if (key.startsWith(`${employeeId}-`)) {
        delete state.employeeDayEvents[key];
      }
    });

    saveMatrixEvents();
    await saveEmployees();
    await saveVacations();
    if (employeeDatabaseChanged) {
      await saveEmployeeDatabase();
    }
    logWarn('Empleado eliminado', {
      employeeId,
      employeeName: deletedEmployee ? employeeName(deletedEmployee) : null,
      employeeDatabaseChanged,
    });
    renderAll();
  };

  const cycleEmployeeDayReason = async (employeeId, date) => {
    const key = `${employeeId}-${date}`;
    const employee = state.employees.find((item) => String(item.id) === String(employeeId));
    const currentReason = employee ? getEmployeeDayReason(employee, date) : state.employeeDayEvents[key];
    const currentIndex = reasons.findIndex((reason) => reason.id === currentReason);
    const nextReason = reasons[currentIndex + 1];

    if (!nextReason) {
      setEmployeeVacationDay(employeeId, date, false);
      delete state.employeeDayEvents[key];
    } else if (nextReason.id === 'V') {
      delete state.employeeDayEvents[key];
      setEmployeeVacationDay(employeeId, date, true);
    } else {
      setEmployeeVacationDay(employeeId, date, false);
      state.employeeDayEvents[key] = nextReason.id;
    }

    saveMatrixEvents();
    await saveVacations();
    logInfo('Dia de empleado actualizado', {
      employeeId,
      employeeName: employee ? employeeName(employee) : null,
      date,
      previousReason: currentReason || null,
      nextReason: nextReason?.id || null,
      nextReasonLabel: nextReason?.label || 'Sin registro',
    });
    renderMatrix();
    renderCalendar();
    renderEmployees();
  };

  const bindCloudSyncEvents = () => {
    if (!window.vacacionesData?.getSyncStatus) {
      updateSyncStatus({ enabled: false });
      return;
    }

    window.vacacionesData.onSyncStatus?.((status) => {
      updateSyncStatus(status);
    });

    window.vacacionesData.onCloudUpdated?.(async () => {
      try {
        await reloadSyncedData();
        await refreshSyncStatus();
        logInfo('Datos actualizados desde la nube');
      } catch (error) {
        logError('No se pudieron recargar datos de la nube', { error: errorDetails(error) });
        updateSyncStatus({ enabled: true, lastError: 'No se pudieron recargar los datos de la nube.' });
      }
    });

    syncStatusButton?.addEventListener('click', async () => {
      logInfo('Sincronizacion manual iniciada');
      syncStatusButton.disabled = true;
      updateSyncStatus({
        enabled: true,
        datasets: {
          employees: { syncing: true },
          vacations: { syncing: true },
          employeeDatabase: { syncing: true },
        },
      });

      try {
        updateSyncStatus(await window.vacacionesData.syncNow());
        await reloadSyncedData();
        logInfo('Sincronizacion manual terminada');
      } catch (error) {
        logError('No se pudo sincronizar manualmente', { error: errorDetails(error) });
        updateSyncStatus({ enabled: true, lastError: 'No se pudo sincronizar ahora.' });
      } finally {
        syncStatusButton.disabled = false;
        await refreshSyncStatus();
      }
    });
  };

  const bindLiveSyncEvents = () => {
    const storageKeyScopes = {
      [calendarStorageKey]: 'calendar',
      [matrixStorageKey]: 'matrix',
      [employeesStorageKey]: 'employees',
      [vacationsStorageKey]: 'vacations',
      [employeeDatabaseStorageKey]: 'employeeDatabase',
      [themeStorageKey]: 'theme',
    };

    window.addEventListener('storage', (event) => {
      handleLocalSyncMessage(storageKeyScopes[event.key]);
    });

    if (liveSyncChannel) {
      liveSyncChannel.addEventListener('message', (event) => {
        const message = event.data || {};

        if (message.type !== 'state-changed' || message.sourceId === liveSyncSourceId) {
          return;
        }

        handleLocalSyncMessage(message.scope);
      });
    }

    window.vacacionesData?.onDataUpdated?.((payload) => {
      handleExternalDatasetUpdate(payload?.dataset);
    });
  };

  const bindEvents = () => {
    monthButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.month = Number(button.dataset.month);
        renderAll();
      });
    });

    viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.view;
        renderView();
      });
    });

    themeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        applyTheme(button.dataset.theme);
        saveTheme(state.theme);
        logInfo('Tema cambiado', { theme: state.theme });
      });
    });

    prevYearButton.addEventListener('click', () => {
      state.year -= 1;
      renderAll();
    });

    nextYearButton.addEventListener('click', () => {
      state.year += 1;
      renderAll()
    });

    calendar.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell[data-date]');
      if (!cell) {
        return;
      }

      openDayModal(cell.dataset.date);
    });

    calendar.addEventListener('contextmenu', (event) => {
      const cell = event.target.closest('.cell[data-date]');
      if (!cell || !state.events[cell.dataset.date]) {
        return;
      }

      event.preventDefault();
      const deletedNotes = state.events[cell.dataset.date]?.length || 0;
      delete state.events[cell.dataset.date];
      saveCalendarEvents();
      logInfo('Eventos manuales de calendario eliminados', {
        date: cell.dataset.date,
        deletedNotes,
      });
      renderCalendar();
    });

    closeDayModalButton.addEventListener('click', closeDayModal);
    closeEmployeeModalButton.addEventListener('click', closeEmployeeModal);
    closeScheduleModalButton.addEventListener('click', closeScheduleModal);
    closeEmployeeDatabaseModalButton.addEventListener('click', closeEmployeeDatabaseModal);
    addEmployeeButton.addEventListener('click', () => openEmployeeModal());
    addEmployeeDatabaseButton.addEventListener('click', () => openEmployeeDatabaseModal());
    scheduleTypeInput.addEventListener('change', setScheduleTimeInputsEnabled);
    employeeDatabaseEmployeeInput.addEventListener('change', () => {
      fillEmployeeDatabaseForm(employeeDatabaseEmployeeInput.value);
    });

    birthdayMonthFilterInput?.addEventListener('change', () => {
      state.birthdayMonthFilter = birthdayMonthFilterInput.value !== '' ? Number(birthdayMonthFilterInput.value) : null;
      renderEmployeeDatabase();
    });

    employeeDatabaseSortButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setEmployeeDatabaseSort(button.dataset.sortKey);
      });
    });

    dayModal.addEventListener('click', (event) => {
      if (event.target === dayModal) {
        closeDayModal();
      }
    });

    employeeModal.addEventListener('click', (event) => {
      if (event.target === employeeModal) {
        closeEmployeeModal();
      }
    });

    scheduleModal.addEventListener('click', (event) => {
      if (event.target === scheduleModal) {
        closeScheduleModal();
      }
    });

    employeeDatabaseModal.addEventListener('click', (event) => {
      if (event.target === employeeDatabaseModal) {
        closeEmployeeDatabaseModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dayModal.classList.contains('hidden')) {
        closeDayModal();
      }

      if (event.key === 'Escape' && !employeeModal.classList.contains('hidden')) {
        closeEmployeeModal();
      }

      if (event.key === 'Escape' && !scheduleModal.classList.contains('hidden')) {
        closeScheduleModal();
      }

      if (event.key === 'Escape' && !employeeDatabaseModal.classList.contains('hidden')) {
        closeEmployeeDatabaseModal();
      }
    });

    scheduleGrid.addEventListener('click', (event) => {
      const cell = event.target.closest('.schedule-cell');
      if (!cell) {
        return;
      }

      openScheduleModal(cell.dataset.employeeId, cell.dataset.day);
    });

    employeeGrid.addEventListener('click', async (event) => {
      const cell = event.target.closest('.matrix-cell');
      if (!cell) {
        return;
      }

      await cycleEmployeeDayReason(cell.dataset.employeeId, cell.dataset.date);
    });

    employeeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveEmployeeFromForm();
    });

    employeeDatabaseForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveEmployeeDatabaseFromForm();
    });

    scheduleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveScheduleFromForm();
    });

    employeeDatabaseTableBody.addEventListener('click', (event) => {
      const button = event.target.closest('.employee-database-edit-button');
      const row = event.target.closest('.employee-database-row');
      const employeeId = button?.dataset.employeeId || row?.dataset.employeeId;

      if (employeeId) {
        openEmployeeDatabaseModal(employeeId);
      }
    });

    employeesTableBody.addEventListener('click', async (event) => {
      const button = event.target.closest('.delete-employee-button');
      if (button) {
        event.stopPropagation();
        await deleteEmployee(button.dataset.employeeId);
        return;
      }

      const row = event.target.closest('.employee-row');
      if (row) {
        openEmployeeModal(row.dataset.employeeId);
      }
    });
  };

  const init = async () => {
    logInfo('Interfaz iniciando');
    applyTheme(readTheme());
    state.events = readStorage(calendarStorageKey, {});
    state.employeeDayEvents = readStorage(matrixStorageKey, {});
    await loadConfig();
    await loadEmployees();
    await loadEmployeeDatabase();
    await loadVacations();
    await migrateMatrixVacationEvents();
    bindEvents();
    bindCloudSyncEvents();
    bindLiveSyncEvents();
    renderAll();
    await refreshSyncStatus();
    logInfo('Interfaz lista', {
      employees: state.employees.length,
      employeeDatabase: employeeDatabaseSummary(),
      vacations: vacationDataSummary(vacationDataFromState()),
    });
  };

  init().catch((error) => {
    logError('No se pudo iniciar la interfaz', { error: errorDetails(error) });
  });
})();
