import 'server-only';

import { createHash, randomInt } from 'node:crypto';

/** Cryptographically random 6-digit code, zero-padded. */
export function generateOtp(): string {
  return String(randomInt(1_000_000)).padStart(6, '0');
}

/**
 * SHA-256(phone + ':' + code). The phone acts as a salt so identical codes
 * across users don't produce identical hashes.
 */
export function hashOtp(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}
