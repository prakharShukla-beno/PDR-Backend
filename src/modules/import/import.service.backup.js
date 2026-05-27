// import fs from "fs";
// import { processExcelFile } from "../../common/utils/excelParser.js";
// import prospectRepository from "../prospect/prospect.repository.js";
// import duplicateRepository from "../duplicate/duplicate.repository.js";
// import importLogRepository from "../importLog/importLog.repository.js";
// import notificationService from "../notification/notification.service.js";
// import auditLogService from "../auditLog/auditLog.service.js"; // 2190 ADD: FR-4.3
// import contactRepository from "../contacts/contact.repository.js";
// import Prospect from "../prospect/prospect.model.js";

// const CHUNK_SIZE = 1000;

// // ─── Helper: Prospect se denormalized fields nikalo ───────────────────────────
// const extractAccountFields = (prospect) => ({
//   accountIndustry:      prospect.primaryIndustry  || null,
//   accountCountry:       prospect.country           || null,
//   accountCity:          prospect.hqLocationCity    || null,
//   accountEmployees:     prospect.noOfEmployees     || null,
//   accountRevenue:       prospect.annualRevenue     || null,
//   accountBusinessModel: prospect.businessModel     || null,
//   accountSalesPriority: prospect.salesPriority     || null,
//   accountClvRanking:    prospect.clvRanking        || null,
//   accountTechFitScore:  prospect.techFitScore      || null,
//   accountIntentSignal:  prospect.intentSignal      || null,
//   accountWebsite:       prospect.website           || null,
// });

// const importService = {

//   // ===========================================================================
//   // ACCOUNT EXCEL IMPORT
//   // ===========================================================================
//   processExcelImport: async (filePath, userId) => {

//     const { validRows, errorDetails, totalRows } = processExcelFile(filePath);

//     console.log(`📊 Total rows: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

//     if (errorDetails.length > 0) {
//       console.log("❌ First 5 validation errors:", errorDetails.slice(0, 5));
//     }

//     // ── Import log create ──────────────────────────────────────────────────
//     const importLog = await importLogRepository.create({
//       fileName:     filePath.split(/[\\\/]/).pop(),
//       importType:   "excel",
//       uploadedBy:   userId,
//       totalRows,
//       successCount: 0,
//       failedCount:  errorDetails.length,
//       errorDetails,
//       status:       "processing",
//     });

//     // ── Duplicate check ────────────────────────────────────────────────────
//     const accountNames = validRows.map(r => r.accountName).filter(Boolean);
//     const websites     = validRows.map(r => r.website).filter(Boolean);

//     const existingProspects = await prospectRepository.findAll({
//       filter: {
//         $or: [
//           { accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) } },
//           { website:          { $in: websites.map(w => w.toLowerCase()) } },
//         ],
//       },
//       page:  1,
//       limit: 999999,
//     });

//     const existingNames    = new Set(existingProspects.prospects.map(p => p.accountName?.toLowerCase()));
//     const existingWebsites = new Set(existingProspects.prospects.map(p => p.website?.toLowerCase()));

//     const preparedRows  = [];
//     const duplicateRows = [];

//     for (const row of validRows) {
//       const isDuplicate =
//         (row.accountName && existingNames.has(row.accountName.toLowerCase())) ||
//         (row.website     && existingWebsites.has(row.website.toLowerCase()));

//       // contacts[] array removed — save contacts separately in the Contact collection
//       const { contacts, ...prospectData } = row;

//       preparedRows.push({
//         ...prospectData,
//         isDuplicate,
//         source:      "excel",
//         importLogId: importLog._id,
//       });

//       if (isDuplicate) duplicateRows.push({ row, contacts });
//       else             duplicateRows.push(null); // placeholder
//     }

//     console.log(`📦 Prepared rows: ${preparedRows.length}, Duplicates: ${duplicateRows.filter(Boolean).length}`);

//     // ── Chunked insert — Prospects ─────────────────────────────────────────
//     let successCount = 0;
//     const insertErrors = [];
//     const insertedProspects = []; // track inserted prospects for contact processing

