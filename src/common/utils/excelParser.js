import pkg from "xlsx";
const { readFile, utils } = pkg;

// ─── Excel field name → DB field name mapping ─────────────────────────────────

const FIELD_MAP = {
  // Account Information
  "account name":         "accountName",
  "accountname":          "accountName",
  "company name":         "accountName",
  "account source":       "accountSource",
  "accountsource":        "accountSource",
  "primary industry":     "primaryIndustry",
  "primaryindustry":      "primaryIndustry",
  "industry":             "primaryIndustry",
  "commercial category":  "commercialCategory",
  "commercialcategory":   "commercialCategory",
  "business model":       "businessModel",
  "businessmodel":        "businessModel",
  "country":              "country",
  "hq location city":     "hqLocationCity",
  "hqlocationcity":       "hqLocationCity",
  "city":                 "hqLocationCity",
  "annual revenue":       "annualRevenue",
  "annualrevenue":        "annualRevenue",
  "revenue":              "annualRevenue",
  "no of employees":      "noOfEmployees",
  "noofemployees":        "noOfEmployees",
  "employees":            "noOfEmployees",
  "primary tech stack":   "primaryTechStack",
  "primarytechstack":     "primaryTechStack",
  "tech stack":           "primaryTechStack",
  "tech adoption profile":"techAdoptionProfile",
  "techadoptionprofile":  "techAdoptionProfile",
  "infrastructure risk":  "infrastructureRisk",
  "infrastructurerisk":   "infrastructureRisk",
  "website":              "website",

  // Sales Intelligence
  "tech fit score":       "techFitScore",
  "techfitscore":         "techFitScore",
  "financial capacity":   "financialCapacity",
  "financialcapacity":    "financialCapacity",
  "margin potential":     "marginPotential",
  "marginpotential":      "marginPotential",
  "strategic value":      "strategicValue",
  "strategicvalue":       "strategicValue",
  "history trigger":      "historyTrigger",
  "historytrigger":       "historyTrigger",
  "intent signal":        "intentSignal",
  "intentsignal":         "intentSignal",
  "service pitch":        "servicePitch",
  "servicepitch":         "servicePitch",
  "clv ranking":          "clvRanking",
  "clvranking":           "clvRanking",
  "sales priority":       "salesPriority",
  "salespriority":        "salesPriority",

  // Contact fields
  "contact name":         "contact.name",
  "contactname":          "contact.name",
  "poc name":             "contact.name",
  "designation":          "contact.designation",
  "department":           "contact.department",
  "seniority":            "contact.seniority",
  "contact email":        "contact.email",
  "contactemail":         "contact.email",
  "email":                "contact.email",
  "phone":                "contact.phone",
  "contact phone":        "contact.phone",
  "linkedin":             "contact.linkedIn",
  "contact linkedin":     "contact.linkedIn",
};

// Valid enum values from schema — for validation
const ENUM_FIELDS = {
  accountSource:        ["LinkedIn", "Google", "Social Media", "Referral", "Event", "Cold Outreach"],
  primaryIndustry:      ["BFSI", "IT & ITES", "Media & Telecom", "Retail & CPG", "Healthcare"],
  commercialCategory:   ["Product Led", "SaaS-Subscriptions", "Professional Services", "Retail-E-Com"],
  businessModel:        ["B2B", "B2C", "D2C", "E-Commerce"],
  annualRevenue:        ["Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M", "Mid-Market $50M-$250M", "Corporate $250M-$1B"],
  noOfEmployees:        ["1-50", "51-200", "201-1,000", "1,001-5,000", "5,000+"],
  primaryTechStack:     ["Cloud Native", "Legacy On-Prem", "Hybrid Cloud", "GenAI & LLM", "Low-Code/No-Code"],
  techAdoptionProfile:  ["Innovator", "Early Adopter", "Mainstream", "Laggard", "Leapfrog"],
  infrastructureRisk:   ["EOL", "Data Silos", "Security Gaps", "Scalability Lock", "Shadow IT"],
  financialCapacity:    ["Enterprise", "Mid-Market", "Small Business"],
  marginPotential:      ["High Margins", "Standard Margins", "Low Margins"],
  strategicValue:       ["Market Maker", "VC Backed", "Standard"],
  historyTrigger:       ["M&A Activity", "Capital Event", "Leadership Shakeup", "Regulatory Action", "Earnings Shock", "Security Incident", "Strategic Pivot", "Job Postings"],
  intentSignal:         ["Hyper-Growth Mode", "Cost Containment", "Risk Mitigation", "Modernization Mandate"],
  servicePitch:         ["Speed & Capacity", "Automation & Outsourcing", "Security & Compliance", "Future-Proofing", "Data Unification"],
  clvRanking:           ["Tier-A (Strategic)", "Tier-B (Core)", "Tier-C (Mass)"],
  salesPriority:        ["P1 (Tier A+Active)", "P2 (Tier B+Active)", "P3 (Tier A+Cold)", "P4 (Tier B+Cold)"],
  "contact.seniority":  ["C-Suite", "VP", "Director", "Manager", "Individual Contributor"],
};

// Parse Excel file and return structured rows
const parseExcel = (filePath) => {
  const workbook = readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });
  return rawRows;
};

// Normalize header — lowercase + trim
const normalizeHeader = (header) => {
  return String(header).toLowerCase().trim();
};

// Map raw Excel row to DB schema fields
const mapRowToSchema = (rawRow) => {
  const mapped = {};
  const contact = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = normalizeHeader(key);
    const schemaField = FIELD_MAP[normalizedKey];

    if (!schemaField) continue; // Unknown column — skip

    // Contact fields alag handle karo
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

  // Contact object add karo agar koi field mili
  if (Object.keys(contact).length > 0) {
    contact.isPrimary = true; // Excel se aaya contact = primary
    mapped.contacts = [contact];
  }

  return mapped;
};

// Validate a single mapped row
const validateRow = (row, rowNumber) => {
  const errors = [];

  // Required field check
  if (!row.accountName) {
    errors.push(`Row ${rowNumber}: accountName is required`);
  }

  // Enum validation — check allowed values
  for (const [field, allowedValues] of Object.entries(ENUM_FIELDS)) {
    const value = field.startsWith("contact.")
      ? row.contacts?.[0]?.[field.split(".")[1]]
      : row[field];

    if (value && !allowedValues.includes(value)) {
      errors.push(
        `Row ${rowNumber}: "${field}" value "${value}" is not allowed`
      );
    }
  }

  // techFitScore range check
  if (row.techFitScore !== undefined) {
    const score = Number(row.techFitScore);
    if (isNaN(score) || score < 0 || score > 100) {
      errors.push(`Row ${rowNumber}: techFitScore must be between 0 and 100`);
    } else {
      row.techFitScore = score; // String se Number mein convert
    }
  }

  // Email format check
  const email = row.contacts?.[0]?.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Row ${rowNumber}: contact email "${email}" is invalid`);
  }

  return errors;
};

// Main export — parse + map + validate
export const processExcelFile = (filePath) => {
  const rawRows = parseExcel(filePath);

  const validRows = [];
  const errorDetails = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // Row 1 = header, so data starts at row 2

    // Map Excel columns to schema fields
    const mappedRow = mapRowToSchema(rawRow);

    // Validate mapped row
    const errors = validateRow(mappedRow, rowNumber);

    if (errors.length > 0) {
      errorDetails.push(...errors);
    } else {
      validRows.push(mappedRow);
    }
  });

  return { validRows, errorDetails, totalRows: rawRows.length };
};