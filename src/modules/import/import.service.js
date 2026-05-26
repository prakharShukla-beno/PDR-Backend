import fs from "fs";
import { processExcelFile } from "../../common/utils/excelParser.js";
import prospectRepository from "../prospect/prospect.repository.js";
import duplicateRepository from "../duplicate/duplicate.repository.js";
import importLogRepository from "../importLog/importLog.repository.js";
import notificationService from "../notification/notification.service.js";
import auditLogService from "../auditLog/auditLog.service.js";
import contactRepository from "../contacts/contact.repository.js";
import Prospect from "../prospect/prospect.model.js";

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

// ─── Helper: Safe insertMany — 1 row se 1 lakh tak handle karo ───────────────
// ordered: false → ek row fail hone pe baki rows insert hoti rehti hain
const safeInsertMany = async (repository, docs, chunkNum) => {
  if (!docs || docs.length === 0) return 0;
  try {
    await repository.insertMany(docs, { ordered: false });
    // ordered: false pe success count = docs.length (partial bhi ho sakta hai)
    console.log(`✅ Chunk ${chunkNum}: ${docs.length} rows inserted`);
    return docs.length;
  } catch (err) {
    // BulkWriteError — kuch rows insert hue, kuch nahi
    if (err.name === "BulkWriteError" || err.code === 11000) {
      const inserted = err.result?.nInserted ?? err.result?.insertedCount ?? 0;
      console.warn(`⚠️  Chunk ${chunkNum}: ${inserted}/${docs.length} inserted (partial — duplicates/errors skip kiye)`);
      return inserted;
    }
    // Poora chunk fail
    console.error(`❌ Chunk ${chunkNum} error:`, err.message);
    return 0;
  }
};

