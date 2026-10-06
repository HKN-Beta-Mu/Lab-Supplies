(function attachHistoricalSales(global) {
  "use strict";

  const terms = [
    ["fa26", "Fall", 2026], ["su26", "Summer", 2026], ["sp26", "Spring", 2026],
    ["fa25", "Fall", 2025], ["su25", "Summer", 2025], ["sp25", "Spring", 2025],
    ["fa24", "Fall", 2024], ["su24", "Summer", 2024], ["sp24", "Spring", 2024],
    ["fa23", "Fall", 2023], ["su23", "Summer", 2023], ["sp23", "Spring", 2023],
    ["fa22", "Fall", 2022], ["su22", "Summer", 2022], ["sp22", "Spring", 2022],
    ["fa21", "Fall", 2021], ["su21", "Summer", 2021], ["sp21", "Spring", 2021],
    ["fa20", "Fall", 2020], ["su20", "Summer", 2020], ["sp20", "Spring", 2020],
    ["fa19", "Fall", 2019], ["su19", "Summer", 2019], ["sp19", "Spring", 2019],
    ["fa18", "Fall", 2018], ["su18", "Summer", 2018], ["sp18", "Spring", 2018],
    ["fa17", "Fall", 2017], ["su17", "Summer", 2017], ["sp17", "Spring", 2017],
    ["fa16", "Fall", 2016], ["su16", "Summer", 2016], ["sp16", "Spring", 2016],
    ["fa15", "Fall", 2015], ["su15", "Summer", 2015], ["sp15", "Spring", 2015],
  ];

  const classSize = {
    "ECE 3741": [576, 69, 527, 556, 66, 507, 526, 50, 479, 454, 40, 474, 499, 57, 501, 526, 60, 449, 408, 6, 425, 464, 81, 480, 508, 85, 425, 427, 82, 448, 459, 85, 405, 391, 61, 367],
    "ECE 3043": [150, 0, 109, 86, 0, 70, 79, 5, 72, 64, 10, 71, 81, 10, 66, 63, 15, 69, 76, 20, 65, 89, 21, 86, 96, 19, 94, 94, 25, 82, 110, 18, 80, 119, 26, 116],
    "ECE 2040": [280, 31, 363, 253, 20, 227, 153, 11, 143, 152, 8, 124, 138, 17, 121, 155, 22, 144, 131, 40, 139, 166, 19, 173, 153, 27, 149, 170, 24, 160, 160, 34, 176, 162, 39, 154],
    "ECE 2031": [378, 71, 392, 391, 58, 391, 279, 47, 282, 257, 29, 263, 228, 45, 240, 258, 52, 203, 223, 62, 221, 238, 44, 223, 228, 38, 224, 208, 46, 232, 234, 47, 189, 195, 39, 205],
    "ECE 2035": [298, 47, 359, 274, 45, 228, 174, 35, 168, 165, 19, 140, 157, 34, 123, 139, 26, 137, 146, 43, 104, 137, 19, 117, 148, 26, 106, 137, 19, 119, 147, 23, 95, 123, 24, 93],
    // No ECE 4180 enrollment history was supplied. Keep explicit zeroes so
    // officers can add it semester-by-semester without inventing old data.
    "ECE 4180": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "ECE 2040 (+ Online)": [0, 107, 0, 0, 64, 0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "ECE 2031 (+ Online)": [0, 111, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  // The historical sheet had no Fall 2026 values. Those first-column values
  // are filled from the Square report for Aug 1 through Oct 4, 2026.
  const purchased = {
    "ECE 3741": [232, 28, 187, 218, 28, 168, 97, 15, 107, 106, 5, 83, 95, 14, 126, 109, 16, 223, 226, 0, 154, 207, 35, 209, 209, 39, 188, 189, 42, 215, 209, 37, 201, 164, 30, 102],
    "ECE 3043": [132, 0, 91, 74, 0, 60, 34, 2, 37, 31, 3, 33, 38, 1, 29, 22, 1, 35, 40, 0, 52, 69, 21, 58, 60, 9, 64, 65, 15, 54, 77, 15, 65, 82, 15, 44],
    "ECE 2040": [171, 21, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "ECE 2031": [228, 48, 227, 184, 43, 205, 67, 12, 60, 84, 5, 81, 68, 4, 65, 72, 0, 50, 1, 0, 109, 104, 13, 91, 108, 13, 76, 71, 26, 84, 126, 23, 104, 123, 19, 108],
    "ECE 2035": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Giant Br": [77, 5, 75, 36, 2, 51, 26, 0, 31, 24, 3, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Small Br": [233, 31, 152, 120, 19, 126, 42, 9, 29, 51, 4, 44, 43, 9, 49, 31, 0, 30, 25, 0, 87, 101, 15, 78, 107, 12, 73, 78, 23, 91, 118, 20, 107, 106, 11, 88],
    "Wirekits": [458, 54, 314, 304, 37, 272, 119, 8, 100, 124, 5, 117, 99, 15, 142, 127, 9, 159, 172, 0, 114, 209, 25, 133, 157, 24, 125, 127, 32, 139, 182, 47, 158, 121, 33, 105],
    "Credit Card": [584, 72, 446, 136, 11, 165, 106, 8, 104, 119, 16, 75, 84, 16, 126, 138, 16, 220, 214, 0, 221, 289, 28, 196, 272, 47, 192, 180, 26, 218, 249, 48, 202, 183, 40, 178],
    "# Sales": [807, 100, 671, 499, 75, 492, 217, 29, 248, 245, 17, 224, 229, 25, 260, 235, 17, 338, 284, 0, 376, 462, 81, 400, 430, 73, 364, 349, 89, 383, 463, 80, 412, 450, 68, 302],
  };

  const fall2026Report = {
    source: "Square Sales Report",
    reportedAt: "2026-10-04T19:01:00-04:00",
    periodStart: "2026-08-01T00:00:00-04:00",
    periodEnd: "2026-10-04T23:59:00-04:00",
    scope: "All Employees · All Devices",
    financials: {
      grossSales: 32928.01,
      items: 32928.01,
      serviceCharges: 0,
      returns: -646,
      discountsAndComps: 0,
      netSales: 32282.01,
      tax: 0,
      tips: 0,
      giftCardSales: 0,
      refundsByAmount: -8,
      total: 32274.01,
      fees: -750.94,
      netTotal: 31523.07,
    },
    payments: {
      totalCollected: 32274.01,
      cash: { count: 211, amount: 7355 },
      card: { count: 596, amount: 24919.01 },
      giftCard: { count: 0, amount: 0 },
      other: { count: 0, amount: 0 },
    },
    categories: {
      "Parts Kits": { quantity: 1931, amount: 30780 },
      "Uncategorized": { quantity: 184, amount: 2148.01 },
    },
    itemSales: {
      "ECE 2031 Parts Kit": { quantity: 228, amount: 4560 },
      "ECE 3043 Parts Kit": { quantity: 132, amount: 4224 },
      "ECE 3741 Parts Kit": { quantity: 232, amount: 9280 },
      "Credit Card Fee": { quantity: 584, amount: 1168 },
      "ECE 2040 Kit": { quantity: 171, amount: 2052 },
      "Giant Breadboard": { quantity: 77, amount: 2310 },
      "Small Breadboard": { quantity: 233, amount: 2094, priceVariants: [
        { quantity: 230, amount: 2070 },
        { quantity: 3, amount: 24 },
      ] },
      "Wires Kit": { quantity: 458, amount: 7240.01, priceVariants: [
        { quantity: 448, amount: 7168 },
        { quantity: 10, amount: 72.01, note: "Half-price wire kits recorded as Custom Amount / No description." },
      ] },
    },
    notes: [
      "Fall 2026 values are current through Oct 4, 2026 and may not be final.",
      "The 10 no-description Custom Amount sales are counted as half-price wire kits.",
    ],
  };

  const courseKeys = ["ECE 2031", "ECE 3043", "ECE 3741", "ECE 2040", "ECE 2035"];
  const itemKeys = ["Giant Br", "Small Br", "Wirekits"];
  const seasonFactor = { Spring: 1, Summer: 0.19, Fall: 1.12 };

  [classSize, purchased].forEach((table) => {
    Object.entries(table).forEach(([name, values]) => {
      if (values.length !== terms.length || values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Historical sales row ${name} does not match the semester columns.`);
      }
    });
  });

  const semesterData = terms.map(([id, season, year], index) => {
    const cls = {};
    Object.keys(classSize).forEach((key) => { cls[key] = classSize[key][index]; });
    const kits = {};
    courseKeys.forEach((key) => { kits[key] = purchased[key][index]; });
    const rate = {};
    courseKeys.forEach((key) => {
      rate[key] = cls[key] > 0 ? kits[key] / cls[key] : 0;
    });
    const items = {};
    itemKeys.forEach((key) => { items[key] = purchased[key][index]; });
    const sales = courseKeys.reduce((sum, key) => sum + kits[key], 0)
      + itemKeys.reduce((sum, key) => sum + items[key], 0);

    return {
      id,
      label: `${season} ${year}`,
      season,
      year,
      cls,
      kits,
      rate,
      items,
      sales,
      transactionCount: purchased["# Sales"][index],
      creditCardFeeCount: purchased["Credit Card"][index],
      forecast: null,
      status: id === "fa26" ? "Received" : "Closed",
      factor: seasonFactor[season] * Math.pow(1.037, year - 2016),
      actualPending: id === "fa26",
      asOf: id === "fa26" ? "2026-10-04" : null,
      salesReport: id === "fa26" ? fall2026Report : null,
    };
  });

  global.LabKitHistoricalSales = Object.freeze({
    version: "2026-10-04",
    sources: Object.freeze([
      "Historical class-size, kit-purchase, and purchase-rate table supplied Oct 4, 2026",
      "Square Sales Report for Aug 1 through Oct 4, 2026",
    ]),
    terms: Object.freeze(semesterData),
  });
})(window);
