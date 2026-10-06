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
  assert.match(html, /name="labkit-build" content="2026\.10\.06\.12"/);
  assert.match(html, /Kit to edit/);
  assert.match(html, /vInventory/);
  assert.match(html, /\+ Add vendor listing/);
  assert.match(html, /Find and save a product link/);
  assert.match(html, /Shipping cost/);
  assert.match(html, /Landed @ 100/);
  assert.match(html, /Tracking number/);
  assert.match(html, /Try Gemini review/);
  assert.match(html, /How the number is calculated/);
  assert.match(html, /Packaging bags/);
  assert.match(html, /Jump to individual kit trend/);
  assert.match(html, /Demand and enrollment over time/);
  assert.match(html, /Enrolled students/);
  assert.match(html, /General-item demand drivers/);
  assert.match(html, /Wire spool yield/);
  assert.match(html, /link-only rows never participate/);
  assert.match(html, /Combined purchasing/);
  assert.doesNotMatch(html, /Refresh APIs \+ AI review/);
  assert.doesNotMatch(html, /<sc-for\b/);
  assert.match(html, /<template data-dc-control="for"/);
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
    confirm: () => true,
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
    assert.equal(app.bagTypes.length, 4);
    assert.equal(app.versionFor("ece2031", "fa26").bagTypeId, "bag-ece2031");
    assert.equal(app.versionFor("wirekit", "fa26").bagTypeId, "");
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
  assert.equal(initialView.inventory.packed.length, app.kits.filter((kit) => !kit.individual).length);
  assert.equal(initialView.inventory.generalItems.length, app.kits.filter((kit) => kit.individual).length);
  const wireInventory = initialView.inventory.generalItems.find((row) => row.name === "Wire Kit");
  assert.ok(wireInventory);
  assert.equal(app.inventory.packedKits.wirekit.calculationMode, "direct");
  wireInventory.onOnHand({ target: { value: "79" } });
  assert.equal(app.inventory.packedKits.wirekit.onHand, 79);
  assert.equal(app.kitInventory("wirekit").available, 79);
    assert.doesNotMatch(logic, /mape===null/);
    assert.equal(app.wireCalculation("wred", 63).spools, 1);
    assert.equal(app.wireCalculation("wred", 64).spools, 2);
    assert.equal(app.wireCalculation("wred", 64).conservative, 63);
    assert.equal(app.componentPurchaseQuantity("wred", 20) + app.componentPurchaseQuantity("wred", 20), 2);
    assert.equal(app.componentPurchaseQuantity("wred", 40), 1);
    assert.match(app.wireCalculation("wred", 64).label, /100 ft ÷ 18 in = 66 nominal/);
    assert.ok(app.supplierQuotes.wred.some((quote) => quote.productUrl.includes("734403")));
    assert.ok(app.supplierQuotes.c100u.some((quote) => quote.productUrl.includes("330422")));
    assert.ok(app.similar("hct20").some((candidate) => candidate.pn === "CD74HCT20E"));
    assert.equal(app.quotePool(app.vendors("wred", 2)).some((quote) => quote.referenceOnly), false);

    app.supplierQuotes.hct00 = [{
      id: "mouser:test",
      vendor: "Mouser",
      vendorSku: "TEST",
      manual: true,
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

    const originalHct04Suppliers = app.supplierQuotes.hct04;
    app.supplierQuotes.hct04 = [
      { id: "a", vendor: "Vendor A", manual: true, productUrl: "https://example.com/a", priceBreaks: [{ quantity: 1, unitPrice: 0.05 }], shippingCost: 5, available: 50, leadTime: "2 days", domestic: true, meetsRequirements: true },
      { id: "b", vendor: "Vendor B", manual: true, productUrl: "https://example.com/b", priceBreaks: [{ quantity: 1, unitPrice: 0.12 }], shippingCost: 2, available: 100, leadTime: "4 days", domestic: true, meetsRequirements: true },
    ];
    const splitVendorPlan = app.vendorPlan("hct04", 120);
    assert.deepEqual(splitVendorPlan.allocations.map((row) => [row.vendor, row.qty]), [["Vendor A", 50], ["Vendor B", 70]]);
    assert.match(splitVendorPlan.decision, /Stock requires a split/);
    app.supplierQuotes.hct04 = originalHct04Suppliers;

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
    assert.equal(app.termMap.sp27.plannedKits.ece2031, 0);
    assert.ok(app.termMap.sp27.suggestedKits.ece2031 > 0);
    assert.equal(app.termMap.sp27.inventoryAllocation.packedKits.ece2031, 0);
    assert.equal(Object.keys(app.termMap.sp27.plannedKits).length, app.kits.length);
    app.updateTermKitUnits("sp27", "ece2031", 20);
    assert.equal(app.termMap.sp27.inventoryAllocation.packedKits.ece2031, 10);
    assert.ok(app.termMap.sp27.inventoryAllocation.components.hct00 > 0);
    const planningView = app.renderVals();
    const planningCard = planningView.kitsCards.find((kit) => kit.code === "ECE 2031");
    assert.equal(planningCard.status, "Planning");
    assert.deepEqual(planningCard.planFields.map((field) => field.label), [
      "Planned demand", "Packed usable", "Faulty / unusable", "To assemble",
    ]);
    let selectedZero = 0;
    planningCard.planFields[0].onFocus({ target: { value: "0", select() { selectedZero += 1; } } });
    assert.equal(selectedZero, 1);
    assert.equal(planningCard.planFields[3].editable, false);
    assert.equal(planningCard.planFields[3].readOnly, true);
    const wirePlanningCard = planningView.kitsCards.find((kit) => kit.name === "Wire Kit");
    assert.deepEqual(wirePlanningCard.planFields.map((field) => field.label), ["Planned quantity"]);
    app.updatePlanningKitMetric("sp27", "ece2031", "purchase", 999);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").purchase, 10);
    assert.equal(app.bagNeed("bag-ece2031", ["sp27"]).gross, 10);
    assert.ok(planningView.comb.terms.some((term) => term.label === "Spring 2027"));
    assert.ok(!planningView.comb.terms.some((term) => term.label === "Fall 2026"));
    planningView.workspaceNav.find((item) => item.label === "Kit definitions").go();
    assert.equal(app.state.builderTargetTermId, "sp27");
    assert.match(app.renderVals().builder.forecastLabel, /Use forecast/);

    app.setState({ scope: "global", gview: "accuracy", forecastTermId: "sp27" });
    const forecastView = app.renderVals().acc;
    assert.equal(forecastView.actualLabel, "Current plan");
    assert.equal(forecastView.aiStatus, "History model active");
    assert.match(forecastView.method, /three most recent completed Spring semesters/);
    assert.match(forecastView.trendRows.find((row) => row.code === "ECE 2031").reason, /Spring/);
    assert.equal(forecastView.kitNav.length, app.kits.length);
    forecastView.kitNav.find((row) => row.label === "ECE 2040").go();
    assert.equal(app.state.forecastView, "kit");
    assert.equal(app.state.forecastKitId, "ece2040");

    app.state.semesterDraft = { season: "Summer", year: 2027 };
    app.createSemester();
    assert.equal(app.termMap.su27.inventoryApplied, false);
    assert.equal(app.termMap.su27.inventoryAllocation.components.hct00, undefined);
    app.setState({ scope: "global", gview: "accuracy", forecastView: "kit", forecastKitId: "ece2040", forecastSeasonFilter: "All", forecastStatusFilter: "All" });
    const kitTrend = app.renderVals().acc.kit;
    assert.equal(kitTrend.rows[0].term, "Summer 2027");
    assert.equal(kitTrend.chart.series.length, 3);
    assert.ok(kitTrend.rows.every((row) => Object.prototype.hasOwnProperty.call(row, "enrollment")));
    kitTrend.onSeason({ target: { value: "Summer" } });
    assert.ok(app.renderVals().acc.kit.rows.every((row) => row.term.startsWith("Summer")));
    app.setState({ forecastKitId: "wirekit", forecastTermId: "sp27", forecastSeasonFilter: "All" });
    const generalTrend = app.renderVals().acc;
    assert.match(generalTrend.method, /General items/);
    assert.ok(generalTrend.kit.drivers.some((row) => row.course.startsWith("ECE 4180")));
    assert.equal(app.driverActive(app.generalItemDrivers.find((row) => row.course === "ECE 2035"), app.termMap.fa24), false);
    assert.equal(app.driverActive(app.generalItemDrivers.find((row) => row.course === "ECE 2035"), app.termMap.fa25), true);

    assert.doesNotThrow(() => app.startKitEdit("ece2031", "future"));
    assert.equal(app.state.scope, "global");
    assert.equal(app.state.gview, "build");
    const futureBuilder = app.renderVals();
    assert.ok(futureBuilder.builder.items.length > 0);
    assert.equal(futureBuilder.builder.items[0].name, "74HCT00N");
    assert.doesNotThrow(() => app.startKitEdit("ece2031", "sp27"));
    assert.equal(app.state.scope, "semester");
    assert.equal(app.state.semesterId, "sp27");
    assert.equal(app.state.view, "build");
    const semesterBuilder = app.renderVals();
    assert.equal(semesterBuilder.builder.kits.length, 7);
    semesterBuilder.builder.onKit({ target: { value: "ece3043" } });
    assert.equal(app.state.builderKitId, "ece3043");
    assert.equal(app.state.builderTargetTermId, "sp27");
    app.renderVals().builder.onKit({ target: { value: "ece2031" } });
    assert.equal(app.state.builderKitId, "ece2031");
    assert.equal(app.state.builderTargetTermId, "sp27");
    const assignedPriceVersion = app.versionFor("ece2031", "sp27");
    const versionCount = app.kitVersions.length;
    app.updateTermKitPrice("sp27", "ece2031", "20");
    assert.equal(assignedPriceVersion.salePrice, 20);
    assert.equal(app.kitSalePrice(app.kitMap.ece2031, "sp26"), null);
    assert.equal(app.termMap.sp27.salePrices.ece2031, undefined);
    assert.equal(app.kitVersions.length, versionCount);
    const pricingView = app.renderVals();
    assert.equal(pricingView.kitsCards.find((kit) => kit.code === "ECE 2031").salePrice, 20);
    assert.equal(pricingView.priceTest.rows.find((row) => row.code === "ECE 2031").saved, "$20.00");
    pricingView.priceTest.rows.find((row) => row.code === "ECE 2031").onTest({ target: { value: "25" } });
    assert.equal(app.state.priceTestValues["sp27:ece2031"], "25");
    app.startKitEdit("ece2031", "future");
    app.builderDraft.salePrice = "22";
    app.saveKitVersion();
    assert.equal(app.kitSalePrice(app.kitMap.ece2031, "sp27"), 22);
    assert.equal(app.kitSalePrice(app.kitMap.ece2031, "sp26"), null);
    assert.equal(app.renderVals().kitsCards.find((kit) => kit.code === "ECE 2031").salePrice, 22);
    app.toggleTermKitOffering("sp27", "ece3043");
    assert.equal(app.termMap.sp27.kitOfferings.ece3043, false);
    assert.equal(app.sales(app.kitMap.ece3043, "sp27").sold, 0);
    assert.ok(app.lineupVersions.length >= 1);

    const fallSales = app.termMap.fa26.sales;
    app.setTermStatus("fa26", "Closed");
    assert.equal(app.termMap.fa26.sales, fallSales);
    assert.equal(app.termMap.fa26.actualPending, false);
    app.setTermStatus("fa26", "Planning");
    assert.equal(app.termMap.fa26.status, "Planning");
    app.setTermStatus("su26", "Planning");
    assert.equal(app.termMap.su26.status, "Closed");

    app.persistData();
    assert.equal(lastSaved.terms.length, 38);
    assert.equal(lastSaved.historicalDataVersion, "2026-10-04");
    assert.equal(lastSaved.kits.length, 7);
    assert.equal(lastSaved.kitVersions[0].items[0].note, "Must be through-hole and breadboard compatible");
    assert.ok(lastSaved.lineupVersions.length >= 1);
    assert.equal(lastSaved.inventory.packedKits.ece2031.prepared, 238);
    assert.equal(lastSaved.supplierReferenceDataVersion, "2026-10-05-v1");
    assert.equal(lastSaved.dataSchemaVersion, "2026-10-06-v3");
    assert.equal(lastSaved.bagTypes.length, 4);
    assert.equal(lastSaved.state.priceTestValues, undefined);
    assert.equal(lastSaved.state.priceTestOpen, undefined);
  } finally {
    delete globalThis.window;
  }
});

