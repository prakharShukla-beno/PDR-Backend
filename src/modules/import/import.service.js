import fs from "fs";
import { processExcelFile } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";
import contactRepository from "../contacts/contact.repository.js";
import Prospect from "../prospect/prospect.model.js";
import Contact from "../contacts/contact.model.js";

const CHUNK_SIZE = 1000;

// ─── Helper: Prospect se denormalized fields nikalo ───────────────────────────
const extractAccountFields = (prospect) => ({
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

// ─── Helper: Safe insertMany ──────────────────────────────────────────────────
const safeInsertMany = async (repository, docs, chunkNum) => {
  if (!docs || docs.length === 0) return 0;
  try {
    await repository.insertMany(docs, { ordered: false });
    console.log(`✅ Chunk ${chunkNum}: ${docs.length} rows inserted`);
    return docs.length;
  } catch (err) {
    if (err.name === "BulkWriteError" || err.code === 11000) {
      const inserted = err.result?.nInserted ?? err.result?.insertedCount ?? 0;
      console.warn(`⚠️  Chunk ${chunkNum}: ${inserted}/${docs.length} inserted (partial)`);
      return inserted;
    }
    console.error(`❌ Chunk ${chunkNum} error:`, err.message);
    return 0;
  }
};

const importService = {

  // ===========================================================================
  // ACCOUNT EXCEL IMPORT — Upsert: accountName/website pe match
  // ===========================================================================
  processExcelImport: async (filePath, userId) => {

    const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

    console.log(`📊 Total rows: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);
    if (errorDetails.length > 0) {
      console.log("❌ First 5 validation errors:", errorDetails.slice(0, 5));
    }

    // ── Import log create ──────────────────────────────────────────────────
    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "processing",
    });

    // ── Early exit ─────────────────────────────────────────────────────────
    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, {
        status:      "failed",
        failedCount: errorDetails.length,
      });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return {
        importLogId:   importLog._id,
        totalRows,
        successCount:  0,
        failedCount:   errorDetails.length,
        contactsSaved: 0,
        errorDetails,
        status:        "failed",
      };
    }

    // ── Existing prospects check ───────────────────────────────────────────
    const accountNames = validRows.map(r => r.accountName).filter(Boolean);
    const websites     = validRows.map(r => r.website).filter(Boolean);

    let existingProspects = { prospects: [] };
    if (accountNames.length > 0 || websites.length > 0) {
      existingProspects = await prospectRepository.findAll({
        filter: {
          $or: [
            { accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) } },
            { website:          { $in: websites.map(w => w.toLowerCase()) } },
          ],
        },
        page:  1,
        limit: 999999,
      });
    }

    // Fast lookup map
    const existingMap = {};
    for (const p of (existingProspects.prospects || [])) {
      if (p.accountName) existingMap[p.accountName.toLowerCase()] = p;
      if (p.website)     existingMap[p.website.toLowerCase()]     = p;
    }

    const newRows    = []; // fresh insert
    const upsertRows = []; // existing update

    for (const row of validRows) {
      const { contacts, ...prospectData } = row;
      const key     = row.accountName?.toLowerCase();
      const webKey  = row.website?.toLowerCase();
      const existing = existingMap[key] || existingMap[webKey] || null;

      if (existing) {
        upsertRows.push({ prospectData, existing, contacts });
      } else {
        newRows.push({
          ...prospectData,
          isDuplicate: false,
          source:      "excel",
          importLogId: importLog._id,
        });
      }
    }

    console.log(`📦 New: ${newRows.length} | Update existing: ${upsertRows.length}`);

    // ── Step 1: Naye rows insert ───────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
      const chunk    = newRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(prospectRepository, chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) {
        insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      }
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 2: Existing update (upsert) ──────────────────────────────────
    let updatedCount = 0;
    for (const { prospectData, existing } of upsertRows) {
      try {
        await Prospect.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              ...prospectData,
              accountNameLower: prospectData.accountName?.toLowerCase().trim() || null,
              source:           "excel",
            },
          },
          { runValidators: false }
        );
        updatedCount++;
      } catch (err) {
        insertErrors.push(`Update failed: ${prospectData.accountName} — ${err.message}`);
      }
    }

    if (updatedCount > 0) {
      successCount += updatedCount;
      console.log(`🔄 Updated existing: ${updatedCount} prospects`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 3: Contacts insert/upsert ────────────────────────────────────
    const contactsToUpsert = []; // email hai — upsert
    const contactsToInsert = []; // email nahi — insert

    // Saare prospects fetch karo (naye + updated)
    const insertedProspectMap = {};
    if (accountNames.length > 0) {
      const allProspects = await Prospect.find({
        accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const p of allProspects) {
        if (p.accountNameLower) insertedProspectMap[p.accountNameLower] = p;
      }
    }

    for (const row of validRows) {
      const contacts = row.contacts;
      if (!contacts || contacts.length === 0) continue;

      const key             = row.accountName?.toLowerCase().trim();
      const matchedProspect = key ? insertedProspectMap[key] : null;
      if (!matchedProspect) continue;

      const accountFields = extractAccountFields(matchedProspect);

      for (const contact of contacts) {
        if (!contact.name && !contact.email && !contact.phone) continue;

        const nameParts   = (contact.name || "").trim().split(" ");
        const contactData = {
          accountId:         matchedProspect._id,
          accountName:       row.accountName,
          isLinked:          true,
          ...accountFields,
          firstName:         nameParts[0]                 || null,
          lastName:          nameParts.slice(1).join(" ") || null,
          standardizedRoles: contact.designation          || null,
          functionalDomain:  contact.department           || null,
          email:             contact.email                || null,
          primaryPhone:      contact.phone                || null,
          secondaryPhone:    contact.phone2               || null,
          linkedIn:          contact.linkedIn             || null,
          isPrimary:         contact.isPrimary            ?? true,
          source:            "account_import",
          importLogId:       importLog._id,
        };

        if (contact.email) {
          contactsToUpsert.push(contactData);
        } else {
          contactsToInsert.push(contactData);
        }
      }
    }

    let contactsSaved = 0;

    // Email wale — upsert
    for (const c of contactsToUpsert) {
      try {
        await Contact.findOneAndUpdate(
          { email: c.email.toLowerCase() },
          { $set: c },
          { upsert: true, runValidators: false }
        );
        contactsSaved++;
      } catch (err) {
        console.error("❌ Contact upsert error:", err.message);
      }
    }

    // Email nahi — insert
    for (let i = 0; i < contactsToInsert.length; i += CHUNK_SIZE) {
      const chunk    = contactsToInsert.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      contactsSaved += await safeInsertMany(contactRepository, chunk, `C${chunkNum}`);
    }

    // ── Unlinked contacts auto-link ────────────────────────────────────────
    if (accountNames.length > 0) {
      try {
        for (const [, prospect] of Object.entries(insertedProspectMap)) {
          const fields = extractAccountFields(prospect);
          await contactRepository.updateMany(
            { accountName: { $regex: `^${prospect.accountName}$`, $options: "i" }, isLinked: false },
            { $set: { accountId: prospect._id, isLinked: true, ...fields } }
          );
        }
        console.log(`🔗 Unlinked contacts auto-linked`);
      } catch (err) {
        console.error("❌ Auto-link error:", err.message);
      }
    }

    // ── Final status ───────────────────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"  :
      successCount < validRows.length ? "partial" :
      "completed";

    await importLogRepository.update(importLog._id, {
      successCount,
      failedCount:  allErrors.length,
      errorDetails: allErrors,
      status:       finalStatus,
    });

    try { fs.unlinkSync(filePath); } catch (_) {}

    await notificationService.create({
      userId,
      type:          "import_complete",
      message:       `Account import ${finalStatus} — ${newRows.length} new, ${updatedCount} updated. ${contactsSaved} contacts saved.`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Import done — New: ${newRows.length} | Updated: ${updatedCount} | Contacts: ${contactsSaved}`);

    await auditLogService.log({
      userId,
      action:      "IMPORT",
      entity:      "Import",
      entityId:    importLog._id,
      description: `Account import ${finalStatus} — ${successCount} of ${totalRows} rows`,
      metadata:    { successCount, newCount: newRows.length, updatedCount, failedCount: allErrors.length, contactsSaved },
    });

    return {
      importLogId:   importLog._id,
      totalRows,
      successCount,
      newCount:      newRows.length,
      updatedCount,
      failedCount:   allErrors.length,
      contactsSaved,
      errorDetails:  allErrors,
      status:        finalStatus,
    };
  },

  // ===========================================================================
  // CONTACT EXCEL IMPORT — Upsert: email pe match
  // ===========================================================================
  processContactImport: async (filePath, userId) => {

    const { processContactFile } = await import("../../common/utils/contactFileParser.js");
    const { validRows, errorDetails, totalRows } = processContactFile(filePath);

    console.log(`📊 Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);
    if (errorDetails.length > 0) {
      console.log("❌ First 5 errors:", errorDetails.slice(0, 5));
    }

    const importLog = await importLogRepository.create({
      fileName:     filePath.split(/[\\\/]/).pop(),
      importType:   "excel",
      uploadedBy:   userId,
      totalRows,
      successCount: 0,
      failedCount:  errorDetails.length,
      errorDetails,
      status:       "processing",
    });

    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, { status: "failed", failedCount: errorDetails.length });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, linkedCount: 0, unlinkedCount: 0, errorDetails, status: "failed" };
    }

    // ── Account map ────────────────────────────────────────────────────────
    const uniqueAccountNames = [...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean))];
    const accountMap = {};

    if (uniqueAccountNames.length > 0) {
      const existingAccounts = await Prospect.find({
        accountNameLower: { $in: uniqueAccountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const acc of existingAccounts) {
        if (acc.accountNameLower) accountMap[acc.accountNameLower] = acc;
      }
      console.log(`✅ Accounts matched: ${existingAccounts.length} of ${uniqueAccountNames.length}`);
    }

    // ── Existing contacts check — email pe ────────────────────────────────
    const emails = validRows.map(r => r.email?.toLowerCase()).filter(Boolean);
    const existingEmailSet = new Set();

    if (emails.length > 0) {
      const existingContacts = await Contact.find({
        email: { $in: emails },
      }).select("email").lean();

      for (const c of existingContacts) {
        if (c.email) existingEmailSet.add(c.email.toLowerCase());
      }
      console.log(`📧 Existing contacts by email: ${existingEmailSet.size}`);
    }

    // ── Rows prepare ───────────────────────────────────────────────────────
    const newRows    = [];
    const upsertRows = [];
    let linkedCount   = 0;
    let unlinkedCount = 0;

    for (const row of validRows) {
      const nameKey       = row.accountName?.trim().toLowerCase();
      const prospect      = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      const preparedRow = {
        ...row,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        importLogId: importLog._id,
      };

      if (prospect) linkedCount++;
      else          unlinkedCount++;

      const emailKey = row.email?.toLowerCase();
      if (emailKey && existingEmailSet.has(emailKey)) {
        upsertRows.push(preparedRow); // email match — update
      } else {
        newRows.push(preparedRow);    // naya — insert
      }
    }

    console.log(`📦 New: ${newRows.length} | Update existing: ${upsertRows.length} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    // ── Step 1: Naye contacts insert ───────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
      const chunk    = newRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const inserted = await safeInsertMany(contactRepository, chunk, chunkNum);
      successCount  += inserted;
      if (inserted < chunk.length) {
        insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      }
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Step 2: Existing contacts update — email pe ────────────────────────
    let updatedCount = 0;
    for (const row of upsertRows) {
      try {
        await Contact.findOneAndUpdate(
          { email: row.email?.toLowerCase() },
          { $set: row },
          { runValidators: false }
        );
        updatedCount++;
      } catch (err) {
        insertErrors.push(`Contact update failed: ${row.email} — ${err.message}`);
      }
    }

    if (updatedCount > 0) {
      successCount += updatedCount;
      console.log(`🔄 Updated existing contacts: ${updatedCount}`);
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Final status ───────────────────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"  :
      successCount < validRows.length ? "partial" :
      "completed";

    await importLogRepository.update(importLog._id, { successCount, failedCount: allErrors.length, errorDetails: allErrors, status: finalStatus });

    try { fs.unlinkSync(filePath); } catch (_) {}

    await notificationService.create({
      userId,
      type:    "import_complete",
      message: `Contact import ${finalStatus} — ${newRows.length} new, ${updatedCount} updated. Linked: ${linkedCount}, Unlinked: ${unlinkedCount}`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Contact import done — New: ${newRows.length} | Updated: ${updatedCount} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    return {
      importLogId:  importLog._id,
      totalRows,
      successCount,
      newCount:     newRows.length,
      updatedCount,
      failedCount:  allErrors.length,
      linkedCount,
      unlinkedCount,
      errorDetails: allErrors,
      status:       finalStatus,
    };
  },

  // ===========================================================================
  // GET IMPORT STATUS
  // ===========================================================================
  getImportStatus: async (importLogId) => {
    return await importLogRepository.findById(importLogId);
  },
};

export default importService;