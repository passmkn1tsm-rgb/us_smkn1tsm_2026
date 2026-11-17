export type AdminRole = 'super_admin' | 'teacher' | 'proctor';

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  access_pin: string;
  active: boolean;
  created_at?: string;
}

export interface ExamConfig {
  school_name: string;
  exam_title: string;
  exam_code: string;
  duration_minutes: number;
  max_score: number;
  exam_open: boolean;
  instructions: string;
  strict_focus?: boolean;
  block_copy_paste?: boolean;
}

export interface RubricCriterion {
  rubric_id: string;
  criterion: string;
  description: string;
  max_points: number;
  order_no: number;
}

export type QuestionMediaLayout = 'top' | 'side' | 'compare_ab' | 'gallery';

export interface ImagePin {
  id: string;
  label: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  note?: string;
}

export interface QuestionMediaItem {
  id: string;
  url: string;
  caption?: string;
  alt?: string;
  label?: string;
  pins?: ImagePin[];
}

export interface QuestionItem {
  question_id: string;
  exam_code: string;
  subject: string;
  class_name: string;
  competency: string;
  indicator: string;
  topic: string;
  question_text: string;
  answer_key: string;
  max_score: number;
  order_no: number;
  active: boolean;
  media_layout?: QuestionMediaLayout;
  media_items?: QuestionMediaItem[];
  answer_key_image_url?: string;
  rubrics: Record<string, RubricCriterion>;
}

export interface StudentRecord {
  student_id: string;
  full_name: string;
  class_name: string;
  exam_code: string;
  access_code: string;
  active: boolean;
}

export interface StudentSubmission {
  student_id: string;
  full_name: string;
  class_name: string;
  exam_code: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  started_at?: string;
  submitted_at?: string;
  draft_updated_at?: string;
  focus_violations?: number;
  answers: Record<string, string>;
}

export interface QuestionGrade {
  grade_id: string;
  graded_at: string;
  student_id: string;
  full_name: string;
  class_name: string;
  exam_code: string;
  question_id: string;
  criteria_scores: Record<string, number>;
  rubric_total: number;
  max_score: number;
  feedback: string;
  grader_email: string;
}

export interface ExamDatabase {
  config: ExamConfig;
  admin_users: Record<string, AdminUser>;
  questions: Record<string, QuestionItem>;
  students: Record<string, StudentRecord>;
  responses: Record<string, StudentSubmission>;
  grades: Record<string, Record<string, QuestionGrade>>;
}

export type AuthSession =
  | { kind: 'student'; student: StudentRecord }
  | { kind: 'admin'; admin: Omit<AdminUser, 'access_pin'> & { session_token?: string } }
  | null;

export interface StudentResultRow {
  studentId: string;
  name: string;
  className: string;
  examCode: string;
  earned: number;
  max: number;
  score: number;
  gradedCount: number;
  totalQuestions: number;
  status: 'Terkoreksi' | 'Belum lengkap';
}

export interface ItemAnalysisRow {
  questionId: string;
  subject: string;
  indicator: string;
  questionText: string;
  maxScore: number;
  responses: number;
  graded: number;
  meanScore: number | null;
  indicatorAttainment: number | null;
  difficulty: number | null;
  difficultyLabel: 'Sukar' | 'Sedang' | 'Mudah' | 'Belum tersedia';
  discrimination: number | null;
  recommendation: string;
}

export interface AuditFinding {
  id: string;
  severity: 'Kritis' | 'Tinggi' | 'Sedang';
  file: 'US-kode_6db8c6b0.gs' | '_DOCTYPE_b9c4b4e0.html';
  location: string;
  title: string;
  spreadsheetIssue: string;
  supabaseResolution: string;
}
