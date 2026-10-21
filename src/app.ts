import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import routes from "./modules/routes.js";
import { errorHandler } from "./lib/http.js";
import { createHelmetMiddleware } from "./lib/helmet.js";

export const app = express();

// Security middleware
app.use(createHelmetMiddleware());

// CORS configuration

const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((origin) =>
  origin.trim().replace(/\/+$/, ""),
);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Guest-Id"],
  }),
);

// JSON body parser
app.use(express.json({ limit: "200kb" }));

// API routes
app.use("/api", routes);

// Not found handler
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Global error handler
app.use(errorHandler);

export default app;
