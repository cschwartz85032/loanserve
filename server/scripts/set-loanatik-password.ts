import { db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function setLoanatikPassword() {
  try {
    const newPassword = "loanatik";
    const hashedPassword = await hashPassword(newPassword);
    
    // Update the password for loanatik user
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, "loanatik"));
    
    console.log("Password updated successfully for user 'loanatik'");
    console.log("New credentials: username='loanatik', password='loanatik'");
    process.exit(0);
  } catch (error) {
    console.error("Error updating password:", error);
    process.exit(1);
  }
}

setLoanatikPassword();