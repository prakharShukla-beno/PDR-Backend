import enrichmentRepository from "./enrichment.repository.js";
import prospectRepository from "../prospect/prospect.repository.js";
import notificationService from "../notification/notification.service.js";

// Build the prompt to send to Claude for enrichment
const buildEnrichmentPrompt = (prospect) => {
  return `You are a B2B sales intelligence analyst. Analyze the following company/prospect data and return enriched insights.

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
  "intentSignals": ["string array of buying intent indicators observed"],
  "strategicCategory": "one of: High Value | Watch List | Not a Fit | null",
  "icpMatch": true or false,
  "priorityScore": integer between 0 and 100
}`;
};

// Single prospect ko Claude se enrich karo
const enrichSingleProspect = async (prospectId, userId) => {

  // Prospect fetch karo
  const prospect = await prospectRepository.findById(prospectId);
  if (!prospect) {
    const error = new Error("Prospect not found");
    error.statusCode = 404;
    throw error;
  }

  // Claude API call
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: buildEnrichmentPrompt(prospect),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    const error = new Error(`Claude API error: ${response.status} — ${errBody}`);
    error.statusCode = 502;
    throw error;
  }

  const claudeData = await response.json();
  const rawText = claudeData.content?.[0]?.text || "";

  // Parse Claude ka JSON response
  let enriched;
  try {
    // Strip markdown fences if Claude adds them
    const clean = rawText.replace(/```json|```/g, "").trim();
    enriched = JSON.parse(clean);
  } catch {
    const error = new Error("Claude returned invalid JSON — could not parse enrichment result");
    error.statusCode = 502;
    throw error;
  }

  // Validate priorityScore range
  const priorityScore = Number(enriched.priorityScore);
  if (isNaN(priorityScore) || priorityScore < 0 || priorityScore > 100) {
    enriched.priorityScore = null;
  } else {
    enriched.priorityScore = priorityScore;
  }

  // Enrichment DB mein save/update karo
  const saved = await enrichmentRepository.upsertByProspectId(prospectId, {
    techStack:          Array.isArray(enriched.techStack) ? enriched.techStack : [],
    intentSignals:      Array.isArray(enriched.intentSignals) ? enriched.intentSignals : [],
    strategicCategory:  enriched.strategicCategory || null,
    icpMatch:           typeof enriched.icpMatch === "boolean" ? enriched.icpMatch : null,
    priorityScore:      enriched.priorityScore,
    enrichedBy:         "ai_module",
    enrichedAt:         new Date(),
  });

  // Notification trigger karo agar userId mila
  if (userId) {
    await notificationService.create({
      userId,
      type:          "enrichment_done",
      message:       `Enrichment completed for ${prospect.accountName}`,
      refId:         prospectId,
      refCollection: "prospects",
    });
  }

  return saved;
};

const enrichmentService = {

  // Manual enrichment — single prospect
  enrichOne: async (prospectId, userId) => {
    return await enrichSingleProspect(prospectId, userId);
  },

  // Bulk enrichment — array of prospectIds
  enrichBulk: async (prospectIds, userId) => {
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      const error = new Error("prospectIds array is required and must not be empty");
      error.statusCode = 400;
      throw error;
    }

    const results = [];
    const errors  = [];

    // Ek ek karke process karo — rate limit avoid karne ke liye
    for (const prospectId of prospectIds) {
      try {
        const enriched = await enrichSingleProspect(prospectId, null);
        results.push({ prospectId, status: "success", data: enriched });
      } catch (err) {
        errors.push({ prospectId, status: "failed", reason: err.message });
      }
    }

    // Bulk complete hone ke baad ek notification
    if (userId && results.length > 0) {
      await notificationService.create({
        userId,
        type:          "enrichment_done",
        message:       `Bulk enrichment complete — ${results.length} succeeded, ${errors.length} failed`,
        refId:         null,
        refCollection: null,
      });
    }

    return {
      total:        prospectIds.length,
      successCount: results.length,
      failedCount:  errors.length,
      results,
      errors,
    };
  },

  // Get enrichment data for a prospect
  getByProspectId: async (prospectId) => {
    const enrichment = await enrichmentRepository.findByProspectId(prospectId);

    if (!enrichment) {
      const error = new Error("Enrichment not found for this prospect");
      error.statusCode = 404;
      throw error;
    }

    return enrichment;
  },
};

export default enrichmentService;