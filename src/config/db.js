import mongoose from "mongoose";
import { MONGO_URI } from "./env.js";
import logger from "../common/utils/logger.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB Connection Failed: ${error.message}`);
   
    process.exit(1);
  }
};     
export default connectDB;