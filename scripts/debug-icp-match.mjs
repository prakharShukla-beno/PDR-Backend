import mongoose from "mongoose";
import dotenv from "dotenv";
import Prospect from "../src/modules/prospect/prospect.model.js";
import ICP from "../src/modules/icp/icp.model.js";

dotenv.config();

const ICP_ID = "6a2d1c0f9b41d49e5db80102";

const REGION_COUNTRIES = {
  "North America (NA)": ["United States", "Canada", "Mexico"],
  "Europe": [
    "United Kingdom", "Germany", "France", "Netherlands", "Sweden",
    "Norway", "Denmark", "Finland", "Switzerland", "Austria", "Belgium",
    "Spain", "Italy", "Portugal", "Ireland", "Poland", "Czech Republic",
    "Hungary", "Romania", "Bulgaria", "Greece", "Croatia", "Slovakia",
    "Slovenia", "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta",
    "Cyprus", "Iceland", "Serbia", "Ukraine", "Belarus", "Bosnia and Herzegovina",
  ],
  "Asia-Pacific (APAC)": [
    "China", "Japan", "South Korea", "Australia", "New Zealand",
    "Hong Kong", "Taiwan", "Macau", "Mongolia", "Papua New Guinea",
    "Fiji", "Samoa", "Tonga", "Vanuatu", "Solomon Islands",
  ],
  "South Asia": [
    "India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal",
    "Bhutan", "Maldives", "Afghanistan",
  ],
  "Southeast Asia": [
    "Singapore", "Indonesia", "Malaysia", "Thailand", "Vietnam",
    "Philippines", "Myanmar", "Cambodia", "Laos", "Brunei",
    "Timor-Leste",
  ],
  "Middle East": [
    "Turkey", "Israel", "Jordan", "Lebanon", "Syria", "Iraq",
    "Iran", "Yemen", "Oman", "Kuwait", "Bahrain", "Qatar",
  ],
  "GCC": [
    "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait",
    "Bahrain", "Oman",
  ],
  "Latin America (LATAM)": [
    "Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru",
    "Venezuela", "Ecuador", "Bolivia", "Paraguay", "Uruguay",
    "Costa Rica", "Panama", "Guatemala", "Honduras", "El Salvador",
    "Nicaragua", "Dominican Republic", "Cuba", "Puerto Rico",
    "Trinidad and Tobago", "Jamaica",
  ],
  "Africa": [
    "South Africa", "Nigeria", "Kenya", "Egypt", "Ghana", "Ethiopia",
    "Tanzania", "Uganda", "Rwanda", "Senegal", "Ivory Coast",
    "Cameroon", "Angola", "Mozambique", "Zambia", "Zimbabwe",
    "Morocco", "Tunisia", "Algeria", "Libya", "Sudan",
  ],
};

const expandRegions = (regions = []) => {
  const countries = [];
  for (const region of regions) {
    if (REGION_COUNTRIES[region]) countries.push(...REGION_COUNTRIES[region]);
  }
  return [...new Set(countries)];
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countryInFilter = (countries) => ({
  $in: countries.map((c) => new RegExp(`^${escapeRegex(c)}$`, "i")),
});
const hasNoTechStack = {
  $or: [
    { primaryTechStack: { $exists: false } },
    { primaryTechStack: null },
    { primaryTechStack: { $size: 0 } },
  ],
};
const emptyFieldFilter = (field) => ({
  $or: [
    { [field]: null },
    { [field]: "" },
    { [field]: { $exists: false } },
  ],
});
const lenientFieldInFilter = (field, values) => ({
  $or: [{ [field]: { $in: values } }, ...emptyFieldFilter(field).$or],
});

const buildProspectMatchFilter = (profile) => {
  const conditions = [];
  const industryTargets = [
    ...new Set([
      ...(profile.mappedIndustries || []),
      ...(profile.industries || []),
      ...(profile.commercialSectors || []),
    ]),
  ];
  if (industryTargets.length > 0) {
    conditions.push({ primaryIndustry: { $in: industryTargets } });
  }
  if (profile.businessModels?.length > 0) {
    conditions.push(lenientFieldInFilter("businessModel", profile.businessModels));
  }
  if (profile.commercialCategories?.length > 0) {
    conditions.push(lenientFieldInFilter("commercialCategory", profile.commercialCategories));
  }
  if (profile.annualRevenues?.length > 0) {
    conditions.push(lenientFieldInFilter("annualRevenue", profile.annualRevenues));
  }
  if (profile.employeeRanges?.length > 0) {
    conditions.push(lenientFieldInFilter("noOfEmployees", profile.employeeRanges));
  }

  const regionIncludedCountries = expandRegions(profile.targetRegionsInclude || []);
  const allIncluded = [
    ...new Set([...regionIncludedCountries, ...(profile.targetCountriesInclude || [])]),
  ];
  const regionExcludedCountries = expandRegions(profile.targetRegionsExclude || []);
  const allExcluded = [
    ...new Set([
      ...regionExcludedCountries,
      ...(profile.targetRegionCountriesExclude || []),
      ...(profile.targetCountriesExclude || []),
    ]),
  ];

  if (allIncluded.length > 0 && allExcluded.length > 0) {
    const finalIncluded = allIncluded.filter((c) => !allExcluded.includes(c));
    if (finalIncluded.length > 0) {
      conditions.push({ country: countryInFilter(finalIncluded) });
    }
  } else if (allIncluded.length > 0) {
    conditions.push({ country: countryInFilter(allIncluded) });
  } else if (allExcluded.length > 0) {
    conditions.push({
      country: {
        $nin: allExcluded.map((c) => new RegExp(`^${escapeRegex(c)}$`, "i")),
      },
    });
  }

  if (profile.techStackInclude?.length > 0) {
    conditions.push({
      $or: [
        { primaryTechStack: { $in: profile.techStackInclude } },
        hasNoTechStack,
        { primaryTechStack: { $type: "string" } },
      ],
    });
  }
  if (profile.techStackExclude?.length > 0) {
    conditions.push({ primaryTechStack: { $nin: profile.techStackExclude } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
};

await mongoose.connect(process.env.MONGO_URI);

const icp = await ICP.findById(ICP_ID).lean();
const filter = buildProspectMatchFilter(icp);
const total = await Prospect.countDocuments(filter);

console.log("Total matches with lenient filters:", total);

const sample = await Prospect.find(filter).limit(5).select("accountName businessModel annualRevenue noOfEmployees country primaryIndustry").lean();
console.log("Sample matches:", sample);

await mongoose.disconnect();
