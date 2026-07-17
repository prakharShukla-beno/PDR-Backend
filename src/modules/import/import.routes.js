import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import importController from "./import.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";
import { editorPlus, viewerPlus } from "../../common/middlewares/rbac.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.join(__dirname, "../../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".xlsx";
    cb(null, `pdr-import-${Date.now()}${ext}`);
  },
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
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});
export const uploadToDisk = multer({
  storage: diskStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
}).single("file");

const router = Router();
router.use(authMiddleware);

router.post("/excel/preview",        editorPlus, upload.single("file"), importController.previewExcel);
router.post("/excel",                editorPlus, upload.single("file"), importController.uploadExcel);
router.post("/excel/async",          editorPlus, uploadToDisk, importController.importExcelAsync);
router.get("/jobs",                  viewerPlus, importController.getImportJobs);
router.post("/jobs/:jobId/cancel",   editorPlus, importController.cancelImportJob);
router.get("/jobs/:jobId",           viewerPlus, importController.getImportJobStatus);
router.post("/resolve-duplicates", editorPlus, importController.resolveDuplicates);
router.get("/status/:importLogId", viewerPlus, importController.getStatus);

export default router;