//     for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
//       const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
//       const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

//       try {
//         const result   = await prospectRepository.insertMany(chunk);
//         const inserted = result.insertedCount ?? chunk.length;
//         successCount  += inserted;
//         console.log(`✅ Chunk ${chunkNum}: ${inserted} rows inserted`);

//         // Track inserted prospects
//         if (result.ops) insertedProspects.push(...result.ops);

//       } catch (err) {
//         console.error(`❌ Chunk ${chunkNum} error:`, err.message);
//         if (err.result?.insertedCount) {
//           successCount += err.result.insertedCount;
//         }
//         insertErrors.push(`Chunk ${chunkNum} fail: ${err.message}`);
//       }

//       await importLogRepository.update(importLog._id, { successCount });
//     }

//     // ── Also save contacts in the Contact collection ─────────────────────
//     // Any contact (POC fields) from the account Excel should also be saved in the contacts collection
//     const contactsToInsert = [];

//     for (let i = 0; i < validRows.length; i++) {
//       const row      = validRows[i];
//       const contacts = row.contacts; // excelParser se aaya embedded contact

//       if (!contacts || contacts.length === 0) continue;

//       // Find the prospect for this accountName — it may have been inserted just now
//       const matchedProspect = await Prospect.findOne({
//         accountNameLower: row.accountName?.toLowerCase().trim(),
//       }).select("_id primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

//       if (!matchedProspect) continue;

//       const accountFields = extractAccountFields(matchedProspect);

//       for (const contact of contacts) {
//         if (!contact.name && !contact.email && !contact.phone) continue;

//         // Split full name into firstName and lastName
//         const nameParts = (contact.name || "").trim().split(" ");
//         const firstName = nameParts[0] || null;
//         const lastName  = nameParts.slice(1).join(" ") || null;

//         contactsToInsert.push({
//           // Account reference
//           accountId:   matchedProspect._id,
//           accountName: row.accountName,
//           isLinked:    true,

//           // Denormalized account fields
//           ...accountFields,

//           // Contact fields
//           firstName,
//           lastName,
//           standardizedRoles: contact.designation || null,
//           functionalDomain:  contact.department  || null,
//           email:             contact.email       || null,
//           primaryPhone:      contact.phone       || null,
//           secondaryPhone:    contact.phone2      || null,
//           linkedIn:          contact.linkedIn    || null,

//           // System
//           isPrimary:   contact.isPrimary || true,
//           source:      "account_import",
//           importLogId: importLog._id,
//         });
//       }
//     }

//     // Insert into the Contact collection
//     if (contactsToInsert.length > 0) {
//       for (let i = 0; i < contactsToInsert.length; i += CHUNK_SIZE) {
//         const chunk = contactsToInsert.slice(i, i + CHUNK_SIZE);
//         try {
//           await contactRepository.insertMany(chunk);
//           console.log(`✅ Contacts saved: ${chunk.length}`);
//         } catch (err) {
//           console.error("❌ Contact save error:", err.message);
//         }
//       }
//     }

//     // ── Unlinked contacts auto-link ───────────────────────────────────────-
//     // Previously imported contacts that match this accountName but remained unlinked
//     if (accountNames.length > 0) {
//       try {
//         const newlyLinked = await Prospect.find({
//           accountNameLower: { $in: accountNames.map(n => n.toLowerCase()) },
//         }).select("_id accountName primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website").lean();

//         for (const prospect of newlyLinked) {
//           const fields = extractAccountFields(prospect);
//           await contactRepository.updateMany(
//             {
//               accountName: { $regex: `^${prospect.accountName}$`, $options: "i" },
//               isLinked: false,
//             },
//             {
//               $set: {
//                 accountId: prospect._id,
//                 isLinked:  true,
//                 ...fields,
//               },
//             }
//           );
//         }
//         console.log(`Unlinked contacts auto-linked`);
//       } catch (err) {
//         console.error("Auto-link error:", err.message);
//       }
//     }

