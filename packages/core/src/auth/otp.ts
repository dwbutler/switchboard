/**
 * OTP (One-Time Password) auth module.
 * Generates 6-digit codes using crypto.randomInt, stores them in memory
 * with a 5-minute expiry. Used to pair Telegram users with workspace sessions.
 */

import { randomInt } from 'node:crypto';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export interface OTPRecord {
  code: string;
  userId: string;
  createdAt: number; // Date.now()
  expiresAt: number; // Date.now() + OTP_EXPIRY_MS
  /** Number of failed verification attempts */
  attempts: number;
}

export interface OTPVerifyResult {
  success: boolean;
  userId?: string;
  reason?: 'invalid' | 'expired' | 'too_many_attempts';
}

export class OTPService {
  /** code → OTPRecord */
  private store = new Map<string, OTPRecord>();
  /** userId → code (so we can look up existing OTPs per user) */
  private userIndex = new Map<string, string>();

  /**
   * Generate a new OTP for a user.
   * If the user already has a valid OTP, invalidates it and issues a fresh one.
   */
  generate(userId: string): string {
    // Revoke any existing OTP for this user
    const existingCode = this.userIndex.get(userId);
    if (existingCode) {
      this.store.delete(existingCode);
      this.userIndex.delete(userId);
    }

    const code = this.generateCode();
    const now = Date.now();

    this.store.set(code, {
      code,
      userId,
      createdAt: now,
      expiresAt: now + OTP_EXPIRY_MS,
      attempts: 0,
    });
    this.userIndex.set(userId, code);

    return code;
  }

  /**
   * Verify a code. Returns the userId on success, or a failure reason.
   * Consumed codes are deleted on success.
   */
  verify(code: string): OTPVerifyResult {
    this.pruneExpired();

    const record = this.store.get(code);

    if (!record) {
      return { success: false, reason: 'invalid' };
    }

    if (Date.now() > record.expiresAt) {
      this.revoke(record.userId);
      return { success: false, reason: 'expired' };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      this.revoke(record.userId);
      return { success: false, reason: 'too_many_attempts' };
    }

    // Increment attempts before checking — on success we delete anyway
    record.attempts += 1;

    // The code is exactly right
    const userId = record.userId;
    this.revoke(userId);
    return { success: true, userId };
  }

  /**
   * Manually revoke any OTP for a user (e.g. on logout).
   */
  revoke(userId: string): void {
    const code = this.userIndex.get(userId);
    if (code) {
      this.store.delete(code);
      this.userIndex.delete(userId);
    }
  }

  /**
   * Check if a user currently has a valid, unexpired OTP.
   */
  hasValidOTP(userId: string): boolean {
    const code = this.userIndex.get(userId);
    if (!code) return false;
    const record = this.store.get(code);
    if (!record) return false;
    return Date.now() < record.expiresAt;
  }

  /**
   * How many seconds until the user's current OTP expires.
   * Returns 0 if no OTP or already expired.
   */
  ttlSeconds(userId: string): number {
    const code = this.userIndex.get(userId);
    if (!code) return 0;
    const record = this.store.get(code);
    if (!record) return 0;
    const remaining = record.expiresAt - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /** Number of currently active (unexpired) OTPs in the store */
  get size(): number {
    this.pruneExpired();
    return this.store.size;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private generateCode(): string {
    // Generate a 6-digit code (000000 – 999999)
    const n = randomInt(0, 1_000_000);
    return n.toString().padStart(OTP_LENGTH, '0');
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [code, record] of this.store.entries()) {
      if (now > record.expiresAt) {
        this.store.delete(code);
        this.userIndex.delete(record.userId);
      }
    }
  }
}

/** Singleton OTP service instance for shared use */
export const otpService = new OTPService();
