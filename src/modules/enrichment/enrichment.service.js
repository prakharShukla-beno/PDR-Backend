import OpenAI from "openai";
import enrichmentRepository  from "./enrichment.repository.js";
import prospectRepository    from "../prospect/prospect.repository.js";
import { calculateScore }    from "../../common/utils/scoring.js";
import notificationService   from "../notification/notification.service.js";
import auditLogService       from "../auditLog/auditLog.service.js";

// ── AI provider detection — OpenAI takes priority when both keys exist ────────
const AI_PROVIDER = process.env.OPENAI_API_KEY ? "openai" : "gemini";

console.log(`AI Enrichment provider: ${AI_PROVIDER}`);

if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
  console.warn(
    "⚠️  WARNING: Neither OPENAI_API_KEY nor GEMINI_API_KEY is set. " +
    "AI Enrichment will fail. Add at least one key to .env"
  );
}

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const EMPLOYEE_RANGES = [
  "1-10", "11-50", "51-200", "201-500", "501-1,000",
  "1,001-5,000", "5,001-10,000", "10,000+",
];
const INTENT_SIGNALS = [
  "Hyper-Growth Mode", "Cost Containment", "Risk Mitigation",
  "Modernization Mandate", "Capital Event", "Regulatory Action",
  "Earnings Shock", "Strategic Pivot", "Security Incident", "Job Postings",
];
const REVENUE_BUCKETS = [
  "Seed <$1M", "Early $1M-$10M", "Scale-Up $10M-$50M",
  "Mid-Market $50M-$250M", "Corporate $250M-$1B", "Enterprise $1B+",
];
const TECH_ADOPTION_PROFILES = [
  "Innovator", "Early Adopter", "Mainstream", "Laggard", "Leapfrog",
];

/** True when AI should still fill missing prospect fields */
export const needsEnrichment = (prospect) => {
  if (!prospect) return false;
  return (
    !prospect.noOfEmployees ||
    !prospect.intentSignal ||
    !prospect.financialCapacity ||
    !prospect.strategicValue ||
    !prospect.marginPotential ||
    !prospect.techAdoptionProfile ||
    !prospect.technologyAlignment ||
    !prospect.primaryTechStack?.length
  );
};

const normalizeEmployeeRange = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (EMPLOYEE_RANGES.includes(raw)) return raw;

  const nums = raw.replace(/,/g, "").match(/\d+/g)?.map(Number) || [];
  const max  = nums.length ? Math.max(...nums) : 0;

  if (max >= 10000 || /10,?000\+|10k\+/i.test(raw)) return "10,000+";
  if (max >= 5001)  return "5,001-10,000";
  if (max >= 1001)  return "1,001-5,000";
  if (max >= 501)   return "501-1,000";
  if (max >= 201)   return "201-500";
  if (max >= 51)    return "51-200";
  if (max >= 11)    return "11-50";
  if (max >= 1)     return "1-10";
  return null;
};

const pickEnum = (value, allowed) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (allowed.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  return allowed.find((v) => v.toLowerCase() === lower) || null;
};

// ── Scoring field normalization — AI must map to exact enum values ───────────
const SCORING_FIELD_ALLOWED = {
  financialCapacity:   ["Enterprise", "Mid-Market", "Small Business"],
  strategicValue:      ["Market Maker", "VC Backed", "Standard"],
  marginPotential:     ["High Margins", "Standard Margins", "Low Margins"],
  technologyAlignment: ["Core Match", "Adjacent Match", "No Match"],
};

const SCORING_FIELD_DEFAULTS = {
  financialCapacity:   "Small Business",
  strategicValue:      "Standard",
  marginPotential:     "Standard Margins",
  technologyAlignment: "Adjacent Match",
};

const SCORING_FIELD_NORMALIZE = {
  financialCapacity: {
    enterprise: "Enterprise", large: "Enterprise",
    "mid market": "Mid-Market", medium: "Mid-Market",
    "mid-market": "Mid-Market", smb: "Small Business",
    small: "Small Business", startup: "Small Business",
  },
  strategicValue: {
    "market maker": "Market Maker", unicorn: "Market Maker",
    "vc backed": "VC Backed", "vc-backed": "VC Backed",
    funded: "VC Backed", standard: "Standard", none: "Standard",
  },
  marginPotential: {
    high: "High Margins", "high margins": "High Margins",
    standard: "Standard Margins", medium: "Standard Margins",
    low: "Low Margins", "low margins": "Low Margins",
  },
  technologyAlignment: {
    core: "Core Match", "core match": "Core Match",
    adjacent: "Adjacent Match", partial: "Adjacent Match",
    "no match": "No Match", none: "No Match", legacy: "No Match",
  },
};

