import React, { useState } from 'react';
import { UserPlus, Trash2, CheckCircle2, Shield } from 'lucide-react';
import { AdminRole, AdminUser, ExamDatabase } from '../types/exam';

interface AccessControlManagerProps {
  db: ExamDatabase;
  currentAdminEmail: string;
  onSaveAdminUser: (user: AdminUser) => Promise<void>;
  onDeleteAdminUser: (userId: string) => Promise<void>;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  teacher: 'Guru Mapel',
  proctor: 'Pengawas Ruang'
};

export const AccessControlManager: React.FC<AccessControlManagerProps> = ({
  db,
  currentAdminEmail,
  onSaveAdminUser,
  onDeleteAdminUser
}) => {
  const admins = Object.values(db.admin_users || {}).sort((a, b) =>
    a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)
  );

  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [newPinValue, setNewPinValue] = useState('');

  const [form, setForm] = useState<AdminUser>({
    user_id: '',
    email: '',
    full_name: '',
    role: 'teacher',
    access_pin: '',
    active: true
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.full_name.trim() || !form.access_pin.trim()) return;
    const uid = form.user_id.trim() || `ADM${String(admins.length + 1).padStart(3, '0')}`;
    await onSaveAdminUser({
      ...form,
      user_id: uid,
      email: form.email.trim().toLowerCase(),
      full_name: form.full_name.trim(),
      access_pin: form.access_pin.trim()
    });
    setNotice(`Akun ${form.full_name} (${ROLE_LABELS[form.role]}) berhasil disimpan.`);
    setForm({
      user_id: '',
      email: '',
      full_name: '',
      role: 'teacher',
      access_pin: '',
      active: true
    });
    setShowAdd(false);
  };

  const handleSavePin = async (user: AdminUser) => {
    if (!newPinValue.trim()) return;
    await onSaveAdminUser({ ...user, access_pin: newPinValue.trim() });
    setNotice(`PIN akses untuk ${user.email} berhasil diperbarui.`);
    setEditingPinId(null);
    setNewPinValue('');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Hak Akses &amp; Akun Pengelola
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Mengelola tabel <span className="font-mono">admin_users</span> di Supabase sebagai
            pengganti <span className="font-mono">TEACHER_EMAILS</span> pada Script Properties.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="h-4 w-4" />
          Tambah Akun Pengelola
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-slate-200 bg-white p-5 grid grid-cols-1 gap-4 sm:grid-cols-5 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peran (Role)</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="super_admin">Super Admin</option>
              <option value="teacher">Guru Mapel</option>
              <option value="proctor">Pengawas Ruang</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">PIN Akses</label>
            <input
              type="text"
              value={form.access_pin}
              onChange={(e) => setForm({ ...form, access_pin: e.target.value })}
              placeholder="Minimal 6 karakter"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
            >
              Simpan Akun
            </button>
          </div>
        </form>
      )}

      {/* Admin Users Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ubah PIN</th>
              <th className="px-4 py-3 text-right">Hapus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {admins.map((u) => {
              const isSelf = u.email.toLowerCase() === currentAdminEmail.toLowerCase();
              return (
                <tr key={u.user_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{u.user_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {u.full_name}
                    {isSelf && <span className="ml-2 text-xs text-emerald-700">(Sedang login)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-800">
                    {ROLE_LABELS[u.role]}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => onSaveAdminUser({ ...u, active: !u.active })}
                      className={`font-medium ${
                        isSelf
                          ? 'text-slate-400 cursor-not-allowed'
                          : u.active
                          ? 'text-emerald-700 hover:underline cursor-pointer'
                          : 'text-slate-400 hover:underline cursor-pointer'
                      }`}
                    >
                      {u.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {editingPinId === u.user_id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPinValue}
                          onChange={(e) => setNewPinValue(e.target.value)}
                          placeholder="PIN baru"
                          className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSavePin(u)}
                          className="rounded bg-emerald-900 px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPinId(null)}
                          className="text-xs text-slate-500 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPinId(u.user_id);
                          setNewPinValue('');
                        }}
                        className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                      >
                        Ganti PIN
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => onDeleteAdminUser(u.user_id)}
                        aria-label={`Hapus ${u.full_name}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role Permission Matrix */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-800" />
          <h2 className="text-base font-semibold text-slate-900">Matriks Pembagian Hak Akses</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2.5">Fitur / Menu</th>
                <th className="px-3 py-2.5">Super Admin</th>
                <th className="px-3 py-2.5">Guru Mapel</th>
                <th className="px-3 py-2.5">Pengawas Ruang</th>
                <th className="px-3 py-2.5">Peserta (Siswa)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Pengerjaan Ujian Esai</td>
                <td className="px-3 py-2.5 text-slate-500">Mode Pratinjau</td>
                <td className="px-3 py-2.5 text-slate-500">Mode Pratinjau</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya (Hanya Miliknya)</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Buka/Tutup Ujian &amp; Buka Kunci Siswa</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Bank Soal, Kunci &amp; Rubrik</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Koreksi Jawaban &amp; Analisis Butir</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-slate-900">Kelola Akun Admin &amp; Sinkronisasi SQL</td>
                <td className="px-3 py-2.5 font-medium text-emerald-700">Ya</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
                <td className="px-3 py-2.5 text-slate-400">Tidak</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
