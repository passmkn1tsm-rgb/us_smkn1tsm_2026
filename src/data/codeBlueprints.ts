export const SUPABASE_SCHEMA_SQL = `-- ============================================================================
-- SKEMA DATABASE POSTGRESQL SUPABASE - APLIKASI UJIAN URAIAN
-- Jalankan seluruh skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Tabel Konfigurasi Ujian (Pengganti sheet Config)
CREATE TABLE IF NOT EXISTS public.exam_config (
  exam_code         text PRIMARY KEY,
  school_name       text NOT NULL,
  exam_title        text NOT NULL,
  duration_minutes  integer NOT NULL DEFAULT 120,
  max_score         integer NOT NULL DEFAULT 100,
  exam_open         boolean NOT NULL DEFAULT false,
  instructions      text NOT NULL DEFAULT '',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 1b. Tabel Hak Akses Admin, Guru & Pengawas (Pengganti TEACHER_EMAILS di Script Properties)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id     text PRIMARY KEY,
  email       text UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin', 'teacher', 'proctor')),
  access_pin  text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabel Bank Soal Uraian (Pengganti sheet Questions + dukungan soal bergambar)
CREATE TABLE IF NOT EXISTS public.questions (
  question_id           text PRIMARY KEY,
  exam_code             text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  subject               text NOT NULL DEFAULT '',
  class_name            text NOT NULL DEFAULT '',
  competency            text NOT NULL DEFAULT '',
  indicator             text NOT NULL DEFAULT '',
  topic                 text NOT NULL DEFAULT '',
  question_text         text NOT NULL,
  answer_key            text NOT NULL DEFAULT '',
  max_score             numeric(8,2) NOT NULL DEFAULT 10,
  order_no              integer NOT NULL DEFAULT 1,
  active                boolean NOT NULL DEFAULT true,
  media_layout          text NOT NULL DEFAULT 'top',
  media_items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_key_image_url  text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Migrasi aman bila tabel questions sudah ada sebelumnya
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_layout text NOT NULL DEFAULT 'top';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_key_image_url text NOT NULL DEFAULT '';

-- 3. Tabel Rubrik Penilaian (Pengganti sheet Rubrics)
CREATE TABLE IF NOT EXISTS public.rubrics (
  rubric_id    text PRIMARY KEY,
  question_id  text NOT NULL REFERENCES public.questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE,
  criterion    text NOT NULL,
  description  text NOT NULL DEFAULT '',
  max_points   numeric(8,2) NOT NULL DEFAULT 5,
  order_no     integer NOT NULL DEFAULT 1
);

-- 4. Tabel Peserta Ujian (Pengganti sheet Students)
CREATE TABLE IF NOT EXISTS public.students (
  student_id   text PRIMARY KEY,
  full_name    text NOT NULL,
  class_name   text NOT NULL DEFAULT '',
  exam_code    text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  access_code  text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 5. Tabel Jawaban Peserta (Pengganti sheet Responses, mendukung draf & submit final)
CREATE TABLE IF NOT EXISTS public.responses (
  response_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    text NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  full_name     text NOT NULL,
  class_name    text NOT NULL DEFAULT '',
  exam_code     text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id   text NOT NULL REFERENCES public.questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE,
  answer_text   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_response_student_exam_question UNIQUE (student_id, exam_code, question_id)
);

-- 6. Tabel Nilai Rubrik Guru (Pengganti sheet Grades, idempoten per siswa-soal)
CREATE TABLE IF NOT EXISTS public.grades (
  grade_id         text PRIMARY KEY,
  student_id       text NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  full_name        text NOT NULL,
  class_name       text NOT NULL DEFAULT '',
  exam_code        text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id      text NOT NULL REFERENCES public.questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE,
  criteria_scores  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric_total     numeric(8,2) NOT NULL DEFAULT 0,
  max_score        numeric(8,2) NOT NULL DEFAULT 0,
  feedback         text NOT NULL DEFAULT '',
  grader_email     text NOT NULL DEFAULT '',
  graded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_grade_student_exam_question UNIQUE (student_id, exam_code, question_id)
);

-- Indeks Performa Query
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users (lower(email), active);
CREATE INDEX IF NOT EXISTS idx_questions_exam_active ON public.questions (exam_code, active, order_no);
CREATE INDEX IF NOT EXISTS idx_rubrics_question ON public.rubrics (question_id, order_no);
CREATE INDEX IF NOT EXISTS idx_students_exam_class ON public.students (exam_code, class_name, active);
CREATE INDEX IF NOT EXISTS idx_responses_exam_status ON public.responses (exam_code, status, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_exam_student ON public.grades (exam_code, student_id);

-- Fungsi RPC Verifikasi Login Admin/Guru di Sisi Server PostgreSQL
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_pin text)
RETURNS TABLE (
  user_id text,
  email text,
  full_name text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT a.user_id, a.email, a.full_name, a.role
  FROM public.admin_users a
  WHERE lower(trim(a.email)) = lower(trim(p_email))
    AND a.access_pin = trim(p_pin)
    AND a.active = true
  LIMIT 1;
$$;

-- Fungsi RPC Khusus Siswa: Hanya mengambil soal aktif TANPA mengirim answer_key (kunci jawaban)
CREATE OR REPLACE FUNCTION public.get_student_exam_questions(p_exam_code text)
RETURNS TABLE (
  question_id text,
  exam_code text,
  subject text,
  class_name text,
  competency text,
  indicator text,
  topic text,
  question_text text,
  max_score numeric,
  order_no integer,
  active boolean,
  media_layout text,
  media_items jsonb
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    q.question_id,
    q.exam_code,
    q.subject,
    q.class_name,
    q.competency,
    q.indicator,
    q.topic,
    q.question_text,
    q.max_score,
    q.order_no,
    q.active,
    q.media_layout,
    q.media_items
  FROM public.questions q
  WHERE q.exam_code = trim(p_exam_code)
    AND q.active = true
  ORDER BY q.order_no ASC;
$$;

-- View Rekap Nilai Otomatis (Langsung bisa dilihat di Table Editor Supabase)
CREATE OR REPLACE VIEW public.v_student_scores AS
SELECT
  s.student_id,
  s.full_name,
  s.class_name,
  s.exam_code,
  COALESCE(SUM(g.rubric_total), 0) AS total_earned,
  COALESCE(SUM(q.max_score), 0) AS total_max,
  CASE
    WHEN COALESCE(SUM(q.max_score), 0) > 0
      THEN ROUND((COALESCE(SUM(g.rubric_total), 0) / SUM(q.max_score)) * 100, 2)
    ELSE 0
  END AS final_score,
  COUNT(g.grade_id) AS graded_items,
  COUNT(q.question_id) AS total_active_questions
FROM public.students s
JOIN public.questions q
  ON q.exam_code = s.exam_code AND q.active = true
LEFT JOIN public.grades g
  ON g.student_id = s.student_id AND g.exam_code = s.exam_code AND g.question_id = q.question_id
WHERE s.active = true
GROUP BY s.student_id, s.full_name, s.class_name, s.exam_code;

-- Bucket Supabase Storage untuk Gambar Soal Ujian (exam-images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-images', 'exam-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "public_read_exam_images" ON storage.objects;
CREATE POLICY "public_read_exam_images" ON storage.objects
  FOR SELECT USING (bucket_id = 'exam-images');

DROP POLICY IF EXISTS "allow_upload_exam_images" ON storage.objects;
CREATE POLICY "allow_upload_exam_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'exam-images');

DROP POLICY IF EXISTS "allow_update_exam_images" ON storage.objects;
CREATE POLICY "allow_update_exam_images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'exam-images');

DROP POLICY IF EXISTS "allow_delete_exam_images" ON storage.objects;
CREATE POLICY "allow_delete_exam_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'exam-images');

-- Aktifkan Supabase Realtime pada seluruh tabel ujian
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['exam_config', 'admin_users', 'questions', 'rubrics', 'students', 'responses', 'grades']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.exam_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_exam_config" ON public.exam_config;
CREATE POLICY "allow_all_exam_config" ON public.exam_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_admin_users" ON public.admin_users;
CREATE POLICY "allow_all_admin_users" ON public.admin_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_questions" ON public.questions;
CREATE POLICY "allow_all_questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_rubrics" ON public.rubrics;
CREATE POLICY "allow_all_rubrics" ON public.rubrics FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_students" ON public.students;
CREATE POLICY "allow_all_students" ON public.students FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_responses" ON public.responses;
CREATE POLICY "allow_all_responses" ON public.responses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_grades" ON public.grades;
CREATE POLICY "allow_all_grades" ON public.grades FOR ALL USING (true) WITH CHECK (true);`;