test("the app cannot queue default data before the remote snapshot is hydrated", async () => {
  const html = await read("index.html");
  const historicalSales = await read("src/historical-sales.js");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let saves = 0;
  class LogicStub {
    constructor(props) { this.props = props; this.state = {}; }
    setState(update) {
      const patch = typeof update === "function" ? update(this.state) : update;
      this.state = { ...this.state, ...patch };
    }
    forceUpdate() {}
  }
  globalThis.window = {
    confirm: () => true,
    LabKitDataSource: {
      kind: "apps-script",
      ready: false,
      load: () => null,
      save: () => { saves += 1; },
    },
  };
  try {
    new Function(historicalSales)();
    const App = new Function("DCLogic", "React", `${logic}\nreturn Component;`)(LogicStub, {});
    const app = new App({});
    app.persistData();
    assert.equal(saves, 0);
    app.onSharedDataLoaded({ detail: { data: {
      historicalDataVersion: app.historicalDataVersion,
      state: {}, catalog: app.catalog, kits: app.kits, terms: app._terms,
    } } });
    app.persistData();
    assert.equal(saves, 1);
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
  assert.equal(summer.cls["ECE 4180"], 0);
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
  assert.match(source, /REMOTE_DRAFT_KEY/);
  assert.match(source, /beforeunload/);
  assert.match(source, /mergeSnapshots/);
  assert.match(source, /flush: flushRemoteChanges/);
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

test("Apps Script data adapter rebases and retries without discarding an edit", async () => {
  const source = await read("src/data-source.js");
  const requests = [];
  const scheduled = [];
  const storage = new Map();
  let successHandler;
  let failureHandler;
  let saveAttempts = 0;
  const baseSnapshot = {
    state: { overrides: {}, statusOv: {}, vendorPolicy: "best", lineVendor: {} },
    catalog: [], kits: [], kitVersions: [], lineupVersions: [], changeLog: [], orders: [],
    terms: [{ id: "sp27", sales: { ece2031: 200 } }],
    inventory: { components: {}, packedKits: {} }, supplierQuotes: {}, alternatives: {},
  };
  const newerSnapshot = {
    ...baseSnapshot,
    orders: [{ id: "PO-remote", vendor: "Jameco", lines: [] }],
  };
  const runner = {
    withSuccessHandler(handler) { successHandler = handler; return this; },
    withFailureHandler(handler) { failureHandler = handler; return this; },
    apiRequest(request) {
      requests.push(request);
      queueMicrotask(() => {
        if (request.action === "bootstrap") {
          successHandler({ ok: true, data: {
            user: { uid: "firebase-1", email: "admin@example.com", role: "admin" },
            state: { version: 3, snapshot: baseSnapshot },
            access: { mode: "editor", canEdit: true, editor: { label: "Test browser" } },
          } });
        } else if (request.action === "saveSnapshot" && saveAttempts++ === 0) {
          successHandler({ ok: false, error: {
            code: "VERSION_CONFLICT",
            message: "newer data",
            details: { currentVersion: 4 },
          } });
        } else if (request.action === "syncSession") {
          successHandler({ ok: true, data: {
            access: { mode: "editor", canEdit: true, editor: { label: "Test browser" } },
            state: { version: 4, snapshot: newerSnapshot },
            version: 4,
          } });
        } else if (request.action === "saveSnapshot") {
          successHandler({ ok: true, data: {
            version: request.payload.expectedVersion + 1,
            duplicate: false,
          } });
        } else {
          failureHandler(new Error(`Unexpected action: ${request.action}`));
        }
      });
    },
  };
  const listeners = new Map();
  const browser = {
    __LABKIT_APPS_SCRIPT__: true,
    google: { script: { run: runner } },
    crypto: { randomUUID: () => "conflict-test-request" },
    location: { reload() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimeout() {},
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
  };
  class EventStub {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  }

  new Function("window", "CustomEvent", source)(browser, EventStub);
  await browser.LabKitDataSource.connect({
    uid: "firebase-1",
    getIdToken: async () => "firebase-token",
  });
  browser.LabKitDataSource.save({
    ...baseSnapshot,
    supplierReferenceDataVersion: "reference-v1",
    terms: [{ id: "sp27", sales: { ece2031: 236 } }],
  });

  await scheduled[1]();
  await new Promise((resolve) => setImmediate(resolve));
  await scheduled.at(-1)();
  await new Promise((resolve) => setImmediate(resolve));

  const saves = requests.filter((request) => request.action === "saveSnapshot");
  assert.equal(saves.length, 2);
  assert.equal(saves[0].payload.expectedVersion, 3);
  assert.equal(saves[1].payload.expectedVersion, 4);
  assert.equal(saves[1].payload.snapshot.terms[0].sales.ece2031, 236);
  assert.equal(saves[1].payload.snapshot.orders[0].id, "PO-remote");
  assert.equal(saves[1].payload.snapshot.supplierReferenceDataVersion, "reference-v1");
  assert.equal(browser.LabKitDataSource.version, 5);
  assert.equal(browser.LabKitDataSource.canEdit, true);
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, false);
  assert.equal(storage.has("labkit.unsaved-remote-draft"), false);

  browser.LabKitDataSource.save({
    ...browser.LabKitDataSource.load(),
    terms: [{ id: "sp27", sales: { ece2031: 240 } }],
  });
  await scheduled.at(-1)();
  await new Promise((resolve) => setImmediate(resolve));
  const savesAfterMerge = requests.filter((request) => request.action === "saveSnapshot");
  assert.equal(savesAfterMerge.length, 3);
  assert.equal(savesAfterMerge[2].payload.expectedVersion, 5);
  assert.equal(savesAfterMerge[2].payload.snapshot.terms[0].sales.ece2031, 240);
  assert.equal(browser.LabKitDataSource.version, 6);
  assert.equal(browser.LabKitDataSource.canEdit, true);
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, false);
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
  assert.match(auth, /LabKitDataSource\?\.takeOver/);
  assert.match(auth, /forcedSignOut/);
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
  assert.match(source, /BagInventory/);
  assert.match(source, /KitItemRequirements/);
  assert.match(source, /KitVersions/);
  assert.match(source, /KitLineupVersions/);
  assert.match(source, /SemesterKitVersions/);
  assert.match(source, /kit_offerings_json/);
  assert.match(source, /sale_prices_json/);
  assert.match(source, /"sale_price"/);
  assert.match(source, /"bag_type_id"/);
  assert.match(source, /assignedVersion\.salePrice/);
  assert.match(source, /ChangeHistory/);
  assert.match(source, /function suggestSemester_/);
  assert.match(source, /function refreshSupplierQuotes_/);
  assert.match(source, /function generateComponentDescription_/);
  assert.match(source, /function findReplacementComponents_/);
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
    `${source}\nreturn { touchEditorLease_, releaseEditorLease_, takeOverEditorLease_ };`,
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
  const takeover = leaseApi.takeOverEditorLease_(user, second);
  assert.equal(takeover.access.canEdit, true);
  const displaced = leaseApi.touchEditorLease_(user, first);
  assert.equal(displaced.canEdit, false);
  assert.equal(displaced.forcedSignOut, true);
  assert.equal(leaseApi.releaseEditorLease_(first).released, false);
  assert.equal(leaseApi.releaseEditorLease_(second).released, true);
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
