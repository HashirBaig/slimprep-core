import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
});
export const env = schema.parse(process.env);
