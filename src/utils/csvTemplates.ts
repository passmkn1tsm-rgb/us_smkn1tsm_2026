import {
  ExamDatabase,
  QuestionGrade,
  QuestionItem,
  RubricCriterion,
  StudentRecord
} from '../types/exam';
import { downloadCsv } from './examAnalytics';

export type CsvDelimiter = ',' | ';';

/**
 * Menghasilkan kode akses acak 6 karakter angka/alfanumerik yang mudah dibaca.
 */
export function generateAccessCode(length = 6): string {
  const digits = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

/**
 * Parser CSV/TSV tangguh yang mendeteksi pemisah (\t, ;, ,) secara otomatis
 * serta mendukung sel multiline di dalam tanda kutip ganda (").
 */
export function parseDelimitedTable(rawText: string): {
  headers: string[];
  rows: string[][];
  delimiter: string;
} {
  const text = rawText.replace(/^\uFEFF/, '').trim();
  if (!text) return { headers: [], rows: [], delimiter: ',' };

  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  let delimiter = ',';
  if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) {
    delimiter = '\t';
  } else if (semiCount > commaCount && semiCount > 0) {
    delimiter = ';';
  }

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) allRows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) allRows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) allRows.push(currentRow);
  }

  if (allRows.length === 0) return { headers: [], rows: [], delimiter };
  return {
    headers: allRows[0].map((h) => h.toLowerCase().trim()),
    rows: allRows.slice(1),
    delimiter
  };
}

function downloadCustomCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  delimiter: CsvDelimiter = ','
) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.map(escapeCell).join(delimiter),
    ...rows.map((r) => r.map(escapeCell).join(delimiter))
  ].join('\n');
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

export function downloadStudentsTemplate(examCode: string, delimiter: CsvDelimiter = ',') {
  downloadCustomCsv(
    `template-peserta-${examCode}.csv`,
    ['student_id', 'full_name', 'class_name', 'exam_code', 'access_code', 'active'],
    [
      ['202412010', 'Ahmad Fauzan', 'XII DKV 1', examCode, '482910', 'TRUE'],
      ['202412011', 'Dewi Anggraini', 'XII DKV 2', examCode, '739204', 'TRUE']
    ],
    delimiter
  );
}

export function downloadQuestionsTemplate(examCode: string, delimiter: CsvDelimiter = ',') {
  downloadCustomCsv(
    `template-soal-${examCode}.csv`,
    [
      'question_id',
      'exam_code',
      'subject',
      'class_name',
      'competency',
      'indicator',
      'topic',
      'question_text',
      'answer_key',
      'max_score',
      'order_no',
      'active',
      'media_layout',
      'image_urls',
      'image_captions',
      'answer_key_image_url'
    ],
    [
      [
        'Q004',
        examCode,
        'Desain Komunikasi Visual',
        'XII',
        'Mengevaluasi alur produksi',
        'Murid mampu menjelaskan fungsi revisi pada tahap pascaproduksi',
        'Pascaproduksi',
        'Jelaskan mengapa tahap revisi bersama klien wajib didokumentasikan sebelum final rendering!',
        'Dokumentasi revisi mencegah kesalahpahaman ruang lingkup kerja dan meminimalkan pengerjaan ulang.',
        10,
        4,
        'TRUE',
        'top',
        '',
        '',
        ''
      ]
    ],
    delimiter
  );
}

export function downloadRubricsTemplate(delimiter: CsvDelimiter = ',') {
  downloadCustomCsv(
    'template-rubrik-soal.csv',
    ['rubric_id', 'question_id', 'criterion', 'description', 'max_points', 'order_no'],
    [
      ['R007', 'Q004', 'Ketepatan alasan', 'Menyebutkan minimal 2 alasan dokumentasi revisi', 5, 1],
      ['R008', 'Q004', 'Contoh kasus', 'Memberikan contoh konkret risiko jika tidak didokumentasikan', 5, 2]
    ],
    delimiter
  );
}

