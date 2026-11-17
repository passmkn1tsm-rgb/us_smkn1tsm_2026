/**
 * APLIKASI UJIAN SEKOLAH XII - SOAL URAIAN
 * Google Apps Script + Google Sheets
 *
 * PENTING:
 * - Jalankan setupDatabase() sekali dari editor Apps Script.
 * - Isi sheet Config dan tambahkan email guru pada Script Properties:
 *   TEACHER_EMAILS = guru1@sekolah.sch.id,guru2@sekolah.sch.id
 * - Untuk penggunaan nyata, deploy hanya untuk akun/domain yang sesuai kebijakan sekolah.
 * - Contoh ini tidak menggantikan pengawasan ujian atau kebijakan perlindungan data sekolah.
 */

const SHEETS = {
  CONFIG: 'Config',
  QUESTIONS: 'Questions',
  STUDENTS: 'Students',
  RESPONSES: 'Responses',
  GRADES: 'Grades',
  RUBRICS: 'Rubrics'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Ujian Sekolah XII - Soal Uraian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const definitions = {
    Config: [['key', 'value'],
      ['school_name', 'SMK Negeri 1 Tasikmalaya'],
      ['exam_title', 'Ujian Sekolah Kelas XII'],
      ['exam_code', 'USXII2027'],
      ['duration_minutes', '120'],
      ['max_score', '100'],
      ['exam_open', 'FALSE'],
      ['instructions', 'Bacalah setiap soal dengan cermat. Periksa jawaban sebelum dikirim.']],
    Questions: [['question_id','exam_code','subject','class_name','competency','indicator','topic','question_text','answer_key','max_score','order_no','active'],
      ['Q001','USXII2027','Contoh Mata Pelajaran','XII','Menganalisis informasi','Murid mampu menjelaskan alasan dengan bukti','Analisis','Jelaskan dua alasan mengapa evaluasi hasil kerja penting dalam suatu proses kerja.','Jawaban ideal memuat dua alasan yang relevan dan penjelasan logis.',10,1,'TRUE']],
    Students: [['student_id','full_name','class_name','exam_code','access_code','active'],
      ['CONTOH001','Murid Contoh','XII DKV 1','USXII2027','123456','TRUE']],
    Responses: [['response_id','submitted_at','student_id','full_name','class_name','exam_code','question_id','answer_text','status'],
      ],
    Grades: [['grade_id','graded_at','student_id','full_name','class_name','exam_code','question_id','rubric_score','max_score','feedback','grader_email'],
      ],
    Rubrics: [['rubric_id','question_id','criterion','description','max_points','order_no'],
      ['R001','Q001','Ketepatan isi','Menyebutkan alasan yang sesuai pertanyaan',5,1],
      ['R002','Q001','Penjelasan','Menjelaskan alasan secara logis dan jelas',5,2]]
  };

  Object.keys(definitions).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const values = definitions[name];
    if (values.length) sh.getRange(1, 1, values.length, values[0].length).setValues(values);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, values[0].length).setFontWeight('bold').setBackground('#dbeafe');
    sh.autoResizeColumns(1, values[0].length);
  });
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return 'Database siap. Ganti data contoh dan konfigurasi sebelum digunakan.';
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet belum terhubung. Jalankan setupDatabase().');
  return ss;
}

