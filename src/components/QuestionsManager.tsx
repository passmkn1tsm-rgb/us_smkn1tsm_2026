import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Edit3,
  AlertCircle,
  Download,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import { ExamDatabase, QuestionItem, RubricCriterion } from '../types/exam';
import {
  CsvDelimiter,
  downloadQuestionsTemplate,
  downloadRubricsTemplate,
  parseQuestionsAndRubricsFromText
} from '../utils/csvTemplates';

interface QuestionsManagerProps {
  db: ExamDatabase;
  onSaveQuestion: (question: QuestionItem) => Promise<void>;
  onBulkSaveQuestions: (questions: QuestionItem[]) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

const createEmptyQuestion = (examCode: string, nextOrder: number): QuestionItem => {
  const id = `Q${String(nextOrder).padStart(3, '0')}`;
  return {
    question_id: id,
    exam_code: examCode,
    subject: 'Desain Komunikasi Visual',
    class_name: 'XII',
    competency: '',
    indicator: '',
    topic: '',
    question_text: '',
    answer_key: '',
    max_score: 10,
    order_no: nextOrder,
    active: true,
    rubrics: {
      [`${id}_R1`]: {
        rubric_id: `${id}_R1`,
        criterion: 'Ketepatan isi',
        description: 'Kesesuaian argumen dengan konsep dan pertanyaan',
        max_points: 5,
        order_no: 1
      },
      [`${id}_R2`]: {
        rubric_id: `${id}_R2`,
        criterion: 'Kedalaman penjelasan',
        description: 'Keruntutan logika dan contoh pendukung',
        max_points: 5,
        order_no: 2
      }
    }
  };
};

export const QuestionsManager: React.FC<QuestionsManagerProps> = ({
  db,
  onSaveQuestion,
  onBulkSaveQuestions,
  onDeleteQuestion
}) => {
  const questionsList = Object.values(db.questions || {}).sort(
    (a, b) => a.order_no - b.order_no
  );
  const [selectedId, setSelectedId] = useState<string>(questionsList[0]?.question_id || '');
  const [draft, setDraft] = useState<QuestionItem | null>(questionsList[0] || null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Bulk import states
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(',');
  const [bulkQuestionsText, setBulkQuestionsText] = useState('');
  const [bulkRubricsText, setBulkRubricsText] = useState('');
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const selectQuestion = (q: QuestionItem) => {
    setSelectedId(q.question_id);
    setDraft(JSON.parse(JSON.stringify(q)));
    setFeedback(null);
    setConfirmDeleteId(null);
  };

  const handleAddNew = () => {
    const existingNums = questionsList
      .map((q) => Number(q.question_id.replace(/\D/g, '')))
      .filter((n) => Number.isFinite(n));
    const nextOrder = existingNums.length ? Math.max(...existingNums) + 1 : questionsList.length + 1;
    const newQ = createEmptyQuestion(db.config.exam_code, nextOrder);
    setSelectedId(newQ.question_id);
    setDraft(newQ);
    setFeedback('Draf soal baru siap diisi. Klik Simpan Soal untuk menyimpan.');
  };

  const handleAddRubric = () => {
    if (!draft) return;
    const rubricsArr = Object.values(draft.rubrics || {});
    const nextIdx = rubricsArr.length + 1;
    const newRid = `${draft.question_id}_R${nextIdx}_${Date.now().toString().slice(-3)}`;
    setDraft({
      ...draft,
      rubrics: {
        ...draft.rubrics,
        [newRid]: {
          rubric_id: newRid,
          criterion: `Kriteria ${nextIdx}`,
          description: '',
          max_points: 5,
          order_no: nextIdx
        }
      }
    });
  };

  const handleUpdateRubric = (rid: string, patch: Partial<RubricCriterion>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      rubrics: {
        ...draft.rubrics,
        [rid]: {
          ...draft.rubrics[rid],
          ...patch
        }
      }
    });
  };

  const handleRemoveRubric = (rid: string) => {
    if (!draft) return;
    const copy = { ...draft.rubrics };
    delete copy[rid];
    setDraft({ ...draft, rubrics: copy });
  };