export function downloadOfflineGradingTemplate(db: ExamDatabase, delimiter: CsvDelimiter = ',') {
  const activeQuestions = Object.values(db.questions || {})
    .filter((q) => q.active && q.exam_code === db.config.exam_code)
    .sort((a, b) => a.order_no - b.order_no);

  const submittedResponses = Object.values(db.responses || {})
    .filter((r) => r.status === 'SUBMITTED' && r.exam_code === db.config.exam_code)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const rows: Array<Array<string | number>> = [];
  submittedResponses.forEach((resp) => {
    activeQuestions.forEach((q) => {
      const existing = db.grades?.[resp.student_id]?.[q.question_id];
      rows.push([
        resp.student_id,
        resp.full_name,
        resp.class_name,
        resp.exam_code,
        q.question_id,
        q.question_text,
        resp.answers?.[q.question_id] || '',
        q.max_score,
        existing ? existing.rubric_total : '',
        existing ? existing.feedback : ''
      ]);
    });
  });

  if (delimiter === ',') {
    downloadCsv(
      `lembar-koreksi-offline-${db.config.exam_code}.csv`,
      [
        'student_id',
        'full_name',
        'class_name',
        'exam_code',
        'question_id',
        'question_text',
        'answer_text',
        'max_score',
        'score_given',
        'feedback'
      ],
      rows
    );
  } else {
    downloadCustomCsv(
      `lembar-koreksi-offline-${db.config.exam_code}.csv`,
      [
        'student_id',
        'full_name',
        'class_name',
        'exam_code',
        'question_id',
        'question_text',
        'answer_text',
        'max_score',
        'score_given',
        'feedback'
      ],
      rows,
      delimiter
    );
  }
}

export function parseStudentsFromText(
  rawText: string,
  defaultExamCode: string
): { students: StudentRecord[]; skipped: number } {
  const { headers, rows } = parseDelimitedTable(rawText);
  if (!rows.length && headers.length === 0) return { students: [], skipped: 0 };

  // Cek apakah baris pertama adalah header atau langsung data (tempel tanpa header dari Excel)
  const firstHeader = headers[0] || '';
  const hasHeader =
    firstHeader.includes('student') ||
    firstHeader.includes('nis') ||
    firstHeader.includes('id') ||
    headers.includes('full_name') ||
    headers.includes('nama');

  const dataRows = hasHeader ? rows : [headers, ...rows];
  const colIndex = (names: string[], fallbackIdx: number) => {
    if (!hasHeader) return fallbackIdx;
    const found = headers.findIndex((h) => names.some((n) => h.includes(n)));
    return found !== -1 ? found : fallbackIdx;
  };

  const idxId = colIndex(['student_id', 'nis', 'id'], 0);
  const idxName = colIndex(['full_name', 'nama'], 1);
  const idxClass = colIndex(['class_name', 'kelas'], 2);
  const idxExam = colIndex(['exam_code', 'kode_ujian'], 3);
  const idxAccess = colIndex(['access_code', 'kode_akses', 'password', 'pin'], 4);
  const idxActive = colIndex(['active', 'aktif'], 5);

  const students: StudentRecord[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const sid = String(row[idxId] || '').trim();
    const name = String(row[idxName] || '').trim();
    if (!sid || !name) {
      skipped++;
      continue;
    }
    const activeVal = String(row[idxActive] ?? 'true').toLowerCase();
    const isActive = activeVal !== 'false' && activeVal !== '0' && activeVal !== 'nonaktif';

    students.push({
      student_id: sid,
      full_name: name,
      class_name: String(row[idxClass] || 'XII').trim(),
      exam_code: String(row[idxExam] || defaultExamCode).trim() || defaultExamCode,
      access_code: String(row[idxAccess] || '').trim() || generateAccessCode(6),
      active: isActive
    });
  }

  return { students, skipped };
}

