import mongoose from "mongoose";
import User from "../../modules/user/user.model.js";

export function requireCompanyId(companyId) {
  if (!companyId) {
    const error = new Error("Company context required");
    error.statusCode = 403;
    throw error;
  }
  return companyId;
}

export function companyFilter(companyId, filter = {}) {
  return { ...filter, companyId: requireCompanyId(companyId) };
}

export function companyObjectId(companyId) {
  return new mongoose.Types.ObjectId(requireCompanyId(companyId));
}

export function companyMatchStage(companyId, extra = {}) {
  return { $match: { companyId: companyObjectId(companyId), ...extra } };
}

export function getCompanyIdFromRequest(req) {
  return requireCompanyId(req.user?.companyId);
}

/** User IDs belonging to a company — for scoping models without companyId (e.g. Campaign) */
export async function companyUserIds(companyId) {
  return User.find({ companyId: requireCompanyId(companyId) }).distinct("_id");
}
