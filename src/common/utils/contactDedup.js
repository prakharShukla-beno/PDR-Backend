// Shared contact duplicate-detection helpers (B6)

export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export const hasValue = (value) => !isEmpty(value);

export const normEmail = (email) => email?.toLowerCase().trim() || null;

export const normPhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
};

export const nameAccountKey = (row) => {
  const first = row.firstName?.toLowerCase().trim();
  const last  = row.lastName?.toLowerCase().trim();
  const acct  = row.accountName?.toLowerCase().trim();
  if (first && last && acct) return `${first}|${last}|${acct}`;
  return null;
};

/** Build lookup maps from existing Contact documents */
export const buildContactDedupIndexes = (contacts = []) => {
  const byEmail = {};
  const byPhone = {};
  const byNameAccount = {};

  for (const c of contacts) {
    const email = normEmail(c.email);
    if (email && !byEmail[email]) byEmail[email] = c;

    const phone = normPhone(c.primaryPhone);
    if (phone && !byPhone[phone]) byPhone[phone] = c;

    const nameKey = nameAccountKey(c);
    if (nameKey && !byNameAccount[nameKey]) byNameAccount[nameKey] = c;
  }

  return { byEmail, byPhone, byNameAccount };
};

/** Match against DB indexes — returns { existing, matchFields } or null */
export const findDbContactDuplicate = (row, indexes) => {
  const email = normEmail(row.email);
  if (email && indexes.byEmail[email]) {
    return { existing: indexes.byEmail[email], matchFields: ["email"] };
  }

  const phone = normPhone(row.primaryPhone);
  if (phone && indexes.byPhone[phone]) {
    return { existing: indexes.byPhone[phone], matchFields: ["primaryPhone"] };
  }

  const nameKey = nameAccountKey(row);
  if (nameKey && indexes.byNameAccount[nameKey]) {
    return { existing: indexes.byNameAccount[nameKey], matchFields: ["nameAccount"] };
  }

  return null;
};

/** In-file duplicate tracker */
export const createInFileDedupTracker = () => ({
  byEmail:       new Map(),
  byPhone:       new Map(),
  byNameAccount: new Map(),
});

/**
 * Register a row that will be inserted. Returns duplicate info if this row
 * duplicates an earlier row in the same file.
 */
export const checkInFileDuplicate = (row, tracker) => {
  const email = normEmail(row.email);
  if (email && tracker.byEmail.has(email)) {
    return { matchFields: ["email"], firstRow: tracker.byEmail.get(email) };
  }

  const phone = normPhone(row.primaryPhone);
  if (phone && tracker.byPhone.has(phone)) {
    return { matchFields: ["primaryPhone"], firstRow: tracker.byPhone.get(phone) };
  }

  const nameKey = nameAccountKey(row);
  if (nameKey && tracker.byNameAccount.has(nameKey)) {
    return { matchFields: ["nameAccount"], firstRow: tracker.byNameAccount.get(nameKey) };
  }

  return null;
};

export const registerInFileRow = (row, tracker) => {
  const email = normEmail(row.email);
  if (email) tracker.byEmail.set(email, row);

  const phone = normPhone(row.primaryPhone);
  if (phone) tracker.byPhone.set(phone, row);

  const nameKey = nameAccountKey(row);
  if (nameKey) tracker.byNameAccount.set(nameKey, row);
};

/** Fetch contacts from DB needed for dedup checks on a batch of rows */
export const fetchExistingContactsForDedup = async (Contact, rows) => {
  const emails = [...new Set(rows.map((r) => normEmail(r.email)).filter(Boolean))];
  const phones = [...new Set(rows.map((r) => r.primaryPhone).filter(Boolean))];
  const accountNames = [...new Set(rows.map((r) => r.accountName?.trim()).filter(Boolean))];

  const orConditions = [];
  if (emails.length) orConditions.push({ email: { $in: emails } });
  if (phones.length) orConditions.push({ primaryPhone: { $in: phones } });
  if (accountNames.length) {
    orConditions.push({
      accountName: { $in: accountNames.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) },
    });
  }

  if (orConditions.length === 0) return [];

  return Contact.find({ $or: orConditions })
    .select("_id email firstName lastName standardizedRoles functionalDomain accountName primaryPhone linkedIn")
    .lean();
};
