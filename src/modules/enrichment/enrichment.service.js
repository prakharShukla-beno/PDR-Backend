import enrichmentRepository from "./enrichment.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";

// ── Enrichment prompt — FR-5.1, FR-5.2, FR-5.3 ───────────────────────────────
const buildEnrichmentPrompt = (prospect) => {
  return `You are a B2B sales intelligence analyst. Analyze the following company data and return enriched insights.

Prospect Data:
- Account Name: ${prospect.accountName}
- Website: ${prospect.website || "N/A"}
- Primary Industry: ${prospect.primaryIndustry || "N/A"}
- Business Model: ${prospect.businessModel || "N/A"}
- Country: ${prospect.country || "N/A"}
- Annual Revenue: ${prospect.annualRevenue || "N/A"}
- No. of Employees: ${prospect.noOfEmployees || "N/A"}
- Current Tech Stack: ${prospect.primaryTechStack || "N/A"}
- Tech Adoption Profile: ${prospect.techAdoptionProfile || "N/A"}
- Infrastructure Risk: ${prospect.infrastructureRisk || "N/A"}
- Intent Signal: ${prospect.intentSignal || "N/A"}
- Sales Priority: ${prospect.salesPriority || "N/A"}
- CLV Ranking: ${prospect.clvRanking || "N/A"}

Return ONLY a valid JSON object (no markdown, no explanation) with exactly these fields:
{
  "techStack": ["string array of inferred tech tools/platforms they likely use"],
  "intentSignals": ["string array of buyer intent indicators — e.g. hiring patterns, funding events, product launches"],
  "buyerIntentSignal": "one of: Hyper-Growth Mode | Cost Containment | Risk Mitigation | Modernization Mandate | null",
  "strategicCategory": "one of: High Value | Watch List | Not a Fit | null",
  "icpMatch": true or false,
  "priorityScore": integer between 0 and 100,
  "missingFieldSuggestions": {
    "primaryIndustry": "suggested value or null",
    "annualRevenue": "suggested value or null",
    "noOfEmployees": "suggested value or null",
    "techAdoptionProfile": "suggested value or null",
    "financialCapacity": "suggested value or null",
    "marginPotential": "suggested value or null",
    "strategicValue": "suggested value or null"
  }
}`;
};

// ── Single prospect enrich ────────────────────────────────────────────────────
const enrichSingleProspect = async (prospectId, userId) => {
  const prospect = await prospectRepository.findById(prospectId);
  if (!prospect) {
    const error = new Error("Prospect not found");
    error.statusCode = 404;
    throw error;
  }

  // ── Gemini API call ───────────────────────────────────────────────────────
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  console.log("Gemini URL:", geminiUrl.replace(process.env.GEMINI_API_KEY, "***"));

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildEnrichmentPrompt(prospect) }] }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json();
    console.error("Gemini full error:", JSON.stringify(errBody, null, 2));
    const error = new Error(`Gemini API error: ${response.statusText}`);
    error.statusCode = 502;
    throw error;
  }

  const data    = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  console.log("Gemini raw response:", content.slice(0, 200));

  let parsed;
  try {
    const cleaned = content.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse Gemini response as JSON");
  }

  // ── FR-5.1 & FR-5.2: Fill missing fields using AI suggestions ────────────
  const updateData = {};
  const suggestions = parsed.missingFieldSuggestions || {};

  if (!prospect.primaryIndustry    && suggestions.primaryIndustry)
    updateData.primaryIndustry     = suggestions.primaryIndustry;
  if (!prospect.annualRevenue       && suggestions.annualRevenue)
    updateData.annualRevenue       = suggestions.annualRevenue;
  if (!prospect.noOfEmployees       && suggestions.noOfEmployees)
    updateData.noOfEmployees       = suggestions.noOfEmployees;
  if (!prospect.techAdoptionProfile && suggestions.techAdoptionProfile)
    updateData.techAdoptionProfile = suggestions.techAdoptionProfile;
  if (!prospect.financialCapacity   && suggestions.financialCapacity)
    updateData.financialCapacity   = suggestions.financialCapacity;
  if (!prospect.marginPotential     && suggestions.marginPotential)
    updateData.marginPotential     = suggestions.marginPotential;
  if (!prospect.strategicValue      && suggestions.strategicValue)
    updateData.strategicValue      = suggestions.strategicValue;

  // ── FR-5.3: Update buyer intent signal if available ───────────────────────
  if (parsed.buyerIntentSignal && !prospect.intentSignal) {
    updateData.intentSignal = parsed.buyerIntentSignal;
  }

  if (parsed.priorityScore !== undefined) {
    updateData.techFitScore = parsed.priorityScore;
  }

  if (Object.keys(updateData).length > 0) {
    await prospectRepository.update(prospectId, updateData);
  }

  // ── Save enrichment record ────────────────────────────────────────────────
  const enrichment = await enrichmentRepository.create({
    prospectId,
    enrichedBy:       "ai_module",
    enrichedAt:        new Date(),
    techStack:         parsed.techStack         || [],
    intentSignals:     parsed.intentSignals     || [],
    strategicCategory: parsed.strategicCategory || null,
    icpMatch:          parsed.icpMatch          ?? false,
    priorityScore:     parsed.priorityScore     || 0,
    rawResponse:       parsed,
  });

  // ── FR-4.3: Audit log ─────────────────────────────────────────────────────
  await auditLogService.log({
    userId,
    action:      "UPDATE",
    entity:      "Prospect",
    entityId:    prospectId,
    description: `AI enrichment completed for "${prospect.accountName}"`,
    metadata: {
      fieldsUpdated: Object.keys(updateData),
      intentSignals: parsed.intentSignals || [],
      priorityScore: parsed.priorityScore,
      icpMatch:      parsed.icpMatch,
    },
  });

  return enrichment;
};

const enrichmentService = {

  enrichSingle: async (prospectId, userId) => {
    return await enrichSingleProspect(prospectId, userId);
  },

  // Bulk enrichment — runs in background
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
