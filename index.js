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
  const themeStorageKey = 'calendario-vacaciones-tema';
  const themes = ['light', 'dark'];

  const reasons = [
    { id: 'V', label: 'Vacaciones', className: 'reason-v' },
    { id: 'D', label: 'Descanso trabajado', className: 'reason-d' },
    { id: 'I', label: 'Incapacidad', className: 'reason-i' },
    { id: 'P', label: 'Permiso', className: 'reason-p' },
  ];
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
    config: defaultConfig,
    editingEmployeeId: null,
    editingSchedule: null,
    theme: 'light',
    needsVacationDataSave: false,
  };

  const calendarPage = document.querySelector('#calendar-page');
  const matrixPage = document.querySelector('#matrix-page');
  const schedulesPage = document.querySelector('#schedules-page');
  const employeesPage = document.querySelector('#employees-page');
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
    } catch (_error) {
      return fallback;
    }
  };

  const readTheme = () => {
    try {
      const savedTheme = localStorage.getItem(themeStorageKey);
      return themes.includes(savedTheme) ? savedTheme : 'light';
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
      } else {
        await reloadSyncedData();
        return;
      }

      renderAll();
    } catch (_error) {
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

    if (!window.vacacionesData?.getSyncStatus || status.enabled === false) {
      syncState = 'disabled';
      text = 'Solo local';
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
    } catch (_error) {
      updateSyncStatus({ enabled: true, lastError: 'No se pudo leer el estado de sincronizacion.' });
    }
  };

  const reloadSyncedData = async () => {
    await loadEmployees();
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
      'Para guardar cambios en empleados.json y vacaciones.json, abre la app con npm start. En el navegador solo se guarda localmente.',
    );
  };

  const saveEmployees = async () => {
    state.employees = state.employees.map(normalizeEmployee);
    localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));

    if (!window.vacacionesData?.saveEmployees) {
      warnLocalOnlySave();
      announceLiveSync('employees');
      return;
    }

    state.employees = await window.vacacionesData.saveEmployees(state.employees);
    localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));
    announceLiveSync('employees');
    await refreshSyncStatus();
  };

  const saveVacations = async () => {
    const vacationData = vacationDataFromState();
    localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
    saveMatrixEvents();

    if (!window.vacacionesData?.saveVacations) {
      warnLocalOnlySave();
      announceLiveSync('vacations');
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
  };

  const employeeName = (employee) =>
    [employee.nombre, employee.apellido_paterno, employee.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || `Empleado ${employee.id}`;

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

  const vacationDaysForEmployee = (employee) => {
    const years = completedYears(employee.fecha_ingreso);
    const table = state.config?.tablaVacaciones || defaultConfig.tablaVacaciones;
    const rule = table.find(
      (item) =>
        years >= item.antiguedadMinima &&
        (item.antiguedadMaxima == null || years <= item.antiguedadMaxima),
    );

    return rule?.dias || 0;
  };

  const vacationDaysTakenForEmployee = (employee) => {
    const dates = new Set();
    const yearPrefix = `${state.year}-`;
    const eventPrefix = `${employee.id}-`;

    vacationDaysForEmployeeRecord(employee).forEach((date) => {
      if (!date.startsWith(yearPrefix)) {
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
      if (!date.startsWith(yearPrefix)) {
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

  const remainingVacationDaysForEmployee = (employee) =>
    Math.max(0, vacationDaysForEmployee(employee) - vacationDaysTakenForEmployee(employee));

  const nextEmployeeId = () =>
    state.employees.reduce((maxId, employee) => Math.max(maxId, Number(employee.id) || 0), 0) + 1;

  const getDayEntries = (key) => {
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

    return [...employeeEntries, ...notes];
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
        return;
      } catch (_error) {
        setEmployees(fallbackEmployees);
        return;
      }
    }

    try {
      const response = await fetch('empleados.json');
      const data = await response.json();
      setEmployees(data.empleados || fallbackEmployees);
      localStorage.setItem(employeesStorageKey, JSON.stringify(state.employees));
    } catch (_error) {
      setEmployees(readStorage(employeesStorageKey, fallbackEmployees));
    }
  };

  const loadVacations = async () => {
    if (window.vacacionesData?.getVacations) {
      try {
        const vacationData = await window.vacacionesData.getVacations();
        applyVacationData(vacationData);
        localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
        localStorage.setItem(matrixStorageKey, JSON.stringify(state.employeeDayEvents));
        return;
      } catch (_error) {
        applyVacationData(fallbackVacationRecords);
        return;
      }
    }

    try {
      const response = await fetch('vacaciones.json');
      const vacationData = await response.json();
      applyVacationData(vacationData);
      localStorage.setItem(vacationsStorageKey, JSON.stringify(vacationData));
      localStorage.setItem(matrixStorageKey, JSON.stringify(state.employeeDayEvents));
    } catch (_error) {
      applyVacationData(readStorage(vacationsStorageKey, fallbackVacationRecords));
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
    }
  };

  const loadConfig = async () => {
    if (window.vacacionesData?.getConfig) {
      try {
        state.config = await window.vacacionesData.getConfig();
        return;
      } catch (_error) {
        state.config = defaultConfig;
        return;
      }
    }

    try {
      const response = await fetch('configuracion.json');
      state.config = await response.json();
    } catch (_error) {
      state.config = defaultConfig;
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
          const remainingDays = remainingVacationDaysForEmployee(employee);
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
  };

  const openDayModal = (date) => {
    const entries = getDayEntries(date);
    const [_year, month, day] = date.split('-').map(Number);

    dayModalTitle.textContent = `${day} de ${monthNames[month - 1]} ${state.year}`;
    dayModalContent.innerHTML =
      entries.length === 0
        ? '<div class="modal-empty">No hay vacaciones, descansos trabajados ni permisos registrados.</div>'
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

    await saveEmployees();
    closeEmployeeModal();
    renderAll();
  };

  const deleteEmployee = async (employeeId) => {
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
      } catch (_error) {
        updateSyncStatus({ enabled: true, lastError: 'No se pudieron recargar los datos de la nube.' });
      }
    });

    syncStatusButton?.addEventListener('click', async () => {
      syncStatusButton.disabled = true;
      updateSyncStatus({
        enabled: true,
        datasets: {
          employees: { syncing: true },
          vacations: { syncing: true },
        },
      });

      try {
        updateSyncStatus(await window.vacacionesData.syncNow());
        await reloadSyncedData();
      } catch (_error) {
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
      delete state.events[cell.dataset.date];
      saveCalendarEvents();
      renderCalendar();
    });

    closeDayModalButton.addEventListener('click', closeDayModal);
    closeEmployeeModalButton.addEventListener('click', closeEmployeeModal);
    closeScheduleModalButton.addEventListener('click', closeScheduleModal);
    addEmployeeButton.addEventListener('click', () => openEmployeeModal());
    scheduleTypeInput.addEventListener('change', setScheduleTimeInputsEnabled);

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

    scheduleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveScheduleFromForm();
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
    applyTheme(readTheme());
    state.events = readStorage(calendarStorageKey, {});
    state.employeeDayEvents = readStorage(matrixStorageKey, {});
    await loadConfig();
    await loadEmployees();
    await loadVacations();
    await migrateMatrixVacationEvents();
    bindEvents();
    bindCloudSyncEvents();
    bindLiveSyncEvents();
    renderAll();
    await refreshSyncStatus();
  };

  init();
})();
