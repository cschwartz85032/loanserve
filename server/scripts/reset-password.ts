import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function resetPassword() {
  try {
    const hashedPassword = await hashPassword("loanatik");
    
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, "loanatik"));
    
    console.log("Password reset successfully for user 'loanatik'");
  } catch (error) {
    console.error("Error resetting password:", error);
  } finally {
    process.exit(0);
  }
}

resetPassword();