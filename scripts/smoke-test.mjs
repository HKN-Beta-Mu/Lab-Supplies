import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("entry point contains the complete application shell", async () => {
  const html = await read("index.html");
  assert.match(html, /<title>LabKit · Component Procurement<\/title>/);
  assert.match(html, /class="app-shell/);
  assert.match(html, /vHome/);
  assert.match(html, /vCatalog/);
  assert.match(html, /vOrders/);
  assert.match(html, /LabKitDataSource\.save/);
  assert.match(html, /name="labkit-build" content="2026\.10\.04\.3"/);
  assert.match(html, /vInventory/);
  assert.match(html, /Refresh verified quotes/);
  assert.match(html, /Check non-API sources/);
  assert.match(html, /Newark only/);
});

test("GitHub workflow builds and updates the existing Apps Script deployment", async () => {
  const workflow = await read(".github/workflows/deploy-apps-script.yml");
  const ignore = await read(".gitignore");
  assert.match(workflow, /APPS_SCRIPT_DEPLOY_ENABLED/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /@google\/clasp@3\.4\.1 push --force/);
  assert.match(workflow, /create-deployment/);
  assert.match(workflow, /--deploymentId/);
  assert.match(workflow, /CLASPRC_JSON/);
  assert.match(ignore, /^\.clasp\.json$/m);
  assert.match(ignore, /^\.clasprc\.json$/m);
});

test("the application logic and runtime parse as JavaScript", async () => {
  const html = await read("index.html");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(logic, "embedded application logic should exist");
  assert.doesNotThrow(() => new Function("DCLogic", "React", logic));

  const runtime = await read("support.js");
  assert.doesNotThrow(() => new Function(runtime));
});

test("the data model initializes and can create a persisted semester", async () => {
  const html = await read("index.html");
  const historicalSales = await read("src/historical-sales.js");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let lastSaved = null;

  class LogicStub {
    constructor(props) {
      this.props = props;
      this.state = {};
    }

    setState(update) {
      const patch = typeof update === "function" ? update(this.state) : update;
      this.state = { ...this.state, ...patch };
    }

    forceUpdate() {}
  }

  globalThis.window = {
    LabKitDataSource: {
      load: () => null,
      save: (data) => {
        lastSaved = data;
      },
    },
  };

  try {
    new Function(historicalSales)();
    const App = new Function(
      "DCLogic",
      "React",
      `${logic}\nreturn Component;`,
    )(LogicStub, {});
    const app = new App({});
    app.flash = () => {};

    assert.equal(app.catalog.length, 53);
    assert.equal(app.kits.length, 7);
    assert.equal(app.kitVersions.filter((version) => version.kitId === "ece3741").length, 2);
    assert.equal(app.versionFor("ece3741", "fa25").number, 1);
    assert.equal(app.versionFor("ece3741", "sp26").number, 2);
    assert.match(
      app.versionFor("ece3741", "fa26").items.find((item) => item.p === "c100u").note,
      /bipolar/i,
    );
    assert.equal(app.terms.length, 36);
    assert.equal(app.termMap.fa26.sales, 1531);
    assert.equal(app.termMap.fa26.items.Wirekits, 458);
    assert.equal(app.termMap.sp26.sales, 1230);
    assert.doesNotThrow(() => app.renderVals());
    const initialView = app.renderVals();
    const ece2031Inventory = initialView.inventory.packed.find((row) => row.code === "ECE 2031");
    assert.equal(ece2031Inventory.prepared, 310);
    assert.equal(ece2031Inventory.sold, "228");
    assert.equal(ece2031Inventory.onHand, "82");
    assert.doesNotMatch(logic, /mape===null/);

    app.supplierQuotes.hct00 = [{
      id: "mouser:test",
      vendor: "Mouser",
      vendorSku: "TEST",
      verified: true,
      unitPrice: 0.01,
      minimumOrderQuantity: 1,
      orderMultiple: 1,
      available: 10000,
      priceBreaks: [{ quantity: 1, unitPrice: 0.01 }],
      requirementsPending: true,
      meetsRequirements: null,
    }];
    assert.equal(app.quotePool(app.vendors("hct00", 100)).some((v) => v.verified), false);
    app.supplierQuotes.hct00[0].requirementsPending = false;
    app.supplierQuotes.hct00[0].meetsRequirements = true;
    assert.equal(app.cheapest("hct00", 100).vendor, "Mouser");

    assert.equal(app.kitInventory("ece2031").prepared, 310);
    assert.equal(app.kitInventory("ece2031").sold, 228);
    assert.equal(app.kitInventory("ece2031").onHand, 82);
    app.inventory.packedKits.ece2031.prepared = 238;
    app.inventory.components.hct00.onHand = 100;
    app.versionFor("ece2031", "fa26").items[0].note = "Must be through-hole and breadboard compatible";
    app.createSemester();
    assert.equal(app.terms.length, 37);
    assert.equal(app.state.semesterId, "sp27");
    assert.equal(app.termMap.sp27.status, "Planning");
    assert.equal(app.termMap.sp27.inventoryApplied, true);
    assert.equal(app.termMap.sp27.inventoryAllocation.packedKits.ece2031, 10);
    assert.ok(app.termMap.sp27.inventoryAllocation.components.hct00 > 0);
    const planningView = app.renderVals();
    assert.ok(planningView.comb.terms.some((term) => term.label === "Spring 2027"));
    assert.ok(!planningView.comb.terms.some((term) => term.label === "Fall 2026"));

    app.state.semesterDraft = { season: "Summer", year: 2027 };
    app.createSemester();
    assert.equal(app.termMap.su27.inventoryApplied, false);
    assert.equal(app.termMap.su27.inventoryAllocation.components.hct00, undefined);

    app.persistData();
    assert.equal(lastSaved.terms.length, 38);
    assert.equal(lastSaved.historicalDataVersion, "2026-10-04");
    assert.equal(lastSaved.kits.length, 7);
    assert.equal(lastSaved.kitVersions[0].items[0].note, "Must be through-hole and breadboard compatible");
    assert.equal(lastSaved.inventory.packedKits.ece2031.prepared, 238);
  } finally {
    delete globalThis.window;
  }
});

test("historical sales import preserves the supplied semester and Square totals", async () => {
  const source = await read("src/historical-sales.js");
  const browser = {};
  new Function("window", source)(browser);
  const data = browser.LabKitHistoricalSales;
  const fall = data.terms.find((term) => term.id === "fa26");
  const summer = data.terms.find((term) => term.id === "su26");
  const spring2015 = data.terms.find((term) => term.id === "sp15");

  assert.equal(data.version, "2026-10-04");
  assert.equal(data.terms.length, 36);
  assert.equal(fall.kits["ECE 2031"], 228);
  assert.equal(fall.items["Small Br"], 233);
  assert.equal(fall.items.Wirekits, 458);
  assert.equal(fall.transactionCount, 807);
  assert.equal(fall.salesReport.financials.netTotal, 31523.07);
  assert.match(
    fall.salesReport.itemSales["Wires Kit"].priceVariants[1].note,
    /Half-price wire kits/,
  );
  assert.equal(summer.cls["ECE 2031 (+ Online)"], 111);
  assert.equal(spring2015.cls["ECE 3741"], 367);
});

test("all local assets referenced by the entry point exist", async () => {
  const html = await read("index.html");
  const localAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => (
      !path.startsWith("http")
      && !path.startsWith("#")
      && !path.includes("{{")
    ));

  await Promise.all(localAssets.map(async (path) => {
    const content = await read(path);
    assert.ok(content.length > 0, `${path} should not be empty`);
  }));
});

