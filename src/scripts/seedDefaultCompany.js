import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import Company from "../modules/company/company.model.js";
import User from "../modules/user/user.model.js";
import Prospect from "../modules/prospect/prospect.model.js";
import ICP from "../modules/icp/icp.model.js";
import Segment from "../modules/segment/segment.model.js";
import Contact from "../modules/contacts/contact.model.js";
import ImportLog from "../modules/importLog/importLog.model.js";

const migrateCompanyId = async (Model, label, companyId) => {
  const result = await Model.updateMany(
    { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
    { $set: { companyId } }
  );
  console.log(`✅ ${result.modifiedCount} ${label} migrated`);
};

const seed = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is required in .env");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  let company = await Company.findOne({ slug: "beno-support-technologies" });

  if (!company) {
    company = await Company.create({
      name: "Beno Support Technologies",
      slug: "beno-support-technologies",
      domain: "beno.com",
      plan: "growth",
      isActive: true,
    });
    console.log("✅ Default company created:", company.name);
  } else {
    console.log("ℹ️  Company already exists:", company.name);
  }

  const benoUser = await User.findOne({ email: "beno@test.com" });
  if (benoUser) {
    await User.findByIdAndUpdate(benoUser._id, {
      companyId: company._id,
      role: "admin",
      isActive: true,
      inviteAccepted: true,
    });
    console.log("✅ beno@test.com → admin, companyId set");
  } else {
    const newBenoUser = await User.create({
      name: "Beno PDR",
      email: "beno@test.com",
      password: "beno@12345",
      companyId: company._id,
      role: "admin",
      isActive: true,
      inviteAccepted: true,
    });
    await Company.findByIdAndUpdate(company._id, { createdBy: newBenoUser._id });
    console.log("✅ beno@test.com created as admin");
  }

  const prakharEmail = "prakharshukla6095@bbdnitm.ac.in";
  const existingPrakhar = await User.findOne({ email: prakharEmail });

  if (!existingPrakhar) {
    await User.create({
      name: "Prakhar Shukla",
      email: prakharEmail,
      password: "Prakhar@12345",
      companyId: company._id,
      role: "admin",
      isActive: true,
      inviteAccepted: true,
    });
    console.log("✅ prakharshukla6095@bbdnitm.ac.in created as admin");
  } else {
    await User.findByIdAndUpdate(existingPrakhar._id, {
      companyId: company._id,
      role: "admin",
      isActive: true,
      inviteAccepted: true,
    });
    console.log("✅ Prakhar's account updated with companyId");
  }

  await migrateCompanyId(Prospect, "prospects", company._id);
  await migrateCompanyId(ICP, "ICPs", company._id);
  await migrateCompanyId(Segment, "segments", company._id);
  await migrateCompanyId(Contact, "contacts", company._id);
  await migrateCompanyId(ImportLog, "import logs", company._id);

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────");
  console.log("Company:  Beno Support Technologies");
  console.log("Admin 1:  beno@test.com / beno@12345");
  console.log("Admin 2:  prakharshukla6095@bbdnitm.ac.in / Prakhar@12345");
  console.log("─────────────────────────────────");

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
