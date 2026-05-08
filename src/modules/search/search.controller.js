import searchService from "./search.service.js";

const searchController = {

  // GET /api/search/prospects
  searchProspects: async (req, res, next) => {
    try {
      const result = await searchService.searchProspects(req.query);

      res.status(200).json({
        success: true,
        data:       result.prospects,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/search/filters
  getFilterOptions: async (req, res, next) => {
    try {
      const options = await searchService.getFilterOptions();

      res.status(200).json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default searchController;