import bcrypt from "bcrypt";
import crypto from "crypto";
import { env } from "../config/env";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}



export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
