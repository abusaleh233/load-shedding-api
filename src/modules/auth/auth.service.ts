import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import { AuthProvider, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { hashPassword, comparePassword, hashToken } from "../../utils/hash";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { env } from "../../config/env";
import { recordAudit } from "../audit/audit.service";
import { RegisterInput, LoginInput } from "./auth.schema";

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function msFromDuration(duration: string): number {
  // supports simple formats like "15m", "7d", "1h"
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return value * unitMs;
}

async function issueTokenPair(userId: string, email: string, role: Role, ip?: string) {
  const jti = uuidv4();
  const accessToken = signAccessToken({ sub: userId, email, role });
  const refreshToken = signRefreshToken({ sub: userId, jti });

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId,
      expiresAt: new Date(Date.now() + msFromDuration(env.JWT_REFRESH_EXPIRES_IN)),
    },
  });

  await recordAudit({
    userId,
    action: "AUTH_TOKEN_ISSUED",
    entity: "User",
    entityId: userId,
    ipAddress: ip,
  });

  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput, ip?: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const hashedPassword = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        phone: input.phone,
        role: Role.CONSUMER,
        provider: AuthProvider.LOCAL,
      },
    });
    await recordAudit(
      { userId: created.id, action: "USER_REGISTERED", entity: "User", entityId: created.id, ipAddress: ip },
      tx
    );
    return created;
  });

  const tokens = await issueTokenPair(user.id, user.email, user.role, ip);
  return { user: sanitizeUser(user), ...tokens };
}

export async function loginUser(input: LoginInput, ip?: string) {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
  });

  if (!user || !user.password) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  const valid = await comparePassword(input.password, user.password);
  if (!valid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const tokens = await issueTokenPair(user.id, user.email, user.role, ip);
  await recordAudit({ userId: user.id, action: "USER_LOGIN", entity: "User", entityId: user.id, ipAddress: ip });

  return { user: sanitizeUser(user), ...tokens };
}

/**
 * GCP / Google Social Login: verifies the ID token issued by Google's
 * OAuth 2.0 flow (client-side sign-in), then finds-or-creates a local
 * user record linked via googleId.
 */
export async function loginWithGoogle(idToken: string, ip?: string) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw ApiError.internal("Google OAuth is not configured on this server");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Invalid Google ID token");
  }

  if (!payload?.email) {
    throw ApiError.unauthorized("Google token did not contain a verified email");
  }

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name ?? payload.email.split("@")[0],
        email: payload.email,
        googleId: payload.sub,
        provider: AuthProvider.GOOGLE,
        isVerified: payload.email_verified ?? true,
        role: Role.CONSUMER,
      },
    });
    await recordAudit({
      userId: user.id,
      action: "USER_REGISTERED_GOOGLE",
      entity: "User",
      entityId: user.id,
      ipAddress: ip,
    });
  } else if (!user.googleId) {
    // Link existing local account to Google identity
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: payload.sub, isVerified: true },
    });
  }

  if (!user.isActive || user.deletedAt) {
    throw ApiError.forbidden("This account is deactivated");
  }

  const tokens = await issueTokenPair(user.id, user.email, user.role, ip);
  return { user: sanitizeUser(user), ...tokens };
}

/**
 * Refresh-token rotation: validates the signature + DB record, revokes the
 * used token, and issues a brand-new pair. Prevents replay of stolen
 * refresh tokens beyond a single use.
 */
export async function refreshTokens(refreshToken: string, ip?: string) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revoked || stored.expiresAt < new Date() || stored.userId !== decoded.sub) {
    throw ApiError.unauthorized("Refresh token is invalid, expired, or has been revoked");
  }

  const user = await prisma.user.findFirst({ where: { id: decoded.sub, deletedAt: null, isActive: true } });
  if (!user) {
    throw ApiError.unauthorized("User no longer exists or is deactivated");
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

  const tokens = await issueTokenPair(user.id, user.email, user.role, ip);
  return { user: sanitizeUser(user), ...tokens };
}

export async function logoutUser(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
}

function sanitizeUser<T extends { password?: string | null }>(user: T) {
  const { password, ...safe } = user;
  return safe;
}