export function parseQuestionsAndRubricsFromText(
  questionsText: string,
  rubricsText: string,
  existingQuestions: Record<string, QuestionItem>,
  defaultExamCode: string
): { questions: QuestionItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const parsedQ = parseDelimitedTable(questionsText);
  const parsedR = parseDelimitedTable(rubricsText);

  const rubricsByQuestion: Record<string, Record<string, RubricCriterion>> = {};

  if (parsedR.rows.length > 0 || (parsedR.headers.length > 0 && !parsedR.headers[0].includes('rubric_id'))) {
    const hasHeader = parsedR.headers.some((h) => h.includes('question_id') || h.includes('criterion'));
    const rRows = hasHeader ? parsedR.rows : [parsedR.headers, ...parsedR.rows];
    const h = parsedR.headers;
    const idxRid = hasHeader ? Math.max(0, h.indexOf('rubric_id')) : 0;
    const idxQid = hasHeader ? Math.max(1, h.indexOf('question_id')) : 1;
    const idxCrit = hasHeader ? Math.max(2, h.indexOf('criterion')) : 2;
    const idxDesc = hasHeader ? Math.max(3, h.indexOf('description')) : 3;
    const idxPts = hasHeader ? Math.max(4, h.indexOf('max_points')) : 4;
    const idxOrd = hasHeader ? Math.max(5, h.indexOf('order_no')) : 5;

    rRows.forEach((row, i) => {
      const qid = String(row[idxQid] || '').trim();
      const criterion = String(row[idxCrit] || '').trim();
      if (!qid || !criterion) return;
      const rid = String(row[idxRid] || `${qid}_R${i + 1}`).trim();
      if (!rubricsByQuestion[qid]) rubricsByQuestion[qid] = {};
      rubricsByQuestion[qid][rid] = {
        rubric_id: rid,
        criterion,
        description: String(row[idxDesc] || '').trim(),
        max_points: Math.max(0.5, Number(row[idxPts] || 5)),
        order_no: Math.max(1, Number(row[idxOrd] || i + 1))
      };
    });
  }

  const questions: QuestionItem[] = [];
  if (parsedQ.headers.length > 0) {
    const hasHeader = parsedQ.headers.some((h) => h.includes('question_id') || h.includes('question_text'));
    const qRows = hasHeader ? parsedQ.rows : [parsedQ.headers, ...parsedQ.rows];
    const h = parsedQ.headers;
    const col = (name: string, fallback: number) =>
      hasHeader && h.indexOf(name) !== -1 ? h.indexOf(name) : fallback;

    qRows.forEach((row, i) => {
      const qid = String(row[col('question_id', 0)] || '').trim();
      const qText = String(row[col('question_text', 7)] || '').trim();
      if (!qid || !qText) return;

      const maxScore = Math.max(1, Number(row[col('max_score', 9)] || 10));
      const activeRaw = String(row[col('active', 11)] ?? 'true').toLowerCase();
      const rubrics =
        rubricsByQuestion[qid] ||
        existingQuestions[qid]?.rubrics || {
          [`${qid}_R1`]: {
            rubric_id: `${qid}_R1`,
            criterion: 'Ketepatan & Kelengkapan Jawaban',
            description: 'Kesesuaian jawaban dengan kunci dan argumen pendukung',
            max_points: maxScore,
            order_no: 1
          }
        };

      const rubricSum = Object.values(rubrics).reduce((acc, r) => acc + Number(r.max_points || 0), 0);
      if (rubricSum !== maxScore) {
        warnings.push(
          `Soal ${qid}: total bobot rubrik (${rubricSum}) berbeda dengan max_score soal (${maxScore}).`
        );
      }

      const rawLayout = String(row[col('media_layout', 12)] || '').trim().toLowerCase();
      const mediaLayout =
        rawLayout === 'side' || rawLayout === 'compare_ab' || rawLayout === 'gallery'
          ? rawLayout
          : 'top';
      const rawUrls = String(row[col('image_urls', 13)] || '').trim();
      const rawCaptions = String(row[col('image_captions', 14)] || '').trim();
      const urlParts = rawUrls
        ? rawUrls
            .split('|')
            .map((u) => u.trim())
            .filter(Boolean)
        : [];
      const captionParts = rawCaptions ? rawCaptions.split('|').map((c) => c.trim()) : [];
      const mediaItems = urlParts.map((url, idx) => ({
        id: `${qid}_IMG_${idx + 1}`,
        url,
        caption: captionParts[idx] || '',
        label:
          mediaLayout === 'compare_ab'
            ? idx === 0
              ? 'Gambar A'
              : idx === 1
              ? 'Gambar B'
              : `Gambar ${idx + 1}`
            : undefined,
        pins: []
      }));
      const answerKeyImageUrl = String(row[col('answer_key_image_url', 15)] || '').trim();

      questions.push({
        question_id: qid,
        exam_code: String(row[col('exam_code', 1)] || defaultExamCode).trim() || defaultExamCode,
        subject: String(row[col('subject', 2)] || '').trim(),
        class_name: String(row[col('class_name', 3)] || 'XII').trim(),
        competency: String(row[col('competency', 4)] || '').trim(),
        indicator: String(row[col('indicator', 5)] || '').trim(),
        topic: String(row[col('topic', 6)] || '').trim(),
        question_text: qText,
        answer_key: String(row[col('answer_key', 8)] || '').trim(),
        max_score: maxScore,
        order_no: Math.max(1, Number(row[col('order_no', 10)] || i + 1)),
        active: activeRaw !== 'false' && activeRaw !== '0',
        media_layout: mediaItems.length ? mediaLayout : existingQuestions[qid]?.media_layout || 'top',
        media_items: mediaItems.length ? mediaItems : existingQuestions[qid]?.media_items || [],
        answer_key_image_url:
          answerKeyImageUrl || existingQuestions[qid]?.answer_key_image_url || undefined,
        rubrics
      });
    });
  } else if (Object.keys(rubricsByQuestion).length > 0) {
    // Kasus guru hanya mengunggah rubrik untuk soal yang sudah ada
    Object.entries(rubricsByQuestion).forEach(([qid, rubrics]) => {
      const existing = existingQuestions[qid];
      if (!existing) {
        warnings.push(`Rubrik untuk ${qid} dilewati karena soal ${qid} belum ada.`);
        return;
      }
      questions.push({ ...existing, rubrics });
    });
  }

  return { questions, warnings };
}

