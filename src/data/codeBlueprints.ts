export const SUPABASE_SCHEMA_SQL = `-- ============================================================================
-- SKEMA DATABASE POSTGRESQL SUPABASE - APLIKASI UJIAN URAIAN (KEAMANAN KETAT)
-- Jalankan seluruh skrip ini di Supabase Dashboard -> SQL Editor -> New Query
-- Skrip ini AMAN dijalankan ulang pada database yang sudah berisi data.
-- ============================================================================

-- 1. Tabel Konfigurasi Ujian
CREATE TABLE IF NOT EXISTS public.exam_config (
  exam_code         text PRIMARY KEY,
  school_name       text NOT NULL,
  exam_title        text NOT NULL,
  duration_minutes  integer NOT NULL DEFAULT 120,
  max_score         integer NOT NULL DEFAULT 100,
  exam_open         boolean NOT NULL DEFAULT false,
  strict_focus      boolean NOT NULL DEFAULT true,
  block_copy_paste  boolean NOT NULL DEFAULT false,
  instructions      text NOT NULL DEFAULT '',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_config ADD COLUMN IF NOT EXISTS strict_focus boolean NOT NULL DEFAULT true;
ALTER TABLE public.exam_config ADD COLUMN IF NOT EXISTS block_copy_paste boolean NOT NULL DEFAULT false;

-- 1b. Tabel Hak Akses Admin, Guru & Pengawas
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id     text PRIMARY KEY,
  email       text UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin', 'teacher', 'proctor')),
  access_pin  text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed akun Super Admin awal hanya jika belum ada (ganti PIN setelah masuk menu Hak Akses)
INSERT INTO public.admin_users (user_id, email, full_name, role, access_pin, active)
VALUES ('ADM001', 'passmkn1tsm@gmail.com', 'Administrator Utama', 'super_admin', 'admin123', true)
ON CONFLICT (user_id) DO NOTHING;

-- 1c. Tabel Sesi Token Pengelola (Berlaku 12 Jam di Sisi Server)
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token       text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabel Bank Soal Uraian + Soal Bergambar
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

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_layout text NOT NULL DEFAULT 'top';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_key_image_url text NOT NULL DEFAULT '';

-- 3. Tabel Rubrik Penilaian
CREATE TABLE IF NOT EXISTS public.rubrics (
  rubric_id    text PRIMARY KEY,
  question_id  text NOT NULL REFERENCES public.questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE,
  criterion    text NOT NULL,
  description  text NOT NULL DEFAULT '',
  max_points   numeric(8,2) NOT NULL DEFAULT 5,
  order_no     integer NOT NULL DEFAULT 1
);

-- 4. Tabel Peserta Ujian
CREATE TABLE IF NOT EXISTS public.students (
  student_id   text PRIMARY KEY,
  full_name    text NOT NULL,
  class_name   text NOT NULL DEFAULT '',
  exam_code    text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  access_code  text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 5. Tabel Jawaban Peserta (termasuk pencatatan perpindahan tab)
CREATE TABLE IF NOT EXISTS public.responses (
  response_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        text NOT NULL REFERENCES public.students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  full_name         text NOT NULL,
  class_name        text NOT NULL DEFAULT '',
  exam_code         text NOT NULL REFERENCES public.exam_config(exam_code) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id       text NOT NULL REFERENCES public.questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE,
  answer_text       text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED')),
  focus_violations  integer NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_response_student_exam_question UNIQUE (student_id, exam_code, question_id)
);

ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS focus_violations integer NOT NULL DEFAULT 0;

-- 6. Tabel Nilai Rubrik Guru
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
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp ON public.admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_questions_exam_active ON public.questions (exam_code, active, order_no);
CREATE INDEX IF NOT EXISTS idx_rubrics_question ON public.rubrics (question_id, order_no);
CREATE INDEX IF NOT EXISTS idx_students_exam_class ON public.students (exam_code, class_name, active);
CREATE INDEX IF NOT EXISTS idx_responses_exam_status ON public.responses (exam_code, status, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_exam_student ON public.grades (exam_code, student_id);

-- ============================================================================
-- FUNGSI KEAMANAN SISI SERVER (SECURITY DEFINER RPCs)
-- ============================================================================

-- Helper otorisasi peran pengelola di server
CREATE OR REPLACE FUNCTION public.require_admin_role_(p_token text, p_allowed_roles text[])
RETURNS public.admin_sessions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sess public.admin_sessions;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Sesi pengelola tidak valid atau sudah berakhir. Silakan login ulang.';
  END IF;

  SELECT s.* INTO v_sess
  FROM public.admin_sessions s
  JOIN public.admin_users u ON u.user_id = s.user_id
  WHERE s.token = trim(p_token)
    AND s.expires_at > now()
    AND u.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi pengelola kadaluwarsa atau akun nonaktif. Silakan login ulang.';
  END IF;

  IF NOT (v_sess.role = ANY(p_allowed_roles)) THEN
    RAISE EXCEPTION 'Akses ditolak: peran % tidak memiliki izin untuk aksi ini.', v_sess.role;
  END IF;

  RETURN v_sess;
END;
$$;

-- Login Pengelola (mengembalikan session_token, TANPA access_pin)
DROP FUNCTION IF EXISTS public.verify_admin_login(text, text);
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_pin text)
RETURNS TABLE (
  user_id text,
  email text,
  full_name text,
  role text,
  session_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user public.admin_users;
  v_token text;
BEGIN
  DELETE FROM public.admin_sessions WHERE expires_at < now();

  SELECT a.* INTO v_user
  FROM public.admin_users a
  WHERE lower(trim(a.email)) = lower(trim(p_email))
    AND a.access_pin = trim(p_pin)
    AND a.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_token := gen_random_uuid()::text;
  INSERT INTO public.admin_sessions (token, user_id, email, role, expires_at)
  VALUES (v_token, v_user.user_id, v_user.email, v_user.role, now() + interval '12 hours');

  RETURN QUERY SELECT v_user.user_id, v_user.email, v_user.full_name, v_user.role, v_token;
END;
$$;

-- Login Siswa Tervalidasi di Server
CREATE OR REPLACE FUNCTION public.verify_student_login(
  p_student_id text,
  p_access_code text,
  p_exam_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg public.exam_config;
  v_st public.students;
  v_submitted boolean := false;
BEGIN
  SELECT * INTO v_cfg
  FROM public.exam_config
  WHERE exam_code = trim(p_exam_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_st
  FROM public.students
  WHERE student_id = trim(p_student_id)
    AND exam_code = trim(p_exam_code)
    AND access_code = trim(p_access_code)
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.responses
    WHERE student_id = v_st.student_id
      AND exam_code = v_st.exam_code
      AND status = 'SUBMITTED'
  ) INTO v_submitted;

  RETURN jsonb_build_object(
    'config', to_jsonb(v_cfg),
    'student', to_jsonb(v_st),
    'already_submitted', v_submitted
  );
END;
$$;

-- Pengambilan Soal Khusus Siswa (Wajib terverifikasi & TANPA kunci jawaban)
CREATE OR REPLACE FUNCTION public.get_student_exam_scope(
  p_student_id text,
  p_access_code text,
  p_exam_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cfg public.exam_config;
  v_st public.students;
  v_questions jsonb;
  v_responses jsonb;
BEGIN
  SELECT * INTO v_cfg
  FROM public.exam_config
  WHERE exam_code = trim(p_exam_code)
  LIMIT 1;

  IF NOT FOUND OR NOT v_cfg.exam_open THEN
    RAISE EXCEPTION 'Ujian belum dibuka oleh pengawas.';
  END IF;

  SELECT * INTO v_st
  FROM public.students
  WHERE student_id = trim(p_student_id)
    AND exam_code = trim(p_exam_code)
    AND access_code = trim(p_access_code)
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akses peserta tidak valid.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', q.question_id,
    'exam_code', q.exam_code,
    'subject', q.subject,
    'class_name', q.class_name,
    'competency', q.competency,
    'indicator', q.indicator,
    'topic', q.topic,
    'question_text', q.question_text,
    'max_score', q.max_score,
    'order_no', q.order_no,
    'active', q.active,
    'media_layout', q.media_layout,
    'media_items', q.media_items
  ) ORDER BY q.order_no ASC), '[]'::jsonb)
  INTO v_questions
  FROM public.questions q
  WHERE q.exam_code = v_st.exam_code AND q.active = true;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_responses
  FROM public.responses r
  WHERE r.student_id = v_st.student_id AND r.exam_code = v_st.exam_code;

  RETURN jsonb_build_object(
    'config', to_jsonb(v_cfg),
    'questions', v_questions,
    'responses', v_responses
  );
END;
$$;

-- Simpan Draf / Kirim Final Jawaban Siswa (Tervalidasi & anti-ubah setelah SUBMITTED)
CREATE OR REPLACE FUNCTION public.student_upsert_answers(
  p_student_id text,
  p_access_code text,
  p_exam_code text,
  p_answers jsonb,
  p_status text,
  p_focus_violations integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_st public.students;
  v_already_submitted boolean;
  v_now timestamptz := now();
  v_qid text;
  v_ans text;
BEGIN
  SELECT * INTO v_st
  FROM public.students
  WHERE student_id = trim(p_student_id)
    AND exam_code = trim(p_exam_code)
    AND access_code = trim(p_access_code)
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kredensial peserta tidak valid.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.responses
    WHERE student_id = v_st.student_id
      AND exam_code = v_st.exam_code
      AND status = 'SUBMITTED'
  ) INTO v_already_submitted;

  IF v_already_submitted THEN
    RAISE EXCEPTION 'Jawaban sudah terkirim dan terkunci.';
  END IF;

  FOR v_qid, v_ans IN SELECT key, value FROM jsonb_each_text(COALESCE(p_answers, '{}'::jsonb))
  LOOP
    INSERT INTO public.responses (
      student_id, full_name, class_name, exam_code, question_id,
      answer_text, status, focus_violations, started_at, submitted_at, updated_at
    )
    VALUES (
      v_st.student_id,
      v_st.full_name,
      v_st.class_name,
      v_st.exam_code,
      v_qid,
      COALESCE(v_ans, ''),
      CASE WHEN p_status = 'SUBMITTED' THEN 'SUBMITTED' ELSE 'IN_PROGRESS' END,
      GREATEST(0, COALESCE(p_focus_violations, 0)),
      v_now,
      CASE WHEN p_status = 'SUBMITTED' THEN v_now ELSE NULL END,
      v_now
    )
    ON CONFLICT (student_id, exam_code, question_id) DO UPDATE SET
      answer_text = EXCLUDED.answer_text,
      status = CASE
        WHEN public.responses.status = 'SUBMITTED' THEN 'SUBMITTED'
        ELSE EXCLUDED.status
      END,
      focus_violations = GREATEST(public.responses.focus_violations, EXCLUDED.focus_violations),
      submitted_at = COALESCE(public.responses.submitted_at, EXCLUDED.submitted_at),
      updated_at = v_now;
  END LOOP;
END;
$$;

-- RPC Pengelola: Ambil database konsol sesuai peran token
CREATE OR REPLACE FUNCTION public.admin_fetch_exam_database(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sess public.admin_sessions;
  v_cfg jsonb;
  v_admins jsonb := '[]'::jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_rubrics jsonb := '[]'::jsonb;
  v_students jsonb := '[]'::jsonb;
  v_responses jsonb := '[]'::jsonb;
  v_grades jsonb := '[]'::jsonb;
BEGIN
  v_sess := public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher', 'proctor']);

  SELECT to_jsonb(c) INTO v_cfg FROM public.exam_config c LIMIT 1;

  IF v_sess.role = 'super_admin' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', u.user_id,
      'email', u.email,
      'full_name', u.full_name,
      'role', u.role,
      'active', u.active,
      'created_at', u.created_at
    )), '[]'::jsonb)
    INTO v_admins FROM public.admin_users u;
  END IF;

  IF v_sess.role IN ('super_admin', 'teacher') THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.order_no ASC), '[]'::jsonb)
    INTO v_questions FROM public.questions q;

    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.order_no ASC), '[]'::jsonb)
    INTO v_rubrics FROM public.rubrics r;

    SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    INTO v_grades FROM public.grades g;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
  INTO v_students FROM public.students s;

  IF v_sess.role = 'proctor' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'student_id', r.student_id,
      'full_name', r.full_name,
      'class_name', r.class_name,
      'exam_code', r.exam_code,
      'question_id', r.question_id,
      'answer_text', '',
      'status', r.status,
      'focus_violations', r.focus_violations,
      'started_at', r.started_at,
      'submitted_at', r.submitted_at,
      'updated_at', r.updated_at
    )), '[]'::jsonb)
    INTO v_responses FROM public.responses r;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_responses FROM public.responses r;
  END IF;

  RETURN jsonb_build_object(
    'config', v_cfg,
    'admin_users', v_admins,
    'questions', v_questions,
    'rubrics', v_rubrics,
    'students', v_students,
    'responses', v_responses,
    'grades', v_grades
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_config(p_token text, p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sess public.admin_sessions;
BEGIN
  v_sess := public.require_admin_role_(p_token, ARRAY['super_admin', 'proctor']);

  IF v_sess.role = 'proctor' THEN
    UPDATE public.exam_config
    SET exam_open = COALESCE((p_config ->> 'exam_open')::boolean, exam_open),
        updated_at = now()
    WHERE exam_code = p_config ->> 'exam_code';
    RETURN;
  END IF;

  INSERT INTO public.exam_config (
    exam_code, school_name, exam_title, duration_minutes, max_score,
    exam_open, strict_focus, block_copy_paste, instructions, updated_at
  )
  VALUES (
    p_config ->> 'exam_code',
    p_config ->> 'school_name',
    p_config ->> 'exam_title',
    COALESCE((p_config ->> 'duration_minutes')::integer, 120),
    COALESCE((p_config ->> 'max_score')::integer, 100),
    COALESCE((p_config ->> 'exam_open')::boolean, false),
    COALESCE((p_config ->> 'strict_focus')::boolean, true),
    COALESCE((p_config ->> 'block_copy_paste')::boolean, false),
    COALESCE(p_config ->> 'instructions', ''),
    now()
  )
  ON CONFLICT (exam_code) DO UPDATE SET
    school_name = EXCLUDED.school_name,
    exam_title = EXCLUDED.exam_title,
    duration_minutes = EXCLUDED.duration_minutes,
    max_score = EXCLUDED.max_score,
    exam_open = EXCLUDED.exam_open,
    strict_focus = EXCLUDED.strict_focus,
    block_copy_paste = EXCLUDED.block_copy_paste,
    instructions = EXCLUDED.instructions,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_question(
  p_token text,
  p_question jsonb,
  p_rubrics jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qid text := p_question ->> 'question_id';
  v_rb jsonb;
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher']);

  INSERT INTO public.questions (
    question_id, exam_code, subject, class_name, competency, indicator, topic,
    question_text, answer_key, max_score, order_no, active,
    media_layout, media_items, answer_key_image_url
  )
  VALUES (
    v_qid,
    p_question ->> 'exam_code',
    COALESCE(p_question ->> 'subject', ''),
    COALESCE(p_question ->> 'class_name', ''),
    COALESCE(p_question ->> 'competency', ''),
    COALESCE(p_question ->> 'indicator', ''),
    COALESCE(p_question ->> 'topic', ''),
    COALESCE(p_question ->> 'question_text', ''),
    COALESCE(p_question ->> 'answer_key', ''),
    COALESCE((p_question ->> 'max_score')::numeric, 10),
    COALESCE((p_question ->> 'order_no')::integer, 1),
    COALESCE((p_question ->> 'active')::boolean, true),
    COALESCE(p_question ->> 'media_layout', 'top'),
    COALESCE(p_question -> 'media_items', '[]'::jsonb),
    COALESCE(p_question ->> 'answer_key_image_url', '')
  )
  ON CONFLICT (question_id) DO UPDATE SET
    exam_code = EXCLUDED.exam_code,
    subject = EXCLUDED.subject,
    class_name = EXCLUDED.class_name,
    competency = EXCLUDED.competency,
    indicator = EXCLUDED.indicator,
    topic = EXCLUDED.topic,
    question_text = EXCLUDED.question_text,
    answer_key = EXCLUDED.answer_key,
    max_score = EXCLUDED.max_score,
    order_no = EXCLUDED.order_no,
    active = EXCLUDED.active,
    media_layout = EXCLUDED.media_layout,
    media_items = EXCLUDED.media_items,
    answer_key_image_url = EXCLUDED.answer_key_image_url;

  DELETE FROM public.rubrics WHERE question_id = v_qid;

  FOR v_rb IN SELECT * FROM jsonb_array_elements(COALESCE(p_rubrics, '[]'::jsonb))
  LOOP
    INSERT INTO public.rubrics (rubric_id, question_id, criterion, description, max_points, order_no)
    VALUES (
      v_rb ->> 'rubric_id',
      v_qid,
      COALESCE(v_rb ->> 'criterion', ''),
      COALESCE(v_rb ->> 'description', ''),
      COALESCE((v_rb ->> 'max_points')::numeric, 5),
      COALESCE((v_rb ->> 'order_no')::integer, 1)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_question(p_token text, p_question_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher']);
  DELETE FROM public.questions WHERE question_id = p_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_students(p_token text, p_students jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_st jsonb;
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher', 'proctor']);
  FOR v_st IN SELECT * FROM jsonb_array_elements(COALESCE(p_students, '[]'::jsonb))
  LOOP
    INSERT INTO public.students (student_id, full_name, class_name, exam_code, access_code, active)
    VALUES (
      v_st ->> 'student_id',
      v_st ->> 'full_name',
      COALESCE(v_st ->> 'class_name', ''),
      v_st ->> 'exam_code',
      v_st ->> 'access_code',
      COALESCE((v_st ->> 'active')::boolean, true)
    )
    ON CONFLICT (student_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      class_name = EXCLUDED.class_name,
      exam_code = EXCLUDED.exam_code,
      access_code = EXCLUDED.access_code,
      active = EXCLUDED.active;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_submission(p_token text, p_student_id text, p_exam_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher', 'proctor']);
  UPDATE public.responses
  SET status = 'IN_PROGRESS', submitted_at = NULL, updated_at = now()
  WHERE student_id = p_student_id AND exam_code = p_exam_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_grades(p_token text, p_grades jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_g jsonb;
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin', 'teacher']);
  FOR v_g IN SELECT * FROM jsonb_array_elements(COALESCE(p_grades, '[]'::jsonb))
  LOOP
    INSERT INTO public.grades (
      grade_id, student_id, full_name, class_name, exam_code, question_id,
      criteria_scores, rubric_total, max_score, feedback, grader_email, graded_at
    )
    VALUES (
      v_g ->> 'grade_id',
      v_g ->> 'student_id',
      COALESCE(v_g ->> 'full_name', ''),
      COALESCE(v_g ->> 'class_name', ''),
      v_g ->> 'exam_code',
      v_g ->> 'question_id',
      COALESCE(v_g -> 'criteria_scores', '{}'::jsonb),
      COALESCE((v_g ->> 'rubric_total')::numeric, 0),
      COALESCE((v_g ->> 'max_score')::numeric, 0),
      COALESCE(v_g ->> 'feedback', ''),
      COALESCE(v_g ->> 'grader_email', ''),
      COALESCE((v_g ->> 'graded_at')::timestamptz, now())
    )
    ON CONFLICT (student_id, exam_code, question_id) DO UPDATE SET
      criteria_scores = EXCLUDED.criteria_scores,
      rubric_total = EXCLUDED.rubric_total,
      max_score = EXCLUDED.max_score,
      feedback = EXCLUDED.feedback,
      grader_email = EXCLUDED.grader_email,
      graded_at = EXCLUDED.graded_at;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_user(p_token text, p_user jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin text := trim(COALESCE(p_user ->> 'access_pin', ''));
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin']);

  INSERT INTO public.admin_users (user_id, email, full_name, role, access_pin, active)
  VALUES (
    p_user ->> 'user_id',
    lower(trim(p_user ->> 'email')),
    trim(p_user ->> 'full_name'),
    COALESCE(p_user ->> 'role', 'teacher'),
    CASE WHEN v_pin = '' THEN 'ubah_pin_segera' ELSE v_pin END,
    COALESCE((p_user ->> 'active')::boolean, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    access_pin = CASE
      WHEN v_pin <> '' THEN v_pin
      ELSE public.admin_users.access_pin
    END,
    active = EXCLUDED.active;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_token text, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.require_admin_role_(p_token, ARRAY['super_admin']);
  DELETE FROM public.admin_users WHERE user_id = p_user_id;
END;
$$;

-- View Rekap Nilai Otomatis
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

-- Aktifkan Supabase Realtime (khususnya exam_config untuk siswa & monitoring konsol)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['exam_config', 'questions', 'rubrics', 'students', 'responses', 'grades']
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
-- ROW LEVEL SECURITY (RLS TERKUNCI KETAT!)
-- Akses baca/tulis langsung ke tabel mentah diblokir untuk klien anonim.
-- Seluruh operasi wajib lewat fungsi RPC tervalidasi di atas (SECURITY DEFINER).
-- ============================================================================
ALTER TABLE public.exam_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- exam_config: siswa hanya boleh membaca status buka/tutup & durasi ujian
DROP POLICY IF EXISTS "allow_all_exam_config" ON public.exam_config;
DROP POLICY IF EXISTS "public_read_exam_config" ON public.exam_config;
CREATE POLICY "public_read_exam_config" ON public.exam_config FOR SELECT USING (true);

-- Tutup akses langsung dari REST API anon pada tabel sensitif
DROP POLICY IF EXISTS "allow_all_admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "deny_direct_admin_users" ON public.admin_users;
CREATE POLICY "deny_direct_admin_users" ON public.admin_users FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_admin_sessions" ON public.admin_sessions;
CREATE POLICY "deny_direct_admin_sessions" ON public.admin_sessions FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "allow_all_questions" ON public.questions;
DROP POLICY IF EXISTS "deny_direct_questions" ON public.questions;
CREATE POLICY "deny_direct_questions" ON public.questions FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "allow_all_rubrics" ON public.rubrics;
DROP POLICY IF EXISTS "deny_direct_rubrics" ON public.rubrics;
CREATE POLICY "deny_direct_rubrics" ON public.rubrics FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "allow_all_students" ON public.students;
DROP POLICY IF EXISTS "deny_direct_students" ON public.students;
CREATE POLICY "deny_direct_students" ON public.students FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "allow_all_responses" ON public.responses;
DROP POLICY IF EXISTS "deny_direct_responses" ON public.responses;
CREATE POLICY "deny_direct_responses" ON public.responses FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "allow_all_grades" ON public.grades;
DROP POLICY IF EXISTS "deny_direct_grades" ON public.grades;
CREATE POLICY "deny_direct_grades" ON public.grades FOR ALL USING (false) WITH CHECK (false);`;

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
