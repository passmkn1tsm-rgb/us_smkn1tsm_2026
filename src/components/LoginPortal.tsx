import React, { useState } from 'react';
import { ShieldCheck, GraduationCap, AlertTriangle, ArrowLeft } from 'lucide-react';
import { AdminUser, ExamConfig, ExamDatabase, StudentRecord } from '../types/exam';
import {
  formatSupabaseError,
  isMissingRpcError,
  verifyAdminLoginSupabase,
  verifyStudentLoginSupabase
} from '../services/supabaseService';

interface LoginPortalProps {
  db: ExamDatabase;
  supabaseStatus: 'connected' | 'needs_schema' | 'empty' | 'error';
  onStudentAuthenticated: (student: StudentRecord, remoteConfig?: ExamConfig) => void;
  onAdminAuthenticated: (
    admin: Omit<AdminUser, 'access_pin'> & { session_token?: string }
  ) => void;
}

function detectPengelolaPortalFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const portalParam = (params.get('portal') || params.get('akses') || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  return (
    portalParam === 'pengelola' ||
    portalParam === 'admin' ||
    params.has('admin') ||
    hash === '#pengelola' ||
    hash === '#admin'
  );
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  db,
  supabaseStatus,
  onStudentAuthenticated,
  onAdminAuthenticated
}) => {
  const [isAdminPortal, setIsAdminPortal] = useState<boolean>(() =>
    detectPengelolaPortalFromUrl()
  );

  // Student form
  const [studentId, setStudentId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [examCode, setExamCode] = useState('');

  // Admin/Teacher/Proctor form (hanya tampil pada URL khusus ?portal=pengelola / #pengelola)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPin, setAdminPin] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReturnToStudentPortal = () => {
    setErrorMsg(null);
    setAdminEmail('');
    setAdminPin('');
    setIsAdminPortal(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const sid = studentId.trim();
    const code = accessCode.trim();
    const ecode = examCode.trim();

    if (!sid || !code || !ecode) {
      setErrorMsg('Lengkapi NIS/NISN, kode akses, dan kode ujian.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verifikasi terindeks langsung ke Supabase (RPC aman / 1 baris siswa + config ujian)
      if (supabaseStatus === 'connected') {
        try {
          const remote = await verifyStudentLoginSupabase(sid, code, ecode);
          if (!remote) {
            setErrorMsg('NIS/NISN, kode akses, atau kode ujian tidak sesuai.');
            return;
          }
          if (!remote.config.exam_open) {
            setErrorMsg('Ujian saat ini belum dibuka oleh pengawas.');
            return;
          }
          if (remote.alreadySubmitted) {
            setErrorMsg(
              'Jawaban ujian Anda sudah dikirim sebelumnya. Hubungi pengawas jika membutuhkan pembukaan kunci.'
            );
            return;
          }
          onStudentAuthenticated(remote.student, remote.config);
          return;
        } catch {
          // Fallback ke pengecekan lokal jika tabel/RPC belum siap
        }
      }

      // 2. Fallback lokal
      if (!db.config.exam_open) {
        setErrorMsg('Ujian saat ini belum dibuka oleh pengawas.');
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
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const email = adminEmail.trim().toLowerCase();
    const pin = adminPin.trim();
    if (!email || !pin) {
      setErrorMsg('Masukkan email terdaftar dan PIN akses pengelola.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verifikasi via PostgreSQL RPC di Supabase (menghasilkan session_token)
      try {
        const verified = await verifyAdminLoginSupabase(email, pin);
        if (verified) {
          onAdminAuthenticated(verified);
          return;
        }
        setErrorMsg('Email atau PIN tidak cocok, atau akun pengelola nonaktif.');
        return;
      } catch (rpcErr) {
        const localAdmins = Object.values(db.admin_users || {});
        if (localAdmins.length > 0 && isMissingRpcError(rpcErr)) {
          const matched = localAdmins.find(
            (u) => u.active && u.email.trim().toLowerCase() === email && u.access_pin === pin
          );
          if (!matched) {
            setErrorMsg('Email atau PIN pengelola tidak valid.');
            return;
          }
          const { access_pin: _omit, ...safeAdmin } = matched;
          onAdminAuthenticated(safeAdmin);
          return;
        }

        const msg = formatSupabaseError(rpcErr);
        if (isMissingRpcError(rpcErr)) {
          setErrorMsg(
            'Fungsi login pengelola belum aktif di Supabase. Jalankan skrip schema.sql pada SQL Editor Supabase Anda terlebih dahulu.'
          );
        } else {
          setErrorMsg(msg);
        }
      }
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
            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-200">
              {isAdminPortal ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <GraduationCap className="h-4 w-4" />
              )}
              <span>{db.config.school_name}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-snug">
              {isAdminPortal ? 'Portal Pengelola Evaluasi' : db.config.exam_title}
            </h1>
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              {isAdminPortal
                ? 'Akses khusus administrator, guru mata pelajaran, dan pengawas ruang untuk mengelola bank soal, rubrik penilaian, dan koreksi hasil ujian.'
                : 'Sistem ujian uraian daring. Masukkan identitas peserta, kode akses pribadi, dan kode ujian dari pengawas ruang untuk mulai mengerjakan.'}
            </p>
          </div>

          {isAdminPortal ? (
            <div className="space-y-2.5 border-t border-emerald-800/70 pt-5 text-xs text-emerald-100">
              <div className="font-semibold text-white">Kewenangan Peran:</div>
              <div>• Super Admin: Konfigurasi sistem, akun pengelola &amp; sinkronisasi SQL.</div>
              <div>• Guru Mapel: Bank soal, rubrik penilaian, koreksi &amp; analisis butir.</div>
              <div>• Pengawas Ruang: Status buka/tutup sesi &amp; buka kunci peserta.</div>
            </div>
          ) : (
            <div className="space-y-2.5 border-t border-emerald-800/70 pt-5 text-xs text-emerald-100">
              <div className="font-semibold text-white">Tata Tertib Peserta Ujian:</div>
              <div>• Durasi pengerjaan: {db.config.duration_minutes} menit.</div>
              <div>• Jawaban tersimpan otomatis secara berkala sebagai draf.</div>
              <div>
                • Tetap berada pada halaman ujian ini hingga tombol{' '}
                <span className="font-medium text-white">Kirim Jawaban</span> ditekan.
              </div>
            </div>
          )}
        </div>

        {/* Right Login Form */}
        <div className="lg:col-span-7 p-8 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isAdminPortal ? (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Masuk Lembar Ujian Peserta</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Status sesi ujian:{' '}
                  <span
                    className={
                      db.config.exam_open
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-amber-700'
                    }
                  >
                    {db.config.exam_open ? 'Dibuka untuk peserta' : 'Belum dibuka'}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  NIS / NISN atau ID Peserta
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Masukkan NIS / NISN peserta"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kode Akses Peserta
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Masukkan kode akses pribadi"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kode Ujian
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value)}
                  placeholder="Masukkan kode ujian dari pengawas"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto rounded-lg bg-emerald-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {loading ? 'Memeriksa Data...' : 'Masuk & Mulai Ujian'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Autentikasi Pengelola &amp; Guru
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Masukkan email terdaftar dan PIN akses Anda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReturnToStudentPortal}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Login Siswa
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email Terdaftar
                </label>
                <input
                  type="email"
                  autoComplete="email"
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
                  autoComplete="current-password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Masukkan PIN pengelola"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto rounded-lg bg-emerald-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
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
