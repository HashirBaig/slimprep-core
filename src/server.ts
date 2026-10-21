import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("MongoDB connected");
  const server = app.listen(env.PORT, () =>
    console.log(`API: http://localhost:${env.PORT}/api`),
  );
  const shutdown = () =>
    server.close(() => void mongoose.disconnect().then(() => process.exit(0)));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
