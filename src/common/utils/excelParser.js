import pkg from "xlsx";
import { INDUSTRIES } from "../constants/taxonomy.js";
import { normalizeIndustryValue } from "./industryMapper.js";

const { read, readFile, utils } = pkg;

const FIELD_MAP = {
  // ── Account Information ────────────────────────────────────────────────────
  "account name":          "accountName",
  "account name *":        "accountName",   // client format
  "accountname":           "accountName",
  "company":               "accountName",
  "company name":          "accountName",
  "business name":         "accountName",
  "account":               "accountName",
  "firm":                  "accountName",
  "client":                "accountName",
  "customer":              "accountName",
  "vendor":                "accountName",
  "organisation":          "accountName",
  "org":                   "accountName",
  "organization":          "accountName",
  "account source":        "accountSource",
  "accountsource":         "accountSource",
  "primary industry":      "primaryIndustry",
  "primaryindustry":       "primaryIndustry",
  "industry":              "primaryIndustry",
  "sector":                "primaryIndustry",
  "commercial category":   "commercialCategory",
  "commercialcategory":    "commercialCategory",
  "business model":        "businessModel",
  "businessmodel":         "businessModel",
  "country":               "country",
  "country *":             "country",        // client format
  "location":              "country",
  "region":                "country",
  "hq location city":      "hqLocationCity",
  "hqlocationcity":        "hqLocationCity",
  "city":                  "hqLocationCity",
  "annual revenue":        "annualRevenue",
  "annualrevenue":         "annualRevenue",
  "revenue":               "annualRevenue",
  "no of employees":       "noOfEmployees",
  "noofemployees":         "noOfEmployees",
  "employees":             "noOfEmployees",
  "website":               "website",
  "website *":             "website",        // client format
  "url":                   "website",
  "web":                   "website",
  "site":                  "website",

  // ── Tech Stack ─────────────────────────────────────────────────────────────
  "primary tech stack":    "primaryTechStack",
  "primarytechstack":      "primaryTechStack",
  "tech stack":            "primaryTechStack",
  "tech1":                 "primaryTechStack",    // client format
  "tech2":                 "secondaryTechStack",  // client format
  "tech3":                 "tertiaryTechStack",   // client format
  "tech adoption profile": "techAdoptionProfile",
  "techadoptionprofile":   "techAdoptionProfile",
  "infrastructure risk":   "infrastructureRisk",
  "infrastructurerisk":    "infrastructureRisk",

  // ── Client Specific ────────────────────────────────────────────────────────
  "campaign":              "campaignName",   // client format
  "comments":              "comments",       // client format

  // ── Sales Intelligence ─────────────────────────────────────────────────────
  "tech fit score":        "techFitScore",
  "techfitscore":          "techFitScore",
  "financial capacity":    "financialCapacity",
  "financialcapacity":     "financialCapacity",
  "margin potential":      "marginPotential",
  "marginpotential":       "marginPotential",
  "strategic value":       "strategicValue",
  "strategicvalue":        "strategicValue",
  "history trigger":       "historyTrigger",
  "historytrigger":        "historyTrigger",
  "intent signal":         "intentSignal",
  "intentsignal":          "intentSignal",
  "service pitch":         "servicePitch",
  "servicepitch":          "servicePitch",
  "clv ranking":           "clvRanking",
  "clvranking":            "clvRanking",
  "sales priority":        "salesPriority",
  "salespriority":         "salesPriority",

  // ── Contact — Beno Format ──────────────────────────────────────────────────
  "contact name":          "contact.name",
  "contactname":           "contact.name",
  "poc name":              "contact.name",
  "designation":           "contact.designation",
  "department":            "contact.department",
  "seniority":             "contact.seniority",
  "contact email":         "contact.email",
  "contactemail":          "contact.email",
  "email":                 "contact.email",
  "phone":                 "contact.phone",
  "contact phone":         "contact.phone",
  "linkedin":              "contact.linkedIn",
  "contact linkedin":      "contact.linkedIn",

  // ── Contact — Client Format ────────────────────────────────────────────────
  "poc-first name":        "contact.firstName",  // will be merged into name
  "poc first name":        "contact.firstName",
  "poc-last name":         "contact.lastName",   // will be merged into name
  "poc last name":         "contact.lastName",
  "phone 1":               "contact.phone",      // client format
  "phone1":                "contact.phone",
  "phone 2":               "contact.phone2",     // client format
  "phone2":                "contact.phone2",
  "job1":                  "contact.job1",       // client format
  "job2":                  "contact.job2",       // client format — designation fallback
};

