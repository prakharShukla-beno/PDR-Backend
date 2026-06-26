import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import Contact from "../modules/contacts/contact.model.js";
import Prospect from "../modules/prospect/prospect.model.js";

const fix = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected");

  const unlinked = await Contact.find({
    $or: [
      { companyId: null },
      { companyId: { $exists: false } },
    ],
  }).lean();

  console.log(`Found ${unlinked.length} contacts without companyId`);

  let fixed = 0;
  let skipped = 0;
  let syncedFromProspect = 0;

  for (const contact of unlinked) {
    if (!contact.accountId) {
      skipped++;
      continue;
    }

    const prospect = await Prospect.findById(contact.accountId)
      .select("companyId")
      .lean();

    if (prospect?.companyId) {
      await Contact.findByIdAndUpdate(contact._id, {
        companyId: prospect.companyId,
      });
      fixed++;
    } else {
      skipped++;
    }
  }

  // Fix contacts whose companyId differs from their linked prospect
  const mismatched = await Contact.aggregate([
    { $match: { accountId: { $ne: null } } },
    { $lookup: {
        from: "prospects",
        localField: "accountId",
        foreignField: "_id",
        as: "prospect",
    }},
    { $unwind: "$prospect" },
    { $match: { $expr: { $ne: ["$companyId", "$prospect.companyId"] } } },
    { $project: { _id: 1, prospectCompanyId: "$prospect.companyId" } },
  ]);

  for (const row of mismatched) {
    await Contact.findByIdAndUpdate(row._id, {
      companyId: row.prospectCompanyId,
    });
    syncedFromProspect++;
  }

  const remaining = await Contact.countDocuments({
    $or: [
      { companyId: null },
      { companyId: { $exists: false } },
    ],
  });

  console.log(`Fixed ${fixed} null contacts, synced ${syncedFromProspect} mismatched, skipped ${skipped}, remaining ${remaining}`);
  await mongoose.disconnect();
};

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
