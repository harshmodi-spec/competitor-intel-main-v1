"use strict";

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ─── LOAD MASTER COMPANY LIST FROM EXCEL ─────────────────────────────────────

const MASTER_PATH = path.resolve(__dirname, "data", "company_master.xlsx");

function loadMasterCompanies() {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error("FATAL: server/data/company_master.xlsx not found");
    process.exit(1);
  }
  const buf = fs.readFileSync(MASTER_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets["Sheet1"];
  if (!sheet) {
    console.error("FATAL: Sheet1 not found in company_master.xlsx");
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const names = rows
    .map(r => (r["company"] || r["Company"] || r["COMPANY"] || "").toString().trim())
    .filter(Boolean);
  if (names.length === 0) {
    console.error("FATAL: No companies found in company_master.xlsx Sheet1 'company' column");
    process.exit(1);
  }
  console.log(`Loaded master companies: ${names.length}`);
  return names;
}

// ALL_CANONICAL is now driven entirely by the Excel master file
const ALL_CANONICAL = loadMasterCompanies();

// ─── ALIAS / NORMALIZATION ───────────────────────────────────────────────────

const ALIAS_MAP = {
  // 1 Finance variants
  "1finance": "1 Finance",
  "1 finance": "1 Finance",
  "onefinance": "1 Finance",
  "one finance": "1 Finance",

  // CRED
  cred: "CRED",

  // Ionic Wealth
  ionicwealth: "Ionic Wealth",
  "ionic wealth": "Ionic Wealth",
  ionic: "Ionic Wealth",

  // Dezerv
  dezerv: "Dezerv",

  // IND Money
  indmoney: "IND Money",
  "ind money": "IND Money",
  "indiamoney": "IND Money",

  // Waterfield
  waterfield: "Waterfield",
  "waterfield advisors": "Waterfield",
  "waterfield wealth": "Waterfield",

  // Asset Plus
  assetplus: "Asset Plus",
  "asset plus": "Asset Plus",
  "assetplus.in": "Asset Plus",

  // ScripBox
  scripbox: "ScripBox",
  "scrip box": "ScripBox",
  scribox: "ScripBox",

  // FundsIndia
  fundsindia: "FundsIndia",
  "funds india": "FundsIndia",

  // PowerUp Money
  powerup: "PowerUp Money",
  "powerup money": "PowerUp Money",
  poweupmoney: "PowerUp Money",
  "power up money": "PowerUp Money",

  // Centricity Wealth
  centricity: "Centricity Wealth",
  "centricity wealth": "Centricity Wealth",
  centricitywealth: "Centricity Wealth",

  // LendenClub
  lendendclub: "LendenClub",
  lendenclub: "LendenClub",
  "lenden club": "LendenClub",
  "lend en club": "LendenClub",
  lenclub: "LendenClub",
  "lenden": "LendenClub",

  // Faircent
  faircent: "Faircent",
  "fair cent": "Faircent",

  // Lendbox
  lendbox: "Lendbox",
  "lend box": "Lendbox",
};

// PEER_GROUPS is derived from ALL_CANONICAL: companies tagged in master file
// by checking known p2p keywords; everything else goes to wealth.
const P2P_NAMES = new Set(["LendenClub", "Faircent", "Lendbox"]);
const PEER_GROUPS = {
  wealth: ALL_CANONICAL.filter(n => !P2P_NAMES.has(n) || n === "1 Finance"),
  p2p: ALL_CANONICAL.filter(n => P2P_NAMES.has(n) || n === "1 Finance"),
};

function normKey(s) {
  return s
    .toLowerCase()
    .replace(/[\s\-_\.&'()\[\]/\\,;:]+/g, "")
    .trim();
}

function normalizeCompanyName(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const key = normKey(trimmed);

  // Direct alias lookup
  if (ALIAS_MAP[key]) return ALIAS_MAP[key];
  if (ALIAS_MAP[trimmed.toLowerCase()]) return ALIAS_MAP[trimmed.toLowerCase()];

  // Try canonical match
  for (const canon of ALL_CANONICAL) {
    if (normKey(canon) === key) return canon;
  }

  // Partial match against canonical names
  for (const canon of ALL_CANONICAL) {
    const ck = normKey(canon);
    if (ck.includes(key) || key.includes(ck)) return canon;
  }

  return trimmed; // keep as-is if unknown
}

// Extra display name overrides (admin-editable)
const displayNames = {}; // canonical → displayName
const extraAliases = {}; // alias → canonical

function resolveDisplayName(canonical) {
  return displayNames[canonical] || canonical;
}

function addAlias(alias, canonical) {
  extraAliases[normKey(alias)] = canonical;
}

function resolveWithExtras(raw) {
  const key = normKey(raw.trim());
  if (extraAliases[key]) return extraAliases[key];
  return normalizeCompanyName(raw);
}

// ─── IN-MEMORY DATA STORE ────────────────────────────────────────────────────

// Initialise store with empty records for every master list company.
// Only master list companies are ever stored — uploads for other names are ignored.
const dataStore = {};
ALL_CANONICAL.forEach(name => { dataStore[name] = { company: name }; });

// ─── EXCEL KEYWORD MAPS ──────────────────────────────────────────────────────

const KEYWORD_MAP = {
  revenue: [
    "revenue",
    "totalrevenue",
    "totalincome",
    "operatingrevenue",
    "netrevenue",
    "grossrevenue",
    "incomefromoperations",
    "operatingincome",
    "totaloperatingincome",
    "totalearnings",
    "sales",
    "netsales",
    "income",
  ],
  profit: [
    "pat",
    "profitaftertax",
    "netprofit",
    "netloss",
    "netincome",
    "profitforthecurrentyear",
    "profitfortheyear",
    "netearnings",
    "profitandlossaftertax",
    "netprofitloss",
    "profit",
  ],
  ebitda: [
    "ebitda",
    "earningsbeforeinteresttaxesdepreciationandamortization",
    "earningsbeforeinteresttaxdepreciation",
  ],
  aum: [
    "aum",
    "assetsundermanagement",
    "totalassetsundermanagement",
    "assetundermanagement",
  ],
  users: [
    "users",
    "customers",
    "registeredusers",
    "totalusers",
    "totalcustomers",
    "activeusers",
    "activecustomers",
    "userbase",
    "clients",
  ],
  employees: [
    "employees",
    "headcount",
    "totalemployees",
    "employeecount",
    "noofemployees",
    "numberofemployees",
    "totalheadcount",
    "staffcount",
  ],
  loanBook: [
    "loanbook",
    "totalloanbook",
    "loanportfolio",
    "grossloanbook",
    "netloanbook",
    "totalloans",
    "loansandadvances",
  ],
  fundsRaised: [
    "fundsraised",
    "totalfundsraised",
    "capitalraised",
    "totalfunding",
    "cumulativefunding",
    "totalinvestment",
    "totalcapitalraised",
  ],
  valuation: [
    "valuation",
    "companyvaluation",
    "postmoneyvaluation",
    "currentvaluation",
    "enterprisevalue",
  ],
  totalExpenses: [
    "totalexpenses",
    "totalcost",
    "operatingexpenses",
    "totaloperatingexpenses",
    "expensestotal",
    "costsandexpenses",
    "expenses",
  ],
};

const COMPANY_KEYWORDS = [
  "company",
  "name",
  "companyname",
  "entity",
  "firm",
  "organization",
];

function normCell(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s\-_\.&'()\[\]/\\,;:]+/g, "")
    .trim();
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[₹$,\s%]/g, "").trim();
    if (!cleaned || cleaned === "-" || /^n\/?a$/i.test(cleaned)) return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

function normalizeToInrCr(value, label) {
  const l = (label || "").toLowerCase();
  if (l.includes("lakh") || l.includes("lac")) return value / 100;
  if (value > 10_000_000 && !l.includes("cr")) return value / 10_000_000;
  return value;
}

function findValueInRow(row, labelIdx) {
  for (let d = 1; d <= 5; d++) {
    const v = toNumber(row[labelIdx + d]);
    if (v !== null) return v;
  }
  for (let d = 1; d <= 2; d++) {
    const v = toNumber(row[labelIdx - d]);
    if (v !== null) return v;
  }
  return null;
}

function detectYear(sheetName, rows) {
  const m = (sheetName || "").match(/20(\d{2})/);
  if (m) return parseInt("20" + m[1]);
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      if (!cell) continue;
      const ym = String(cell).match(/20(\d{2})/);
      if (ym) return parseInt("20" + ym[1]);
    }
  }
  return new Date().getFullYear();
}

// ─── EXCEL PARSER ────────────────────────────────────────────────────────────

function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellText: false, cellDates: true });
  const parsed = []; // array of { company, revenue, profit, ... }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!rows || rows.length === 0) continue;

    const year = detectYear(sheetName, rows);

    // ── Strategy 1: tabular layout ──
    // Find a header row containing company or metric keywords
    let headerRowIdx = -1;
    let headerRow = null;

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (!row) continue;
      const rowStr = row
        .filter(Boolean)
        .map(c => normCell(String(c)))
        .join(" ");
      const hasCompany = COMPANY_KEYWORDS.some(k => rowStr.includes(k));
      const hasMetric = Object.values(KEYWORD_MAP)
        .flat()
        .some(k => rowStr.includes(k));
      if (hasCompany || hasMetric) {
        headerRowIdx = i;
        headerRow = row;
        break;
      }
    }

    if (headerRowIdx >= 0 && headerRow) {
      // Map column indices → metric keys
      const colMap = {}; // colIdx → metricKey
      let companyColIdx = -1;

      for (let ci = 0; ci < headerRow.length; ci++) {
        const cell = headerRow[ci];
        if (!cell) continue;
        const nc = normCell(String(cell));
        if (COMPANY_KEYWORDS.some(k => nc === k || nc.startsWith(k) || k.startsWith(nc))) {
          companyColIdx = ci;
        }
        for (const [metric, keywords] of Object.entries(KEYWORD_MAP)) {
          if (keywords.some(k => nc === k || nc.startsWith(k) || k.startsWith(nc))) {
            colMap[ci] = metric;
          }
        }
      }

      // If we found at least a company column or metric columns, extract rows
      if (companyColIdx >= 0 || Object.keys(colMap).length > 0) {
        for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row || row.every(c => c === null || c === "")) continue;

          let companyRaw = null;
          if (companyColIdx >= 0) {
            companyRaw = row[companyColIdx];
          } else {
            // Try first non-numeric cell
            for (const cell of row) {
              if (cell && typeof cell === "string" && isNaN(parseFloat(cell.replace(/[,₹$\s]/g, "")))) {
                companyRaw = cell;
                break;
              }
            }
          }

          if (!companyRaw) continue;
          const canonical = resolveWithExtras(String(companyRaw));
          if (!canonical) continue;

          const record = { company: canonical, year };
          for (const [ciStr, metric] of Object.entries(colMap)) {
            const ci = parseInt(ciStr);
            const raw = row[ci];
            const val = toNumber(raw);
            if (val !== null) {
              record[metric] = metric === "users" || metric === "employees"
                ? val
                : normalizeToInrCr(val, String(headerRow[ci]));
            }
          }

          if (Object.keys(record).length > 2) {
            parsed.push(record);
          }
        }
        // If tabular parse found data, skip keyword scan for this sheet
        if (parsed.length > 0) continue;
      }
    }

    // ── Strategy 2: keyword scan (semi-structured) ──
    // Detect company-level blocks: look for company name labels
    let currentCompany = null;
    const companyRecord = {};
    const scores = {};

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || row.length === 0) continue;

      for (let ci = 0; ci < row.length; ci++) {
        const cell = row[ci];
        if (!cell) continue;
        const nc = normCell(String(cell));
        if (nc.length < 2) continue;

        // Check if this cell is a company name indicator
        const isCompanyLabel = COMPANY_KEYWORDS.some(
          k => nc === k || nc.startsWith(k)
        );
        if (isCompanyLabel) {
          // Save previous record
          if (currentCompany && Object.keys(companyRecord).length > 1) {
            parsed.push({ ...companyRecord, year });
          }
          // Peek next cell for company name value
          const nameVal = row[ci + 1] || row[ci + 2];
          if (nameVal) {
            currentCompany = resolveWithExtras(String(nameVal));
            Object.keys(companyRecord).forEach(k => delete companyRecord[k]);
            if (currentCompany) companyRecord.company = currentCompany;
            Object.keys(scores).forEach(k => delete scores[k]);
          }
          continue;
        }

        // Check if cell is a metric keyword
        for (const [metric, keywords] of Object.entries(KEYWORD_MAP)) {
          const matched = keywords.some(
            k => nc === k || nc.startsWith(k) || k.startsWith(nc)
          );
          if (!matched) continue;

          const val = findValueInRow(row, ci);
          if (val === null) continue;

          const score = keywords
            .filter(k => nc === k || nc.startsWith(k) || k.startsWith(nc))
            .reduce((m, k) => Math.max(m, k.length), 0);

          if (scores[metric] !== undefined && scores[metric] >= score) continue;
          scores[metric] = score;

          const finalVal =
            metric === "users" || metric === "employees"
              ? val
              : normalizeToInrCr(val, String(cell));

          if (currentCompany) {
            companyRecord[metric] = finalVal;
          } else {
            // Try to detect company from sheet name
            const sheetCanon = resolveWithExtras(sheetName);
            if (sheetCanon && ALL_CANONICAL.includes(sheetCanon)) {
              const rec = getOrCreate(sheetCanon);
              if (scores[metric] === undefined || score > scores[metric]) {
                rec[metric] = finalVal;
                rec.year = year;
              }
            }
          }
        }

        // Check if cell itself looks like a company name (no label prefix)
        if (!currentCompany && nc.length > 3) {
          const maybeCanon = resolveWithExtras(String(cell));
          if (ALL_CANONICAL.includes(maybeCanon)) {
            currentCompany = maybeCanon;
            Object.keys(companyRecord).forEach(k => delete companyRecord[k]);
            companyRecord.company = currentCompany;
            Object.keys(scores).forEach(k => delete scores[k]);
          }
        }
      }
    }

    // Save last record
    if (currentCompany && Object.keys(companyRecord).length > 1) {
      parsed.push({ ...companyRecord, year });
    }
  }

  return parsed;
}

