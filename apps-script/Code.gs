/**
 * LabKit Manager - Google Apps Script backend
 *
 * This file is copied into the Apps Script project bound to the private
 * LabKit spreadsheet. It intentionally contains no service-account key.
 */

const LABKIT_CONFIG = Object.freeze({
  appName: "LabKit Manager",
  accountEmail: "HKNLabSuppliesGatech@gmail.com",
  stateKey: "main",
  stateChunkSize: 40000,
  maxSnapshotCharacters: 4500000,
  editorLeaseProperty: "LABKIT_EDITOR_LEASE",
  editorLeaseMilliseconds: 90000,
  properties: Object.freeze({
    spreadsheetId: "LABKIT_SPREADSHEET_ID",
    firebaseApiKey: "LABKIT_FIREBASE_API_KEY",
    geminiApiKey: "LABKIT_GEMINI_API_KEY",
    geminiModel: "LABKIT_GEMINI_MODEL",
    mouserApiKey: "LABKIT_MOUSER_API_KEY",
    newarkApiKey: "LABKIT_NEWARK_API_KEY",
    digikeyClientId: "LABKIT_DIGIKEY_CLIENT_ID",
    digikeyClientSecret: "LABKIT_DIGIKEY_CLIENT_SECRET",
    digikeyAccountId: "LABKIT_DIGIKEY_ACCOUNT_ID",
  }),
});

const LABKIT_SCHEMAS = Object.freeze({
  Components: Object.freeze([
    "id", "part_number", "name", "category", "manufacturer", "package",
    "description", "active", "unit_cost", "stock_quantity", "vendor_sku",
    "specs_json", "note", "datasheet_url", "updated_at", "version",
  ]),
  Kits: Object.freeze([
    "id", "code", "name", "kind", "favorite", "active", "spring_2026_json",
    "series_key", "updated_at", "version",
  ]),
  KitItems: Object.freeze([
    "id", "kit_id", "component_id", "quantity", "updated_at", "version",
  ]),
  KitItemRequirements: Object.freeze([
    "id", "kit_id", "component_id", "note", "updated_at", "version",
  ]),
  KitVersions: Object.freeze([
    "id", "kit_id", "version_number", "label", "effective_from", "effective_to",
    "items_json", "source", "created_at", "updated_at", "version",
  ]),
  KitLineupVersions: Object.freeze([
    "id", "version_number", "label", "kit_ids_json", "source", "created_at",
    "updated_at", "version",
  ]),
  SemesterKitVersions: Object.freeze([
    "id", "semester_id", "kit_id", "kit_version_id", "updated_at", "version",
  ]),
  Semesters: Object.freeze([
    "id", "label", "season", "year", "status", "forecast_units", "actual_units",
    "factor", "class_counts_json", "kit_sales_json", "rates_json",
    "individual_sales_json", "actual_pending", "kit_offerings_json",
    "sale_prices_json", "lineup_version_id", "updated_at", "version",
  ]),
  SalesSummary: Object.freeze([
    "semester_id", "label", "transaction_count", "credit_card_fee_count",
    "as_of", "sales_report_json", "updated_at", "version",
  ]),
  SemesterKits: Object.freeze([
    "id", "semester_id", "kit_id", "sold", "on_hand", "faulty", "to_purchase",
    "forecast_override", "offered", "sale_price", "revenue", "estimated_profit",
    "updated_at", "version",
  ]),
  Inventory: Object.freeze([
    "id", "component_id", "quantity", "location", "counted_at", "updated_at", "version",
  ]),
  PackedKitInventory: Object.freeze([
    "id", "kit_id", "quantity", "reserved", "faulty", "location", "counted_at",
    "note", "updated_at", "version", "prepared", "sold", "basis_semester_id",
  ]),
  VendorQuotes: Object.freeze([
    "id", "component_id", "vendor", "vendor_sku", "quantity_break", "unit_price",
    "quoted_at", "expires_at", "created_by", "version",
  ]),
  Orders: Object.freeze([
    "id", "order_number", "vendor", "date", "status", "receipt_url", "created_by",
    "created_at", "semester_ids_json", "updated_at", "version", "notes",
  ]),
  OrderLines: Object.freeze([
    "id", "order_id", "component_id", "quantity", "unit_price",
    "semester_ids_json", "updated_at", "version",
  ]),
  Alternatives: Object.freeze([
    "id", "component_id", "part_number", "manufacturer", "package", "match",
    "match_label", "note", "unit_price_label", "vendor", "created_at", "version",
  ]),
  Users: Object.freeze([
    "uid", "email", "display_name", "role", "active", "created_at", "last_seen_at",
  ]),
  AuditLog: Object.freeze([
    "timestamp", "request_id", "email", "action", "entity", "entity_id",
    "before_json", "after_json",
  ]),
  ChangeHistory: Object.freeze([
    "id", "timestamp", "action", "entity", "entity_id", "summary", "before_json",
    "after_json", "undone_at", "updated_at", "version",
  ]),
  AppState: Object.freeze([
    "state_key", "chunk_index", "value_chunk", "version", "updated_at", "updated_by",
  ]),
});

/** Serves the bundled LabKit frontend from this Apps Script project. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle(LABKIT_CONFIG.appName)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Run this once from the Apps Script editor after adding the two Script
 * Properties described in apps-script/README.md.
 */
function initializeLabKit() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(LABKIT_SCHEMAS).forEach(function (sheetName) {
    ensureSheet_(spreadsheet, sheetName, LABKIT_SCHEMAS[sheetName]);
  });

  const adminEmail = normalizeEmail_(LABKIT_CONFIG.accountEmail);
  if (!isEmail_(adminEmail)) {
    throw appError_(
      "CONFIG_ERROR",
      "The configured LabKit account email is invalid."
    );
  }
  seedInitialAdmin_(spreadsheet, adminEmail);

  SpreadsheetApp.flush();
  return {
    ok: true,
    spreadsheetName: spreadsheet.getName(),
    spreadsheetId: spreadsheet.getId(),
    sheetsReady: Object.keys(LABKIT_SCHEMAS).length,
    initialAdminEmail: adminEmail,
    message: "LabKit sheets are ready. Confirm the Users row before deploying.",
  };
}

/**
 * The single browser-callable API entry point. Client code sends:
 * { action, idToken, requestId?, payload? }
 */
function apiRequest(request) {
  try {
    const input = requirePlainObject_(request, "request");
    const action = requireString_(input.action, "action", 64);
    const identity = verifyFirebaseIdToken_(input.idToken);
    const user = authorizeUser_(identity);

    switch (action) {
      case "health":
        return apiSuccess_({
          appName: LABKIT_CONFIG.appName,
          spreadsheetName: getSpreadsheet_().getName(),
          user: publicUser_(user),
        });
      case "bootstrap": {
        const access = touchEditorLease_(user, input);
        return apiSuccess_({
          user: publicUser_(user),
          state: readState_(),
          access: access,
        });
      }
      case "syncSession":
        return apiSuccess_(syncSession_(user, input));
      case "releaseSession":
        return apiSuccess_(releaseEditorLease_(input));
      case "takeOverSession":
        requireRole_(user, ["admin"]);
        return apiSuccess_(takeOverEditorLease_(user, input));
      case "saveSnapshot":
        requireRole_(user, ["admin"]);
        return apiSuccess_(saveSnapshot_(user, input));
      case "suggestSemester":
        requireRole_(user, ["admin"]);
        renewRequiredEditorLease_(user, requireSessionId_(input.sessionId), input.sessionLabel);
        return apiSuccess_(suggestSemester_(input));
      case "refreshSupplierQuotes":
        requireRole_(user, ["admin"]);
        renewRequiredEditorLease_(user, requireSessionId_(input.sessionId), input.sessionLabel);
        return apiSuccess_(refreshSupplierQuotes_(input));
      default:
        throw appError_("UNKNOWN_ACTION", "That LabKit action is not supported.");
    }
  } catch (error) {
    console.error("LabKit API error", error && error.stack ? error.stack : error);
    return apiFailure_(error);
  }
}