function rows_(sheetName) {
  const sh = db_().getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function append_(sheetName, object) {
  const sh = db_().getSheetByName(sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(h => object[h] === undefined ? '' : object[h]));
}

function config_() {
  const out = {};
  rows_(SHEETS.CONFIG).forEach(r => out[String(r.key)] = String(r.value));
  return out;
}

function bool_(v) {
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

function teacherEmail_() {
  return (Session.getActiveUser().getEmail() || '').toLowerCase();
}

function isTeacher_() {
  const email = teacherEmail_();
  const allowed = (PropertiesService.getScriptProperties().getProperty('TEACHER_EMAILS') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.indexOf(email) !== -1;
}

function getPublicInfo() {
  const c = config_();
  return {
    schoolName: c.school_name || 'Sekolah',
    examTitle: c.exam_title || 'Ujian Sekolah',
    examCode: c.exam_code || '',
    duration: Number(c.duration_minutes || 120),
    isOpen: bool_(c.exam_open),
    instructions: c.instructions || ''
  };
}

function studentLogin(studentId, accessCode, examCode) {
  studentId = String(studentId || '').trim();
  accessCode = String(accessCode || '').trim();
  examCode = String(examCode || '').trim();
  if (!studentId || !accessCode || !examCode) throw new Error('Lengkapi NIS/NISN, kode akses, dan kode ujian.');
  const cfg = config_();
  if (!bool_(cfg.exam_open)) throw new Error('Ujian belum dibuka oleh guru.');
  if (examCode !== String(cfg.exam_code || '')) throw new Error('Kode ujian tidak sesuai.');
  const student = rows_(SHEETS.STUDENTS).find(s =>
    String(s.student_id).trim() === studentId &&
    String(s.access_code).trim() === accessCode &&
    String(s.exam_code).trim() === examCode && bool_(s.active));
  if (!student) throw new Error('Identitas atau kode akses tidak valid.');
  const existing = rows_(SHEETS.RESPONSES).filter(r =>
    String(r.student_id) === studentId && String(r.exam_code) === examCode && String(r.status) === 'SUBMITTED');
  if (existing.length) throw new Error('Jawaban untuk ujian ini sudah dikirim. Hubungi guru jika perlu koreksi administrasi.');
  const questions = rows_(SHEETS.QUESTIONS).filter(q =>
    String(q.exam_code) === examCode && bool_(q.active))
    .sort((a,b) => Number(a.order_no) - Number(b.order_no));
  if (!questions.length) throw new Error('Belum ada soal aktif untuk ujian ini.');
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('student:' + token, JSON.stringify({
    studentId: String(student.student_id), fullName: String(student.full_name),
    className: String(student.class_name), examCode: examCode
  }), 60 * 60 * 4);
  return {
    token: token,
    student: { id: String(student.student_id), name: String(student.full_name), className: String(student.class_name) },
    exam: { title: cfg.exam_title || 'Ujian Sekolah', duration: Number(cfg.duration_minutes || 120), instructions: cfg.instructions || '' },
    questions: questions.map(q => ({
      id: String(q.question_id), text: String(q.question_text), indicator: String(q.indicator || ''),
      topic: String(q.topic || ''), maxScore: Number(q.max_score || 0), order: Number(q.order_no || 0)
    }))
  };
}

function submitAnswers(token, answers) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const raw = CacheService.getScriptCache().get('student:' + String(token || ''));
    if (!raw) throw new Error('Sesi berakhir. Hubungi pengawas; jangan mengirim ulang tanpa konfirmasi.');
    const student = JSON.parse(raw);
    const cfg = config_();
    if (!bool_(cfg.exam_open)) throw new Error('Ujian telah ditutup. Hubungi guru/pengawas.');
    const prior = rows_(SHEETS.RESPONSES).some(r =>
      String(r.student_id) === student.studentId &&
      String(r.exam_code) === student.examCode && String(r.status) === 'SUBMITTED');
    if (prior) throw new Error('Jawaban telah tercatat sebelumnya.');
    const questions = rows_(SHEETS.QUESTIONS).filter(q =>
      String(q.exam_code) === student.examCode && bool_(q.active));
    const answerMap = answers && typeof answers === 'object' ? answers : {};
    questions.forEach(q => {
      const answer = String(answerMap[String(q.question_id)] || '').trim();
      append_(SHEETS.RESPONSES, {
        response_id: Utilities.getUuid(),
        submitted_at: new Date(),
        student_id: student.studentId,
        full_name: student.fullName,
        class_name: student.className,
        exam_code: student.examCode,
        question_id: String(q.question_id),
        answer_text: answer,
        status: 'SUBMITTED'
      });
    });
    CacheService.getScriptCache().remove('student:' + token);
    return { success: true, message: 'Jawaban berhasil dikirim. Simpan konfirmasi ini bila diperlukan.' };
  } finally {
    lock.releaseLock();
  }
}

function getTeacherDashboard() {
  if (!isTeacher_()) throw new Error('Akses guru ditolak. Periksa akun Google dan TEACHER_EMAILS.');
  const cfg = config_();
  const questions = rows_(SHEETS.QUESTIONS);
  const students = rows_(SHEETS.STUDENTS);
  const responses = rows_(SHEETS.RESPONSES);
  const grades = rows_(SHEETS.GRADES);
  const submitted = new Set(responses.filter(r => String(r.status) === 'SUBMITTED')
    .map(r => String(r.student_id) + '|' + String(r.exam_code)));
  return {
    email: teacherEmail_(),
    config: cfg,
    counts: {
      questions: questions.filter(q => bool_(q.active)).length,
      students: students.filter(s => bool_(s.active)).length,
      submittedStudents: submitted.size,
      responseRows: responses.length,
      gradedRows: grades.length
    },
    questions: questions,
    students: students,
    responses: responses,
    grades: grades,
    analysis: buildAnalysis_()
  };
}

function gradeResponse(studentId, examCode, questionId, criterionScores, feedback) {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  const response = rows_(SHEETS.RESPONSES).find(r =>
    String(r.student_id) === String(studentId) &&
    String(r.exam_code) === String(examCode) &&
    String(r.question_id) === String(questionId) &&
    String(r.status) === 'SUBMITTED');
  if (!response) throw new Error('Jawaban tidak ditemukan.');
  const rubrics = rows_(SHEETS.RUBRICS).filter(r => String(r.question_id) === String(questionId))
    .sort((a,b) => Number(a.order_no) - Number(b.order_no));
  if (!rubrics.length) throw new Error('Rubrik belum dibuat untuk soal ini.');
  let total = 0, max = 0;
  rubrics.forEach(r => {
    const score = Number((criterionScores || {})[String(r.rubric_id)] || 0);
    const cap = Number(r.max_points || 0);
    if (!Number.isFinite(score) || score < 0 || score > cap) throw new Error('Skor rubrik harus berada antara 0 dan skor maksimum.');
    total += score; max += cap;
  });
  const prior = rows_(SHEETS.GRADES).filter(g =>
    String(g.student_id) === String(studentId) &&
    String(g.exam_code) === String(examCode) &&
    String(g.question_id) === String(questionId));
  // Replace prior grade rows to make regrading idempotent.
  if (prior.length) {
    const sh = db_().getSheetByName(SHEETS.GRADES);
    const data = sh.getDataRange().getValues();
    const headers = data[0].map(String);
    const indexes = {
      student_id: headers.indexOf('student_id'), exam_code: headers.indexOf('exam_code'),
      question_id: headers.indexOf('question_id')
    };
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][indexes.student_id]) === String(studentId) &&
          String(data[i][indexes.exam_code]) === String(examCode) &&
          String(data[i][indexes.question_id]) === String(questionId)) sh.deleteRow(i + 1);
    }
  }
  rubrics.forEach(r => {
    const score = Number((criterionScores || {})[String(r.rubric_id)] || 0);
    append_(SHEETS.GRADES, {
      grade_id: Utilities.getUuid(), graded_at: new Date(),
      student_id: String(studentId), full_name: String(response.full_name),
      class_name: String(response.class_name), exam_code: String(examCode),
      question_id: String(questionId), rubric_score: score,
      max_score: Number(r.max_points || 0),
      feedback: String(feedback || ''), grader_email: teacherEmail_()
    });
  });
  return { success: true, questionScore: total, questionMax: max };
}

