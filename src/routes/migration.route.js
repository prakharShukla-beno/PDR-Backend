import { Router } from "express";
import mongoose   from "mongoose";
import Prospect   from "../modules/prospect/prospect.model.js";
import Contact    from "../modules/contacts/contact.model.js";
import authMiddleware from "../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// POST /api/migrate/run-all
router.post("/run-all", async (req, res, next) => {
  try {
    // ── 1. accountNameLower — cursor se ek ek update karo ─────────────────
    // Pipeline array nahi chalti purani Mongoose mein
    // Raw MongoDB driver use karo directly
    const db            = mongoose.connection.db;
    const prospectsColl = db.collection("prospects");
    const contactsColl  = db.collection("contacts");

    // accountNameLower fix — raw driver
    const r1 = await prospectsColl.updateMany(
      { accountNameLower: null, accountName: { $ne: null } },
      [{ $set: { accountNameLower: { $toLower: "$accountName" } } }]
    );

    // ── 2. contact computed fields fix — simple $set ───────────────────────
    await contactsColl.updateMany(
      { email: { $ne: null } },
      { $set: { hasEmail: true } }
    );
    await contactsColl.updateMany(
      { email: null },
      { $set: { hasEmail: false } }
    );
    await contactsColl.updateMany(
      { $or: [{ primaryPhone: { $ne: null } }, { primaryMobNo: { $ne: null } }] },
      { $set: { hasPhone: true } }
    );
    await contactsColl.updateMany(
      { primaryPhone: null, primaryMobNo: null },
      { $set: { hasPhone: false } }
    );
    await contactsColl.updateMany(
      { linkedIn: { $ne: null } },
      { $set: { hasLinkedIn: true } }
    );
    await contactsColl.updateMany(
      { linkedIn: null },
      { $set: { hasLinkedIn: false } }
    );

    const contactsWithPhone = await contactsColl.countDocuments({ hasPhone: true });

    // ── 3. contact account fields fix ─────────────────────────────────────
    const contacts = await Contact.find({
      isLinked:        true,
      accountId:       { $ne: null },
      accountIndustry: null,
    }).select("_id accountId").lean();

    let contactsUpdated = 0;

    if (contacts.length > 0) {
      const accountIds = [...new Set(contacts.map(c => c.accountId.toString()))];

      const prospects = await Prospect.find({ _id: { $in: accountIds } })
        .select("_id primaryIndustry country hqLocationCity noOfEmployees annualRevenue businessModel salesPriority clvRanking techFitScore intentSignal website")
        .lean();

      const pMap = {};
      for (const p of prospects) pMap[p._id.toString()] = p;

      const bulkOps = contacts.map(c => {
        const p = pMap[c.accountId.toString()];
        if (!p) return null;
        return {
          updateOne: {
            filter: { _id: c._id },
            update: {
              $set: {
                accountIndustry:      p.primaryIndustry || null,
                accountCountry:       p.country          || null,
                accountCity:          p.hqLocationCity   || null,
                accountEmployees:     p.noOfEmployees    || null,
                accountRevenue:       p.annualRevenue    || null,
                accountBusinessModel: p.businessModel    || null,
                accountSalesPriority: p.salesPriority    || null,
                accountClvRanking:    p.clvRanking       || null,
                accountTechFitScore:  p.techFitScore     || null,
                accountIntentSignal:  p.intentSignal     || null,
                accountWebsite:       p.website          || null,
              },
            },
          },
        };
      }).filter(Boolean);

      if (bulkOps.length > 0) {
        const r3        = await Contact.bulkWrite(bulkOps, { ordered: false });
        contactsUpdated = r3.modifiedCount;
      }
    }

    res.status(200).json({
      success: true,
      message: "Migration complete — ab sab filters kaam karenge",
      data: {
        prospectsFixed:      r1.modifiedCount,
        contactsWithPhone,
        contactAccountFixed: contactsUpdated,
      },
    });

  } catch (error) {
    next(error);
  }
});

export default router;
