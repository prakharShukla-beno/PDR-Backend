import pkg from "xlsx";
import fs from "fs";
import { parse } from "csv-parse/sync";

const { readFile, utils } = pkg;

// ── Column mapping — Excel/CSV header → schema field ─────────────────────────
const CONTACT_FIELD_MAP = {
  // Account link
  "account_name":              "accountName",
  "account name":              "accountName",
  "accountname":               "accountName",
  "company":                   "accountName",
  "company name":              "accountName",

  // Name
  "first_name":                "firstName",
  "first name":                "firstName",
  "firstname":                 "firstName",
  "last_name":                 "lastName",
  "last name":                 "lastName",
  "lastname":                  "lastName",

  // Role
  "functional_domain":         "functionalDomain",
  "functional domain":         "functionalDomain",
  "functionaldomain":          "functionalDomain",
  "key_focus_areas":           "keyFocusAreas",
  "key focus areas":           "keyFocusAreas",
  "keyfocusareas":             "keyFocusAreas",
  "standardized_roles":        "standardizedRoles",
  "standardized roles":        "standardizedRoles",
  "standardizedroles":         "standardizedRoles",
  "role":                      "standardizedRoles",
  "designation":               "standardizedRoles",

  // Email
  "email":                     "email",
  "contact_email":             "email",
  "contact email":             "email",
  "secondary_email":           "secondaryEmail",
  "secondary email":           "secondaryEmail",
  "secondaryemail":            "secondaryEmail",

  // Phone
  "primary_phone":             "primaryPhone",
  "primary phone":             "primaryPhone",
  "primaryphone":              "primaryPhone",
  "phone":                     "primaryPhone",
  "secondary_phone":           "secondaryPhone",
  "secondary phone":           "secondaryPhone",
  "secondaryphone":            "secondaryPhone",
  "primary_mob_no":            "primaryMobNo",
  "primary mob no":            "primaryMobNo",
  "primarymobno":              "primaryMobNo",
  "mobile":                    "primaryMobNo",
  "primary_phone_extension":   "primaryPhoneExtension",
  "primary phone extension":   "primaryPhoneExtension",
  "primaryphoneextension":     "primaryPhoneExtension",
  "secondary_phone_extension": "secondaryPhoneExtension",
  "secondary phone extension": "secondaryPhoneExtension",
  "secondaryphoneextension":   "secondaryPhoneExtension",

  // Social
  "contact_linkedin":          "linkedIn",
  "contact linkedin":          "linkedIn",
  "contactlinkedin":           "linkedIn",
  "linkedin":                  "linkedIn",
  "contact_twitter_url":       "twitterUrl",
  "contact twitter url":       "twitterUrl",
  "contacttwitterurl":         "twitterUrl",
  "twitter":                   "twitterUrl",

  // Location
  "country":                   "country",
  "state":                     "state",
  "city":                      "city",
  "time_zone":                 "timeZone",
  "time zone":                 "timeZone",
  "timezone":                  "timeZone",
};

const FUNCTIONAL_DOMAINS = [
  "Corporate Strategy",
  "Technology & Digital",
  "Data & AI",
  "Finance & Accounting",
  "Revenue & Growth",
  "Product & Creative",
  "Operations & Logistics",
  "People & HR",
  "Legal & Governance",
  "Healthcare & Life Sciences",
  "Industrial & Engineering",
  "Resources & Utilities",
  "Public Sector & NGO",
];

const normalizeHeader = (h) => String(h).toLowerCase().trim().replace(/\*/g, "").trim();

// ── Parse Excel file → raw rows ───────────────────────────────────────────────
const parseExcelFile = (filePath) => {
  const workbook = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return utils.sheet_to_json(sheet, { defval: null, raw: false });
};

// ── Parse CSV file → raw rows ─────────────────────────────────────────────────
const parseCsvFile = (filePath) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return parse(fileContent, {
    columns: true,         // first row = headers
    skip_empty_lines: true,
    trim: true,
  });
};

// ── Map one raw row → contact schema fields ────────────────────────────────────
const mapRowToContact = (rawRow) => {
  const mapped = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = normalizeHeader(key);
    const schemaField = CONTACT_FIELD_MAP[normalizedKey];

    if (!schemaField) continue;

    if (value !== null && value !== "" && value !== undefined) {
      mapped[schemaField] = String(value).trim();
    }
  }

  return mapped;
};

// ── Validate one mapped row ────────────────────────────────────────────────────
const validateContactRow = (row, rowNumber) => {
  const errors = [];

  // accountName must exist (to link with account)
  if (!row.accountName) {
    errors.push(`Row ${rowNumber}: Account_Name is required`);
  }

  // At least ek identifier hona chahiye
  if (!row.email && !row.primaryPhone && !row.primaryMobNo) {
    errors.push(`Row ${rowNumber}: Email ya Phone mein se koi ek zaroori hai`);
  }

  // Email format check
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push(`Row ${rowNumber}: Email "${row.email}" invalid hai`);
  }

  if (row.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.secondaryEmail)) {
    errors.push(`Row ${rowNumber}: Secondary Email "${row.secondaryEmail}" invalid hai`);
  }

  // Functional domain enum check
  if (row.functionalDomain && !FUNCTIONAL_DOMAINS.includes(row.functionalDomain)) {
    errors.push(`Row ${rowNumber}: Functional Domain "${row.functionalDomain}" invalid hai`);
  }

  return errors;
};

// ── Main export function ───────────────────────────────────────────────────────
export const processContactFile = (filePath) => {
  const isCSV = filePath.toLowerCase().endsWith(".csv");

  // Parse based on file type
  const rawRows = isCSV ? parseCsvFile(filePath) : parseExcelFile(filePath);

  const validRows   = [];
  const errorDetails = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // Row 1 = header
    const mappedRow = mapRowToContact(rawRow);
    const errors    = validateContactRow(mappedRow, rowNumber);

    if (errors.length > 0) {
      errorDetails.push(...errors);
    } else {
      validRows.push(mappedRow);
    }
  });

  return {
    validRows,
    errorDetails,
    totalRows: rawRows.length,
  };
};