export const GAS_SUPABASE_BRIDGE_GS = `/**
 * BRIDGE GOOGLE APPS SCRIPT -> SUPABASE REST API (PostgREST)
 * Menggantikan seluruh pembacaan/penulisan SpreadsheetApp di US-kode_6db8c6b0.gs
 *
 * Pengaturan di Project Settings -> Script Properties:
 * 1. SUPABASE_URL  = https://vxagfhbaikxlbyagxnga.supabase.co
 * 2. SUPABASE_KEY  = (Gunakan Service Role Key atau Publishable Key dari Dashboard Supabase)
 * 3. TEACHER_EMAILS = guru1@sekolah.sch.id,guru2@sekolah.sch.id
 */

function sbConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('SUPABASE_URL') || '').replace(/\\/+$/, '');
  var key = props.getProperty('SUPABASE_KEY') || '';
  if (!url || !key) throw new Error('SUPABASE_URL dan SUPABASE_KEY belum diatur di Script Properties.');
  return { url: url, key: key };
}

function sbFetch_(endpoint, method, payload, extraHeaders) {
  var cfg = sbConfig_();
  var headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json'
  };
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
  }
  var options = {
    method: method || 'get',
    headers: headers,
    muteHttpExceptions: true
  };
  if (payload !== undefined) {
    options.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + endpoint, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase Error (' + code + '): ' + text);
  }
  return text ? JSON.parse(text) : [];
}

// 1. Pengganti studentLogin() - Query terindeks tanpa memindai seluruh baris Sheet
function studentLoginSupabase(studentId, accessCode, examCode) {
  studentId = String(studentId || '').trim();
  accessCode = String(accessCode || '').trim();
  examCode = String(examCode || '').trim();

  var configs = sbFetch_('exam_config?exam_code=eq.' + encodeURIComponent(examCode), 'get');
  if (!configs.length || !configs[0].exam_open) {
    throw new Error('Ujian belum dibuka oleh guru.');
  }

  var students = sbFetch_(
    'students?student_id=eq.' + encodeURIComponent(studentId) +
    '&exam_code=eq.' + encodeURIComponent(examCode) +
    '&active=eq.true',
    'get'
  );
  if (!students.length || String(students[0].access_code) !== accessCode) {
    throw new Error('Identitas atau kode akses tidak valid.');
  }

  var submitted = sbFetch_(
    'responses?student_id=eq.' + encodeURIComponent(studentId) +
    '&exam_code=eq.' + encodeURIComponent(examCode) +
    '&status=eq.SUBMITTED&select=response_id',
    'get'
  );
  if (submitted.length) {
    throw new Error('Jawaban untuk ujian ini sudah dikirim.');
  }

  var questions = sbFetch_(
    'questions?exam_code=eq.' + encodeURIComponent(examCode) +
    '&active=eq.true&order=order_no.asc',
    'get'
  );

  return {
    student: students[0],
    exam: configs[0],
    questions: questions
  };
}

// 2. Pengganti submitAnswers() - UPSERT paralel TANPA LockService
function submitAnswersSupabase(studentId, fullName, className, examCode, answersMap) {
  var rows = Object.keys(answersMap || {}).map(function (qid) {
    return {
      student_id: String(studentId),
      full_name: String(fullName),
      class_name: String(className),
      exam_code: String(examCode),
      question_id: String(qid),
      answer_text: String(answersMap[qid] || ''),
      status: 'SUBMITTED',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  if (!rows.length) throw new Error('Tidak ada jawaban yang dikirim.');

  sbFetch_(
    'responses?on_conflict=student_id,exam_code,question_id',
    'post',
    rows,
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );
  return { success: true, message: 'Jawaban tersimpan sinkron ke Supabase PostgreSQL.' };
}

// 3. Pengganti gradeResponse() - Idempoten via UPSERT tanpa deleteRow() loop
function gradeResponseSupabase(studentId, examCode, questionId, criteriaScores, feedback, graderEmail) {
  var rubrics = sbFetch_('rubrics?question_id=eq.' + encodeURIComponent(questionId), 'get');
  if (!rubrics.length) throw new Error('Rubrik belum dibuat untuk soal ini.');

  var total = 0;
  var max = 0;
  rubrics.forEach(function (rb) {
    var score = Number((criteriaScores || {})[rb.rubric_id] || 0);
    var cap = Number(rb.max_points || 0);
    if (score < 0 || score > cap) throw new Error('Skor rubrik melebihi batas maksimum.');
    total += score;
    max += cap;
  });

  var students = sbFetch_('students?student_id=eq.' + encodeURIComponent(studentId), 'get');
  var st = students[0] || { full_name: '', class_name: '' };

  sbFetch_(
    'grades?on_conflict=student_id,exam_code,question_id',
    'post',
    [{
      grade_id: 'G-' + studentId + '-' + questionId,
      student_id: String(studentId),
      full_name: String(st.full_name),
      class_name: String(st.class_name),
      exam_code: String(examCode),
      question_id: String(questionId),
      criteria_scores: criteriaScores,
      rubric_total: total,
      max_score: max,
      feedback: String(feedback || ''),
      grader_email: String(graderEmail || ''),
      graded_at: new Date().toISOString()
    }],
    { Prefer: 'resolution=merge-duplicates,return=minimal' }
  );

  return { success: true, questionScore: total, questionMax: max };
}

// 4. Migrasi 1-Klik: Pindahkan isi Google Sheet lama ke Supabase
function migrateSheetsToSupabase() {
  var cfgRows = rows_('Config');
  var cfg = {};
  cfgRows.forEach(function (r) { cfg[String(r.key)] = String(r.value); });

  sbFetch_('exam_config?on_conflict=exam_code', 'post', [{
    exam_code: String(cfg.exam_code || 'USXII2027'),
    school_name: String(cfg.school_name || 'Sekolah'),
    exam_title: String(cfg.exam_title || 'Ujian Sekolah'),
    duration_minutes: Number(cfg.duration_minutes || 120),
    max_score: Number(cfg.max_score || 100),
    exam_open: String(cfg.exam_open).toLowerCase() === 'true',
    instructions: String(cfg.instructions || '')
  }], { Prefer: 'resolution=merge-duplicates' });

  var questions = rows_('Questions').map(function (q) {
    return {
      question_id: String(q.question_id),
      exam_code: String(q.exam_code),
      subject: String(q.subject || ''),
      class_name: String(q.class_name || ''),
      competency: String(q.competency || ''),
      indicator: String(q.indicator || ''),
      topic: String(q.topic || ''),
      question_text: String(q.question_text || ''),
      answer_key: String(q.answer_key || ''),
      max_score: Number(q.max_score || 10),
      order_no: Number(q.order_no || 1),
      active: String(q.active).toLowerCase() === 'true'
    };
  });
  if (questions.length) {
    sbFetch_('questions?on_conflict=question_id', 'post', questions, { Prefer: 'resolution=merge-duplicates' });
  }

  var rubrics = rows_('Rubrics').map(function (rb) {
    return {
      rubric_id: String(rb.rubric_id),
      question_id: String(rb.question_id),
      criterion: String(rb.criterion),
      description: String(rb.description || ''),
      max_points: Number(rb.max_points || 5),
      order_no: Number(rb.order_no || 1)
    };
  });
  if (rubrics.length) {
    sbFetch_('rubrics?on_conflict=rubric_id', 'post', rubrics, { Prefer: 'resolution=merge-duplicates' });
  }

  var students = rows_('Students').map(function (s) {
    return {
      student_id: String(s.student_id),
      full_name: String(s.full_name),
      class_name: String(s.class_name || ''),
      exam_code: String(s.exam_code),
      access_code: String(s.access_code),
      active: String(s.active).toLowerCase() === 'true'
    };
  });
  if (students.length) {
    sbFetch_('students?on_conflict=student_id', 'post', students, { Prefer: 'resolution=merge-duplicates' });
  }

  return 'Migrasi Google Sheets ke Supabase berhasil!';
}`;

