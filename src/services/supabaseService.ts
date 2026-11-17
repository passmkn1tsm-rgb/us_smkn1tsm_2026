import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_DATABASE } from '../data/seedDatabase';
import {
  AdminRole,
  AdminUser,
  ExamConfig,
  ExamDatabase,
  QuestionGrade,
  QuestionItem,
  QuestionMediaItem,
  QuestionMediaLayout,
  RubricCriterion,
  StudentRecord,
  StudentSubmission
} from '../types/exam';
import { blobToDataUrl, compressImageFile } from '../utils/imageCompression';

export const SUPABASE_PROJECT_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vxagfhbaikxlbyagxnga.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_NtfOhEqmpmYt1mf4CnB0tQ_6OXMH69Y';

export const supabase: SupabaseClient = createClient(
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export function formatSupabaseError(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);

  if (
    raw.includes('Could not find the table') ||
    raw.includes('does not exist') ||
    raw.includes('42P01') ||
    raw.includes('PGRST205')
  ) {
    return 'Tabel database belum dibuat di Supabase. Salin dan jalankan kode SQL pada tab "Supabase & Kode SQL" di SQL Editor Supabase Anda, lalu klik Muat Ulang atau Unggah Data Awal.';
  }
  return raw;
}

function parseMediaLayout(val: unknown): QuestionMediaLayout {
  if (val === 'side' || val === 'compare_ab' || val === 'gallery' || val === 'top') {
    return val;
  }
  return 'top';
}