test("persistence adapter exposes the expected provider boundary", async () => {
  const source = await read("src/data-source.js");
  assert.match(source, /schemaVersion/);
  assert.match(source, /load\(\)/);
  assert.match(source, /save\(data\)/);
  assert.match(source, /reset\(\)/);
  assert.match(source, /google\.script\.run/);
  assert.match(source, /expectedVersion/);
  assert.match(source, /VERSION_CONFLICT/);
});

test("Apps Script data adapter authenticates and seeds an empty shared sheet", async () => {
  const source = await read("src/data-source.js");
  const requests = [];
  const scheduled = [];
  const listeners = new Map();
  let successHandler;
  let failureHandler;
  const runner = {
    withSuccessHandler(handler) {
      successHandler = handler;
      return this;
    },
    withFailureHandler(handler) {
      failureHandler = handler;
      return this;
    },
    apiRequest(request) {
      requests.push(request);
      queueMicrotask(() => {
        if (request.action === "bootstrap") {
          successHandler({
            ok: true,
            data: {
              user: { uid: "firebase-1", email: "admin@example.com", role: "admin" },
              state: null,
              access: {
                mode: "editor",
                canEdit: true,
                editor: { label: "Test browser" },
              },
            },
          });
        } else if (request.action === "saveSnapshot") {
          successHandler({ ok: true, data: { version: 1, duplicate: false } });
        } else {
          failureHandler(new Error("Unexpected action"));
        }
      });
    },
  };
  const browser = {
    __LABKIT_APPS_SCRIPT__: true,
    google: { script: { run: runner } },
    crypto: { randomUUID: () => "12345678-test-request" },
    location: { reload() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout(callback) {
      scheduled.push(callback);
      return scheduled.length;
    },
    clearTimeout() {},
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
  };
  class EventStub {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  }

  new Function("window", "CustomEvent", source)(browser, EventStub);
  assert.equal(browser.LabKitDataSource.kind, "apps-script");

  const connection = await browser.LabKitDataSource.connect({
    uid: "firebase-1",
    getIdToken: async () => "firebase-token",
  });
  assert.equal(connection.user.role, "admin");
  assert.equal(browser.LabKitDataSource.ready, true);
  assert.equal(browser.LabKitDataSource.version, 0);
  assert.equal(browser.LabKitDataSource.canEdit, true);

  browser.LabKitDataSource.save({
    state: { overrides: { ece2031: 240 }, view: "catalog" },
    catalog: [],
    kits: [],
    orders: [],
    terms: [],
    alternatives: {},
  });
  await scheduled.at(-1)();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests[0].action, "bootstrap");
  assert.equal(requests[1].action, "saveSnapshot");
  assert.equal(typeof requests[1].sessionId, "string");
  assert.equal(requests[1].payload.expectedVersion, 0);
  assert.deepEqual(requests[1].payload.snapshot.state, {
    overrides: { ece2031: 240 },
    statusOv: {},
    vendorPolicy: "best",
    lineVendor: {},
  });
  assert.deepEqual(requests[1].payload.snapshot.inventory, {
    components: {},
    packedKits: {},
  });
  assert.equal(browser.LabKitDataSource.version, 1);
});

