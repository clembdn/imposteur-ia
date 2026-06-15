import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// Charge le .env situé à la racine du monorepo, quel que soit le cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../");
dotenv.config({ path: path.join(repoRoot, ".env") });

export const env = {
  port: Number(process.env.SERVER_PORT ?? process.env.PORT) || 2567,
  /** 0.0.0.0 = accessible depuis le réseau local (LAN). */
  host: process.env.SERVER_HOST ?? "0.0.0.0",
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  },
};

export const hasAI = () => env.deepseek.apiKey.trim().length > 0;
