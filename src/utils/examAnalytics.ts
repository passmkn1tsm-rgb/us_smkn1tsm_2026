import { ExamDatabase, ItemAnalysisRow, StudentResultRow } from '../types/exam';

export function computeStudentResults(db: ExamDatabase): StudentResultRow[] {
  const activeQuestions = Object.values(db.questions || {})
    .filter((q) => q.active && q.exam_code === db.config.exam_code)
    .sort((a, b) => a.order_no - b.order_no);

  const submittedResponses = Object.values(db.responses || {}).filter(
    (r) => r.status === 'SUBMITTED' && r.exam_code === db.config.exam_code
  );

  return submittedResponses
    .map((resp) => {
      const studentGrades = (db.grades && db.grades[resp.student_id]) || {};
      let earned = 0;
      let max = 0;
      let gradedCount = 0;
      let allGraded = activeQuestions.length > 0;

      for (const q of activeQuestions) {
        const qMax = Number(q.max_score || 0);
        max += qMax;
        const g = studentGrades[q.question_id];
        if (g) {
          earned += Number(g.rubric_total || 0);
          gradedCount += 1;
        } else {
          allGraded = false;
        }
      }

      const status: StudentResultRow['status'] = allGraded ? 'Terkoreksi' : 'Belum lengkap';

      return {
        studentId: resp.student_id,
        name: resp.full_name,
        className: resp.class_name,
        examCode: resp.exam_code,
        earned: Math.round(earned * 100) / 100,
        max,
        score: max > 0 ? Math.round((earned / max) * 10000) / 100 : 0,
        gradedCount,
        totalQuestions: activeQuestions.length,
        status
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Menghitung Analisis Butir Soal Klasik dengan koreksi bug Daya Pembeda:
 * Kelompok atas (27%) dan bawah (27%) ditentukan berdasarkan TOTAL SKOR UJIAN siswa,
 * bukan berdasarkan skor butir tunggal seperti pada US-kode_6db8c6b0.gs baris 341.
 */
export function computeItemAnalysis(db: ExamDatabase): ItemAnalysisRow[] {
  const activeQuestions = Object.values(db.questions || {})
    .filter((q) => q.active && q.exam_code === db.config.exam_code)
    .sort((a, b) => a.order_no - b.order_no);

  const submittedResponses = Object.values(db.responses || {}).filter(
    (r) => r.status === 'SUBMITTED' && r.exam_code === db.config.exam_code
  );

  // Hitung total skor per siswa dari semua butir yang sudah dikoreksi untuk pemeringkatan Upper/Lower Group
  const studentTotals: Record<string, number> = {};
  for (const resp of submittedResponses) {
    const sg = (db.grades && db.grades[resp.student_id]) || {};
    let total = 0;
    for (const q of activeQuestions) {
      if (sg[q.question_id]) {
        total += Number(sg[q.question_id].rubric_total || 0);
      }
    }
    studentTotals[resp.student_id] = total;
  }

  return activeQuestions.map((q) => {
    const qid = q.question_id;
    const maxQ = Number(q.max_score || 0);
    const answeredStudents = submittedResponses.filter(
      (r) => r.answers && r.answers[qid] !== undefined
    );

    const gradedPairs: Array<{ studentId: string; itemScore: number; totalExamScore: number }> = [];
    for (const r of answeredStudents) {
      const grade = db.grades?.[r.student_id]?.[qid];
      if (grade) {
        gradedPairs.push({
          studentId: r.student_id,
          itemScore: Number(grade.rubric_total || 0),
          totalExamScore: studentTotals[r.student_id] ?? 0
        });
      }
    }

    const n = gradedPairs.length;
    const mean = n > 0 ? gradedPairs.reduce((acc, p) => acc + p.itemScore, 0) / n : null;
    const difficulty = mean !== null && maxQ > 0 ? mean / maxQ : null;

    let discrimination: number | null = null;
    if (n >= 6 && maxQ > 0) {
      // Urutkan berdasarkan TOTAL SKOR UJIAN tertinggi -> terendah
      const rankedByTotal = gradedPairs
        .slice()
        .sort((a, b) => b.totalExamScore - a.totalExamScore || b.itemScore - a.itemScore);
      const k = Math.max(1, Math.floor(n * 0.27));
      const upperAvg = rankedByTotal.slice(0, k).reduce((acc, p) => acc + p.itemScore, 0) / k;
      const lowerAvg = rankedByTotal.slice(n - k).reduce((acc, p) => acc + p.itemScore, 0) / k;
      discrimination = (upperAvg - lowerAvg) / maxQ;
    }

    let note = 'Data belum cukup untuk analisis.';
    if (difficulty !== null) {
      if (difficulty < 0.3) {
        note = 'Relatif sukar: telaah kesesuaian materi, redaksi, waktu, dan pembelajaran.';
      } else if (difficulty <= 0.7) {
        note = 'Kesukaran sedang: pertahankan bila selaras dengan indikator.';
      } else {
        note = 'Relatif mudah: periksa apakah soal cukup menantang penalaran tingkat tinggi.';
      }
    }

    if (discrimination !== null) {
      if (discrimination < 0.2) {
        note += ' Daya pembeda rendah: periksa rubrik dan kejelasan kata kunci soal.';
      } else if (discrimination >= 0.4) {
        note += ' Daya pembeda baik dalam membedakan penguasaan peserta.';
      } else {
        note += ' Daya pembeda cukup: pertimbangkan penyempurnaan deskriptor rubrik.';
      }
    } else if (n > 0 && n < 6) {
      note += ' Daya pembeda memerlukan minimal 6 peserta terkoreksi.';
    }

    const difficultyLabel: ItemAnalysisRow['difficultyLabel'] =
      difficulty === null
        ? 'Belum tersedia'
        : difficulty < 0.3
        ? 'Sukar'
        : difficulty <= 0.7
        ? 'Sedang'
        : 'Mudah';

    return {
      questionId: qid,
      subject: q.subject,
      indicator: q.indicator,
      questionText: q.question_text,
      maxScore: maxQ,
      responses: answeredStudents.length,
      graded: n,
      meanScore: mean === null ? null : Math.round(mean * 100) / 100,
      indicatorAttainment:
        mean === null || maxQ <= 0 ? null : Math.round((mean / maxQ) * 1000) / 10,
      difficulty: difficulty === null ? null : Math.round(difficulty * 1000) / 1000,
      difficultyLabel,
      discrimination: discrimination === null ? null : Math.round(discrimination * 1000) / 1000,
      recommendation: note
    };
  });
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
