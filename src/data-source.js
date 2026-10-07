(function attachDataSource(global) {
  "use strict";

  const STORAGE_KEY = "labkit.app-data";
  const SESSION_STORAGE_KEY = "labkit.session-id";
  const REMOTE_DRAFT_KEY = "labkit.unsaved-remote-draft";
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
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((output, key) => {
      const normalized = canonicalize(value[key]);
      if (normalized !== undefined) output[key] = normalized;
      return output;
    }, {});
  }

  function stableSerialize(value) {
    return JSON.stringify(canonicalize(value));
  }

  function sameValue(left, right) {
    return stableSerialize(left) === stableSerialize(right);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function arrayIdentityKey(...arrays) {
    const values = arrays.flat().filter((value) => value !== undefined);
    if (!values.length || values.some((value) => !isRecord(value))) return null;
    return ["id", "p", "quantity", "componentId", "kitId", "termId"].find((key) => {
      if (values.some((value) => value[key] === undefined || value[key] === null)) return false;
      return arrays.every((array) => {
        const keys = array.map((value) => String(value[key]));
        return new Set(keys).size === keys.length;
      });
    }) || null;
  }

  // Rebase a complete local snapshot onto a newer server snapshot. Fields the
  // user did not touch follow the server; fields changed locally keep the local
  // value. Collections with stable IDs are merged item-by-item so one stale tab
  // cannot erase an unrelated edit.
  function mergeSnapshots(baseValue, localValue, serverValue) {
    if (sameValue(localValue, baseValue)) return clone(serverValue);
    if (sameValue(serverValue, baseValue) || sameValue(localValue, serverValue)) {
      return clone(localValue);
    }

    if (Array.isArray(baseValue) && Array.isArray(localValue) && Array.isArray(serverValue)) {
      const identity = arrayIdentityKey(baseValue, localValue, serverValue);
      if (!identity) return clone(localValue);
      const base = new Map(baseValue.map((value) => [String(value[identity]), value]));
      const local = new Map(localValue.map((value) => [String(value[identity]), value]));
      const server = new Map(serverValue.map((value) => [String(value[identity]), value]));
      const order = [
        ...serverValue.map((value) => String(value[identity])),
        ...localValue.map((value) => String(value[identity])),
      ].filter((key, index, keys) => keys.indexOf(key) === index);

      return order.flatMap((key) => {
        const hadBase = base.has(key);
        const hasLocal = local.has(key);
        const hasServer = server.has(key);
        if (!hasLocal) return hadBase ? [] : [clone(server.get(key))];
        if (!hasServer) {
          if (!hadBase || !sameValue(local.get(key), base.get(key))) return [clone(local.get(key))];
          return [];
        }
        if (!hadBase) return [clone(local.get(key))];
        return [mergeSnapshots(base.get(key), local.get(key), server.get(key))];
      });
    }

    if (isRecord(baseValue) && isRecord(localValue) && isRecord(serverValue)) {
      const output = {};
      const keys = new Set([
        ...Object.keys(baseValue),
        ...Object.keys(serverValue),
        ...Object.keys(localValue),
      ]);
      keys.forEach((key) => {
        const hadBase = Object.prototype.hasOwnProperty.call(baseValue, key);
        const hasLocal = Object.prototype.hasOwnProperty.call(localValue, key);
        const hasServer = Object.prototype.hasOwnProperty.call(serverValue, key);
        if (!hasLocal) {
          if (!hadBase && hasServer) output[key] = clone(serverValue[key]);
          return;
        }
        if (!hasServer) {
          if (!hadBase || !sameValue(localValue[key], baseValue[key])) output[key] = clone(localValue[key]);
          return;
        }
        output[key] = hadBase
          ? mergeSnapshots(baseValue[key], localValue[key], serverValue[key])
          : clone(localValue[key]);
      });
      return output;
    }

    return clone(localValue);
  }

  // Browser navigation and open dialogs are personal UI state. Only values
  // that change the shared procurement model belong in the common sheet.
  function sharedSnapshot(data) {
    const source = data && typeof data === "object" ? data : {};
    const state = source.state && typeof source.state === "object" ? source.state : {};
    return clone({
      historicalDataVersion: source.historicalDataVersion || null,
      orderDataVersion: source.orderDataVersion || null,
      supplierReferenceDataVersion: source.supplierReferenceDataVersion || null,
      dataSchemaVersion: source.dataSchemaVersion || null,
      state: {
        overrides: state.overrides || {},
        statusOv: state.statusOv || {},
        vendorPolicy: state.vendorPolicy || "best",
        lineVendor: state.lineVendor || {},
        lineSubstitute: state.lineSubstitute || {},
        lineProgress: state.lineProgress || {},
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
      bagTypes: Array.isArray(source.bagTypes) ? source.bagTypes : [],
    });
  }

  function serializeSharedSnapshot(data) {
    return stableSerialize(sharedSnapshot(data));
  }

  const remote = {
    ready: false,
    version: 0,
    currentData: null,
    baseData: null,
    authUser: null,
    backendUser: null,
    capabilities: {
      gemini: { configured: false, canReadVendorUrls: false, inputMode: "paste" },
      suppliers: { mouser: false, digikey: false, newark: false },
    },
    connectedUid: "",
    connectPromise: null,
    pending: null,
    pendingSerialized: "",
    lastSavedSerialized: "",
    saveTimer: null,
    inFlight: false,
    inFlightSnapshot: null,
    inFlightSerialized: "",
    savePromise: null,
    retryCount: 0,
    lastConflictNoticeVersion: 0,
    access: { mode: "connecting", canEdit: false, editor: null },
    syncTimer: null,
    syncInFlight: false,
    status: "Connecting to shared sheet…",
  };

  function readRemoteDraft(uid) {
    try {
      const raw = global.localStorage?.getItem(REMOTE_DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (
        !draft
        || draft.schemaVersion !== SCHEMA_VERSION
        || draft.uid !== uid
        || !isRecord(draft.snapshot)
      ) return null;
      return draft;
    } catch (error) {
      console.warn("[LabKit] Could not read the unsaved-change recovery copy.", error);
      return null;
    }
  }

  function writeRemoteDraft(snapshot = remote.pending) {
    if (!snapshot || !remote.connectedUid) return;
    try {
      global.localStorage?.setItem(REMOTE_DRAFT_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        uid: remote.connectedUid,
        baseVersion: remote.version,
        savedAt: new Date().toISOString(),
        baseSnapshot: remote.baseData,
        snapshot,
      }));
    } catch (error) {
      console.warn("[LabKit] Could not keep an unsaved-change recovery copy.", error);
    }
  }

  function clearRemoteDraft() {
    try {
      global.localStorage?.removeItem(REMOTE_DRAFT_KEY);
    } catch (error) {
      console.warn("[LabKit] Could not clear the saved recovery copy.", error);
    }
  }

  function hasUnsavedRemoteChanges() {
    return Boolean(remote.pending || remote.inFlight);
  }

  function restoreRemoteDraft(uid, serverData = remote.baseData) {
    const draft = readRemoteDraft(uid);
    if (!draft) return false;
    const recovered = mergeSnapshots(
      draft.baseSnapshot || serverData || {},
      draft.snapshot,
      serverData || {},
    );
    const recoveredSerialized = serializeSharedSnapshot(recovered);
    if (recoveredSerialized === remote.lastSavedSerialized) {
      clearRemoteDraft();
      return false;
    }
    remote.currentData = recovered;
    remote.pending = recovered;
    remote.pendingSerialized = recoveredSerialized;
    writeRemoteDraft(recovered);
    return true;
  }

  function setRemoteStatus(status, phase = "idle") {
    remote.status = status;
    emit("labkit:data-status", { status, phase });
  }

  function emitConflictOnce(message, version) {
    const currentVersion = Number(version || 0);
    if (currentVersion && currentVersion <= remote.lastConflictNoticeVersion) return;
    remote.lastConflictNoticeVersion = Math.max(remote.lastConflictNoticeVersion, currentVersion);
    emit("labkit:data-conflict", { message, currentVersion });
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
        const incomingVersion = Number(result.state.version || 0);
        if (remote.pending || remote.inFlight) {
          if (incomingVersion > remote.version) {
            const server = clone(result.state.snapshot);
            const serverSerialized = serializeSharedSnapshot(server);
            // Apps Script may commit our save before the original save request
            // returns. A session poll can therefore observe that exact snapshot
            // first. Treat it as an acknowledgement of our own write, not as an
            // external edit that needs another merge and another warning.
            if (remote.inFlight && serverSerialized === remote.inFlightSerialized) {
              remote.version = incomingVersion;
              remote.baseData = server;
              remote.lastSavedSerialized = serverSerialized;
              remote.currentData = remote.pending ? clone(remote.pending) : server;
              if (remote.pending) writeRemoteDraft(remote.pending);
              else clearRemoteDraft();
              setRemoteStatus(remote.pending ? "Saving newer changes…" : "Saved to shared sheet", remote.pending ? "saving" : "saved");
              return;
            }
            // A session refresh can finish while a save is still waiting on
            // Apps Script. Merge against that in-flight edit as well as any
            // newer queued edit so the UI can never jump back to the last
            // saved value.
            const local = remote.pending || remote.inFlightSnapshot || remote.currentData;
            const merged = mergeSnapshots(remote.baseData || remote.currentData || {}, local, server);
            remote.version = incomingVersion;
            remote.baseData = server;
            remote.currentData = clone(merged);
            remote.pending = merged;
            remote.pendingSerialized = serializeSharedSnapshot(merged);
            writeRemoteDraft(merged);
            emit("labkit:data-loaded", {
              data: clone(merged),
              version: remote.version,
              recovered: true,
              user: remote.backendUser,
            });
            emitConflictOnce(
              "Another editor saved while you were working. Both sets of changes were combined and are saving now.",
              incomingVersion,
            );
          }
        } else {
          remote.version = incomingVersion;
          remote.baseData = clone(result.state.snapshot);
          remote.currentData = clone(result.state.snapshot);
          remote.lastSavedSerialized = serializeSharedSnapshot(remote.currentData);
          emit("labkit:data-loaded", {
            data: clone(remote.currentData),
            version: remote.version,
            user: remote.backendUser,
          });
        }
      } else {
        remote.version = Number(result.version || remote.version);
      }
      if (!wasEditor && remote.access.canEdit) {
        const recovered = restoreRemoteDraft(remote.connectedUid);
        emit("labkit:data-loaded", {
          data: remote.currentData ? clone(remote.currentData) : null,
          version: remote.version,
          recovered,
          user: remote.backendUser,
        });
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

  async function reconcileVersionConflict(snapshot) {
    const idToken = await remote.authUser.getIdToken();
    const result = await callAppsScript({
      action: "syncSession",
      idToken,
      sessionId: browserSessionId,
      sessionLabel: browserSessionLabel,
      payload: { knownVersion: remote.version },
    });
    updateAccess(result.access);
    if (!remote.access.canEdit) return false;

    const server = result.state?.snapshot ? clone(result.state.snapshot) : remote.baseData;
    const incomingVersion = Number(result.state?.version ?? result.version ?? remote.version);
    // A periodic session sync may already have adopted and merged exactly the
    // version that caused this conflict. In that case there is nothing else to
    // fetch; the queued merged snapshot can be retried at the current version.
    if (!server || incomingVersion <= remote.version) {
      return Boolean(remote.pending && remote.baseData);
    }

    const local = remote.pending || snapshot;
    const merged = mergeSnapshots(remote.baseData || {}, local, server);
    remote.version = incomingVersion;
    remote.baseData = server;
    remote.currentData = clone(merged);
    remote.pending = merged;
    remote.pendingSerialized = serializeSharedSnapshot(merged);
    remote.retryCount = 0;
    writeRemoteDraft(merged);
    emit("labkit:data-loaded", {
      data: clone(merged),
      version: remote.version,
      recovered: true,
      user: remote.backendUser,
    });
    emitConflictOnce(
      "Another editor saved while you were working. Both sets of changes were combined; nothing was discarded.",
      incomingVersion,
    );
    return true;
  }

  function flushRemoteSave() {
    remote.saveTimer = null;
    if (remote.inFlight) return remote.savePromise || Promise.resolve(false);
    if (!remote.ready || !remote.access.canEdit || !remote.pending || !remote.authUser) {
      return Promise.resolve(!hasUnsavedRemoteChanges());
    }

    const snapshot = remote.pending;
    const serialized = remote.pendingSerialized;
    remote.pending = null;
    remote.pendingSerialized = "";
    if (serialized === remote.lastSavedSerialized) {
      clearRemoteDraft();
      return Promise.resolve(true);
    }

    remote.inFlight = true;
    remote.inFlightSnapshot = clone(snapshot);
    remote.inFlightSerialized = serialized;
    setRemoteStatus("Saving to shared sheet…", "saving");
    remote.savePromise = (async () => {
      try {
        const idToken = await remote.authUser.getIdToken();
        const expectedVersion = remote.version;
        const result = await callAppsScript({
          action: "saveSnapshot",
          idToken,
          sessionId: browserSessionId,
          sessionLabel: browserSessionLabel,
          requestId: requestId(),
          payload: {
            snapshot,
            expectedVersion,
          },
        });
        const resultVersion = Number(result.version || expectedVersion);
        const versionBeforeResult = remote.version;
        const versionChangedWhileSaving = versionBeforeResult !== expectedVersion;
        // If session sync already advanced the client, it also supplied the
        // authoritative base snapshot. Do not replace that newer merge base
        // with the older in-flight request.
        if (!versionChangedWhileSaving || resultVersion > versionBeforeResult) {
          remote.baseData = clone(snapshot);
        }
        remote.version = Math.max(versionBeforeResult, resultVersion);
        remote.currentData = remote.pending ? clone(remote.pending) : clone(snapshot);
        remote.lastSavedSerialized = serialized;
        remote.retryCount = 0;
        remote.lastConflictNoticeVersion = 0;
        if (remote.pending) writeRemoteDraft(remote.pending);
        else clearRemoteDraft();
        setRemoteStatus(remote.pending ? "Saving newer changes…" : "Saved to shared sheet", remote.pending ? "saving" : "saved");
        return true;
      } catch (error) {
        if (error.code === "EDITOR_LOCKED") {
          if (!remote.pending) {
            remote.pending = snapshot;
            remote.pendingSerialized = serialized;
          }
          writeRemoteDraft(remote.pending);
          updateAccess(error.details?.access);
          setRemoteStatus("Unsaved changes kept · another session is editing", "readonly");
        } else if (error.code === "VERSION_CONFLICT") {
          if (!remote.pending) {
            remote.pending = snapshot;
            remote.pendingSerialized = serialized;
          }
          writeRemoteDraft(remote.pending);
          setRemoteStatus("Reconciling newer saved data…", "saving");
          try {
            const reconciled = await reconcileVersionConflict(snapshot);
            if (!reconciled) throw error;
            scheduleRemoteSave(0);
          } catch (reconcileError) {
            setRemoteStatus("Unsaved changes kept safely · retrying…", "error");
            console.warn("[LabKit] Could not reconcile the newer sheet version yet.", reconcileError);
          }
        } else {
          if (!remote.pending) {
            remote.pending = snapshot;
            remote.pendingSerialized = serialized;
          }
          writeRemoteDraft(remote.pending);
          remote.retryCount += 1;
          const willRetry = remote.retryCount <= MAX_AUTOMATIC_RETRIES;
          setRemoteStatus(
            willRetry ? "Save interrupted — retrying…" : "Unsaved changes kept safely — retry when online",
            "error",
          );
          if (willRetry) scheduleRemoteSave(REMOTE_RETRY_DELAY_MS);
          console.warn("[LabKit] Shared-sheet save failed.", error);
        }
        return false;
      } finally {
        remote.inFlight = false;
        remote.inFlightSnapshot = null;
        remote.inFlightSerialized = "";
        remote.savePromise = null;
        if (remote.pending && !remote.saveTimer && remote.retryCount <= MAX_AUTOMATIC_RETRIES) {
          scheduleRemoteSave();
        }
      }
    })();
    return remote.savePromise;
  }

  async function flushRemoteChanges() {
    if (!isAppsScript) return true;
    global.clearTimeout(remote.saveTimer);
    remote.saveTimer = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!hasUnsavedRemoteChanges()) return true;
      if (!remote.ready || !remote.access.canEdit) return false;
      if (remote.inFlight && remote.savePromise) await remote.savePromise;
      else await flushRemoteSave();
      global.clearTimeout(remote.saveTimer);
      remote.saveTimer = null;
      if (remote.retryCount > MAX_AUTOMATIC_RETRIES) break;
    }
    return !hasUnsavedRemoteChanges();
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
        remote.capabilities = result.capabilities && typeof result.capabilities === "object"
          ? clone(result.capabilities)
          : remote.capabilities;
        remote.version = Number(state?.version || 0);
        const serverData = state?.snapshot ? clone(state.snapshot) : null;
        remote.baseData = serverData ? clone(serverData) : null;
        remote.currentData = serverData ? clone(serverData) : null;
        remote.lastSavedSerialized = serverData
          ? serializeSharedSnapshot(serverData)
          : "";
        remote.ready = true;
        remote.retryCount = 0;
        updateAccess(result.access);

        if (remote.access.canEdit) restoreRemoteDraft(user.uid, serverData);

        emit("labkit:data-loaded", {
          data: remote.currentData ? clone(remote.currentData) : null,
          version: remote.version,
          recovered: Boolean(remote.pending),
          user: remote.backendUser,
        });
        setRemoteStatus(remote.access.canEdit
          ? (remote.pending ? "Recovered unsaved changes · saving…" : "Editing · shared sheet")
          : "Watching · another session is editing",
        remote.access.canEdit ? (remote.pending ? "saving" : "ready") : "readonly");
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

  async function disconnectRemote(options = {}) {
    if (!isAppsScript) return true;
    const force = options?.force === true;
    if (!force && remote.access.canEdit && hasUnsavedRemoteChanges()) {
      const saved = await flushRemoteChanges();
      if (!saved) {
        setRemoteStatus("Could not sign out · unsaved changes are still protected locally", "error");
        return false;
      }
    }
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
    remote.baseData = null;
    remote.authUser = null;
    remote.backendUser = null;
    remote.connectedUid = "";
    remote.connectPromise = null;
    remote.pending = null;
    remote.pendingSerialized = "";
    remote.lastSavedSerialized = "";
    remote.inFlight = false;
    remote.inFlightSnapshot = null;
    remote.inFlightSerialized = "";
    remote.lastConflictNoticeVersion = 0;
    remote.savePromise = null;
    remote.syncTimer = null;
    remote.syncInFlight = false;
    remote.access = { mode: "connecting", canEdit: false, editor: null };
    remote.retryCount = 0;
    remote.status = "Connecting to shared sheet…";
    global.document?.body?.classList.remove("labkit-read-only");
    return true;
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

  async function takeOverRemote() {
    if (!isAppsScript || !remote.ready || !remote.authUser) {
      throw new Error("The shared LabKit backend is not connected.");
    }
    const idToken = await remote.authUser.getIdToken();
    const result = await callAppsScript({
      action: "takeOverSession",
      idToken,
      sessionId: browserSessionId,
      sessionLabel: browserSessionLabel,
    });
    updateAccess(result.access);
    if (remote.access.canEdit && restoreRemoteDraft(remote.connectedUid)) {
      emit("labkit:data-loaded", {
        data: clone(remote.currentData),
        version: remote.version,
        recovered: true,
        user: remote.backendUser,
      });
    }
    setRemoteStatus("Editing · took over this session", "ready");
    if (remote.pending) scheduleRemoteSave(0);
    return clone(remote.access);
  }

  if (isAppsScript && typeof global.addEventListener === "function") {
    global.addEventListener("focus", () => {
      if (!remote.ready || remote.syncInFlight) return;
      global.clearTimeout(remote.syncTimer);
      remote.syncTimer = null;
      syncRemoteSession();
    });
    global.addEventListener("visibilitychange", () => {
      if (global.document?.visibilityState === "hidden" && hasUnsavedRemoteChanges()) {
        global.clearTimeout(remote.saveTimer);
        remote.saveTimer = null;
        flushRemoteSave();
      }
    });
    global.addEventListener("pagehide", () => {
      if (hasUnsavedRemoteChanges()) flushRemoteSave();
    });
    global.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedRemoteChanges()) return;
      event.preventDefault();
      event.returnValue = "";
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

    get capabilities() {
      return isAppsScript
        ? clone(remote.capabilities)
        : {
          gemini: { configured: false, canReadVendorUrls: false, inputMode: "paste" },
          suppliers: { mouser: false, digikey: false, newark: false },
        };
    },

    get canEdit() {
      return isAppsScript ? remote.access.canEdit === true : true;
    },

    get hasUnsavedChanges() {
      return isAppsScript ? hasUnsavedRemoteChanges() : false;
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
      const serialized = serializeSharedSnapshot(snapshot);
      if (
        serialized === remote.pendingSerialized
        || serialized === remote.inFlightSerialized
      ) return true;
      if (serialized === remote.lastSavedSerialized && !remote.inFlight) {
        remote.pending = null;
        remote.pendingSerialized = "";
        global.clearTimeout(remote.saveTimer);
        remote.saveTimer = null;
        clearRemoteDraft();
        return true;
      }

      remote.pending = snapshot;
      remote.pendingSerialized = serialized;
      remote.currentData = clone(snapshot);
      remote.retryCount = 0;
      writeRemoteDraft(snapshot);
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

    generateComponentDescription(payload) {
      return runEditorAction("generateComponentDescription", payload);
    },

    findReplacementComponents(payload) {
      return runEditorAction("findReplacementComponents", payload);
    },

    lookupVendorComponent(payload) {
      return runEditorAction("lookupVendorComponent", payload);
    },

    parseNewComponentText(payload) {
      return runEditorAction("parseNewComponentText", payload);
    },

    parseSupplierText(payload) {
      return runEditorAction("parseSupplierText", payload);
    },

    takeOver: takeOverRemote,

    flush: flushRemoteChanges,

    connect: connectRemote,
    disconnect: disconnectRemote,
  };

  global.LabKitDataSource = Object.freeze(adapter);
})(window);