// LinkedIn-standard employee ranges (aligned with icp.model.js + prospect.model.js)
export const EMPLOYEE_RANGES = [
  "1-10", "11-50", "51-200", "201-500", "501-1,000",
  "1,001-5,000", "5,001-10,000", "10,000+",
];

const EMPLOYEE_RANGE_NORMALIZE = {
  "1-50":           "11-50",
  "1 - 50":         "11-50",
  "201-1,000":      "201-500",
  "201-1000":       "201-500",
  "501-1000":       "501-1,000",
  "1001-5000":      "1,001-5,000",
  "1,001-5000":     "1,001-5,000",
  "5001-10000":     "5,001-10,000",
  "5,000+":         "5,001-10,000",
  "5000+":          "5,001-10,000",
  "10000+":         "10,000+",
  "10,000 +":       "10,000+",
};

const ACCOUNT_NAME_HEADER_ALIASES = [
  "account name", "account name *", "accountname", "company", "company name",
  "business name", "organization name", "organization", "organisation", "org",
  "firm", "client", "customer", "vendor", "account",
];

const CONTACT_NAME_HEADER_ALIASES = [
  "contact name", "contactname", "poc name", "full name", "person name", "name",
];

const DESIGNATION_HEADER_ALIASES = [
  "designation", "title", "job title", "buyer persona", "contact title",
  "position", "job role", "role", "persona", "job title 1", "job1",
];

const DEPARTMENT_HEADER_ALIASES = [
  "department", "functional domain", "function", "dept",
];

const SENIORITY_HEADER_ALIASES = [
  "seniority", "seniority level", "level",
];

// ── Enum validation — only for Beno format fields
// Client-specific fields (tech1/2/3, phone1/2, job1/2) are free text
const ENUM_FIELDS = {
  accountSource:       ["LinkedIn", "Google", "Social Media", "Referral", "Event", "Cold Outreach"],
  commercialCategory:  ["Product Led", "SaaS-Subscriptions", "Professional Services", "Retail-E-Com"],
  businessModel:       ["B2B", "B2C", "D2C", "E-Commerce", "B2B2C", "Marketplace"],
  annualRevenue:       ["Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M", "Mid-Market $50M-$250M", "Corporate $250M-$1B", "Enterprise $1B+"],
  noOfEmployees:       EMPLOYEE_RANGES,
  techAdoptionProfile: ["Innovator", "Early Adopter", "Mainstream", "Laggard", "Leapfrog"],
  infrastructureRisk:  ["EOL", "Data Silos", "Security Gaps", "Scalability Lock", "Shadow IT"],
  financialCapacity:   ["Enterprise", "Mid-Market", "Small Business"],
  marginPotential:     ["High Margins", "Standard Margins", "Low Margins"],
  strategicValue:      ["Market Maker", "VC Backed", "Standard"],
  historyTrigger:      ["M&A Activity", "Capital Event", "Leadership Shakeup", "Regulatory Action", "Earnings Shock", "Security Incident", "Strategic Pivot", "Job Postings"],
  intentSignal:        [
    "Hyper-Growth Mode", "Cost Containment", "Risk Mitigation", "Modernization Mandate",
    "Capital Event", "Regulatory Action", "Earnings Shock", "Strategic Pivot",
    "Security Incident", "Job Postings",
  ],
  servicePitch:        ["Speed & Capacity", "Automation & Outsourcing", "Security & Compliance", "Future-Proofing", "Data Unification"],
  clvRanking:          ["Tier-A (Strategic)", "Tier-B (Core)", "Tier-C (Mass)"],
  salesPriority:       ["P1 (Tier A+Active)", "P2 (Tier B+Active)", "P3 (Tier A+Cold)", "P4 (Tier B+Cold)"],
  technologyAlignment: ["Core Match", "Adjacent Match", "No Match"],
  "contact.seniority": ["C-Suite", "VP", "Director", "Manager", "Individual Contributor"],

  // NOTE: primaryTechStack enum removed — client file uses free text for tech stack
};