function saveSnapshot_(user, input) {
  const requestId = requireRequestId_(input.requestId);
  const sessionId = requireSessionId_(input.sessionId);
  const payload = requirePlainObject_(input.payload, "payload");
  const snapshot = validateSnapshot_(payload.snapshot);
  const expectedVersion = parseNonnegativeInteger_(
    payload.expectedVersion,
    "expectedVersion"
  );

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    renewRequiredEditorLease_(user, sessionId, input.sessionLabel);
    const duplicate = findAuditRequest_(requestId);
    if (duplicate) {
      return {
        version: duplicate.version,
        duplicate: true,
      };
    }

    const current = readState_();
    const currentVersion = current ? current.version : 0;
    if (expectedVersion !== currentVersion) {
      throw appError_(
        "VERSION_CONFLICT",
        "The inventory changed in another session. Reload before saving.",
        { currentVersion: currentVersion }
      );
    }

    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();
    writeState_(snapshot, nextVersion, now, user.email);
    syncSnapshotToTables_(snapshot, nextVersion, now, user.email);
    appendAudit_({
      requestId: requestId,
      email: user.email,
      action: "saveSnapshot",
      entity: "AppState",
      entityId: LABKIT_CONFIG.stateKey,
      before: { version: currentVersion },
      after: {
        version: nextVersion,
        catalogCount: snapshot.catalog.length,
        kitCount: snapshot.kits.length,
        semesterCount: snapshot.terms.length,
        orderCount: snapshot.orders.length,
      },
    });
    SpreadsheetApp.flush();

    return {
      version: nextVersion,
      updatedAt: now,
      duplicate: false,
    };
  } finally {
    lock.releaseLock();
  }
}

function suggestSemester_(input) {
  const payload = requirePlainObject_(input.payload, "payload");
  const season = requireString_(payload.season, "season", 16);
  if (["Spring", "Summer", "Fall"].indexOf(season) === -1) {
    throw appError_("INVALID_INPUT", "season must be Spring, Summer, or Fall.");
  }
  const year = parseNonnegativeInteger_(payload.year, "year");
  if (year < 2026 || year > 2100) {
    throw appError_("INVALID_INPUT", "year must be between 2026 and 2100.");
  }
  const officerNotes = String(payload.notes || "").trim().slice(0, 2000);
  const state = readState_();
  if (!state || !state.snapshot) {
    throw appError_("NOT_INITIALIZED", "Save the initial LabKit data before requesting a suggestion.");
  }
  const snapshot = state.snapshot;
  const terms = arrayOrEmpty_(snapshot.terms);
  const kits = arrayOrEmpty_(snapshot.kits);
  const baselines = kits.map(function (kit) {
    const matching = terms.filter(function (term) {
      return term.season === season && term.actualPending !== true;
    }).sort(function (a, b) { return Number(b.year) - Number(a.year); }).slice(0, 3);
    const values = matching.map(function (term) {
      if (kit.seriesKey) return numberOrZero_(term.items && term.items[kit.seriesKey]);
      return numberOrZero_(term.kits && term.kits[kit.code]);
    });
    let weighted = 0;
    let weightTotal = 0;
    values.forEach(function (value, index) {
      const weight = values.length - index;
      weighted += value * weight;
      weightTotal += weight;
    });
    const fallback = numberOrZero_(kit.sp26 && kit.sp26.sold);
    return {
      kitId: String(kit.id),
      code: String(kit.code || kit.id),
      name: String(kit.name || ""),
      units: Math.max(0, Math.round(weightTotal ? weighted / weightTotal : fallback)),
      history: matching.map(function (term, index) {
        return { term: String(term.label || term.id), units: values[index] };
      }),
    };
  });
  const next = nextPlanningSemester_(new Date());
  const inventoryEligible = next.season === season && next.year === year;
  const fallback = {
    season: season,
    year: year,
    inventoryEligible: inventoryEligible,
    inventoryRule: inventoryEligible
      ? "Current component and packed-kit inventory may be allocated to this next semester."
      : "Current inventory is not allocated because this is not the immediately next semester.",
    source: "deterministic",
    aiStatus: "not_configured",
    aiMessage: "Gemini is not configured; weighted same-season history was used.",
    suggestions: baselines.map(function (item) {
      return {
        kitId: item.kitId,
        units: item.units,
        confidence: item.history.length >= 2 ? "medium" : "low",
        reason: item.history.length
          ? "Weighted average of " + item.history.map(function (point) { return point.term; }).join(", ") + "."
          : "No matching seasonal history; current kit baseline used.",
      };
    }),
  };

  if (!getOptionalProperty_(LABKIT_CONFIG.properties.geminiApiKey)) return fallback;

  const prompt = [
    "You are assisting a nonprofit university lab-kit manager.",
    "Recommend demand quantities for " + season + " " + year + ".",
    "Treat the deterministic baseline as the anchor. Do not change any kit ID, invent kits, prices, suppliers, or inventory counts.",
    "Use only the supplied history and officer notes. Prefer conservative integer quantities and explain material changes from baseline.",
    "Officer notes: " + (officerNotes || "None supplied."),
    "Baselines and history: " + JSON.stringify(baselines),
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kitId: { type: "string" },
            units: { type: "integer", minimum: 0, maximum: 100000 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            reason: { type: "string" },
          },
          required: ["kitId", "units", "confidence", "reason"],
        },
      },
    },
    required: ["suggestions"],
  };
  try {
    const result = callGeminiJson_(prompt, schema);
    const known = {};
    baselines.forEach(function (item) { known[item.kitId] = item; });
    const proposed = {};
    arrayOrEmpty_(result && result.suggestions).forEach(function (item) {
      const kitId = String(item.kitId || "");
      const units = Number(item.units);
      if (known[kitId] && Number.isInteger(units) && units >= 0 && units <= 100000) {
        proposed[kitId] = {
          kitId: kitId,
          units: units,
          confidence: ["low", "medium", "high"].indexOf(item.confidence) >= 0 ? item.confidence : "low",
          reason: String(item.reason || "Gemini reviewed the historical baseline.").slice(0, 500),
        };
      }
    });
    fallback.suggestions = baselines.map(function (item) {
      return proposed[item.kitId] || fallback.suggestions.find(function (entry) {
        return entry.kitId === item.kitId;
      });
    });
    fallback.source = "gemini-reviewed";
    fallback.aiStatus = "ready";
    fallback.aiMessage = "Gemini reviewed the deterministic forecast. Review every quantity before creating the semester.";
  } catch (error) {
    fallback.aiStatus = "unavailable";
    fallback.aiMessage = "Gemini was unavailable, so the safe historical baseline is shown instead.";
  }
  return fallback;
}

