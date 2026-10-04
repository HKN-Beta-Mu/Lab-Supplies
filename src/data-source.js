(function attachDataSource(global) {
  "use strict";

  const STORAGE_KEY = "labkit.app-data";
  const SCHEMA_VERSION = 1;

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

  /**
   * The UI talks only to this small adapter. A future remote provider can keep
   * the same load/save/reset surface while sending records to an authenticated
   * API backed by Google Sheets.
   */
  global.LabKitDataSource = Object.freeze({
    kind: "local",
    statusLabel: "Saved on this device",
    schemaVersion: SCHEMA_VERSION,

    load() {
      return readEnvelope()?.data ?? null;
    },

    save(data) {
      return writeEnvelope(data);
    },

    reset() {
      try {
        global.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn("[LabKit] Could not reset locally saved data.", error);
      }
    },
  });
})(window);