export const SUPABASE_CLIENT_TS = `import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// 1. Auto-save Draf Esai Siswa (upsert atomik tanpa antrean lock)
export async function saveEssayDraft(
  studentId: string,
  fullName: string,
  className: string,
  examCode: string,
  questionId: string,
  answerText: string
) {
  const { error } = await supabase.from('responses').upsert(
    {
      student_id: studentId,
      full_name: fullName,
      class_name: className,
      exam_code: examCode,
      question_id: questionId,
      answer_text: answerText,
      status: 'IN_PROGRESS',
      updated_at: new Date().toISOString()
    },
    { onConflict: 'student_id,exam_code,question_id' }
  );
  if (error) throw error;
}

// 2. Submit Final Seluruh Jawaban Sekaligus
export async function submitAllEssays(
  studentId: string,
  fullName: string,
  className: string,
  examCode: string,
  answers: Record<string, string>
) {
  const now = new Date().toISOString();
  const rows = Object.entries(answers).map(([questionId, answerText]) => ({
    student_id: studentId,
    full_name: fullName,
    class_name: className,
    exam_code: examCode,
    question_id: questionId,
    answer_text: answerText,
    status: 'SUBMITTED',
    submitted_at: now,
    updated_at: now
  }));

  const { error } = await supabase
    .from('responses')
    .upsert(rows, { onConflict: 'student_id,exam_code,question_id' });
  if (error) throw error;
}

// 3. Langganan Realtime untuk Konsol Guru
export function subscribeExamChanges(onRefresh: () => void) {
  return supabase
    .channel('exam-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_config' }, onRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, onRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, onRefresh)
    .subscribe();
}`;
