import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, CheckCircle2, AlertTriangle, Send, WifiOff } from 'lucide-react';
import { ExamDatabase, StudentRecord } from '../types/exam';
import { QuestionMediaViewer } from './QuestionMediaViewer';

interface StudentExamPortalProps {
  db: ExamDatabase;
  initialStudent?: StudentRecord | null;
  onSaveDraft: (
    student: StudentRecord,
    changedAnswers: Record<string, string>,
    focusViolations: number
  ) => Promise<void>;
  onSubmitExam: (
    student: StudentRecord,
    answers: Record<string, string>,
    focusViolations: number
  ) => Promise<void>;
  onLogout?: () => void;
}

const getStudentDraftBackupKey = (studentId: string, examCode: string) =>
  `ujian_student_draft_v1_${studentId}_${examCode}`;

export const StudentExamPortal: React.FC<StudentExamPortalProps> = ({
  db,
  initialStudent = null,
  onSaveDraft,
  onSubmitExam,
  onLogout
}) => {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [examCodeInput, setExamCodeInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeStudent, setActiveStudent] = useState<StudentRecord | null>(initialStudent);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!initialStudent) return {};
    const existingResp = db.responses?.[initialStudent.student_id];
    let localBackup: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(
        getStudentDraftBackupKey(initialStudent.student_id, initialStudent.exam_code)
      );
      if (raw) localBackup = JSON.parse(raw) as Record<string, string>;
    } catch {
      // Ignore storage error
    }

    const initialAnswers: Record<string, string> = {};
    Object.values(db.questions || {})
      .filter((q) => q.active && q.exam_code === db.config.exam_code)
      .forEach((q) => {
        initialAnswers[q.question_id] =
          localBackup[q.question_id] ?? existingResp?.answers?.[q.question_id] ?? '';
      });
    return initialAnswers;
  });

  const [focusViolations, setFocusViolations] = useState<number>(() =>
    initialStudent ? Number(db.responses?.[initialStudent.student_id]?.focus_violations || 0) : 0
  );
  const [focusWarning, setFocusWarning] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    initialStudent ? Number(db.config.duration_minutes || 120) * 60 : 0
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(() =>
    initialStudent && db.responses?.[initialStudent.student_id]?.draft_updated_at
      ? 'Draf sebelumnya dipulihkan'
      : null
  );
  const [syncPendingOffline, setSyncPendingOffline] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const dirtyQuestionIdsRef = useRef<Set<string>>(new Set());
  const latestAnswersRef = useRef<Record<string, string>>(answers);
  latestAnswersRef.current = answers;
  const focusViolationsRef = useRef<number>(focusViolations);
  focusViolationsRef.current = focusViolations;
  const lastViolationTsRef = useRef<number>(0);

  const activeQuestions = Object.values(db.questions || {})
    .filter((q) => q.active && q.exam_code === db.config.exam_code)
    .sort((a, b) => a.order_no - b.order_no);

  const strictFocusEnabled = db.config.strict_focus !== false;
  const blockCopyPasteEnabled = Boolean(db.config.block_copy_paste);

  // Restore remote answers & focus violation counter when scope loads after initialStudent login
  useEffect(() => {
    if (!initialStudent) return;
    setActiveStudent(initialStudent);

    const existingResp = db.responses?.[initialStudent.student_id];
    let localBackup: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(
        getStudentDraftBackupKey(initialStudent.student_id, initialStudent.exam_code)
      );
      if (raw) localBackup = JSON.parse(raw) as Record<string, string>;
    } catch {
      // Ignore
    }

    setAnswers((prev) => {
      const merged: Record<string, string> = { ...prev };
      activeQuestions.forEach((q) => {
        if (dirtyQuestionIdsRef.current.has(q.question_id)) return;
        const localVal = localBackup[q.question_id];
        const remoteVal = existingResp?.answers?.[q.question_id];
        merged[q.question_id] =
          localVal !== undefined && localVal !== ''
            ? localVal
            : prev[q.question_id] || remoteVal || '';
      });
      return merged;
    });

    const remoteViolations = Number(existingResp?.focus_violations || 0);
    if (remoteViolations > focusViolationsRef.current) {
      focusViolationsRef.current = remoteViolations;
      setFocusViolations(remoteViolations);
    }

    if (existingResp?.draft_updated_at && !draftSavedAt) {
      setDraftSavedAt('Draf sebelumnya dipulihkan');
    }
  }, [initialStudent?.student_id, activeQuestions.length]);

  const flushDirtyDrafts = useCallback(
    async (student: StudentRecord) => {
      const dirtyIds = Array.from(dirtyQuestionIdsRef.current);
      if (!dirtyIds.length) return;

      const changedOnly: Record<string, string> = {};
      dirtyIds.forEach((qid) => {
        changedOnly[qid] = latestAnswersRef.current[qid] || '';
      });

      try {
        await onSaveDraft(student, changedOnly, focusViolationsRef.current);
        dirtyIds.forEach((qid) => dirtyQuestionIdsRef.current.delete(qid));
        setSyncPendingOffline(false);
        const now = new Date();
        setDraftSavedAt(
          `Tersimpan ${now.getHours().toString().padStart(2, '0')}:${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
        );
      } catch {
        // Jaringan terputus sesaat — pertahankan antrean dirtyQuestionIdsRef & cadangan localStorage
        setSyncPendingOffline(true);
      }
    },
    [onSaveDraft]
  );

  // Mode Fokus Ujian: deteksi perpindahan tab atau jendela browser dengan debounce anti-double-count
  useEffect(() => {
    if (!activeStudent || submittedAt || !strictFocusEnabled) return;

    const recordFocusLeave = () => {
      const now = Date.now();
      if (now - lastViolationTsRef.current < 1500) return;
      lastViolationTsRef.current = now;

      const nextCount = focusViolationsRef.current + 1;
      focusViolationsRef.current = nextCount;
      setFocusViolations(nextCount);
      setFocusWarning(
        `Peringatan Fokus: Terdeteksi meninggalkan halaman ujian (${nextCount}x). Aktivitas ini tercatat untuk guru dan pengawas.`
      );

      // Pastikan catatan perpindahan tab langsung tersimpan ke server bersama draf
      if (dirtyQuestionIdsRef.current.size === 0 && activeQuestions.length > 0) {
        dirtyQuestionIdsRef.current.add(activeQuestions[0].question_id);
      }
      if (dirtyQuestionIdsRef.current.size > 0) {
        flushDirtyDrafts(activeStudent);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordFocusLeave();
      }
    };

    const handleWindowBlur = () => {
      recordFocusLeave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [activeStudent, submittedAt, strictFocusEnabled, activeQuestions.length, flushDirtyDrafts]);

  // Otomatis sinkronkan ulang begitu Wi-Fi/sinyal siswa terhubung kembali
  useEffect(() => {
    if (!activeStudent || submittedAt) return;
    const handleOnline = () => {
      flushDirtyDrafts(activeStudent);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [activeStudent, submittedAt, flushDirtyDrafts]);

  useEffect(() => {
    if (!activeStudent || submittedAt) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeStudent, submittedAt]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const sid = studentIdInput.trim();
    const code = accessCodeInput.trim();
    const ecode = examCodeInput.trim();

    if (!sid || !code || !ecode) {
      setLoginError('Lengkapi NIS/NISN, kode akses, dan kode ujian.');
      return;
    }
    if (!db.config.exam_open) {
      setLoginError('Ujian belum dibuka oleh guru/pengawas.');
      return;
    }
    if (ecode !== db.config.exam_code) {
      setLoginError('Kode ujian tidak sesuai.');
      return;
    }

    const found = db.students?.[sid];
    if (!found || !found.active || found.access_code !== code || found.exam_code !== ecode) {
      setLoginError('Identitas atau kode akses tidak valid.');
      return;
    }

    const existingResp = db.responses?.[sid];
    if (existingResp && existingResp.status === 'SUBMITTED') {
      setLoginError(
        'Jawaban untuk ujian ini sudah dikirim sebelumnya. Hubungi guru jika perlu membuka kunci kiriman.'
      );
      return;
    }

    if (!activeQuestions.length) {
      setLoginError('Belum ada soal aktif untuk ujian ini.');
      return;
    }

    const restoredAnswers: Record<string, string> = {};
    activeQuestions.forEach((q) => {
      restoredAnswers[q.question_id] = existingResp?.answers?.[q.question_id] || '';
    });

    const initialViolations = Number(existingResp?.focus_violations || 0);
    focusViolationsRef.current = initialViolations;
    setFocusViolations(initialViolations);
    setFocusWarning(null);
    setCopyNotice(null);

    dirtyQuestionIdsRef.current.clear();
    setAnswers(restoredAnswers);
    setActiveStudent(found);
    setRemainingSeconds(Number(db.config.duration_minutes || 120) * 60);
    if (existingResp?.draft_updated_at) {
      setDraftSavedAt('Draf sebelumnya dipulihkan');
    }
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    latestAnswersRef.current = updated;
    if (!activeStudent) return;

    // 1. Cadangan instan di browser siswa (anti-hilang meski sinyal putus)
    try {
      localStorage.setItem(
        getStudentDraftBackupKey(activeStudent.student_id, activeStudent.exam_code),
        JSON.stringify(updated)
      );
    } catch {
      // Ignore storage quota errors
    }

    // 2. Tandai hanya butir soal yang berubah, debounce 2.5 detik untuk hemat beban server
    dirtyQuestionIdsRef.current.add(questionId);
    setDraftSavedAt('Mengetik...');

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const currentStudent = activeStudent;
    debounceRef.current = window.setTimeout(() => {
      flushDirtyDrafts(currentStudent);
    }, 2500);
  };

  const handleFinalSubmit = async () => {
    if (!activeStudent || submitting) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    setSubmitting(true);
    try {
      await onSubmitExam(activeStudent, latestAnswersRef.current, focusViolationsRef.current);
      dirtyQuestionIdsRef.current.clear();
      setSyncPendingOffline(false);
      try {
        localStorage.removeItem(
          getStudentDraftBackupKey(activeStudent.student_id, activeStudent.exam_code)
        );
      } catch {
        // Ignore
      }
      setSubmittedAt(new Date().toLocaleTimeString('id-ID'));
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockedQuestionCopy = (e: React.SyntheticEvent) => {
    if (!blockCopyPasteEnabled) return;
    e.preventDefault();
    setCopyNotice('Menyalin naskah soal dinonaktifkan selama ujian berlangsung.');
  };

  const handleBlockedPaste = (e: React.SyntheticEvent) => {
    if (!blockCopyPasteEnabled) return;
    e.preventDefault();
    setCopyNotice('Menempel (paste) teks dari luar ke lembar jawaban dinonaktifkan.');
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(Math.max(0, sec) / 60);
    const rem = Math.max(0, sec) % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  if (submittedAt && activeStudent) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 space-y-4">
        <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold">
          <CheckCircle2 className="h-5 w-5" />
          Jawaban Berhasil Dikirim
        </div>
        <h2 className="text-xl font-semibold text-slate-900">
          Terima kasih, {activeStudent.full_name}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Seluruh jawaban uraian untuk kode ujian{' '}
          <span className="font-mono font-semibold">{db.config.exam_code}</span> telah tercatat pada
          pukul <span className="font-mono tabular-nums">{submittedAt}</span>. Nilai tidak
          ditampilkan pada halaman ini dan akan diproses melalui koreksi rubrik oleh guru.
        </p>
        <button
          type="button"
          onClick={() => {
            setActiveStudent(null);
            setSubmittedAt(null);
            setAnswers({});
            if (onLogout) onLogout();
          }}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
        >
          Keluar dari Sesi Peserta
        </button>
      </div>
    );
  }

  if (!activeStudent) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8 space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <div className="text-xs font-medium text-slate-500">
            {db.config.school_name} · {db.config.exam_title}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Pratinjau Ujian Peserta
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Masukkan NIS/NISN, kode akses pribadi, dan kode ujian dari daftar peserta untuk
            menguji tampilan lembar soal sebagai siswa.
          </p>
        </div>

        {!db.config.exam_open && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Ujian saat ini berstatus ditutup. Buka ujian dari menu Ringkasan &amp; Kontrol terlebih
            dahulu.
          </div>
        )}

        {loginError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {loginError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              NIS / NISN atau ID Peserta
            </label>
            <input
              type="text"
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              placeholder="Masukkan NIS / NISN peserta"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Kode Akses</label>
            <input
              type="password"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              placeholder="Masukkan kode akses"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Kode Ujian</label>
            <input
              type="text"
              value={examCodeInput}
              onChange={(e) => setExamCodeInput(e.target.value)}
              placeholder="Masukkan kode ujian"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              Masuk dan Mulai Ujian
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Sticky Exam Status Strip */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
        <div>
          <div className="text-sm font-semibold text-slate-900">{activeStudent.full_name}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              {activeStudent.class_name} · ID{' '}
              <span className="font-mono">{activeStudent.student_id}</span>
            </span>
            {syncPendingOffline ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <WifiOff className="h-3.5 w-3.5" />
                Tersimpan di perangkat (menunggu sinyal)
              </span>
            ) : (
              draftSavedAt && <span className="text-emerald-700 font-medium">· {draftSavedAt}</span>
            )}
            {strictFocusEnabled && focusViolations > 0 && (
              <span className="font-medium text-amber-700 tabular-nums">
                · Keluar fokus: {focusViolations}x
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-2 font-mono text-base font-semibold text-slate-900 tabular-nums">
            <Clock className="h-4 w-4 text-emerald-800" />
            {formatTimer(remainingSeconds)}
          </div>
          <button
            type="button"
            disabled={activeQuestions.length === 0}
            onClick={() => setShowConfirmModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Send className="h-4 w-4" />
            Kirim Jawaban
          </button>
        </div>
      </div>

      {!db.config.exam_open && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Perhatian: Guru baru saja menutup akses ujian secara real-time. Segera hubungi pengawas.
        </div>
      )}

      {focusWarning && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <span>{focusWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setFocusWarning(null)}
            className="text-xs font-medium text-amber-800 hover:underline shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {copyNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs text-slate-800">
          <span>{copyNotice}</span>
          <button
            type="button"
            onClick={() => setCopyNotice(null)}
            className="font-medium text-slate-700 hover:underline shrink-0 cursor-pointer"
          >
            Mengerti
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm text-slate-700">
        {db.config.instructions}
      </div>

      {activeQuestions.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Memuat butir soal aktif untuk ujian <span className="font-mono">{db.config.exam_code}</span>
          ...
        </div>
      ) : (
        <div className="space-y-5">
          {activeQuestions.map((q, index) => {
            const text = answers[q.question_id] || '';
            const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            const mediaItems = (q.media_items || []).filter((m) => m.url && m.url.trim().length > 0);
            const hasMedia = mediaItems.length > 0;
            const useSideLayout = hasMedia && q.media_layout === 'side';

            return (
              <div
                key={q.question_id}
                className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Soal #{index + 1} · {q.topic || q.subject}
                  </span>
                  <span className="font-mono font-medium text-slate-700 tabular-nums">
                    Skor maks: {q.max_score} poin
                  </span>
                </div>

                {useSideLayout ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
                    <div
                      className={`lg:col-span-5 ${blockCopyPasteEnabled ? 'select-none' : ''}`}
                      onCopy={handleBlockedQuestionCopy}
                      onCut={handleBlockedQuestionCopy}
                      onContextMenu={handleBlockedQuestionCopy}
                    >
                      <QuestionMediaViewer items={mediaItems} layout={q.media_layout} />
                    </div>
                    <div className="lg:col-span-7 space-y-3">
                      <div
                        className={blockCopyPasteEnabled ? 'select-none space-y-1.5' : 'space-y-1.5'}
                        onCopy={handleBlockedQuestionCopy}
                        onCut={handleBlockedQuestionCopy}
                        onContextMenu={handleBlockedQuestionCopy}
                      >
                        <h3 className="text-base font-semibold text-slate-900 leading-relaxed">
                          {q.question_text}
                        </h3>
                        {q.indicator && (
                          <p className="text-xs text-slate-500">Indikator: {q.indicator}</p>
                        )}
                      </div>
                      <textarea
                        rows={7}
                        value={text}
                        onChange={(e) => handleAnswerChange(q.question_id, e.target.value)}
                        onPaste={handleBlockedPaste}
                        onDrop={(e) => {
                          if (blockCopyPasteEnabled) e.preventDefault();
                        }}
                        placeholder="Tuliskan jawaban uraian Anda secara lengkap..."
                        className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm leading-relaxed text-slate-900 focus:border-emerald-800 focus:outline-none"
                      />
                      <div className="flex justify-end text-xs text-slate-500 tabular-nums">
                        {wordCount} kata · {text.length} karakter
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={blockCopyPasteEnabled ? 'select-none space-y-2' : 'space-y-2'}
                      onCopy={handleBlockedQuestionCopy}
                      onCut={handleBlockedQuestionCopy}
                      onContextMenu={handleBlockedQuestionCopy}
                    >
                      <h3 className="text-base font-semibold text-slate-900 leading-relaxed">
                        {q.question_text}
                      </h3>

                      {q.indicator && (
                        <p className="text-xs text-slate-500">Indikator: {q.indicator}</p>
                      )}

                      {hasMedia && (
                        <QuestionMediaViewer items={mediaItems} layout={q.media_layout} />
                      )}
                    </div>

                    <textarea
                      rows={5}
                      value={text}
                      onChange={(e) => handleAnswerChange(q.question_id, e.target.value)}
                      onPaste={handleBlockedPaste}
                      onDrop={(e) => {
                        if (blockCopyPasteEnabled) e.preventDefault();
                      }}
                      placeholder="Tuliskan jawaban uraian Anda secara lengkap..."
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm leading-relaxed text-slate-900 focus:border-emerald-800 focus:outline-none"
                    />

                    <div className="flex justify-end text-xs text-slate-500 tabular-nums">
                      {wordCount} kata · {text.length} karakter
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Accessible Confirmation Modal (replacing window.confirm) */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Konfirmasi Pengiriman Jawaban</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin mengirim semua jawaban sekarang? Setelah dikirim, jawaban
              dikunci dan tidak dapat diubah lagi oleh peserta.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Ya, Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
