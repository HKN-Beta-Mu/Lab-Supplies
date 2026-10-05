(function attachDataSource(global) {
  "use strict";

  const STORAGE_KEY = "labkit.app-data";
  const SESSION_STORAGE_KEY = "labkit.session-id";
  const SCHEMA_VERSION = 1;
  const REMOTE_SAVE_DELAY_MS = 900;
  const REMOTE_RETRY_DELAY_MS = 5000;
  const REMOTE_SESSION_SYNC_MS = 25000;
  const MAX_AUTOMATIC_RETRIES = 2;
  const isAppsScript = Boolean(
    global.__LABKIT_APPS_SCRIPT__
      && global.google
      && global.google.script
      && global.google.script.run,
  );

  function readEnvelope() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const envelope = JSON.parse(raw);
      if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION) return null;
      return envelope;
    } catch (error) {
      console.warn("[LabKit] Could not read locally saved data.", error);
      return null;
    }
  }

  function writeEnvelope(data) {
    try {
      global.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          savedAt: new Date().toISOString(),
          data,
        }),
      );
      return true;
    } catch (error) {
      console.warn("[LabKit] Could not save data locally.", error);
      return false;
    }
  }

  function emit(name, detail = {}) {
    global.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function apiError(result) {
    const error = new Error(
      result?.error?.message || "The LabKit backend did not complete the request.",
    );
    error.code = result?.error?.code || "BACKEND_ERROR";
    error.details = result?.error?.details || null;
    return error;
  }

  function callAppsScript(request) {
    return new Promise((resolve, reject) => {
      global.google.script.run
        .withSuccessHandler((result) => {
          if (result?.ok) resolve(result.data);
          else reject(apiError(result));
        })
        .withFailureHandler((error) => {
          const failure = new Error(
            error?.message || "The LabKit backend could not be reached.",
          );
          failure.code = "BACKEND_UNAVAILABLE";
          reject(failure);
        })
        .apiRequest(request);
    });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Browser navigation and open dialogs are personal UI state. Only values
  // that change the shared procurement model belong in the common sheet.
  function sharedSnapshot(data) {
    const source = data && typeof data === "object" ? data : {};
    const state = source.state && typeof source.state === "object" ? source.state : {};
    return clone({
      historicalDataVersion: source.historicalDataVersion || null,
      orderDataVersion: source.orderDataVersion || null,
      state: {
        overrides: state.overrides || {},
        statusOv: state.statusOv || {},
        vendorPolicy: state.vendorPolicy || "best",
        lineVendor: state.lineVendor || {},
      },
      catalog: Array.isArray(source.catalog) ? source.catalog : [],
      kits: Array.isArray(source.kits) ? source.kits : [],
      kitVersions: Array.isArray(source.kitVersions) ? source.kitVersions : [],
      lineupVersions: Array.isArray(source.lineupVersions) ? source.lineupVersions : [],
      changeLog: Array.isArray(source.changeLog) ? source.changeLog : [],
      orders: Array.isArray(source.orders) ? source.orders : [],
      terms: Array.isArray(source.terms) ? source.terms : [],
      inventory: source.inventory && typeof source.inventory === "object"
        ? source.inventory
        : { components: {}, packedKits: {} },
      supplierQuotes: source.supplierQuotes && typeof source.supplierQuotes === "object"
        ? source.supplierQuotes
        : {},
      alternatives: source.alternatives && typeof source.alternatives === "object"
        ? source.alternatives
        : {},
    });
  }

  const remote = {
    ready: false,
    version: 0,
    currentData: null,
    authUser: null,
    backendUser: null,
    connectedUid: "",
    connectPromise: null,
    pending: null,
    pendingSerialized: "",
    lastSavedSerialized: "",
    saveTimer: null,
    inFlight: false,
    retryCount: 0,
    access: { mode: "connecting", canEdit: false, editor: null },
    syncTimer: null,
    syncInFlight: false,
    status: "Connecting to shared sheet…",
  };

  function setRemoteStatus(status, phase = "idle") {
    remote.status = status;
    emit("labkit:data-status", { status, phase });
  }

  function requestId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function sessionId() {
    try {
      const existing = global.sessionStorage?.getItem(SESSION_STORAGE_KEY);
      if (existing) return existing;
      const created = global.crypto?.randomUUID
        ? global.crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      global.sessionStorage?.setItem(SESSION_STORAGE_KEY, created);
      return created;
    } catch (error) {
      return `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
  }

  function sessionLabel() {
    const agent = String(global.navigator?.userAgent || "");
    const browser = /Edg\//.test(agent) ? "Edge"
      : /Firefox\//.test(agent) ? "Firefox"
        : /Chrome\//.test(agent) ? "Chrome"
          : /Safari\//.test(agent) ? "Safari"
            : "Browser";
    const device = /iPhone|iPad/.test(agent) ? "iOS"
      : /Android/.test(agent) ? "Android"
        : /Macintosh/.test(agent) ? "macOS"
          : /Windows/.test(agent) ? "Windows"
            : /Linux/.test(agent) ? "Linux"
              : "device";
    return `${browser} on ${device}`;
  }

  const browserSessionId = sessionId();
  const browserSessionLabel = sessionLabel();

  function updateAccess(access) {
    const previousCanEdit = remote.access?.canEdit === true;
    remote.access = access && typeof access === "object"
      ? clone(access)
      : { mode: "viewer", canEdit: false, editor: null };
    global.document?.body?.classList.toggle(
      "labkit-read-only",
      !remote.access.canEdit,
    );
    emit("labkit:access-changed", { access: clone(remote.access) });
    return previousCanEdit;
  }

  function scheduleSessionSync(delay = REMOTE_SESSION_SYNC_MS) {
    global.clearTimeout(remote.syncTimer);
    if (!remote.ready || !remote.authUser) return;
    remote.syncTimer = global.setTimeout(syncRemoteSession, delay);
  }

  async function syncRemoteSession() {
    remote.syncTimer = null;
    if (!remote.ready || !remote.authUser || remote.syncInFlight) return;
    remote.syncInFlight = true;
    try {
      const idToken = await remote.authUser.getIdToken();
      const result = await callAppsScript({
        action: "syncSession",
        idToken,
        sessionId: browserSessionId,
        sessionLabel: browserSessionLabel,
        payload: { knownVersion: remote.version },
      });
      const wasEditor = remote.access?.canEdit === true;
      updateAccess(result.access);
      if (result.state?.snapshot) {
        remote.version = Number(result.state.version || 0);
        remote.currentData = clone(result.state.snapshot);
        remote.lastSavedSerialized = JSON.stringify(sharedSnapshot(remote.currentData));
        emit("labkit:data-loaded", {
          data: clone(remote.currentData),
          version: remote.version,
          user: remote.backendUser,
        });
      } else {
        remote.version = Number(result.version || remote.version);
        if (!wasEditor && remote.access.canEdit) {
          emit("labkit:data-loaded", {
            data: remote.currentData ? clone(remote.currentData) : null,
            version: remote.version,
            user: remote.backendUser,
          });
        }
      }
      if (remote.access.canEdit) {
        setRemoteStatus("Editing · shared sheet", "ready");
        if (remote.pending) scheduleRemoteSave(0);
      } else {
        setRemoteStatus("Watching · another session is editing", "readonly");
      }
    } catch (error) {
      setRemoteStatus("Session check interrupted — retrying…", "error");
      console.warn("[LabKit] Session sync failed.", error);
    } finally {
      remote.syncInFlight = false;
      scheduleSessionSync();
    }
  }

  function scheduleRemoteSave(delay = REMOTE_SAVE_DELAY_MS) {
    global.clearTimeout(remote.saveTimer);
    remote.saveTimer = global.setTimeout(flushRemoteSave, delay);
  }

  async function flushRemoteSave() {
    remote.saveTimer = null;
    if (!remote.ready || !remote.access.canEdit || remote.inFlight || !remote.pending || !remote.authUser) return;

    const snapshot = remote.pending;
    const serialized = remote.pendingSerialized;
    remote.pending = null;
    remote.pendingSerialized = "";
    if (serialized === remote.lastSavedSerialized) return;

    remote.inFlight = true;
    setRemoteStatus("Saving to shared sheet…", "saving");
    try {
      const idToken = await remote.authUser.getIdToken();
      const result = await callAppsScript({
        action: "saveSnapshot",
        idToken,
        sessionId: browserSessionId,
        sessionLabel: browserSessionLabel,
        requestId: requestId(),
        payload: {
          snapshot,
          expectedVersion: remote.version,
        },
      });
      remote.version = Number(result.version || remote.version);
      remote.currentData = snapshot;
      remote.lastSavedSerialized = serialized;
      remote.retryCount = 0;
      setRemoteStatus("Saved to shared sheet", "saved");
    } catch (error) {
      if (error.code === "EDITOR_LOCKED") {
        remote.pending = null;
        remote.pendingSerialized = "";
        updateAccess(error.details?.access);
        setRemoteStatus("Watching · another session is editing", "readonly");
      } else if (error.code === "VERSION_CONFLICT") {
        remote.pending = null;
        remote.pendingSerialized = "";
        setRemoteStatus("Newer shared data exists — reload", "conflict");
        emit("labkit:data-conflict", {
          message: error.message,
          currentVersion: error.details?.currentVersion,
        });
      } else {
        if (!remote.pending) {
          remote.pending = snapshot;
          remote.pendingSerialized = serialized;
        }
        remote.retryCount += 1;
        const willRetry = remote.retryCount <= MAX_AUTOMATIC_RETRIES;
        setRemoteStatus(
          willRetry ? "Save interrupted — retrying…" : "Save failed — make another change to retry",
          "error",
        );
        if (willRetry) scheduleRemoteSave(REMOTE_RETRY_DELAY_MS);
        console.warn("[LabKit] Shared-sheet save failed.", error);
      }
    } finally {
      remote.inFlight = false;
      if (remote.pending && !remote.saveTimer && remote.retryCount <= MAX_AUTOMATIC_RETRIES) {
        scheduleRemoteSave();
      }
    }
  }

  async function connectRemote(user) {
    if (!isAppsScript) return { user: null, state: null };
    if (!user) throw new Error("Sign in before loading the shared sheet.");
    if (remote.ready && remote.connectedUid === user.uid) {
      return {
        user: remote.backendUser,
        state: remote.currentData,
        access: clone(remote.access),
      };
    }
    if (remote.connectPromise && remote.connectedUid === user.uid) {
      return remote.connectPromise;
    }

    remote.authUser = user;
    remote.connectedUid = user.uid;
    setRemoteStatus("Loading shared sheet…", "loading");
    remote.connectPromise = (async () => {
      try {
        const idToken = await user.getIdToken(true);
        const result = await callAppsScript({
          action: "bootstrap",
          idToken,
          sessionId: browserSessionId,
          sessionLabel: browserSessionLabel,
        });
        const state = result.state || null;
        remote.backendUser = result.user || null;
        remote.version = Number(state?.version || 0);
        remote.currentData = state?.snapshot ? clone(state.snapshot) : null;
        remote.lastSavedSerialized = remote.currentData
          ? JSON.stringify(sharedSnapshot(remote.currentData))
          : "";
        remote.ready = true;
        remote.retryCount = 0;
        updateAccess(result.access);
        setRemoteStatus(remote.access.canEdit
          ? "Editing · shared sheet"
          : "Watching · another session is editing",
        remote.access.canEdit ? "ready" : "readonly");
        emit("labkit:data-loaded", {
          data: remote.currentData ? clone(remote.currentData) : null,
          version: remote.version,
          user: remote.backendUser,
        });
        if (remote.pending) scheduleRemoteSave(0);
        scheduleSessionSync();
        return { user: remote.backendUser, state, access: clone(remote.access) };
      } catch (error) {
        remote.ready = false;
        setRemoteStatus("Shared sheet unavailable", "error");
        throw error;
      } finally {
        remote.connectPromise = null;
      }
    })();
    return remote.connectPromise;
  }

  async function disconnectRemote() {
    if (!isAppsScript) return;
    global.clearTimeout(remote.saveTimer);
    global.clearTimeout(remote.syncTimer);
    if (remote.authUser) {
      try {
        const idToken = await remote.authUser.getIdToken();
        await callAppsScript({
          action: "releaseSession",
          idToken,
          sessionId: browserSessionId,
        });
      } catch (error) {
        console.warn("[LabKit] The editor lease will expire automatically.", error);
      }
    }
    remote.ready = false;
    remote.version = 0;
    remote.currentData = null;
    remote.authUser = null;
    remote.backendUser = null;
    remote.connectedUid = "";
    remote.connectPromise = null;
    remote.pending = null;
    remote.pendingSerialized = "";
    remote.lastSavedSerialized = "";
    remote.inFlight = false;
    remote.syncTimer = null;
    remote.syncInFlight = false;
    remote.access = { mode: "connecting", canEdit: false, editor: null };
    remote.retryCount = 0;
    remote.status = "Connecting to shared sheet…";
    global.document?.body?.classList.remove("labkit-read-only");
  }

  async function runEditorAction(action, payload) {
    if (!isAppsScript) {
      const error = new Error("This feature is available after the app is deployed through Apps Script.");
      error.code = "REMOTE_ONLY";
      throw error;
    }
    if (!remote.ready || !remote.authUser) {
      const error = new Error("The shared LabKit backend is still connecting.");
      error.code = "BACKEND_UNAVAILABLE";
      throw error;
    }
    if (!remote.access.canEdit) {
      const error = new Error("Another LabKit session is editing. AI and supplier lookups are view-only here.");
      error.code = "EDITOR_LOCKED";
      throw error;
    }
    const idToken = await remote.authUser.getIdToken();
    return callAppsScript({
      action,
      idToken,
      sessionId: browserSessionId,
      sessionLabel: browserSessionLabel,
      requestId: requestId(),
      payload: payload && typeof payload === "object" ? payload : {},
    });
  }

  if (isAppsScript && typeof global.addEventListener === "function") {
    global.addEventListener("focus", () => {
      if (!remote.ready || remote.syncInFlight) return;
      global.clearTimeout(remote.syncTimer);
      remote.syncTimer = null;
      syncRemoteSession();
    });
  }

  const adapter = {
    kind: isAppsScript ? "apps-script" : "local",
    schemaVersion: SCHEMA_VERSION,

    get statusLabel() {
      return isAppsScript ? remote.status : "Saved on this device";
    },

    get resetLabel() {
      return isAppsScript ? "Reload" : "Reset";
    },

    get ready() {
      return isAppsScript ? remote.ready : true;
    },

    get version() {
      return isAppsScript ? remote.version : 0;
    },

    get user() {
      return isAppsScript ? remote.backendUser : null;
    },

    get access() {
      return isAppsScript
        ? clone(remote.access)
        : { mode: "editor", canEdit: true, editor: null };
    },

    get canEdit() {
      return isAppsScript ? remote.access.canEdit === true : true;
    },

    load() {
      return isAppsScript
        ? (remote.currentData ? clone(remote.currentData) : null)
        : (readEnvelope()?.data ?? null);
    },

    save(data) {
      if (!isAppsScript) return writeEnvelope(data);
      if (!remote.access.canEdit) return false;
      const snapshot = sharedSnapshot(data);
      const serialized = JSON.stringify(snapshot);
      if (
        serialized === remote.lastSavedSerialized
        || serialized === remote.pendingSerialized
      ) return true;

      remote.pending = snapshot;
      remote.pendingSerialized = serialized;
      remote.retryCount = 0;
      if (remote.ready) scheduleRemoteSave();
      return true;
    },

    reset() {
      if (isAppsScript) {
        global.location.reload();
        return;
      }
      try {
        global.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn("[LabKit] Could not reset locally saved data.", error);
      }
    },

    suggestSemester(payload) {
      return runEditorAction("suggestSemester", payload);
    },

    refreshSupplierQuotes(payload) {
      return runEditorAction("refreshSupplierQuotes", payload);
    },

    connect: connectRemote,
    disconnect: disconnectRemote,
  };

  global.LabKitDataSource = Object.freeze(adapter);
})(window);
