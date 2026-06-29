import Contact from "../../modules/contacts/contact.model.js";
import Prospect from "../../modules/prospect/prospect.model.js";
import { companyObjectId, requireCompanyId } from "./tenantScope.js";
import { extractAccountFields } from "./contactImportHelpers.js";

const toPlain = (doc) =>
  doc?.toObject ? doc.toObject({ virtuals: true }) : { ...doc };

const findProspectForContact = (contact, prospectsByLower, allProspects) => {
  const cName = (contact.accountName || "").toLowerCase().trim();
  if (!cName) return null;

  if (prospectsByLower.has(cName)) return prospectsByLower.get(cName);

  return (
    allProspects.find((p) => {
      const pName = (p.accountName || "").toLowerCase().trim();
      return pName && (cName.includes(pName) || pName.includes(cName));
    }) || null
  );
};

const populatedAccountShape = (prospect) => ({
  _id: prospect._id,
  accountName: prospect.accountName,
  website: prospect.website ?? null,
  primaryIndustry: prospect.primaryIndustry ?? null,
  country: prospect.country ?? null,
});

/**
 * Contacts may have accountName but no accountId (legacy imports).
 * Resolve the matching prospect, attach populated accountId on the response,
 * and persist the link in the background.
 */
export async function resolveContactAccountLinks(contacts, companyId) {
  if (!contacts?.length) return [];

  const cid = companyObjectId(requireCompanyId(companyId));
  const plain = contacts.map(toPlain);

  const needsResolve = plain.filter((c) => !c.accountId && c.accountName?.trim());
  if (!needsResolve.length) return plain;

  const allProspects = await Prospect.find({ companyId: cid })
    .select(
      "_id accountName accountNameLower website primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal"
    )
    .lean();

  const byLower = new Map();
  for (const p of allProspects) {
    if (p.accountNameLower) byLower.set(p.accountNameLower, p);
  }

  const persistOps = [];

  for (const contact of plain) {
    if (contact.accountId || !contact.accountName?.trim()) continue;

    const prospect = findProspectForContact(contact, byLower, allProspects);
    if (!prospect) continue;

    contact.accountId = populatedAccountShape(prospect);
    contact.isLinked = true;
    contact.accountName = prospect.accountName;
    Object.assign(contact, extractAccountFields(prospect));

    persistOps.push({
      updateOne: {
        filter: { _id: contact._id, companyId: cid },
        update: {
          $set: {
            accountId: prospect._id,
            isLinked: true,
            accountName: prospect.accountName,
            ...extractAccountFields(prospect),
          },
        },
      },
    });
  }

  if (persistOps.length) {
    Contact.bulkWrite(persistOps, { ordered: false }).catch(() => {});
  }

  return plain;
}

export async function resolveContactAccountLink(contact, companyId) {
  const [resolved] = await resolveContactAccountLinks([contact], companyId);
  return resolved ?? null;
}
