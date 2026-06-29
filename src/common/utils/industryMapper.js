// industryMapper.js — Re-export industry/sector mapping from shared constants
// 
// This file maintains backward compatibility by re-exporting the shared mapping.
// New imports should use: src/common/constants/sectorMapping.js directly
//
// IMPORTANT: All parent→child mappings are now centralized in sectorMapping.js
// to ensure consistency across import, search, and enrichment flows.

export {
  SECTOR_TO_INDUSTRIES,
  expandSectors,
  getSectorForIndustry,
  resolveToCommercialSector,
  isValidChildIndustry,
  normalizeIndustryValue,
  buildIndustryToSectorMap,
} from "../constants/sectorMapping.js";
