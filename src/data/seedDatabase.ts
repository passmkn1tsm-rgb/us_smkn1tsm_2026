import { AuditFinding, ExamDatabase } from '../types/exam';

export const INITIAL_DATABASE: ExamDatabase = {
  config: {
    school_name: 'SMK Negeri 1 Tasikmalaya',
    exam_title: 'Ujian Sekolah Kelas XII',
    exam_code: 'USXII2027',
    duration_minutes: 120,
    max_score: 100,
    exam_open: true,
    strict_focus: true,
    block_copy_paste: false,
    instructions:
      'Bacalah setiap soal uraian dengan cermat. Tuliskan argumen beserta bukti atau alasan yang logis. Jawaban tersimpan otomatis sebagai draf selama ujian berlangsung.'
  },
  // Kredensial Admin/Guru/Pengawas tidak disimpan di kode client demi keamanan.
  // Kelola akun & PIN pengelola langsung di database Supabase melalui schema.sql / menu Hak Akses.
  admin_users: {},
  questions: {
    Q001: {
      question_id: 'Q001',
      exam_code: 'USXII2027',
      subject: 'Desain Komunikasi Visual / Proses Kerja',
      class_name: 'XII',
      competency: 'Menganalisis informasi',
      indicator: 'Murid mampu menjelaskan alasan dengan bukti pada evaluasi proses kerja',
      topic: 'Analisis Evaluasi',
      question_text:
        'Jelaskan dua alasan mengapa evaluasi hasil kerja penting dalam suatu proses kerja produksi kreatif, dan sertakan contoh dampak jika tahap evaluasi dilewati.',
      answer_key:
        'Jawaban ideal memuat dua alasan relevan (misalnya: menjamin kesesuaian standar mutu/klien dan menemukan efisiensi/kesalahan sejak dini) beserta contoh konkret dampak kegagalan produksi.',
      max_score: 10,
      order_no: 1,
      active: true,
      rubrics: {
        R001: {
          rubric_id: 'R001',
          criterion: 'Ketepatan isi',
          description: 'Menyebutkan dua alasan evaluasi yang sesuai pertanyaan',
          max_points: 5,
          order_no: 1
        },
        R002: {
          rubric_id: 'R002',
          criterion: 'Penjelasan & Contoh',
          description: 'Menjelaskan alasan secara logis beserta contoh dampak konkret',
          max_points: 5,
          order_no: 2
        }
      }
    },
    Q002: {
      question_id: 'Q002',
      exam_code: 'USXII2027',
      subject: 'Desain Komunikasi Visual / Proses Kerja',
      class_name: 'XII',
      competency: 'Merancang solusi teknis',
      indicator: 'Murid mampu membedakan alur praproduksi, produksi, dan pascaproduksi',
      topic: 'Manajemen Produksi',
      question_text:
        'Uraikan perbedaan tanggung jawab utama tim pada tahap praproduksi dan pascaproduksi dalam pembuatan media kampanye sekolah, lalu jelaskan dokumen apa yang wajib disiapkan sebelum masuk ke tahap produksi.',
      answer_key:
        'Praproduksi berfokus pada riset, brief, storyboard, dan jadwal; pascaproduksi berfokus pada penyuntingan akhir, color grading/finishing, dan review klien. Dokumen wajib meliputi creative brief, naskah/storyboard, dan RAB/jadwal.',
      max_score: 15,
      order_no: 2,
      active: true,
      rubrics: {
        R003: {
          rubric_id: 'R003',
          criterion: 'Perbandingan tahapan',
          description: 'Membedakan peran praproduksi dan pascaproduksi secara tepat',
          max_points: 8,
          order_no: 1
        },
        R004: {
          rubric_id: 'R004',
          criterion: 'Kelengkapan dokumen praproduksi',
          description: 'Menyebutkan minimal 2 dokumen praproduksi beserta fungsinya',
          max_points: 7,
          order_no: 2
        }
      }
    },
    Q003: {
      question_id: 'Q003',
      exam_code: 'USXII2027',
      subject: 'Desain Komunikasi Visual / Proses Kerja',
      class_name: 'XII',
      competency: 'Mengevaluasi kesesuaian desain',
      indicator: 'Murid mampu menganalisis prinsip hierarki visual dan keterbacaan tipografi',
      topic: 'Tipografi & Tata Letak',
      question_text:
        'Perhatikan perbandingan dua rancangan poster keselamatan kerja di bawah ini (Poster A dan Poster B). Analisis dua masalah komunikasi visual pada Poster A berdasarkan area yang ditandai nomor 1 dan 2, lalu jelaskan mengapa Poster B lebih efektif!',
      answer_key:
        'Masalah 1 (Pin 1): Keterbacaan rendah karena rasio kontras warna teks abu-abu muda di atas latar kuning cerah sangat lemah. Masalah 2 (Pin 2): Hierarki visual kacau akibat huruf dekoratif berlebihan dan ukuran tidak proporsional. Poster B lebih efektif karena memakai maksimal 2 keluarga huruf sans-serif tegas dengan kontras hitam-kuning yang tinggi.',
      max_score: 15,
      order_no: 3,
      active: true,
      media_layout: 'compare_ab',
      media_items: [
        {
          id: 'Q003_IMG_A',
          label: 'Poster A (Bermasalah)',
          caption: 'Kontras warna teks lemah & banyak jenis huruf dekoratif',
          alt: 'Contoh poster keselamatan kerja dengan kontras lemah dan huruf dekoratif',
          url: `data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260"><rect width="420" height="260" rx="8" fill="#fef08a"/><rect x="16" y="16" width="388" height="228" rx="6" fill="#fde047" stroke="#eab308" stroke-width="2"/><text x="210" y="64" text-anchor="middle" font-family="cursive, serif" font-size="22" font-style="italic" fill="#d4d4d8">Peringatan Keselamatan Kerja!!</text><text x="210" y="112" text-anchor="middle" font-family="fantasy, serif" font-size="14" fill="#e5e7eb">Wajib Memakai Helm &amp; Sarung Tangan</text><text x="210" y="150" text-anchor="middle" font-family="serif" font-size="16" fill="#cbd5e1">Area Bengkel Produksi DKV</text><text x="210" y="196" text-anchor="middle" font-family="cursive" font-size="13" fill="#d1d5db">Patuhi Aturan Sebelum Bekerja</text></svg>`
          )}`,
          pins: [
            { id: 'P1', label: '1', x: 50, y: 24, note: 'Judul memakai font dekoratif & warna pudar' },
            { id: 'P2', label: '2', x: 50, y: 58, note: 'Kontras teks abu-abu di atas kuning terlalu rendah' }
          ]
        },
        {
          id: 'Q003_IMG_B',
          label: 'Poster B (Perbaikan)',
          caption: 'Hierarki tipografi jelas & kontras warna gelap-terang tinggi',
          alt: 'Contoh poster keselamatan kerja perbaikan dengan kontras tinggi',
          url: `data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260"><rect width="420" height="260" rx="8" fill="#facc15"/><rect x="16" y="16" width="388" height="58" rx="6" fill="#111827"/><text x="210" y="52" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="800" letter-spacing="1" fill="#facc15">KESELAMATAN KERJA</text><text x="210" y="114" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#111827">WAJIB MEMAKAI HELM &amp; PELINDUNG</text><line x1="60" y1="136" x2="360" y2="136" stroke="#111827" stroke-width="2"/><text x="210" y="170" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="#1f2937">1. Cek kelistrikan sebelum menyalakan mesin</text><text x="210" y="200" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="#1f2937">2. Gunakan area kerja sesuai standar K3</text></svg>`
          )}`,
          pins: []
        }
      ],
      rubrics: {
        R005: {
          rubric_id: 'R005',
          criterion: 'Identifikasi masalah visual',
          description: 'Menganalisis masalah kontras dan pemilihan tipografi dekoratif',
          max_points: 7,
          order_no: 1
        },
        R006: {
          rubric_id: 'R006',
          criterion: 'Rekomendasi perbaikan',
          description: 'Memberikan solusi teknis tata letak, kontras, dan tipografi yang aplikatif',
          max_points: 8,
          order_no: 2
        }
      }
    }
  },
  students: {
    CONTOH001: {
      student_id: 'CONTOH001',
      full_name: 'Murid Contoh',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      access_code: '123456',
      active: true
    },
    '202412002': {
      student_id: '202412002',
      full_name: 'Raka Pratama Putra',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      access_code: '654321',
      active: true
    },
    '202412003': {
      student_id: '202412003',
      full_name: 'Nadia Kusuma Wardani',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      access_code: '778899',
      active: true
    },
    '202412004': {
      student_id: '202412004',
      full_name: 'Fajar Ramadhan',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      access_code: '112233',
      active: true
    },
    '202412005': {
      student_id: '202412005',
      full_name: 'Siti Aulia Rahma',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      access_code: '445566',
      active: true
    },
    '202412006': {
      student_id: '202412006',
      full_name: 'Dimas Arya Nugraha',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      access_code: '998877',
      active: true
    },
    '202412007': {
      student_id: '202412007',
      full_name: 'Tiara Puspitasari',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      access_code: '334455',
      active: true
    }
  },
  responses: {
    '202412002': {
      student_id: '202412002',
      full_name: 'Raka Pratama Putra',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:02:00.000Z',
      submitted_at: '2026-11-16T09:15:22.000Z',
      answers: {
        Q001:
          'Evaluasi hasil kerja penting karena pertama, memastikan produk sesuai dengan standar kualitas yang disepakati dengan klien. Kedua, evaluasi membantu tim mendeteksi kesalahan teknis sebelum dicetak massal. Contohnya jika poster salah ukuran warna CMYK tidak dievaluasi, seluruh cetakan ratusan lembar akan buram dan memicu kerugian biaya cetak ulang.',
        Q002:
          'Praproduksi adalah tahap perencanaan awal seperti riset audiens, penyusunan brief, penulisan naskah, dan pembuatan storyboard. Sedangkan pascaproduksi adalah penyempurnaan karya setelah pengambilan gambar selesai, meliputi editing, koreksi warna, dan ekspor format final. Dokumen wajib sebelum produksi adalah Creative Brief dan Storyboard lengkap.',
        Q003:
          'Masalah pertama terletak pada rasio kontras warna abu-abu muda di atas latar kuning cerah yang membuat teks hampir tidak terbaca dari jarak pandang normal. Masalah kedua adalah penggunaan banyak huruf dekoratif yang memecah fokus audiens. Solusinya, ganti ke huruf sans-serif yang lugas dengan maksimal dua jenis font dan gunakan warna teks gelap pekat seperti hitam atau biru tua.'
      }
    },
    '202412003': {
      student_id: '202412003',
      full_name: 'Nadia Kusuma Wardani',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:01:00.000Z',
      submitted_at: '2026-11-16T09:18:10.000Z',
      answers: {
        Q001:
          'Pertama untuk mengetahui kekurangan dari hasil pekerjaan, kedua agar pekerjaan berikutnya bisa lebih cepat dan efisien. Jika tidak dievaluasi, kesalahan yang sama akan terulang pada proyek selanjutnya.',
        Q002:
          'Praproduksi menyiapkan konsep, jadwal, dan anggaran. Pascaproduksi melakukan revisi akhir dan finalisasi file siap tayang. Dokumen yang wajib ada sebelum produksi adalah storyboard dan daftar alat.',
        Q003:
          'Warna abu-abu di atas kuning kurang kontras sehingga sulit dibaca. Huruf dekoratif terlalu ramai membuat pesan keselamatan kerja tidak cepat ditangkap. Sebaiknya memakai huruf sans-serif tebal untuk judul dan warna teks hitam.'
      }
    },
    '202412004': {
      student_id: '202412004',
      full_name: 'Fajar Ramadhan',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:05:00.000Z',
      submitted_at: '2026-11-16T09:24:40.000Z',
      answers: {
        Q001: 'Supaya hasilnya bagus dan tidak ada yang salah saat diserahkan.',
        Q002: 'Praproduksi itu sebelum membuat karya dan pascaproduksi itu setelah selesai. Dokumennya catatan ide.',
        Q003:
          'Warnanya kurang jelas karena kuning terlalu silau. Perbaikannya latar diganti warna gelap atau tulisannya diperbesar.'
      }
    },
    '202412005': {
      student_id: '202412005',
      full_name: 'Siti Aulia Rahma',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:00:00.000Z',
      submitted_at: '2026-11-16T09:11:05.000Z',
      answers: {
        Q001:
          '1) Mengukur ketercapaian tujuan kerja terhadap target mutu dan tenggat waktu; 2) Memberikan umpan balik objektif bagi perbaikan proses. Contoh dampak bila dilewati: file desain dikirim ke percetakan dengan resolusi rendah sehingga hasil cetak pecah dan ditolak klien.',
        Q002:
          'Tahap praproduksi berfokus pada konsep, riset kebutuhan, penjadwalan, serta perancangan storyboard dan RAB. Tahap pascaproduksi bertugas mengolah materi mentah melalui penyuntingan, color grading, audio mixing, dan quality control. Dokumen wajib sebelum produksi antara lain Creative Brief, Storyboard, dan Jadwal Produksi.',
        Q003:
          'Masalah utama adalah kegagalan kontras luminansi (teks abu-abu muda vs latar kuning) yang melanggar prinsip keterbacaan poster keselamatan, serta ketiadaan hierarki informasi akibat pemakaian font dekoratif berlebihan. Perbaikannya menggunakan kombinasi tipografi sans-serif berkontras tinggi (teks hitam pekat di atas kuning atau putih di atas merah/navy) dan membatasi maksimal dua keluarga huruf.'
      }
    },
    '202412006': {
      student_id: '202412006',
      full_name: 'Dimas Arya Nugraha',
      class_name: 'XII DKV 2',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:04:00.000Z',
      submitted_at: '2026-11-16T09:30:12.000Z',
      answers: {
        Q001:
          'Evaluasi penting agar kualitas terjamin dan tim tahu letak kesalahan kerja. Jika dilewati maka revisi akan menumpuk di akhir.',
        Q002:
          'Praproduksi menyiapkan rencana, naskah, dan tim. Pascaproduksi mengedit hasil rekaman atau desain hingga siap dipublikasikan. Dokumen wajibnya adalah naskah dan brief.',
        Q003:
          'Kontras teks abu-abu pada kuning terlalu lemah dan huruf dekoratif menyulitkan pembaca. Solusi: ganti warna tulisan jadi hitam pekat dan pakai font yang sederhana dan rapi.'
      }
    },
    '202412007': {
      student_id: '202412007',
      full_name: 'Tiara Puspitasari',
      class_name: 'XII DKV 1',
      exam_code: 'USXII2027',
      status: 'SUBMITTED',
      started_at: '2026-11-16T08:03:00.000Z',
      submitted_at: '2026-11-16T09:20:00.000Z',
      answers: {
        Q001:
          'Evaluasi kerja mencegah pemborosan bahan serta memastikan keselamatan dan ketepatan pesan desain sebelum diproduksi massal. Contohnya bila tidak dicek ulang, kesalahan ketik pada kemasan produk akan membuat seluruh kemasan tidak layak edar.',
        Q002:
          'Praproduksi adalah tahap merancang gagasan dan teknis kerja sebelum eksekusi, sedangkan pascaproduksi menangani penyempurnaan, pengemasan file, dan distribusi. Dokumen praproduksi meliputi brief desain, sketsa/wireframe, dan pembagian tugas.',
        Q003:
          'Keterbacaan terganggu karena teks abu-abu muda terlalu mirip tingkat terangnya dengan kuning cerah, serta hierarki ukuran judul dan isi hilang karena semua memakai font dekoratif. Perbaikan: terapkan warna teks gelap kontras tinggi, batasi 1-2 jenis huruf sans-serif, dan bedakan ukuran judul serta isi.'
      }
    }
  },
  grades: {
    '202412002': {
      Q001: {
        grade_id: 'G-202412002-Q001',
        graded_at: '2026-11-16T10:05:00.000Z',
        student_id: '202412002',
        full_name: 'Raka Pratama Putra',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q001',
        criteria_scores: { R001: 5, R002: 5 },
        rubric_total: 10,
        max_score: 10,
        feedback: 'Dua alasan tepat dengan contoh teknis CMYK yang konkret.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q002: {
        grade_id: 'G-202412002-Q002',
        graded_at: '2026-11-16T10:06:00.000Z',
        student_id: '202412002',
        full_name: 'Raka Pratama Putra',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q002',
        criteria_scores: { R003: 7.5, R004: 6.5 },
        rubric_total: 14,
        max_score: 15,
        feedback: 'Penjelasan jelas, tambahkan fungsi masing-masing dokumen praproduksi.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q003: {
        grade_id: 'G-202412002-Q003',
        graded_at: '2026-11-16T10:07:00.000Z',
        student_id: '202412002',
        full_name: 'Raka Pratama Putra',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q003',
        criteria_scores: { R005: 7, R006: 7.5 },
        rubric_total: 14.5,
        max_score: 15,
        feedback: 'Analisis kontras dan tipografi sangat baik.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      }
    },
    '202412003': {
      Q001: {
        grade_id: 'G-202412003-Q001',
        graded_at: '2026-11-16T10:08:00.000Z',
        student_id: '202412003',
        full_name: 'Nadia Kusuma Wardani',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q001',
        criteria_scores: { R001: 4, R002: 3.5 },
        rubric_total: 7.5,
        max_score: 10,
        feedback: 'Alasan cukup tepat, contoh dampak masih umum.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q002: {
        grade_id: 'G-202412003-Q002',
        graded_at: '2026-11-16T10:09:00.000Z',
        student_id: '202412003',
        full_name: 'Nadia Kusuma Wardani',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q002',
        criteria_scores: { R003: 6.5, R004: 5 },
        rubric_total: 11.5,
        max_score: 15,
        feedback: 'Sudah membedakan dua tahap dengan ringkas.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q003: {
        grade_id: 'G-202412003-Q003',
        graded_at: '2026-11-16T10:10:00.000Z',
        student_id: '202412003',
        full_name: 'Nadia Kusuma Wardani',
        class_name: 'XII DKV 1',
        exam_code: 'USXII2027',
        question_id: 'Q003',
        criteria_scores: { R005: 5.5, R006: 6 },
        rubric_total: 11.5,
        max_score: 15,
        feedback: 'Perbaikan sudah mengarah pada keterbacaan.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      }
    },
    '202412004': {
      Q001: {
        grade_id: 'G-202412004-Q001',
        graded_at: '2026-11-16T10:11:00.000Z',
        student_id: '202412004',
        full_name: 'Fajar Ramadhan',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q001',
        criteria_scores: { R001: 2, R002: 1 },
        rubric_total: 3,
        max_score: 10,
        feedback: 'Jawaban masih terlalu singkat dan belum menyertakan contoh dampak.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q002: {
        grade_id: 'G-202412004-Q002',
        graded_at: '2026-11-16T10:12:00.000Z',
        student_id: '202412004',
        full_name: 'Fajar Ramadhan',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q002',
        criteria_scores: { R003: 2.5, R004: 2 },
        rubric_total: 4.5,
        max_score: 15,
        feedback: 'Perlu menjelaskan tanggung jawab teknis tiap tahap secara spesifik.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q003: {
        grade_id: 'G-202412004-Q003',
        graded_at: '2026-11-16T10:13:00.000Z',
        student_id: '202412004',
        full_name: 'Fajar Ramadhan',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q003',
        criteria_scores: { R005: 2.5, R006: 2.5 },
        rubric_total: 5,
        max_score: 15,
        feedback: 'Belum menyinggung masalah tipografi dekoratif.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      }
    },
    '202412005': {
      Q001: {
        grade_id: 'G-202412005-Q001',
        graded_at: '2026-11-16T10:14:00.000Z',
        student_id: '202412005',
        full_name: 'Siti Aulia Rahma',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q001',
        criteria_scores: { R001: 5, R002: 5 },
        rubric_total: 10,
        max_score: 10,
        feedback: 'Sangat sistematis dengan contoh resolusi cetak yang relevan.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q002: {
        grade_id: 'G-202412005-Q002',
        graded_at: '2026-11-16T10:15:00.000Z',
        student_id: '202412005',
        full_name: 'Siti Aulia Rahma',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q002',
        criteria_scores: { R003: 8, R004: 7 },
        rubric_total: 15,
        max_score: 15,
        feedback: 'Penjelasan peran dan dokumen praproduksi lengkap.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q003: {
        grade_id: 'G-202412005-Q003',
        graded_at: '2026-11-16T10:16:00.000Z',
        student_id: '202412005',
        full_name: 'Siti Aulia Rahma',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q003',
        criteria_scores: { R005: 7, R006: 8 },
        rubric_total: 15,
        max_score: 15,
        feedback: 'Menjelaskan kontras luminansi serta hierarki tipografi dengan tepat.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      }
    },
    '202412006': {
      Q001: {
        grade_id: 'G-202412006-Q001',
        graded_at: '2026-11-16T10:17:00.000Z',
        student_id: '202412006',
        full_name: 'Dimas Arya Nugraha',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q001',
        criteria_scores: { R001: 3.5, R002: 3 },
        rubric_total: 6.5,
        max_score: 10,
        feedback: 'Sudah baik, perlu contoh konkret.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      },
      Q002: {
        grade_id: 'G-202412006-Q002',
        graded_at: '2026-11-16T10:18:00.000Z',
        student_id: '202412006',
        full_name: 'Dimas Arya Nugraha',
        class_name: 'XII DKV 2',
        exam_code: 'USXII2027',
        question_id: 'Q002',
        criteria_scores: { R003: 5.5, R004: 5 },
        rubric_total: 10.5,
        max_score: 15,
        feedback: 'Uraian singkat namun sudah tepat sasaran.',
        grader_email: 'guru1@smkn1tsm.sch.id'
      }
      // Q003 intentionally ungraded so Grading Workspace shows ready-to-grade queue!
    }
    // 202412007 intentionally ungraded across all 3 questions so teacher can test grading!
  }
};

export const AUDIT_FINDINGS: AuditFinding[] = [
  {
    id: 'AUD-01',
    severity: 'Kritis',
    file: 'US-kode_6db8c6b0.gs',
    location: 'submitAnswers() · baris 162–197',
    title: 'Kemacetan LockService & Loop appendRow() Saat Kirim Massal',
    spreadsheetIssue:
      'Menggunakan LockService.getScriptLock().waitLock(15000) yang mengantrekan seluruh siswa secara serial. Setiap siswa memicu pembacaan penuh sheet Responses (O(N)) dan N kali appendRow(). Jika 100+ siswa mengirim bersamaan saat waktu habis, antrean melebihi 15 detik dan siswa gagal mengirim.',
    supabaseResolution:
      'Setiap siswa melakukan UPSERT paralel langsung ke tabel PostgreSQL responses menggunakan constraint UNIQUE (student_id, exam_code, question_id) tanpa mengunci siswa lain.'
  },
  {
    id: 'AUD-02',
    severity: 'Kritis',
    file: 'US-kode_6db8c6b0.gs',
    location: 'getUngradedResponses() · baris 380',
    title: 'Pembacaan Sheet Berulang O(N × M) di Dalam Filter Loop',
    spreadsheetIssue:
      'Memanggil rows_(SHEETS.RUBRICS) di dalam responses.filter(). Untuk 300 siswa × 5 soal (1.500 baris), Apps Script membaca seluruh tab Rubrics sebanyak 1.500 kali berturut-turut, memicu timeout 6 menit dan error kuota SpreadsheetApp.',
    supabaseResolution:
      'Tabel rubrics terhubung via Foreign Key ke tabel questions dan diindeks di PostgreSQL. Konsol memuat questions dan rubrics sekali dalam satu query terstruktur.'
  },
  {
    id: 'AUD-03',
    severity: 'Kritis',
    file: 'US-kode_6db8c6b0.gs',
    location: 'buildAnalysis_() · baris 340–346',
    title: 'Kesalahan Rumus Daya Pembeda (Item Discrimination)',
    spreadsheetIssue:
      'Kelompok atas (upper 27%) dan bawah (lower 27%) diurutkan berdasarkan skor butir soal itu sendiri, bukan berdasarkan total skor ujian seluruh soal. Akibatnya daya pembeda hanya mengukur rentang nilai butir tunggal, bukan kemampuan soal membedakan siswa berkemampuan tinggi dan rendah.',
    supabaseResolution:
      'Konsol analitik menghitung total skor setiap siswa terlebih dahulu, lalu mengurutkan peserta berdasarkan skor total ujian untuk menentukan kelompok atas 27% dan bawah 27%.'
  },
  {
    id: 'AUD-04',
    severity: 'Tinggi',
    file: 'US-kode_6db8c6b0.gs',
    location: 'isTeacher_() & Deploy Web App · baris 103–112',
    title: 'Konflik Akses Session.getActiveUser().getEmail()',
    spreadsheetIssue:
      'Jika Web App di-deploy "Who has access: Anyone" agar siswa non-Google Workspace bisa login memakai NIS/NISN, Session.getActiveUser().getEmail() mengembalikan string kosong sehingga Dashboard Guru selalu ditolak.',
    supabaseResolution:
      'Akses dikelola melalui Supabase Row-Level Security (RLS) dan/atau Supabase Auth sehingga otorisasi guru dan peserta terpisah dengan tegas.'
  },
  {
    id: 'AUD-05',
    severity: 'Tinggi',
    file: '_DOCTYPE_b9c4b4e0.html',
    location: 'loginStudent() & submitNow() · baris 70–92',
    title: 'Tidak Ada Auto-Save Draf & Risiko Eviksi CacheService',
    spreadsheetIssue:
      'Jawaban hanya hidup di <textarea> browser dan sesi siswa disimpan di CacheService (maks 6 jam, rawan terhapus jika memori penuh). Jika tab tertutup atau Wi-Fi terputus, seluruh ketikan esai hilang.',
    supabaseResolution:
      'Auto-save ter-debounce langsung melakukan UPSERT ke tabel responses dengan status IN_PROGRESS. Jika browser dimuat ulang, jawaban langsung pulih dari PostgreSQL.'
  },
  {
    id: 'AUD-06',
    severity: 'Sedang',
    file: '_DOCTYPE_b9c4b4e0.html',
    location: 'baris 80 & baris 147',
    title: 'Indikator Soal Kosong & Kebocoran examCode Otomatis',
    spreadsheetIssue:
      'Baris 80 membuat elemen <p> tetapi p.textContent = "" (kosong). Baris 147 langsung mengisi input examCode dari getPublicInfo(), sehingga kode ujian tidak lagi berfungsi sebagai penyaring akses.',
    supabaseResolution:
      'Indikator & topik dirender eksplisit untuk membantu siswa memahami target penilaian, dan examCode wajib dimasukkan peserta tanpa pengisian otomatis.'
  }
];