//     // ── Duplicate log ──────────────────────────────────────────────────────
//     for (const dup of duplicateRows.filter(Boolean)) {
//       try {
//         const existing = existingProspects.prospects.find(
//           p =>
//             p.accountName?.toLowerCase() === dup.row.accountName?.toLowerCase() ||
//             p.website?.toLowerCase()     === dup.row.website?.toLowerCase()
//         );
//         const inserted = await prospectRepository.findAll({
//           filter: { accountNameLower: dup.row.accountName?.toLowerCase() },
//           page: 1, limit: 1,
//         });
//         if (existing && inserted.prospects[0]) {
//           const matchFields = [];
//           if (dup.row.accountName) matchFields.push("accountName");
//           if (dup.row.website)     matchFields.push("website");
//           await duplicateRepository.create({
//             prospectId1: existing._id,
//             prospectId2: inserted.prospects[0]._id,
//             matchFields,
//             status: "pending",
//           });
//         }
//       } catch (err) {
//         insertErrors.push(`Duplicate log failed: ${dup.row.accountName}`);
//       }
//     }

//     // ── Final status ───────────────────────────────────────────────────────
//     const allErrors  = [...errorDetails, ...insertErrors];
//     const finalStatus =
//       successCount === 0              ? "failed"    :
//       successCount < validRows.length ? "partial"   :
//       "completed";

//     await importLogRepository.update(importLog._id, {
//       successCount,
//       failedCount:  allErrors.length,
//       errorDetails: allErrors,
//       status:       finalStatus,
//     });

//     try { fs.unlinkSync(filePath); } catch (_) {}

//     await notificationService.create({
//       userId,
//       type:          "import_complete",
//       message:       `Account import ${finalStatus} — ${successCount} of ${totalRows} imported. ${contactsToInsert.length} contacts saved.`,
//       refId:         importLog._id,
//       refCollection: "importLogs",
//     });

//     console.log(`🏁 Import done — ${successCount} of ${totalRows} rows | Contacts: ${contactsToInsert.length}`);

//     // 25002500 FR-4.3: Audit log 250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500
//     await auditLogService.log({
//       userId,
//       action:      "IMPORT",
//       entity:      "Import",
//       entityId:    importLog._id,
//       description: `Account import ${finalStatus} 2014 ${successCount} of ${totalRows} rows`,
//       metadata:    { successCount, failedCount: allErrors.length, contactsSaved: contactsToInsert.length },
//     });

//     return {
//       importLogId:    importLog._id,
//       totalRows,
//       successCount,
//       failedCount:    allErrors.length,
//       contactsSaved:  contactsToInsert.length,
//       errorDetails:   allErrors,
//       status:         finalStatus,
//     };
//   },

//   // ===========================================================================
//   // CONTACT EXCEL IMPORT
//   // ===========================================================================
//   processContactImport: async (filePath, userId) => {

//     const { processContactFile } = await import(
//       "../../common/utils/contactFileParser.js"
//     );

//     const { validRows, errorDetails, totalRows } = processContactFile(filePath);

//     console.log(`📊 Total: ${totalRows}, Valid: ${validRows.length}, Errors: ${errorDetails.length}`);

//     if (errorDetails.length > 0) {
//       console.log("❌ First 5 errors:", errorDetails.slice(0, 5));
//     }

//     const importLog = await importLogRepository.create({
//       fileName:     filePath.split(/[\\\/]/).pop(),
//       importType:   "excel",
//       uploadedBy:   userId,
//       totalRows,
//       successCount: 0,
//       failedCount:  errorDetails.length,
//       errorDetails,
//       status:       "processing",
//     });

//     // ── Step 1: Collect unique accountNames ───────────────────────────────
//     const uniqueAccountNames = [
//       ...new Set(validRows.map(r => r.accountName?.trim()).filter(Boolean)),
//     ];

//     // ── Step 2: Find matching accounts — EXACT MATCH (avoid regex)
//     // Using regex for 50k names can crash MongoDB
//     const accountMap = {};

