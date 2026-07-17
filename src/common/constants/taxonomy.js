/** Keep in sync with PDR-Frontend/lib/taxonomy.ts */
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

export const SECTOR_TAXONOMY = {
  "BFSI": {
    "Finance & Banking": ["Banking", "Investment Services", "Central Banks", "Fintech"],
    "Insurance & Wealth": ["Social Security", "Wealth Management", "Insurance Carriers"],
  },
  "IT & ITES": {
    "Technology & IT": [
      "Software Development", "AI/ML", "Blockchain", "Cybersecurity",
      "Managed IT", "Cloud Infrastructure", "Data Centers",
    ],
    "ITES & BPO": ["BPO", "KPO", "Call Centers", "Back Office", "Technical Support"],
  },
  "Media & Telecom": {
    "Media & Entertainment": [
      "Streaming Media", "Online Gaming", "Film/Video", "Radio/TV",
      "Publishing/Print", "Cinemas", "Sports (Broadcast)", "Theme Parks",
    ],
    "Telecommunications": ["Telecommunications", "Internet Services"],
  },
  "Retail, CPG & Hospitality": {
    "Consumer Goods (CPG)": [
      "FMCG", "Appliances (White Goods)", "Toys & Games",
      "Sports Equipment", "Personal Care Products",
    ],
    "Retail & Commerce": ["Retail", "Wholesale", "E-commerce"],
    "Hospitality & Food": ["Hotels", "Restaurants", "Catering", "Tourism", "Food Services"],
    "Personal Services": ["Laundry", "Repair of Goods", "Domestic Help", "Personal Grooming"],
  },
  "Healthcare & Life Sciences": {
    "Life Sciences": ["Pharmaceuticals", "Biotechnology", "Medical Device Manufacturing"],
    "Healthcare Providers": ["Hospitals", "Clinics", "Elderly & Social Care", "Diagnostics & Labs"],
    "Wellness": ["Fitness", "Veterinary Services"],
  },
  "Manufacturing & Automotive": {
    "Heavy Industry": [
      "Steel & Iron", "Shipbuilding", "Aerospace/Aircraft", "Locomotive",
      "Armaments", "Industrial Machinery",
    ],
    "Automotive": ["Automotive (OEM)", "Electric Vehicles", "Farm Equipment"],
    "Materials Processing": [
      "Textiles", "Electronics & Semiconductors", "Food Processing", "Petrochemicals",
      "Plastics", "Metal Casting", "Furniture", "Paper & Pulp", "Packaging",
    ],
  },
  "Travel, Transport & Logistics": {
    "Logistics": ["Warehousing", "Supply Chain", "Postals & Couriers"],
    "Transportation": [
      "Trucking", "Cab Services", "Aviation (Airlines)", "Shipping (Maritime)", "Railways (Operations)",
    ],
  },
  "Energy, Resources & Utilities": {
    "Energy & Utilities": [
      "Electricity/Thermal", "Renewable Energy", "Hydro/Natural Gas", "Grid Storage/Batteries",
    ],
    "Natural Resources": [
      "Agriculture", "Coal & Mining", "Oil & Gas (Upstream)", "Forestry", "Fishing",
    ],
    "Environment": [
      "Water Supply", "Sewage Management", "Waste Management", "Environmental Remediation",
    ],
  },
  "Real Estate & Construction": {
    "Construction": ["Residential Construction", "Commercial Construction", "Infrastructure"],
    "Real Estate": ["Real Estate Sales/Leasing", "Property Management"],
    "Design": ["Architecture Services"],
  },
  "Public Sector, Gov & Education": {
    "Government": [
      "Government (Federal/State)", "Defence (Non-Industrial)", "PSUs",
      "Policy Makers", "International Bodies",
    ],
    "Education": ["Schools", "Universities", "Edtech"],
    "Social": ["Non-Profits", "Think Tanks"],
  },
  "Professional Services": {
    "Advisory": [
      "Legal", "Accounting", "Consulting (Strat/HR/Fin/IT)",
      "Marketing & Advertising", "Research Analysis",
    ],
    "Workforce & Ops": [
      "HR & Talent", "Payroll", "Translation", "Vocational Training",
      "Customer Success", "Facility Management", "Equipment Rental",
    ],
    "Research": ["R&D Services", "Media & Design Agency"],
  },
};

export const getSubsInSector = (sector) => Object.keys(SECTOR_TAXONOMY[sector] ?? {});

export const getIndsInSector = (sector) =>
  getSubsInSector(sector).flatMap((sub) => SECTOR_TAXONOMY[sector][sub] ?? []);