function getRubrics(questionId) {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  return rows_(SHEETS.RUBRICS).filter(r => String(r.question_id) === String(questionId))
    .sort((a,b) => Number(a.order_no) - Number(b.order_no));
}

function setExamOpen(isOpen) {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  const sh = db_().getSheetByName(SHEETS.CONFIG);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === 'exam_open') {
      sh.getRange(i + 1, 2).setValue(isOpen ? 'TRUE' : 'FALSE');
      return { success: true, isOpen: !!isOpen };
    }
  }
  throw new Error('Konfigurasi exam_open tidak ditemukan.');
}

function getStudentResults() {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  const questions = rows_(SHEETS.QUESTIONS);
  const responses = rows_(SHEETS.RESPONSES);
  const grades = rows_(SHEETS.GRADES);
  const students = [...new Set(responses.map(r => String(r.student_id)))];
  const exams = [...new Set(responses.map(r => String(r.exam_code)))];
  const out = [];
  students.forEach(sid => exams.forEach(ec => {
    const rs = responses.filter(r => String(r.student_id) === sid && String(r.exam_code) === ec && String(r.status) === 'SUBMITTED');
    if (!rs.length) return;
    let earned = 0, max = 0, allGraded = true;
    questions.filter(q => String(q.exam_code) === ec && bool_(q.active)).forEach(q => {
      const gs = grades.filter(g => String(g.student_id) === sid && String(g.exam_code) === ec && String(g.question_id) === String(q.question_id));
      const qMax = Number(q.max_score || 0);
      if (!gs.length) { allGraded = false; max += qMax; return; }
      earned += gs.reduce((a,g) => a + Number(g.rubric_score || 0), 0);
      max += qMax;
    });
    out.push({studentId:sid, name:rs[0].full_name, className:rs[0].class_name, examCode:ec,
      earned:earned, max:max, score:max ? Math.round(earned / max * 10000) / 100 : 0,
      status: allGraded ? 'Terkoreksi' : 'Belum lengkap'});
  }));
  return out;
}

