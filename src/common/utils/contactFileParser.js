import pkg from "xlsx";
import fs from "fs";
import { parse } from "csv-parse/sync";

const { readFile, utils } = pkg;

// ── Column mapping ─────────────────────────────────────────────────────────────
// Cover common variations of possible column names
const CONTACT_FIELD_MAP = {
  // Account link
  "account_name":              "accountName",
  "account name":              "accountName",
  "accountname":               "accountName",
  "company":                   "accountName",
  "company name":              "accountName",
  "companyname":               "accountName",
  "organization":              "accountName",
  "org":                       "accountName",

  // Name
  "first_name":                "firstName",
  "first name":                "firstName",
  "firstname":                 "firstName",
  "fname":                     "firstName",
  "last_name":                 "lastName",
  "last name":                 "lastName",
  "lastname":                  "lastName",
  "lname":                     "lastName",
  "name":                      "firstName",   // single name field → use as firstName
  "full name":                 "firstName",
  "full_name":                 "firstName",
  "contact name":              "firstName",
  "contact_name":              "firstName",

  // Role
  "title":                     "standardizedRoles",
  "job title":                 "standardizedRoles",
  "job_title":                 "standardizedRoles",
  "jobtitle":                  "standardizedRoles",
  "role":                      "standardizedRoles",
  "designation":               "standardizedRoles",
  "position":                  "standardizedRoles",
  "standardized_roles":        "standardizedRoles",
  "standardized roles":        "standardizedRoles",
  "standardizedroles":         "standardizedRoles",
  "functional_domain":         "functionalDomain",
  "functional domain":         "functionalDomain",
  "functionaldomain":          "functionalDomain",
  "department":                "functionalDomain",
  "function":                  "functionalDomain",
  "key_focus_areas":           "keyFocusAreas",
  "key focus areas":           "keyFocusAreas",
  "keyfocusareas":             "keyFocusAreas",
  "focus areas":               "keyFocusAreas",

  // Email
  "email":                     "email",
  "email address":             "email",
  "email_address":             "email",
  "emailaddress":              "email",
  "work email":                "email",
  "work_email":                "email",
  "contact_email":             "email",
  "contact email":             "email",
  "secondary_email":           "secondaryEmail",
  "secondary email":           "secondaryEmail",
  "secondaryemail":            "secondaryEmail",
  "email 2":                   "secondaryEmail",
  "email2":                    "secondaryEmail",

  // Phone
  "phone":                     "primaryPhone",
  "phone number":              "primaryPhone",
  "phone_number":              "primaryPhone",
  "phonenumber":               "primaryPhone",
  "primary_phone":             "primaryPhone",
  "primary phone":             "primaryPhone",
  "primaryphone":              "primaryPhone",
  "work phone":                "primaryPhone",
  "direct phone":              "primaryPhone",
  "phone 1":                   "primaryPhone",
  "phone1":                    "primaryPhone",
  "secondary_phone":           "secondaryPhone",
  "secondary phone":           "secondaryPhone",
  "secondaryphone":            "secondaryPhone",
  "phone 2":                   "secondaryPhone",
  "phone2":                    "secondaryPhone",
  "primary_mob_no":            "primaryMobNo",
  "primary mob no":            "primaryMobNo",
  "primarymobno":              "primaryMobNo",
  "mobile":                    "primaryMobNo",
  "mobile number":             "primaryMobNo",
  "mobile_number":             "primaryMobNo",
  "cell":                      "primaryMobNo",
  "cell phone":                "primaryMobNo",
  "primary_phone_extension":   "primaryPhoneExtension",
  "primary phone extension":   "primaryPhoneExtension",
  "primaryphoneextension":     "primaryPhoneExtension",
  "ext":                       "primaryPhoneExtension",
  "extension":                 "primaryPhoneExtension",
  "secondary_phone_extension": "secondaryPhoneExtension",
  "secondary phone extension": "secondaryPhoneExtension",
  "secondaryphoneextension":   "secondaryPhoneExtension",

  // Social
  "linkedin":                  "linkedIn",
  "linkedin url":              "linkedIn",
  "linkedin_url":              "linkedIn",
  "contact_linkedin":          "linkedIn",
  "contact linkedin":          "linkedIn",
  "contactlinkedin":           "linkedIn",
  "linkedin profile":          "linkedIn",
  "twitter":                   "twitterUrl",
  "twitter url":               "twitterUrl",
  "twitter_url":               "twitterUrl",
  "contact_twitter_url":       "twitterUrl",
  "contact twitter url":       "twitterUrl",
  "contacttwitterurl":         "twitterUrl",

  // Location
  "country":                   "country",
  "state":                     "state",
  "province":                  "state",
  "city":                      "city",
  "location":                  "city",
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

const normalizeHeader = (h) =>
  String(h).toLowerCase().trim().replace(/\*/g, "").replace(/\s+/g, " ").trim();

// ── Parse Excel ───────────────────────────────────────────────────────────────
const parseExcelFile = (filePath) => {
  const workbook  = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];
  return utils.sheet_to_json(sheet, { defval: null, raw: false });
};

// ── Parse CSV ─────────────────────────────────────────────────────────────────
const parseCsvFile = (filePath) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return parse(fileContent, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
  });
};

// ── Map raw row → contact fields ──────────────────────────────────────────────
const mapRowToContact = (rawRow) => {
  const mapped = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = normalizeHeader(key);
    const schemaField   = CONTACT_FIELD_MAP[normalizedKey];

    if (!schemaField) continue;

    if (value !== null && value !== "" && value !== undefined) {
      mapped[schemaField] = String(value).trim();
    }
  }

  return mapped;
};

// ── Validate row ──────────────────────────────────────────────────────────────
// LOOSE VALIDATION — designed for large datasets (e.g., 100k rows)
// Reject only clearly invalid rows
const validateContactRow = (row, rowNumber) => {
  const errors = [];

  // ── Row completely empty — skip
  const hasAnyData = Object.values(row).some(v => v && String(v).trim());
  if (!hasAnyData) {
    errors.push(`Row ${rowNumber}: Empty row`);
    return errors;
  }

  // ── Email format — only if the email field exists and is clearly invalid
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    // Warning only — do not reject the row, set the value to null
    row.email = null;
  }

  if (row.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.secondaryEmail)) {
    row.secondaryEmail = null;
  }

  // ── FunctionalDomain — if a value exists but does not match, set to null
  // Do not reject the row — real-world data contains many formats
  if (row.functionalDomain && !FUNCTIONAL_DOMAINS.includes(row.functionalDomain)) {
    row.functionalDomain = null; // invalid value → null, row save hogi
  }

  // NOTE: accountName and email/phone are not required
  // Real-world data often has gaps — save the row where possible
  // isLinked will be false if accountName is not found

  return errors;
};

// ── Main export ───────────────────────────────────────────────────────────────
export const processContactFile = (filePath) => {
  const isCSV = filePath.toLowerCase().endsWith(".csv");

  const rawRows = isCSV ? parseCsvFile(filePath) : parseExcelFile(filePath);

  const validRows    = [];
  const errorDetails = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const mappedRow = mapRowToContact(rawRow);
    const errors    = validateContactRow(mappedRow, rowNumber);

    if (errors.length > 0) {
      // Only completely empty rows will be rejected
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