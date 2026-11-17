import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Download,
  Upload,
  AlertTriangle
} from 'lucide-react';
import { ExamDatabase, QuestionGrade } from '../types/exam';
import {
  downloadOfflineGradingTemplate,
  parseOfflineGradesFromText
} from '../utils/csvTemplates';

interface GradingWorkspaceProps {
  db: ExamDatabase;
  onSaveGrade: (grade: QuestionGrade) => Promise<void>;
  onBulkSaveGrades: (grades: QuestionGrade[]) => Promise<void>;
}

interface QueueItem {
  studentId: string;
  fullName: string;
  className: string;
  questionId: string;
  questionOrder: number;
  questionText: string;
  answerKey: string;
  answerText: string;
  maxScore: number;
  isGraded: boolean;
}

export const GradingWorkspace: React.FC<GradingWorkspaceProps> = ({
  db,
  onSaveGrade,
  onBulkSaveGrades
}) => {
  const [filterMode, setFilterMode] = useState<'ungraded' | 'all'>('ungraded');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [offlineErrors, setOfflineErrors] = useState<string[]>([]);

  const activeQuestions = useMemo(
    () =>
      Object.values(db.questions || {})
        .filter((q) => q.active && q.exam_code === db.config.exam_code)
        .sort((a, b) => a.order_no - b.order_no),
    [db.questions, db.config.exam_code]
  );

  const submittedResponses = useMemo(
    () =>
      Object.values(db.responses || {})
        .filter((r) => r.status === 'SUBMITTED' && r.exam_code === db.config.exam_code)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [db.responses, db.config.exam_code]
  );

  const queue: QueueItem[] = useMemo(() => {
    const items: QueueItem[] = [];
    for (const resp of submittedResponses) {
      for (const q of activeQuestions) {
        const existingGrade = db.grades?.[resp.student_id]?.[q.question_id];
        const isGraded = !!existingGrade;
        if (filterMode === 'ungraded' && isGraded) continue;
        items.push({
          studentId: resp.student_id,
          fullName: resp.full_name,
          className: resp.class_name,
          questionId: q.question_id,
          questionOrder: q.order_no,
          questionText: q.question_text,
          answerKey: q.answer_key,
          answerText: resp.answers?.[q.question_id] || '',
          maxScore: q.max_score,
          isGraded
        });
      }
    }
    return items;
  }, [submittedResponses, activeQuestions, db.grades, filterMode]);

  const currentItem = useMemo(() => {
    if (!queue.length) return null;
    const found = queue.find((item) => `${item.studentId}::${item.questionId}` === selectedKey);
    return found || queue[0];
  }, [queue, selectedKey]);

  const currentQuestion = currentItem ? db.questions[currentItem.questionId] : null;
  const rubrics = useMemo(() => {
    if (!currentQuestion) return [];
    return Object.values(currentQuestion.rubrics || {}).sort((a, b) => a.order_no - b.order_no);
  }, [currentQuestion]);

  useEffect(() => {
    if (!currentItem) return;
    const existing = db.grades?.[currentItem.studentId]?.[currentItem.questionId];
    if (existing) {
      setCriteriaScores(existing.criteria_scores || {});
      setFeedback(existing.feedback || '');
    } else {
      const defaults: Record<string, number> = {};
      rubrics.forEach((rb) => {
        defaults[rb.rubric_id] = 0;
      });
      setCriteriaScores(defaults);
      setFeedback('');
    }
    setSavedNotice(null);
  }, [currentItem?.studentId, currentItem?.questionId]);

  const totalEntered = rubrics.reduce(
    (sum, rb) => sum + Number(criteriaScores[rb.rubric_id] || 0),
    0
  );
  const totalRubricMax = rubrics.reduce((sum, rb) => sum + Number(rb.max_points || 0), 0);

  const handleSaveAndNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem) return;
    setSaving(true);
    setSavedNotice(null);
    setOfflineErrors([]);
    try {
      const gradePayload: QuestionGrade = {
        grade_id: `G-${currentItem.studentId}-${currentItem.questionId}`,
        graded_at: new Date().toISOString(),
        student_id: currentItem.studentId,
        full_name: currentItem.fullName,
        class_name: currentItem.className,
        exam_code: db.config.exam_code,
        question_id: currentItem.questionId,
        criteria_scores: criteriaScores,
        rubric_total: Math.round(totalEntered * 100) / 100,
        max_score: totalRubricMax || currentItem.maxScore,
        feedback: feedback.trim(),
        grader_email: 'guru@sekolah.sch.id'
      };

      const idx = queue.findIndex(
        (i) => i.studentId === currentItem.studentId && i.questionId === currentItem.questionId
      );
      const nextItem = queue[idx + 1];

      await onSaveGrade(gradePayload);

      if (filterMode === 'all' && nextItem) {
        setSelectedKey(`${nextItem.studentId}::${nextItem.questionId}`);
      }
      setSavedNotice(
        `Skor ${gradePayload.rubric_total}/${gradePayload.max_score} untuk ${currentItem.fullName} tersimpan.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUploadOfflineSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOfflineErrors([]);
    setSavedNotice(null);
    const content = await file.text();
    const { grades, errors } = parseOfflineGradesFromText(content, db);
    if (errors.length) {
      setOfflineErrors(errors);
    }
    if (grades.length > 0) {
      await onBulkSaveGrades(grades);
      setSavedNotice(`${grades.length} nilai dari lembar koreksi offline berhasil disimpan.`);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Koreksi Jawaban Uraian Berbasis Rubrik
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Koreksi langsung di layar atau unduh lembar koreksi CSV untuk dinilai offline di Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadOfflineGradingTemplate(db, ',')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Lembar Koreksi
          </button>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
            <Upload className="h-3.5 w-3.5" />
            Unggah Hasil Koreksi
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleUploadOfflineSheet}
              className="sr-only"
            />
          </label>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterMode('ungraded')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                filterMode === 'ungraded'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Belum Dikoreksi
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Kiriman
            </button>
          </div>
        </div>
      </div>

      {offlineErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 space-y-1">
          <div className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Beberapa baris koreksi tidak valid:
          </div>
          {offlineErrors.map((err, i) => (
            <div key={i}>• {err}</div>
          ))}
        </div>
      )}

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {savedNotice}
        </div>
      )}

      {!currentItem ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-base font-medium text-slate-900">
            {filterMode === 'ungraded'
              ? 'Seluruh jawaban peserta telah selesai dikoreksi.'
              : 'Belum ada jawaban peserta yang masuk.'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Ubah filter ke &ldquo;Semua Kiriman&rdquo; jika ingin meninjau ulang atau mengedit nilai
            yang sudah diberikan.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left Queue */}
          <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
            <div className="px-4 py-3 text-xs font-semibold text-slate-500 sticky top-0 bg-white border-b border-slate-200">
              Antrean Koreksi ({queue.length} item)
            </div>
            {queue.map((item) => {
              const key = `${item.studentId}::${item.questionId}`;
              const active =
                currentItem.studentId === item.studentId &&
                currentItem.questionId === item.questionId;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    active ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">
                      {item.questionId}
                    </span>
                    <span
                      className={
                        item.isGraded
                          ? 'text-emerald-700 font-medium'
                          : 'text-amber-700 font-medium'
                      }
                    >
                      {item.isGraded ? 'Terkoreksi' : 'Menunggu'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-900">{item.fullName}</div>
                  <div className="text-xs text-slate-500">
                    {item.className} · ID {item.studentId}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Grading Deck */}
          <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs text-slate-500">
                  {currentItem.fullName} · {currentItem.className} ·{' '}
                  <span className="font-mono">{currentItem.studentId}</span>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Soal #{currentItem.questionOrder} ({currentItem.questionId})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowAnswerKey(!showAnswerKey)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                {showAnswerKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showAnswerKey ? 'Sembunyikan Kunci' : 'Tampilkan Kunci'}
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-800 leading-relaxed">
                {currentItem.questionText}
              </div>

              {showAnswerKey && currentItem.answerKey && (
                <div className="rounded-lg bg-slate-50 p-3.5 text-xs text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">Acuan Jawaban Ideal: </span>
                  {currentItem.answerKey}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-amber-50/40 p-4">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">Jawaban Peserta</div>
              <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                {currentItem.answerText || '(Peserta tidak menuliskan jawaban pada butir ini)'}
              </p>
            </div>

            {/* Rubric Scoring Form */}
            <form onSubmit={handleSaveAndNext} className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Input Skor per Aspek Rubrik</h3>
                <div className="font-mono text-base font-semibold text-emerald-900 tabular-nums">
                  Total: {totalEntered} / {totalRubricMax || currentItem.maxScore}
                </div>
              </div>

              {rubrics.length === 0 ? (
                <p className="text-sm text-red-700">
                  Rubrik belum dibuat untuk soal {currentItem.questionId}. Tambahkan kriteria di menu
                  Bank Soal &amp; Rubrik.
                </p>
              ) : (
                <div className="space-y-3">
                  {rubrics.map((rb) => {
                    const val = criteriaScores[rb.rubric_id] ?? 0;
                    const quickSteps = [0, Math.round(rb.max_points * 0.5 * 2) / 2, rb.max_points];
                    return (
                      <div
                        key={rb.rubric_id}
                        className="rounded-lg border border-slate-200 p-3.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{rb.criterion}</div>
                            <div className="text-xs text-slate-500">{rb.description}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {quickSteps.map((pt, i) => (
                              <button
                                key={`${rb.rubric_id}-q-${i}`}
                                type="button"
                                onClick={() =>
                                  setCriteriaScores({ ...criteriaScores, [rb.rubric_id]: pt })
                                }
                                className={`rounded-md border px-2 py-1 font-mono text-xs tabular-nums cursor-pointer ${
                                  val === pt
                                    ? 'border-emerald-800 bg-emerald-900 text-white'
                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {pt}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={0}
                              max={rb.max_points}
                              step={0.5}
                              value={val}
                              onChange={(e) => {
                                const n = Math.min(rb.max_points, Math.max(0, Number(e.target.value)));
                                setCriteriaScores({
                                  ...criteriaScores,
                                  [rb.rubric_id]: Number.isFinite(n) ? n : 0
                                });
                              }}
                              className="w-20 rounded-md border border-slate-300 px-2.5 py-1 font-mono text-sm text-right tabular-nums"
                            />
                            <span className="font-mono text-xs text-slate-500 tabular-nums">
                              / {rb.max_points}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Umpan Balik Guru (opsional)
                </label>
                <textarea
                  rows={2}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Catatan singkat untuk perbaikan jawaban siswa..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || rubrics.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Simpan Skor Rubrik &amp; Lanjut
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