function buildAnalysis_() {
  const questions = rows_(SHEETS.QUESTIONS).filter(q => bool_(q.active));
  const responses = rows_(SHEETS.RESPONSES).filter(r => String(r.status) === 'SUBMITTED');
  const grades = rows_(SHEETS.GRADES);
  const results = [];
  questions.forEach(q => {
    const ec = String(q.exam_code), qid = String(q.question_id), maxQ = Number(q.max_score || 0);
    const answerRows = responses.filter(r => String(r.exam_code) === ec && String(r.question_id) === qid);
    const studentIds = [...new Set(answerRows.map(r => String(r.student_id)))];
    const scores = studentIds.map(sid => {
      const gs = grades.filter(g => String(g.student_id) === sid && String(g.exam_code) === ec && String(g.question_id) === qid);
      if (!gs.length) return null;
      return gs.reduce((sum,g) => sum + Number(g.rubric_score || 0), 0);
    }).filter(v => v !== null);
    const n = scores.length;
    const mean = n ? scores.reduce((a,b) => a+b,0) / n : null;
    const difficulty = (n && maxQ > 0) ? mean / maxQ : null; // Proporsi skor rata-rata
    let discrimination = null, note = 'Data belum cukup untuk analisis.';
    if (n >= 6) {
      const ordered = scores.slice().sort((a,b) => b-a);
      const k = Math.max(1, Math.floor(n * 0.27));
      const upper = ordered.slice(0,k).reduce((a,b)=>a+b,0)/k;
      const lower = ordered.slice(n-k).reduce((a,b)=>a+b,0)/k;
      discrimination = maxQ > 0 ? (upper-lower)/maxQ : null;
    }
    if (difficulty !== null) {
      if (difficulty < 0.30) note = 'Relatif sukar: telaah kesesuaian materi, redaksi, waktu, dan pembelajaran.';
      else if (difficulty <= 0.70) note = 'Kesukaran sedang: umumnya dapat dipertahankan jika selaras dengan indikator.';
      else note = 'Relatif mudah: periksa apakah soal cukup menantang dan mengukur penalaran.';
    }
    if (discrimination !== null) {
      if (discrimination < 0.20) note += ' Daya pembeda rendah: periksa rubrik, ambiguitas, dan kesesuaian indikator.';
      else if (discrimination >= 0.40) note += ' Daya pembeda baik berdasarkan data saat ini.';
      else note += ' Daya pembeda sedang: pertimbangkan penyempurnaan redaksi/rubrik.';
    } else if (n < 6) note += ' Daya pembeda belum ditafsirkan karena jumlah skor terkoreksi kurang dari 6.';
    results.push({
      examCode:ec, questionId:qid, subject:String(q.subject), indicator:String(q.indicator),
      questionText:String(q.question_text), maxScore:maxQ, responses:answerRows.length,
      graded:n, meanScore:mean === null ? '' : Math.round(mean*100)/100,
      indicatorAttainment:mean === null || maxQ <= 0 ? '' : Math.round(mean / maxQ * 1000) / 10,
      difficulty:difficulty === null ? '' : Math.round(difficulty*1000)/1000,
      difficultyLabel:difficulty === null ? 'Belum tersedia' : difficulty < .30 ? 'Sukar' : difficulty <= .70 ? 'Sedang' : 'Mudah',
      discrimination:discrimination === null ? '' : Math.round(discrimination*1000)/1000,
      recommendation:note
    });
  });
  return results;
}


function getUngradedResponses() {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  const responses = rows_(SHEETS.RESPONSES).filter(r => String(r.status) === 'SUBMITTED');
  const grades = rows_(SHEETS.GRADES);
  const questions = rows_(SHEETS.QUESTIONS);
  return responses.filter(r => {
    const q = questions.find(q => String(q.question_id) === String(r.question_id));
    if (!q) return false;
    const expected = rows_(SHEETS.RUBRICS).filter(rb => String(rb.question_id) === String(r.question_id)).length;
    const existing = grades.filter(g => String(g.student_id) === String(r.student_id) &&
      String(g.exam_code) === String(r.exam_code) && String(g.question_id) === String(r.question_id)).length;
    return expected > 0 && existing < expected;
  }).map(r => ({
    studentId:String(r.student_id), fullName:String(r.full_name), className:String(r.class_name),
    examCode:String(r.exam_code), questionId:String(r.question_id), answerText:String(r.answer_text),
    questionText:String((questions.find(q => String(q.question_id) === String(r.question_id)) || {}).question_text || '')
  }));
}

function exportReportData() {
  if (!isTeacher_()) throw new Error('Akses guru ditolak.');
  return { results: getStudentResults(), analysis: buildAnalysis_(), generatedAt: new Date().toISOString() };
}
