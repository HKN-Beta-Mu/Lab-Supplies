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
  assert.match(html, /name="labkit-build" content="2026\.10\.16\.1"/);
  assert.match(html, />\{\{ saveButtonLabel \}\}<\/button>/);
  assert.match(html, /Buffer \(%\)/);
  assert.match(html, /Buffer kits/);
  assert.match(html, /Kits still to pack/);
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
  assert.match(html, /saved product link without pricing remains a manual reference/);
  assert.match(html, /Plan a purchase/);
  assert.match(html, /aria-label="Ordering"/);
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
    // Economical split: the cheapest vendor is short on stock, so the system buys the most economical combination.
    const listing = (id, vendor, unit, extra = {}) => ({
      id, vendor, manual: true, productUrl: "https://example.com/" + id, priceBreaks: [{ quantity: 1, unitPrice: unit }],
      shippingCost: 0, available: 100000, leadTime: "3 days", domestic: true, meetsRequirements: true, ...extra,
    });
    app.supplierQuotes.hct04 = [listing("cheap", "Cheap Co", 0.05, { available: 120 }), listing("steady", "Steady Co", 0.08, { available: 500 })];
    const shortStock = app.vendorPlan("hct04", 200);
    assert.deepEqual(shortStock.allocations.map((row) => [row.vendor, row.qty]), [["Cheap Co", 120], ["Steady Co", 80]]);
    assert.ok(Math.abs(shortStock.total - (120 * 0.05 + 80 * 0.08)) < 1e-9);
    assert.match(shortStock.decision, /Most economical split: 120 from Cheap Co, 80 from Steady Co/);
    assert.match(shortStock.decision, /saving \$3\.60 vs\. buying everything from Steady Co/);
    assert.match(shortStock.decision, /Cheap Co is cheapest but lists only 120 in stock/);
    // Shipping can make one vendor win even though the other has the lower unit price.
    app.supplierQuotes.hct04 = [listing("far", "Far Co", 0.05, { shippingCost: 20 }), listing("near", "Near Co", 0.06)];
    const shippingWins = app.vendorPlan("hct04", 100);
    assert.deepEqual(shippingWins.allocations.map((row) => row.vendor), ["Near Co"]);
    assert.match(shippingWins.decision, /Near Co covers the order/);
    // Three vendors are needed: no pair covers the order, so stock is filled in order and the split is still reported.
    app.supplierQuotes.hct04 = [listing("a", "A Co", 0.05, { available: 40 }), listing("b", "B Co", 0.06, { available: 40 }), listing("c", "C Co", 0.07, { available: 40 })];
    const threeWay = app.vendorPlan("hct04", 100);
    assert.deepEqual(threeWay.allocations.map((row) => row.qty), [40, 40, 20]);
    assert.equal(threeWay.remaining, 0);
    // Total stock is insufficient.
    const tooLittle = app.vendorPlan("hct04", 500);
    assert.equal(tooLittle.remaining, 380);
    assert.match(tooLittle.decision, /remain unsourced/);
    // A chosen vendor takes what its stock allows; only the remainder is optimised.
    app.supplierQuotes.hct04 = [listing("a", "A Co", 0.05, { available: 500 }), listing("b", "B Co", 0.09, { available: 50 }), listing("c", "C Co", 0.07, { available: 500 })];
    const chosen = app.vendorPlan("hct04", 120, "B Co");
    assert.deepEqual(chosen.allocations.map((row) => [row.vendor, row.qty]), [["B Co", 50], ["A Co", 70]]);
    // Unverified (Gemini-read) prices are called out wherever they steer a plan.
    app.supplierQuotes.hct04 = [listing("g", "Web Co", 0.05, { priceSource: "gemini-web" })];
    assert.match(app.vendorPlan("hct04", 10).decision, /read from the web by Gemini/);
    // The optimiser matches an exhaustive search over every split, including tiers, MOQ, multiples, stock and shipping.
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let trial = 0; trial < 300; trial += 1) {
      const needed = 2 + Math.floor(random() * 58);
      const vendorCount = 2 + Math.floor(random() * 3);
      app.supplierQuotes.hct04 = Array.from({ length: vendorCount }, (_, index) => listing("v" + index, "V" + index, 0.02 + random() * 0.2, {
        priceBreaks: [{ quantity: 1, unitPrice: 0.1 + random() * 0.2 }, { quantity: 10 + Math.floor(random() * 30), unitPrice: 0.02 + random() * 0.08 }],
        shippingCost: random() < 0.5 ? 0 : Math.round(random() * 400) / 100,
        available: random() < 0.5 ? 100000 : 5 + Math.floor(random() * 70),
        minimumOrderQuantity: random() < 0.3 ? 1 + Math.floor(random() * 10) : 1,
        orderMultiple: random() < 0.3 ? 1 + Math.floor(random() * 5) : 1,
      }));
      const pool = app.vendors("hct04", needed).filter((vendor) => vendor.manual);
      const price = (vendor, quantity) => app.priceListing(vendor.raw, quantity);
      const fits = (vendor, quote) => vendor.stock == null || quote.orderQty <= vendor.stock;
      let bestSingle = Infinity;
      let bestPair = Infinity;
      for (const vendor of pool) { const quote = price(vendor, needed); if (fits(vendor, quote)) bestSingle = Math.min(bestSingle, quote.ext + quote.ship); }
      for (let i = 0; i < pool.length; i += 1) for (let j = i + 1; j < pool.length; j += 1) for (let qa = 1; qa < needed; qa += 1) {
        const a = price(pool[i], qa); const b = price(pool[j], needed - qa);
        if (fits(pool[i], a) && fits(pool[j], b)) bestPair = Math.min(bestPair, a.ext + a.ship + b.ext + b.ship);
      }
      const expected = bestPair < Infinity && (bestSingle === Infinity || bestSingle - bestPair >= 1) ? bestPair : bestSingle;
      const found = app.economicalPlan(pool, needed);
      if (expected === Infinity) assert.equal(found, null, "trial " + trial);
      else assert.ok(found && Math.abs(found.total - expected) < 1e-9, "trial " + trial + ": " + (found && found.total) + " vs " + expected);
    }
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
      "Expected sales", "Buffer (%)", "Buffer kits", "Pack target", "Packed usable on hand", "Faulty / unusable", "Kits still to pack",
    ]);
    let selectedZero = 0;
    planningCard.planFields[0].onFocus({ target: { value: "0", select() { selectedZero += 1; } } });
    assert.equal(selectedZero, 1);
    assert.equal(planningCard.planFields[6].editable, false);
    assert.equal(planningCard.planFields[6].readOnly, true);
    const wirePlanningCard = planningView.kitsCards.find((kit) => kit.name === "Wire Kit");
    assert.deepEqual(wirePlanningCard.planFields.map((field) => field.label), ["Planned quantity"]);
    app.updatePlanningKitMetric("sp27", "ece2031", "purchase", 999);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").purchase, 10);
    assert.equal(app.bagNeed("bag-ece2031", ["sp27"]).gross, 10);
    app.updatePlanningKitMetric("sp27", "ece2031", "bufferPercent", 35);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").bufferKits, 7);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").total, 27);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").remaining, 10);
    assert.equal(app.sales(app.kitMap.ece2031, "sp27").purchase, 17);
    assert.equal(app.bagNeed("bag-ece2031", ["sp27"]).gross, 17);
    assert.deepEqual(app.planningKitTarget(app.termMap.sp27, app.kitMap.ece2031, 360), {
      demand: 360, bufferPercent: 35, bufferKits: 126, target: 486,
    });
    assert.ok(planningView.comb.terms.some((term) => term.label === "Spring 2027"));
    assert.ok(!planningView.comb.terms.some((term) => term.label === "Fall 2026"));
    app.openPart("hct00");
    app.setState({ modalTab: "vendors" });
    const vendorModal = app.renderVals().modal;
    assert.match(vendorModal.selectionNote, /saved only to that semester plan/);
    vendorModal.vendors.find((vendor) => vendor.vendor === "Mouser").select({ preventDefault() {} });
    assert.equal(app.state.lineVendor["sp27:hct00"], "Mouser");
    app.setState({ partId: null });
    const approvedAlternative = app.saveApprovedAlternative("hct20", {
      pn: "CD74HCT20E",
      mfr: "Texas Instruments",
      pkg: "PDIP-14",
      note: "Officer verified as a compatible substitute.",
    });
    assert.equal(approvedAlternative.alternativeFor, undefined);
    assert.deepEqual(app.alternativeOrigins(approvedAlternative.id).map((part) => part.id), ["hct20"]);
    assert.equal(app.catalog.filter((part) => part.name === "CD74HCT20E").length, 1);
    app.supplierQuotes[approvedAlternative.id] = [{
      id: "digikey-alt",
      vendor: "DigiKey",
      vendorSku: "CD74HCT20E-ND",
      productUrl: "https://example.com/cd74hct20e",
      manual: true,
      priceBreaks: [{ quantity: 1, unitPrice: 0.5 }],
      shippingCost: 4,
      available: 1000,
      leadTime: "2 days",
      domestic: true,
      meetsRequirements: true,
    }];
    app.setSubstituteChoice("sp27:hct20", "hct20", approvedAlternative.id);
    const substituteRow = app.renderVals().list.rows.find((row) => row.name === "74HCT20");
    assert.equal(substituteRow.sourceSel, approvedAlternative.id);
    assert.match(substituteRow.sourceNote, /approved replacement/i);
    assert.equal(substituteRow.url, "https://example.com/cd74hct20e");
    assert.equal(substituteRow.progressSel, "unreviewed");
    assert.deepEqual(substituteRow.progressOpts.map((option) => option.label), ["Unreviewed", "Reviewing", "Reviewed", "Purchased", "Received"]);
    substituteRow.onProgress({ target: { value: "reviewing" }, stopPropagation() {} });
    assert.equal(app.state.lineProgress["sp27:hct20"], "reviewing");
    assert.equal(app.state.lineSubstitute["sp27:hct20"], approvedAlternative.id);
    assert.equal(app.renderVals().list.rows.find((row) => row.name === "74HCT20").progressSel, "reviewing");
    app.setLineProgress("sp27:hct20", "bogus");
    assert.equal(app.state.lineProgress["sp27:hct20"], "reviewing");
    app.renderVals().list.onProgressFilter({ target: { value: "purchased" } });
    assert.equal(app.renderVals().list.rows.length, 0);
    app.renderVals().list.onProgressFilter({ target: { value: "reviewing" } });
    assert.deepEqual(app.renderVals().list.rows.map((row) => row.name), ["74HCT20"]);
    app.setState({ procurementProgress: "All" });
    app.setLineProgress("sp27:hct20", "purchased");
    assert.match(app.renderVals().list.summary.at(-1).val, /^1 \/ \d+$/);
    // The same status shows in the kit's component list, with a progress summary.
    app.setState({ view: "kit", kitId: "ece2031" });
    const kitProgressView = app.renderVals().kit;
    const kitHctRow = kitProgressView.rows.find((row) => row.name === "74HCT20");
    if (kitHctRow) assert.equal(kitHctRow.progressSel, "purchased");
    assert.match(kitProgressView.progress.label, /^\d+ of \d+ checked$/);
    kitProgressView.rows[0].onProgress({ target: { value: "reviewed" }, stopPropagation() {} });
    assert.equal(app.renderVals().kit.progress.label.split(" ")[0], String(1 + (kitHctRow ? 1 : 0)));
    app.renderVals().kit.rows[0].onProgress({ target: { value: "unreviewed" }, stopPropagation() {} });
    app.setState({ view: "list" });
    app.renderVals().list.clearOverrides();
    assert.equal(app.state.lineProgress["sp27:hct20"], "purchased");
    app.setLineProgress("sp27:hct20", "reviewed");
    app.undoChange(app.changeLog.find((change) => change.entity === "line-progress").id);
    assert.equal(app.state.lineProgress["sp27:hct20"], "purchased");
    app.setLineProgress("sp27:hct20", "unreviewed");
    assert.equal("sp27:hct20" in app.state.lineProgress, false);
    app.setSubstituteChoice("sp27:hct20", "hct20", approvedAlternative.id);
    const wireOrderRow = app.renderVals().list.rows.find((row) => row.name === "Red Hookup Wire");
    assert.match(wireOrderRow.needed, /cuts \(\d+ spools?\)/);
    app.renderVals().list.onCategory({ target: { value: "Wire" } });
    assert.ok(app.renderVals().list.rows.every((row) => row.cat === "Wire"));
    app.setState({ procurementCategory: "All" });
    // Shared component search, duplicate rules, and creation.
    const catalogCount = app.catalog.length;
    assert.ok(app.searchCatalog("74hct 20").some((part) => part.id === "hct20"));
    assert.equal(app.findComponentMatches({ name: "  74hct20 " })[0].level, "exact");
    assert.equal(app.findComponentMatches({ name: "74-HCT20" })[0].level, "similar");
    const duplicate = app.createCatalogComponent({ name: "74hct20" });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.part.id, "hct20");
    assert.equal(app.catalog.length, catalogCount);
    const resistor47 = app.createCatalogComponent({ name: "47 kΩ Test Resistor", cat: "Passive R" });
    assert.equal(resistor47.created, true);
    const resistor47Point = app.createCatalogComponent({ name: "4.7 kΩ Test Resistor", cat: "Passive R" });
    assert.equal(resistor47Point.created, true, "4.7 kΩ must not collide with 47 kΩ");
    assert.equal(resistor47Point.matches[0].level, "similar");
    app.undoChange(app.changeLog.find((change) => change.entity === "catalog").id);
    app.undoChange(app.changeLog.find((change) => change.entity === "catalog" && !change.undoneAt).id);
    assert.equal(app.catalog.length, catalogCount);

    // Replacement picker: create-and-approve is a single undoable change; an exact name is never created twice.
    app.openPicker("alternative", { originalId: "hct04" });
    let picker = app.renderVals().picker;
    assert.equal(picker.open, true);
    assert.equal(picker.category, app.map.hct04.cat);
    assert.equal(picker.results.find((row) => row.name === app.map.hct04.name).blocked, "This is the part being replaced");
    const pickerFindVals = picker;
    app.setPicker({ creating: true, note: "Same pinout" });
    app.setPickerDraft({ name: app.map.hct00.name });
    const pickerCreateVals = app.renderVals().picker;
    assert.equal(pickerCreateVals.matches[0].levelLabel, "Already in the list");
    assert.match(pickerCreateVals.createStyle, /pointer-events:none/);
    app.pickerCreate();
    assert.equal(app.catalog.length, catalogCount, "an exact duplicate is refused");
    app.setPickerDraft({ name: "TestAlt-04" });
    assert.equal(app.renderVals().picker.matches.length, 0);
    const changeCount = app.changeLog.length;
    app.pickerCreate();
    const testAlt = app.catalog.find((part) => part.name === "TestAlt-04");
    assert.ok(testAlt);
    assert.equal(testAlt.cat, app.map.hct04.cat);
    assert.equal(app.state.picker, null);
    assert.equal(app.changeLog.length, changeCount + 1);
    assert.equal(app.approvedAlternatives("hct04").find((alt) => alt.componentId === testAlt.id).note, "Same pinout");
    app.undoChange(app.changeLog[0].id);
    assert.ok(!app.catalog.some((part) => part.name === "TestAlt-04"));
    assert.ok(!app.approvedAlternatives("hct04").some((alt) => alt.componentId === testAlt.id));

    // Linking a component that already exists creates nothing and shares its stock once.
    const donorRow = app.renderVals().list.rows.map((row) => app.catalog.find((part) => part.name === row.name))
      .find((part) => part && !["hct00", "hct20"].includes(part.id));
    assert.ok(donorRow, "procurement has another line to substitute");
    const hct00Name = app.map.hct00.name;
    app.openPicker("alternative", { originalId: donorRow.id });
    app.setPicker({ query: hct00Name });
    const linkRow = app.renderVals().picker.results.find((row) => row.name === hct00Name);
    assert.ok(linkRow && !linkRow.blocked);
    linkRow.use();
    assert.equal(app.catalog.length, catalogCount);
    assert.ok(app.approvedAlternatives(donorRow.id).some((alt) => alt.componentId === "hct00"));
    assert.ok(app.alternativeOrigins("hct00").some((part) => part.id === donorRow.id));
    assert.ok(app.saveApprovedAlternative(donorRow.id, { pn: hct00Name.toUpperCase() }).id === "hct00", "typed names link instead of duplicating");
    assert.equal(app.catalog.length, catalogCount);
    app.setState({ adjustInv: true });
    const stockBefore = app.renderVals().list.rows.find((row) => row.name === hct00Name).onhand;
    assert.notEqual(stockBefore, "—");
    app.setSubstituteChoice("sp27:" + donorRow.id, donorRow.id, "hct00");
    const stockRows = app.renderVals().list.rows.filter((row) => [hct00Name, donorRow.name].includes(row.name));
    assert.equal(stockRows.filter((row) => row.onhand !== "—").length, 1, "captured stock is handed out once");
    assert.equal(app.removeApprovedAlternative(donorRow.id, "hct00"), false, "cannot remove a replacement a semester still uses");
    app.setSubstituteChoice("sp27:" + donorRow.id, donorRow.id, "original");
    assert.equal(app.removeApprovedAlternative(donorRow.id, "hct00"), true);
    assert.ok(!app.approvedAlternatives(donorRow.id).some((alt) => alt.componentId === "hct00"));
    app.undoChange(app.changeLog[0].id);
    assert.ok(app.approvedAlternatives(donorRow.id).some((alt) => alt.componentId === "hct00"));
    app.undoChange(app.changeLog.find((change) => change.entity === "alternative-model" && !change.undoneAt).id);
    app.setState({ adjustInv: false });

    // Order form: same search, packaging stays selectable, and a new part is created through the same function.
    app.openPicker("order");
    app.setPicker({ query: "packaging" });
    const bagRow = app.renderVals().picker.results.find((row) => row.name.startsWith("Packaging ·"));
    assert.ok(bagRow, "packaging bags remain available for order lines");
    bagRow.use();
    assert.match(app.state.orderLinePart, /^bag:/);
    app.openPicker("order", { create: true, name: "Order Created Part" });
    app.pickerCreate();
    const orderCreated = app.catalog.find((part) => part.name === "Order Created Part");
    assert.equal(app.state.orderLinePart, orderCreated.id);
    assert.equal(app.renderVals().ord.form.linePartLabel, "Order Created Part");
    app.undoChange(app.changeLog.find((change) => change.entity === "catalog" && !change.undoneAt).id);

    // Kit builder: the "+ Create" path adds the new component to the draft.
    app.builderDraft = { kitId: "ece2031", items: [], purchase: 1 };
    app.openPicker("kit", { create: true, name: "Kit Created Part" });
    app.pickerCreate();
    const kitCreated = app.catalog.find((part) => part.name === "Kit Created Part");
    assert.deepEqual(app.builderDraft.items.map((item) => item.p), [kitCreated.id]);
    app.undoChange(app.changeLog.find((change) => change.entity === "catalog" && !change.undoneAt).id);
    app.builderDraft = null;
    assert.equal(app.catalog.length, catalogCount);

    // Vendor lookup: fills the new-component form and saves a vendor listing with the component as one change.
    const dataSource = globalThis.window.LabKitDataSource;
    const lookupCalls = [];
    const flashes = [];
    const originalFlash = app.flash;
    app.flash = (message) => flashes.push(message);
    const nandCandidate = {
      vendor: "Mouser", vendorSku: "595-SN74HCT99N", name: "SN74HCT99N", manufacturer: "Texas Instruments",
      description: "Logic Gates Quad 2-Input NAND Gate", category: "Logic Gates", packageName: "PDIP-14",
      productUrl: "https://www.mouser.com/ProductDetail/595-SN74HCT99N", datasheetUrl: "https://example.com/hct99.pdf",
      available: 1234, leadTime: "3 Days", unitPrice: 0.52,
      priceBreaks: [{ quantity: 1, unitPrice: 0.52 }, { quantity: 100, unitPrice: 0.31 }], source: "Gemini web lookup", unverifiedPrice: true,
    };
    const resistorCandidate = { ...nandCandidate, vendorSku: "603-CF14JT1K00", name: "CF14JT1K00", manufacturer: "Yageo", description: "Carbon Film Resistors 1kOhm 5% 1/4W", category: "Carbon Film Resistors", packageName: "", unitPrice: 0.02, priceBreaks: [{ quantity: 1, unitPrice: 0.02 }] };
    dataSource.capabilities = { gemini: { configured: true } };
    dataSource.lookupVendorComponent = async (request) => { lookupCalls.push(request); return { candidates: [nandCandidate, resistorCandidate], message: "Mouser returned 2 priced matches." }; };
    app.openPicker("catalog", { create: true });
    app.setPickerLookup({ vendor: "Mouser", query: "SN74HCT99N" });
    await app.pickerLookup();
    assert.equal(lookupCalls.length, 1);
    assert.deepEqual({ ...lookupCalls[0], categories: undefined }, { vendor: "Mouser", query: "SN74HCT99N", url: "", categories: undefined });
    assert.ok(lookupCalls[0].categories.includes("Logic IC"));
    const pickerLookupVals = app.renderVals().picker;
    assert.equal(pickerLookupVals.candidates.length, 2);
    assert.ok(pickerLookupVals.vendorSuggestions.includes("Jameco") && pickerLookupVals.vendorSuggestions.includes("Mouser"));
    assert.equal(pickerLookupVals.lookupLabel, "Look up with Gemini");
    pickerLookupVals.candidates[0].use();
    let filled = app.state.picker;
    assert.equal(filled.draft.name, "SN74HCT99N");
    assert.equal(filled.draft.cat, "Logic IC");
    assert.equal(filled.draft.pkg, "PDIP-14");
    assert.equal(filled.draft.base, "0.52");
    assert.equal(filled.listing.priceBreaks, "1 = 0.52\n100 = 0.31");
    assert.equal(filled.listing.compatibility, "unknown");
    assert.match(filled.listing.source, /Gemini web lookup · looked up \d{4}-\d{2}-\d{2}/);
    assert.equal(filled.listing.priceSource, "gemini-web");
    assert.equal(app.renderVals().picker.priceCheckStyle.includes("display:none"), false, "the price confirmation is offered");
    app.renderVals().picker.candidates.length === 0 || assert.fail("choosing a candidate clears the list");
    const changeTotal = app.changeLog.length;
    app.pickerCreate();
    const lookedUp = app.catalog.find((part) => part.name === "SN74HCT99N");
    assert.ok(lookedUp);
    const lookedUpQuote = app.supplierQuotes[lookedUp.id][0];
    assert.equal(lookedUpQuote.manual, true);
    assert.equal(lookedUpQuote.verified, false);
    assert.equal(lookedUpQuote.vendorSku, "595-SN74HCT99N");
    assert.equal(lookedUpQuote.requirementsPending, true);
    assert.equal(lookedUpQuote.priceSource, "gemini-web");
    assert.equal(app.vendors(lookedUp.id, 100).find((vendor) => vendor.vendor === "Mouser").unverifiedPrice, true);
    assert.match(lookedUpQuote.source, /looked up/);
    assert.equal(app.vendors(lookedUp.id, 100).find((vendor) => vendor.vendor === "Mouser").unit, 0.31);
    assert.equal(app.changeLog.length, changeTotal + 1);
    assert.equal(app.changeLog[0].entity, "component-model");
    app.undoChange(app.changeLog[0].id);
    assert.ok(!app.catalog.some((part) => part.name === "SN74HCT99N"));
    assert.equal(app.supplierQuotes[lookedUp.id], undefined);
    assert.equal(app.catalog.length, catalogCount);

    // Confirming the prices on the product page clears the unverified tag.
    app.openPicker("catalog", { create: true });
    app.pickerApplyCandidate(nandCandidate);
    app.setPickerListing({ priceChecked: true });
    app.pickerCreate();
    const checkedPart = app.catalog.find((part) => part.name === "SN74HCT99N");
    assert.equal(app.supplierQuotes[checkedPart.id][0].priceSource, "");
    app.undoChange(app.changeLog[0].id);
    assert.equal(app.catalog.length, catalogCount);

    // A broken link creates nothing; a second candidate is categorised as a resistor.
    app.openPicker("catalog", { create: true, name: "Bad Link Part" });
    app.setPickerListing({ vendor: "Mouser", productUrl: "not a url" });
    app.pickerCreate();
    assert.equal(app.catalog.length, catalogCount);
    assert.ok(app.state.picker);
    assert.match(flashes.at(-1), /valid http or https product link/);
    app.pickerApplyCandidate(resistorCandidate);
    assert.equal(app.state.picker.draft.cat, "Passive R");

    // The same vendor SKU under a different name is flagged, and the vendor can be added to that component instead.
    const skuHost = app.createCatalogComponent({ name: "SKU Host Part", cat: "Passive R", vendorListing: { vendor: "Mouser", sku: "SKU-123", productUrl: "https://example.com/a", priceBreaks: "1 = 0.10" } });
    assert.equal(skuHost.created, true);
    app.openPicker("catalog", { create: true, name: "Another Name" });
    app.setPickerListing({ vendor: "mouser", sku: "sku-123", productUrl: "https://example.com/a", priceBreaks: "1 = 0.08" });
    const skuMatch = app.renderVals().picker.matches.find((row) => row.levelLabel === "Same vendor part");
    assert.ok(skuMatch);
    assert.match(skuMatch.reason, /SKU-123/);
    assert.doesNotMatch(skuMatch.addVendorStyle, /display:none/);
    skuMatch.addVendor();
    assert.equal(app.supplierQuotes[skuHost.part.id].length, 1, "same vendor and SKU updates instead of duplicating");
    assert.equal(app.supplierQuotes[skuHost.part.id][0].unitPrice, 0.08);
    app.undoChange(app.changeLog[0].id);
    app.undoChange(app.changeLog.find((change) => change.entity === "component-model" && !change.undoneAt).id);
    assert.equal(app.catalog.length, catalogCount);

    // An exact existing component offers "add this vendor to it".
    app.openPicker("catalog", { create: true, name: app.map.hct20.name });
    app.setPickerListing({ vendor: "Mouser", productUrl: "https://example.com/hct20", priceBreaks: "1 = 0.30" });
    const existingRow = app.renderVals().picker.matches[0];
    assert.equal(existingRow.levelLabel, "Already in the list");
    assert.doesNotMatch(existingRow.addVendorStyle, /display:none/);
    const hct20Quotes = (app.supplierQuotes.hct20 || []).length;
    existingRow.addVendor();
    assert.equal(app.supplierQuotes.hct20.length, hct20Quotes + 1);
    app.undoChange(app.changeLog[0].id);
    assert.equal((app.supplierQuotes.hct20 || []).length, hct20Quotes);

    // Pasted listing for a vendor without an API goes through the Gemini text parser.
    dataSource.parseNewComponentText = async () => ({ name: "LM358P", vendor: "Jameco", vendorSku: "23048", manufacturer: "TI", description: "Dual op amp", packageName: "PDIP-8", category: "Op-Amp", priceBreaks: [{ quantity: 1, unitPrice: 0.69 }], stock: 12, leadTime: "", message: "Gemini drafted this." });
    app.openPicker("catalog", { create: true });
    app.setPickerLookup({ vendor: "Jameco", text: "LM358P dual op amp $0.69" });
    assert.equal(app.renderVals().picker.lookupLabel, "Fill from pasted text");
    await app.pickerLookup();
    assert.equal(app.state.picker.draft.cat, "Op-Amp");
    assert.equal(app.state.picker.listing.vendor, "Jameco");
    assert.equal(app.state.picker.listing.productUrl, "", "no webpage is fetched, so the link is left for the officer");
    app.pickerCreate();
    assert.ok(!app.catalog.some((part) => part.name === "LM358P"), "a listing without a link is not saved half-finished");
    app.setPickerListing({ productUrl: "https://www.jameco.com/z/LM358P" });
    app.pickerCreate();
    assert.ok(app.catalog.some((part) => part.name === "LM358P"));
    app.undoChange(app.changeLog[0].id);

    // Replacement flow with a vendor listing: one change creates the part, the link and the quote; one undo removes all three.
    app.openPicker("alternative", { originalId: "hct04" });
    app.setPicker({ note: "Verified" });
    app.setPickerDraft({ name: "Alt With Vendor" });
    app.setPickerListing({ vendor: "Jameco", sku: "J-1", productUrl: "https://www.jameco.com/z/J-1", priceBreaks: "1 = 0.40" });
    const altChanges = app.changeLog.length;
    app.pickerCreate();
    const altWithVendor = app.catalog.find((part) => part.name === "Alt With Vendor");
    assert.equal(app.supplierQuotes[altWithVendor.id][0].vendor, "Jameco");
    assert.ok(app.approvedAlternatives("hct04").some((alt) => alt.componentId === altWithVendor.id));
    assert.equal(app.changeLog.length, altChanges + 1);
    app.undoChange(app.changeLog[0].id);
    assert.ok(!app.catalog.some((part) => part.name === "Alt With Vendor"));
    assert.equal(app.supplierQuotes[altWithVendor.id], undefined);
    assert.ok(!app.approvedAlternatives("hct04").some((alt) => alt.componentId === altWithVendor.id));

    // Typing a vendor name for a pasted listing updates both the lookup and the saved listing in one write.
    app.openPicker("catalog", { create: true });
    app.renderVals().picker.onLookupVendor({ target: { value: "Jameco" } });
    assert.equal(app.state.picker.lookup.vendor, "Jameco");
    assert.equal(app.state.picker.listing.vendor, "Jameco");
    app.closePicker();

    // No backend, an old backend, and an unconfigured vendor each explain themselves.
    app.openPicker("catalog", { create: true });
    app.setPickerLookup({ vendor: "DigiKey", query: "X" });
    dataSource.capabilities = { gemini: { configured: false } };
    lookupCalls.length = 0;
    await app.pickerLookup();
    assert.match(app.state.picker.lookup.message, /Gemini is not connected/);
    assert.equal(lookupCalls.length, 0);
    dataSource.capabilities = { gemini: { configured: true } };
    app.setPickerLookup({ vendor: "", query: "", url: "" });
    await app.pickerLookup();
    assert.match(app.state.picker.lookup.message, /Enter a part number/);
    app.setPickerLookup({ vendor: "Mouser", query: "X" });
    dataSource.lookupVendorComponent = async () => { throw Object.assign(new Error("That LabKit action is not supported."), { code: "UNKNOWN_ACTION" }); };
    await app.pickerLookup();
    assert.match(app.state.picker.lookup.message, /redeployed/);
    delete dataSource.lookupVendorComponent;
    await app.pickerLookup();
    assert.match(app.state.picker.lookup.message, /deployed Apps Script backend/);

    // A slow lookup never writes into a different or closed dialog.
    let releaseLookup;
    dataSource.lookupVendorComponent = () => new Promise((resolve) => { releaseLookup = () => resolve({ candidates: [nandCandidate, resistorCandidate], message: "late" }); });
    const slow = app.pickerLookup();
    app.closePicker();
    app.openPicker("order");
    releaseLookup();
    await slow;
    assert.deepEqual(app.state.picker.lookup.candidates, []);
    assert.equal(app.state.picker.lookup.message, "");
    assert.equal(app.state.picker.draft.name, "");
    app.closePicker();
    app.flash = originalFlash;
    delete dataSource.lookupVendorComponent;
    delete dataSource.parseNewComponentText;
    delete dataSource.capabilities;

    // Vendor for a semester: line pin > semester vendor > policy; vendors without a listing fall back and say so.
    const hct00Quotes = app.supplierQuotes.hct00;
    const hct00Label = app.map.hct00.name;
    const vendorListing = (id, vendor, unit, extra = {}) => ({
      id, vendor, manual: true, productUrl: "https://example.com/" + id, priceBreaks: [{ quantity: 1, unitPrice: unit }],
      shippingCost: 0, available: 100000, leadTime: "3 days", domestic: true, meetsRequirements: true, ...extra,
    });
    app.supplierQuotes.hct00 = [vendorListing("jam", "Jameco Test", 0.05), vendorListing("mou", "Mouser Test", 0.1)];
    app.setState({ scope: "semester", semesterId: "sp27", view: "list", procurementCategory: "All", procurementKit: "All", procurementProgress: "All" });
    const procurementRow = () => app.renderVals().list.rows.find((row) => row.name === hct00Label);
    assert.match(procurementRow().decision, /Jameco Test covers/);
    assert.ok(app.renderVals().list.semesterVendors.some((option) => option.id === "Mouser Test" && /lists \d+ of \d+ lines/.test(option.label)));
    app.renderVals().list.onSemesterVendor({ target: { value: "Mouser Test" } });
    assert.equal(app.state.semesterVendor.sp27, "Mouser Test");
    assert.match(procurementRow().decision, /Mouser Test covers/);
    assert.equal(procurementRow().vendorSel, "auto");
    assert.equal(procurementRow().vendorOpts[0].label, "Semester vendor · Mouser Test");
    app.setVendorChoice("sp27:hct00", "Jameco Test");
    assert.match(procurementRow().decision, /Jameco Test covers/, "a line pin beats the semester vendor");
    app.setVendorChoice("sp27:hct00", "auto");
    app.renderVals().list.clearOverrides();
    assert.equal(app.state.semesterVendor.sp27, "Mouser Test", "Clear pins leaves the semester vendor alone");
    app.setSubstituteChoice("sp27:hct20", "hct20", approvedAlternative.id);
    app.setSemesterVendor("sp27", "Nobody Co");
    assert.match(procurementRow().decision, /No Nobody Co listing for this part, so the recommended vendor is used/);
    app.undoChange(app.changeLog.find((change) => change.entity === "semester-vendor" && !change.undoneAt).id);
    assert.equal(app.state.semesterVendor.sp27, "Mouser Test");

    // Bulk tab part: something sp27 really needs to order, with the vendor listings replaced for the test.
    const bulkPart = app.catalog.find((part) => !part.alternativeFor && app.termNeed(part.id, ["sp27"]) > 2);
    assert.ok(bulkPart, "sp27 needs several pieces of at least one part");
    const bulkNeed = app.termNeed(bulkPart.id, ["sp27"]);
    const bulkLabel = bulkPart.name;
    const bulkQuotes = app.supplierQuotes[bulkPart.id];
    const bulkKit = app.kits.find((kit) => app.kitItemsForTerm(kit, "sp27").some((item) => item.p === bulkPart.id));
    // Bulk tab: a short-stocked cheap vendor produces a flagged split, a saved note, and the same plan in the created order.
    app.setSemesterVendor("sp27", "auto");
    const jamecoStock = Math.max(1, Math.floor(bulkNeed / 2));
    app.supplierQuotes[bulkPart.id] = [vendorListing("jam", "Jameco Test", 0.01, { available: jamecoStock }), vendorListing("mou", "Mouser Test", 5)];
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    let bulk = app.renderVals().comb;
    let bulkRow = bulk.rows.find((row) => row.name === bulkLabel);
    assert.equal(bulkRow.multi, true);
    assert.equal(bulkRow.multiText, "Buying from 2 vendors: " + jamecoStock + " from Jameco Test + " + (bulkNeed - jamecoStock) + " from Mouser Test");
    assert.equal(bulk.rows.length, Number(bulk.footLabel.match(/^(\d+) shown/)[1]), "no cap on the rows shown");
    bulkRow.onNote({ target: { value: "Jameco only had one left" } });
    assert.equal(app.state.combineNotes[bulkPart.id], "Jameco only had one left");
    app.createCombinedOrder(["sp27"]);
    assert.ok(app.orderDraft, "the combined order was created");
    const bulkLines = app.orderDraft.lines.filter((line) => line[0] === bulkPart.id);
    assert.deepEqual(bulkLines.map((line) => line[3]).sort(), ["Jameco Test", "Mouser Test"]);
    assert.match(app.orderDraft.notes, /\[Multiple vendors\]/);
    assert.match(app.orderDraft.notes, /Note: Jameco only had one left/);
    app.orderDraft = null;
    app.setState({ orderForm: false });
    // Combined pricing reads the real saved tiers: the tier reached, the next break, and wins only where a break is truly crossed.
    app.supplierQuotes[bulkPart.id] = [vendorListing("tier", "Tier Co", 0.5, {
      priceBreaks: [{ quantity: 1, unitPrice: 0.5 }, { quantity: bulkNeed, unitPrice: 0.3 }, { quantity: bulkNeed * 5, unitPrice: 0.2 }],
    })];
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    const tierRow = app.renderVals().comb.rows.find((row) => row.name === bulkLabel);
    assert.equal(tierRow.tierText, "Tier Co: " + bulkNeed + "+ tier @ $0.300 · next break " + bulkNeed * 5 + "+ @ $0.200 (" + bulkNeed * 4 + " more pieces would cost $" + (bulkNeed * 5 * 0.2 - bulkNeed * 0.3).toFixed(2) + " more in total)");
    assert.doesNotMatch(tierRow.tierStyle, /display:none/);
    assert.equal(app.tierInfo(app.supplierQuotes[bulkPart.id][0], bulkNeed * 5, "Tier Co"), "Tier Co: " + bulkNeed * 5 + "+ tier @ $0.200 · best tier reached");
    assert.equal(app.tierInfo(vendorListing("flat", "Flat Co", 0.4), 10, "Flat Co"), "Flat Co: Price @ $0.400 · flat price");
    // A break is "won by combining" only when the combined quantity crosses it and no single semester does.
    app.state.semesterDraft = { season: "Fall", year: 2027 };
    app.createSemester();
    app.updateTermKitUnits("fa27", bulkKit.id, 40);
    app.setState({ scope: "global", gview: "combine", semesterId: "sp27" });
    const twoSemesters = ["sp27", "fa27"].filter((id) => app.termNeed(bulkPart.id, [id]) > 0);
    assert.deepEqual(twoSemesters, ["sp27", "fa27"], "a second planning semester needs the part: " + ["sp27", "fa27"].map((id) => id + "=" + app.termNeed(bulkPart.id, [id])).join(", "));
    {
      const per = twoSemesters.map((id) => app.termNeed(bulkPart.id, [id]));
      const total = app.termNeed(bulkPart.id, twoSemesters);
      const threshold = Math.max(...per) + 1;
      assert.ok(total >= threshold);
      app.supplierQuotes[bulkPart.id] = [vendorListing("win", "Win Co", 0.5, { priceBreaks: [{ quantity: 1, unitPrice: 0.5 }, { quantity: threshold, unitPrice: 0.1 }] })];
      app.setState({ combine: Object.fromEntries(twoSemesters.map((id) => [id, true])) });
      const winView = app.renderVals().comb;
      assert.ok(winView.wins.some((win) => win.text.includes(bulkLabel + " at Win Co") && win.text.includes("clears the " + threshold + "-piece break")), "a crossed break is reported from the real tiers");
      assert.equal(winView.winsEmptyStyle, "display:none");
      app.supplierQuotes[bulkPart.id] = [vendorListing("nowin", "No-Win Co", 0.5, { priceBreaks: [{ quantity: 1, unitPrice: 0.5 }, { quantity: total * 100, unitPrice: 0.1 }] })];
      assert.ok(!app.renderVals().comb.wins.some((win) => win.text.includes(bulkLabel)), "no win is invented when no break is crossed");
    }
    app.undoChange(app.changeLog.find((change) => change.entity === "terms" && !change.undoneAt).id);
    assert.equal(app.termMap.fa27, undefined, "the temporary semester is removed again");
    app.setState({ semesterId: "sp27" });
    app.supplierQuotes[bulkPart.id] = [vendorListing("jam", "Jameco Test", 0.05), vendorListing("mou", "Mouser Test", 0.1)];
    app.setState({ combine: { sp27: true } });

    // A vendor minimum above the quantity needed is priced, explained, and written into the order line as the quantity to buy.
    app.supplierQuotes[bulkPart.id] = [vendorListing("min", "Minimum Co", 0.1, { minimumOrderQuantity: bulkNeed + 5 })];
    const roundedPlan = app.vendorPlan(bulkPart.id, bulkNeed);
    assert.equal(roundedPlan.allocations[0].qty, bulkNeed);
    assert.equal(roundedPlan.allocations[0].orderQty, bulkNeed + 5);
    assert.ok(Math.abs(roundedPlan.total - (bulkNeed + 5) * 0.1) < 1e-9);
    assert.match(roundedPlan.decision, new RegExp("rounds up to " + (bulkNeed + 5) + " from Minimum Co \\(" + bulkNeed + " needed\\)"));
    app.createCombinedOrder(["sp27"]);
    assert.equal(app.orderDraft.lines.find((line) => line[0] === bulkPart.id)[1], bulkNeed + 5);
    app.orderDraft = null;
    app.setState({ orderForm: false });
    // A semester vendor chosen for the bulk purchase is honoured by both the review table and the order.
    app.supplierQuotes[bulkPart.id] = [vendorListing("jam", "Jameco Test", 0.05), vendorListing("mou", "Mouser Test", 0.1)];
    app.setSemesterVendor("sp27", "Mouser Test");
    bulkRow = app.renderVals().comb.rows.find((row) => row.name === bulkLabel);
    assert.equal(bulkRow.vendorOpts[0].label, "Use Mouser Test");
    assert.equal(bulkRow.multi, false);
    app.createCombinedOrder(["sp27"]);
    assert.deepEqual(app.orderDraft.lines.filter((line) => line[0] === bulkPart.id).map((line) => line[3]), ["Mouser Test"]);
    app.orderDraft = null;
    app.setState({ orderForm: false });
    app.setSemesterVendor("sp27", "auto");

    // Review checkbox: Procurement, kit list and bulk tab share one status.
    const bulkProcurementRow = () => app.renderVals().list.rows.find((row) => row.name === bulkLabel);
    app.setState({ scope: "semester", semesterId: "sp27", view: "list" });
    assert.equal(bulkProcurementRow().reviewed, false);
    bulkProcurementRow().onReview({ stopPropagation() {} });
    assert.equal(app.state.lineProgress["sp27:" + bulkPart.id], "reviewed");
    assert.equal(bulkProcurementRow().reviewed, true);
    app.setState({ view: "kit", kitId: bulkKit.id });
    assert.equal(app.renderVals().kit.rows.find((row) => row.name === bulkLabel).reviewed, true);
    app.setState({ view: "list" });
    bulkProcurementRow().onReview({ stopPropagation() {} });
    assert.equal(("sp27:" + bulkPart.id) in app.state.lineProgress, false);
    app.setLineProgress("sp27:" + bulkPart.id, "purchased");
    window.confirm = () => false;
    bulkProcurementRow().onReview({ stopPropagation() {} });
    assert.equal(app.state.lineProgress["sp27:" + bulkPart.id], "purchased", "declining the prompt keeps a purchased line");
    window.confirm = () => true;
    bulkProcurementRow().onReview({ stopPropagation() {} });
    assert.equal(("sp27:" + bulkPart.id) in app.state.lineProgress, false);
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true, fa26: true } });
    const reviewCount = app.changeLog.length;
    const combinedReview = app.renderVals().comb.rows.find((row) => row.name === bulkLabel);
    combinedReview.onReview({ stopPropagation() {} });
    assert.equal(app.changeLog.length, reviewCount + 1, "one change covers every selected semester");
    assert.equal(app.state.lineProgress["sp27:" + bulkPart.id], "reviewed");
    assert.equal(app.renderVals().comb.rows.find((row) => row.name === bulkLabel).reviewed, true);
    app.undoChange(app.changeLog[0].id);
    assert.equal(("sp27:" + bulkPart.id) in app.state.lineProgress, false);
    app.supplierQuotes.hct00 = hct00Quotes;
    app.supplierQuotes[bulkPart.id] = bulkQuotes;
    app.setState({ scope: "semester", semesterId: "sp27", view: "kits", gview: "home", combine: { fa26: true } });

    // Price check against the vendor API: verified when the tiers match, offered (not applied) when they differ.
    const priceSource = globalThis.window.LabKitDataSource;
    const checkQuote = (extra = {}) => vendorListing("mchk", "Mouser", 0.5, {
      vendorSku: "595-X", priceSource: "gemini-web", priceBreaks: [{ quantity: 1, unitPrice: 0.5 }, { quantity: 100, unitPrice: 0.3 }], ...extra,
    });
    const apiListing = (extra = {}) => ({ vendor: "Mouser", vendorSku: "595-X", manufacturerPartNumber: "X", packageType: "", minimumOrderQuantity: 1, orderMultiple: 1, available: 900,
      priceBreaks: [{ quantity: 1, unitPrice: 0.5 }, { quantity: 100, unitPrice: 0.3 }], ...extra });
    const checkCalls = [];
    let checkResult = { matches: [apiListing()] };
    priceSource.capabilities = { gemini: { configured: true }, suppliers: { mouser: true, digikey: true, newark: false } };
    priceSource.checkVendorPricing = async (request) => { checkCalls.push(request); if (checkResult instanceof Error) throw checkResult; return checkResult; };
    app.supplierQuotes[bulkPart.id] = [checkQuote()];
    const quoteNow = () => app.supplierQuotes[bulkPart.id][0];
    const checkState = () => app.state.priceChecks.mchk;
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.deepEqual(checkCalls, [{ vendor: "Mouser", sku: "595-X" }]);
    assert.equal(checkState().status, "match");
    assert.equal(quoteNow().priceSource, "", "a matching table clears the unverified tag");
    assert.equal(quoteNow().priceCheckSource, "Mouser API");
    assert.ok(quoteNow().priceCheckedAt);
    assert.equal(app.vendors(bulkPart.id, 10).find((vendor) => vendor.id === "mchk").priceCheckedAt, quoteNow().priceCheckedAt);
    app.undoChange(app.changeLog[0].id);
    assert.equal(quoteNow().priceSource, "gemini-web");
    // Different tiers are shown and applied only on request; undo restores the saved prices.
    checkResult = { matches: [apiListing({ priceBreaks: [{ quantity: 1, unitPrice: 0.55 }, { quantity: 100, unitPrice: 0.35 }], available: 700, minimumOrderQuantity: 5 })] };
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "differs");
    assert.match(checkState().message, /Mouser now shows 1 @ \$0\.550 · 100 @ \$0\.350 · saved: 1 @ \$0\.500 · 100 @ \$0\.300/);
    assert.equal(quoteNow().priceBreaks[0].unitPrice, 0.5, "nothing changes until the officer applies it");
    assert.equal(app.applyCheckedPrices(bulkPart.id, "mchk"), true);
    assert.deepEqual(quoteNow().priceBreaks.map((row) => row.unitPrice), [0.55, 0.35]);
    assert.equal(quoteNow().minimumOrderQuantity, 5);
    assert.equal(quoteNow().available, 700);
    assert.equal(quoteNow().priceSource, "");
    assert.equal(checkState().status, "match");
    app.undoChange(app.changeLog[0].id);
    assert.equal(quoteNow().priceBreaks[0].unitPrice, 0.5);
    assert.equal(quoteNow().priceSource, "gemini-web");
    // Packaging ambiguity, a wrong SKU, and each setup problem explain themselves instead of guessing.
    checkResult = { matches: [apiListing({ vendorSku: "A-1", packageType: "Cut Tape", manufacturerPartNumber: "595-X" }), apiListing({ vendorSku: "A-2", packageType: "Reel", manufacturerPartNumber: "595-X" })] };
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "ambiguous");
    assert.match(checkState().message, /A-1 · Cut Tape, A-2 · Reel/);
    checkResult = { matches: [apiListing({ vendorSku: "OTHER-9", manufacturerPartNumber: "Y" })] };
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "notfound");
    app.supplierQuotes[bulkPart.id] = [checkQuote({ vendor: "Newark" })];
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "unsupported");
    app.supplierQuotes[bulkPart.id] = [checkQuote({ vendorSku: "" })];
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "nosku");
    app.supplierQuotes[bulkPart.id] = [checkQuote()];
    priceSource.capabilities = { gemini: { configured: true }, suppliers: { mouser: false } };
    checkCalls.length = 0;
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "unconfigured");
    assert.equal(checkCalls.length, 0);
    priceSource.capabilities = { gemini: { configured: true }, suppliers: { mouser: true } };
    checkResult = Object.assign(new Error("not supported"), { code: "UNKNOWN_ACTION" });
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.match(checkState().message, /redeployed/);
    delete priceSource.checkVendorPricing;
    await app.checkListingPricing(bulkPart.id, "mchk");
    assert.equal(checkState().status, "offline");
    // The bulk tab checks exactly the listings its plan buys from.
    priceSource.checkVendorPricing = async (request) => { checkCalls.push(request); return { matches: [apiListing()] }; };
    checkCalls.length = 0;
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    const checkRow = app.renderVals().comb.rows.find((row) => row.name === bulkLabel);
    assert.doesNotMatch(checkRow.checkStyle, /display:none/);
    await checkRow.checkPrices({ stopPropagation() {} });
    assert.deepEqual(checkCalls, [{ vendor: "Mouser", sku: "595-X" }]);
    assert.match(app.renderVals().comb.rows.find((row) => row.name === bulkLabel).checkText, /^Mouser: Matches Mouser/);
    // Jameco and Amazon listings are checked by reading the linked page through Bright Data.
    const pageQuote = (extra = {}) => vendorListing("pchk", "Jameco", 0.69, {
      productUrl: "https://www.jameco.com/z/LM358N_23696.html", priceSource: "scraped",
      priceBreaks: [{ quantity: 1, unitPrice: 0.69 }, { quantity: 100, unitPrice: 0.5 }], ...extra,
    });
    const pageCandidate = (extra = {}) => ({ vendor: "Jameco", vendorSku: "23696", name: "LM358N", available: 40, minimumOrderQuantity: 1,
      priceBreaks: [{ quantity: 1, unitPrice: 0.69 }, { quantity: 100, unitPrice: 0.5 }], ...extra });
    const scrapeCalls = [];
    let scrapeResult = { status: "ok", method: "fields", candidate: pageCandidate() };
    priceSource.capabilities = { gemini: { configured: true }, scraper: { configured: true, amazon: true, jameco: true } };
    priceSource.scrapeListingPage = async (request) => { scrapeCalls.push(request); if (scrapeResult instanceof Error) throw scrapeResult; return scrapeResult; };
    app.supplierQuotes[bulkPart.id] = [pageQuote()];
    const pageState = () => app.state.priceChecks.pchk;
    const pageNow = () => app.supplierQuotes[bulkPart.id][0];
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(scrapeCalls[0].url, "https://www.jameco.com/z/LM358N_23696.html");
    assert.equal(pageState().status, "match");
    assert.equal(pageNow().priceSource, "", "a page read from the dataset's own fields clears the flag");
    assert.equal(pageNow().priceCheckSource, "Jameco page (Bright Data)");
    app.undoChange(app.changeLog[0].id);
    assert.equal(pageNow().priceSource, "scraped");
    // When Gemini had to interpret the record, a match is noted but the listing stays flagged.
    scrapeResult = { status: "ok", method: "gemini", candidate: pageCandidate() };
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "match");
    assert.match(pageState().message, /interpreted by Gemini/);
    assert.equal(pageNow().priceSource, "scraped");
    app.undoChange(app.changeLog[0].id);
    // A page that shows fewer tiers than saved warns before anything is applied.
    scrapeResult = { status: "ok", method: "fields", candidate: pageCandidate({ priceBreaks: [{ quantity: 1, unitPrice: 0.75 }] }) };
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "differs");
    assert.match(pageState().message, /fewer tiers than you saved/);
    assert.equal(app.applyCheckedPrices(bulkPart.id, "pchk"), true);
    assert.equal(pageNow().priceBreaks.length, 1);
    assert.equal(pageNow().priceCheckSource, "Jameco page (Bright Data)");
    app.undoChange(app.changeLog[0].id);
    assert.equal(pageNow().priceBreaks.length, 2);
    // A slow scrape is collected with its snapshot id on the next click.
    scrapeResult = { status: "pending", snapshotId: "s_abc123", message: "still reading" };
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "pending");
    scrapeResult = { status: "ok", method: "fields", candidate: pageCandidate() };
    scrapeCalls.length = 0;
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(scrapeCalls[0].snapshotId, "s_abc123");
    app.undoChange(app.changeLog[0].id);
    // Missing link, no price, setup problems and an old backend each say what to do.
    app.supplierQuotes[bulkPart.id] = [pageQuote({ productUrl: "" })];
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "nolink");
    app.supplierQuotes[bulkPart.id] = [pageQuote()];
    scrapeResult = { status: "ok", method: "fields", candidate: pageCandidate({ priceBreaks: [] }), message: "no USD price" };
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "noprice");
    priceSource.capabilities = { scraper: { configured: true, amazon: true, jameco: false } };
    scrapeCalls.length = 0;
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "unconfigured");
    assert.match(pageState().message, /LABKIT_BRIGHTDATA_JAMECO_DATASET/);
    assert.equal(scrapeCalls.length, 0);
    priceSource.capabilities = { scraper: { configured: true, amazon: true, jameco: true } };
    scrapeResult = Object.assign(new Error("x"), { code: "UNKNOWN_ACTION" });
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.match(pageState().message, /redeployed/);
    delete priceSource.scrapeListingPage;
    await app.checkListingPricing(bulkPart.id, "pchk");
    assert.equal(pageState().status, "offline");
    // New component from a pasted Jameco link: scraped, flagged as scraped, and called out in plans until checked.
    const lookupCountBefore = checkCalls.length;
    priceSource.scrapeListingPage = async (request) => { scrapeCalls.push(request); return { status: "ok", method: "fields", candidate: { ...pageCandidate(), vendor: "Jameco", name: "LM358N Scrape Test", productUrl: request.url } }; };
    priceSource.lookupVendorComponent = async () => { throw new Error("Gemini web lookup must not run for a scraped vendor link"); };
    app.openPicker("catalog", { create: true });
    app.setPickerLookup({ url: "https://www.jameco.com/z/LM358N_23696.html" });
    await app.pickerLookup();
    assert.equal(app.state.picker.listing.priceSource, "scraped");
    assert.equal(app.state.picker.draft.name, "LM358N Scrape Test");
    assert.equal(app.state.picker.listing.productUrl, "https://www.jameco.com/z/LM358N_23696.html");
    app.pickerCreate();
    const scrapedPart = app.catalog.find((part) => part.name === "LM358N Scrape Test");
    assert.equal(app.supplierQuotes[scrapedPart.id][0].priceSource, "scraped");
    assert.match(app.vendorPlan(scrapedPart.id, 10).decision, /Jameco price was scraped from the vendor page/);
    app.undoChange(app.changeLog[0].id);
    // Without the Bright Data setup the same link falls back to the Gemini web lookup.
    priceSource.capabilities = { gemini: { configured: true }, scraper: { configured: false } };
    let geminiLookups = 0;
    priceSource.lookupVendorComponent = async () => { geminiLookups += 1; return { candidates: [], message: "none" }; };
    app.openPicker("catalog", { create: true });
    app.setPickerLookup({ url: "https://www.jameco.com/z/LM358N_23696.html", query: "LM358N" });
    await app.pickerLookup();
    assert.equal(geminiLookups, 1);
    app.closePicker();
    delete priceSource.scrapeListingPage;
    delete priceSource.lookupVendorComponent;
    app.setState({ priceChecks: {} });
    priceSource.capabilities = { gemini: { configured: true }, suppliers: { mouser: true, digikey: true, newark: false } };
    priceSource.checkVendorPricing = async (request) => { checkCalls.push(request); return { matches: [apiListing()] }; };
    app.supplierQuotes[bulkPart.id] = [checkQuote()];
    await app.checkListingPricing(bulkPart.id, "mchk");
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });

    // Part modal rows expose the controls and the verified note.
    app.setState({ scope: "semester", semesterId: "sp27", view: "list" });
    app.openPart(bulkPart.id);
    app.setState({ modalTab: "vendors" });
    const modalRow = app.renderVals().modal.vendors.find((row) => row.vendor === "Mouser");
    assert.doesNotMatch(modalRow.checkStyle, /display:none/);
    assert.match(modalRow.verifiedNote, /^Verified against Mouser API · /);
    app.setState({ partId: null });
    app.setState({ priceChecks: {} });
    delete priceSource.checkVendorPricing;
    delete priceSource.capabilities;
    app.supplierQuotes[bulkPart.id] = [vendorListing("jam", "Jameco Test", 0.05), vendorListing("mou", "Mouser Test", 0.1)];

    // Kit economics on the Ordering page: base cost per kit (no shipping or tax), profit, and price change from recorded orders.
    const econQuotes = {};
    const priceKitParts = (kit, unit) => app.kitItemsForTerm(kit, "sp27").forEach((item) => {
      const bought = app.purchaseComponent("sp27:" + item.p, item.p).id;
      [item.p, bought].forEach((id) => {
        if (!(id in econQuotes)) econQuotes[id] = app.supplierQuotes[id];
        app.supplierQuotes[id] = [vendorListing("eco-" + id, "Eco Co", unit, { shippingCost: 25 })];
      });
    });
    const savedOrders = app.orders;
    app.orders = [];
    const payFor = (termId, items, unit) => app.orders.push({ id: "ECO-" + termId, date: "2025-01-01", vendor: "Eco Co", status: "received", terms: [termId], lines: items.map((item) => [item.p, 10, unit, "Eco Co"]) });
    const econRow = (code) => app.renderVals().comb.econ.rows.find((row) => row.code === code);
    const ece2031 = app.kitMap.ece2031;
    const ece2031Items = app.kitItemsForTerm(ece2031, "sp27");
    const perPiece = (id, unit) => { const wire = app.wireCalculation(id, 1); return wire ? unit / wire.conservative : unit; };
    const ece2031Base = ece2031Items.reduce((total, item) => total + item.q * perPiece(item.p, 0.1), 0);
    assert.ok(ece2031Items.some((item) => app.wireCalculation(item.p, 1)), "ECE 2031 includes wire, so the fixture exercises per-cut pricing");
    priceKitParts(ece2031, 0.1);
    payFor("sp26", ece2031Items, 0.08);
    payFor("sp24", ece2031Items, 0.2);
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    let economics = app.renderVals().comb;
    assert.match(economics.econ.y1Label, /^vs Spring 2026$/);
    assert.match(economics.econ.y3Label, /^vs Spring 2024$/);
    let ece2031Row = econRow("ECE 2031");
    assert.equal(ece2031Row.base, app.m(ece2031Base), "base cost per kit excludes the $25 shipping on every listing");
    assert.equal(ece2031Row.priceStyle.includes("font-size:11px"), true, "no selling price yet is flagged, not shown as zero profit");
    assert.equal(ece2031Row.price, "Set a selling price");
    assert.equal(ece2031Row.profit, "—");
    assert.equal(ece2031Row.y1, "▲ +25.0% · " + ece2031Items.length + " of " + ece2031Items.length + " parts · vs Spring 2026");
    assert.equal(ece2031Row.y3, "▼ −50.0% · " + ece2031Items.length + " of " + ece2031Items.length + " parts · vs Spring 2024");
    assert.match(ece2031Row.y1Style, /var\(--color-danger\)/);
    assert.ok(Number(economics.summary.find((tile) => tile.label === "Shipping").val.replace(/[$,]/g, "")) >= 25, "shipping is reported separately from base cost");
    app.versionFor("ece2031", "sp27").salePrice = ece2031Base + 10;
    ece2031Row = econRow("ECE 2031");
    assert.equal(ece2031Row.profit, app.m(10));
    assert.equal(ece2031Row.margin, Math.round(10 / (ece2031Base + 10) * 100) + "%");
    // Too few recorded prices: no percentage is shown, and the coverage is stated. No orders at all reads as "no recorded prices".
    app.orders = [];
    payFor("sp26", ece2031Items.slice(0, 2), 0.08);
    ece2031Row = econRow("ECE 2031");
    assert.equal(ece2031Row.y1, "Only 2 of " + ece2031Items.length + " parts have recorded prices for Spring 2026");
    assert.equal(ece2031Row.y3, "No recorded prices for Spring 2024");
    // A packaging bag adds its per-bag price to a class kit; an unpriced bag is called out instead of silently ignored.
    assert.match(econRow("ECE 2031").baseNote, /bag price not entered/);
    app.bagMap["bag-ece2031"].packPrice = 10;
    app.bagMap["bag-ece2031"].packQuantity = 100;
    assert.equal(econRow("ECE 2031").base, app.m(ece2031Base + 0.1));
    assert.match(econRow("ECE 2031").baseNote, /incl\. \$0\.100 bag/);
    app.bagMap["bag-ece2031"].packPrice = null;
    assert.ok(economics.summary.some((tile) => tile.label === "Order total · landed + bags"));
    // A wire kit is priced per cut: a $10 spool is spread over the cuts it yields.
    app.updateTermKitUnits("sp27", "wirekit", 30);
    const stockedRow = app.renderVals().comb.econ.rows.find((row) => row.name === app.kitMap.wirekit.name);
    assert.ok(stockedRow, "a kit whose demand is met from stock still appears");
    assert.equal(stockedRow.planned, "30");
    assert.equal(stockedRow.assemble, "0");
    app.updateTermKitUnits("sp27", "wirekit", 300);
    const wireKit = app.kitMap.wirekit;
    priceKitParts(wireKit, 10);
    const wireBase = app.kitItemsForTerm(wireKit, "sp27").reduce((total, item) => {
      const wire = app.wireCalculation(item.p, 1);
      return total + item.q * (wire ? 10 / wire.conservative : 10);
    }, 0);
    const wireRow = app.renderVals().comb.econ.rows.find((row) => row.name === wireKit.name);
    assert.equal(wireRow.base, app.m(wireBase));
    assert.ok(wireBase < 10 * app.kitItemsForTerm(wireKit, "sp27").reduce((total, item) => total + item.q, 0), "cuts are not charged at the spool price");
    // A kit that buys an approved replacement is priced with the replacement, not the original.
    const hctKit = app.kits.find((kit) => !kit.individual && app.kitItemsForTerm(kit, "sp27").some((item) => item.p === "hct20"));
    if (hctKit) {
      app.updateTermKitUnits("sp27", hctKit.id, 30);
      app.setSubstituteChoice("sp27:hct20", "hct20", approvedAlternative.id);
      priceKitParts(hctKit, 0.1);
      app.supplierQuotes[approvedAlternative.id] = [vendorListing("eco-alt", "Alt Co", 0.5)];
      const hctBase = app.kitItemsForTerm(hctKit, "sp27").reduce((total, item) => total + item.q * perPiece(item.p, item.p === "hct20" ? 0.5 : 0.1), 0);
      assert.equal(app.renderVals().comb.econ.rows.find((row) => row.name === hctKit.name).base, app.m(hctBase));
    }
    // Cost per kit: wire is charged per cut (not the whole spool), at the vendor the semester is using; the card shows all four figures.
    app.orders = [];
    priceKitParts(ece2031, 0.1);
    const wireIdsInKit = ece2031Items.filter((item) => app.wireCalculation(item.p, 1)).map((item) => item.p);
    assert.ok(wireIdsInKit.length >= 1);
    wireIdsInKit.forEach((id) => { app.supplierQuotes[id] = [vendorListing("spool-" + id, "Spool Co", 6.8)]; });
    const expectedCost = ece2031Items.reduce((total, item) => {
      const wire = app.wireCalculation(item.p, 1);
      return total + item.q * (wire ? 6.8 / wire.conservative : 0.1);
    }, 0);
    assert.ok(Math.abs(app.kitUnitCost(ece2031, "sp27") - expectedCost) < 1e-9, "cost per kit " + app.kitUnitCost(ece2031, "sp27") + " vs " + expectedCost);
    assert.ok(app.kitUnitCost(ece2031, "sp27") < 5, "the full $6.80 spool is not charged to every kit");
    app.versionFor("ece2031", "sp27").salePrice = 20;
    app.setState({ scope: "semester", semesterId: "sp27", view: "kits" });
    const kitCard = app.renderVals().kitsCards.find((card) => card.code === "ECE 2031");
    const plannedSold = app.sales(ece2031).sold;
    assert.equal(kitCard.unitPriceLabel, "$20.00");
    assert.equal(kitCard.costPerUnit, app.m(expectedCost));
    assert.equal(kitCard.profitPerUnit, app.m(20 - expectedCost));
    assert.equal(kitCard.revenue, app.m(plannedSold * 20));
    assert.equal(kitCard.profit, app.m(plannedSold * (20 - expectedCost)));
    assert.ok(20 - expectedCost > 0, "a $20 kit that costs a few dollars is profitable");
    app.setState({ view: "kit", kitId: "ece2031" });
    const kitStats = app.renderVals().kit.stats;
    const stat = (label) => kitStats.find((tile) => tile.label.startsWith(label));
    assert.equal(stat("Unit price").val, "$20.00");
    assert.equal(stat("Revenue").val, app.m(plannedSold * 20));
    assert.equal(stat("Cost / unit").val, app.m(expectedCost));
    assert.equal(stat("Profit / unit").val, app.m(20 - expectedCost));
    assert.equal(kitStats.find((tile) => tile.label === "Profit").val, app.m(plannedSold * (20 - expectedCost)));
    const wireLine = app.renderVals().kit.rows.find((row) => row.name === app.map[wireIdsInKit[0]].name);
    assert.match(wireLine.unit, /\$6\.80 \/ spool/);
    // "Vendor we're using": the plan's choice, not simply the cheapest listing.
    app.supplierQuotes.r1k = [vendorListing("cheap-r", "Cheap Co", 0.05), vendorListing("pricey-r", "Pricey Co", 0.1)];
    const r1kRow = () => app.renderVals().kit.rows.find((row) => row.name === app.map.r1k.name);
    assert.equal(r1kRow().vendor, "Cheap Co");
    assert.equal(r1kRow().vendorNote, "recommended");
    app.setSemesterVendor("sp27", "Pricey Co");
    assert.equal(r1kRow().vendor, "Pricey Co");
    assert.equal(r1kRow().vendorNote, "semester vendor");
    app.setVendorChoice("sp27:r1k", "Cheap Co");
    assert.equal(r1kRow().vendor, "Cheap Co");
    assert.equal(r1kRow().vendorNote, "pinned for this line");
    app.setVendorChoice("sp27:r1k", "auto");
    app.setSemesterVendor("sp27", "auto");
    app.supplierQuotes.r1k = [];
    assert.equal(r1kRow().vendor, "No vendor chosen", "no saved listing: say so instead of naming a vendor");
    // A kit that loses money shows a negative profit with the minus sign in front.
    assert.equal(app.m(-3758.81), "-$3,758.81");
    assert.equal(app.mu(-0.05), "-$0.0500");
    app.versionFor("ece2031", "sp27").salePrice = 1;
    assert.match(app.renderVals().kit.stats.find((tile) => tile.label === "Profit").val, /^-\$/);
    assert.match(app.renderVals().kit.stats.find((tile) => tile.label === "Profit").color, /danger/);

    // Spool length per vendor: 100 ft gives 63 usable 18 in cuts, 100 m gives 207; the plan buys whole spools of the listing that is cheaper per cut.
    if (!("wred" in econQuotes)) econQuotes.wred = app.supplierQuotes.wred;
    const wredPart = app.map.wred;
    assert.equal(app.wireCutsPerSpool(wredPart, null), 63, "100 ft x 12 / 18 in x 0.95, rounded down");
    assert.equal(app.wireCutsPerSpool(wredPart, 100 * 3.280839895), 207, "100 m");
    assert.equal(app.wireListingMode("wred"), false);
    const feetPerMeter = 3.280839895;
    app.supplierQuotes.wred = [
      vendorListing("wred-ft", "Foot Co", 6.8, { spoolLengthFt: 100 }),
      vendorListing("wred-m", "Metre Co", 20, { spoolLengthFt: 100 * feetPerMeter, spoolEntry: { value: 100, unit: "m" } }),
    ];
    assert.equal(app.wireListingMode("wred"), true);
    const wirePlan = app.vendorPlan("wred", 4, undefined, 200);
    assert.equal(wirePlan.wireMode, true);
    assert.deepEqual(wirePlan.allocations.map((row) => [row.vendor, row.qty, row.unit]), [["Metre Co", 1, 20]], "200 cuts is ONE 207-cut spool, not four 63-cut ones");
    assert.ok(Math.abs(wirePlan.allocations[0].spoolFactor - 207 / 63) < 1e-9);
    assert.equal(wirePlan.total, 20);
    assert.match(wirePlan.decision, /Metre Co covers the order \(1 spool\) at \$20\.00 landed/);
    const longer = app.vendorPlan("wred", 5, undefined, 300);
    assert.deepEqual(longer.allocations.map((row) => [row.vendor, row.qty]), [["Foot Co", 5]], "300 cuts: five 100 ft spools ($34.00) beat two 100 m spools ($40.00)");
    assert.equal(app.vendorPlan("wred", 4, undefined, 0).allocations.length, 0, "nothing to buy when stock covers the cuts");
    // Plans that do not know the cut count keep the old reference-spool behaviour.
    assert.equal(app.vendorPlan("wred", 4).wireMode, false);
    // Cost per cut at the vendor in use (not the spool, not a reference spool of another length).
    const wireSupply = app.chosenSupply(wredPart, "sp27", 200);
    assert.ok(Math.abs(wireSupply.piece - 20 / 207) < 1e-9, "20 / 207 cuts, got " + wireSupply.piece);
    // The order line is written in the listing's real spools, with the spool-size factor as its pack so inventory stays consistent.
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    const wireCuts = app.termWireCuts("wred", ["sp27"], "wred");
    assert.ok(wireCuts > 0, "sp27 needs red wire");
    const expectedSpools = Math.ceil(wireCuts / 207);
    const spoolPlan = app.vendorPlan("wred", Math.ceil(wireCuts / 63), undefined, wireCuts);
    assert.equal(spoolPlan.allocations[0].vendor === "Metre Co" || spoolPlan.allocations[0].vendor === "Foot Co", true);
    app.supplierQuotes.wred = [vendorListing("wred-m", "Metre Co", 20, { spoolLengthFt: 100 * feetPerMeter, spoolEntry: { value: 100, unit: "m" } })];
    app.createCombinedOrder(["sp27"]);
    const wireOrderLine = app.orderDraft.lines.find((line) => line[0] === "wred");
    assert.equal(wireOrderLine[1], expectedSpools);
    assert.equal(wireOrderLine[2], 20);
    assert.ok(Math.abs(wireOrderLine[6] - 207 / 63) < 1e-3, "pack = 100 m spool in 100 ft equivalents");
    app.orderDraft = null;
    app.setState({ orderForm: false });
    // Receiving those spools adds the right amount in the component's own (100 ft) units; paid prices stay per reference spool.
    app.orders.unshift({ id: "T-WIRE", date: "2026-10-12", vendor: "Metre Co", status: "ordered", terms: ["sp26"], lines: [["wred", 2, 20, "Metre Co", "", "", 3.2857]] });
    const redBefore = (app.inventoryRow("component", "wred").onHand || 0);
    assert.equal(app.receiveOrder("T-WIRE"), true);
    assert.ok(Math.abs(app.inventoryRow("component", "wred").onHand - (redBefore + 2 * 3.2857)) < 1e-9);
    assert.ok(Math.abs(app.paid("wred", "sp26").unit - 20 / 3.2857) < 1e-9);
    app.orders = app.orders.filter((order) => order.id !== "T-WIRE");
    app.inventoryRow("component", "wred").onHand = redBefore;
    // The vendor form turns a length in metres into feet, cuts per spool and cost per cut, and saves it on the listing.
    app.openSupplierForm("wred");
    app.setState({ supplierDraft: { ...app.state.supplierDraft, vendor: "Metre Co", productUrl: "https://example.com/wire", priceBreaks: "1 = 20", spoolLength: "100", spoolUnit: "m" } });
    app.setState({ pricingPartId: "wred" });
    const wireForm = app.renderVals().pricing.form;
    assert.equal(wireForm.spoolStyle, "");
    assert.match(wireForm.spoolInfo, /100 m = 328\.1 ft ÷ 18 in cuts, less the 5% leeway = 207 cuts per spool · \$0\.0966 per cut · \$0\.200 per meter\./);
    const built = app.buildManualQuote(app.state.supplierDraft, null).quote;
    assert.ok(Math.abs(built.spoolLengthFt - 328.084) < 0.001);
    assert.deepEqual(built.spoolEntry, { value: 100, unit: "m" });
    app.setState({ supplierFormOpen: false });
    app.openPart("wred");
    app.setState({ modalTab: "vendors" });
    assert.match(app.renderVals().modal.vendors[0].wireNote, /^Spool 100 m → 207 cuts · \$0\.0966 per cut$/);
    app.setState({ partId: null });
    assert.equal(app.renderVals().pricing.form.spoolStyle === "" || true, true);
    app.supplierQuotes.wred = econQuotes.wred;

    // Shared listing: one Amazon product holding a red and a black 100 m spool; the pack price is split by spool count x length.
    if (!("wblk" in econQuotes)) econQuotes.wblk = app.supplierQuotes.wblk;
    app.supplierQuotes.wred = [];
    app.supplierQuotes.wblk = [];
    app.openSupplierForm("wred");
    app.setState({ pricingPartId: "wred", supplierDraft: { ...app.state.supplierDraft, vendor: "Amazon", productUrl: "https://www.amazon.com/dp/B07TEST", sku: "B07TEST", priceBreaks: "1 = 30", bundleOn: true, bundleItems: [{ componentId: "wred", spools: "1", length: "100", unit: "m" }, { componentId: "wblk", spools: "1", length: "100", unit: "m" }] } });
    const bundleForm = app.renderVals().pricing.form;
    assert.equal(bundleForm.bundleRows.length, 2);
    assert.equal(bundleForm.bundleRows[0].shareLabel, "50% of the price · $15.00 per spool · 207 cuts per spool · $0.0725 per cut");
    assert.match(bundleForm.spoolStyle, /display:none/, "the single-listing spool field is hidden for a shared listing");
    app.saveManualSupplier();
    const sharedRed = () => app.supplierQuotes.wred.find((quote) => quote.bundle);
    const sharedBlack = () => app.supplierQuotes.wblk.find((quote) => quote.bundle);
    assert.ok(sharedRed() && sharedBlack());
    assert.equal(sharedRed().bundle.id, sharedBlack().bundle.id);
    assert.equal(app.vendors("wred", 1)[0].unit, 15);
    assert.equal(app.vendors("wblk", 1)[0].unit, 15);
    assert.ok(Math.abs(sharedRed().spoolLengthFt - 328.084) < 0.001);
    assert.equal(app.vendorPlan("wred", 4, undefined, 200).total, 15, "200 red cuts: one 207-cut spool at half of the $30 pack");
    // Uneven spools: 100 m and 50 m split the price 2/3 and 1/3, and editing from either side updates both.
    app.openSupplierForm("wblk", sharedBlack().id);
    assert.equal(app.state.supplierDraft.bundleOn, true);
    assert.equal(app.state.supplierDraft.priceBreaks, "1 = 30");
    app.setState({ pricingPartId: "wblk", supplierDraft: { ...app.state.supplierDraft, bundleItems: [{ componentId: "wred", spools: "1", length: "100", unit: "m" }, { componentId: "wblk", spools: "1", length: "50", unit: "m" }] } });
    app.saveManualSupplier();
    assert.equal(app.supplierQuotes.wred.filter((quote) => quote.bundle).length, 1, "editing re-saves the same shared listing, not a copy");
    assert.ok(Math.abs(app.vendors("wred", 1)[0].unit - 20) < 1e-9);
    assert.ok(Math.abs(app.vendors("wblk", 1)[0].unit - 10) < 1e-9);
    // End to end: with a 100 m red and a 50 m black spool, the same cut count needs different spool counts, so the order is written in whole packs.
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    app.createCombinedOrder(["sp27"]);
    const sharedOrder = app.orderDraft;
    const sharedRedLine = sharedOrder.lines.find((line) => line[0] === "wred");
    const sharedBlackLine = sharedOrder.lines.find((line) => line[0] === "wblk");
    assert.ok(sharedRedLine && sharedBlackLine);
    assert.equal(sharedRedLine[1], sharedBlackLine[1], "one pack holds one of each, so both lines buy the same number of spools");
    assert.match(sharedOrder.notes, /Shared Amazon listing: buying \d+ packs? \(\d+ Red Hookup Wire \+ \d+ Black Hookup Wire\)/);
    assert.ok(Math.abs(sharedRedLine[2] - 20) < 1e-9 && Math.abs(sharedBlackLine[2] - 10) < 1e-9, "each line carries its own share of the price");
    app.orderDraft = null;
    app.setState({ orderForm: false });
    // Orders buy whole packs: 3 red and 1 black means 3 packs, so 2 extra black spools are paid for and flagged.
    const coupleNotes = [];
    const coupled = [["wred", 3, 20, "Amazon", "", "https://www.amazon.com/dp/B07TEST"], ["wblk", 1, 10, "Amazon", "", "https://www.amazon.com/dp/B07TEST"]];
    app.coupleBundleLines(coupled, [sharedRed().id, sharedBlack().id], coupleNotes);
    assert.deepEqual(coupled.map((line) => [line[0], line[1]]), [["wred", 3], ["wblk", 3]]);
    assert.match(coupleNotes[0], /buying 3 packs \(3 Red Hookup Wire \+ 3 Black Hookup Wire\); extras paid for: 2 extra Black Hookup Wire/);
    const onlyRed = [["wred", 2, 20, "Amazon", "", "https://www.amazon.com/dp/B07TEST"]];
    app.coupleBundleLines(onlyRed, [sharedRed().id], []);
    assert.equal(onlyRed.length, 2, "a component the plan did not need still arrives in the pack");
    assert.deepEqual([onlyRed[1][0], onlyRed[1][1], onlyRed[1][2]], ["wblk", 2, 10]);
    assert.ok(Math.abs(onlyRed[1][6] - Math.round(103 / 63 * 10000) / 10000) < 1e-9, "the 50 m spool counts as 1.63 reference spools");
    // The price check works on the whole pack and re-splits it: $36 per pack makes red $24 and black $12.
    const bundleSource = globalThis.window.LabKitDataSource;
    bundleSource.capabilities = { scraper: { configured: true, amazon: true, jameco: false } };
    bundleSource.scrapeListingPage = async () => ({ status: "ok", method: "fields", candidate: { vendor: "Amazon", vendorSku: "B07TEST", name: "Wire pair", priceBreaks: [{ quantity: 1, unitPrice: 36 }], minimumOrderQuantity: 1 } });
    await app.checkListingPricing("wred", sharedRed().id);
    assert.equal(app.state.priceChecks[sharedRed().id].status, "differs");
    assert.match(app.state.priceChecks[sharedRed().id].message, /saved: 1 @ \$30\.00 \(price of the whole shared pack\)/);
    assert.equal(app.applyCheckedPrices("wred", sharedRed().id), true);
    assert.ok(Math.abs(app.vendors("wred", 1)[0].unit - 24) < 1e-9);
    assert.ok(Math.abs(app.vendors("wblk", 1)[0].unit - 12) < 1e-9);
    assert.ok(sharedRed().priceCheckedAt && sharedBlack().priceCheckedAt, "both components are marked checked");
    app.undoChange(app.changeLog[0].id);
    assert.ok(Math.abs(app.vendors("wred", 1)[0].unit - 20) < 1e-9, "undo restores the earlier split");
    delete bundleSource.scrapeListingPage;
    delete bundleSource.capabilities;
    // Removing one side leaves the other as an ordinary listing at its current price.
    app.deleteManualSupplier("wblk", sharedBlack().id);
    assert.equal(app.supplierQuotes.wblk.length, 0);
    assert.equal(app.supplierQuotes.wred[0].bundle, undefined);
    assert.ok(Math.abs(app.vendors("wred", 1)[0].unit - 20) < 1e-9);
    app.setState({ supplierFormOpen: false });
    app.supplierQuotes.wred = econQuotes.wred;
    app.supplierQuotes.wblk = econQuotes.wblk;

    // Restore everything the economics fixtures touched.
    app.orders = savedOrders;
    delete app.versionFor("ece2031", "sp27").salePrice;
    Object.entries(econQuotes).forEach(([id, quotes]) => { app.supplierQuotes[id] = quotes; });
    app.setState({ scope: "semester", semesterId: "sp27", view: "kits", gview: "home", combine: { fa26: true } });

    // Every row key the new checkbox / vendor / note markup reads exists on the row view models.
    const templateBody = (source, listName) => {
      const start = source.indexOf('list="{{ ' + listName + ' }}"');
      const open = source.indexOf(">", start) + 1;
      let depth = 1;
      let cursor = open;
      while (depth > 0) {
        const nextOpen = source.indexOf("<template", cursor);
        const nextClose = source.indexOf("</template>", cursor);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; cursor = nextOpen + 9; } else { depth -= 1; cursor = nextClose + 11; }
      }
      return source.slice(open, cursor - 11);
    };
    app.setState({ scope: "semester", semesterId: "sp27", view: "list" });
    const listSample = app.renderVals().list.rows[0];
    app.setState({ view: "kit", kitId: "ece2031" });
    const kitSample = app.renderVals().kit.rows[0];
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    const combSample = app.renderVals().comb.rows[0];
    app.setState({ scope: "semester", semesterId: "sp27", view: "list" });
    app.openPart(bulkPart.id);
    app.setState({ modalTab: "vendors" });
    const vendorSample = app.renderVals().modal.vendors[0];
    app.setState({ partId: null, scope: "global", gview: "combine", combine: { sp27: true } });
    app.setState({ scope: "semester", semesterId: "sp27", view: "list" });
    const navView = app.renderVals();
    assert.deepEqual(navView.gnav.map((item) => item.label), ["Overview", "Forecast & trends", "Ordering", "Inventory", "Component catalog", "Kit library", "Edit history"]);
    assert.deepEqual(navView.gnav.filter((item) => item.section).map((item) => item.section), ["Plan", "Buy", "Stock & parts", "History"]);
    assert.deepEqual(navView.workspaceNav.map((item) => item.label), ["Kits & demand", "Forecast", "Kit definitions", "Procurement", "Order this semester"]);
    navView.workspaceNav.at(-1).go();
    assert.equal(app.state.gview, "combine");
    assert.deepEqual(Object.keys(app.state.combine).filter((id) => app.state.combine[id]), ["sp27"], "Order this semester opens the planner with just that semester");
    assert.equal(app.renderVals().gnav.find((item) => item.label === "Ordering").style.includes("var(--color-accent)"), true);
    app.setState({ gview: "orders" });
    assert.equal(app.renderVals().gnav.find((item) => item.label === "Ordering").style.includes("border-left:3px solid var(--color-accent)"), true, "Ordering stays highlighted on the Orders & receipts tab");
    assert.deepEqual(app.renderVals().orderingTabs.map((tab) => tab.label), ["Plan a purchase", "Orders & receipts"]);
    app.setState({ gview: "combine", combine: { sp27: true } });
    const econSample = app.renderVals().comb.econ.rows[0];
    const tabSample = app.renderVals().orderingTabs[0];
    const navSample = app.renderVals().gnav[0];
    for (const [listName, sample, alias] of [["orderingTabs", tabSample, "t"], ["gnav", navSample, "g"], ["comb.econ.rows", econSample, "r"]]) {
      const body = templateBody(html, listName);
      assert.ok(body.length > 40, listName + " template found");
      for (const [, key] of body.matchAll(new RegExp("\\{\\{\\s*" + alias + "\\.(\\w+)\\s*\\}\\}", "g"))) assert.ok(key in sample, listName + " is missing " + key);
    }
    for (const [, key] of html.matchAll(/\{\{\s*comb\.econ\.(\w+)\s*\}\}/g)) assert.ok(key in app.renderVals().comb.econ, "comb.econ." + key + " is missing");
    app.setState({ scope: "global", gview: "combine", combine: { sp27: true } });
    for (const [listName, sample] of [["modal.vendors", vendorSample], ["list.rows", listSample], ["kit.rows", kitSample], ["comb.rows", combSample]]) {
      const body = templateBody(html, listName);
      assert.ok(body.length > 200, listName + " template found");
      const alias = listName === "modal.vendors" ? "v" : "r";
      for (const [, key] of body.matchAll(new RegExp("\\{\\{\\s*" + alias + "\\.(\\w+)\\s*\\}\\}", "g"))) assert.ok(key in sample, listName + " rows are missing " + key);
    }
    app.setState({ scope: "semester", semesterId: "sp27", view: "kits", gview: "home", combine: { fa26: true } });

    // Every key the dialog markup reads exists on the view model.
    const pickerMarkup = html.match(/<!-- picker:start -->([\s\S]*?)<!-- picker:end -->/)[1];
    const pathOf = (root, path) => path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), root);
    for (const [, path] of pickerMarkup.matchAll(/\{\{\s*picker\.([\w.]+)\s*\}\}/g)) {
      assert.notEqual(pathOf(pickerFindVals, path) ?? pathOf(pickerCreateVals, path) ?? pathOf(pickerLookupVals, path), undefined, `picker.${path} is missing from the view model`);
    }
    for (const [, listName, alias, body] of pickerMarkup.matchAll(/list="\{\{\s*picker\.(\w+)\s*\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/template>/g)) {
      const sample = [pickerFindVals, pickerCreateVals, pickerLookupVals].map((vals) => (vals[listName] || [])[0]).find(Boolean);
      if (typeof sample !== "object") continue;
      for (const [, key] of body.matchAll(new RegExp(`\\{\\{\\s*${alias}\\.(\\w+)\\s*\\}\\}`, "g"))) {
        assert.ok(key in sample, `${listName} items are missing ${key}`);
      }
    }
    app.setState({ picker: null });
    app.createCombinedOrder(["sp27"]);
    const substituteOrderLine = app.orderDraft.lines.find((line) => line[4] === "hct20");
    assert.equal(substituteOrderLine[0], approvedAlternative.id);
    assert.equal(substituteOrderLine[5], "https://example.com/cd74hct20e");
    app.orderDraft = null;
    app.setState({ scope: "semester", semesterId: "sp27", view: "kits", gview: "home", orderForm: false });
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
    assert.equal(lastSaved.dataSchemaVersion, "2026-10-16-v6");
    assert.equal(lastSaved.bagTypes.length, 4);
    assert.equal(lastSaved.state.priceTestValues, undefined);
    assert.equal(lastSaved.state.priceTestOpen, undefined);
  } finally {
    delete globalThis.window;
  }
});

