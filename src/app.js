import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import qs from "qs";
import errorMiddleware from "./common/middlewares/error.middleware.js";
import router from "./routes/index.js";

// ─── Model Imports ─────────────────────────────────────────────────────────────
import "./modules/user/user.model.js";
import "./modules/prospect/prospect.model.js";
import "./modules/contacts/contact.model.js";
import "./modules/campaign/campaign.model.js";
import "./modules/importLog/importLog.model.js";
import "./modules/interaction/interaction.model.js";
import "./modules/enrichment/enrichment.model.js";
import "./modules/notification/notification.model.js";
import "./modules/duplicate/duplicate.model.js";
import "./modules/icp/icp.model.js";

const app = express();

// ── Fix: parse array query params using `qs` so brackets become arrays
// Example: countryInclude[]=India&countryInclude[]=USA → { countryInclude: ["India", "USA"] }
// Without this, Express would return bracketed params as strings instead of arrays
app.set("query parser", (str) =>
  qs.parse(str, { allowDots: true, arrayLimit: 100 })
);

const corsOrigins = [
  "https://pdr-frontend-five.vercel.app",
  "http://localhost:3000",
];
if (process.env.FRONTEND_URL) {
  corsOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ""));
}

app.use(helmet());
app.use(cors({ origin: corsOrigins }));
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