const normalizeEnumToken = (value) =>
  String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const normalizeIndustryKey = (value) =>
  normalizeEnumToken(value).toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim();

// Save industry value as-is from Excel — no conversion to sector name.
// FIX: Use normalizeIndustryValue() to preserve exact format
// e.g., "Fintech", "Banking" will NOT be converted to "BFSI"
const resolvePrimaryIndustry = (value) => {
  if (!value) return null;
  return normalizeIndustryValue(value);
};

const setFieldValue = (row, field, value) => {
  if (field.startsWith("contact.")) {
    const contactField = field.split(".")[1];
    if (!row.contacts?.[0]) return;
    row.contacts[0][contactField] = value;
  } else {
    row[field] = value;
  }
};

const getFieldValue = (row, field) => {
  if (field.startsWith("contact.")) {
    return row.contacts?.[0]?.[field.split(".")[1]];
  }
  return row[field];
};

const PREVIEW_SAMPLE_ROWS = 5;

const openFirstSheet = (filePath) => {
  const workbook = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  return workbook.Sheets[sheetName];
};

const openFirstSheetFromBuffer = (buffer) => {
  const workbook = read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  return workbook.Sheets[sheetName];
};

const readAllRawRows = (sheet) =>
  utils.sheet_to_json(sheet, { defval: null, raw: false })
    .filter((rawRow) => !isRowEmpty(rawRow));

const getSheetRange = (sheet) =>
  utils.decode_range(sheet["!ref"] || "A1:A1");

const encodeRowRange = (sheet, startRow, endRow) => {
  const full = getSheetRange(sheet);
  return utils.encode_range({
    s: { r: startRow, c: full.s.c },
    e: { r: Math.min(endRow, full.e.r), c: full.e.c },
  });
};

const parseExcel = (filePath) => {
  const sheet = openFirstSheet(filePath);
  return readAllRawRows(sheet);
};

const readSampleRawRows = (sheet, maxDataRows = PREVIEW_SAMPLE_ROWS) => {
  const full = getSheetRange(sheet);
  if (full.e.r < 1) return [];

  const range = encodeRowRange(sheet, 0, Math.min(full.e.r, maxDataRows));
  const rows = utils.sheet_to_json(sheet, { defval: null, raw: false, range });
  return rows.filter((rawRow) => !isRowEmpty(rawRow));
};

const estimateTotalDataRows = (sheet) => {
  const full = getSheetRange(sheet);
  return Math.max(0, full.e.r);
};

const normalizeHeader = (header) =>
  String(header)
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

/** Pick first non-empty cell whose header exactly matches an alias (priority order) */
const pickColumnByAliases = (rawRow, aliases) => {
  for (const alias of aliases) {
    for (const [key, value] of Object.entries(rawRow)) {
      if (normalizeHeader(key) !== alias) continue;
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return { value: String(value).trim(), header: key };
      }
    }
  }
  return null;
};

export const normalizeEmployeeRange = (value, accountName = "") => {
  if (!value) return null;
  const trimmed = normalizeEnumToken(value);

  if (EMPLOYEE_RANGES.includes(trimmed)) return trimmed;

  const direct = EMPLOYEE_RANGE_NORMALIZE[trimmed] ||
    EMPLOYEE_RANGE_NORMALIZE[trimmed.replace(/\s/g, "")];
  if (direct) {
    console.warn(
      `Employee range "${value}" normalized to "${direct}"` +
      (accountName ? ` for ${accountName}` : "")
    );
    return direct;
  }

  const nums = trimmed.replace(/,/g, "").match(/\d+/g)?.map(Number) || [];
  const max  = nums.length ? Math.max(...nums) : 0;

  if (max >= 10000 || /10,?000\+|10k\+/i.test(trimmed)) return "10,000+";
  if (max >= 5001)  return "5,001-10,000";
  if (max >= 1001)  return "1,001-5,000";
  if (max >= 501)   return "501-1,000";
  if (max >= 201)   return "201-500";
  if (max >= 51)    return "51-200";
  if (max >= 11)    return "11-50";
  if (max >= 1)     return "1-10";

  console.warn(
    `Unrecognized employee range "${value}"` +
    (accountName ? ` for ${accountName}` : "") +
    " — set to null"
  );
  return null;
};