test("Firebase browser configuration initializes through the module bridge", async () => {
  const html = await read("index.html");
  const bootstrap = await read("src/firebase.js");
  const auth = await read("src/auth.js");
  const config = await read("src/firebase-config.js");

  assert.match(html, /src="\.\/src\/firebase\.js"/);
  assert.match(html, /src="\.\/src\/auth\.js"/);
  assert.match(html, /id="labkit-auth-form"/);
  assert.match(html, /minlength="6"/);
  assert.match(html, /id="labkit-auth-email"[^>]*readonly/);
  assert.doesNotMatch(html, /Create one|Create account/);
  assert.match(html, /onClick="\{\{ signOutUser \}\}"/);
  assert.match(bootstrap, /firebasejs\/12\.19\.0\/firebase-app\.js/);
  assert.match(bootstrap, /getAuth\(app\)/);
  assert.match(auth, /signInWithEmailAndPassword/);
  assert.doesNotMatch(auth, /createUserWithEmailAndPassword/);
  assert.match(auth, /sendEmailVerification/);
  assert.match(auth, /sendPasswordResetEmail/);
  assert.match(auth, /onAuthStateChanged/);
  assert.match(auth, /getIdTokenResult\(user, true\)/);
  assert.match(auth, /window\.LabKitAuth/);
  assert.match(auth, /signOut/);
  assert.match(config, /projectId: "lab-supplies-67dae"/);
  assert.match(config, /accountEmail: "HKNLabSuppliesGatech@gmail\.com"/);
  assert.doesNotMatch(config, /privateKey|clientSecret|serviceAccountKey/);
});

test("responsive styles include desktop, tablet, and mobile layouts", async () => {
  const css = await read("src/app-overrides.css");
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.app-shell\.nav-open \.app-sidebar/);
});

