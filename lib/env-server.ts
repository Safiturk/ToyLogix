import "server-only";
import { readServerEnv } from "./env-validation";
export const serverEnv = (authRequired = false) => readServerEnv(process.env, authRequired);
