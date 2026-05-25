import pkg from "xlsx";
import fs from "fs";
import { parse } from "csv-parse/sync";

const { readFile, utils } = pkg;

// ── Column mapping ─────────────────────────────────────────────────────────────
// Jitne bhi possible column names ho sakte hain — sab cover kiye hain
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
  "name":                      "firstName",   // single name field → firstName mein
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
// LOOSE VALIDATION — 1 lakh records ke liye
// Sirf clearly invalid rows reject karo
const validateContactRow = (row, rowNumber) => {
  const errors = [];

  // ── Row bilkul empty hai — skip karo ─────────────────────────────────────
  const hasAnyData = Object.values(row).some(v => v && String(v).trim());
  if (!hasAnyData) {
    errors.push(`Row ${rowNumber}: Empty row`);
    return errors;
  }

  // ── Email format — sirf agar email field hai aur clearly galat hai ────────
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    // Warning only — reject mat karo, sirf null kar do
    row.email = null;
  }

  if (row.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.secondaryEmail)) {
    row.secondaryEmail = null;
  }

  // ── FunctionalDomain — agar value hai aur match nahi karti → null karo ────
  // Reject mat karo — bahut alag-alag formats aate hain real data mein
  if (row.functionalDomain && !FUNCTIONAL_DOMAINS.includes(row.functionalDomain)) {
    row.functionalDomain = null; // invalid value → null, row save hogi
  }

  // NOTE: accountName aur email/phone REQUIRED nahi hain ab
  // Real world data mein bahut gaps hote hain — sab save karo
  // isLinked: false rahega agar accountName nahi mila

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
      // Sirf completely empty rows reject hongi
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