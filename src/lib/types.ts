export type Role = "teacher" | "student";
export type ConfidenceLevel = "low" | "medium" | "high";
export type Difficulty = 1 | 2 | 3;

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  created_at?: string;
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  subject: string;
  join_code: string;
  created_at?: string;
}

export interface ClassroomStudent {
  id: string;
  classroom_id: string;
  student_id: string;
  joined_at: string;
}

export interface IssuedCredential {
  id: string;
  classroom_id: string;
  student_name: string;
  login_code: string;
  is_used: boolean;
  created_at?: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Chapter {
  id: string;
  subject_id: string;
  name: string;
}

export interface MisconceptionTag {
  id: string;
  chapter_id: string;
  tag_code: string;
  label: string;
  description: string | null;
}

export interface Question {
  id: string;
  chapter_id: string;
  question_text: string;
  difficulty: Difficulty;
  created_at?: string;
}

export interface Option {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  misconception_tag_id: string | null;
}

export interface StudentResponse {
  id: string;
  student_id: string;
  question_id: string;
  selected_option_id: string;
  is_correct: boolean;
  misconception_tag_id: string | null;
  attempted_at: string;
}

export interface ConfidenceScore {
  id: string;
  student_id: string;
  misconception_tag_id: string;
  repeat_count: number;
  confidence_level: ConfidenceLevel;
  last_updated: string;
}

export interface Assignment {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  deadline: string;
  created_at?: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_file_url: string;
  submitted_at: string;
}

export interface Doubt {
  id: string;
  student_id: string;
  classroom_id: string;
  question_id: string | null;
  message: string;
  teacher_reply: string | null;
  status: "open" | "answered";
  created_at: string;
  replied_at: string | null;
}

/** A question hydrated with its answer options (practice flow + question bank). */
export interface HydratedQuestion extends Question {
  options: Option[];
}