// ─── MERGE RECORDS (upload only) ─────────────────────────────────────────────

function mergeRecords(records) {
  for (const rec of records) {
    if (!rec.company) continue;
    const canon = resolveWithExtras(rec.company);
    // Silently ignore companies not in the master list
    if (!ALL_CANONICAL.includes(canon)) continue;
    const entry = dataStore[canon];
    for (const [k, v] of Object.entries(rec)) {
      if (k === "company") continue;
      if (v !== null && v !== undefined && !isNaN(v)) entry[k] = v;
    }
    if (rec.year) entry.year = rec.year;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Always returns ALL master list companies (empty metrics if not yet uploaded)
function getCompaniesArray() {
  return ALL_CANONICAL.map(name => ({
    ...dataStore[name],
    displayName: resolveDisplayName(name),
  }));
}

function getPeerGroupCompanies(group) {
  return (PEER_GROUPS[group] || []).map(name => ({
    ...dataStore[name],
    displayName: resolveDisplayName(name),
  }));
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /companies
app.get("/companies", (req, res) => {
  const { peerGroup } = req.query;
  if (peerGroup === "wealth" || peerGroup === "wealth_management") {
    return res.json({ companies: getPeerGroupCompanies("wealth"), peerGroup: "wealth" });
  }
  if (peerGroup === "p2p" || peerGroup === "p2p_lending") {
    return res.json({ companies: getPeerGroupCompanies("p2p"), peerGroup: "p2p" });
  }
  res.json({ companies: getCompaniesArray() });
});

// GET /peer-groups
app.get("/peer-groups", (req, res) => {
  res.json({
    wealth: getPeerGroupCompanies("wealth"),
    p2p: getPeerGroupCompanies("p2p"),
  });
});

// POST /upload — require actual file; never pre-load sample data
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  try {
    const records = parseExcelBuffer(req.file.buffer);
    mergeRecords(records);
    const matched = records.filter(r => r.company && ALL_CANONICAL.includes(resolveWithExtras(r.company)));
    res.json({
      success: true,
      recordsParsed: records.length,
      matchedMasterList: matched.length,
      companies: getCompaniesArray(),
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Q/A ENGINE ──────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  revenue: "Revenue",
  profit: "Net Profit/PAT",
  ebitda: "EBITDA",
  aum: "AUM",
  users: "Users/Customers",
  employees: "Employees",
  loanBook: "Loan Book",
  fundsRaised: "Funds Raised",
  valuation: "Valuation",
  totalExpenses: "Total Expenses",
};

const METRIC_UNIT = {
  revenue: "INR Cr",
  profit: "INR Cr",
  ebitda: "INR Cr",
  aum: "INR Cr",
  loanBook: "INR Cr",
  fundsRaised: "INR Cr",
  valuation: "INR Cr",
  totalExpenses: "INR Cr",
  users: "",
  employees: "",
};

function fmt(val, metric) {
  if (val === null || val === undefined) return "N/A";
  const unit = METRIC_UNIT[metric] || "";
  if (typeof val === "number") {
    const rounded = Math.round(val * 100) / 100;
    return unit ? `${rounded} ${unit}` : String(rounded);
  }
  return String(val);
}

function detectMetric(q) {
  const lq = q.toLowerCase();
  if (/aum|assets under management/.test(lq)) return "aum";
  if (/ebitda/.test(lq)) return "ebitda";
  if (/profit|pat|earnings/.test(lq)) return "profit";
  if (/revenue|sales|income/.test(lq)) return "revenue";
  if (/employee|headcount|staff/.test(lq)) return "employees";
  if (/user|customer|client/.test(lq)) return "users";
  if (/loan|loan book/.test(lq)) return "loanBook";
  if (/valuation/.test(lq)) return "valuation";
  if (/fund|raised|funding/.test(lq)) return "fundsRaised";
  if (/expense|cost/.test(lq)) return "totalExpenses";
  return null;
}

function detectCompanies(q) {
  const found = [];
  const lq = q.toLowerCase();
  for (const name of ALL_CANONICAL) {
    if (lq.includes(name.toLowerCase())) {
      found.push(name);
    }
  }
  // Also check aliases
  for (const [alias, canon] of Object.entries(ALIAS_MAP)) {
    if (lq.includes(alias) && !found.includes(canon)) {
      found.push(canon);
    }
  }
  return found;
}

function detectPeerGroup(q) {
  const lq = q.toLowerCase();
  if (/wealth|wm/.test(lq)) return "wealth";
  if (/p2p|peer.to.peer|lending/.test(lq)) return "p2p";
  return null;
}

function rankByMetric(companies, metric, top) {
  const scored = companies
    .map(name => ({ name, val: dataStore[name]?.[metric] ?? null }))
    .filter(x => x.val !== null)
    .sort((a, b) => b.val - a.val);
  return top ? scored.slice(0, top) : scored;
}

function answerQuestion(question) {
  const q = question || "";
  const lq = q.toLowerCase();

  const metric = detectMetric(q);
  const mentionedCompanies = detectCompanies(q);
  const peerGroup = detectPeerGroup(q);

  const pool = peerGroup
    ? PEER_GROUPS[peerGroup]
    : mentionedCompanies.length > 0
    ? mentionedCompanies
    : ALL_CANONICAL;

  // ── List companies ──
  if (/list|show|all companies/.test(lq) && !metric) {
    if (peerGroup) {
      const names = PEER_GROUPS[peerGroup].join(", ");
      return `${peerGroup === "wealth" ? "Wealth Management" : "P2P Lending"} peer group: ${names}`;
    }
    return `All companies in data: ${getCompaniesArray().map(c => c.company).join(", ")}`;
  }

  // ── Ranking / top N ──
  const topMatch = lq.match(/top\s*(\d+)/);
  const topN = topMatch ? parseInt(topMatch[1]) : null;

  if (/rank|top|best|highest|most/.test(lq) && metric) {
    const ranked = rankByMetric(pool, metric, topN || 5);
    if (ranked.length === 0) return `No data available for ${METRIC_LABELS[metric] || metric}.`;
    const label = METRIC_LABELS[metric] || metric;
    const lines = ranked.map((r, i) => `${i + 1}. ${r.name}: ${fmt(r.val, metric)}`).join("\n");
    return `Top companies by ${label}:\n${lines}`;
  }

  if (/lowest|worst|least|minimum/.test(lq) && metric) {
    const ranked = rankByMetric(pool, metric, null).reverse().slice(0, topN || 5);
    if (ranked.length === 0) return `No data available for ${METRIC_LABELS[metric] || metric}.`;
    const label = METRIC_LABELS[metric] || metric;
    const lines = ranked.map((r, i) => `${i + 1}. ${r.name}: ${fmt(r.val, metric)}`).join("\n");
    return `Companies with lowest ${label}:\n${lines}`;
  }

  // ── Loss-making companies ──
  if (/loss|losing money|unprofitable|negative profit/.test(lq)) {
    const losers = pool
      .map(name => ({ name, val: dataStore[name]?.profit ?? null }))
      .filter(x => x.val !== null && x.val < 0);
    if (losers.length === 0) return "No loss-making companies found in the data (or profit data is missing).";
    return `Loss-making companies:\n${losers.map(c => `- ${c.name}: ${fmt(c.val, "profit")}`).join("\n")}`;
  }

  // ── Profitable companies ──
  if (/profitable|profit.making|in profit/.test(lq)) {
    const profitable = pool
      .map(name => ({ name, val: dataStore[name]?.profit ?? null }))
      .filter(x => x.val !== null && x.val > 0);
    if (profitable.length === 0) return "No profitable companies found in the data (or profit data is missing).";
    return `Profitable companies:\n${profitable.map(c => `- ${c.name}: ${fmt(c.val, "profit")}`).join("\n")}`;
  }

  // ── Compare companies ──
  if (mentionedCompanies.length >= 2 && metric) {
    const label = METRIC_LABELS[metric] || metric;
    const lines = mentionedCompanies.map(name => {
      const val = dataStore[name]?.[metric] ?? null;
      return `- ${name}: ${fmt(val, metric)}`;
    });
    return `Comparing ${label} for ${mentionedCompanies.join(" vs ")}:\n${lines.join("\n")}`;
  }

  // ── Single company + metric ──
  if (mentionedCompanies.length === 1 && metric) {
    const name = mentionedCompanies[0];
    const val = dataStore[name]?.[metric] ?? null;
    const label = METRIC_LABELS[metric] || metric;
    if (val === null) return `No ${label} data available for ${name}.`;
    return `${name} ${label}: ${fmt(val, metric)}`;
  }

  // ── Single company, all metrics ──
  if (mentionedCompanies.length === 1) {
    const name = mentionedCompanies[0];
    const rec = dataStore[name];
    if (!rec) return `No data found for ${name}.`;
    const lines = Object.entries(METRIC_LABELS)
      .filter(([k]) => rec[k] !== undefined)
      .map(([k, label]) => `- ${label}: ${fmt(rec[k], k)}`);
    if (lines.length === 0) return `${name} is in our database but no financial metrics are available.`;
    return `${name} metrics:\n${lines.join("\n")}`;
  }

  // ── Metric only, highest ──
  if (metric) {
    const ranked = rankByMetric(pool, metric, 1);
    if (ranked.length === 0) return `No data available for ${METRIC_LABELS[metric] || metric}.`;
    const label = METRIC_LABELS[metric] || metric;
    return `Highest ${label}: ${ranked[0].name} with ${fmt(ranked[0].val, metric)}`;
  }

  // ── Fallback ──
  const total = Object.keys(dataStore).length;
  return `I have data for ${total} companies. Try asking: "What is CRED's revenue?", "Top 3 by AUM", "Compare Dezerv and ScripBox revenue", or "Loss-making companies".`;
}

// POST /ask
app.post("/ask", (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question is required" });
  try {
    const answer = answerQuestion(question);
    res.json({ answer, question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// POST /admin/display-name — { canonical, displayName }
app.post("/admin/display-name", (req, res) => {
  const { canonical, displayName } = req.body;
  if (!canonical || !displayName) {
    return res.status(400).json({ error: "canonical and displayName are required" });
  }
  displayNames[canonical] = displayName;
  res.json({ success: true, canonical, displayName });
});

// POST /admin/alias — { alias, canonical }
app.post("/admin/alias", (req, res) => {
  const { alias, canonical } = req.body;
  if (!alias || !canonical) {
    return res.status(400).json({ error: "alias and canonical are required" });
  }
  addAlias(alias, canonical);
  res.json({ success: true, alias, canonical });
});

// GET /admin/companies — full store for admin view
app.get("/admin/companies", (req, res) => {
  res.json({
    companies: getCompaniesArray(),
    displayNames,
    peerGroups: PEER_GROUPS,
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Competitor Intel server running on http://localhost:${PORT}`);
  console.log(`Routes: GET /companies, POST /upload, POST /ask`);
  console.log(`Admin:  POST /admin/display-name, POST /admin/alias, GET /admin/companies`);
});

module.exports = app;