const applyEmployeeRangeNormalization = (row) => {
  if (!row.noOfEmployees) return;
  row.noOfEmployees = normalizeEmployeeRange(row.noOfEmployees, row.accountName);
};

const isRowEmpty = (rawRow) =>
  Object.values(rawRow).every(
    (v) => v === null || v === undefined || String(v).trim() === ""
  );

const inferAccountName = (rawRow, mapped) => {
  if (mapped.accountName) return mapped.accountName;

  const fromAlias = pickColumnByAliases(rawRow, ACCOUNT_NAME_HEADER_ALIASES);
  if (fromAlias) return fromAlias.value;

  if (mapped.website) {
    return mapped.website
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .trim();
  }

  return null;
};

const enrichContactFromAliases = (rawRow, contact) => {
  if (!contact.name) {
    const namePick = pickColumnByAliases(rawRow, CONTACT_NAME_HEADER_ALIASES);
    if (namePick) contact.name = namePick.value;
  }

  if (!contact.designation) {
    const desigPick = pickColumnByAliases(rawRow, DESIGNATION_HEADER_ALIASES);
    if (desigPick) contact.designation = desigPick.value;
  }

  // Client format: job1 / job2 as job-title fallbacks
  if (!contact.designation && contact.job1) contact.designation = contact.job1;
  if (!contact.designation && contact.job2) contact.designation = contact.job2;

  if (!contact.department) {
    const deptPick = pickColumnByAliases(rawRow, DEPARTMENT_HEADER_ALIASES);
    if (deptPick) contact.department = deptPick.value;
  }

  if (!contact.seniority) {
    const senPick = pickColumnByAliases(rawRow, SENIORITY_HEADER_ALIASES);
    if (senPick) contact.seniority = senPick.value;
  }

  delete contact.job1;
  delete contact.job2;

  return contact;
};

const mapRowToSchema = (rawRow) => {
  const mapped = {};
  const contact = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = normalizeHeader(key);
    const schemaField = FIELD_MAP[normalizedKey];

    if (!schemaField) continue;

    if (schemaField.startsWith("contact.")) {
      const contactField = schemaField.split(".")[1];
      if (value !== null && value !== "") {
        contact[contactField] = String(value).trim();
      }
    } else {
      if (value !== null && value !== "") {
        mapped[schemaField] = String(value).trim();
      }
    }
  }

  // ── Client format: POC-First Name + POC-Last Name → merge into name field
  if (contact.firstName || contact.lastName) {
    const fullName = [contact.firstName, contact.lastName]
      .filter(Boolean).join(" ").trim();
    if (fullName) contact.name = fullName;
    delete contact.firstName;
    delete contact.lastName;
  }

  enrichContactFromAliases(rawRow, contact);

  if (
    contact.name || contact.email || contact.phone ||
    contact.designation || contact.department || contact.seniority
  ) {
    contact.isPrimary = true;
    mapped.contacts = [contact];
  }

  // Parse comma-separated tech values into arrays
  // "AWS, React, MongoDB" → ["AWS", "React", "MongoDB"]
  for (const field of ["primaryTechStack", "secondaryTechStack", "tertiaryTechStack"]) {
    if (mapped[field] && typeof mapped[field] === "string") {
      const arr = mapped[field].split(",").map(s => s.trim()).filter(Boolean);
      mapped[field] = arr.length > 0 ? arr : null;
    }
  }

  const accountName = inferAccountName(rawRow, mapped);
  if (accountName) {
    mapped.accountName = accountName;
  } else if (!pickColumnByAliases(rawRow, ACCOUNT_NAME_HEADER_ALIASES) && !mapped.website) {
    console.warn(
      "No Account Name column found — accountName will be empty for this row. Row will be skipped."
    );
  }

  applyEmployeeRangeNormalization(mapped);

  return mapped;
};

