import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import errorMiddleware from "./common/middlewares/error.middleware.js";
import router from "./routes/index.js";

// ─── Model Imports ─────────────────────────────────────────────────────────────
import "./modules/user/user.model.js";
import "./modules/prospect/prospect.model.js";
import "./modules/contacts/contact.model.js";          // ← ADD kiya
import "./modules/campaign/campaign.model.js";
import "./modules/importLog/importLog.model.js";
import "./modules/interaction/interaction.model.js";
import "./modules/enrichment/enrichment.model.js";
import "./modules/notification/notification.model.js";
import "./modules/duplicate/duplicate.model.js";
import "./modules/icp/icp.model.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PRD Backend is running",
    environment: process.env.NODE_ENV,
  });
});

app.use("/api", router);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
});

app.use(errorMiddleware);

export default app;