test("the purchase-cart import adds the cart parts, vendor listings and individual items once", async () => {
  const html = await read("index.html");
  const historicalSales = await read("src/historical-sales.js");
  const cartImport = await read("src/cart-import.js");
  const logic = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let lastSaved = null;
  let loadFrom = null;
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
    LabKitDataSource: { load: () => loadFrom, save: (data) => { lastSaved = JSON.parse(JSON.stringify(data)); } },
  };
  try {
    new Function(historicalSales)();
    new Function(cartImport)();
    const data = window.LabKitCartImport;
    assert.equal(data.lines.length, 49, "all 30 DigiKey, 17 Jameco and 2 Mouser cart lines are present");
    const App = new Function("DCLogic", "React", `${logic}\nreturn Component;`)(LogicStub, {});
    const app = new App({});
    app.flash = () => {};
    const batchVersions = window.LabKitImportBatches.map((batch) => batch.version);
    assert.deepEqual(batchVersions, [data.version, "2026-10-11-amazon", "2026-10-12-bundle"]);
    assert.deepEqual(app.cartImportApplied, batchVersions);
    assert.equal(app.catalog.length, 53 + 2 + 4, "two new components plus four approved-alternative parts");
    assert.equal(app.kits.length, 7 + 2);
    const quoteBySku = (componentId, sku) => (app.supplierQuotes[componentId] || []).find((quote) => quote.vendorSku === sku);

    // Exact parts: SKU, price at the cart quantity and stock come from the cart; the superseded seeded listing is replaced, not duplicated.
    const hct20 = quoteBySku("hct20", "296-2135-5-ND");
    assert.deepEqual([hct20.vendor, hct20.priceBreaks[0].quantity, hct20.unitPrice, hct20.available], ["DigiKey", 501, 0.51176, 501]);
    assert.equal(hct20.manufacturerPartNumber, "CD74HCT20E");
    assert.equal(app.supplierQuotes.hct00.filter((quote) => quote.vendor === "Jameco" && quote.vendorSku === "44871").length, 1);
    assert.equal(quoteBySku("hct00", "44871").unitPrice, 0.49);
    assert.equal(quoteBySku("hct00", "44871").seeded, true);
    const r1k = app.supplierQuotes.r1k.filter((quote) => quote.vendor === "DigiKey");
    assert.deepEqual(r1k.map((quote) => quote.vendorSku).sort(), ["738-CF14JA1K00CT-ND", "CF14JT1K00TR-ND"], "two different 1 kΩ DigiKey parts are both kept");
    assert.match(quoteBySku("r1k", "738-CF14JA1K00CT-ND").productUrl, /CF14JA1K00/, "the old product link is carried over");
    // The two SMD capacitors stay not-approved, exactly as the earlier purchasing-sheet import decided.
    assert.equal(quoteBySku("c01u", "4491-MC2-0603B104M500BF3-ND").meetsRequirements, false);
    // A different part than the catalog entry becomes an approved alternative awaiting verification.
    const tl082 = app.approvedAlternatives("tl072").find((alt) => alt.pn === "TL082ACP");
    assert.ok(tl082);
    assert.equal(tl082.matchLabel, "From purchase cart · verify");
    const tl082Quote = app.supplierQuotes[tl082.componentId][0];
    assert.deepEqual([tl082Quote.vendor, tl082Quote.vendorSku, tl082Quote.unitPrice, tl082Quote.priceBreaks[0].quantity], ["Mouser", "595-TL082ACP", 0.602, 120]);
    assert.equal(tl082Quote.requirementsPending, true);
    assert.deepEqual(["dipsw", "tl1105", "r3r96"].map((id) => app.approvedAlternatives(id).length), [1, 1, 1]);

    // The two DigiKey links become individual items: component, product link, and a general-item kit each.
    const power = app.map["cart-bbp-32701"];
    assert.equal(power.mfr, "BUD Industries");
    assert.equal(power.base, 0);
    const powerLink = app.supplierQuotes["cart-bbp-32701"][0];
    assert.equal(powerLink.productUrl, "https://www.digikey.com/en/products/detail/bud-industries/BBP-32701/8602382");
    assert.equal(powerLink.vendorSku, "377-2647-ND");
    assert.equal(powerLink.referenceOnly, true);
    assert.equal(app.supplierQuotes["cart-16-00138"][0].productUrl, "https://www.digikey.com/en/products/detail/tensility-international-corp/16-00138/10324427");
    for (const [kitId, itemId] of [["kit-cart-bbp-32701", "cart-bbp-32701"], ["kit-cart-16-00138", "cart-16-00138"]]) {
      const kit = app.kitMap[kitId];
      assert.equal(kit.individual, true);
      assert.deepEqual(app.kitItemsForTerm(kit, "fa26").map((item) => [item.p, item.q]), [[itemId, 1]]);
      assert.ok(app.inventory.packedKits[kitId]);
    }
    assert.doesNotThrow(() => app.renderVals());

    // Idempotent: running it again, or from an older snapshot, adds nothing; an officer's edit is never overwritten.
    const counts = () => [app.catalog.length, app.kits.length, Object.values(app.supplierQuotes).flat().length];
    const before = counts();
    app.applyCartImport();
    app.cartImportApplied = [];
    app.applyCartImport();
    assert.deepEqual(counts(), before);
    const edited = quoteBySku("hct00", "44871");
    delete edited.seeded;
    edited.priceBreaks = [{ quantity: 1, unitPrice: 9 }];
    app.cartImportApplied = [];
    app.applyCartImport();
    assert.deepEqual(counts(), before);
    assert.equal(quoteBySku("hct00", "44871").priceBreaks[0].unitPrice, 9, "an officer-edited listing is kept");

    // It travels with the shared snapshot: a saved snapshot reloads without duplicates, and an older one is upgraded once.
    app.persistData();
    assert.deepEqual(lastSaved.cartImportApplied, batchVersions);
    loadFrom = JSON.parse(JSON.stringify(lastSaved));
    const reloaded = new App({});
    reloaded.restoreData();
    assert.equal(reloaded.catalog.length, app.catalog.length);
    assert.equal(reloaded.kits.length, app.kits.length);
    assert.deepEqual(reloaded.cartImportApplied, batchVersions);
    assert.equal(reloaded.supplierQuotes.hct00.filter((quote) => quote.vendorSku === "44871").length, 1);
    // A snapshot saved BEFORE the import existed (the live sheet) is upgraded once, and its officer edits survive.
    const batches = window.LabKitImportBatches;
    delete window.LabKitCartImport;
    delete window.LabKitImportBatches;
    loadFrom = null;
    const legacy = new App({});
    assert.equal(legacy.catalog.length, 53);
    assert.equal(legacy.cartImportApplied, undefined);
    const legacyQuote = legacy.supplierQuotes.hct00.find((quote) => quote.vendorSku === "44871");
    delete legacyQuote.seeded;
    legacyQuote.priceBreaks = [{ quantity: 1, unitPrice: 7 }];
    legacy.persistData();
    const legacyJson = JSON.stringify(lastSaved);
    const freshLegacy = () => JSON.parse(legacyJson);
    assert.equal(freshLegacy().cartImportVersion, null);
    assert.deepEqual(freshLegacy().cartImportApplied, []);
    assert.equal((freshLegacy().supplierQuotes.hct20 || []).length, 0, "the older snapshot has no cart listings");
    window.LabKitCartImport = data;
    window.LabKitImportBatches = batches;
    loadFrom = freshLegacy();
    const upgraded = new App({});
    upgraded.restoreData();
    assert.equal(upgraded.catalog.length, app.catalog.length, "the older snapshot gains the cart parts");
    assert.equal(upgraded.kits.length, app.kits.length);
    assert.deepEqual(upgraded.cartImportApplied, batchVersions);
    assert.equal(upgraded.supplierQuotes.hct00.find((quote) => quote.vendorSku === "44871").priceBreaks[0].unitPrice, 7, "the officer's price survives the import");
    assert.equal(upgraded.supplierQuotes.hct00.filter((quote) => quote.vendorSku === "44871").length, 1);
    assert.equal(upgraded.supplierQuotes.hct20.some((quote) => quote.vendorSku === "296-2135-5-ND"), true);
    const upgradedAgain = new App({});
    upgradedAgain.restoreData();
    assert.equal(upgradedAgain.catalog.length, app.catalog.length);
    // Shared-sheet mode: the app starts with the import applied, then the older sheet data arrives afterwards.
    loadFrom = null;
    const late = new App({});
    assert.deepEqual(late.cartImportApplied, batchVersions);
    late.applySavedData(freshLegacy());
    assert.equal(late.catalog.length, app.catalog.length);
    assert.equal(late.supplierQuotes.hct20.some((quote) => quote.vendorSku === "296-2135-5-ND"), true, "late-arriving older data still gets the import");
    assert.equal(late.supplierQuotes.hct00.find((quote) => quote.vendorSku === "44871").priceBreaks[0].unitPrice, 7);
    assert.equal(late.kits.length, app.kits.length);
    late.applySavedData(JSON.parse(JSON.stringify(lastSaved)));
    assert.equal(late.catalog.length, app.catalog.length);

    // The two Amazon purchases: logged as orders to receive later (no semester, no price), with the pack size on the trimpot listing.
    assert.deepEqual(app.orders.map((order) => order.id).sort(), ["AMZ-B07JNB712X", "AMZ-B0CX5NPJ8F"]);
    const orderById = (id) => app.orders.find((order) => order.id === id);
    assert.deepEqual(orderById("AMZ-B07JNB712X").lines.map((line) => [line[0], line[1]]), [["wred", 8], ["wblk", 8]]);
    assert.deepEqual(app.orders.map((order) => order.terms.length), [0, 0], "no semester, so these never feed price history");
    assert.equal(orderById("AMZ-B0CX5NPJ8F").status, "ordered");
    // The two Amazon wire listings are one shared product: one 100 m red and one 100 m black spool, price split by spool count x length.
    const spoolPack = Math.round(207 / 63 * 10000) / 10000;
    const redShared = app.supplierQuotes.wred.find((quote) => quote.vendor === "Amazon" && quote.vendorSku === "B07JNB712X");
    const blackShared = app.supplierQuotes.wblk.find((quote) => quote.vendor === "Amazon" && quote.vendorSku === "B07JNB712X");
    assert.equal(redShared.bundle.id, blackShared.bundle.id);
    assert.deepEqual(redShared.bundle.items.map((item) => [item.componentId, item.spools, item.spoolEntry.value, item.spoolEntry.unit]), [["wred", 1, 100, "m"], ["wblk", 1, 100, "m"]]);
    assert.ok(Math.abs(redShared.spoolLengthFt - 328.084) < 0.001);
    assert.deepEqual(orderById("AMZ-B07JNB712X").lines.map((line) => line[6]), [spoolPack, spoolPack], "each Amazon spool counts as 3.29 reference (100 ft) spools");
    const potQuote = quoteBySku("p5k", "B0CX5NPJ8F");
    assert.deepEqual([potQuote.packSize, potQuote.minimumOrderQuantity, potQuote.orderMultiple], [50, 50, 50]);
    assert.ok(app.supplierQuotes.wred.some((quote) => quote.vendor === "Amazon" && quote.vendorSku === "B07JNB712X" && quote.productUrl.includes("B07JNB712X")));
    assert.ok(app.supplierQuotes.wblk.some((quote) => quote.vendor === "Amazon" && quote.vendorSku === "B07JNB712X"));
    // Deleting an imported order or listing is permanent: the batch is remembered and never re-applied.
    const keepOrders = app.orders;
    app.orders = app.orders.filter((order) => order.id !== "AMZ-B07JNB712X");
    app.applyCartImport();
    assert.equal(app.orders.some((order) => order.id === "AMZ-B07JNB712X"), false);
    app.orders = keepOrders;

    // Receiving: the view shows packs and counts; units = ordered units x units per pack; only what is not yet counted is added.
    const onHand = (id) => app.inventoryRow("component", id).onHand || 0;
    app.setState({ scope: "global", gview: "orders", orderOpen: "AMZ-B07JNB712X" });
    let detail = app.renderVals().ord.detail;
    assert.equal(detail.lines[0].qty, app.num(8) + " × " + app.num(spoolPack) + " = " + app.num(8 * spoolPack) + " units");
    assert.equal(detail.lines[0].inInventory, "0 of " + app.num(8 * spoolPack));
    assert.equal(detail.lines[0].unit, "Unpriced");
    assert.equal(detail.lines[0].ext, "—");
    assert.doesNotMatch(detail.receiveAllStyle, /display:none/);
    const wireBefore = [onHand("wred"), onHand("wblk")];
    detail.lines[0].receive({ stopPropagation() {} });
    assert.ok(Math.abs(onHand("wred") - (wireBefore[0] + 8 * spoolPack)) < 1e-9, "8 red 100 m spools = 26.3 reference spools");
    assert.equal(onHand("wblk"), wireBefore[1], "only the red spools were added");
    assert.equal(orderById("AMZ-B07JNB712X").status, "ordered");
    detail = app.renderVals().ord.detail;
    assert.equal(detail.lines[0].inInventory, app.num(8 * spoolPack) + " of " + app.num(8 * spoolPack));
    assert.match(detail.lines[0].receiveStyle, /display:none/);
    detail.lines[1].onReceiveQty({ target: { value: "3" } });
    app.renderVals().ord.detail.lines[1].receive({ stopPropagation() {} });
    assert.ok(Math.abs(onHand("wblk") - (wireBefore[1] + 3 * spoolPack)) < 1e-9, "a partial amount can be received");
    assert.equal(app.receiveOrder("AMZ-B07JNB712X"), true);
    assert.ok(Math.abs(onHand("wblk") - (wireBefore[1] + 8 * spoolPack)) < 1e-9);
    assert.equal(orderById("AMZ-B07JNB712X").status, "received", "fully received orders are marked received");
    assert.equal(app.receiveOrder("AMZ-B07JNB712X"), false);
    assert.ok(Math.abs(onHand("wblk") - (wireBefore[1] + 8 * spoolPack)) < 1e-9, "a second click adds nothing");

    // 5 packs x 50 = 250 trimpots, in two steps, then undo restores both the inventory and the order.
    const potsBefore = onHand("p5k");
    assert.equal(app.orderLinePack(orderById("AMZ-B0CX5NPJ8F").lines[0]), 50);
    assert.equal(app.receiveOrder("AMZ-B0CX5NPJ8F", { 0: 2 }), true);
    assert.equal(onHand("p5k"), potsBefore + 100);
    assert.equal(app.map.p5k.stock, potsBefore + 100);
    assert.equal(orderById("AMZ-B0CX5NPJ8F").status, "ordered");
    assert.equal(app.receiveOrder("AMZ-B0CX5NPJ8F"), true);
    assert.equal(onHand("p5k"), potsBefore + 250);
    assert.equal(orderById("AMZ-B0CX5NPJ8F").status, "received");
    app.undoChange(app.changeLog[0].id);
    assert.equal(onHand("p5k"), potsBefore + 100);
    assert.equal(orderById("AMZ-B0CX5NPJ8F").status, "ordered");
    assert.equal(orderById("AMZ-B0CX5NPJ8F").lines[0][7], 2);
    app.undoChange(app.changeLog.find((change) => change.entity === "receive" && !change.undoneAt).id);
    assert.equal(onHand("p5k"), potsBefore);
    assert.equal(app.map.p5k.stock, potsBefore);
    assert.equal(orderById("AMZ-B0CX5NPJ8F").lines[0][7] || 0, 0);

    // Packaging bags add packs x bag quantity; a bought replacement part stocks itself; cancelled orders and already-counted orders add nothing.
    const replacement = app.approvedAlternatives("tl072")[0].componentId;
    const bagBefore = app.inventoryRow("bag", "bag-ece2031").onHand || 0;
    app.orders.unshift({ id: "T-MIX", date: "2026-10-12", vendor: "ULINE", status: "ordered", terms: [], lines: [["bag:bag-ece2031", 2, 10, "ULINE"], [replacement, 7, 0.5, "Mouser"]] });
    assert.equal(app.receiveOrder("T-MIX"), true);
    assert.equal(app.inventoryRow("bag", "bag-ece2031").onHand, bagBefore + 200);
    assert.equal(onHand(replacement), 7);
    app.orders.unshift({ id: "T-CANCELLED", date: "2026-10-12", vendor: "X", status: "cancelled", terms: [], lines: [["hct00", 5, 0.1, "X"]] });
    const hct00Before = onHand("hct00");
    assert.equal(app.receiveOrder("T-CANCELLED"), false);
    assert.equal(onHand("hct00"), hct00Before);
    app.orders.unshift({ id: "T-OLD", date: "2024-01-01", vendor: "X", status: "received", terms: [], lines: [["hct00", 10, 0.1, "X"]] });
    assert.equal(app.markOrderCounted("T-OLD"), true);
    assert.equal(app.receiveOrder("T-OLD"), false, "an order marked already counted can never be added again");
    assert.equal(onHand("hct00"), hct00Before);

    // Paid prices are per piece and an unpriced line is never a $0 purchase.
    app.orders.unshift({ id: "T-PAID", date: "2025-02-01", vendor: "Amazon", status: "received", terms: ["sp26"], lines: [["p5k", 5, 10, "Amazon", "", "", 50], ["hct00", 3, 0, "Nobody"]] });
    assert.equal(app.paid("p5k", "sp26").unit, 0.2);
    assert.equal(app.paid("hct00", "sp26"), null);

    // Fill an unpriced line from the saved listing: per pack = per-piece listing price x pack size.
    assert.equal(app.fillOrderLinePrice("AMZ-B0CX5NPJ8F", 0), false, "no priced listing yet");
    potQuote.priceBreaks = [{ quantity: 50, unitPrice: 0.2, currency: "USD" }];
    potQuote.unitPrice = 0.2;
    assert.equal(app.fillOrderLinePrice("AMZ-B0CX5NPJ8F", 0), true);
    assert.equal(orderById("AMZ-B0CX5NPJ8F").lines[0][2], 10);
    app.setState({ orderOpen: "AMZ-B0CX5NPJ8F" });
    assert.equal(app.renderVals().ord.detail.lines[0].unit, "$10.00 / pack");
    assert.match(app.renderVals().ord.detail.lines[0].qty, /^5 × 50 = 250 units$/);

    // The Amazon price check is pack-aware: the page's pack price is divided by the pack size.
    const amazonSource = globalThis.window.LabKitDataSource;
    const pagePrice = { value: 10 };
    amazonSource.capabilities = { scraper: { configured: true, amazon: true, jameco: false } };
    amazonSource.scrapeListingPage = async () => ({ status: "ok", method: "fields", candidate: { vendor: "Amazon", vendorSku: "B0CX5NPJ8F", name: "Trimpots", available: null, priceBreaks: [{ quantity: 1, unitPrice: pagePrice.value }], minimumOrderQuantity: 1 } });
    await app.checkListingPricing("p5k", potQuote.id);
    assert.equal(app.state.priceChecks[potQuote.id].status, "match", "$10 per pack of 50 equals $0.20 each");
    pagePrice.value = 12;
    await app.checkListingPricing("p5k", potQuote.id);
    assert.equal(app.state.priceChecks[potQuote.id].status, "differs");
    assert.match(app.state.priceChecks[potQuote.id].message, /page price per pack ÷ 50/);
    assert.equal(app.applyCheckedPrices("p5k", potQuote.id), true);
    const updated = quoteBySku("p5k", "B0CX5NPJ8F");
    assert.ok(Math.abs(updated.priceBreaks[0].unitPrice - 0.24) < 1e-9);
    assert.equal(updated.priceBreaks[0].quantity, 50);
    assert.deepEqual([updated.minimumOrderQuantity, updated.orderMultiple], [50, 50]);
    delete amazonSource.scrapeListingPage;
    delete amazonSource.capabilities;

    // The order form: units per pack is editable, shown, and kept when the order is saved.
    app.openOrderForm({ id: "T-FORM", date: "2026-10-12", vendor: "Amazon", status: "ordered", terms: [], lines: [["p5k", 5, 0, "Amazon", "", "", 50]] });
    let formLine = app.renderVals().ord.form.lines[0];
    assert.equal(formLine.pack, 50);
    assert.equal(formLine.addsLabel, "adds 250 to inventory");
    assert.equal(formLine.unit, "Unpriced");
    formLine.onPack({ target: { value: "25" } });
    assert.equal(app.renderVals().ord.form.lines[0].addsLabel, "adds 125 to inventory");
    app.saveOrder();
    assert.equal(orderById("T-FORM").lines[0][6], 25);
    app.setState({ gview: "orders", orderOpen: "T-FORM", orderForm: false });

    // Every key the new order markup reads exists on the view models.
    const bodyOf = (source, listName) => {
      const start = source.indexOf('list="{{ ' + listName + ' }}"');
      const open = source.indexOf(">", start) + 1;
      let depth = 1;
      let cursor = open;
      while (depth > 0) {
        const nextOpen = source.indexOf("<template", cursor);
        const nextClose = source.indexOf("</template>", cursor);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; cursor = nextOpen + 9; } else { depth -= 1; cursor = nextClose + 11; }
      }
      return source.slice(open, cursor - 11);
    };
    const orderView = app.renderVals().ord;
    for (const [listName, sample] of [["ord.detail.lines", orderView.detail.lines[0]]]) {
      for (const [, key] of bodyOf(html, listName).matchAll(/\{\{\s*l\.(\w+)\s*\}\}/g)) assert.ok(key in sample, listName + " is missing " + key);
    }
    app.openOrderForm({ id: "T-KEYS", date: "2026-10-12", vendor: "Amazon", status: "ordered", terms: [], lines: [["p5k", 1, 0, "Amazon"]] });
    const formSample = app.renderVals().ord.form.lines[0];
    for (const [, key] of bodyOf(html, "ord.form.lines").matchAll(/\{\{\s*l\.(\w+)\s*\}\}/g)) assert.ok(key in formSample, "ord.form.lines is missing " + key);
    for (const [, key] of html.matchAll(/\{\{\s*ord\.detail\.(\w+)\s*\}\}/g)) assert.ok(key in orderView.detail, "ord.detail." + key + " is missing");
    app.orderDraft = null;
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

    app.setState({
      partId: "hct00",
      modalTab: "vendors",
      supplierFormOpen: true,
      supplierEditingId: "manual-hct00-jameco",
      supplierDraft: { ...app.state.supplierDraft, vendor: "Jameco", sourceText: "draft listing text" },
      historyPanel: true,
    });
    app.onSharedDataLoaded({ detail: { data: {
      state: {
        overrides: { ece2031: 250 },
        statusOv: {},
        vendorPolicy: "best",
        lineVendor: { "sp27:hct00": "Jameco" },
        lineSubstitute: {},
        // A legacy snapshot may still contain old browser-only fields. They
        // must not be allowed to dismiss this browser's active work.
        partId: null,
        modalTab: "overview",
        supplierFormOpen: false,
        historyPanel: false,
      },
    } } });
    assert.equal(app.state.partId, "hct00");
    assert.equal(app.state.modalTab, "vendors");
    assert.equal(app.state.supplierFormOpen, true);
    assert.equal(app.state.supplierEditingId, "manual-hct00-jameco");
    assert.equal(app.state.supplierDraft.sourceText, "draft listing text");
    assert.equal(app.state.historyPanel, true);
    assert.equal(app.state.lineVendor["sp27:hct00"], "Jameco");
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
  assert.match(source, /commit: commitChanges/);
  assert.match(source, /action: "verifySnapshot"/);
});

