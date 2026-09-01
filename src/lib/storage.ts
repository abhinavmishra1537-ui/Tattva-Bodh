import { supabase, ASSIGNMENT_BUCKET } from "./supabaseClient";

/**
 * Every file upload in the app goes through here, so the bucket name is
 * written exactly once: "assignment-files".
 */
export interface UploadResult {
  url: string | null;
  error: string | null;
}

function friendlyStorageError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("bucket not found") || m.includes("not found")) {
    return `Storage bucket "${ASSIGNMENT_BUCKET}" was not found. Create a bucket with exactly that name in Supabase → Storage.`;
  }
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("403")) {
    return `Upload was blocked by storage permissions on "${ASSIGNMENT_BUCKET}". Check the bucket's access policies.`;
  }
  if (m.includes("payload too large") || m.includes("413")) {
    return "That file is larger than the storage limit. Try a smaller file.";
  }
  if (m.includes("duplicate") || m.includes("already exists")) {
    return "A file with that exact name already exists. Rename it and try again.";
  }
  return message;
}

export async function uploadFile(path: string, file: File): Promise<UploadResult> {
  const { error } = await supabase.storage
    .from(ASSIGNMENT_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: "3600" });

  if (error) {
    console.error(
      `[Tattva Bodh] storage upload failed · bucket="${ASSIGNMENT_BUCKET}" path="${path}":`,
      error
    );
    return { url: null, error: friendlyStorageError(error.message) };
  }

  const { data } = supabase.storage.from(ASSIGNMENT_BUCKET).getPublicUrl(path);
  console.debug(`[Tattva Bodh] uploaded to "${ASSIGNMENT_BUCKET}/${path}"`);
  return { url: data.publicUrl, error: null };
}

/** Storage path for a teacher's assignment brief. */
export function briefPath(classroomId: string, fileName: string): string {
  return `${classroomId}/briefs/${Date.now()}-${sanitize(fileName)}`;
}

/** Storage path for a student's submission. */
export function submissionPath(
  classroomId: string,
  assignmentId: string,
  studentId: string,
  fileName: string
): string {
  return `${classroomId}/submissions/${assignmentId}/${studentId}-${Date.now()}-${sanitize(fileName)}`;
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, "-");
}

/** Submissions store either a public URL or a "note:" text answer. */
export const NOTE_PREFIX = "note:";
export const isNote = (value: string) => value.startsWith(NOTE_PREFIX);
export const noteText = (value: string) => value.slice(NOTE_PREFIX.length);
