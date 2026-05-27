import pkg from "xlsx";
const { readFile, utils } = pkg;

// Contact Excel column → DB field mapping
const CONTACT_FIELD_MAP = {
  // Account reference
  "account name":          "accountName",
  "company":               "accountName",
  "company name":          "accountName",
  "organization":          "accountName",

  // Basic info
  "first name":            "firstName",
  "firstname":             "firstName",
  "poc-first name":        "firstName",
  "poc first name":        "firstName",
  "last name":             "lastName",
  "lastname":              "lastName",
  "poc-last name":         "lastName",
  "poc last name":         "lastName",

  // Role
  "title":                 "standardizedRoles",
  "job title":             "standardizedRoles",
  "designation":           "standardizedRoles",
  "standardized roles":    "standardizedRoles",
  "functional domain":     "functionalDomain",
  "functionaldomain":      "functionalDomain",
  "key focus areas":       "keyFocusAreas",
  "keyfocusareas":         "keyFocusAreas",

  // Contact info
  "email":                 "email",
  "email address":         "email",
  "contact email":         "email",
  "secondary email":       "secondaryEmail",
  "phone":                 "primaryPhone",
  "phone 1":               "primaryPhone",
  "phone1":                "primaryPhone",
  "primary phone":         "primaryPhone",
  "phone 2":               "secondaryPhone",
  "phone2":                "secondaryPhone",
  "secondary phone":       "secondaryPhone",
  "mobile":                "primaryMobNo",
  "mobile number":         "primaryMobNo",

  // Social
  "linkedin":              "linkedIn",
  "linkedin url":          "linkedIn",
  "twitter":               "twitterUrl",
  "twitter url":           "twitterUrl",

  // Location
  "country":               "country",
  "state":                 "state",
  "city":                  "city",
  "timezone":              "timeZone",
  "time zone":             "timeZone",
};

const VALID_FUNCTIONAL_DOMAINS = [
  "Corporate Strategy", "Technology & Digital", "Data & AI",
  "Finance & Accounting", "Revenue & Growth", "Product & Creative",
  "Operations & Logistics", "People & HR", "Legal & Governance",
  "Healthcare & Life Sciences", "Industrial & Engineering",
  "Resources & Utilities", "Public Sector & NGO",
];

const parseContactExcel = (filePath) => {
  const workbook = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return utils.sheet_to_json(sheet, { defval: null, raw: false });
};

const normalizeHeader = (header) => String(header).toLowerCase().trim();

const mapContactRow = (rawRow) => {
  const mapped = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = normalizeHeader(key);
    const field = CONTACT_FIELD_MAP[normalizedKey];
    if (!field) continue;
    if (value !== null && value !== "") {
      mapped[field] = String(value).trim();
    }
  }

  return mapped;
};

const validateContactRow = (row, rowNumber) => {
  const errors = [];

  // At least one of these must exist
  if (!row.firstName && !row.lastName && !row.email) {
    errors.push(`Row ${rowNumber}: one of firstName, lastName, or email is required`);
  }

  // Email format check
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push(`Row ${rowNumber}: email "${row.email}" is invalid`);
  }

  // Secondary email check
  if (row.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.secondaryEmail)) {
    errors.push(`Row ${rowNumber}: secondaryEmail "${row.secondaryEmail}" is invalid`);
  }

  // Functional domain check — agar diya hai toh valid hona chahiye
  if (row.functionalDomain && !VALID_FUNCTIONAL_DOMAINS.includes(row.functionalDomain)) {
    // Invalid functional domain — set to null (do not reject the row)
    row.functionalDomain = null;
  }

  return errors;
};

export const processContactExcel = (filePath) => {
  const rawRows = parseContactExcel(filePath);
  const validRows   = [];
  const errorDetails = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const mapped    = mapContactRow(rawRow);
    const errors    = validateContactRow(mapped, rowNumber);

    if (errors.length > 0) {
      errorDetails.push(...errors);
    } else {
      validRows.push(mapped);
    }
  });

  return { validRows, errorDetails, totalRows: rawRows.length };
};