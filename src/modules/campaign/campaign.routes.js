import { Router } from "express";
import { body } from "express-validator";
import campaignController from "./campaign.controller.js";
import authMiddleware from "../../common/middlewares/auth.middleware.js";

const router = Router();
router.use(authMiddleware);

// Get all campaigns
router.get("/", campaignController.getAll);

// Create new campaign
router.post(
  "/",
  [
    body("name")
      .notEmpty().withMessage("Campaign name is required")
      .trim(),
    body("status")
      .optional()
      .isIn(["draft", "active", "completed"]).withMessage("Invalid status"),
  ],
  campaignController.create
);

// Get single campaign
router.get("/:id", campaignController.getById);

// Update campaign
router.put("/:id", campaignController.update);

// Delete campaign
router.delete("/:id", campaignController.delete);

// Add contacts to campaign (Apollo style)
// Body: { contactIds: ["id1", "id2", ...] }
router.post("/:id/contacts", campaignController.addContacts);

// Remove single contact from campaign
router.delete("/:id/contacts/:contactId", campaignController.removeContact);

// Update campaign stats
router.put("/:id/stats", campaignController.updateStats);

export default router;