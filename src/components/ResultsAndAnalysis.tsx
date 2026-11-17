import React, { useState } from 'react';
import { Download, Eye, Printer } from 'lucide-react';
import { ExamDatabase } from '../types/exam';
import { computeItemAnalysis, computeStudentResults, downloadCsv } from '../utils/examAnalytics';

interface ResultsAndAnalysisProps {
  db: ExamDatabase;
}

export const ResultsAndAnalysis: React.FC<ResultsAndAnalysisProps> = ({ db }) => {
  const [subTab, setSubTab] = useState<'results' | 'transcripts' | 'analysis' | 'report'>('results');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [principalName, setPrincipalName] = useState('Kepala Sekolah');
  const [teacherName, setTeacherName] = useState('Guru Mata Pelajaran');
  const [kkmScore, setKkmScore] = useState(75);

  const results = computeStudentResults(db);
  const analysis = computeItemAnalysis(db);

  const activeQuestions = Object.values(db.questions || {})
    .filter((q) => q.active && q.exam_code === db.config.exam_code)
    .sort((a, b) => a.order_no - b.order_no);

  const responsesList = Object.values(db.responses || {})
    .filter((r) => r.exam_code === db.config.exam_code)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const activeTranscript =
    responsesList.find((r) => r.student_id === selectedStudentId) || responsesList[0] || null;

  const avgScore =
    results.length > 0
      ? Math.round((results.reduce((a, r) => a + r.score, 0) / results.length) * 100) / 100
      : 0;
  const highestScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0;
  const lowestScore = results.length > 0 ? Math.min(...results.map((r) => r.score)) : 0;
  const passedCount = results.filter((r) => r.score >= kkmScore).length;

  const handleExportResultsCsv = () => {
    downloadCsv(
      `rekap-nilai-${db.config.exam_code}.csv`,
      ['ID Peserta', 'Nama', 'Kelas', 'Kode Ujian', 'Skor Diperoleh', 'Skor Maks', 'Nilai (0-100)', 'Status'],
      results.map((r) => [
        r.studentId,
        r.name,
        r.className,
        r.examCode,
        r.earned,
        r.max,
        r.score,
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
    if (subTab === 'results') handleExportResultsCsv();
    else if (subTab === 'transcripts') handleExportTranscriptsCsv();
    else handleExportAnalysisCsv();
  };

  const handlePrintReport = () => {
    if (subTab !== 'report') {
      setSubTab('report');
      setTimeout(() => window.print(), 100);
    } else {
      window.print();
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Rekap Nilai, Transkrip &amp; Laporan Analisis
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pantau nilai akhir, baca transkrip jawaban esai siswa, unduh CSV, atau cetak laporan
            resmi sekolah.
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

          {subTab !== 'report' && (
            <button
              type="button"
              onClick={handleDownloadCurrentCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak / PDF
          </button>
        </div>
      </div>

      {subTab === 'results' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
            <div>
              Rata-rata Nilai Kelas:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {avgScore}
              </span>
            </div>
            <div>
              Terkoreksi Penuh:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {results.filter((r) => r.status === 'Terkoreksi').length} / {results.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
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
                {results.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      Belum ada peserta yang mengirimkan jawaban.
                    </td>
                  </tr>
                )}
                {results.map((r) => (
                  <tr key={r.studentId} className="hover:bg-slate-50/70">
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
          <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white divide-y divide-slate-200">
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

          <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-6 space-y-5">
            {!activeTranscript ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Pilih peserta di sebelah kiri untuk melihat transkrip jawaban esai.
              </div>
            ) : (
              <>
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-xs text-slate-500">
                    ID <span className="font-mono">{activeTranscript.student_id}</span> ·{' '}
                    {activeTranscript.class_name} · Status{' '}
                    <span className="font-medium text-slate-800">{activeTranscript.status}</span>
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

                <div className="divide-y divide-slate-200">
                  {activeQuestions.map((q, idx) => {
                    const ans = activeTranscript.answers?.[q.question_id] || '';
                    const grade = db.grades?.[activeTranscript.student_id]?.[q.question_id];
                    return (
                      <div key={q.question_id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
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
          <div className="no-print rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kriteria Ketuntasan (KKTP/KKM)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={kkmScore}
                onChange={(e) => setKkmScore(Number(e.target.value) || 75)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Kepala Sekolah (Tanda Tangan)
              </label>
              <input
                type="text"
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Guru / Penilai
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Printable Formal Report Sheet */}
          <article className="print-only-container rounded-lg border border-slate-200 bg-white p-8 space-y-6">
            {/* Kop Laporan */}
            <header className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                {db.config.school_name}
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                LAPORAN HASIL &amp; ANALISIS BUTIR SOAL URAIAN
              </h2>
              <div className="text-xs text-slate-600">
                {db.config.exam_title} · Kode Ujian:{' '}
                <span className="font-mono font-semibold">{db.config.exam_code}</span> · Dicetak:{' '}
                {new Date().toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>
            </header>

            {/* Ringkasan Statistik */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
              <div className="rounded border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Peserta Mengirim</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">{results.length}</div>
              </div>
              <div className="rounded border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Rata-Rata Nilai</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">{avgScore}</div>
              </div>
              <div className="rounded border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Tertinggi / Terendah</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                  {highestScore.toFixed(1)} / {lowestScore.toFixed(1)}
                </div>
              </div>
              <div className="rounded border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Tuntas (&ge; {kkmScore})</div>
                <div className="mt-1 font-mono text-lg font-bold tabular-nums">
                  {passedCount} ({results.length ? Math.round((passedCount / results.length) * 100) : 0}%)
                </div>
              </div>
            </div>

            {/* Tabel Rekap Nilai */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">A. Rekapitulasi Nilai Peserta</h3>
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2.5 py-2 text-left">No</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">NIS / ID</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">Nama Peserta</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">Kelas</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Skor</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Nilai</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.studentId}>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                        {i + 1}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                        {r.studentId}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{r.name}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{r.className}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {r.earned}/{r.max}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {r.score.toFixed(2)}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">
                        {r.status !== 'Terkoreksi'
                          ? 'Belum Lengkap'
                          : r.score >= kkmScore
                          ? 'Tuntas'
                          : 'Perlu Pengayaan/Remedial'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Tabel Analisis Butir Soal */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                B. Analisis Butir Soal &amp; Daya Pembeda
              </h3>
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2.5 py-2 text-left">ID</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">Indikator</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Rata-rata</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Capaian</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Kesukaran (P)</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">Daya Pembeda (D)</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.map((a) => (
                    <tr key={a.questionId} className="align-top">
                      <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-semibold">
                        {a.questionId}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">
                        {a.indicator || a.subject}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {a.meanScore !== null ? `${a.meanScore}/${a.maxScore}` : '—'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {a.indicatorAttainment !== null ? `${a.indicatorAttainment}%` : '—'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {a.difficulty !== null ? `${a.difficulty} (${a.difficultyLabel})` : '—'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">
                        {a.discrimination !== null ? a.discrimination : '—'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5">{a.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Tanda Tangan */}
            <footer className="grid grid-cols-2 gap-8 pt-6 text-xs text-slate-800">
              <div>
                <div>Mengetahui,</div>
                <div>Kepala {db.config.school_name}</div>
                <div className="mt-14 font-semibold underline">{principalName}</div>
              </div>
              <div className="text-right sm:text-left sm:pl-16">
                <div>
                  {new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </div>
                <div>Guru Mata Pelajaran</div>
                <div className="mt-14 font-semibold underline">{teacherName}</div>
              </div>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
};
