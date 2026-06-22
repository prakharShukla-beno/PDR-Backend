import searchService from "./search.service.js";
import { getCompanyIdFromRequest } from "../../common/utils/tenantScope.js";

const searchController = {

  searchProspects: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const result = await searchService.searchProspects(companyId, req.query);
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({
        success:    true,
        data:       result.prospects,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  searchContacts: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const result = await searchService.searchContacts(companyId, req.query);
      res.status(200).json({
        success:    true,
        data:       result.contacts,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  getFilterOptions: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const options = await searchService.getFilterOptions(companyId);
      res.status(200).json({
        success: true,
        data:    options,
      });
    } catch (error) {
      next(error);
    }
  },

  globalSearch: async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromRequest(req);
      const q = req.query.q ?? req.query.search ?? "";
      const results = await searchService.globalSearch(companyId, q);
      const total =
        results.accounts.length +
        results.segments.length +
        results.campaigns.length +
        results.contacts.length;

      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(200).json({
        success: true,
        query: q,
        total,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default searchController;