  const rubricSum = draft
    ? Object.values(draft.rubrics || {}).reduce((acc, r) => acc + Number(r.max_points || 0), 0)
    : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.question_id.trim() || !draft.question_text.trim()) {
      setFeedback('ID Soal dan teks pertanyaan wajib diisi.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await onSaveQuestion({
        ...draft,
        question_id: draft.question_id.trim(),
        max_score: Number(draft.max_score) || rubricSum || 10
      });
      setFeedback(`Soal ${draft.question_id} beserta rubriknya berhasil disimpan.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (qid: string) => {
    await onDeleteQuestion(qid);
    const remaining = questionsList.filter((q) => q.question_id !== qid);
    setConfirmDeleteId(null);
    if (remaining.length > 0) {
      selectQuestion(remaining[0]);
    } else {
      setSelectedId('');
      setDraft(null);
    }
  };

  const previewImport = parseQuestionsAndRubricsFromText(
    bulkQuestionsText,
    bulkRubricsText,
    db.questions,
    db.config.exam_code
  );

  const handleBulkImportSubmit = async () => {
    if (!previewImport.questions.length) return;
    setSaving(true);
    try {
      await onBulkSaveQuestions(previewImport.questions);
      setImportNotice(
        `${previewImport.questions.length} soal beserta rubrik berhasil diimpor ke database.`
      );
      setShowImportPanel(false);
      setBulkQuestionsText('');
      setBulkRubricsText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Bank Soal &amp; Rubrik Penilaian
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Menyatukan pengelolaan tabel <span className="font-mono">questions</span> dan{' '}
            <span className="font-mono">rubrics</span> yang berelasi Foreign Key di PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
            <select
              aria-label="Pemisah kolom CSV"
              value={csvDelimiter}
              onChange={(e) => setCsvDelimiter(e.target.value as CsvDelimiter)}
              className="border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value=",">Koma (,)</option>
              <option value=";">Excel ID (;)</option>
            </select>
            <button
              type="button"
              onClick={() => downloadQuestionsTemplate(db.config.exam_code, csvDelimiter)}
              className="inline-flex items-center gap-1 border-r border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Template Soal
            </button>
            <button
              type="button"
              onClick={() => downloadRubricsTemplate(csvDelimiter)}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Template Rubrik
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowImportPanel(!showImportPanel)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Impor Massal
          </button>

          <button
            type="button"
            onClick={handleAddNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Soal
          </button>
        </div>
      </div>

      {importNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <Check className="h-4 w-4 shrink-0" />
          {importNotice}
        </div>
      )}

      {showImportPanel && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Impor Massal Soal &amp; Rubrik dari Template CSV / Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unduh template di atas, lengkapi di Excel, lalu unggah file `.csv` atau tempel isinya
              di bawah ini.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  1. Data Soal (template-soal.csv)
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Pilih File Soal
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setBulkQuestionsText(await f.text());
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={bulkQuestionsText}
                onChange={(e) => setBulkQuestionsText(e.target.value)}
                placeholder="Tempel isi file template-soal.csv di sini..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  2. Data Rubrik (opsional, template-rubrik.csv)
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Pilih File Rubrik
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setBulkRubricsText(await f.text());
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={bulkRubricsText}
                onChange={(e) => setBulkRubricsText(e.target.value)}
                placeholder="Tempel isi file template-rubrik-soal.csv di sini (atau kosongkan untuk rubrik default)..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          {previewImport.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              {previewImport.warnings.map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs">
            <span className="text-slate-600">
              Siap diimpor:{' '}
              <span className="font-mono font-semibold text-slate-900">
                {previewImport.questions.length}
              </span>{' '}
              butir soal.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImportPanel(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={saving || previewImport.questions.length === 0}
                onClick={handleBulkImportSubmit}
                className="rounded-lg bg-emerald-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                Simpan {previewImport.questions.length} Soal ke Database
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Question List */}
        <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white divide-y divide-slate-200">
          <div className="px-4 py-3 text-xs font-semibold text-slate-500">
            Daftar Butir Soal ({questionsList.length})
          </div>
          {questionsList.length === 0 && (
            <div className="p-6 text-sm text-slate-500">
              Belum ada soal. Klik &ldquo;Tambah Soal&rdquo; atau impor dari CSV.
            </div>
          )}
          {questionsList.map((q) => {
            const isSelected = q.question_id === selectedId;
            const rCount = Object.keys(q.rubrics || {}).length;
            return (
              <button
                key={q.question_id}
                type="button"
                onClick={() => selectQuestion(q)}
                className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                  isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900">
                    #{q.order_no} · {q.question_id}
                  </span>
                  <span className="tabular-nums">
                    {q.active ? 'Aktif' : 'Nonaktif'} · {q.max_score} poin
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800 line-clamp-2">
                  {q.question_text || '(Belum ada teks soal)'}
                </p>
                <div className="mt-1.5 text-xs text-slate-500">
                  {q.topic || 'Umum'} · {rCount} aspek rubrik
                </div>
              </button>
            );
          })}
        </div>

        {/* Question + Rubric Editor */}
        <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-6">
          {!draft ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Pilih soal di panel kiri atau buat soal baru.
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-emerald-800" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Editor Soal {draft.question_id}
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-900"
                    />
                    Aktif dalam ujian
                  </label>

                  {db.questions[draft.question_id] &&
                    (confirmDeleteId === draft.question_id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(draft.question_id)}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                        >
                          Konfirmasi Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(draft.question_id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ID Soal</label>
                  <input
                    type="text"
                    value={draft.question_id}
                    onChange={(e) => setDraft({ ...draft, question_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Urutan</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.order_no}
                    onChange={(e) => setDraft({ ...draft, order_no: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Skor Maksimum
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draft.max_score}
                    onChange={(e) => setDraft({ ...draft, max_score: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kode Ujian</label>
                  <input
                    type="text"
                    value={draft.exam_code}
                    onChange={(e) => setDraft({ ...draft, exam_code: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mata Pelajaran
                  </label>
                  <input
                    type="text"
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Topik</label>
                  <input
                    type="text"
                    value={draft.topic}
                    onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Indikator Pencapaian
                  </label>
                  <input
                    type="text"
                    value={draft.indicator}
                    onChange={(e) => setDraft({ ...draft, indicator: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Teks Soal Uraian
                </label>
                <textarea
                  rows={3}
                  value={draft.question_text}
                  onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kunci / Acuan Jawaban Ideal (hanya tampil bagi guru saat koreksi)
                </label>
                <textarea
                  rows={2}
                  value={draft.answer_key}
                  onChange={(e) => setDraft({ ...draft, answer_key: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
                />
              </div>

              {/* Rubrics Builder */}
              <div className="border-t border-slate-200 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Aspek Rubrik Penilaian</h3>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Total poin rubrik: <span className="font-mono font-semibold">{rubricSum}</span>{' '}
                      / target skor soal{' '}
                      <span className="font-mono font-semibold">{draft.max_score}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRubric}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Kriteria
                  </button>
                </div>

                {rubricSum !== Number(draft.max_score) && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Total bobot kriteria rubrik ({rubricSum}) berbeda dengan Skor Maksimum soal (
                    {draft.max_score}). Pastikan keduanya selaras sebelum koreksi.
                  </div>
                )}

                <div className="space-y-3">
                  {Object.values(draft.rubrics || {})
                    .sort((a, b) => a.order_no - b.order_no)
                    .map((rb, idx) => (
                      <div
                        key={rb.rubric_id}
                        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12 items-start"
                      >
                        <div className="sm:col-span-3">
                          <label className="block text-xs text-slate-500 mb-1">
                            Kriteria {idx + 1}
                          </label>
                          <input
                            type="text"
                            value={rb.criterion}
                            onChange={(e) =>
                              handleUpdateRubric(rb.rubric_id, { criterion: e.target.value })
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-6">
                          <label className="block text-xs text-slate-500 mb-1">
                            Deskriptor Penilaian
                          </label>
                          <input
                            type="text"
                            value={rb.description}
                            onChange={(e) =>
                              handleUpdateRubric(rb.rubric_id, { description: e.target.value })
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-slate-500 mb-1">Bobot Maks</label>
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={rb.max_points}
                            onChange={(e) =>
                              handleUpdateRubric(rb.rubric_id, {
                                max_points: Number(e.target.value)
                              })
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-1 flex sm:justify-end sm:pt-6">
                          <button
                            type="button"
                            onClick={() => handleRemoveRubric(rb.rubric_id)}
                            aria-label={`Hapus kriteria ${rb.criterion}`}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="text-xs font-medium text-emerald-700">
                  {feedback && (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-4 w-4" />
                      {feedback}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Simpan Soal &amp; Rubrik
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
