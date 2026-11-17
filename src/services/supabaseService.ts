import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_DATABASE } from '../data/seedDatabase';
import {
  AdminRole,
  AdminUser,
  ExamConfig,
  ExamDatabase,
  QuestionGrade,
  QuestionItem,
  RubricCriterion,
  StudentRecord,
  StudentSubmission
} from '../types/exam';

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

  // Group rubrics by question_id
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

  // Group normalized response rows (student_id, question_id) into StudentSubmission map
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

export function subscribeExamSupabase(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('ujian-sekolah-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_config' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_users' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rubrics' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, onChange)
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
      active: q.active
    },
    { onConflict: 'question_id' }
  );
  if (qErr) throw new Error(formatSupabaseError(qErr));

  // Sync rubrics cleanly for this question
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
  // 1. Config & Admin Users
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

  // 2. Questions & Rubrics
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
        active: q.active
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

  // 3. Students
  const students = Object.values(db.students || {});
  if (students.length) {
    await upsertStudentsSupabase(students);
  }

  // 4. Responses
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

  // 5. Grades
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