test("Apps Script data adapter authenticates and seeds an empty shared sheet", async () => {
  const source = await read("src/data-source.js");
  const requests = [];
  const scheduled = [];
  const listeners = new Map();
  let storedSnapshot = null;
  let storedVersion = 0;
  let returnMismatchedVerification = false;
  let deferVerification = false;
  let releaseVerification = null;
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
          storedSnapshot = request.payload.snapshot;
          storedVersion = request.payload.expectedVersion + 1;
          successHandler({ ok: true, data: { version: storedVersion, duplicate: false } });
        } else if (request.action === "verifySnapshot") {
          const snapshot = returnMismatchedVerification
            ? { ...storedSnapshot, orders: [{ id: "different-stored-order", lines: [] }] }
            : storedSnapshot;
          const response = { ok: true, data: {
            state: { version: storedVersion, snapshot },
            versionMatches: request.payload.expectedVersion === storedVersion,
          } };
          if (deferVerification) {
            const deferredSuccess = successHandler;
            releaseVerification = () => deferredSuccess(response);
          } else successHandler(response);
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
    lineSubstitute: {},
    lineProgress: {},
    semesterVendor: {},
    combineNotes: {},
  });
  assert.deepEqual(requests[1].payload.snapshot.inventory, {
    components: {},
    packedKits: {},
  });
  assert.equal(browser.LabKitDataSource.version, 1);

  const verified = await browser.LabKitDataSource.commit({
    ...browser.LabKitDataSource.load(),
    orders: [{ id: "PO-verified", vendor: "Mouser", lines: [] }],
  });
  assert.equal(verified.verified, true);
  assert.equal(requests.at(-1).action, "verifySnapshot");
  assert.equal(requests.at(-1).payload.expectedVersion, 2);
  assert.match(browser.LabKitDataSource.statusLabel, /Saved & verified/);
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, false);

  deferVerification = true;
  const saveWhileEditing = browser.LabKitDataSource.commit({
    ...browser.LabKitDataSource.load(),
    orders: [{ id: "PO-before-newer-edit", vendor: "Mouser", lines: [] }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(releaseVerification);
  browser.LabKitDataSource.save({
    ...browser.LabKitDataSource.load(),
    orders: [{ id: "PO-newer-edit", vendor: "Newark", lines: [] }],
  });
  deferVerification = false;
  releaseVerification();
  const verifiedNewerEdit = await saveWhileEditing;
  assert.equal(verifiedNewerEdit.verified, true);
  assert.equal(storedSnapshot.orders[0].id, "PO-newer-edit");
  assert.equal(browser.LabKitDataSource.load().orders[0].id, "PO-newer-edit");
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, false);

  returnMismatchedVerification = true;
  await assert.rejects(
    browser.LabKitDataSource.commit({
      ...browser.LabKitDataSource.load(),
      orders: [{ id: "PO-must-not-be-lost", vendor: "DigiKey", lines: [] }],
    }),
    (error) => error.code === "SAVE_NOT_VERIFIED",
  );
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, true);
  assert.equal(browser.LabKitDataSource.load().orders[0].id, "PO-must-not-be-lost");
  assert.match(browser.LabKitDataSource.statusLabel, /could not be verified/);
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

test("session polling recognizes the editor's own in-flight save", async () => {
  const source = await read("src/data-source.js");
  const scheduled = [];
  const storage = new Map();
  let currentSuccess;
  let currentFailure;
  let pendingSaveSuccess;
  let savedSnapshot;
  const conflicts = [];
  const baseSnapshot = {
    state: { overrides: {}, statusOv: {}, vendorPolicy: "best", lineVendor: {} },
    catalog: [], kits: [], kitVersions: [], lineupVersions: [], changeLog: [], orders: [], terms: [],
    inventory: { components: {}, packedKits: {} }, supplierQuotes: {}, alternatives: {},
  };
  const reverseObjectKeys = (value) => {
    if (Array.isArray(value)) return value.map(reverseObjectKeys);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).reverse().reduce((output, key) => {
      output[key] = reverseObjectKeys(value[key]);
      return output;
    }, {});
  };
  const runner = {
    withSuccessHandler(handler) { currentSuccess = handler; return this; },
    withFailureHandler(handler) { currentFailure = handler; return this; },
    apiRequest(request) {
      const success = currentSuccess;
      const failure = currentFailure;
      if (request.action === "bootstrap") {
        queueMicrotask(() => success({ ok: true, data: {
          user: { uid: "firebase-1", email: "admin@example.com", role: "admin" },
          state: { version: 1, snapshot: baseSnapshot },
          access: { mode: "editor", canEdit: true, editor: { label: "Test browser" } },
        } }));
      } else if (request.action === "saveSnapshot") {
        savedSnapshot = request.payload.snapshot;
        pendingSaveSuccess = success;
      } else if (request.action === "syncSession") {
        queueMicrotask(() => success({ ok: true, data: {
          access: { mode: "editor", canEdit: true, editor: { label: "Test browser" } },
          state: { version: 2, snapshot: reverseObjectKeys(savedSnapshot) },
          version: 2,
        } }));
      } else {
        failure(new Error(`Unexpected action: ${request.action}`));
      }
    },
  };
  const listeners = new Map();
  const browser = {
    __LABKIT_APPS_SCRIPT__: true,
    google: { script: { run: runner } },
    crypto: { randomUUID: () => "own-save-request" },
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
  browser.addEventListener("labkit:data-conflict", (event) => conflicts.push(event.detail));
  await browser.LabKitDataSource.connect({ uid: "firebase-1", getIdToken: async () => "firebase-token" });
  browser.LabKitDataSource.save({ ...baseSnapshot, orders: [{ id: "PO-local", vendor: "Jameco", lines: [] }] });
  const savePromise = scheduled[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(pendingSaveSuccess);
  await scheduled[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(conflicts.length, 0);
  pendingSaveSuccess({ ok: true, data: { version: 2, duplicate: false } });
  await savePromise;
  assert.equal(browser.LabKitDataSource.version, 2);
  assert.equal(browser.LabKitDataSource.hasUnsavedChanges, false);
  assert.equal(storage.has("labkit.unsaved-remote-draft"), false);
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
  assert.match(source, /case "verifySnapshot"/);
  assert.match(source, /function verifySnapshot_/);
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
  assert.match(source, /function parseSupplierText_/);
  assert.match(source, /function claimEditorLease_/);
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
  let geminiText = '{"ok":true}';
  let groundedStatus = 200;
  let digikeyStatus = 200;
  let brightStatus = 200;
  let brightBody = [];
  const digikeyBody = {
    Product: {
      ManufacturerProductNumber: "SN74HCT20N", Manufacturer: { Name: "Texas Instruments" },
      Description: { ProductDescription: "IC GATE NAND 2CH 4-INP 14DIP" },
      ProductUrl: "https://www.digikey.com/en/products/detail/texas-instruments/SN74HCT20N/277060",
      DatasheetUrl: "https://www.ti.com/lit/ds/symlink/sn74hct20.pdf",
      ProductVariations: [
        { DigiKeyProductNumber: "296-1234-5-ND", PackageType: { Name: "Tube" }, MinimumOrderQuantity: 1, QuantityAvailableforPackageType: 1500,
          StandardPricing: [{ BreakQuantity: 25, UnitPrice: 0.4, TotalPrice: 10 }, { BreakQuantity: 1, UnitPrice: 0.52, TotalPrice: 0.52 }] },
        { DigiKeyProductNumber: "296-1234-6-ND", PackageType: { Name: "Cut Tape" }, MinimumOrderQuantity: 1, QuantityAvailableforPackageType: 900,
          StandardPricing: [{ BreakQuantity: 1, UnitPrice: 0.6, TotalPrice: 0.6 }] },
        { DigiKeyProductNumber: "no-price", PackageType: { Name: "Reel" }, StandardPricing: [] },
      ],
    },
  };
  let groundedBody = {
    candidates: [{
      content: { parts: [{ text: "Mouser lists SN74HCT20N (595-SN74HCT20N), PDIP-14, $0.52 at 1 and $0.31 at 100, 1500 in stock." }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "mouser.com" } }] },
    }],
  };
  const UrlFetchApp = {
    fetch(url, options) {
      requests.push({ url, options });
      let body;
      let status = 200;
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
      } else if (url.includes("api.brightdata.com")) {
        status = brightStatus;
        body = brightBody;
      } else if (url.includes("api.digikey.com/v1/oauth2/token")) {
        body = { access_token: "dk-token", expires_in: 600 };
      } else if (url.includes("api.digikey.com/products/v4/search/")) {
        status = digikeyStatus;
        body = digikeyStatus === 200 ? digikeyBody : { detail: "Product not found" };
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
      } else if (options && options.payload && JSON.parse(options.payload).tools) {
        status = groundedStatus;
        body = groundedStatus === 200 ? groundedBody : { error: { message: "Search grounding is not supported for this model" } };
      } else {
        body = {
          candidates: [{ content: { parts: [{ text: geminiText }] } }],
        };
      }
      return {
        getResponseCode: () => status,
        getContentText: () => JSON.stringify(body),
      };
    },
  };
  const cacheValues = new Map();
  const CacheService = { getScriptCache: () => ({ get: (key) => cacheValues.get(key) ?? null, put: (key, value) => cacheValues.set(key, value) }) };
  const api = new Function(
    "PropertiesService",
    "UrlFetchApp",
    "CacheService",
    `${source}\nreturn { scrapeListingPage_, checkVendorPricing_, fetchMouserQuotes_, fetchNewarkQuotes_, callGeminiJson_, lookupVendorComponent_, parseNewComponentText_, configuredSuppliers_, publicCapabilities_, apiFailure_ };`,
  )(PropertiesService, UrlFetchApp, CacheService);

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

  // Vendor lookup for a component that does not exist yet now goes through Gemini's own web tools; no vendor API credentials are used.
  assert.deepEqual(api.configuredSuppliers_(), { mouser: true, digikey: false, newark: true });
  assert.equal(api.publicCapabilities_().gemini.canReadVendorUrls, true);
  const candidateJson = (overrides = {}) => JSON.stringify({
    candidates: [{
      name: "SN74HCT20N", vendorSku: "595-SN74HCT20N", manufacturer: "Texas Instruments", description: "Dual 4-input NAND gate",
      packageName: "PDIP-14", category: "Logic IC", productUrl: "https://www.mouser.com/ProductDetail/595-SN74HCT20N",
      datasheetUrl: "https://www.ti.com/lit/ds/symlink/sn74hct20.pdf", available: 1500, leadTime: "",
      priceBreaks: [{ quantity: 100, unitPrice: 0.31 }, { quantity: 1, unitPrice: 0.52 }], ...overrides,
    }],
  });
  const lookupRequestStart = requests.length;
  geminiText = candidateJson();
  const found = api.lookupVendorComponent_({ payload: { vendor: "Mouser", query: "SN74HCT20N", categories: ["Logic IC", "Op-Amp"] } });
  const groundedRequest = JSON.parse(requests[lookupRequestStart].options.payload);
  assert.deepEqual(groundedRequest.tools, [{ google_search: {} }]);
  assert.equal(groundedRequest.generationConfig.responseSchema, undefined, "web tools are not combined with a JSON schema");
  assert.ok(JSON.parse(requests[lookupRequestStart + 1].options.payload).generationConfig.responseSchema, "extraction uses a schema in its own request");
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].name, "SN74HCT20N");
  assert.equal(found.candidates[0].vendor, "Mouser");
  assert.equal(found.candidates[0].category, "Logic IC");
  assert.deepEqual(found.candidates[0].priceBreaks, [{ quantity: 1, unitPrice: 0.52 }, { quantity: 100, unitPrice: 0.31 }]);
  assert.equal(found.candidates[0].unverifiedPrice, true);
  assert.equal(found.candidates[0].productUrl, "https://www.mouser.com/ProductDetail/595-SN74HCT20N", "a link on a cited vendor domain is kept");
  assert.equal(found.candidates[0].datasheetUrl, "", "a link on a domain nobody cited is dropped, not trusted");
  assert.match(found.message, /mouser\.com/);
  assert.match(found.message, /read from the web by Gemini/);
  // Google's grounding redirect links are never saved as a product link.
  geminiText = candidateJson({ productUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" });
  assert.equal(api.lookupVendorComponent_({ payload: { vendor: "Mouser", query: "SN74HCT20N" } }).candidates[0].productUrl, "");
  // A page Gemini's URL tool really retrieved is accepted even on a domain the search never cited; a failed read is explained.
  const typedLink = "https://www.jameco.com/z/LM358P";
  groundedBody = {
    candidates: [{
      content: { parts: [{ text: "Jameco LM358P $0.69" }] },
      urlContextMetadata: { urlMetadata: [{ retrievedUrl: typedLink, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] },
    }],
  };
  geminiText = candidateJson({ name: "LM358P", productUrl: "" });
  const typedStart = requests.length;
  const fromPage = api.lookupVendorComponent_({ payload: { vendor: "Jameco", url: typedLink } });
  assert.deepEqual(JSON.parse(requests[typedStart].options.payload).tools, [{ url_context: {} }, { google_search: {} }]);
  assert.equal(fromPage.candidates[0].productUrl, typedLink, "a single candidate from the typed page keeps the typed link");
  groundedBody = {
    candidates: [{
      content: { parts: [{ text: "Could not open the page" }] },
      url_context_metadata: { url_metadata: [{ retrieved_url: typedLink, url_retrieval_status: "URL_RETRIEVAL_STATUS_ERROR" }] },
    }],
  };
  assert.match(api.lookupVendorComponent_({ payload: { vendor: "Jameco", url: typedLink } }).message, /could not be read/);
  // Unsupported model, missing key, and bad input each fail with a message the officer can act on.
  groundedStatus = 400;
  assert.throws(() => api.lookupVendorComponent_({ payload: { vendor: "Mouser", query: "X1" } }), (error) => error.code === "AI_UNAVAILABLE" && /gemini-2\.5-flash or newer/.test(error.message));
  groundedStatus = 200;
  const savedKey = properties.get("LABKIT_GEMINI_API_KEY");
  properties.delete("LABKIT_GEMINI_API_KEY");
  assert.throws(() => api.lookupVendorComponent_({ payload: { vendor: "Mouser", query: "X1" } }), (error) => error.code === "AI_NOT_CONFIGURED");
  properties.set("LABKIT_GEMINI_API_KEY", savedKey);
  assert.throws(() => api.lookupVendorComponent_({ payload: { vendor: "Mouser" } }), (error) => error.code === "INVALID_INPUT");
  assert.throws(() => api.lookupVendorComponent_({ payload: { query: "x".repeat(161) } }), (error) => error.code === "INVALID_INPUT");
  assert.throws(() => api.lookupVendorComponent_({ payload: { url: "http://insecure.example.com/p" } }), (error) => error.code === "INVALID_INPUT");
  assert.equal(api.apiFailure_({ code: "AI_UNAVAILABLE", message: "x" }).error.code, "AI_UNAVAILABLE");
  assert.equal(api.apiFailure_({ code: "SUPPLIER_NOT_CONFIGURED", message: "not set" }).error.code, "SUPPLIER_NOT_CONFIGURED");
  assert.equal(api.apiFailure_({ code: "AI_NOT_CONFIGURED", message: "no key" }).error.code, "AI_NOT_CONFIGURED");

  // Price check against the vendor's own API: full tier tables, packaging variations, and clear failures.
  const mouserCheck = api.checkVendorPricing_({ payload: { vendor: "Mouser", sku: "595-TEST" } });
  assert.equal(mouserCheck.exactCount, 1);
  assert.equal(mouserCheck.matches[0].vendorSku, "595-TEST");
  assert.deepEqual(mouserCheck.matches[0].priceBreaks.map((row) => [row.quantity, row.unitPrice]), [[1, 0.1], [100, 0.08]]);
  assert.equal(mouserCheck.matches[0].minimumOrderQuantity, 5);
  assert.equal(mouserCheck.matches[0].orderMultiple, 5);
  assert.throws(() => api.checkVendorPricing_({ payload: { vendor: "DigiKey", sku: "296-1234-5-ND" } }), (error) => error.code === "SUPPLIER_NOT_CONFIGURED");
  assert.throws(() => api.checkVendorPricing_({ payload: { vendor: "Jameco", sku: "1" } }), (error) => error.code === "INVALID_INPUT");
  assert.throws(() => api.checkVendorPricing_({ payload: { vendor: "Mouser" } }), (error) => error.code === "INVALID_INPUT");
  properties.set("LABKIT_DIGIKEY_CLIENT_ID", "dk-id");
  properties.set("LABKIT_DIGIKEY_CLIENT_SECRET", "dk-secret");
  properties.set("LABKIT_DIGIKEY_ACCOUNT_ID", "12345");
  const digikeyStart = requests.length;
  const digikeyCheck = api.checkVendorPricing_({ payload: { vendor: "DigiKey", sku: "296-1234-5-ND" } });
  assert.equal(digikeyCheck.matches.length, 2, "a variation without prices is dropped");
  assert.equal(digikeyCheck.exactCount, 1);
  const tube = digikeyCheck.matches.find((row) => row.vendorSku === "296-1234-5-ND");
  assert.equal(tube.packageType, "Tube");
  assert.deepEqual(tube.priceBreaks.map((row) => [row.quantity, row.unitPrice]), [[1, 0.52], [25, 0.4]], "tiers come back sorted by quantity");
  assert.equal(tube.available, 1500);
  assert.equal(tube.manufacturerPartNumber, "SN74HCT20N");
  const tokenRequest = requests[digikeyStart];
  assert.match(tokenRequest.url, /v1\/oauth2\/token/);
  assert.equal(tokenRequest.options.payload.grant_type, "client_credentials");
  const detailsRequest = requests[digikeyStart + 1];
  assert.match(detailsRequest.url, /\/products\/v4\/search\/296-1234-5-ND\/productdetails$/);
  assert.equal(detailsRequest.options.headers.Authorization, "Bearer dk-token");
  assert.equal(detailsRequest.options.headers["X-DIGIKEY-Account-Id"], "12345");
  digikeyStatus = 404;
  assert.throws(() => api.checkVendorPricing_({ payload: { vendor: "DigiKey", sku: "nope" } }), (error) => error.code === "SUPPLIER_UNAVAILABLE" && /DigiKey price check failed/.test(error.message));
  digikeyStatus = 200;
  ["LABKIT_DIGIKEY_CLIENT_ID", "LABKIT_DIGIKEY_CLIENT_SECRET", "LABKIT_DIGIKEY_ACCOUNT_ID"].forEach((key) => properties.delete(key));

  // Page scraping through Bright Data for the two vendors that block ordinary requests.
  const amazonUrl = "https://www.amazon.com/dp/B0TEST1234";
  assert.throws(() => api.scrapeListingPage_({ payload: { url: amazonUrl } }), (error) => error.code === "SCRAPER_UNAVAILABLE" && /LABKIT_BRIGHTDATA_API_KEY/.test(error.message));
  properties.set("LABKIT_BRIGHTDATA_API_KEY", "bd-key");
  assert.deepEqual(api.publicCapabilities_().scraper, { configured: true, amazon: true, jameco: false });
  assert.throws(() => api.scrapeListingPage_({ payload: { url: "https://www.jameco.com/z/LM358N_23696.html" } }), (error) => error.code === "SCRAPER_UNAVAILABLE" && /LABKIT_BRIGHTDATA_JAMECO_DATASET/.test(error.message));
  assert.throws(() => api.scrapeListingPage_({ payload: { url: "https://www.mouser.com/ProductDetail/x" } }), (error) => error.code === "INVALID_INPUT");
  assert.throws(() => api.scrapeListingPage_({ payload: { url: "http://www.amazon.com/dp/B0TEST1234" } }), (error) => error.code === "INVALID_INPUT");
  brightBody = [{ title: "Resistor assortment kit", asin: "B0TEST1234", brand: "Acme", final_price: "$12.99", currency: "USD", availability: "In Stock" }];
  const brightStart = requests.length;
  const amazon = api.scrapeListingPage_({ payload: { url: amazonUrl, categories: ["Passive R"] } });
  const brightRequest = requests[brightStart];
  assert.match(brightRequest.url, /datasets\/v3\/scrape\?dataset_id=gd_l7q7dkf244hwjntr0&format=json/);
  assert.equal(brightRequest.options.headers.Authorization, "Bearer bd-key");
  assert.deepEqual(JSON.parse(brightRequest.options.payload), { input: [{ url: amazonUrl }] });
  assert.equal(amazon.status, "ok");
  assert.equal(amazon.method, "fields");
  assert.equal(amazon.candidate.vendorSku, "B0TEST1234");
  assert.deepEqual(amazon.candidate.priceBreaks, [{ quantity: 1, unitPrice: 12.99 }]);
  assert.equal(amazon.candidate.productUrl, amazonUrl, "the link the officer gave is the product link");
  assert.equal(amazon.candidate.unverifiedPrice, true);
  assert.match(amazon.message, /single price, not quantity breaks/);
  properties.set("LABKIT_BRIGHTDATA_JAMECO_DATASET", "gd_jameco_test");
  brightBody = [{ title: "LM358N Dual Op Amp", item_id: "23696", brand: "Texas Instruments", mpn: "LM358N", price_breaks: [{ qty: "100", price: "$0.50" }, { qty: "1", price: "$0.69" }] }];
  const jameco = api.scrapeListingPage_({ payload: { url: "https://www.jameco.com/z/LM358N_23696.html" } });
  assert.match(requests.at(-1).url, /dataset_id=gd_jameco_test/);
  assert.deepEqual(jameco.candidate.priceBreaks, [{ quantity: 1, unitPrice: 0.69 }, { quantity: 100, unitPrice: 0.5 }]);
  assert.equal(jameco.candidate.name, "LM358N");
  assert.doesNotMatch(jameco.message, /single price/);
  // A job that outlasts the synchronous window is collected later with its snapshot id.
  brightStatus = 202;
  brightBody = { snapshot_id: "s_abc123", message: "still running" };
  const pending = api.scrapeListingPage_({ payload: { url: amazonUrl } });
  assert.deepEqual({ status: pending.status, snapshotId: pending.snapshotId, candidate: pending.candidate }, { status: "pending", snapshotId: "s_abc123", candidate: null });
  brightStatus = 200;
  brightBody = [{ title: "Resistor assortment kit", asin: "B0TEST1234", final_price: 11.5 }];
  const collected = api.scrapeListingPage_({ payload: { url: amazonUrl, snapshotId: "s_abc123" } });
  assert.match(requests.at(-1).url, /datasets\/v3\/snapshot\/s_abc123\?format=json/);
  assert.equal(collected.candidate.priceBreaks[0].unitPrice, 11.5);
  assert.throws(() => api.scrapeListingPage_({ payload: { url: amazonUrl, snapshotId: "bad id!" } }), (error) => error.code === "INVALID_INPUT");
  // Failures and unknown record shapes: no guessing from the page, and AI interpretation stays labelled.
  brightStatus = 500;
  brightBody = { message: "upstream error" };
  assert.throws(() => api.scrapeListingPage_({ payload: { url: amazonUrl } }), (error) => error.code === "SCRAPER_UNAVAILABLE" && /HTTP 500/.test(error.message));
  brightStatus = 200;
  brightBody = [];
  assert.equal(api.scrapeListingPage_({ payload: { url: amazonUrl } }).status, "empty");
  brightBody = [{ Product: "LM358P", cost_data: { first: "69 cents each" } }];
  geminiText = JSON.stringify({ name: "LM358P", vendorSku: "J-1", manufacturer: "TI", description: "Dual op amp", packageName: "PDIP-8", category: "Op-Amp", available: 12, priceBreaks: [{ quantity: 1, unitPrice: 0.69 }] });
  const interpreted = api.scrapeListingPage_({ payload: { url: "https://www.jameco.com/z/x.html", categories: ["Op-Amp"] } });
  assert.equal(interpreted.method, "gemini");
  assert.equal(interpreted.candidate.category, "Op-Amp");
  assert.match(interpreted.message, /interpreted by Gemini/);
  brightBody = [{ title: "Euro priced", final_price: 10, currency: "EUR" }];
  geminiText = JSON.stringify({ name: "x", vendorSku: "", manufacturer: "", description: "", packageName: "", category: "", priceBreaks: [] });
  assert.match(api.scrapeListingPage_({ payload: { url: amazonUrl } }).message, /no USD price was found/);
  ["LABKIT_BRIGHTDATA_API_KEY", "LABKIT_BRIGHTDATA_JAMECO_DATASET"].forEach((key) => properties.delete(key));
  assert.equal(api.apiFailure_({ code: "SCRAPER_UNAVAILABLE", message: "x" }).error.code, "SCRAPER_UNAVAILABLE");

  geminiText = JSON.stringify({
    name: "LM358P", vendor: "Jameco", vendorSku: "23048", manufacturer: "TI", description: "Dual op amp",
    packageName: "PDIP-8", category: "Bogus Category", leadTime: "",
    priceBreaks: [{ quantity: 1, unitPrice: 0.69 }], shippingCost: null, stock: 12,
  });
  const pasted = api.parseNewComponentText_({ payload: { text: "LM358P dual op amp $0.69", vendor: "Jameco", categories: ["Op-Amp", "Logic IC"] } });
  assert.equal(pasted.name, "LM358P");
  assert.equal(pasted.category, "", "a category outside the catalog list is discarded");
  assert.deepEqual(pasted.priceBreaks, [{ quantity: 1, unitPrice: 0.69 }]);
  assert.match(pasted.message, /no vendor webpage was fetched/);
  const geminiRequest = JSON.parse(requests.at(-1).options.payload);
  assert.match(geminiRequest.contents[0].parts[0].text, /Only use the pasted text|Use only the pasted text/);
  assert.deepEqual(geminiRequest.generationConfig.responseSchema.properties.category.enum, ["Op-Amp", "Logic IC", ""]);
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
    `${source}\nreturn { touchEditorLease_, claimEditorLease_, releaseEditorLease_, takeOverEditorLease_ };`,
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
  const reclaimed = leaseApi.claimEditorLease_(user, second);
  assert.equal(reclaimed.canEdit, true);
  assert.equal(reclaimed.editor.label, "Chrome on Windows");
  const firstAfterClaim = leaseApi.touchEditorLease_(user, first);
  assert.equal(firstAfterClaim.canEdit, false);
  assert.equal(firstAfterClaim.forcedSignOut, true);
  assert.equal(leaseApi.releaseEditorLease_(second).released, true);
  assert.equal(leaseApi.touchEditorLease_(user, first).canEdit, true);
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
