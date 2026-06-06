import { Router } from "express";
import searchController from "./search.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// GET /api/search/prospects?industryInclude[]=Healthcare&countryExclude[]=India
router.get("/prospects", searchController.searchProspects);

// GET /api/search/contacts?functionalDomainInclude[]=Technology&hasPhone=true
router.get("/contacts",  searchController.searchContacts);

// GET /api/search/filters
router.get("/filters",   searchController.getFilterOptions);

export default router;