import { Router } from "express";
import searchController from "./search.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();

// All search routes require login
router.use(authMiddleware);

// GET /api/search/prospects?search=acme&primaryIndustry=BFSI&page=1&limit=10
router.get("/prospects", searchController.searchProspects);

// GET /api/search/filters
router.get("/filters", searchController.getFilterOptions);

export default router;