/** Re-run enum normalization before DB insert (shared with import service) */
export const sanitizeProspectRow = (row) => {
  const copy = { ...row };
  
  // FIX: Normalize industry value to preserve exact format
  // Prevents "Fintech" or "Banking" from being converted to "BFSI"
  if (copy.primaryIndustry) {
    const normalized = normalizeIndustryValue(copy.primaryIndustry);
    if (normalized) {
      copy.primaryIndustry = normalized;
    }
  }
  
  for (const [field, allowedValues] of Object.entries(ENUM_FIELDS)) {
    if (!Array.isArray(allowedValues)) continue;
    const value = getFieldValue(copy, field);
    if (!value) continue;
    if (field === "contact.seniority") continue;
    if (field === "primaryIndustry") {
      setFieldValue(copy, field, resolvePrimaryIndustry(value, allowedValues));
      continue;
    }
    if (field === "noOfEmployees") {
      setFieldValue(copy, field, normalizeEmployeeRange(value, copy.accountName));
      continue;
    }
    if (!allowedValues.includes(value)) {
      setFieldValue(copy, field, null);
    }
  }
  if (copy.techFitScore !== undefined && copy.techFitScore !== null && copy.techFitScore !== "") {
    const score = Number(copy.techFitScore);
    copy.techFitScore = !isNaN(score) && score >= 0 && score <= 100 ? score : null;
  }
  return copy;
};

const validateRow = (row, rowNumber) => {
  const errors = [];

  if (!row.accountName) {
    errors.push(`Row ${rowNumber}: accountName is required`);
    return errors;
  }

  // Enum normalization — invalid values become null (row is kept)
  for (const [field, allowedValues] of Object.entries(ENUM_FIELDS)) {
    if (!Array.isArray(allowedValues)) continue;

    const value = getFieldValue(row, field);
    if (!value) continue;

    if (field === "contact.seniority") continue;

    if (field === "primaryIndustry") {
      setFieldValue(row, field, resolvePrimaryIndustry(value, allowedValues));
      continue;
    }

    if (field === "noOfEmployees") {
      setFieldValue(row, field, normalizeEmployeeRange(value, row.accountName));
      continue;
    }

    if (!allowedValues.includes(value)) {
      setFieldValue(row, field, null);
    }
  }

  // Coerce techFitScore when present; invalid values are cleared silently
  if (row.techFitScore !== undefined && row.techFitScore !== null && row.techFitScore !== "") {
    const score = Number(row.techFitScore);
    row.techFitScore = !isNaN(score) && score >= 0 && score <= 100 ? score : null;
  }

  return errors;
};

// ── ICP-critical column detection (header row only) ─────────────────────────
const ICP_COLUMN_PATTERNS = {
  primaryIndustry: [
    "industry", "sector", "business type", "primary industry", "commercial sector",
  ],
  employeeRange: [
    "employee", "headcount", "staff", "no of employees", "number of employees",
    "employee range", "company size", "employees",
  ],
  annualRevenue: [
    "revenue", "arr", "turnover", "annual revenue", "annual turnover", "revenue range",
  ],
  country: [
    "country", "region", "market", "geography", "location", "target market",
    "target region", "preferential market", "country name",
  ],
  techStack: [
    "tech", "technology", "tech stack", "tools", "software", "platform",
    "primary tech", "tech category", "technologies used", "technology stack", "tech tools",
  ],
  designation: [
    "designation", "title", "job title", "role", "buyer persona", "contact title",
    "position", "job role", "seniority", "department", "contact role", "persona",
  ],
};

const ICP_TECH_STACK_FIELDS = new Set([
  "primaryTechStack", "secondaryTechStack", "tertiaryTechStack",
]);

const ICP_CONTACT_PERSONA_FIELDS = new Set([
  "designation", "department", "seniority", "job1", "job2",
]);

const ICP_SCHEMA_FIELDS = {
  primaryIndustry: "primaryIndustry",
  employeeRange:   "noOfEmployees",
  annualRevenue:   "annualRevenue",
  country:         "country",
  techStack:       "primaryTechStack",
  designation:     null,
};

const headerMatchesIcpPattern = (normalizedHeader, pattern) =>
  normalizedHeader.includes(pattern.toLowerCase());

const headerMatchesIcpFieldMap = (header, icpKey) => {
  const mapped = FIELD_MAP[header];
  if (mapped) {
    const schemaField = ICP_SCHEMA_FIELDS[icpKey];
    if (schemaField && mapped === schemaField) return true;

    if (icpKey === "techStack" && ICP_TECH_STACK_FIELDS.has(mapped)) return true;

    if (icpKey === "designation" && mapped.startsWith("contact.")) {
      const contactField = mapped.split(".")[1];
      return ICP_CONTACT_PERSONA_FIELDS.has(contactField);
    }
  }

  if (icpKey === "designation") {
    return DESIGNATION_HEADER_ALIASES.includes(header) ||
      DEPARTMENT_HEADER_ALIASES.includes(header) ||
      SENIORITY_HEADER_ALIASES.includes(header);
  }

  return false;
};

