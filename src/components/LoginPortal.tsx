import React, { useState } from 'react';
import { ShieldCheck, GraduationCap, AlertTriangle, Lock } from 'lucide-react';
import { AdminUser, ExamDatabase, StudentRecord } from '../types/exam';
import { verifyAdminLoginSupabase } from '../services/supabaseService';

interface LoginPortalProps {
  db: ExamDatabase;
  supabaseStatus: 'connected' | 'needs_schema' | 'empty' | 'error';
  onStudentAuthenticated: (student: StudentRecord) => void;
  onAdminAuthenticated: (admin: Omit<AdminUser, 'access_pin'>) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  db,
  supabaseStatus,
  onStudentAuthenticated,
  onAdminAuthenticated
}) => {
  const [roleTab, setRoleTab] = useState<'student' | 'admin'>('student');

  // Student form
  const [studentId, setStudentId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [examCode, setExamCode] = useState('');

  // Admin/Teacher form
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPin, setAdminPin] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const sid = studentId.trim();
    const code = accessCode.trim();
    const ecode = examCode.trim();

    if (!sid || !code || !ecode) {
      setErrorMsg('Lengkapi NIS/NISN, kode akses, dan kode ujian.');
      return;
    }
    if (!db.config.exam_open) {
      setErrorMsg('Ujian saat ini belum dibuka oleh guru atau pengawas.');
      return;
    }
    if (ecode !== db.config.exam_code) {
      setErrorMsg('Kode ujian tidak sesuai.');
      return;
    }

    const found = db.students?.[sid];
    if (!found || !found.active || found.access_code !== code || found.exam_code !== ecode) {
      setErrorMsg('NIS/NISN atau kode akses peserta tidak valid.');
      return;
    }

    const existing = db.responses?.[sid];
    if (existing && existing.status === 'SUBMITTED') {
      setErrorMsg(
        'Jawaban ujian Anda sudah dikirim sebelumnya. Hubungi pengawas jika membutuhkan pembukaan kunci.'
      );
      return;
    }

    onStudentAuthenticated(found);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const email = adminEmail.trim().toLowerCase();
    const pin = adminPin.trim();
    if (!email || !pin) {
      setErrorMsg('Masukkan email dan PIN/kata sandi pengelola.');
      return;
    }

    setLoading(true);
    try {
      // 1. Coba verifikasi via PostgreSQL RPC jika schema sudah aktif
      if (supabaseStatus === 'connected') {
        try {
          const verified = await verifyAdminLoginSupabase(email, pin);
          if (verified) {
            onAdminAuthenticated(verified);
            return;
          }
          setErrorMsg('Email atau PIN tidak cocok, atau akun pengelola nonaktif.');
          return;
        } catch {
          // Fallback ke pengecekan tabel lokal jika fungsi RPC belum dijalankan di SQL Editor
        }
      }

      // 2. Verifikasi dari admin_users lokal / mirror
      const matched = Object.values(db.admin_users || {}).find(
        (u) => u.active && u.email.trim().toLowerCase() === email && u.access_pin === pin
      );
      if (!matched) {
        setErrorMsg('Email atau PIN admin/guru tidak valid.');
        return;
      }
      const { access_pin: _omit, ...safeAdmin } = matched;
      onAdminAuthenticated(safeAdmin);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Left Context Panel */}
        <div className="lg:col-span-5 bg-emerald-950 text-white p-8 flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="text-xs font-medium text-emerald-200">
              {db.config.school_name}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">
              {db.config.exam_title}
            </h1>
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              Portal ujian uraian terintegrasi dengan pemisahan hak akses antara peserta ujian,
              pengawas ruang, guru penilai, dan administrator utama.
            </p>
          </div>

          <div className="space-y-3 border-t border-emerald-800/70 pt-5 text-xs text-emerald-100">
            <div className="font-semibold text-white">Pembagian Hak Akses:</div>
            <div>
              • <span className="font-medium text-white">Peserta (Siswa)</span>: Hanya masuk ke
              lembar soal &amp; auto-save jawaban miliknya.
            </div>
            <div>
              • <span className="font-medium text-white">Pengawas</span>: Mengontrol status
              buka/tutup ujian dan membuka kunci kiriman peserta.
            </div>
            <div>
              • <span className="font-medium text-white">Guru &amp; Admin</span>: Mengelola bank
              soal, rubrik, koreksi nilai, analisis butir, dan database Supabase.
            </div>
          </div>
        </div>

        {/* Right Login Form */}
        <div className="lg:col-span-7 p-8 space-y-6">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setRoleTab('student');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                roleTab === 'student'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Masuk Peserta (Siswa)
            </button>
            <button
              type="button"
              onClick={() => {
                setRoleTab('admin');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                roleTab === 'admin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Masuk Admin / Guru
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {roleTab === 'student' ? (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Login Peserta Ujian</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status ujian saat ini:{' '}
                  <span
                    className={
                      db.config.exam_open
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-amber-700'
                    }
                  >
                    {db.config.exam_open ? 'Dibuka' : 'Ditutup'}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  NIS / NISN atau ID Peserta
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Contoh: CONTOH001"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kode Akses Peserta
                </label>
                <input
                  type="password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Masukkan kode akses"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kode Ujian
                </label>
                <input
                  type="text"
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value)}
                  placeholder="Masukkan kode ujian dari pengawas"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStudentId('CONTOH001');
                    setAccessCode('123456');
                    setExamCode(db.config.exam_code);
                  }}
                  className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                >
                  Isi akun demo siswa (CONTOH001)
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  Masuk &amp; Mulai Ujian
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Login Administrator, Guru &amp; Pengawas
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Akun diverifikasi terhadap tabel <span className="font-mono">admin_users</span>{' '}
                  di database.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email Terdaftar
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="nama@sekolah.sch.id"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  PIN / Kata Sandi Akses
                </label>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Masukkan PIN pengelola"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                  <Lock className="h-3.5 w-3.5" />
                  Akun Bawaan Awal (Segera ganti PIN setelah masuk):
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminEmail('passmkn1tsm@gmail.com');
                      setAdminPin('admin123');
                    }}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Super Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminEmail('guru1@smkn1tsm.sch.id');
                      setAdminPin('guru123');
                    }}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Guru Mapel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminEmail('pengawas1@smkn1tsm.sch.id');
                      setAdminPin('pengawas123');
                    }}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                  >
                    Pengawas
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  {loading ? 'Memverifikasi...' : 'Masuk ke Konsol'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