function refreshSupplierQuotes_(input) {
  const payload = requirePlainObject_(input.payload, "payload");
  const componentId = requireString_(payload.componentId, "componentId", 128);
  const quantity = Math.max(1, parseNonnegativeInteger_(payload.quantity, "quantity"));
  const state = readState_();
  if (!state || !state.snapshot) {
    throw appError_("NOT_INITIALIZED", "Save the initial LabKit data before requesting supplier quotes.");
  }
  const snapshot = state.snapshot;
  const component = arrayOrEmpty_(snapshot.catalog).find(function (item) {
    return String(item.id) === componentId;
  });
  if (!component) throw appError_("INVALID_INPUT", "The selected component no longer exists.");

  const requirements = [];
  if (String(component.note || "").trim()) {
    requirements.push({ scope: "catalog", note: String(component.note).trim().slice(0, 500) });
  }
  const requirementSources = arrayOrEmpty_(snapshot.kitVersions).length
    ? arrayOrEmpty_(snapshot.kitVersions).map(function (versionRecord) {
      const kit = arrayOrEmpty_(snapshot.kits).find(function (candidate) {
        return String(candidate.id) === String(versionRecord.kitId);
      }) || {};
      return {
        scope: String(kit.code || versionRecord.kitId) + " v" + String(versionRecord.number || ""),
        items: versionRecord.items,
      };
    })
    : arrayOrEmpty_(snapshot.kits).map(function (kit) {
      return { scope: String(kit.code || kit.id), items: kit.items };
    });
  requirementSources.forEach(function (source) {
    const entry = arrayOrEmpty_(source.items).find(function (item) {
      return String(item.p) === componentId;
    });
    if (entry && String(entry.note || "").trim()) {
      requirements.push({
        scope: source.scope,
        note: String(entry.note).trim().slice(0, 500),
      });
    }
  });

  let quotes = [];
  const providerMessages = [];
  if (getOptionalProperty_(LABKIT_CONFIG.properties.mouserApiKey)) {
    try {
      quotes = quotes.concat(fetchMouserQuotes_(component, quantity));
    } catch (error) {
      providerMessages.push("Mouser lookup failed: " + safeProviderMessage_(error));
    }
  } else {
    providerMessages.push("Mouser API key is not configured.");
  }
  if (getOptionalProperty_(LABKIT_CONFIG.properties.digikeyClientId)
      && getOptionalProperty_(LABKIT_CONFIG.properties.digikeyClientSecret)
      && getOptionalProperty_(LABKIT_CONFIG.properties.digikeyAccountId)) {
    try {
      quotes = quotes.concat(fetchDigiKeyQuotes_(component, quantity));
    } catch (error) {
      providerMessages.push("DigiKey lookup failed: " + safeProviderMessage_(error));
    }
  } else {
    providerMessages.push("DigiKey credentials or account ID are not configured.");
  }
  if (getOptionalProperty_(LABKIT_CONFIG.properties.newarkApiKey)) {
    try {
      quotes = quotes.concat(fetchNewarkQuotes_(component, quantity));
    } catch (error) {
      providerMessages.push("Newark lookup failed: " + safeProviderMessage_(error));
    }
  } else {
    providerMessages.push("Newark API key is not configured.");
  }
  if (!quotes.length) {
    throw appError_(
      "SUPPLIER_UNAVAILABLE",
      "No verified supplier quote was returned. " + providerMessages.join(" ")
    );
  }

  let aiStatus = requirements.length ? "not_configured" : "not_needed";
  let aiMessage = requirements.length
    ? "Requirements are shown for manual review because Gemini is not configured."
    : "No kit-specific requirements were recorded for this component.";
  if (requirements.length && getOptionalProperty_(LABKIT_CONFIG.properties.geminiApiKey)) {
    try {
      const evaluations = evaluateSupplierCandidates_(component, requirements, quotes);
      const byKey = {};
      arrayOrEmpty_(evaluations).forEach(function (evaluation) {
        byKey[String(evaluation.quoteId || "")] = evaluation;
      });
      quotes = quotes.map(function (quote) {
        const evaluation = byKey[quote.id];
        return Object.assign({}, quote, {
          meetsRequirements: evaluation ? evaluation.meetsRequirements === true : null,
          requirementScore: evaluation ? Math.max(0, Math.min(100, Number(evaluation.score) || 0)) : null,
          requirementReason: evaluation
            ? String(evaluation.reason || "").slice(0, 500)
            : "Gemini did not return an evaluation for this quote; manual review is required.",
        });
      });
      aiStatus = "ready";
      aiMessage = "Gemini compared supplier descriptions with every recorded kit requirement. Manual approval is still required.";
    } catch (error) {
      aiStatus = "unavailable";
      aiMessage = "Gemini could not review requirements. Quotes remain available for manual review.";
    }
  }
  quotes = quotes.map(function (quote) {
    return Object.assign({}, quote, {
      requirementsCount: requirements.length,
      requirementsPending: requirements.length > 0 && quote.meetsRequirements !== true,
    });
  });
  quotes.sort(function (a, b) {
    const aRejected = a.meetsRequirements === false ? 1 : 0;
    const bRejected = b.meetsRequirements === false ? 1 : 0;
    return (aRejected - bRejected) || (Number(a.extended) - Number(b.extended));
  });
  return {
    componentId: componentId,
    quantity: quantity,
    requirements: requirements,
    quotes: quotes,
    aiStatus: aiStatus,
    aiMessage: aiMessage,
    providerMessages: providerMessages,
    checkedAt: new Date().toISOString(),
  };
}

function nextPlanningSemester_(date) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month <= 4) return { season: "Summer", year: year };
  if (month <= 7) return { season: "Fall", year: year };
  return { season: "Spring", year: year + 1 };
}

function fetchMouserQuotes_(component, quantity) {
  const apiKey = getRequiredProperty_(LABKIT_CONFIG.properties.mouserApiKey);
  const url = "https://api.mouser.com/api/v1/search/partnumber?apiKey=" + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      SearchByPartRequest: {
        mouserPartNumber: String(component.name || component.id),
        partSearchOptions: "None",
      },
    }),
    muteHttpExceptions: true,
  });
  let body = parseProviderResponse_(response, "Mouser");
  let parts = body && body.SearchResults ? arrayOrEmpty_(body.SearchResults.Parts) : [];
  if (!parts.length) {
    const keywordUrl = "https://api.mouser.com/api/v1/search/keyword?apiKey=" + encodeURIComponent(apiKey);
    const keywordResponse = UrlFetchApp.fetch(keywordUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        SearchByKeywordRequest: {
          keyword: String(component.name || component.id),
          records: 12,
          startingRecord: 0,
          searchOptions: "None",
          searchWithYourSignUpLanguage: "",
        },
      }),
      muteHttpExceptions: true,
    });
    body = parseProviderResponse_(keywordResponse, "Mouser");
    parts = body && body.SearchResults ? arrayOrEmpty_(body.SearchResults.Parts) : [];
  }
  const now = new Date().toISOString();
  return parts.slice(0, 12).map(function (part, index) {
    const minimum = Math.max(1, numberOrZero_(part.Min || part.MinimumOrderQuantity) || 1);
    const multiple = Math.max(1, numberOrZero_(part.Mult || part.OrderQuantityMultiples) || 1);
    const orderQuantity = Math.ceil(Math.max(quantity, minimum) / multiple) * multiple;
    const breaks = normalizePriceBreaks_(part.PriceBreaks);
    const unitPrice = priceAtQuantity_(breaks, orderQuantity);
    if (!Number.isFinite(unitPrice)) return null;
    return {
      id: "mouser:" + String(part.MouserPartNumber || index),
      componentId: String(component.id),
      vendor: "Mouser",
      vendorSku: String(part.MouserPartNumber || ""),
      manufacturerPartNumber: String(part.ManufacturerPartNumber || component.name || ""),
      manufacturer: String(part.Manufacturer || component.mfr || ""),
      description: String(part.Description || ""),
      productUrl: String(part.ProductDetailUrl || ""),
      datasheetUrl: String(part.DataSheetUrl || ""),
      requestedQuantity: quantity,
      orderQuantity: orderQuantity,
      minimumOrderQuantity: minimum,
      orderMultiple: multiple,
      available: parseAvailability_(part.Availability),
      leadTime: String(part.LeadTime || ""),
      currency: breaks.length ? breaks[0].currency : "USD",
      unitPrice: unitPrice,
      extended: unitPrice * orderQuantity,
      priceBreaks: breaks,
      checkedAt: now,
      verified: true,
      source: "Mouser Search API",
      meetsRequirements: null,
    };
  }).filter(Boolean);
}

function fetchDigiKeyQuotes_(component, quantity) {
  const clientId = getRequiredProperty_(LABKIT_CONFIG.properties.digikeyClientId);
  const accountId = getRequiredProperty_(LABKIT_CONFIG.properties.digikeyAccountId);
  const token = getDigiKeyAccessToken_();
  const productNumber = encodeURIComponent(String(component.name || component.id));
  const url = "https://api.digikey.com/products/v4/search/" + productNumber +
    "/pricingbyquantity/" + quantity;
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: "Bearer " + token,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Account-Id": accountId,
      "X-DIGIKEY-Locale-Site": "US",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "USD",
    },
    muteHttpExceptions: true,
  });
  const body = parseProviderResponse_(response, "DigiKey");
  const optionGroups = []
    .concat(arrayOrEmpty_(body.MyPricingOptions))
    .concat(arrayOrEmpty_(body.StandardPricingOptions))
    .concat(arrayOrEmpty_(body.PricingOptions));
  const now = new Date().toISOString();
  const quotes = [];
  optionGroups.forEach(function (option, optionIndex) {
    arrayOrEmpty_(option.Products).forEach(function (product, productIndex) {
      const orderQuantity = Math.max(1, numberOrZero_(product.QuantityPriced || option.TotalQuantityPriced) || quantity);
      const totalPrice = numberOrZero_(product.TotalPrice || option.TotalPrice);
      const unitPrice = numberOrZero_(product.UnitPrice) || (totalPrice > 0 ? totalPrice / orderQuantity : 0);
      if (!(unitPrice > 0)) return;
      quotes.push({
        id: "digikey:" + String(product.DigiKeyProductNumber || optionIndex + ":" + productIndex),
        componentId: String(component.id),
        vendor: "DigiKey",
        vendorSku: String(product.DigiKeyProductNumber || ""),
        manufacturerPartNumber: String(body.ManufacturerPartNumber || component.name || ""),
        manufacturer: String(body.Manufacturer && body.Manufacturer.Name || component.mfr || ""),
        description: String(body.Description && (body.Description.ProductDescription || body.Description.DetailedDescription) || ""),
        productUrl: String(body.ProductUrl || ""),
        datasheetUrl: "",
        requestedQuantity: quantity,
        orderQuantity: orderQuantity,
        minimumOrderQuantity: Math.max(1, numberOrZero_(product.MinimumOrderQuantity) || 1),
        orderMultiple: 1,
        available: numberOrZero_(product.QuantityAvailable),
        leadTime: "",
        currency: "USD",
        unitPrice: unitPrice,
        extended: totalPrice > 0 ? totalPrice : unitPrice * orderQuantity,
        priceBreaks: [{ quantity: orderQuantity, unitPrice: unitPrice, currency: "USD" }],
        checkedAt: now,
        verified: true,
        source: "DigiKey Product Information API",
        meetsRequirements: null,
      });
    });
  });
  return quotes;
}