const importService = {

  // ===========================================================================
  // ACCOUNT EXCEL IMPORT
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

    // ── Early exit — koi valid row nahi ───────────────────────────────────
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

    // ── Duplicate check ────────────────────────────────────────────────────
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

    const existingNames    = new Set((existingProspects.prospects || []).map(p => p.accountName?.toLowerCase()));
    const existingWebsites = new Set((existingProspects.prospects || []).map(p => p.website?.toLowerCase()));

    const preparedRows  = [];
    const duplicateRows = [];

    for (const row of validRows) {
      const isDuplicate =
        (row.accountName && existingNames.has(row.accountName.toLowerCase())) ||
        (row.website     && existingWebsites.has(row.website.toLowerCase()));

      const { contacts, ...prospectData } = row;

      preparedRows.push({
        ...prospectData,
        isDuplicate,
        source:      "excel",
        importLogId: importLog._id,
      });

      duplicateRows.push(isDuplicate ? { row, contacts } : null);
    }

    console.log(`📦 Prepared rows: ${preparedRows.length}, Duplicates: ${duplicateRows.filter(Boolean).length}`);

    // ── Chunked insert — Prospects ─────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      const inserted = await safeInsertMany(prospectRepository, chunk, chunkNum);
      successCount  += inserted;

      if (inserted < chunk.length) {
        insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      }

      // Progress update
      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Contacts — Account se match karke insert karo ─────────────────────
    const contactsToInsert = [];

    // Ek baar mein saare inserted prospects fetch karo — N+1 avoid karo
    const insertedProspectMap = {};
    if (accountNames.length > 0) {
      const insertedProspects = await Prospect.find({
        accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) },
      }).select("_id accountName accountNameLower primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

      for (const p of insertedProspects) {
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

        const nameParts = (contact.name || "").trim().split(" ");
        contactsToInsert.push({
          accountId:   matchedProspect._id,
          accountName: row.accountName,
          isLinked:    true,
          ...accountFields,
          firstName:         nameParts[0]                   || null,
          lastName:          nameParts.slice(1).join(" ")   || null,
          standardizedRoles: contact.designation            || null,
          functionalDomain:  contact.department             || null,
          email:             contact.email                  || null,
          primaryPhone:      contact.phone                  || null,
          secondaryPhone:    contact.phone2                 || null,
          linkedIn:          contact.linkedIn               || null,
          isPrimary:         contact.isPrimary              ?? true,
          source:            "account_import",
          importLogId:       importLog._id,
        });
      }
    }

    // Contacts chunked insert
    let contactsSaved = 0;
    for (let i = 0; i < contactsToInsert.length; i += CHUNK_SIZE) {
      const chunk    = contactsToInsert.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      contactsSaved += await safeInsertMany(contactRepository, chunk, `C${chunkNum}`);
    }

    // ── Unlinked contacts auto-link ────────────────────────────────────────
    if (accountNames.length > 0) {
      try {
        for (const [key, prospect] of Object.entries(insertedProspectMap)) {
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

    // ── Duplicate log ──────────────────────────────────────────────────────
    for (const dup of duplicateRows.filter(Boolean)) {
      try {
        const existing = (existingProspects.prospects || []).find(
          p =>
            p.accountName?.toLowerCase() === dup.row.accountName?.toLowerCase() ||
            p.website?.toLowerCase()     === dup.row.website?.toLowerCase()
        );
        const key      = dup.row.accountName?.toLowerCase();
        const inserted = key ? insertedProspectMap[key] : null;

        if (existing && inserted) {
          const matchFields = [];
          if (dup.row.accountName) matchFields.push("accountName");
          if (dup.row.website)     matchFields.push("website");
          await duplicateRepository.create({
            prospectId1: existing._id,
            prospectId2: inserted._id,
            matchFields,
            status:      "pending",
          });
        }
      } catch (err) {
        insertErrors.push(`Duplicate log failed: ${dup.row.accountName}`);
      }
    }

    // ── Final status ───────────────────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"    :
      successCount < validRows.length ? "partial"   :
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
      message:       `Account import ${finalStatus} — ${successCount} of ${totalRows} imported. ${contactsSaved} contacts saved.`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Import done — ${successCount} of ${totalRows} rows | Contacts: ${contactsSaved}`);

    await auditLogService.log({
      userId,
      action:      "IMPORT",
      entity:      "Import",
      entityId:    importLog._id,
      description: `Account import ${finalStatus} — ${successCount} of ${totalRows} rows`,
      metadata:    { successCount, failedCount: allErrors.length, contactsSaved },
    });

    return { importLogId: importLog._id, totalRows, successCount, failedCount: allErrors.length, contactsSaved, errorDetails: allErrors, status: finalStatus };
  },

  // ===========================================================================
  // CONTACT EXCEL IMPORT
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

    // Early exit
    if (!validRows || validRows.length === 0) {
      await importLogRepository.update(importLog._id, { status: "failed", failedCount: errorDetails.length });
      try { fs.unlinkSync(filePath); } catch (_) {}
      return { importLogId: importLog._id, totalRows, successCount: 0, failedCount: errorDetails.length, linkedCount: 0, unlinkedCount: 0, errorDetails, status: "failed" };
    }

    // ── Unique accountNames — ek baar mein saab fetch karo ─────────────────
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

    // ── Rows prepare ───────────────────────────────────────────────────────
    const preparedRows = [];
    let linkedCount    = 0;
    let unlinkedCount  = 0;

    for (const row of validRows) {
      const nameKey   = row.accountName?.trim().toLowerCase();
      const prospect  = nameKey ? accountMap[nameKey] : null;
      const accountFields = prospect ? extractAccountFields(prospect) : {};

      preparedRows.push({
        ...row,
        accountId:   prospect ? prospect._id : null,
        accountName: row.accountName?.trim() || null,
        isLinked:    !!prospect,
        ...accountFields,
        source:      "excel",
        importLogId: importLog._id,
      });

      if (prospect) linkedCount++;
      else          unlinkedCount++;
    }

    console.log(`📦 Prepared: ${preparedRows.length} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    // ── Chunked insertMany ─────────────────────────────────────────────────
    let successCount = 0;
    const insertErrors = [];

    for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
      const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      const inserted = await safeInsertMany(contactRepository, chunk, chunkNum);
      successCount  += inserted;

      if (inserted < chunk.length) {
        insertErrors.push(`Chunk ${chunkNum}: ${chunk.length - inserted} rows failed`);
      }

      await importLogRepository.update(importLog._id, { successCount });
    }

    // ── Final status ───────────────────────────────────────────────────────
    const allErrors   = [...errorDetails, ...insertErrors];
    const finalStatus =
      successCount === 0              ? "failed"    :
      successCount < validRows.length ? "partial"   :
      "completed";

    await importLogRepository.update(importLog._id, { successCount, failedCount: allErrors.length, errorDetails: allErrors, status: finalStatus });

    try { fs.unlinkSync(filePath); } catch (_) {}

    await notificationService.create({
      userId,
      type:    "import_complete",
      message: `Contact import ${finalStatus} — ${successCount} of ${totalRows} imported. Linked: ${linkedCount}, Unlinked: ${unlinkedCount}`,
      refId:         importLog._id,
      refCollection: "importLogs",
    });

    console.log(`🏁 Contact import done — ${successCount}/${totalRows} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

    return { importLogId: importLog._id, totalRows, successCount, failedCount: allErrors.length, linkedCount, unlinkedCount, errorDetails: allErrors, status: finalStatus };
  },

  // ===========================================================================
  // GET IMPORT STATUS
  // ===========================================================================
  getImportStatus: async (importLogId) => {
    return await importLogRepository.findById(importLogId);
  },
};

export default importService;