function parseMediaItems(val: unknown): QuestionMediaItem[] {
  if (Array.isArray(val)) return val as QuestionMediaItem[];
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? (parsed as QuestionMediaItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Mengunggah gambar soal dengan kompresi WebP otomatis di browser ke bucket `exam-images`.
 * Jika bucket belum dibuat di Supabase, otomatis memakai fallback data-URL terkompresi
 * agar guru tetap dapat menyusun soal tanpa hambatan.
 */
export async function uploadQuestionImageSupabase(
  file: File,
  examCode: string,
  questionId: string
): Promise<{ url: string; usedStorage: boolean; sizeKb: number }> {
  const compressed = await compressImageFile(file, 1280, 0.82);
  const safeExam = (examCode || 'EXAM').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeQid = (questionId || 'Q').replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${safeExam}/${safeQid}_${Date.now()}.${compressed.ext}`;

  try {
    const { error } = await supabase.storage.from('exam-images').upload(path, compressed.blob, {
      cacheControl: '31536000',
      contentType: compressed.mimeType,
      upsert: true
    });

    if (!error) {
      const { data } = supabase.storage.from('exam-images').getPublicUrl(path);
      if (data?.publicUrl) {
        return { url: data.publicUrl, usedStorage: true, sizeKb: compressed.sizeKb };
      }
    }
  } catch {
    // Fallback below if storage bucket isn't provisioned yet
  }

  const dataUrl = await blobToDataUrl(compressed.blob);
  return { url: dataUrl, usedStorage: false, sizeKb: compressed.sizeKb };
}

/**
 * Mengambil seluruh data untuk Konsol Guru / Admin / Pengawas.
 */
export async function fetchExamDatabaseFromSupabase(): Promise<{
  data: ExamDatabase | null;
  hasTables: boolean;
  isEmpty: boolean;
}> {
  const [cfgRes, admRes, qRes, rbRes, stRes, respRes, grRes] = await Promise.all([
    supabase.from('exam_config').select('*').limit(1),
    supabase.from('admin_users').select('*'),
    supabase.from('questions').select('*').order('order_no', { ascending: true }),
    supabase.from('rubrics').select('*').order('order_no', { ascending: true }),
    supabase.from('students').select('*'),
    supabase.from('responses').select('*'),
    supabase.from('grades').select('*')
  ]);

  const firstError =
    cfgRes.error || qRes.error || rbRes.error || stRes.error || respRes.error || grRes.error;
  if (firstError) {
    throw new Error(formatSupabaseError(firstError));
  }

  const cfgRow = cfgRes.data?.[0];
  if (!cfgRow) {
    return { data: null, hasTables: true, isEmpty: true };
  }

  const admin_users: Record<string, AdminUser> = {};
  if (!admRes.error && admRes.data && admRes.data.length > 0) {
    admRes.data.forEach((a) => {
      const uid = String(a.user_id);
      admin_users[uid] = {
        user_id: uid,
        email: String(a.email),
        full_name: String(a.full_name),
        role: (a.role as AdminRole) || 'teacher',
        access_pin: String(a.access_pin || ''),
        active: Boolean(a.active),
        created_at: a.created_at ? String(a.created_at) : undefined
      };
    });
  } else {
    Object.assign(admin_users, INITIAL_DATABASE.admin_users);
  }

  const config: ExamConfig = {
    exam_code: String(cfgRow.exam_code),
    school_name: String(cfgRow.school_name),
    exam_title: String(cfgRow.exam_title),
    duration_minutes: Number(cfgRow.duration_minutes || 120),
    max_score: Number(cfgRow.max_score || 100),
    exam_open: Boolean(cfgRow.exam_open),
    instructions: String(cfgRow.instructions || '')
  };

  const rubricsByQuestion: Record<string, Record<string, RubricCriterion>> = {};
  (rbRes.data || []).forEach((r) => {
    const qid = String(r.question_id);
    if (!rubricsByQuestion[qid]) rubricsByQuestion[qid] = {};
    rubricsByQuestion[qid][String(r.rubric_id)] = {
      rubric_id: String(r.rubric_id),
      criterion: String(r.criterion),
      description: String(r.description || ''),
      max_points: Number(r.max_points || 0),
      order_no: Number(r.order_no || 1)
    };
  });

  const questions: Record<string, QuestionItem> = {};
  (qRes.data || []).forEach((q) => {
    const qid = String(q.question_id);
    questions[qid] = {
      question_id: qid,
      exam_code: String(q.exam_code),
      subject: String(q.subject || ''),
      class_name: String(q.class_name || ''),
      competency: String(q.competency || ''),
      indicator: String(q.indicator || ''),
      topic: String(q.topic || ''),
      question_text: String(q.question_text || ''),
      answer_key: String(q.answer_key || ''),
      max_score: Number(q.max_score || 0),
      order_no: Number(q.order_no || 1),
      active: Boolean(q.active),
      media_layout: parseMediaLayout(q.media_layout),
      media_items: parseMediaItems(q.media_items),
      answer_key_image_url: q.answer_key_image_url ? String(q.answer_key_image_url) : undefined,
      rubrics: rubricsByQuestion[qid] || {}
    };
  });

  const students: Record<string, StudentRecord> = {};
  (stRes.data || []).forEach((s) => {
    const sid = String(s.student_id);
    students[sid] = {
      student_id: sid,
      full_name: String(s.full_name),
      class_name: String(s.class_name || ''),
      exam_code: String(s.exam_code),
      access_code: String(s.access_code),
      active: Boolean(s.active)
    };
  });

  const responses: Record<string, StudentSubmission> = {};
  (respRes.data || []).forEach((r) => {
    const sid = String(r.student_id);
    if (!responses[sid]) {
      responses[sid] = {
        student_id: sid,
        full_name: String(r.full_name),
        class_name: String(r.class_name || ''),
        exam_code: String(r.exam_code),
        status: r.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS',
        started_at: r.started_at ? String(r.started_at) : undefined,
        submitted_at: r.submitted_at ? String(r.submitted_at) : undefined,
        draft_updated_at: r.updated_at ? String(r.updated_at) : undefined,
        answers: {}
      };
    }
    if (r.status === 'SUBMITTED') {
      responses[sid].status = 'SUBMITTED';
      if (r.submitted_at) responses[sid].submitted_at = String(r.submitted_at);
    }
    responses[sid].answers[String(r.question_id)] = String(r.answer_text || '');
  });

  const grades: Record<string, Record<string, QuestionGrade>> = {};
  (grRes.data || []).forEach((g) => {
    const sid = String(g.student_id);
    const qid = String(g.question_id);
    if (!grades[sid]) grades[sid] = {};
    grades[sid][qid] = {
      grade_id: String(g.grade_id),
      graded_at: String(g.graded_at),
      student_id: sid,
      full_name: String(g.full_name),
      class_name: String(g.class_name || ''),
      exam_code: String(g.exam_code),
      question_id: qid,
      criteria_scores: (g.criteria_scores as Record<string, number>) || {},
      rubric_total: Number(g.rubric_total || 0),
      max_score: Number(g.max_score || 0),
      feedback: String(g.feedback || ''),
      grader_email: String(g.grader_email || '')
    };
  });

  return {
    data: { config, admin_users, questions, students, responses, grades },
    hasTables: true,
    isEmpty: false
  };
}

/**
 * Verifikasi login siswa langsung terhadap 1 baris di Supabase (tanpa mengunduh tabel siswa lain).
 */
export async function verifyStudentLoginSupabase(
  studentId: string,
  accessCode: string,
  examCode: string
): Promise<{
  student: StudentRecord;
  config: ExamConfig;
  alreadySubmitted: boolean;
} | null> {
  const [cfgRes, stRes, respRes] = await Promise.all([
    supabase.from('exam_config').select('*').eq('exam_code', examCode.trim()).limit(1),
    supabase
      .from('students')
      .select('*')
      .eq('student_id', studentId.trim())
      .eq('exam_code', examCode.trim())
      .limit(1),
    supabase
      .from('responses')
      .select('status')
      .eq('student_id', studentId.trim())
      .eq('exam_code', examCode.trim())
      .eq('status', 'SUBMITTED')
      .limit(1)
  ]);

  if (cfgRes.error || stRes.error) {
    throw cfgRes.error || stRes.error;
  }

  const cfgRow = cfgRes.data?.[0];
  const stRow = stRes.data?.[0];
  if (!cfgRow || !stRow) return null;

  if (
    !Boolean(stRow.active) ||
    String(stRow.access_code) !== accessCode.trim() ||
    String(stRow.exam_code) !== examCode.trim()
  ) {
    return null;
  }

  return {
    config: {
      exam_code: String(cfgRow.exam_code),
      school_name: String(cfgRow.school_name),
      exam_title: String(cfgRow.exam_title),
      duration_minutes: Number(cfgRow.duration_minutes || 120),
      max_score: Number(cfgRow.max_score || 100),
      exam_open: Boolean(cfgRow.exam_open),
      instructions: String(cfgRow.instructions || '')
    },
    student: {
      student_id: String(stRow.student_id),
      full_name: String(stRow.full_name),
      class_name: String(stRow.class_name || ''),
      exam_code: String(stRow.exam_code),
      access_code: String(stRow.access_code),
      active: Boolean(stRow.active)
    },
    alreadySubmitted: Boolean(respRes.data && respRes.data.length > 0)
  };
}

/**
 * Jalur RINGAN KHUSUS SISWA:
 * Hanya mengambil config ujian, soal aktif (TANPA kunci jawaban), dan jawaban milik siswa ini sendiri.
 * Tidak mengambil daftar siswa lain, akun admin, nilai, maupun jawaban peserta lain.
 */
export async function fetchStudentExamScopeFromSupabase(
  studentId: string,
  examCode: string
): Promise<{
  config: ExamConfig | null;
  questions: Record<string, QuestionItem>;
  myResponse: StudentSubmission | null;
}> {
  const [cfgRes, respRes] = await Promise.all([
    supabase.from('exam_config').select('*').eq('exam_code', examCode).limit(1),
    supabase
      .from('responses')
      .select('*')
      .eq('student_id', studentId)
      .eq('exam_code', examCode)
  ]);

  if (cfgRes.error) throw new Error(formatSupabaseError(cfgRes.error));

  // Ambil soal aktif via RPC aman (tanpa kolom answer_key); fallback ke SELECT spesifik jika RPC belum dibuat
  let qRows: Array<Record<string, unknown>> = [];
  const rpcRes = await supabase.rpc('get_student_exam_questions', { p_exam_code: examCode });
  if (!rpcRes.error && Array.isArray(rpcRes.data)) {
    qRows = rpcRes.data as Array<Record<string, unknown>>;
  } else {
    const qSel = await supabase
      .from('questions')
      .select(
        'question_id, exam_code, subject, class_name, competency, indicator, topic, question_text, max_score, order_no, active, media_layout, media_items'
      )
      .eq('exam_code', examCode)
      .eq('active', true)
      .order('order_no', { ascending: true });
    if (qSel.error) throw new Error(formatSupabaseError(qSel.error));
    qRows = (qSel.data || []) as Array<Record<string, unknown>>;
  }

  const cfgRow = cfgRes.data?.[0];
  const config: ExamConfig | null = cfgRow
    ? {
        exam_code: String(cfgRow.exam_code),
        school_name: String(cfgRow.school_name),
        exam_title: String(cfgRow.exam_title),
        duration_minutes: Number(cfgRow.duration_minutes || 120),
        max_score: Number(cfgRow.max_score || 100),
        exam_open: Boolean(cfgRow.exam_open),
        instructions: String(cfgRow.instructions || '')
      }
    : null;

  const questions: Record<string, QuestionItem> = {};
  qRows.forEach((q) => {
    const qid = String(q.question_id);
    questions[qid] = {
      question_id: qid,
      exam_code: String(q.exam_code),
      subject: String(q.subject || ''),
      class_name: String(q.class_name || ''),
      competency: String(q.competency || ''),
      indicator: String(q.indicator || ''),
      topic: String(q.topic || ''),
      question_text: String(q.question_text || ''),
      answer_key: '',
      max_score: Number(q.max_score || 0),
      order_no: Number(q.order_no || 1),
      active: Boolean(q.active),
      media_layout: parseMediaLayout(q.media_layout),
      media_items: parseMediaItems(q.media_items),
      rubrics: {}
    };
  });

  let myResponse: StudentSubmission | null = null;
  if (!respRes.error && respRes.data && respRes.data.length > 0) {
    respRes.data.forEach((r) => {
      if (!myResponse) {
        myResponse = {
          student_id: String(r.student_id),
          full_name: String(r.full_name),
          class_name: String(r.class_name || ''),
          exam_code: String(r.exam_code),
          status: r.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS',
          started_at: r.started_at ? String(r.started_at) : undefined,
          submitted_at: r.submitted_at ? String(r.submitted_at) : undefined,
          draft_updated_at: r.updated_at ? String(r.updated_at) : undefined,
          answers: {}
        };
      }
      if (r.status === 'SUBMITTED') {
        myResponse.status = 'SUBMITTED';
        if (r.submitted_at) myResponse.submitted_at = String(r.submitted_at);
      }
      myResponse.answers[String(r.question_id)] = String(r.answer_text || '');
    });
  }

  return { config, questions, myResponse };
}

/**
 * Realtime untuk Konsol Guru/Admin (mendengarkan perubahan ujian & jawaban).
 */
export function subscribeExamSupabase(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('ujian-sekolah-admin-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_config' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_users' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rubrics' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, onChange)
    .subscribe();
}

/**
 * Realtime RINGAN KHUSUS SISWA:
 * Hanya mendengarkan perubahan status buka/tutup/instruksi di exam_config.
 * Tidak ikut bereaksi saat 300 siswa lain mengetik jawaban.
 */
export function subscribeStudentConfigSupabase(
  examCode: string,
  onConfigUpdate: (config: ExamConfig) => void
): RealtimeChannel {
  return supabase
    .channel(`student-config-${examCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'exam_config',
        filter: `exam_code=eq.${examCode}`
      },
      (payload) => {
        const row = payload.new as Record<string, unknown> | undefined;
        if (!row || !row.exam_code) return;
        onConfigUpdate({
          exam_code: String(row.exam_code),
          school_name: String(row.school_name || ''),
          exam_title: String(row.exam_title || ''),
          duration_minutes: Number(row.duration_minutes || 120),
          max_score: Number(row.max_score || 100),
          exam_open: Boolean(row.exam_open),
          instructions: String(row.instructions || '')
        });
      }
    )
    .subscribe();
}

export async function verifyAdminLoginSupabase(
  email: string,
  pin: string
): Promise<Omit<AdminUser, 'access_pin'> | null> {
  const { data, error } = await supabase.rpc('verify_admin_login', {
    p_email: email.trim(),
    p_pin: pin.trim()
  });
  if (error) {
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    user_id: String(row.user_id),
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role as AdminRole,
    active: true
  };
}

export async function upsertAdminUserSupabase(user: AdminUser): Promise<void> {
  const { error } = await supabase.from('admin_users').upsert(
    {
      user_id: user.user_id,
      email: user.email.trim().toLowerCase(),
      full_name: user.full_name.trim(),
      role: user.role,
      access_pin: user.access_pin.trim(),
      active: user.active
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(formatSupabaseError(error));
}

export async function deleteAdminUserSupabase(userId: string): Promise<void> {
  const { error } = await supabase.from('admin_users').delete().eq('user_id', userId);
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertExamConfigSupabase(config: ExamConfig): Promise<void> {
  const { error } = await supabase.from('exam_config').upsert(
    {
      exam_code: config.exam_code,
      school_name: config.school_name,
      exam_title: config.exam_title,
      duration_minutes: config.duration_minutes,
      max_score: config.max_score,
      exam_open: config.exam_open,
      instructions: config.instructions,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'exam_code' }
  );
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertQuestionWithRubricsSupabase(q: QuestionItem): Promise<void> {
  const { error: qErr } = await supabase.from('questions').upsert(
    {
      question_id: q.question_id,
      exam_code: q.exam_code,
      subject: q.subject,
      class_name: q.class_name,
      competency: q.competency,
      indicator: q.indicator,
      topic: q.topic,
      question_text: q.question_text,
      answer_key: q.answer_key,
      max_score: q.max_score,
      order_no: q.order_no,
      active: q.active,
      media_layout: q.media_layout || 'top',
      media_items: q.media_items || [],
      answer_key_image_url: q.answer_key_image_url || ''
    },
    { onConflict: 'question_id' }
  );
  if (qErr) throw new Error(formatSupabaseError(qErr));

  const { error: delErr } = await supabase
    .from('rubrics')
    .delete()
    .eq('question_id', q.question_id);
  if (delErr) throw new Error(formatSupabaseError(delErr));

  const rubricRows = Object.values(q.rubrics || {}).map((rb) => ({
    rubric_id: rb.rubric_id,
    question_id: q.question_id,
    criterion: rb.criterion,
    description: rb.description,
    max_points: rb.max_points,
    order_no: rb.order_no
  }));

  if (rubricRows.length > 0) {
    const { error: rbErr } = await supabase.from('rubrics').upsert(rubricRows, {
      onConflict: 'rubric_id'
    });
    if (rbErr) throw new Error(formatSupabaseError(rbErr));
  }
}

export async function deleteQuestionSupabase(questionId: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('question_id', questionId);
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertStudentsSupabase(students: StudentRecord[]): Promise<void> {
  if (!students.length) return;
  const rows = students.map((s) => ({
    student_id: s.student_id,
    full_name: s.full_name,
    class_name: s.class_name,
    exam_code: s.exam_code,
    access_code: s.access_code,
    active: s.active
  }));
  const { error } = await supabase.from('students').upsert(rows, { onConflict: 'student_id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertStudentAnswersSupabase(
  student: StudentRecord,
  answers: Record<string, string>,
  status: 'IN_PROGRESS' | 'SUBMITTED'
): Promise<void> {
  const now = new Date().toISOString();
  const rows = Object.entries(answers).map(([questionId, answerText]) => ({
    student_id: student.student_id,
    full_name: student.full_name,
    class_name: student.class_name,
    exam_code: student.exam_code,
    question_id: questionId,
    answer_text: answerText,
    status,
    submitted_at: status === 'SUBMITTED' ? now : null,
    updated_at: now
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from('responses')
    .upsert(rows, { onConflict: 'student_id,exam_code,question_id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function resetSubmissionSupabase(
  studentId: string,
  examCode: string
): Promise<void> {
  const { error } = await supabase
    .from('responses')
    .update({ status: 'IN_PROGRESS', submitted_at: null, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('exam_code', examCode);
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertGradeSupabase(grade: QuestionGrade): Promise<void> {
  const { error } = await supabase.from('grades').upsert(
    {
      grade_id: grade.grade_id,
      student_id: grade.student_id,
      full_name: grade.full_name,
      class_name: grade.class_name,
      exam_code: grade.exam_code,
      question_id: grade.question_id,
      criteria_scores: grade.criteria_scores,
      rubric_total: grade.rubric_total,
      max_score: grade.max_score,
      feedback: grade.feedback,
      grader_email: grade.grader_email,
      graded_at: grade.graded_at
    },
    { onConflict: 'student_id,exam_code,question_id' }
  );
  if (error) throw new Error(formatSupabaseError(error));
}

export async function bulkUpsertQuestionsWithRubricsSupabase(
  questions: QuestionItem[]
): Promise<void> {
  for (const q of questions) {
    await upsertQuestionWithRubricsSupabase(q);
  }
}

export async function bulkUpsertGradesSupabase(grades: QuestionGrade[]): Promise<void> {
  if (!grades.length) return;
  const rows = grades.map((g) => ({
    grade_id: g.grade_id,
    student_id: g.student_id,
    full_name: g.full_name,
    class_name: g.class_name,
    exam_code: g.exam_code,
    question_id: g.question_id,
    criteria_scores: g.criteria_scores,
    rubric_total: g.rubric_total,
    max_score: g.max_score,
    feedback: g.feedback,
    grader_email: g.grader_email,
    graded_at: g.graded_at
  }));
  const { error } = await supabase
    .from('grades')
    .upsert(rows, { onConflict: 'student_id,exam_code,question_id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function pushFullDatabaseToSupabase(db: ExamDatabase): Promise<void> {
  await upsertExamConfigSupabase(db.config);
  const admins = Object.values(db.admin_users || {});
  if (admins.length) {
    const { error: admErr } = await supabase.from('admin_users').upsert(
      admins.map((a) => ({
        user_id: a.user_id,
        email: a.email.trim().toLowerCase(),
        full_name: a.full_name,
        role: a.role,
        access_pin: a.access_pin,
        active: a.active
      })),
      { onConflict: 'user_id' }
    );
    if (admErr) throw new Error(formatSupabaseError(admErr));
  }

  const questions = Object.values(db.questions || {});
  if (questions.length) {
    const { error: qErr } = await supabase.from('questions').upsert(
      questions.map((q) => ({
        question_id: q.question_id,
        exam_code: q.exam_code,
        subject: q.subject,
        class_name: q.class_name,
        competency: q.competency,
        indicator: q.indicator,
        topic: q.topic,
        question_text: q.question_text,
        answer_key: q.answer_key,
        max_score: q.max_score,
        order_no: q.order_no,
        active: q.active,
        media_layout: q.media_layout || 'top',
        media_items: q.media_items || [],
        answer_key_image_url: q.answer_key_image_url || ''
      })),
      { onConflict: 'question_id' }
    );
    if (qErr) throw new Error(formatSupabaseError(qErr));

    const rubricRows = questions.flatMap((q) =>
      Object.values(q.rubrics || {}).map((rb) => ({
        rubric_id: rb.rubric_id,
        question_id: q.question_id,
        criterion: rb.criterion,
        description: rb.description,
        max_points: rb.max_points,
        order_no: rb.order_no
      }))
    );
    if (rubricRows.length) {
      const { error: rbErr } = await supabase
        .from('rubrics')
        .upsert(rubricRows, { onConflict: 'rubric_id' });
      if (rbErr) throw new Error(formatSupabaseError(rbErr));
    }
  }

  const students = Object.values(db.students || {});
  if (students.length) {
    await upsertStudentsSupabase(students);
  }

  const responseRows = Object.values(db.responses || {}).flatMap((resp) =>
    Object.entries(resp.answers || {}).map(([questionId, answerText]) => ({
      student_id: resp.student_id,
      full_name: resp.full_name,
      class_name: resp.class_name,
      exam_code: resp.exam_code,
      question_id: questionId,
      answer_text: answerText,
      status: resp.status,
      started_at: resp.started_at || new Date().toISOString(),
      submitted_at: resp.status === 'SUBMITTED' ? resp.submitted_at || new Date().toISOString() : null,
      updated_at: resp.draft_updated_at || new Date().toISOString()
    }))
  );
  if (responseRows.length) {
    const { error: rErr } = await supabase
      .from('responses')
      .upsert(responseRows, { onConflict: 'student_id,exam_code,question_id' });
    if (rErr) throw new Error(formatSupabaseError(rErr));
  }

  const gradeRows = Object.values(db.grades || {}).flatMap((byQ) =>
    Object.values(byQ).map((g) => ({
      grade_id: g.grade_id,
      student_id: g.student_id,
      full_name: g.full_name,
      class_name: g.class_name,
      exam_code: g.exam_code,
      question_id: g.question_id,
      criteria_scores: g.criteria_scores,
      rubric_total: g.rubric_total,
      max_score: g.max_score,
      feedback: g.feedback,
      grader_email: g.grader_email,
      graded_at: g.graded_at
    }))
  );
  if (gradeRows.length) {
    const { error: gErr } = await supabase
      .from('grades')
      .upsert(gradeRows, { onConflict: 'student_id,exam_code,question_id' });
    if (gErr) throw new Error(formatSupabaseError(gErr));
  }
}