function fetchNewarkQuotes_(component, quantity) {
  const apiKey = getRequiredProperty_(LABKIT_CONFIG.properties.newarkApiKey);
  const query = [component.name, component.mfr, component.pkg]
    .map(function (value) { return String(value || "").trim(); })
    .filter(Boolean)
    .join(" ");
  const params = {
    "callInfo.responseDataFormat": "json",
    "callInfo.omitXmlSchema": "true",
    "callInfo.apiKey": apiKey,
    "storeInfo.id": "www.newark.com",
    term: "any:" + (query || String(component.id)),
    "resultsSettings.offset": "0",
    "resultsSettings.numberOfResults": "12",
    "resultsSettings.refinements.filters": "inStock",
    "resultsSettings.responseGroup": "large",
  };
  const url = "https://api.element14.com/catalog/products?" + Object.keys(params)
    .map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    })
    .join("&");
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
  });
  const body = parseProviderResponse_(response, "Newark");
  const searchResult = body.keywordSearchReturn
    || body.manufacturerPartNumberSearchReturn
    || body.productSearchReturn
    || {};
  const parts = arrayOrEmpty_(searchResult.products);
  const now = new Date().toISOString();
  return parts.slice(0, 12).map(function (part, index) {
    const minimum = Math.max(1, numberOrZero_(
      part.translatedMinimumOrderQuantity
      || part.translatedMinimumOrderQuality
      || part.minimumOrderQuantity
    ) || 1);
    const multiple = Math.max(1, numberOrZero_(part.orderMultiples) || 1);
    const orderQuantity = Math.ceil(Math.max(quantity, minimum) / multiple) * multiple;
    const priceEntries = Array.isArray(part.prices)
      ? part.prices
      : (part.prices ? [part.prices] : []);
    const breaks = priceEntries.map(function (entry) {
      return {
        quantity: Math.max(1, numberOrZero_(entry.from || entry.From) || 1),
        unitPrice: Number(entry.cost !== undefined ? entry.cost : entry.Cost),
        currency: String(entry.currency || entry.Currency || "USD"),
      };
    }).filter(function (entry) {
      return Number.isFinite(entry.unitPrice) && entry.unitPrice >= 0;
    }).sort(function (a, b) { return a.quantity - b.quantity; });
    const unitPrice = priceAtQuantity_(breaks, orderQuantity);
    if (!Number.isFinite(unitPrice)) return null;
    const stock = isPlainObject_(part.stock) ? part.stock : {};
    const datasheets = arrayOrEmpty_(part.datasheets);
    return {
      id: "newark:" + String(part.sku || index),
      componentId: String(component.id),
      vendor: "Newark",
      vendorSku: String(part.sku || ""),
      manufacturerPartNumber: String(
        part.translatedManufacturerPartNumber
        || part.manufacturerPartNumber
        || component.name
        || ""
      ),
      manufacturer: String(part.brandName || part.manufacturerName || component.mfr || ""),
      description: String(part.displayName || part.productOverview && part.productOverview.description || ""),
      productUrl: String(part.productURL || part.productUrl || ""),
      datasheetUrl: datasheets.length ? String(datasheets[0].url || "") : "",
      requestedQuantity: quantity,
      orderQuantity: orderQuantity,
      minimumOrderQuantity: minimum,
      orderMultiple: multiple,
      available: numberOrZero_(stock.level || part.stockLevel || part.inventory),
      leadTime: stock.leastLeadTime
        ? String(stock.leastLeadTime) + " days"
        : String(part.leadTime || ""),
      currency: breaks.length ? breaks[0].currency : "USD",
      unitPrice: unitPrice,
      extended: unitPrice * orderQuantity,
      priceBreaks: breaks,
      checkedAt: now,
      verified: true,
      domestic: true,
      source: "Newark Product Search API",
      meetsRequirements: null,
    };
  }).filter(Boolean);
}

function getDigiKeyAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("labkit:digikey-token");
  if (cached) return cached;
  const response = UrlFetchApp.fetch("https://api.digikey.com/v1/oauth2/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      client_id: getRequiredProperty_(LABKIT_CONFIG.properties.digikeyClientId),
      client_secret: getRequiredProperty_(LABKIT_CONFIG.properties.digikeyClientSecret),
      grant_type: "client_credentials",
    },
    muteHttpExceptions: true,
  });
  const body = parseProviderResponse_(response, "DigiKey OAuth");
  if (!body.access_token) throw new Error("DigiKey did not return an access token.");
  const ttl = Math.max(60, Math.min(540, numberOrZero_(body.expires_in) - 30));
  cache.put("labkit:digikey-token", String(body.access_token), ttl);
  return String(body.access_token);
}

function evaluateSupplierCandidates_(component, requirements, quotes) {
  const prompt = [
    "You are checking electronic component supplier candidates against explicit lab-kit requirements.",
    "Do not infer price, stock, or unstated electrical specifications. Reject a candidate only when the supplied text conflicts with a requirement.",
    "If evidence is insufficient, set meetsRequirements false and explain what must be checked manually.",
    "Component: " + JSON.stringify({ id: component.id, name: component.name, manufacturer: component.mfr, package: component.pkg, specs: component.specs }),
    "Requirements: " + JSON.stringify(requirements),
    "Supplier candidates: " + JSON.stringify(quotes.map(function (quote) {
      return {
        quoteId: quote.id,
        manufacturerPartNumber: quote.manufacturerPartNumber,
        manufacturer: quote.manufacturer,
        description: quote.description,
      };
    })),
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      evaluations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quoteId: { type: "string" },
            meetsRequirements: { type: "boolean" },
            score: { type: "integer", minimum: 0, maximum: 100 },
            reason: { type: "string" },
          },
          required: ["quoteId", "meetsRequirements", "score", "reason"],
        },
      },
    },
    required: ["evaluations"],
  };
  const result = callGeminiJson_(prompt, schema);
  return arrayOrEmpty_(result && result.evaluations);
}

function callGeminiJson_(prompt, schema) {
  const apiKey = getRequiredProperty_(LABKIT_CONFIG.properties.geminiApiKey);
  const model = getOptionalProperty_(LABKIT_CONFIG.properties.geminiModel) || "gemini-2.5-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
    muteHttpExceptions: true,
  });
  const body = parseProviderResponse_(response, "Gemini");
  const candidates = arrayOrEmpty_(body.candidates);
  const parts = candidates.length && candidates[0].content
    ? arrayOrEmpty_(candidates[0].content.parts)
    : [];
  const text = parts.map(function (part) { return String(part.text || ""); }).join("");
  if (!text) throw new Error("Gemini returned an empty response.");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Gemini returned invalid JSON.");
  }
}

