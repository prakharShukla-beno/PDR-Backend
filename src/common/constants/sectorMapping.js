import { INDUSTRIES, SECTOR_TAXONOMY } from "./taxonomy.js";

const normalizeKey = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[.,/]+/g, " ")
    .replace(/\s+/g, " ");

let subSectorToSectorMap = null;

const buildSubSectorToSectorMap = () => {
  if (subSectorToSectorMap) return subSectorToSectorMap;
  subSectorToSectorMap = {};
  for (const [sector, subs] of Object.entries(SECTOR_TAXONOMY)) {
    for (const sub of Object.keys(subs)) {
      subSectorToSectorMap[normalizeKey(sub)] = sector;
    }
  }
  return subSectorToSectorMap;
};

/**
 * SECTOR_TO_INDUSTRIES — Commercial Sector Parent→Child Mapping
 * 
 * SOURCE OF TRUTH for all industry/sector operations:
 * - Excel import: stores child industries AS-IS (RULE 1)
 * - Filter/Search: expands parent sector to all children (RULE 2)
 * - ICP matching: uses this to validate and match industries
 * 
 * RULE 1 (DATA SAVE):
 *   Excel "Industry" column contains CHILD values (e.g., "Fintech", "Banking")
 *   These are saved AS-IS into primaryIndustry field — NO conversion to parent
 * 
 * RULE 2 (FILTER/SEARCH):
 *   When user selects PARENT sector in FilterPanel, backend query expands it
 *   to include ALL child industries via $in array — one generic lookup
 */

export const SECTOR_TO_INDUSTRIES = {
  "BFSI": [
    "Banking", "Investment Services", "Central Banks", "Fintech",
    "Social Security (Financial Aspect)", "Wealth Management", "Insurance Carriers",
    "Finance", "Insurance", "BFSI",
  ],
  "IT & ITES": [
    "Software Development", "AI/ML", "AI & ML", "Blockchain", "Cybersecurity",
    "Managed IT", "Cloud Infrastructure", "Data Centers", "SaaS",
    "BPO", "KPO", "Call Centers", "Back Office", "Technical Support",
    "Information Technology", "Tech", "IT & ITES",
  ],
  "Media & Telecom": [
    "Streaming Media", "Online Gaming", "Film/Video", "Radio/TV",
    "Publishing/Print", "Cinemas", "Sports (Broadcast)", "Theme Parks",
    "Telecommunications & Internet Services", "Media", "Telecom", "Media & Telecom",
  ],
  "Retail, CPG & Hospitality": [
    "FMCG", "Appliances (White Goods)", "Toys & Games", "Sports Equipment",
    "Personal Care Products", "Retail", "Wholesale", "E-commerce", "E-Commerce",
    "Hotels", "Restaurants", "Catering", "Tourism", "Food Services",
    "Laundry", "Repair of Goods", "Domestic Help", "Personal Grooming",
    "Retail & CPG", "Consumer", "Retail, CPG & Hospitality",
  ],
  "Healthcare & Life Sciences": [
    "Pharmaceuticals", "Biotechnology", "Medical Device Manufacturing",
    "Hospitals", "Clinics", "Elderly & Social Care", "Diagnostics & Labs",
    "Fitness", "Veterinary Services", "Healthcare", "Pharma", "Medical",
    "Healthcare & Life Sciences",
  ],
  "Manufacturing & Automotive": [
    "Steel & Iron", "Shipbuilding", "Aerospace/Aircraft", "Locomotive",
    "Armaments", "Industrial Machinery", "Automotive (OEM)", "Electric Vehicles",
    "Farm Equipment", "Textiles", "Electronics & Semiconductors", "Food Processing",
    "Petrochemicals", "Plastics", "Metal Casting", "Furniture", "Paper & Pulp",
    "Packaging", "Manufacturing", "Automotive", "Manufacturing & Automotive",
  ],
  "Travel, Transport & Logistics": [
    "Warehousing", "Supply Chain", "Postals & Couriers", "Trucking",
    "Cab Services", "Aviation (Airlines)", "Shipping (Maritime)", "Railways (Operations)",
    "Logistics", "Transport", "Travel", "Travel, Transport & Logistics",
  ],
  "Energy, Resources & Utilities": [
    "Electricity, Thermal", "Renewable Energy", "Hydro, Natural Gas",
    "Grid Storage/Batteries", "Agriculture", "Coal & Mining", "Oil & Gas (Upstream)",
    "Forestry", "Fishing", "Water Supply", "Sewage Management", "Waste Management",
    "Environmental Remediation", "Energy", "Utilities", "Oil", "Gas",
    "Energy, Resources & Utilities",
  ],
  "Real Estate & Construction": [
    "Residential Construction", "Commercial Construction", "Infrastructure",
    "Real Estate Sales/Leasing", "Property Management", "Architecture Services",
    "Real Estate", "Construction", "Property", "Real Estate & Construction",
  ],
  "Public Sector, Gov & Education": [
    "Government (Federal/State)", "Defence (Non-Industrial)", "PSUs", "Policy Makers",
    "International Bodies", "Schools", "Universities", "Edtech (Learning aspect)",
    "Non-Profits", "Think Tanks", "Government", "Education", "EdTech", "NGO",
    "Public Sector, Gov & Education",
  ],
  "Professional Services": [
    "Legal", "Accounting", "Consulting (Strat/HR/Fin/IT)", "Marketing & Advertising",
    "Research Analysis", "HR & Talent", "Payroll", "Translation", "Vocational Training",
    "Customer Success", "Facility Management", "Equipment Rental",
    "R&D Services", "Media & Design Agency", "Consulting", "Professional Services",
  ],
};