test("Apps Script backend has authenticated, versioned sheet storage", async () => {
  const source = await read("apps-script/Code.gs");
  const manifest = JSON.parse(await read("apps-script/appsscript.json"));
  const guide = await read("apps-script/README.md");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /function initializeLabKit\(\)/);
  assert.match(source, /function apiRequest\(request\)/);
  assert.match(source, /createHtmlOutputFromFile\("Index"\)/);
  assert.match(source, /accounts:lookup/);
  assert.match(source, /emailVerified !== true/);
  assert.match(source, /LockService\.getScriptLock\(\)/);
  assert.match(source, /VERSION_CONFLICT/);
  assert.match(source, /EDITOR_LOCKED/);
  assert.match(source, /touchEditorLease_/);
  assert.match(source, /releaseEditorLease_/);
  assert.match(source, /editorLeaseMilliseconds: 90000/);
  assert.match(source, /SalesSummary/);
  assert.match(source, /PackedKitInventory/);
  assert.match(source, /KitItemRequirements/);
  assert.match(source, /KitVersions/);
  assert.match(source, /SemesterKitVersions/);
  assert.match(source, /ChangeHistory/);
  assert.match(source, /function suggestSemester_/);
  assert.match(source, /function refreshSupplierQuotes_/);
  assert.match(source, /Mouser Search API/);
  assert.match(source, /DigiKey Product Information API/);
  assert.match(source, /Newark Product Search API/);
  assert.match(source, /callGeminiJson_/);
  assert.match(source, /findAuditRequest_/);
  assert.match(source, /accountEmail: "HKNLabSuppliesGatech@gmail\.com"/);
  assert.match(source, /ACCESS_RESTRICTED/);
  assert.doesNotMatch(source, /case "upsertUser"/);
  assert.match(source, /\^\[=\+\\-@\]/);
  assert.doesNotMatch(source, /private[_ ]?key|service[_ ]?account[_ ]?key/i);

  assert.equal(manifest.runtimeVersion, "V8");
  assert.deepEqual(manifest.webapp, {
    access: "ANYONE_ANONYMOUS",
    executeAs: "USER_DEPLOYING",
  });
  assert.ok(manifest.oauthScopes.includes(
    "https://www.googleapis.com/auth/script.external_request",
  ));
  assert.deepEqual(manifest.urlFetchWhitelist, [
    "https://identitytoolkit.googleapis.com/",
    "https://generativelanguage.googleapis.com/",
    "https://api.mouser.com/",
    "https://api.digikey.com/",
    "https://api.element14.com/",
  ]);
  assert.match(guide, /Deploy → New deployment/);
  assert.match(guide, /seeded `Users\.uid` cell is intentionally blank/);
});