//     if (uniqueAccountNames.length > 0) {
//       const lowerNames = uniqueAccountNames.map(n => n.toLowerCase());

//       const existingAccounts = await Prospect.find({
//         accountNameLower: { $in: lowerNames },
//       }).select(
//         "_id accountName accountNameLower primaryIndustry country hqLocationCity " +
//         "noOfEmployees annualRevenue businessModel salesPriority clvRanking " +
//         "techFitScore intentSignal website"
//       ).lean();

//       for (const acc of existingAccounts) {
//         if (acc.accountNameLower) {
//           accountMap[acc.accountNameLower] = acc;
//         }
//       }

//       console.log(`✅ Accounts matched: ${existingAccounts.length} of ${uniqueAccountNames.length}`);
//     }

//     // ── Step 3: Prepare rows with denormalized account fields ─────────────
//     const preparedRows = [];
//     let linkedCount   = 0;
//     let unlinkedCount = 0;

//     for (const row of validRows) {
//       const nameKey  = row.accountName?.trim().toLowerCase();
//       const prospect = nameKey ? accountMap[nameKey] : null;
//       const accountFields = prospect ? extractAccountFields(prospect) : {};

//       preparedRows.push({
//         ...row,
//         accountId:   prospect ? prospect._id : null,
//         accountName: row.accountName?.trim() || null,
//         isLinked:    !!prospect,
//         ...accountFields,
//         source:      "excel",
//         importLogId: importLog._id,
//       });

//       if (prospect) linkedCount++;
//       else          unlinkedCount++;
//     }

//     console.log(`📦 Prepared: ${preparedRows.length} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

//     // ── Step 4: Chunked insertMany ─────────────────────────────────────────
//     let successCount = 0;
//     const insertErrors = [];

//     for (let i = 0; i < preparedRows.length; i += CHUNK_SIZE) {
//       const chunk    = preparedRows.slice(i, i + CHUNK_SIZE);
//       const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

//       try {
//         const result   = await contactRepository.insertMany(chunk);
//         const inserted = result.insertedCount ?? chunk.length;
//         successCount  += inserted;
//         console.log(`✅ Chunk ${chunkNum}: ${inserted} contacts inserted`);
//       } catch (err) {
//         console.error(`❌ Chunk ${chunkNum} error:`, err.message);
//         if (err.result?.insertedCount) {
//           successCount += err.result.insertedCount;
//         }
//         insertErrors.push(`Chunk ${chunkNum} fail: ${err.message}`);
//       }

//       await importLogRepository.update(importLog._id, { successCount });
//     }

//     // ── Final status ───────────────────────────────────────────────────────
//     const allErrors   = [...errorDetails, ...insertErrors];
//     const finalStatus =
//       successCount === 0              ? "failed"    :
//       successCount < validRows.length ? "partial"   :
//       "completed";

//     await importLogRepository.update(importLog._id, {
//       successCount,
//       failedCount:  allErrors.length,
//       errorDetails: allErrors,
//       status:       finalStatus,
//     });

//     try { fs.unlinkSync(filePath); } catch (_) {}

//     await notificationService.create({
//       userId,
//       type:    "import_complete",
//       message: `Contact import ${finalStatus} — ${successCount} of ${totalRows} imported. Linked: ${linkedCount}, Unlinked: ${unlinkedCount}`,
//       refId:         importLog._id,
//       refCollection: "importLogs",
//     });

//     console.log(`🏁 Contact import done — ${successCount}/${totalRows} | Linked: ${linkedCount} | Unlinked: ${unlinkedCount}`);

//     return {
//       importLogId:  importLog._id,
//       totalRows,
//       successCount,
//       failedCount:  allErrors.length,
//       linkedCount,
//       unlinkedCount,
//       errorDetails: allErrors,
//       status:       finalStatus,
//     };
//   }, 

//   // ===========================================================================
//   // GET IMPORT STATUS
//   // ===========================================================================
//   getImportStatus: async (importLogId) => {
//     return await importLogRepository.findById(importLogId);
//   },
// };

// export default importService;               
