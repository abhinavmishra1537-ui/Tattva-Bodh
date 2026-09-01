import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ */
/* CODE FORMAT — ONE canonical format for every code in the product:   */
/*   exactly 6 uppercase alphanumeric characters, no dash, no prefix.  */
/*                                                                     */
/* Applies to BOTH:                                                    */
/*   · issued_credentials.login_code  (a student's personal code)      */
/*   · classrooms.join_code           (a whole classroom's code)       */
/*                                                                     */
/* Generation, display, input and validation all route through the     */
/* helpers below so the formats can never drift apart again.           */
/* ------------------------------------------------------------------ */

/** Unambiguous alphabet — omits 0/O and 1/I/L so codes survive handwriting. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 6;

/** The single source of truth for what a valid code looks like. */
export const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function generateLoginCode(length = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Classroom join codes use the exact same format as student login codes. */
export function generateJoinCode(): string {
  return generateLoginCode(CODE_LENGTH);
}

/**
 * Canonicalises anything a human might type or paste: trims whitespace,
 * uppercases, and strips separators (dashes/spaces) plus any legacy
 * "ENG-" style subject prefix. Use on BOTH sides of every comparison.
 */
export function normalizeCode(input: string): string {
  return (input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.]/g, "");
}

export function isValidCodeFormat(input: string): boolean {
  return CODE_PATTERN.test(normalizeCode(input));
}

/** Synthetic auth email for credential-code students (Supabase Auth needs one). */
export function studentEmailForCode(code: string): string {
  return `${normalizeCode(code).toLowerCase()}@student.tattvabodh.app`;
}

/* ------------------------------------------------------------------ */
/* Dates & countdowns                                                  */
/* ------------------------------------------------------------------ */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export type DeadlineState = "safe" | "soon" | "over";

export interface Countdown {
  ms: number;
  state: DeadlineState;
  label: string;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function getCountdown(deadlineIso: string, now = Date.now()): Countdown {
  const ms = new Date(deadlineIso).getTime() - now;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.floor((abs % HOUR) / 60_000);

  let core: string;
  if (d >= 2) core = `${d} days`;
  else if (d === 1) core = `1 day ${h}h`;
  else if (h >= 1) core = `${h}h ${m}m`;
  else core = `${m}m`;

  const state: DeadlineState = ms <= 0 ? "over" : ms < DAY ? "soon" : "safe";
  return {
    ms,
    state,
    label: ms <= 0 ? `Overdue by ${core}` : `Due in ${core}`,
  };
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */
export function difficultyLabel(d: number): string {
  return d === 1 ? "Easy" : d === 2 ? "Medium" : "Hard";
}

/**
 * Builds a misconception tag_code from the chapter name + tag label, matching
 * how the seeded tags were generated: lowercase, non-alphanumerics collapsed
 * to single hyphens, e.g. ("Number Systems", "Confuses area with perimeter")
 * -> "number-systems-confuses-area-with-perimeter".
 */
export function slugifyTagCode(chapterName: string, label: string): string {
  return `${chapterName} ${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
