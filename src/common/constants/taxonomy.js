export const INDUSTRIES = [
  "BFSI",
  "IT & ITES",
  "Media & Telecom",
  "Retail, CPG & Hospitality",
  "Healthcare & Life Sciences",
  "Manufacturing & Automotive",
  "Travel, Transport & Logistics",
  "Energy, Resources & Utilities",
  "Real Estate & Construction",
  "Public Sector, Gov & Education",
  "Professional Services",
];

/** Sub-sector keys per commercial sector — keep in sync with PDR-Frontend/lib/taxonomy.ts */
export const SECTOR_TAXONOMY = {
  "BFSI": {
    "Finance & Banking": [],
    "Insurance & Wealth": [],
  },
  "IT & ITES": {
    "Technology & IT": [],
    "ITES & BPO": [],
  },
  "Media & Telecom": {
    "Media & Entertainment": [],
    "Telecommunications": [],
  },
  "Retail, CPG & Hospitality": {
    "Consumer Goods (CPG)": [],
    "Retail & Commerce": [],
    "Hospitality & Food": [],
    "Personal Services": [],
  },
  "Healthcare & Life Sciences": {
    "Life Sciences": [],
    "Healthcare Providers": [],
    "Wellness": [],
  },
  "Manufacturing & Automotive": {
    "Heavy Industry": [],
    "Automotive": [],
    "Materials Processing": [],
  },
  "Travel, Transport & Logistics": {
    "Logistics": [],
    "Transportation": [],
  },
  "Energy, Resources & Utilities": {
    "Energy & Utilities": [],
    "Natural Resources": [],
    "Environment": [],
  },
  "Real Estate & Construction": {
    "Construction": [],
    "Real Estate": [],
    "Design": [],
  },
  "Public Sector, Gov & Education": {
    "Government": [],
    "Education": [],
    "Social": [],
  },
  "Professional Services": {
    "Advisory": [],
    "Workforce & Ops": [],
    "Research": [],
  },
};
