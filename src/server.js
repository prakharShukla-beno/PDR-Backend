import app from "./app.js";
import connectDB from "./config/db.js";
import { PORT, NODE_ENV } from "./config/env.js";
import logger from "./common/utils/logger.js";

const startServer = async () => {
  // Pehle DB connect karo — fail hoga toh process.exit() ho jaega
  await connectDB();

  // DB ready hai toh server start karo
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${NODE_ENV}`);
  });
};

startServer();