export function parseOfflineGradesFromText(
  rawText: string,
  db: ExamDatabase
): { grades: QuestionGrade[]; errors: string[] } {
  const { headers, rows } = parseDelimitedTable(rawText);
  const errors: string[] = [];
  const grades: QuestionGrade[] = [];

  if (!headers.length || !rows.length) {
    return { grades: [], errors: ['File atau teks koreksi kosong.'] };
  }

  const idxSid = headers.indexOf('student_id');
  const idxExam = headers.indexOf('exam_code');
  const idxQid = headers.indexOf('question_id');
  const idxScore = headers.indexOf('score_given');
  const idxFeedback = headers.indexOf('feedback');

  if (idxSid === -1 || idxQid === -1 || idxScore === -1) {
    return {
      grades: [],
      errors: [
        'Header CSV wajib memiliki kolom student_id, question_id, dan score_given. Gunakan file dari tombol "Unduh Lembar Koreksi".'
      ]
    };
  }

  rows.forEach((row, idx) => {
    const sid = String(row[idxSid] || '').trim();
    const qid = String(row[idxQid] || '').trim();
    const rawScore = String(row[idxScore] || '').trim();
    if (!sid || !qid || rawScore === '') return;

    const score = Number(rawScore.replace(',', '.'));
    const q = db.questions?.[qid];
    const student = db.students?.[sid];
    if (!q) {
      errors.push(`Baris ${idx + 2}: Soal ${qid} tidak ditemukan.`);
      return;
    }
    if (!Number.isFinite(score) || score < 0 || score > q.max_score) {
      errors.push(
        `Baris ${idx + 2} (${sid} · ${qid}): Skor "${rawScore}" harus di antara 0 dan ${q.max_score}.`
      );
      return;
    }

    // Distribusikan skor proporsional ke kriteria rubrik agar tetap konsisten
    const rubrics = Object.values(q.rubrics || {}).sort((a, b) => a.order_no - b.order_no);
    const totalRubricCap = rubrics.reduce((acc, r) => acc + Number(r.max_points || 0), 0);
    const criteriaScores: Record<string, number> = {};
    if (totalRubricCap > 0) {
      const ratio = score / totalRubricCap;
      rubrics.forEach((rb) => {
        criteriaScores[rb.rubric_id] = Math.round(rb.max_points * ratio * 100) / 100;
      });
    }

    grades.push({
      grade_id: `G-${sid}-${qid}`,
      graded_at: new Date().toISOString(),
      student_id: sid,
      full_name: student?.full_name || sid,
      class_name: student?.class_name || '',
      exam_code: String(row[idxExam] || db.config.exam_code).trim(),
      question_id: qid,
      criteria_scores: criteriaScores,
      rubric_total: Math.round(score * 100) / 100,
      max_score: q.max_score,
      feedback: idxFeedback !== -1 ? String(row[idxFeedback] || '').trim() : '',
      grader_email: 'koreksi-offline@sekolah.sch.id'
    });
  });

  return { grades, errors };
}
