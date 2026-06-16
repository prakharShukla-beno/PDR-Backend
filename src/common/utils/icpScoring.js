/**
 * ICP Match Score Calculator
 *
 * Calculates how closely a prospect matches an ICP profile.
 * Score range: 0-100
 *
 * Weights:
 *   Firmographic  → 40 pts (industry 15, employee 15, revenue 10)
 *   Market        → 25 pts (country/region)
 *   Tech Stack    → 25 pts (tool overlap)
 *   Buyer Persona → 10 pts (designation match)
 */

// Region → Countries mapping (same as icp.service.js)
const REGION_COUNTRIES = {
  "North America (NA)":    ["United States", "Canada", "Mexico"],
  "Europe":                ["United Kingdom", "Germany", "France", "Netherlands",
                            "Sweden", "Norway", "Denmark", "Finland", "Switzerland",
                            "Austria", "Belgium", "Spain", "Italy", "Portugal",
                            "Ireland", "Poland", "Czech Republic", "Hungary",
                            "Romania", "Bulgaria", "Greece", "Croatia", "Slovakia",
                            "Slovenia", "Estonia", "Latvia", "Lithuania"],
  "Asia-Pacific (APAC)":   ["China", "Japan", "South Korea", "Australia",
                            "New Zealand", "Hong Kong", "Taiwan"],
  "South Asia":            ["India", "Pakistan", "Bangladesh", "Sri Lanka",
                            "Nepal", "Bhutan", "Maldives", "Afghanistan"],
  "Southeast Asia":        ["Singapore", "Indonesia", "Malaysia", "Thailand",
                            "Vietnam", "Philippines", "Myanmar", "Cambodia",
                            "Laos", "Brunei"],
  "Middle East":           ["Turkey", "Israel", "Jordan", "Lebanon", "Syria",
                            "Iraq", "Iran", "Yemen", "Oman", "Kuwait",
                            "Bahrain", "Qatar"],
  "GCC":                   ["Saudi Arabia", "United Arab Emirates", "Qatar",
                            "Kuwait", "Bahrain", "Oman"],
  "Latin America (LATAM)": ["Brazil", "Mexico", "Argentina", "Colombia",
                            "Chile", "Peru", "Venezuela", "Ecuador", "Bolivia",
                            "Paraguay", "Uruguay", "Costa Rica", "Panama"],
  "Africa":                ["South Africa", "Nigeria", "Kenya", "Egypt",
                            "Ghana", "Ethiopia", "Tanzania", "Uganda", "Rwanda",
                            "Morocco", "Tunisia", "Algeria"],
};

const expandRegions = (regions = []) => {
  const countries = [];
  for (const region of regions) {
    if (REGION_COUNTRIES[region]) countries.push(...REGION_COUNTRIES[region]);
  }
  return [...new Set(countries)];
};

// ── FIRMOGRAPHIC SCORE (40 pts) ──────────────────────────────────────────────

const scoreFirmographic = (prospect, icp) => {
  let score = 0;
  const breakdown = {};

  const icpIndustries = [
    ...(icp.mappedIndustries || []),
    ...(icp.industries || []),
    ...(icp.commercialSectors || []),
  ];

  if (icpIndustries.length === 0) {
    score += 15;
    breakdown.industry = { score: 15, reason: "No industry filter — full points" };
  } else if (
    icpIndustries.some(i =>
      i?.toLowerCase() === prospect.primaryIndustry?.toLowerCase()
    )
  ) {
    score += 15;
    breakdown.industry = { score: 15, reason: `Industry matched: ${prospect.primaryIndustry}` };
  } else {
    breakdown.industry = { score: 0, reason: `Industry not matched: ${prospect.primaryIndustry}` };
  }

  const icpEmployeeRanges = icp.employeeRanges || [];
  if (icpEmployeeRanges.length === 0) {
    score += 15;
    breakdown.employee = { score: 15, reason: "No employee filter — full points" };
  } else if (icpEmployeeRanges.includes(prospect.noOfEmployees)) {
    score += 15;
    breakdown.employee = { score: 15, reason: `Employee range matched: ${prospect.noOfEmployees}` };
  } else {
    breakdown.employee = { score: 0, reason: `Employee range not matched: ${prospect.noOfEmployees}` };
  }

  const icpRevenues = icp.annualRevenues || [];
  if (icpRevenues.length === 0) {
    score += 10;
    breakdown.revenue = { score: 10, reason: "No revenue filter — full points" };
  } else if (icpRevenues.includes(prospect.annualRevenue)) {
    score += 10;
    breakdown.revenue = { score: 10, reason: `Revenue matched: ${prospect.annualRevenue}` };
  } else {
    breakdown.revenue = { score: 0, reason: `Revenue not matched: ${prospect.annualRevenue}` };
  }

  return { score, breakdown, maxScore: 40 };
};

// ── MARKET SCORE (25 pts) ────────────────────────────────────────────────────

