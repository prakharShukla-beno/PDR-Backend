const FUNCTIONAL_DOMAINS = [
  "Corporate Strategy", "Technology & Digital", "Data & AI",
  "Finance & Accounting", "Revenue & Growth", "Product & Creative",
  "Operations & Logistics", "People & HR", "Legal & Governance",
  "Healthcare & Life Sciences", "Industrial & Engineering",
  "Resources & Utilities", "Public Sector & NGO",
];

export const extractAccountFields = (prospect) => ({
  accountIndustry:      prospect.primaryIndustry  || null,
  accountCountry:       prospect.country           || null,
  accountCity:          prospect.hqLocationCity    || null,
  accountEmployees:     prospect.noOfEmployees     || null,
  accountRevenue:       prospect.annualRevenue     || null,
  accountBusinessModel: prospect.businessModel     || null,
  accountSalesPriority: prospect.salesPriority     || null,
  accountClvRanking:    prospect.clvRanking        || null,
  accountTechFitScore:  prospect.techFitScore      || null,
  accountIntentSignal:  prospect.intentSignal      || null,
  accountWebsite:       prospect.website           || null,
});

const resolveFunctionalDomain = (department) => {
  if (!department) return { functionalDomain: null, keyFocusAreas: null };
  const trimmed = department.trim();
  if (FUNCTIONAL_DOMAINS.includes(trimmed)) {
    return { functionalDomain: trimmed, keyFocusAreas: null };
  }
  const lower = trimmed.toLowerCase();
  const exact = FUNCTIONAL_DOMAINS.find((d) => d.toLowerCase() === lower);
  if (exact) return { functionalDomain: exact, keyFocusAreas: null };

  const aliasRules = [
    { patterns: [/tech|it\b|digital|software|engineering/i], value: "Technology & Digital" },
    { patterns: [/finance|accounting|fp&a/i], value: "Finance & Accounting" },
    { patterns: [/sales|revenue|growth|marketing/i], value: "Revenue & Growth" },
    { patterns: [/hr|people|talent/i], value: "People & HR" },
    { patterns: [/legal|compliance|governance/i], value: "Legal & Governance" },
    { patterns: [/operations|logistics|supply/i], value: "Operations & Logistics" },
  ];
  for (const { patterns, value } of aliasRules) {
    if (patterns.some((p) => p.test(trimmed))) {
      return { functionalDomain: value, keyFocusAreas: null };
    }
  }
  return { functionalDomain: null, keyFocusAreas: trimmed };
};

export const hasContactPayload = (contact) =>
  !!(contact?.name || contact?.email || contact?.phone || contact?.designation);

export const buildContactDocs = (row, prospect, importLogId, source = "account_import", companyId = null) => {
  const contacts = row.contacts;
  if (!contacts?.length) return [];

  const resolvedCompanyId = companyId ?? prospect.companyId ?? null;
  const accountFields = extractAccountFields(prospect);
  const docs = [];

  for (const contact of contacts) {
    if (!hasContactPayload(contact)) continue;

    const nameParts = (contact.name || "").trim().split(/\s+/).filter(Boolean);
    const { functionalDomain, keyFocusAreas } = resolveFunctionalDomain(contact.department);

    docs.push({
      companyId:         resolvedCompanyId,
      accountId:         prospect._id,
      accountName:       prospect.accountName || row.accountName,
      isLinked:          true,
      ...accountFields,
      firstName:         nameParts[0] || null,
      lastName:          nameParts.slice(1).join(" ") || null,
      standardizedRoles: contact.designation || null,
      functionalDomain,
      keyFocusAreas:     keyFocusAreas || null,
      seniority:         contact.seniority || null,
      email:             contact.email ? contact.email.toLowerCase().trim() : null,
      primaryPhone:      contact.phone || null,
      secondaryPhone:    contact.phone2 || null,
      linkedIn:          contact.linkedIn || null,
      isPrimary:         contact.isPrimary ?? true,
      source,
      importLogId:       importLogId || null,
    });
  }

  return docs;
};

/** Persist parsed row contacts onto an existing prospect (skips duplicate emails) */
export const saveContactsForProspect = async (Contact, row, prospect, importLogId, companyId = null) => {
  const resolvedCompanyId = companyId ?? prospect.companyId ?? null;
  const docs = buildContactDocs(row, prospect, importLogId, "account_import", resolvedCompanyId);
  let saved = 0;

  for (const doc of docs) {
    if (doc.email) {
      const exists = await Contact.findOne({
        accountId: prospect._id,
        companyId: resolvedCompanyId,
        email:     doc.email,
      }).select("_id").lean();
      if (exists) continue;
    }
    await Contact.create(doc);
    saved++;
  }

  return saved;
};
