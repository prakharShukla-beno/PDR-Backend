import app from "./app.js";
import connectDB from "./config/db.js";
import { PORT, NODE_ENV } from "./config/env.js";
import logger from "./common/utils/logger.js";

const startServer = async () => {
  // Connect to database first — if connection fails the process will exit
  await connectDB();

  // Start the server once the database connection is ready
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${NODE_ENV}`);
  });
};

startServer();