export const detectMissingIcpColumns = (headers = []) => {
  const normalizedHeaders = headers
    .map((h) => normalizeHeader(String(h)))
    .filter(Boolean);

  const missingIcpColumns = [];

  for (const [field, patterns] of Object.entries(ICP_COLUMN_PATTERNS)) {
    const found = normalizedHeaders.some((header) =>
      patterns.some((pattern) => headerMatchesIcpPattern(header, pattern)) ||
      headerMatchesIcpFieldMap(header, field)
    );
    if (!found) missingIcpColumns.push(field);
  }

  return missingIcpColumns;
};

const extractHeadersFromSheet = (sheet) => {
  const headerRange = encodeRowRange(sheet, 0, 0);
  const rows = utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, range: headerRange });
  const headerRow = rows[0] || [];
  return headerRow
    .filter((h) => h !== null && h !== undefined && String(h).trim() !== "")
    .map((h) => String(h));
};

export const getExcelHeaders = (filePath) => {
  const sheet = openFirstSheet(filePath);
  return extractHeadersFromSheet(sheet);
};

export const processExcelFile = (filePath) => {
  const rawRows = parseExcel(filePath);
  const validRows = [];
  const errorDetails = [];
  let totalRows = 0;

  rawRows.forEach((rawRow, index) => {
    if (isRowEmpty(rawRow)) return;
    totalRows++;

    const rowNumber = index + 2;
    const mappedRow = sanitizeProspectRow(mapRowToSchema(rawRow));
    const errors = validateRow(mappedRow, rowNumber);

    if (errors.length > 0) {
      errorDetails.push(...errors);
    } else {
      validRows.push(mappedRow);
    }
  });

  return { validRows, errorDetails, totalRows };
};

export const previewExcelFile = (filePath) => {
  const sheet = openFirstSheet(filePath);
  const headers = extractHeadersFromSheet(sheet);
  const missingIcpColumns = detectMissingIcpColumns(headers);
  const sampleRawRows = readSampleRawRows(sheet, PREVIEW_SAMPLE_ROWS);

  const previewRows = [];
  for (const rawRow of sampleRawRows) {
    const mappedRow = sanitizeProspectRow(mapRowToSchema(rawRow));
    const errors = validateRow(mappedRow, 0);
    if (errors.length > 0) continue;

    previewRows.push({
      accountName:     mappedRow.accountName     || "",
      primaryIndustry: mappedRow.primaryIndustry || "",
      noOfEmployees:   mappedRow.noOfEmployees   || "",
      annualRevenue:   mappedRow.annualRevenue   || "",
      country:         mappedRow.country         || "",
    });
    if (previewRows.length >= PREVIEW_SAMPLE_ROWS) break;
  }

  return {
    headers,
    missingIcpColumns,
    previewRows,
    totalRows: estimateTotalDataRows(sheet),
    errorCount: 0,
  };
};

/** Full parse from in-memory buffer — used by async import staging */
export const parseExcelFile = (buffer) => {
  const sheet = openFirstSheetFromBuffer(buffer);
  const headers = extractHeadersFromSheet(sheet);
  const rows = readAllRawRows(sheet);
  return { rows, headers };
};

/** Validate + normalize a single raw Excel row (reuses existing mapping rules) */
export const validateAndNormalizeRow = (rawRow, rowNumber = 2) => {
  if (isRowEmpty(rawRow)) {
    return { isValid: false, normalizedRow: null, reason: "Empty row" };
  }

  const mappedRow = sanitizeProspectRow(mapRowToSchema(rawRow));
  const errors = validateRow(mappedRow, rowNumber);

  if (errors.length > 0) {
    return { isValid: false, normalizedRow: null, reason: errors[0] };
  }

  const { contacts, ...prospectData } = mappedRow;
  return {
    isValid: true,
    normalizedRow: { ...prospectData, contacts },
    reason: null,
  };
};

/** Extract primary contact from a raw Excel row */
export const buildContactFromRow = (rawRow) => {
  const mappedRow = sanitizeProspectRow(mapRowToSchema(rawRow));
  return mappedRow.contacts?.[0] ?? null;
};