function normalizePriceBreaks_(value) {
  return arrayOrEmpty_(value).map(function (entry) {
    const quantity = Math.max(1, numberOrZero_(entry.Quantity || entry.quantity) || 1);
    const priceText = String(entry.Price || entry.UnitPrice || entry.price || "");
    const unitPrice = Number(priceText.replace(/[^0-9.\-]/g, ""));
    return {
      quantity: quantity,
      unitPrice: unitPrice,
      currency: String(entry.Currency || entry.currency || "USD"),
    };
  }).filter(function (entry) {
    return Number.isFinite(entry.unitPrice) && entry.unitPrice >= 0;
  }).sort(function (a, b) { return a.quantity - b.quantity; });
}

function priceAtQuantity_(breaks, quantity) {
  let selected = null;
  breaks.forEach(function (entry) {
    if (entry.quantity <= quantity) selected = entry;
  });
  return selected ? Number(selected.unitPrice) : NaN;
}

function parseAvailability_(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function parseProviderResponse_(response, provider) {
  const status = response.getResponseCode();
  let body;
  try { body = JSON.parse(response.getContentText()); } catch (error) {
    throw new Error(provider + " returned an unreadable response (HTTP " + status + ").");
  }
  if (status < 200 || status >= 300) {
    const message = body && (body.Message || body.message || body.detail || body.error && body.error.message);
    throw new Error(provider + " returned HTTP " + status + (message ? ": " + message : "."));
  }
  return body;
}

function safeProviderMessage_(error) {
  return String(error && error.message || "provider unavailable").slice(0, 300);
}

function syncSession_(user, input) {
  const access = touchEditorLease_(user, input);
  const payload = isPlainObject_(input.payload) ? input.payload : {};
  const knownVersion = parseNonnegativeInteger_(
    payload.knownVersion === undefined ? 0 : payload.knownVersion,
    "knownVersion"
  );
  const currentVersion = readStateVersion_();
  const state = currentVersion !== knownVersion ? readState_() : null;
  return {
    access: access,
    state: state,
    version: currentVersion,
  };
}

function touchEditorLease_(user, input) {
  const sessionId = requireSessionId_(input.sessionId);
  const label = optionalSessionLabel_(input.sessionLabel);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = Date.now();
    const current = readEditorLease_();
    if (isActiveEditorLease_(current, now) && current.sessionId !== sessionId) {
      return publicEditorAccess_(current, sessionId, now);
    }

    const lease = {
      sessionId: sessionId,
      label: label,
      email: user.email,
      acquiredAt: current && current.sessionId === sessionId
        ? current.acquiredAt
        : new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + LABKIT_CONFIG.editorLeaseMilliseconds).toISOString(),
    };
    writeEditorLease_(lease);
    return publicEditorAccess_(lease, sessionId, now);
  } finally {
    lock.releaseLock();
  }
}

function renewRequiredEditorLease_(user, sessionId, sessionLabel) {
  const now = Date.now();
  const lease = readEditorLease_();
  if (!isActiveEditorLease_(lease, now) || lease.sessionId !== sessionId) {
    throw appError_(
      "EDITOR_LOCKED",
      "Another LabKit session is editing. This session is view-only until that editor signs out.",
      { access: publicEditorAccess_(lease, sessionId, now) }
    );
  }
  lease.email = user.email;
  lease.label = optionalSessionLabel_(sessionLabel);
  lease.lastSeenAt = new Date(now).toISOString();
  lease.expiresAt = new Date(now + LABKIT_CONFIG.editorLeaseMilliseconds).toISOString();
  writeEditorLease_(lease);
}

function releaseEditorLease_(input) {
  const sessionId = requireSessionId_(input.sessionId);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lease = readEditorLease_();
    if (lease && lease.sessionId === sessionId) {
      PropertiesService.getScriptProperties().deleteProperty(
        LABKIT_CONFIG.editorLeaseProperty
      );
      return { released: true };
    }
    return { released: false };
  } finally {
    lock.releaseLock();
  }
}

function takeOverEditorLease_(user, input) {
  const sessionId = requireSessionId_(input.sessionId);
  const label = optionalSessionLabel_(input.sessionLabel);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = Date.now();
    const current = readEditorLease_();
    const lease = {
      sessionId: sessionId,
      label: label,
      email: user.email,
      acquiredAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + LABKIT_CONFIG.editorLeaseMilliseconds).toISOString(),
      displacedSessionId: current && current.sessionId !== sessionId
        ? current.sessionId
        : "",
      takeoverAt: new Date(now).toISOString(),
    };
    writeEditorLease_(lease);
    return { access: publicEditorAccess_(lease, sessionId, now) };
  } finally {
    lock.releaseLock();
  }
}

function readEditorLease_() {
  const text = PropertiesService.getScriptProperties().getProperty(
    LABKIT_CONFIG.editorLeaseProperty
  );
  if (!text) return null;
  try {
    const lease = JSON.parse(text);
    if (!lease || typeof lease.sessionId !== "string") return null;
    return lease;
  } catch (error) {
    return null;
  }
}

function writeEditorLease_(lease) {
  PropertiesService.getScriptProperties().setProperty(
    LABKIT_CONFIG.editorLeaseProperty,
    JSON.stringify(lease)
  );
}

function isActiveEditorLease_(lease, now) {
  return Boolean(lease && Date.parse(lease.expiresAt) > now);
}

function publicEditorAccess_(lease, requestingSessionId, now) {
  const active = isActiveEditorLease_(lease, now);
  const canEdit = active && lease.sessionId === requestingSessionId;
  return {
    mode: canEdit ? "editor" : "viewer",
    canEdit: canEdit,
    forcedSignOut: Boolean(
      active
      && !canEdit
      && lease.displacedSessionId
      && lease.displacedSessionId === requestingSessionId
    ),
    editor: active ? {
      label: String(lease.label || "Another browser"),
      acquiredAt: String(lease.acquiredAt || ""),
      expiresAt: String(lease.expiresAt || ""),
    } : null,
  };
}

function requireSessionId_(value) {
  const sessionId = requireString_(value, "sessionId", 128);
  if (!/^[A-Za-z0-9._:-]{12,128}$/.test(sessionId)) {
    throw appError_("INVALID_INPUT", "sessionId has an invalid format.");
  }
  return sessionId;
}

function optionalSessionLabel_(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "Another browser";
  }
  return requireString_(String(value), "sessionLabel", 100);
}

function verifyFirebaseIdToken_(idToken) {
  const token = requireString_(idToken, "idToken", 10000);
  const cache = CacheService.getScriptCache();
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    token,
    Utilities.Charset.UTF_8
  );
  const cacheKey = "firebase:" + Utilities.base64EncodeWebSafe(digest).slice(0, 40);
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (error) { /* Verify normally. */ }
  }
  const apiKey = getRequiredProperty_(LABKIT_CONFIG.properties.firebaseApiKey);
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
    encodeURIComponent(apiKey);
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  let body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    throw appError_("AUTH_UNAVAILABLE", "Google sign-in verification is temporarily unavailable.");
  }

  if (status !== 200 || !body.users || body.users.length !== 1) {
    throw appError_("INVALID_SESSION", "Your sign-in session is invalid or expired. Sign in again.");
  }

  const account = body.users[0];
  if (account.disabled === true) {
    throw appError_("ACCOUNT_DISABLED", "This account has been disabled.");
  }
  if (account.emailVerified !== true) {
    throw appError_("EMAIL_NOT_VERIFIED", "Verify your email address before opening LabKit.");
  }
  if (!account.localId || !account.email) {
    throw appError_("INVALID_SESSION", "The Firebase account is missing required identity information.");
  }

  const identity = {
    uid: String(account.localId),
    email: normalizeEmail_(account.email),
    displayName: String(account.displayName || ""),
  };
  cache.put(cacheKey, JSON.stringify(identity), 300);
  return identity;
}