test("supplier and Gemini adapters normalize official API responses", async () => {
  const source = await read("apps-script/Code.gs");
  const properties = new Map([
    ["LABKIT_MOUSER_API_KEY", "mouser-test-key"],
    ["LABKIT_NEWARK_API_KEY", "newark-test-key"],
    ["LABKIT_GEMINI_API_KEY", "gemini-test-key"],
    ["LABKIT_GEMINI_MODEL", "gemini-test-model"],
  ]);
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) ?? null,
    }),
  };
  const requests = [];
  const UrlFetchApp = {
    fetch(url, options) {
      requests.push({ url, options });
      let body;
      if (url.includes("api.mouser.com")) {
        body = {
          SearchResults: {
            Parts: [{
              MouserPartNumber: "595-TEST",
              ManufacturerPartNumber: "TEST-1",
              Manufacturer: "Test Parts",
              Description: "Bipolar through-hole capacitor",
              Availability: "1,234 In Stock",
              Min: "5",
              Mult: "5",
              LeadTime: "3 Days",
              PriceBreaks: [
                { Quantity: 1, Price: "$0.10", Currency: "USD" },
                { Quantity: 100, Price: "$0.08", Currency: "USD" },
              ],
            }],
          },
        };
      } else if (url.includes("api.element14.com")) {
        body = {
          keywordSearchReturn: {
            products: [{
              sku: "12M-TEST",
              displayName: "TEST-1 bipolar capacitor",
              brandName: "Test Parts",
              translatedManufacturerPartNumber: "TEST-1",
              translatedMinimumOrderQuantity: 10,
              orderMultiples: "10",
              productURL: "https://www.newark.com/test",
              stock: { level: 4321, leastLeadTime: 2 },
              prices: [
                { from: 1, cost: 0.12, currency: "USD" },
                { from: 100, cost: 0.07, currency: "USD" },
              ],
            }],
          },
        };
      } else {
        body = {
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(body),
      };
    },
  };
  const api = new Function(
    "PropertiesService",
    "UrlFetchApp",
    `${source}\nreturn { fetchMouserQuotes_, fetchNewarkQuotes_, callGeminiJson_ };`,
  )(PropertiesService, UrlFetchApp);

  const quotes = api.fetchMouserQuotes_({
    id: "c-test",
    name: "TEST-1",
    mfr: "Test Parts",
  }, 103);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].orderQuantity, 105);
  assert.equal(quotes[0].unitPrice, 0.08);
  assert.equal(quotes[0].extended, 8.4);
  assert.equal(quotes[0].available, 1234);
  assert.equal(quotes[0].verified, true);
  assert.match(requests[0].url, /api\.mouser\.com\/api\/v1\/search\/partnumber/);

  const newarkQuotes = api.fetchNewarkQuotes_({
    id: "c-test",
    name: "TEST-1",
    mfr: "Test Parts",
    pkg: "Radial",
  }, 103);
  assert.equal(newarkQuotes.length, 1);
  assert.equal(newarkQuotes[0].orderQuantity, 110);
  assert.equal(newarkQuotes[0].unitPrice, 0.07);
  assert.ok(Math.abs(newarkQuotes[0].extended - 7.7) < 1e-9);
  assert.equal(newarkQuotes[0].available, 4321);
  assert.equal(newarkQuotes[0].source, "Newark Product Search API");
  assert.match(requests[1].url, /api\.element14\.com\/catalog\/products/);

  const gemini = api.callGeminiJson_("Return the test object", {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  });
  assert.deepEqual(gemini, { ok: true });
  assert.match(requests[2].url, /gemini-test-model:generateContent/);
  const geminiPayload = JSON.parse(requests[2].options.payload);
  assert.equal(geminiPayload.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(geminiPayload.generationConfig.responseSchema.required, ["ok"]);
});

test("Apps Script editor lease grants one writer and promotes a viewer after release", async () => {
  const source = await read("apps-script/Code.gs");
  const values = new Map();
  const scriptProperties = {
    getProperty: (key) => values.get(key) ?? null,
    setProperty: (key, value) => values.set(key, value),
    deleteProperty: (key) => values.delete(key),
  };
  const PropertiesService = {
    getScriptProperties: () => scriptProperties,
  };
  const LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  };
  const leaseApi = new Function(
    "PropertiesService",
    "LockService",
    `${source}\nreturn { touchEditorLease_, releaseEditorLease_ };`,
  )(PropertiesService, LockService);
  const user = { email: "hknlabsuppliesgatech@gmail.com" };
  const first = {
    sessionId: "session-first-12345",
    sessionLabel: "Safari on macOS",
  };
  const second = {
    sessionId: "session-second-1234",
    sessionLabel: "Chrome on Windows",
  };

  const editor = leaseApi.touchEditorLease_(user, first);
  const viewer = leaseApi.touchEditorLease_(user, second);
  assert.equal(editor.canEdit, true);
  assert.equal(viewer.canEdit, false);
  assert.equal(viewer.editor.label, "Safari on macOS");
  assert.equal(leaseApi.releaseEditorLease_(first).released, true);
  assert.equal(leaseApi.touchEditorLease_(user, second).canEdit, true);
});

test("Apps Script frontend is a self-contained generated artifact", async () => {
  const html = await read("apps-script/Index.html");
  assert.match(html, /window\.__LABKIT_APPS_SCRIPT__ = true/);
  assert.match(html, /google\.script\.run/);
  assert.match(html, /Loading the shared LabKit sheet/);
  assert.match(html, /firebasejs\/12\.19\.0\/firebase-auth\.js/);
  assert.match(html, /HKNLabSuppliesGatech@gmail\.com/);
  assert.doesNotMatch(html, /createUserWithEmailAndPassword/);
  assert.match(html, /class Component extends DCLogic/);
  assert.doesNotMatch(html, /src="\.\//);
  assert.doesNotMatch(html, /href="(?:\.\/)?src\//);
});
