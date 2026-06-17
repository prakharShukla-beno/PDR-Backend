import pkg from "xlsx";
import { INDUSTRIES } from "../constants/taxonomy.js";
import { normalizeIndustryValue } from "./industryMapper.js";

const { readFile, utils } = pkg;

const FIELD_MAP = {
  // ── Account Information ────────────────────────────────────────────────────
  "account name":          "accountName",
  "account name *":        "accountName",   // client format
  "accountname":           "accountName",
  "company":               "accountName",
  "company name":          "accountName",
  "business name":         "accountName",
  "account":               "accountName",
  "name":                  "accountName",
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
  "job2":                  "contact.job2",       // client format
};

// ── Enum validation — only for Beno format fields
// Client-specific fields (tech1/2/3, phone1/2, job1/2) are free text
const ENUM_FIELDS = {
  accountSource:       ["LinkedIn", "Google", "Social Media", "Referral", "Event", "Cold Outreach"],
  commercialCategory:  ["Product Led", "SaaS-Subscriptions", "Professional Services", "Retail-E-Com"],
  businessModel:       ["B2B", "B2C", "D2C", "E-Commerce", "B2B2C", "Marketplace"],
  annualRevenue:       ["Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M", "Mid-Market $50M-$250M", "Corporate $250M-$1B", "Enterprise $1B+"],
  noOfEmployees:       ["1-50", "51-200", "201-1,000", "1,001-5,000", "5,000+"],
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

const parseExcel = (filePath) => {
  const workbook = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return utils.sheet_to_json(sheet, { defval: null, raw: false });
};

const normalizeHeader = (header) =>
  String(header)
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const isRowEmpty = (rawRow) =>
  Object.values(rawRow).every(
    (v) => v === null || v === undefined || String(v).trim() === ""
  );

const ACCOUNT_NAME_HEADER = /account|company|organiz|organisation|firm|client|customer|vendor|business\s*name|^name$/;

const inferAccountName = (rawRow, mapped) => {
  if (mapped.accountName) return mapped.accountName;

  for (const [key, value] of Object.entries(rawRow)) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const header = normalizeHeader(key);
    if (ACCOUNT_NAME_HEADER.test(header)) {
      return String(value).trim();
    }
  }

  if (mapped.website) {
    return mapped.website
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .trim();
  }

  const firstValue = Object.values(rawRow).find(
    (v) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  return firstValue ? String(firstValue).trim() : null;
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

  if (Object.keys(contact).length > 0) {
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
  if (accountName) mapped.accountName = accountName;

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