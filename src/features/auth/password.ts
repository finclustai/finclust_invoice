import bcrypt from "bcryptjs";
import type { Role } from "./permissions";

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
}

// Compared against when no user matches, so an unknown email costs the same time
// as a wrong password; otherwise latency reveals which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("finclust-timing-equaliser", 10);

export async function verifyCredentials(
  findByEmail: (email: string) => Promise<AuthUserRecord | null>,
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  const user = await findByEmail(email);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  // Checked after the hash, so a deactivated account isn't distinguishable by timing.
  return user.isActive ? user : null;
}
