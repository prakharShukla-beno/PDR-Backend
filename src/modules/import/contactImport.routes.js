import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import contactImportController from "./contactImport.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../../../uploads");

// ── Multer config — Excel + CSV dono allow ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel",                                           // .xls
    "text/csv",                                                           // .csv
    "application/csv",
    "text/plain",                                                         // some OS send CSV as text/plain
  ];

  if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
    cb(null, true);
  } else {
    cb(new Error("Only .xlsx, .xls and .csv files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();
router.use(authMiddleware);

// POST /api/import/contacts
router.post("/", upload.single("file"), contactImportController.uploadFile);

// GET /api/import/contacts/status/:importLogId
router.get("/status/:importLogId", contactImportController.getStatus);

export default router;