import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import qs from "qs";
import errorMiddleware from "./common/middlewares/error.middleware.js";
import router from "./routes/index.js";

// ─── Model Imports ─────────────────────────────────────────────────────────────
import "./modules/user/user.model.js";
import "./modules/company/company.model.js";
import "./modules/prospect/prospect.model.js";
import "./modules/contacts/contact.model.js";
import "./modules/campaign/campaign.model.js";
import "./modules/importLog/importLog.model.js";
import "./modules/import/importJob.model.js";
import "./modules/import/stagedRow.model.js";
import "./modules/interaction/interaction.model.js";
import "./modules/enrichment/enrichment.model.js";
import "./modules/notification/notification.model.js";
import "./modules/duplicate/duplicate.model.js";
import "./modules/icp/icp.model.js";
import "./modules/segment/segment.model.js";

const app = express();

// JSON API responses must not return 304 with empty bodies (breaks client polling)
app.set("etag", false);

// ── Fix: parse array query params using `qs` so brackets become arrays
// Example: countryInclude[]=India&countryInclude[]=USA → { countryInclude: ["India", "USA"] }
// Without this, Express would return bracketed params as strings instead of arrays
app.set("query parser", (str) =>
  qs.parse(str, { allowDots: true, arrayLimit: 100 })
);

const allowedOrigins = [
  "https://benogroup.in",
  "https://www.benogroup.in",
  "http://localhost:3000",
  process.env.FRONTEND_URL?.replace(/\/+$/, ""),
].filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
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