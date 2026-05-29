import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import importController from "./import.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.join(__dirname, "../../../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
    "text/plain",
  ];
  if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
    cb(null, true);
  } else {
    cb(new Error("Only .xlsx, .xls and .csv files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();
router.use(authMiddleware);

// Upload account Excel file
router.post("/excel", upload.single("file"), importController.uploadExcel);

// Resolve duplicates after user review
router.post("/resolve-duplicates", importController.resolveDuplicates);

// Check import status
router.get("/status/:importLogId", importController.getStatus);

export default router;