// Build reverse mapping: Industry (lowercase) → Sector
export const buildIndustryToSectorMap = () => {
  const map = {};
  for (const [sector, industries] of Object.entries(SECTOR_TO_INDUSTRIES)) {
    for (const industry of industries) {
      const key = normalizeKey(industry);
      map[key] = sector;
    }
  }
  return map;
};

/**
 * Expand sector names OR pass through industry values for DB queries
 * 
 * RULE 2 Implementation:
 *   Input: ["BFSI", "SaaS"]
 *   Output: ["Banking", "Investment Services", ..., "SaaS"]
 * 
 * @param {string|string[]} values - Sector names or industry values
 * @returns {string[]} - Expanded array of child industry values
 */
export const expandSectors = (values) => {
  if (!values) return [];
  const arr = Array.isArray(values) ? values : [values];
  const expanded = [];

  arr.filter(Boolean).forEach((v) => {
    if (SECTOR_TO_INDUSTRIES[v]) {
      // It's a sector name — expand to all children
      expanded.push(...SECTOR_TO_INDUSTRIES[v]);
    } else {
      // It's likely an industry value — pass through as-is
      expanded.push(v);
    }
  });

  return [...new Set(expanded)]; // deduplicate
};

/**
 * Get parent sector for a given industry value
 * 
 * @param {string} industry - Industry value
 * @returns {string|null} - Parent sector name or null
 */
export const getSectorForIndustry = (industry) => {
  if (!industry) return null;
  const map = buildIndustryToSectorMap();
  const key = normalizeKey(industry);
  return map[key] || null;
};

/**
 * Map any industry / sub-sector / sector label to one of the 11 commercial sectors.
 */
export const resolveToCommercialSector = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const key = normalizeKey(trimmed);

  for (const sector of INDUSTRIES) {
    if (normalizeKey(sector) === key) return sector;
  }

  const fromChild = getSectorForIndustry(trimmed);
  if (fromChild) return fromChild;

  const subMap = buildSubSectorToSectorMap();
  if (subMap[key]) return subMap[key];

  const industryMap = buildIndustryToSectorMap();
  let bestSector = null;
  let bestLen = 0;
  for (const [indKey, sector] of Object.entries(industryMap)) {
    if (key === indKey || key.includes(indKey) || indKey.includes(key)) {
      const len = Math.min(indKey.length, key.length);
      if (len >= 4 && len > bestLen) {
        bestSector = sector;
        bestLen = len;
      }
    }
  }
  if (bestSector) return bestSector;

  for (const sector of INDUSTRIES) {
    const sectorKey = normalizeKey(sector);
    if (key.includes(sectorKey) || sectorKey.includes(key)) {
      if (Math.min(sectorKey.length, key.length) >= 8) return sector;
    }
  }

  for (const [subKey, sector] of Object.entries(subMap)) {
    if (key.includes(subKey) || subKey.includes(key)) {
      if (Math.min(subKey.length, key.length) >= 6) return sector;
    }
  }

  return "Professional Services";
};

/**
 * Check if a value is a valid child industry (not a parent sector)
 * 
 * @param {string} value - Value to check
 * @returns {boolean} - True if it's a child industry value
 */
export const isValidChildIndustry = (value) => {
  if (!value) return false;
  const map = buildIndustryToSectorMap();
  const key = normalizeKey(value);
  return !!map[key];
};

/**
 * Normalize industry value — preserve exact format but validate it's known
 * RULE 1 Implementation: Preserve as-is
 * 
 * @param {string} value - Industry value from Excel
 * @returns {string|null} - Industry value preserved as-is, or null if invalid
 */
export const normalizeIndustryValue = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Store exact value as provided — no conversion to sector
  return trimmed;
};