const scoreMarket = (prospect, icp) => {
  let score = 0;
  const breakdown = {};

  const regionIncluded  = expandRegions(icp.targetRegionsInclude || []);
  const regionExcluded  = expandRegions(icp.targetRegionsExclude || []);
  const allIncluded = [
    ...new Set([...regionIncluded, ...(icp.targetCountriesInclude || [])]),
  ];
  const allExcluded = [
    ...new Set([
      ...regionExcluded,
      ...(icp.targetRegionCountriesExclude || []),
      ...(icp.targetCountriesExclude || []),
    ]),
  ];

  if (allIncluded.length === 0 && allExcluded.length === 0) {
    score += 25;
    breakdown.market = { score: 25, reason: "No market filter — full points" };
  } else if (allExcluded.includes(prospect.country)) {
    breakdown.market = { score: 0, reason: `Country excluded: ${prospect.country}` };
  } else if (allIncluded.length > 0 && allIncluded.includes(prospect.country)) {
    score += 25;
    breakdown.market = { score: 25, reason: `Country matched: ${prospect.country}` };
  } else if (allIncluded.length > 0) {
    breakdown.market = { score: 0, reason: `Country not in target market: ${prospect.country}` };
  } else {
    score += 25;
    breakdown.market = { score: 25, reason: "Not excluded — full points" };
  }

  return { score, breakdown, maxScore: 25 };
};

// ── TECH STACK SCORE (25 pts) ────────────────────────────────────────────────

const scoreTechStack = (prospect, icp) => {
  let score = 0;
  const breakdown = {};

  const icpTechInclude = icp.techStackInclude || [];
  const icpTechExclude = icp.techStackExclude || [];
  const prospectStack  = (prospect.primaryTechStack || []).map(t => t.toLowerCase());

  if (icpTechInclude.length === 0 && icpTechExclude.length === 0) {
    score += 25;
    breakdown.tech = { score: 25, reason: "No tech filter — full points" };
    return { score, breakdown, maxScore: 25 };
  }

  const usesExcluded = icpTechExclude.some(t =>
    prospectStack.includes(t.toLowerCase())
  );
  if (usesExcluded) {
    breakdown.tech = { score: 0, reason: "Uses excluded technology" };
    return { score: 0, breakdown, maxScore: 25 };
  }

  if (icpTechInclude.length === 0) {
    score += 25;
    breakdown.tech = { score: 25, reason: "Passes exclusion check" };
    return { score, breakdown, maxScore: 25 };
  }

  const matchedTools = icpTechInclude.filter(t =>
    prospectStack.includes(t.toLowerCase())
  );
  const matchRatio = matchedTools.length / icpTechInclude.length;

  if (matchRatio >= 0.5) {
    score += 25;
    breakdown.tech = {
      score: 25,
      reason: `Core Match — ${matchedTools.length}/${icpTechInclude.length} tools matched`,
      matched: matchedTools,
    };
  } else if (matchedTools.length > 0) {
    score += 12;
    breakdown.tech = {
      score: 12,
      reason: `Adjacent Match — ${matchedTools.length}/${icpTechInclude.length} tools matched`,
      matched: matchedTools,
    };
  } else {
    breakdown.tech = {
      score: 0,
      reason: "No tech stack overlap",
    };
  }

  return { score, breakdown, maxScore: 25 };
};

// ── BUYER PERSONA SCORE (10 pts) ─────────────────────────────────────────────

const scoreBuyerPersona = async (prospect, icp, Contact) => {
  let score = 0;
  const breakdown = {};

  const designations = icp.buyerPersona?.designations ||
                       icp.buyerPersona?.targetDesignations || [];
  const functionalDomains = icp.buyerPersona?.functionalDomains || [];
  const seniorityLevels   = icp.buyerPersona?.seniorityLevels || [];

  if (
    designations.length === 0 &&
    functionalDomains.length === 0 &&
    seniorityLevels.length === 0
  ) {
    score += 10;
    breakdown.persona = { score: 10, reason: "No persona filter — full points" };
    return { score, breakdown, maxScore: 10 };
  }

  const contactFilter = { accountId: prospect._id };
  if (designations.length > 0) {
    contactFilter.standardizedRoles = {
      $in: designations.map(d => new RegExp(d, "i")),
    };
  }

  const matchingContact = await Contact.findOne(contactFilter).lean();

  if (matchingContact) {
    score += 10;
    breakdown.persona = {
      score: 10,
      reason: `Matching contact found: ${matchingContact.standardizedRoles}`,
    };
  } else {
    breakdown.persona = { score: 0, reason: "No matching contact/designation found" };
  }

  return { score, breakdown, maxScore: 10 };
};

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────

export const calculateIcpMatchScore = async (prospect, icp, Contact) => {
  const firmographic = scoreFirmographic(prospect, icp);
  const market       = scoreMarket(prospect, icp);
  const tech         = scoreTechStack(prospect, icp);
  const persona      = await scoreBuyerPersona(prospect, icp, Contact);

  const totalScore = Math.round(
    firmographic.score + market.score + tech.score + persona.score
  );

  return {
    icpMatchScore: totalScore,
    maxScore: 100,
    breakdown: {
      firmographic: firmographic.breakdown,
      market:       market.breakdown,
      tech:         tech.breakdown,
      persona:      persona.breakdown,
      formula: `${firmographic.score}(firm) + ${market.score}(market) + ${tech.score}(tech) + ${persona.score}(persona) = ${totalScore}`,
    },
  };
};