function authorizeUser_(identity) {
  const accountEmail = normalizeEmail_(LABKIT_CONFIG.accountEmail);
  if (identity.email !== accountEmail) {
    throw appError_(
      "ACCESS_RESTRICTED",
      "LabKit is restricted to the dedicated HKN Lab Supplies account."
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_("Users");
    const rows = readObjectRows_(sheet);
    const index = rows.findIndex(function (row) {
      return normalizeEmail_(row.email) === accountEmail;
    });
    const row = index >= 0 ? rows[index] : {};
    const now = new Date();
    const lastSeen = Date.parse(String(row.last_seen_at || ""));
    const shouldRefreshRow = index < 0
      || String(row.uid || "") !== identity.uid
      || normalizeEmail_(row.email) !== accountEmail
      || String(row.role || "") !== "admin"
      || row.active !== true
      || !Number.isFinite(lastSeen)
      || now.getTime() - lastSeen > 300000;
    const authorizedUser = {
      uid: identity.uid,
      email: accountEmail,
      display_name: identity.displayName || String(row.display_name || ""),
      role: "admin",
      active: true,
      created_at: String(row.created_at || now.toISOString()),
      last_seen_at: shouldRefreshRow ? now.toISOString() : String(row.last_seen_at),
    };
    // Single-account mode: a verified Firebase login matching the configured
    // address is authoritative. Reconcile the sheet to exactly that account.
    if (shouldRefreshRow) {
      replaceObjectRows_(sheet, LABKIT_SCHEMAS.Users, [authorizedUser]);
    }
    return authorizedUser;
  } finally {
    lock.releaseLock();
  }
}

function requireRole_(user, allowedRoles) {
  if (allowedRoles.indexOf(user.role) === -1) {
    throw appError_("FORBIDDEN", "Your LabKit role cannot perform that action.");
  }
}

function publicUser_(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.display_name || "",
    role: user.role,
  };
}

function seedInitialAdmin_(spreadsheet, email) {
  const sheet = spreadsheet.getSheetByName("Users");
  const rows = readObjectRows_(sheet);
  const index = rows.findIndex(function (row) {
    return normalizeEmail_(row.email) === email;
  });
  const now = new Date().toISOString();
  const existing = index >= 0 ? rows[index] : {};
  replaceObjectRows_(sheet, LABKIT_SCHEMAS.Users, [{
    uid: String(existing.uid || ""),
    email: email,
    display_name: String(existing.display_name || ""),
    role: "admin",
    active: true,
    created_at: String(existing.created_at || now),
    last_seen_at: String(existing.last_seen_at || ""),
  }]);
}

function readState_() {
  const rows = readObjectRows_(getSheet_("AppState"))
    .filter(function (row) {
      return String(row.state_key) === LABKIT_CONFIG.stateKey;
    })
    .sort(function (a, b) {
      return Number(a.chunk_index) - Number(b.chunk_index);
    });
  if (!rows.length) return null;

  const version = Number(rows[0].version);
  const text = rows.map(function (row, index) {
    if (Number(row.chunk_index) !== index || Number(row.version) !== version) {
      throw appError_("STATE_CORRUPT", "The saved LabKit state is incomplete.");
    }
    const storedChunk = String(row.value_chunk || "");
    if (storedChunk.charAt(0) !== "~") {
      throw appError_("STATE_CORRUPT", "The saved LabKit state has an invalid chunk.");
    }
    return storedChunk.slice(1);
  }).join("");

  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch (error) {
    throw appError_("STATE_CORRUPT", "The saved LabKit state cannot be read.");
  }
  return {
    version: version,
    updatedAt: String(rows[0].updated_at || ""),
    updatedBy: String(rows[0].updated_by || ""),
    snapshot: snapshot,
  };
}

function readStateVersion_() {
  const sheet = getSheet_("AppState");
  if (sheet.getLastRow() < 2) return 0;
  const headers = LABKIT_SCHEMAS.AppState;
  const stateKeyColumn = headers.indexOf("state_key") + 1;
  const versionColumn = headers.indexOf("version") + 1;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][stateKeyColumn - 1]) === LABKIT_CONFIG.stateKey) {
      return Number(values[index][versionColumn - 1]) || 0;
    }
  }
  return 0;
}

function writeState_(snapshot, version, now, email) {
  const text = JSON.stringify(snapshot);
  const rows = [];
  for (let start = 0, index = 0; start < text.length; start += LABKIT_CONFIG.stateChunkSize, index += 1) {
    rows.push({
      state_key: LABKIT_CONFIG.stateKey,
      chunk_index: index,
      // The sentinel ensures a chunk can never begin with "=" and become a
      // spreadsheet formula. readState_ removes it before parsing the JSON.
      value_chunk: "~" + text.slice(start, start + LABKIT_CONFIG.stateChunkSize),
      version: version,
      updated_at: now,
      updated_by: email,
    });
  }
  if (!rows.length) {
    rows.push({
      state_key: LABKIT_CONFIG.stateKey,
      chunk_index: 0,
      value_chunk: "~{}",
      version: version,
      updated_at: now,
      updated_by: email,
    });
  }
  replaceObjectRows_(getSheet_("AppState"), LABKIT_SCHEMAS.AppState, rows);
}

function validateSnapshot_(value) {
  const snapshot = requirePlainObject_(value, "snapshot");
  ["catalog", "kits", "kitVersions", "changeLog", "orders", "terms"].forEach(function (key) {
    if (!Array.isArray(snapshot[key])) {
      throw appError_("INVALID_SNAPSHOT", "snapshot." + key + " must be a list.");
    }
  });
  if (snapshot.lineupVersions !== undefined && !Array.isArray(snapshot.lineupVersions)) {
    throw appError_("INVALID_SNAPSHOT", "snapshot.lineupVersions must be a list.");
  }
  if (snapshot.alternatives !== undefined && !isPlainObject_(snapshot.alternatives)) {
    throw appError_("INVALID_SNAPSHOT", "snapshot.alternatives must be an object.");
  }
  if (snapshot.state !== undefined && !isPlainObject_(snapshot.state)) {
    throw appError_("INVALID_SNAPSHOT", "snapshot.state must be an object.");
  }
  if (snapshot.inventory !== undefined && !isPlainObject_(snapshot.inventory)) {
    throw appError_("INVALID_SNAPSHOT", "snapshot.inventory must be an object.");
  }
  if (snapshot.supplierQuotes !== undefined && !isPlainObject_(snapshot.supplierQuotes)) {
    throw appError_("INVALID_SNAPSHOT", "snapshot.supplierQuotes must be an object.");
  }

  const serialized = JSON.stringify(snapshot);
  if (serialized.length > LABKIT_CONFIG.maxSnapshotCharacters) {
    throw appError_("SNAPSHOT_TOO_LARGE", "The LabKit data is too large for one save.");
  }
  return JSON.parse(serialized);
}

