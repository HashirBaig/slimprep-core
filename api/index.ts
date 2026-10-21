import type { Request, Response, NextFunction } from "express";

import { app } from "../src/app.js";
import { connectDB } from "../src/db/mongoose.js";

// Vercel serverless handler.
export default async function handler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await connectDB();
    app(req, res);
  } catch (error) {
    console.error("Database connection failed:", error);

    if (!res.headersSent) {
      res.status(503).json({
        error: "Database temporarily unavailable",
      });
    } else {
      next(error);
    }
  }
}
