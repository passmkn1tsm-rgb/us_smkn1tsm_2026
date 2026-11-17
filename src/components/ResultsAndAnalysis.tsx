import React, { useState, useMemo } from 'react';
import { Download, Eye, Printer, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { ExamDatabase } from '../types/exam';
import { computeItemAnalysis, computeStudentResults, downloadCsv } from '../utils/examAnalytics';
import { QuestionMediaViewer } from './QuestionMediaViewer';

interface ResultsAndAnalysisProps {
  db: ExamDatabase;
}

type ReportVariant = 'summary' | 'detailed' | 'full';
type SortMode = 'score_desc' | 'name_asc' | 'class_name';
type PrintOrientation = 'portrait' | 'landscape';

export const ResultsAndAnalysis: React.FC<ResultsAndAnalysisProps> = ({ db }) => {
  const [subTab, setSubTab] = useState<'results' | 'transcripts' | 'analysis' | 'report'>('results');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('score_desc');

  // Pengaturan Laporan Cetak
  const [reportVariant, setReportVariant] = useState<ReportVariant>('summary');
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>('portrait');
  const [cityName, setCityName] = useState('Tasikmalaya');
  const [principalName, setPrincipalName] = useState('Kepala Sekolah');
  const [principalNip, setPrincipalNip] = useState('');
  const [teacherName, setTeacherName] = useState('Guru Mata Pelajaran');
  const [teacherNip, setTeacherNip] = useState('');
  const [kkmScore, setKkmScore] = useState(75);

  const results = computeStudentResults(db);
  const analysis = computeItemAnalysis(db);

  const activeQuestions = useMemo(
    () =>
      Object.values(db.questions || {})
        .filter((q) => q.active && q.exam_code === db.config.exam_code)
        .sort((a, b) => a.order_no - b.order_no),
    [db.questions, db.config.exam_code]
  );

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => {
      if (r.className) set.add(r.className);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [results]);

  const filteredResults = useMemo(() => {
    const base =
      selectedClass === 'ALL' ? results : results.filter((r) => r.className === selectedClass);
    const copy = base.slice();
    if (sortMode === 'name_asc') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'class_name') {
      copy.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    } else {
      copy.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    }
    return copy;
  }, [results, selectedClass, sortMode]);

  const responsesList = Object.values(db.responses || {})
    .filter((r) => r.exam_code === db.config.exam_code)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const activeTranscript =
    responsesList.find((r) => r.student_id === selectedStudentId) || responsesList[0] || null;

  const avgScore =
    filteredResults.length > 0
      ? Math.round(
          (filteredResults.reduce((a, r) => a + r.score, 0) / filteredResults.length) * 100
        ) / 100
      : 0;
  const highestScore =
    filteredResults.length > 0 ? Math.max(...filteredResults.map((r) => r.score)) : 0;
  const lowestScore =
    filteredResults.length > 0 ? Math.min(...filteredResults.map((r) => r.score)) : 0;
  const passedCount = filteredResults.filter((r) => r.score >= kkmScore).length;

  const handleExportResultsCsv = () => {
    downloadCsv(
      `rekap-nilai-${db.config.exam_code}${selectedClass === 'ALL' ? '' : `-${selectedClass}`}.csv`,
      [
        'No',
        'ID Peserta',
        'Nama',
        'Kelas',
        'Kode Ujian',
        ...activeQuestions.map((q, idx) => `S${idx + 1} (${q.question_id})`),
        'Skor Diperoleh',
        'Skor Maks',
        'Nilai (0-100)',
        'Keterangan',
        'Status Koreksi'
      ],
      filteredResults.map((r, idx) => [
        idx + 1,
        r.studentId,
        r.name,
        r.className,
        r.examCode,
        ...activeQuestions.map((q) => {
          const g = db.grades?.[r.studentId]?.[q.question_id];
          return g ? g.rubric_total : '';
        }),
        r.earned,
        r.max,
        r.score,
        r.status !== 'Terkoreksi'
          ? 'Belum Lengkap'
          : r.score >= kkmScore
          ? 'Tuntas'
          : 'Remedial',
        r.status
      ])
    );
  };

  const handleExportTranscriptsCsv = () => {
    const rows: Array<Array<string | number>> = [];
    responsesList.forEach((resp) => {
      activeQuestions.forEach((q) => {
        const grade = db.grades?.[resp.student_id]?.[q.question_id];
        rows.push([
          resp.student_id,
          resp.full_name,
          resp.class_name,
          resp.status,
          resp.submitted_at || resp.draft_updated_at || '',
          q.question_id,
          resp.answers?.[q.question_id] || '',
          grade ? grade.rubric_total : '',
          q.max_score,
          grade?.feedback || ''
        ]);
      });
    });
    downloadCsv(
      `transkrip-jawaban-${db.config.exam_code}.csv`,
      [
        'ID Peserta',
        'Nama',
        'Kelas',
        'Status Kiriman',
        'Waktu Kirim',
        'ID Soal',
        'Jawaban Esai',
        'Skor Diperoleh',
        'Skor Maks',
        'Umpan Balik Guru'
      ],
      rows
    );
  };

  const handleExportAnalysisCsv = () => {
    downloadCsv(
      `analisis-butir-${db.config.exam_code}.csv`,
      [
        'ID Soal',
        'Mata Pelajaran',
        'Indikator',
        'Terkoreksi',
        'Rata-rata Skor',
        'Capaian Indikator (%)',
        'Indeks Kesukaran',
        'Kategori',
        'Daya Pembeda',
        'Rekomendasi'
      ],
      analysis.map((a) => [
        a.questionId,
        a.subject,
        a.indicator,
        a.graded,
        a.meanScore ?? '',
        a.indicatorAttainment ?? '',
        a.difficulty ?? '',
        a.difficultyLabel,
        a.discrimination ?? '',
        a.recommendation
      ])
    );
  };

  const handleDownloadCurrentCsv = () => {
    if (subTab === 'results' || subTab === 'report') handleExportResultsCsv();
    else if (subTab === 'transcripts') handleExportTranscriptsCsv();
    else handleExportAnalysisCsv();
  };

  const triggerPrintDialog = () => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 120);
    });
  };

  const handlePrintReport = (variant?: ReportVariant) => {
    if (variant) {
      setReportVariant(variant);
      if (variant === 'detailed' && activeQuestions.length >= 4) {
        setPrintOrientation('landscape');
      }
    }
    if (subTab !== 'report') {
      setSubTab('report');
      triggerPrintDialog();
    } else {
      triggerPrintDialog();
    }
  };

  const showPerQuestionColumns = reportVariant === 'detailed' || reportVariant === 'full';
  const showItemAnalysisSection = reportVariant === 'full';
  const formattedPrintDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Rekap Nilai, Transkrip &amp; Laporan Analisis
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pantau nilai akhir, baca transkrip jawaban esai siswa, unduh CSV, atau cetak rekap hasil
            ujian dengan tata letak siap simpan PDF/kertas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSubTab('results')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'results'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Nilai ({results.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('transcripts')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'transcripts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Transkrip ({responsesList.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('analysis')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'analysis'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Analisis Butir ({analysis.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('report')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'report'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Laporan Cetak
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadCurrentCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh CSV
          </button>

          <button
            type="button"
            onClick={() => handlePrintReport()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak / PDF
          </button>
        </div>
      </div>

      {subTab === 'results' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-5 text-sm text-slate-600">
              <div>
                Peserta:{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {filteredResults.length}
                </span>
              </div>
              <div>
                Rata-rata Nilai:{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {avgScore.toFixed(2)}
                </span>
              </div>
              <div>
                Tuntas (&ge; {kkmScore}):{' '}
                <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                  {passedCount} / {filteredResults.length}
                </span>
              </div>
              <div>
                Terkoreksi Penuh:{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {filteredResults.filter((r) => r.status === 'Terkoreksi').length} /{' '}
                  {filteredResults.length}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter kelas peserta"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="ALL">Semua Kelas ({results.length})</option>
                {availableClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    Kelas {cls}
                  </option>
                ))}
              </select>

              <select
                aria-label="Urutkan hasil ujian"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="score_desc">Urut: Nilai Tertinggi</option>
                <option value="name_asc">Urut: Nama Peserta (A-Z)</option>
                <option value="class_name">Urut: Kelas &amp; Nama</option>
              </select>

              <button
                type="button"
                onClick={() => handlePrintReport('summary')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5" />
                Cetak Rekap Nilai
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">ID Peserta</th>
                  <th className="px-4 py-3">Nama Peserta</th>
                  <th className="px-4 py-3">Kelas</th>
                  <th className="px-4 py-3 text-right">Butir Terkoreksi</th>
                  <th className="px-4 py-3 text-right">Skor Mentah</th>
                  <th className="px-4 py-3 text-right">Nilai Akhir</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      Belum ada peserta yang mengirimkan jawaban.
                    </td>
                  </tr>
                )}
                {filteredResults.map((r, idx) => (
                  <tr key={r.studentId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {r.studentId}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.className}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {r.gradedCount} / {r.totalQuestions}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {r.earned} / {r.max}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {r.score.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          r.status === 'Terkoreksi'
                            ? 'font-medium text-emerald-700'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(r.studentId);
                          setSubTab('transcripts');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Lihat Jawaban
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'transcripts' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="no-print lg:col-span-4 rounded-lg border border-slate-200 bg-white divide-y divide-slate-200">
            <div className="px-4 py-3 text-xs font-semibold text-slate-500">
              Peserta dengan Jawaban ({responsesList.length})
            </div>
            {responsesList.length === 0 && (
              <div className="p-6 text-sm text-slate-500">
                Belum ada jawaban maupun draf yang masuk.
              </div>
            )}
            {responsesList.map((resp) => {
              const isSelected = activeTranscript?.student_id === resp.student_id;
              return (
                <button
                  key={resp.student_id}
                  type="button"
                  onClick={() => setSelectedStudentId(resp.student_id)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">{resp.student_id}</span>
                    <span
                      className={
                        resp.status === 'SUBMITTED'
                          ? 'text-emerald-700 font-medium'
                          : 'text-amber-700 font-medium'
                      }
                    >
                      {resp.status === 'SUBMITTED' ? 'Terkirim' : 'Draf Berjalan'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-900">{resp.full_name}</div>
                  <div className="text-xs text-slate-500">{resp.class_name}</div>
                </button>
              );
            })}
          </div>

          <div className="print-only-container lg:col-span-8 rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            {!activeTranscript ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Pilih peserta di sebelah kiri untuk melihat transkrip jawaban esai.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        ID <span className="font-mono">{activeTranscript.student_id}</span> ·{' '}
                        {activeTranscript.class_name} · Status{' '}
                        <span className="font-medium text-slate-800">{activeTranscript.status}</span>
                      </span>
                      {(activeTranscript.focus_violations || 0) > 0 && (
                        <span className="font-medium text-amber-700 tabular-nums">
                          · Catatan Fokus: {activeTranscript.focus_violations}x berpindah tab
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {activeTranscript.full_name}
                    </h2>
                    <div className="mt-1 text-xs text-slate-500 font-mono">
                      {activeTranscript.submitted_at
                        ? `Dikirim: ${new Date(activeTranscript.submitted_at).toLocaleString('id-ID')}`
                        : activeTranscript.draft_updated_at
                        ? `Draf terakhir: ${new Date(activeTranscript.draft_updated_at).toLocaleString('id-ID')}`
                        : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => triggerPrintDialog()}
                    className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Cetak Transkrip Ini
                  </button>
                </div>

                <div className="divide-y divide-slate-200">
                  {activeQuestions.map((q, idx) => {
                    const ans = activeTranscript.answers?.[q.question_id] || '';
                    const grade = db.grades?.[activeTranscript.student_id]?.[q.question_id];
                    return (
                      <div key={q.question_id} className="py-4 first:pt-0 last:pb-0 space-y-2.5 print-avoid-break">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-800">
                            Soal #{idx + 1} · {q.question_id}
                          </span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {grade
                              ? `Skor: ${grade.rubric_total} / ${grade.max_score}`
                              : `Belum dikoreksi (maks ${q.max_score})`}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-slate-800">{q.question_text}</div>
                        {(q.media_items || []).length > 0 && (
                          <QuestionMediaViewer
                            items={q.media_items}
                            layout={q.media_layout}
                            compact
                          />
                        )}
                        <div className="rounded-lg bg-slate-50 p-3.5 text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                          {ans || '(Tidak ada jawaban)'}
                        </div>
                        {grade?.feedback && (
                          <div className="text-xs text-emerald-900">
                            <span className="font-semibold">Umpan balik guru: </span>
                            {grade.feedback}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {subTab === 'analysis' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            Catatan metodologi: Indeks Daya Pembeda (<span className="font-mono">D</span>)
            dihitung menggunakan selisih rata-rata kelompok atas 27% dan bawah 27% yang
            diperingkatkan berdasarkan <strong>total skor ujian</strong>, bukan skor butir tunggal.
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Indikator &amp; Soal</th>
                  <th className="px-4 py-3 text-right">Terkoreksi</th>
                  <th className="px-4 py-3 text-right">Rata-rata</th>
                  <th className="px-4 py-3 text-right">Capaian</th>
                  <th className="px-4 py-3 text-right">Kesukaran (P)</th>
                  <th className="px-4 py-3 text-right">Daya Pembeda (D)</th>
                  <th className="px-4 py-3">Rekomendasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analysis.map((a) => (
                  <tr key={a.questionId} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {a.questionId}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-900">{a.indicator || a.subject}</div>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{a.questionText}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {a.graded} / {a.responses}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {a.meanScore !== null ? `${a.meanScore} / ${a.maxScore}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {a.indicatorAttainment !== null ? `${a.indicatorAttainment}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {a.difficulty !== null ? (
                        <div>
                          <div className="font-semibold text-slate-900">{a.difficulty}</div>
                          <div className="font-sans text-[11px] text-slate-500">
                            {a.difficultyLabel}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {a.discrimination !== null ? (
                        <span
                          className={
                            a.discrimination >= 0.4
                              ? 'font-semibold text-emerald-700'
                              : a.discrimination < 0.2
                              ? 'font-semibold text-red-700'
                              : 'font-semibold text-amber-700'
                          }
                        >
                          {a.discrimination}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 max-w-xs leading-relaxed">
                      {a.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'report' && (
        <div className="space-y-6">
          {/* Print customization bar (hidden when printing) */}
          <div className="no-print rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-emerald-800" />
                Pengaturan Tata Letak Laporan Cetak
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportResultsCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Unduh Rekap Excel/CSV
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrintDialog()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak / Simpan PDF Sekarang
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Format Isi Laporan
                </label>
                <select
                  value={reportVariant}
                  onChange={(e) => setReportVariant(e.target.value as ReportVariant)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="summary">Rekap Nilai Ringkas</option>
                  <option value="detailed">Rekap Nilai + Skor Per Soal</option>
                  <option value="full">Laporan Lengkap (+ Analisis Butir)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Filter Kelas Peserta
                </label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="ALL">Semua Kelas ({results.length} peserta)</option>
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Urutan Daftar Peserta
                </label>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="score_desc">Peringkat Nilai Tertinggi</option>
                  <option value="name_asc">Abjad Nama Peserta (A-Z)</option>
                  <option value="class_name">Urutan Kelas &amp; Nama</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Orientasi Kertas (A4)
                </label>
                <select
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value as PrintOrientation)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="portrait">Potret (Vertikal)</option>
                  <option value="landscape">Lanskap (Horizontal / Banyak Kolom)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  KKTP / KKM
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={kkmScore}
                  onChange={(e) => setKkmScore(Number(e.target.value) || 75)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kota Penetapan
                </label>
                <input
                  type="text"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  NIP Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={principalNip}
                  onChange={(e) => setPrincipalNip(e.target.value)}
                  placeholder="Opsional"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Guru Penilai
                </label>
                <input
                  type="text"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  NIP Guru Penilai
                </label>
                <input
                  type="text"
                  value={teacherNip}
                  onChange={(e) => setTeacherNip(e.target.value)}
                  placeholder="Opsional"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Printable Formal Report Sheet */}
          <article
            className={`print-only-container rounded-lg border border-slate-200 bg-white p-8 space-y-6 ${
              printOrientation === 'landscape' ? 'print-landscape-sheet' : ''
            }`}
          >
            {/* Kop Laporan */}
            <header className="border-b-2 border-slate-900 pb-4 text-center space-y-1.5">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-800">
                {db.config.school_name}
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {showItemAnalysisSection
                  ? 'LAPORAN HASIL UJIAN & ANALISIS BUTIR SOAL URAIAN'
                  : 'REKAPITULASI HASIL EVALUASI UJIAN URAIAN'}
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-700 pt-1">
                <span>
                  Ujian: <strong>{db.config.exam_title}</strong>
                </span>
                <span>
                  Kode: <strong className="font-mono">{db.config.exam_code}</strong>
                </span>
                <span>
                  Kelas: <strong>{selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass}</strong>
                </span>
                <span>
                  KKTP/KKM: <strong className="font-mono tabular-nums">{kkmScore}</strong>
                </span>
                <span>
                  Dicetak: <strong>{formattedPrintDate}</strong>
                </span>
              </div>
            </header>

            {/* Ringkasan Statistik */}
            <div className="print-avoid-break grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
              <div className="rounded border border-slate-300 p-3 bg-slate-50/50">
                <div className="text-[11px] font-medium text-slate-600">Peserta Mengirim</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {filteredResults.length}
                </div>
              </div>
              <div className="rounded border border-slate-300 p-3 bg-slate-50/50">
                <div className="text-[11px] font-medium text-slate-600">Rata-Rata Nilai</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {avgScore.toFixed(2)}
                </div>
              </div>
              <div className="rounded border border-slate-300 p-3 bg-slate-50/50">
                <div className="text-[11px] font-medium text-slate-600">Tertinggi / Terendah</div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {highestScore.toFixed(1)} / {lowestScore.toFixed(1)}
                </div>
              </div>
              <div className="rounded border border-slate-300 p-3 bg-slate-50/50">
                <div className="text-[11px] font-medium text-slate-600">
                  Tuntas (&ge; {kkmScore})
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {passedCount} (
                  {filteredResults.length
                    ? Math.round((passedCount / filteredResults.length) * 100)
                    : 0}
                  %)
                </div>
              </div>
            </div>

            {/* Tabel Rekap Nilai */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                {showItemAnalysisSection
                  ? 'A. Rekapitulasi Nilai Peserta'
                  : 'Daftar Nilai & Ketuntasan Peserta'}
              </h3>
              <table className="w-full border-collapse border border-slate-400 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900">
                    <th className="border border-slate-400 px-2 py-2 text-center w-9">No</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-left">NIS / ID</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-left">Nama Peserta</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-left">Kelas</th>
                    {showPerQuestionColumns &&
                      activeQuestions.map((q, qIdx) => (
                        <th
                          key={q.question_id}
                          className="border border-slate-400 px-2 py-2 text-center font-mono tabular-nums"
                        >
                          <div>S{qIdx + 1}</div>
                          <div className="text-[10px] font-normal text-slate-600">
                            /{q.max_score}
                          </div>
                        </th>
                      ))}
                    <th className="border border-slate-400 px-2.5 py-2 text-right">Total Skor</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-right">Nilai</th>
                    <th className="border border-slate-400 px-2.5 py-2 text-left">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showPerQuestionColumns ? 7 + activeQuestions.length : 7}
                        className="border border-slate-400 px-3 py-6 text-center text-slate-500"
                      >
                        Belum ada data hasil ujian untuk filter kelas ini.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((r, i) => (
                      <tr key={r.studentId}>
                        <td className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums">
                          {i + 1}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-mono tabular-nums">
                          {r.studentId}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-medium text-slate-900">
                          {r.name}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">{r.className}</td>
                        {showPerQuestionColumns &&
                          activeQuestions.map((q) => {
                            const g = db.grades?.[r.studentId]?.[q.question_id];
                            return (
                              <td
                                key={q.question_id}
                                className="border border-slate-400 px-2 py-1.5 text-center font-mono tabular-nums"
                              >
                                {g ? g.rubric_total : '—'}
                              </td>
                            );
                          })}
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {r.earned}/{r.max}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums">
                          {r.score.toFixed(2)}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">
                          {r.status !== 'Terkoreksi'
                            ? 'Belum Lengkap'
                            : r.score >= kkmScore
                            ? 'Tuntas'
                            : 'Perlu Remedial'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredResults.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-slate-900">
                      <td
                        colSpan={showPerQuestionColumns ? 4 + activeQuestions.length : 4}
                        className="border border-slate-400 px-2.5 py-2 text-right"
                      >
                        Rata-Rata Kelas ({filteredResults.length} peserta)
                      </td>
                      <td className="border border-slate-400 px-2.5 py-2 text-right font-mono tabular-nums">
                        {Math.round(
                          (filteredResults.reduce((acc, r) => acc + r.earned, 0) /
                            filteredResults.length) *
                            100
                        ) / 100}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-2 text-right font-mono tabular-nums">
                        {avgScore.toFixed(2)}
                      </td>
                      <td className="border border-slate-400 px-2.5 py-2 text-xs">
                        {passedCount}/{filteredResults.length} Tuntas
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </section>

            {/* Tabel Analisis Butir Soal (opsional sesuai format laporan) */}
            {showItemAnalysisSection && (
              <section className="space-y-2 pt-2">
                <h3 className="text-sm font-bold text-slate-900">
                  B. Analisis Butir Soal &amp; Daya Pembeda
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900">
                      <th className="border border-slate-400 px-2.5 py-2 text-left">ID</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-left">Indikator</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-right">Rata-rata</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-right">Capaian</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-right">Kesukaran (P)</th>
                      <th className="border border-slate-400 px-2.5 py-2 text-right">
                        Daya Pembeda (D)
                      </th>
                      <th className="border border-slate-400 px-2.5 py-2 text-left">Tindak Lanjut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.map((a) => (
                      <tr key={a.questionId} className="align-top">
                        <td className="border border-slate-400 px-2.5 py-1.5 font-mono font-semibold">
                          {a.questionId}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">
                          {a.indicator || a.subject}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {a.meanScore !== null ? `${a.meanScore}/${a.maxScore}` : '—'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {a.indicatorAttainment !== null ? `${a.indicatorAttainment}%` : '—'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {a.difficulty !== null ? `${a.difficulty} (${a.difficultyLabel})` : '—'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {a.discrimination !== null ? a.discrimination : '—'}
                        </td>
                        <td className="border border-slate-400 px-2.5 py-1.5">
                          {a.recommendation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Tanda Tangan */}
            <footer className="print-avoid-break grid grid-cols-2 gap-8 pt-6 text-xs text-slate-900">
              <div>
                <div>Mengetahui,</div>
                <div>Kepala {db.config.school_name}</div>
                <div className="mt-14 font-semibold underline">{principalName}</div>
                {principalNip.trim() && (
                  <div className="font-mono text-[11px] text-slate-700 mt-0.5">
                    NIP. {principalNip.trim()}
                  </div>
                )}
              </div>
              <div className="text-right sm:text-left sm:pl-16">
                <div>
                  {cityName.trim() ? `${cityName.trim()}, ` : ''}
                  {formattedPrintDate}
                </div>
                <div>Guru Mata Pelajaran</div>
                <div className="mt-14 font-semibold underline">{teacherName}</div>
                {teacherNip.trim() && (
                  <div className="font-mono text-[11px] text-slate-700 mt-0.5">
                    NIP. {teacherNip.trim()}
                  </div>
                )}
              </div>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
};