function syncSnapshotToTables_(snapshot, version, now, email) {
  const spreadsheet = getSpreadsheet_();
  ["KitLineupVersions", "Semesters", "SemesterKits"].forEach(function (name) {
    ensureSheet_(spreadsheet, name, LABKIT_SCHEMAS[name]);
  });
  const catalog = snapshot.catalog;
  const kits = snapshot.kits;
  const kitVersions = snapshot.kitVersions;
  const lineupVersions = arrayOrEmpty_(snapshot.lineupVersions);
  const changeLog = snapshot.changeLog;
  const terms = snapshot.terms;
  const orders = snapshot.orders;
  const state = isPlainObject_(snapshot.state) ? snapshot.state : {};
  const alternatives = isPlainObject_(snapshot.alternatives) ? snapshot.alternatives : {};
  const inventory = isPlainObject_(snapshot.inventory) ? snapshot.inventory : {};
  const componentInventory = isPlainObject_(inventory.components) ? inventory.components : {};
  const packedKitInventory = isPlainObject_(inventory.packedKits) ? inventory.packedKits : {};
  const supplierQuotes = isPlainObject_(snapshot.supplierQuotes) ? snapshot.supplierQuotes : {};

  replaceObjectRows_(getSheet_("Components"), LABKIT_SCHEMAS.Components,
    catalog.map(function (item) {
      return {
        id: item.id,
        part_number: item.id,
        name: item.name,
        category: item.cat,
        manufacturer: item.mfr,
        package: item.pkg,
        description: item.role,
        active: kit.active !== false,
        unit_cost: item.base,
        stock_quantity: isPlainObject_(componentInventory[item.id])
          ? numberOrZero_(componentInventory[item.id].onHand)
          : numberOrZero_(item.stock),
        vendor_sku: item.jameco,
        specs_json: jsonCell_(item.specs || {}),
        note: item.note,
        datasheet_url: item.ds,
        updated_at: now,
        version: version,
      };
    }));

  replaceObjectRows_(getSheet_("Kits"), LABKIT_SCHEMAS.Kits,
    kits.map(function (kit) {
      return {
        id: kit.id,
        code: kit.code,
        name: kit.name,
        kind: kit.individual ? "individual" : "kit",
        favorite: Boolean(kit.fav),
        active: true,
        spring_2026_json: jsonCell_(kit.sp26 || {}),
        series_key: kit.seriesKey,
        updated_at: now,
        version: version,
      };
    }));

  const kitItemRows = [];
  kits.forEach(function (kit) {
    arrayOrEmpty_(kit.items).forEach(function (entry, index) {
      kitItemRows.push({
        id: String(kit.id) + ":" + String(entry.p || index),
        kit_id: kit.id,
        component_id: entry.p,
        quantity: entry.q,
        updated_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(getSheet_("KitItems"), LABKIT_SCHEMAS.KitItems, kitItemRows);

  const kitRequirementRows = [];
  kits.forEach(function (kit) {
    arrayOrEmpty_(kit.items).forEach(function (entry, index) {
      if (!String(entry.note || "").trim()) return;
      kitRequirementRows.push({
        id: String(kit.id) + ":" + String(entry.p || index),
        kit_id: kit.id,
        component_id: entry.p,
        note: String(entry.note).trim(),
        updated_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(
    getSheet_("KitItemRequirements"),
    LABKIT_SCHEMAS.KitItemRequirements,
    kitRequirementRows
  );

  replaceObjectRows_(getSheet_("KitVersions"), LABKIT_SCHEMAS.KitVersions,
    kitVersions.map(function (item) {
      return {
        id: item.id,
        kit_id: item.kitId,
        version_number: numberOrZero_(item.number),
        label: item.label,
        effective_from: item.effectiveFrom,
        effective_to: item.effectiveTo,
        items_json: jsonCell_(arrayOrEmpty_(item.items)),
        source: item.source,
        created_at: item.createdAt,
        updated_at: now,
        version: version,
      };
    }));

  replaceObjectRows_(getSheet_("KitLineupVersions"), LABKIT_SCHEMAS.KitLineupVersions,
    lineupVersions.map(function (item) {
      return {
        id: item.id,
        version_number: numberOrZero_(item.number),
        label: item.label,
        kit_ids_json: jsonCell_(arrayOrEmpty_(item.kitIds)),
        source: item.source,
        created_at: item.createdAt,
        updated_at: now,
        version: version,
      };
    }));

  const semesterVersionRows = [];
  terms.forEach(function (term) {
    const assignments = isPlainObject_(term.kitVersions) ? term.kitVersions : {};
    Object.keys(assignments).forEach(function (kitId) {
      semesterVersionRows.push({
        id: String(term.id) + ":" + String(kitId),
        semester_id: term.id,
        kit_id: kitId,
        kit_version_id: assignments[kitId],
        updated_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(getSheet_("SemesterKitVersions"), LABKIT_SCHEMAS.SemesterKitVersions, semesterVersionRows);

  replaceObjectRows_(getSheet_("Semesters"), LABKIT_SCHEMAS.Semesters,
    terms.map(function (term) {
      const statusOverrides = isPlainObject_(state.statusOv) ? state.statusOv : {};
      return {
        id: term.id,
        label: term.label,
        season: term.season,
        year: term.year,
        status: statusOverrides[term.id] || term.status,
        forecast_units: term.forecast,
        actual_units: term.sales,
        factor: term.factor,
        class_counts_json: jsonCell_(term.cls || {}),
        kit_sales_json: jsonCell_(term.kits || {}),
        rates_json: jsonCell_(term.rate || {}),
        individual_sales_json: jsonCell_(term.items || {}),
        actual_pending: Boolean(term.actualPending),
        kit_offerings_json: jsonCell_(term.kitOfferings || {}),
        sale_prices_json: jsonCell_(term.salePrices || {}),
        lineup_version_id: term.lineupVersionId || "",
        updated_at: now,
        version: version,
      };
    }));

  replaceObjectRows_(getSheet_("SalesSummary"), LABKIT_SCHEMAS.SalesSummary,
    terms.map(function (term) {
      return {
        semester_id: term.id,
        label: term.label,
        transaction_count: numberOrZero_(term.transactionCount),
        credit_card_fee_count: numberOrZero_(term.creditCardFeeCount),
        as_of: term.asOf || "",
        sales_report_json: term.salesReport ? jsonCell_(term.salesReport) : "",
        updated_at: now,
        version: version,
      };
    }));

  const semesterKitRows = [];
  terms.forEach(function (term) {
    kits.filter(function (kit) { return !kit.individual; }).forEach(function (kit) {
      const spring = isPlainObject_(kit.sp26) ? kit.sp26 : {};
      const sold = kit.seriesKey
        ? numberOrZero_(term.items && term.items[kit.seriesKey])
        : numberOrZero_(term.kits && term.kits[kit.code]);
      const planned = isPlainObject_(term.plannedKits)
        ? numberOrZero_(term.plannedKits[kit.id])
        : 0;
      const allocation = isPlainObject_(term.inventoryAllocation)
        && isPlainObject_(term.inventoryAllocation.packedKits)
        ? numberOrZero_(term.inventoryAllocation.packedKits[kit.id])
        : 0;
      const offered = !isPlainObject_(term.kitOfferings) || term.kitOfferings[kit.id] !== false;
      const salePrice = isPlainObject_(term.salePrices) && term.salePrices[kit.id] !== undefined
        ? Number(term.salePrices[kit.id])
        : "";
      const units = term.actualPending === true ? planned : sold;
      semesterKitRows.push({
        id: String(term.id) + ":" + String(kit.id),
        semester_id: term.id,
        kit_id: kit.id,
        sold: sold,
        on_hand: term.id === "sp26" ? numberOrZero_(spring.remaining) : allocation,
        faulty: term.id === "sp26" ? numberOrZero_(spring.faulty) : 0,
        to_purchase: term.id === "sp26"
          ? numberOrZero_(spring.purchase)
          : Math.max(0, planned - allocation),
        forecast_override: isPlainObject_(state.overrides) ? state.overrides[kit.id] : "",
        offered: offered,
        sale_price: salePrice,
        revenue: salePrice === "" ? "" : units * salePrice,
        estimated_profit: "",
        updated_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(getSheet_("SemesterKits"), LABKIT_SCHEMAS.SemesterKits, semesterKitRows);

  replaceObjectRows_(getSheet_("Inventory"), LABKIT_SCHEMAS.Inventory,
    catalog.map(function (item) {
      const row = isPlainObject_(componentInventory[item.id]) ? componentInventory[item.id] : {};
      return {
        id: "inventory:" + item.id,
        component_id: item.id,
        quantity: row.onHand === undefined ? numberOrZero_(item.stock) : numberOrZero_(row.onHand),
        location: String(row.location || ""),
        counted_at: String(row.countedAt || ""),
        updated_at: now,
        version: version,
      };
    }));

  replaceObjectRows_(getSheet_("PackedKitInventory"), LABKIT_SCHEMAS.PackedKitInventory,
    kits.map(function (kit) {
      const row = isPlainObject_(packedKitInventory[kit.id]) ? packedKitInventory[kit.id] : {};
      const basisTerm = terms.filter(function (term) { return term.id === (row.basisTermId || "fa26"); })[0] || {};
      const sold = kit.seriesKey
        ? numberOrZero_(basisTerm.items && basisTerm.items[kit.seriesKey])
        : numberOrZero_(basisTerm.kits && basisTerm.kits[kit.code]);
      const prepared = row.prepared === undefined ? numberOrZero_(row.onHand) + sold : numberOrZero_(row.prepared);
      return {
        id: "packed:" + kit.id,
        kit_id: kit.id,
        prepared: prepared,
        sold: sold,
        quantity: Math.max(0, prepared - sold),
        reserved: numberOrZero_(row.reserved),
        faulty: numberOrZero_(row.faulty),
        location: String(row.location || ""),
        counted_at: String(row.countedAt || ""),
        basis_semester_id: String(row.basisTermId || "fa26"),
        note: String(row.note || ""),
        updated_at: now,
        version: version,
      };
    }));

  const vendorQuoteRows = [];
  Object.keys(supplierQuotes).forEach(function (componentId) {
    arrayOrEmpty_(supplierQuotes[componentId]).forEach(function (quote, quoteIndex) {
      const breaks = arrayOrEmpty_(quote.priceBreaks);
      (breaks.length ? breaks : [{ quantity: quote.orderQuantity, unitPrice: quote.unitPrice }])
        .forEach(function (priceBreak, breakIndex) {
          vendorQuoteRows.push({
            id: String(quote.id || componentId + ":" + quoteIndex) + ":" + breakIndex,
            component_id: componentId,
            vendor: quote.vendor,
            vendor_sku: quote.vendorSku,
            quantity_break: numberOrZero_(priceBreak.quantity),
            unit_price: numberOrZero_(priceBreak.unitPrice),
            quoted_at: quote.checkedAt,
            expires_at: "",
            created_by: email,
            version: version,
          });
        });
    });
  });
  replaceObjectRows_(getSheet_("VendorQuotes"), LABKIT_SCHEMAS.VendorQuotes, vendorQuoteRows);

  replaceObjectRows_(getSheet_("Orders"), LABKIT_SCHEMAS.Orders,
    orders.map(function (order) {
      return {
        id: order.id,
        order_number: order.id,
        vendor: order.vendor,
        date: order.date,
        status: order.status || (order.receipt ? "received" : "ordered"),
        receipt_url: order.receiptUrl || "",
        created_by: email,
        created_at: order.date,
        semester_ids_json: jsonCell_(arrayOrEmpty_(order.terms)),
        notes: order.notes || "",
        updated_at: now,
        version: version,
      };
    }));

  const orderLineRows = [];
  orders.forEach(function (order) {
    arrayOrEmpty_(order.lines).forEach(function (line, index) {
      orderLineRows.push({
        id: String(order.id) + ":" + index,
        order_id: order.id,
        component_id: line[0],
        quantity: line[1],
        unit_price: line[2],
        semester_ids_json: jsonCell_(arrayOrEmpty_(order.terms)),
        updated_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(getSheet_("OrderLines"), LABKIT_SCHEMAS.OrderLines, orderLineRows);

  replaceObjectRows_(getSheet_("ChangeHistory"), LABKIT_SCHEMAS.ChangeHistory,
    changeLog.map(function (entry) {
      return {
        id: entry.id,
        timestamp: entry.at,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId,
        summary: entry.summary,
        before_json: jsonCell_(entry.before),
        after_json: jsonCell_(entry.after),
        undone_at: entry.undoneAt || "",
        updated_at: now,
        version: version,
      };
    }));

  const alternativeRows = [];
  Object.keys(alternatives).forEach(function (componentId) {
    arrayOrEmpty_(alternatives[componentId]).forEach(function (alternative, index) {
      alternativeRows.push({
        id: componentId + ":" + index,
        component_id: componentId,
        part_number: alternative.pn,
        manufacturer: alternative.mfr,
        package: alternative.pkg,
        match: alternative.match,
        match_label: alternative.matchLabel,
        note: alternative.note,
        unit_price_label: alternative.unit,
        vendor: alternative.vendor,
        created_at: now,
        version: version,
      });
    });
  });
  replaceObjectRows_(getSheet_("Alternatives"), LABKIT_SCHEMAS.Alternatives, alternativeRows);
}

function appendAudit_(event) {
  const sheet = getSheet_("AuditLog");
  sheet.appendRow([
    new Date().toISOString(),
    event.requestId,
    event.email,
    event.action,
    event.entity,
    event.entityId,
    jsonCell_(event.before),
    jsonCell_(event.after),
  ]);
}

function findAuditRequest_(requestId) {
  const sheet = getSheet_("AuditLog");
  if (sheet.getLastRow() < 2) return null;
  const match = sheet
    .getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(requestId)
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;
  const afterText = String(sheet.getRange(match.getRow(), 8).getValue() || "{}");
  let after = {};
  try { after = JSON.parse(afterText); } catch (error) { after = {}; }
  return { version: Number(after.version || 0) };
}

function getSpreadsheet_() {
  const id = getRequiredProperty_(LABKIT_CONFIG.properties.spreadsheetId);
  const spreadsheet = SpreadsheetApp.openById(id);
  if (spreadsheet.getId() !== id) {
    throw appError_("CONFIG_ERROR", "The configured spreadsheet could not be opened.");
  }
  return spreadsheet;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw appError_(
      "NOT_INITIALIZED",
      "The " + name + " sheet is missing. Run initializeLabKit from the Apps Script editor."
    );
  }
  return sheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureGridSize_(sheet, 1, headers.length);

  const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const hasHeader = existing.some(function (value) { return String(value).trim() !== ""; });
  if (hasHeader && existing.join("\u001f") !== headers.join("\u001f")) {
    let used = existing.length;
    while (used > 0 && String(existing[used - 1]).trim() === "") used -= 1;
    const safeAppendMigration = used > 0
      && existing.slice(0, used).join("\u001f") === headers.slice(0, used).join("\u001f");
    if (!safeAppendMigration) {
      throw appError_(
        "SCHEMA_CONFLICT",
        "The " + name + " header row is not the LabKit schema. It was left unchanged."
      );
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (!hasHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#1f2937")
    .setFontColor("#ffffff");
}

function readObjectRows_(sheet) {
  const headers = LABKIT_SCHEMAS[sheet.getName()];
  if (!headers) throw appError_("SCHEMA_ERROR", "Unknown LabKit sheet: " + sheet.getName());
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .filter(function (values) {
      return values.some(function (value) { return value !== ""; });
    })
    .map(function (values) {
      const row = {};
      headers.forEach(function (header, index) { row[header] = values[index]; });
      return row;
    });
}

function replaceObjectRows_(sheet, headers, objects) {
  ensureGridSize_(sheet, Math.max(2, objects.length + 1), headers.length);
  const oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldRows > 0) sheet.getRange(2, 1, oldRows, headers.length).clearContent();
  if (!objects.length) return;
  const values = objects.map(function (object) {
    return headers.map(function (header) { return cellValue_(object[header]); });
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function ensureGridSize_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value || !String(value).trim()) {
    throw appError_("CONFIG_ERROR", "Missing Apps Script property: " + name);
  }
  return String(value).trim();
}

function getOptionalProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  return value && String(value).trim() ? String(value).trim() : "";
}

function requireRequestId_(value) {
  const requestId = requireString_(value, "requestId", 128);
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)) {
    throw appError_("INVALID_REQUEST_ID", "requestId has an invalid format.");
  }
  return requestId;
}

function requireString_(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw appError_("INVALID_INPUT", name + " is missing or invalid.");
  }
  return value.trim();
}

function requirePlainObject_(value, name) {
  if (!isPlainObject_(value)) {
    throw appError_("INVALID_INPUT", name + " must be an object.");
  }
  return value;
}

function isPlainObject_(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNonnegativeInteger_(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw appError_("INVALID_INPUT", name + " must be a nonnegative integer.");
  }
  return number;
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function arrayOrEmpty_(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrZero_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function jsonCell_(value) {
  if (value === undefined) return "";
  const text = JSON.stringify(value);
  return text === undefined ? "" : text;
}

function cellValue_(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return jsonCell_(value);
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function appError_(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details || null;
  return error;
}

function apiSuccess_(data) {
  return { ok: true, data: data };
}

function apiFailure_(error) {
  const safeCodes = [
    "ACCOUNT_DISABLED", "ACCESS_RESTRICTED", "EDITOR_LOCKED",
    "AUTH_UNAVAILABLE", "CONFIG_ERROR", "EMAIL_NOT_VERIFIED", "FORBIDDEN",
    "INVALID_INPUT", "INVALID_REQUEST_ID",
    "INVALID_SESSION", "INVALID_SNAPSHOT", "NOT_INITIALIZED", "SCHEMA_CONFLICT",
    "SCHEMA_ERROR", "SNAPSHOT_TOO_LARGE", "STATE_CORRUPT", "UNKNOWN_ACTION",
    "SUPPLIER_UNAVAILABLE", "VERSION_CONFLICT",
  ];
  const code = error && safeCodes.indexOf(error.code) >= 0 ? error.code : "INTERNAL";
  const message = code === "INTERNAL"
    ? "LabKit could not complete that request. Try again."
    : String(error.message || "LabKit could not complete that request.");
  const result = { ok: false, error: { code: code, message: message } };
  if (error && error.details && code !== "INTERNAL") result.error.details = error.details;
  return result;
}