const normalizeEnrichmentField = (field, value) => {
  if (!value) return SCORING_FIELD_DEFAULTS[field];
  const allowed = SCORING_FIELD_ALLOWED[field];
  const raw = String(value).trim();
  if (allowed.includes(raw)) return raw;
  const normalized = SCORING_FIELD_NORMALIZE[field]?.[raw.toLowerCase()];
  if (normalized) return normalized;
  console.warn(`Enrichment: unexpected ${field} value "${value}" → using default`);
  return SCORING_FIELD_DEFAULTS[field];
};

const applyScoringFieldSuggestions = (prospect, suggestions, parsed, updateData) => {
  const scoringFields = [
    "financialCapacity",
    "strategicValue",
    "marginPotential",
    "technologyAlignment",
  ];

  for (const field of scoringFields) {
    if (prospect[field]) continue;
    const raw = suggestions[field] ?? parsed[field];
    updateData[field] = normalizeEnrichmentField(field, raw);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseAIJson = (raw) => {
  const cleaned = String(raw)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .replace(/```json|```/g, "")
    .trim();
  return JSON.parse(cleaned);
};

// ── Shared enrichment prompt — used by OpenAI and Gemini identically ──────────
const buildEnrichmentPrompt = (prospect) => {
  const techStack = Array.isArray(prospect.primaryTechStack)
    ? prospect.primaryTechStack.join(", ")
    : (prospect.primaryTechStack || "unknown");

  return `You are a B2B sales intelligence analyst.
Analyze this company and return enrichment data as valid JSON only.
No markdown, no backticks, no explanation — pure JSON.

Company: ${prospect.accountName}
Website: ${prospect.website ?? "unknown"}
Country: ${prospect.country ?? "unknown"}
Industry: ${prospect.primaryIndustry ?? "unknown"}
Business Model: ${prospect.businessModel ?? "unknown"}
Employees: ${prospect.noOfEmployees ?? "unknown"}
Revenue: ${prospect.annualRevenue ?? "unknown"}
Tech Stack: ${techStack}
Tech Adoption Profile: ${prospect.techAdoptionProfile ?? "unknown"}
Infrastructure Risk: ${prospect.infrastructureRisk ?? "unknown"}
Current Intent Signal: ${prospect.intentSignal ?? "unknown"}
Sales Priority: ${prospect.salesPriority ?? "unknown"}
CLV Ranking: ${prospect.clvRanking ?? "unknown"}

Return ONLY this JSON structure with ALL fields populated (never omit a field):

{
  "financialCapacity": "Enterprise" | "Mid-Market" | "Small Business",
  "strategicValue": "Market Maker" | "VC Backed" | "Standard",
  "marginPotential": "High Margins" | "Standard Margins" | "Low Margins",
  "technologyAlignment": "Core Match" | "Adjacent Match" | "No Match",
  "primaryTechStack": ["array", "of", "4-10", "detected", "tools"],
  "techStack": ["same as primaryTechStack — duplicate for compatibility"],
  "intentSignals": ["array of 2-5 buyer intent indicators as short strings"],
  "buyerIntentSignal": "one exact value from allowed list below",
  "strategicCategory": "High Value" | "Watch List" | "Not a Fit",
  "icpMatch": true or false,
  "missingFieldSuggestions": {
    "primaryIndustry": "suggested industry string",
    "annualRevenue": "one exact revenue bucket",
    "noOfEmployees": "one exact employee range",
    "techAdoptionProfile": "one exact adoption profile",
    "financialCapacity": "Enterprise | Mid-Market | Small Business",
    "strategicValue": "Market Maker | VC Backed | Standard",
    "marginPotential": "High Margins | Standard Margins | Low Margins",
    "technologyAlignment": "Core Match | Adjacent Match | No Match"
  }
}

SCORING FIELD RULES (use exact strings — never return null for these 4):

"financialCapacity":
  Enterprise     = revenue > $200M OR employees > 1000
  Mid-Market     = revenue $50M–$200M OR employees 201–1000
  Small Business = revenue < $50M OR employees < 201
  Default: "Small Business"

"strategicValue":
  Market Maker = household name brand OR unicorn (valuation > $1B)
  VC Backed    = raised Series B+ funding recently
  Standard     = no significant brand equity or recent funding
  Default: "Standard"

"marginPotential":
  High Margins     = BFSI, SaaS, Healthcare, Legal, Pharma, Fintech
  Standard Margins = IT Services, Manufacturing, Professional Services, Energy, Education
  Low Margins      = Retail, Logistics, E-commerce, Construction, Government, Hospitality
  Default: "Standard Margins"

"technologyAlignment":
  Core Match     = React, Node.js, Python, AWS, Azure, GCP, Salesforce, Docker, Kubernetes, PostgreSQL, MongoDB, or similar modern cloud/web stack
  Adjacent Match = PHP, HubSpot, Shopify, partial cloud adoption, or unknown stack
  No Match       = Mainframe, COBOL, SAP On-Premise, Oracle legacy, competitor proprietary systems
  Default: "Adjacent Match" if uncertain

ALLOWED VALUES FOR OTHER FIELDS:

"buyerIntentSignal" — exactly one of:
  ${INTENT_SIGNALS.map((s) => `"${s}"`).join(" | ")}

"annualRevenue" / missingFieldSuggestions.annualRevenue — exactly one of:
  ${REVENUE_BUCKETS.map((s) => `"${s}"`).join(" | ")}

"noOfEmployees" / missingFieldSuggestions.noOfEmployees — exactly one of:
  ${EMPLOYEE_RANGES.map((s) => `"${s}"`).join(" | ")}

"techAdoptionProfile" / missingFieldSuggestions.techAdoptionProfile — exactly one of:
  ${TECH_ADOPTION_PROFILES.map((s) => `"${s}"`).join(" | ")}

"primaryTechStack" / "techStack":
  Array of 4–10 specific tools (e.g. ["AWS", "Salesforce", "React", "PostgreSQL", "Docker"])
  Use empty array [] only if truly unknown.

"intentSignals":
  Array of 2–5 short strings describing buying signals (hiring, funding, expansion, etc.)

"strategicCategory":
  High Value = strong fit for enterprise B2B sales
  Watch List = potential but needs nurturing
  Not a Fit = poor fit for typical ICP

"icpMatch":
  true if company matches a typical B2B SaaS/IT services ICP (51–5000 employees, modern tech, growth market)
  false otherwise

CRITICAL RULES:
- Never return null for financialCapacity, strategicValue, marginPotential, or technologyAlignment.
- Populate every key in missingFieldSuggestions with your best estimate.
- primaryTechStack must be an array (use [] only if completely unknown).
- Return valid JSON only — no markdown fences, no commentary.`;
};

// ── OpenAI enrichment call ────────────────────────────────────────────────────
const enrichWithOpenAI = async (prospect) => {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const prompt = buildEnrichmentPrompt(prospect);

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a B2B sales intelligence analyst. Return only valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return parseAIJson(raw);
};

// ── Gemini enrichment call (existing REST API) ────────────────────────────────
const enrichWithGemini = async (prospect) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = buildEnrichmentPrompt(prospect);
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    console.error("Gemini full error:", JSON.stringify(errBody, null, 2));
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data    = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  console.log("Gemini raw response:", content.slice(0, 200));
  return parseAIJson(content);
};

// ── Unified enrichment caller with cross-provider fallback ─────────────────────
const callAIEnrichment = async (prospect) => {
  try {
    if (AI_PROVIDER === "openai") {
      console.log(`Enriching ${prospect.accountName} via OpenAI...`);
      return await enrichWithOpenAI(prospect);
    }
    console.log(`Enriching ${prospect.accountName} via Gemini...`);
    return await enrichWithGemini(prospect);
  } catch (primaryError) {
    console.error(`Primary provider (${AI_PROVIDER}) failed:`, primaryError.message);

    if (AI_PROVIDER === "openai" && process.env.GEMINI_API_KEY) {
      console.log("Falling back to Gemini...");
      return await enrichWithGemini(prospect);
    }
    if (AI_PROVIDER === "gemini" && process.env.OPENAI_API_KEY) {
      console.log("Falling back to OpenAI...");
      return await enrichWithOpenAI(prospect);
    }

    throw primaryError;
  }
};

// ── Single prospect enrich ────────────────────────────────────────────────────
const enrichSingleProspect = async (prospectId, userId) => {
  const prospect = await prospectRepository.findById(prospectId);
  if (!prospect) {
    const error = new Error("Prospect not found");
    error.statusCode = 404;
    throw error;
  }

  const parsed = await callAIEnrichment(prospect);

  const updateData = {};
  const suggestions = parsed.missingFieldSuggestions || {};

  if (!prospect.primaryIndustry && suggestions.primaryIndustry)
    updateData.primaryIndustry = suggestions.primaryIndustry;

  const revenueRaw = suggestions.annualRevenue ?? parsed.annualRevenue;
  if (!prospect.annualRevenue && revenueRaw) {
    const revenue = pickEnum(revenueRaw, REVENUE_BUCKETS);
    if (revenue) updateData.annualRevenue = revenue;
  }

  const employeesRaw = suggestions.noOfEmployees ?? parsed.noOfEmployees;
  if (!prospect.noOfEmployees && employeesRaw) {
    const employees = normalizeEmployeeRange(employeesRaw);
    if (employees) updateData.noOfEmployees = employees;
  }

  if (!prospect.techAdoptionProfile && suggestions.techAdoptionProfile) {
    const profile = pickEnum(suggestions.techAdoptionProfile, TECH_ADOPTION_PROFILES);
    if (profile) updateData.techAdoptionProfile = profile;
  }

  applyScoringFieldSuggestions(prospect, suggestions, parsed, updateData);

  const intentRaw = parsed.buyerIntentSignal ?? parsed.intentSignal;
  if (intentRaw && !prospect.intentSignal) {
    const intent = pickEnum(intentRaw, INTENT_SIGNALS);
    if (intent) updateData.intentSignal = intent;
  }

  const detectedStack = parsed.primaryTechStack ?? parsed.techStack;
  if (
    Array.isArray(detectedStack) &&
    detectedStack.length > 0 &&
    (!prospect.primaryTechStack || prospect.primaryTechStack.length === 0)
  ) {
    updateData.primaryTechStack = detectedStack;
  }

  if (Object.keys(updateData).length > 0) {
    await prospectRepository.updateSkipValidation(prospectId, updateData);
  }

  const updatedProspect = { ...prospect.toObject(), ...updateData };
  const scoreResult     = calculateScore(updatedProspect);

  await prospectRepository.updateSkipValidation(prospectId, {
    techFitScore:  scoreResult.techFitScore,
    finalScore:    scoreResult.finalScore,
    clvRanking:    scoreResult.clvRanking,
    salesPriority: scoreResult.salesPriority,
  });

  console.log(`Enrichment complete for ${updatedProspect.accountName}:
  financialCapacity:   ${updatedProspect.financialCapacity}
  strategicValue:      ${updatedProspect.strategicValue}
  marginPotential:     ${updatedProspect.marginPotential}
  technologyAlignment: ${updatedProspect.technologyAlignment}
  → finalScore: ${scoreResult.finalScore} (${scoreResult.clvRanking})`);

  const enrichment = await enrichmentRepository.upsertByProspectId(prospectId, {
    prospectId,
    enrichedBy:       "ai_module",
    enrichedAt:        new Date(),
    techStack:         detectedStack || parsed.techStack || [],
    intentSignals:     parsed.intentSignals || [],
    strategicCategory: parsed.strategicCategory || null,
    icpMatch:          parsed.icpMatch ?? false,
    priorityScore:     scoreResult.finalScore || 0,
    rawResponse:       parsed,
  });

  await auditLogService.log({
    userId,
    action:      "UPDATE",
    entity:      "Prospect",
    entityId:    prospectId,
    description: `AI enrichment + scoring completed for "${prospect.accountName}"`,
    metadata: {
      aiProvider:     AI_PROVIDER,
      fieldsUpdated:  Object.keys(updateData),
      intentSignals:  parsed.intentSignals || [],
      finalScore:     scoreResult.finalScore,
      clvRanking:     scoreResult.clvRanking,
      salesPriority:  scoreResult.salesPriority,
      disqualified:   scoreResult.disqualified,
      icpMatch:       parsed.icpMatch,
    },
  });

  return enrichment;
};

const enrichmentService = {

  needsEnrichment,

  enrichSingle: async (prospectId, userId) => {
    return await enrichSingleProspect(prospectId, userId);
  },

  /** AI call with one retry — helps segment bulk runs under rate limits */
  enrichSingleWithRetry: async (prospectId, userId, retries = 1) => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await enrichSingleProspect(prospectId, userId);
      } catch (err) {
        lastError = err;
        if (attempt < retries) await sleep(2000);
      }
    }
    throw lastError;
  },

  enrichBulk: async (prospectIds, userId) => {
    const results = { success: 0, failed: 0, errors: [] };

    for (const prospectId of prospectIds) {
      try {
        await enrichSingleProspect(prospectId, userId);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ prospectId, error: err.message });
        console.error(`Enrichment failed for ${prospectId}:`, err.message);
      }
    }

    await notificationService.create({
      userId,
      type:    "enrichment_complete",
      message: `Bulk enrichment done — ${results.success} enriched, ${results.failed} failed`,
    });

    return results;
  },

  getHistory: async (prospectId) => {
    return await enrichmentRepository.findByProspectId(prospectId);
  },
};

export default enrichmentService;
