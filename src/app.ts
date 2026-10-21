import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import routes from "./modules/routes.js";
import { errorHandler } from "./lib/http.js";

export const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Guest-Id"],
  }),
);

app.use(express.json({ limit: "200kb" }));

app.use("/api", routes);

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.use(errorHandler);

export default app;
