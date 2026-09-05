import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  // In production, this MUST come from Cloudflare environmental variables (e.g. env.JWT_SECRET)
  process.env.JWT_SECRET || 'fallback_secret_for_local_development_only'
);

export interface JWTPayload {
  userId: string;
  userType: 'employee' | 'employer' | 'admin' | 'superadmin' | 'masteradmin';
  verifiedStatus: 'pending' | 'verified' | 'rejected';
}

/**
 * Hash a password using bcrypt with 12 rounds as specified in SRS.
 */
export async function hashPassword(password: string): Promise<string> {
  // SRS requires exactly 12 rounds for security
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a raw password with a hashed password.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT for a given payload.
 */
export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 24 hours expiration
    .sign(JWT_SECRET);
}

/**
 * Verify a JWT and return its payload.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Generate a short-lived reset token (JWT) containing the user's email.
 */
export async function signResetToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m') // 15 minutes expiration
    .sign(JWT_SECRET);
}

/**
 * Verify a short-lived reset token and return the associated email.
 */
export async function verifyResetToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.email as string;
  } catch (err) {
    return null;
  }
}
