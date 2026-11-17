import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Lock, Unlock, Save, ArrowRight } from 'lucide-react';
import { AUDIT_FINDINGS } from '../data/seedDatabase';
import { AdminRole, ExamConfig, ExamDatabase } from '../types/exam';

interface OverviewAndAuditProps {
  db: ExamDatabase;
  adminRole?: AdminRole;
  onUpdateConfig: (config: ExamConfig) => Promise<void>;
  onNavigate: (
    tab: 'questions' | 'students' | 'grading' | 'results' | 'access' | 'supabase'
  ) => void;
}

export const OverviewAndAudit: React.FC<OverviewAndAuditProps> = ({
  db,
  adminRole = 'super_admin',
  onUpdateConfig,
  onNavigate
}) => {
  const canToggleExam = adminRole === 'super_admin' || adminRole === 'proctor';
  const canEditConfig = adminRole === 'super_admin';
  const canAccessAcademicTabs = adminRole === 'super_admin' || adminRole === 'teacher';

  const [form, setForm] = useState<ExamConfig>({
    ...db.config,
    strict_focus: db.config.strict_focus ?? true,
    block_copy_paste: db.config.block_copy_paste ?? false
  });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'Semua' | 'Kritis' | 'Tinggi' | 'Sedang'>('Semua');

  useEffect(() => {
    setForm({
      ...db.config,
      strict_focus: db.config.strict_focus ?? true,
      block_copy_paste: db.config.block_copy_paste ?? false
    });
  }, [db.config]);

  const activeQuestions = Object.values(db.questions || {}).filter(
    (q) => q.active && q.exam_code === db.config.exam_code
  );
  const activeStudents = Object.values(db.students || {}).filter(
    (s) => s.active && s.exam_code === db.config.exam_code
  );
  const submittedStudents = Object.values(db.responses || {}).filter(
    (r) => r.status === 'SUBMITTED' && r.exam_code === db.config.exam_code
  );

  // Hitung antrean butir jawaban yang belum dikoreksi
  let pendingGradeCount = 0;
  for (const resp of submittedStudents) {
    for (const q of activeQuestions) {
      if (!db.grades?.[resp.student_id]?.[q.question_id]) {
        pendingGradeCount += 1;
      }
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditConfig) return;
    setSaving(true);
    setSavedNotice(null);
    try {
      await onUpdateConfig({
        ...form,
        duration_minutes: Math.max(5, Number(form.duration_minutes) || 120),
        max_score: Math.max(1, Number(form.max_score) || 100),
        strict_focus: form.strict_focus ?? true,
        block_copy_paste: form.block_copy_paste ?? false
      });
      setSavedNotice('Konfigurasi ujian tersimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExamOpen = async () => {
    if (!canToggleExam) return;
    setSaving(true);
    try {
      await onUpdateConfig({
        ...db.config,
        exam_open: !db.config.exam_open
      });
      setSavedNotice(!db.config.exam_open ? 'Ujian dibuka untuk peserta.' : 'Ujian ditutup.');
    } finally {
      setSaving(false);
    }
  };

  const filteredFindings =
    severityFilter === 'Semua'
      ? AUDIT_FINDINGS
      : AUDIT_FINDINGS.filter((f) => f.severity === severityFilter);

  return (
    <div className="space-y-8">
      {/* Header & Quick Exam Toggle */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Ringkasan &amp; Kontrol Ujian
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {db.config.school_name} · Kode Ujian{' '}
            <span className="font-mono font-medium text-slate-900">{db.config.exam_code}</span> ·{' '}
            {db.config.exam_open ? (
              <span className="font-medium text-emerald-700">Status: Dibuka</span>
            ) : (
              <span className="font-medium text-amber-700">Status: Ditutup</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canToggleExam && (
            <button
              type="button"
              disabled={saving}
              onClick={handleToggleExamOpen}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                db.config.exam_open
                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'bg-emerald-900 text-white hover:bg-emerald-800'
              }`}
            >
              {db.config.exam_open ? (
                <>
                  <Lock className="h-4 w-4" />
                  Tutup Ujian
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  Buka Ujian Sekarang
                </>
              )}
            </button>
          )}

          {adminRole === 'super_admin' && (
            <button
              type="button"
              onClick={() => onNavigate('supabase')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sinkronisasi Supabase SQL
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => canAccessAcademicTabs && onNavigate('questions')}
          className={`text-left rounded-lg border border-slate-200 bg-white p-5 transition-colors ${
            canAccessAcademicTabs ? 'hover:border-slate-300 cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">Soal Uraian Aktif</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {activeQuestions.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Total bobot{' '}
            <span className="font-mono tabular-nums">
              {activeQuestions.reduce((acc, q) => acc + Number(q.max_score || 0), 0)}
            </span>{' '}
            poin
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('students')}
          className="text-left rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">Peserta Terdaftar</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {activeStudents.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Status peserta aktif</div>
        </button>

        <button
          type="button"
          onClick={() => canAccessAcademicTabs && onNavigate('results')}
          className={`text-left rounded-lg border border-slate-200 bg-white p-5 transition-colors ${
            canAccessAcademicTabs ? 'hover:border-slate-300 cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">Telah Mengirim Jawaban</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {submittedStudents.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {activeStudents.length > 0
              ? `${Math.round((submittedStudents.length / activeStudents.length) * 100)}% partisipasi`
              : 'Belum ada peserta'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccessAcademicTabs && onNavigate('grading')}
          className={`text-left rounded-lg border border-slate-200 bg-white p-5 transition-colors ${
            canAccessAcademicTabs ? 'hover:border-slate-300 cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">Antrean Koreksi Rubrik</div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {pendingGradeCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {pendingGradeCount === 0 ? 'Semua jawaban terkoreksi' : 'Butir jawaban menunggu nilai'}
          </div>
        </button>
      </div>

      {/* Exam Config Form */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Konfigurasi Ujian</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {canEditConfig
                ? 'Menggantikan tab sheet Config dengan pembaruan real-time ke seluruh peserta.'
                : 'Mode lihat saja — perubahan konfigurasi dan kode ujian hanya tersedia untuk Super Admin.'}
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {savedNotice}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nama Sekolah</label>
            <input
              type="text"
              disabled={!canEditConfig}
              value={form.school_name}
              onChange={(e) => setForm({ ...form, school_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Judul Ujian</label>
            <input
              type="text"
              disabled={!canEditConfig}
              value={form.exam_title}
              onChange={(e) => setForm({ ...form, exam_title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Kode Ujian</label>
            <input
              type="text"
              disabled={!canEditConfig}
              value={form.exam_code}
              onChange={(e) => setForm({ ...form, exam_code: e.target.value.trim() })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Durasi (Menit)
            </label>
            <input
              type="number"
              disabled={!canEditConfig}
              min={5}
              max={360}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Skor Skala Maksimum
            </label>
            <input
              type="number"
              disabled={!canEditConfig}
              min={1}
              max={1000}
              value={form.max_score}
              onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-end">
            {canEditConfig && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                Simpan Konfigurasi
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Petunjuk Pengerjaan Ujian
            </label>
            <textarea
              rows={2}
              disabled={!canEditConfig}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-600 focus:border-emerald-800 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEditConfig}
                checked={form.strict_focus ?? true}
                onChange={(e) => setForm({ ...form, strict_focus: e.target.checked })}
                className="mt-0.5 accent-emerald-800"
              />
              <span>
                <span className="font-semibold text-slate-900 block">
                  Mode Fokus Ujian (Anti-Pindah Tab)
                </span>
                <span className="text-slate-600">
                  Mencatat otomatis jika peserta berpindah tab/jendela browser dan menampilkannya ke
                  guru penilai.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEditConfig}
                checked={form.block_copy_paste ?? false}
                onChange={(e) => setForm({ ...form, block_copy_paste: e.target.checked })}
                className="mt-0.5 accent-emerald-800"
              />
              <span>
                <span className="font-semibold text-slate-900 block">Cegah Salin-Tempel</span>
                <span className="text-slate-600">
                  Memblokir salin teks soal dan mencegah peserta menempel (paste) teks dari luar ke
                  lembar jawab.
                </span>
              </span>
            </label>
          </div>
        </form>
      </section>

      {/* Deep Technical Audit of User's Original Files */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Hasil Analisa Mendalam Kode Google Apps Script &amp; HTML
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Temuan bottleneck Spreadsheet pada <span className="font-mono">US-kode_6db8c6b0.gs</span>{' '}
              &amp; <span className="font-mono">_DOCTYPE_b9c4b4e0.html</span> serta penyelesaiannya
              di Supabase PostgreSQL.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['Semua', 'Kritis', 'Tinggi', 'Sedang'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSeverityFilter(lvl)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  severityFilter === lvl
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredFindings.map((item) => (
            <div key={item.id} className="py-5 first:pt-4 last:pb-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                <span className="font-mono font-semibold text-slate-800">{item.id}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    item.severity === 'Kritis'
                      ? 'text-red-700'
                      : item.severity === 'Tinggi'
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Prioritas {item.severity}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{item.file}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{item.location}</span>
              </div>

              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>

              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3.5 text-sm text-slate-700">
                  <div className="text-xs font-semibold text-slate-900 mb-1">
                    Masalah di Google Sheets + Apps Script
                  </div>
                  <p className="leading-relaxed">{item.spreadsheetIssue}</p>
                </div>
                <div className="rounded-lg bg-emerald-50/60 p-3.5 text-sm text-slate-800">
                  <div className="text-xs font-semibold text-emerald-900 mb-1">
                    Solusi di Supabase PostgreSQL
                  </div>
                  <p className="leading-relaxed">{item.supabaseResolution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
