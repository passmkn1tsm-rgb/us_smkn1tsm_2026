import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  Upload,
  RotateCcw,
  CheckCircle2,
  Download,
  Shuffle,
  FileSpreadsheet
} from 'lucide-react';
import { ExamDatabase, StudentRecord } from '../types/exam';
import {
  CsvDelimiter,
  downloadStudentsTemplate,
  generateAccessCode,
  parseStudentsFromText
} from '../utils/csvTemplates';

interface StudentsManagerProps {
  db: ExamDatabase;
  onSaveStudent: (student: StudentRecord) => Promise<void>;
  onBulkImportStudents: (students: StudentRecord[]) => Promise<void>;
  onResetSubmission: (studentId: string) => Promise<void>;
}

export const StudentsManager: React.FC<StudentsManagerProps> = ({
  db,
  onSaveStudent,
  onBulkImportStudents,
  onResetSubmission
}) => {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('Semua');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>(',');
  const [bulkText, setBulkText] = useState(
    'student_id,full_name,class_name,exam_code,access_code,active\n202412008,Bagas Saputra,XII DKV 1,USXII2027,556677,TRUE\n202412009,Citra Lestari,XII DKV 2,USXII2027,889900,TRUE'
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState<StudentRecord>({
    student_id: '',
    full_name: '',
    class_name: 'XII DKV 1',
    exam_code: db.config.exam_code,
    access_code: '',
    active: true
  });

  const allStudents = Object.values(db.students || {}).sort(
    (a, b) => a.class_name.localeCompare(b.class_name) || a.full_name.localeCompare(b.full_name)
  );
  const classes = ['Semua', ...Array.from(new Set(allStudents.map((s) => s.class_name)))];

  const filtered = allStudents.filter((s) => {
    const matchClass = classFilter === 'Semua' || s.class_name === classFilter;
    const q = search.trim().toLowerCase();
    const matchQuery =
      !q ||
      s.student_id.toLowerCase().includes(q) ||
      s.full_name.toLowerCase().includes(q) ||
      s.class_name.toLowerCase().includes(q);
    return matchClass && matchQuery;
  });

  const parsedBulk = parseStudentsFromText(bulkText, db.config.exam_code);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.student_id.trim() || !newStudent.full_name.trim()) return;
    await onSaveStudent({
      ...newStudent,
      student_id: newStudent.student_id.trim(),
      full_name: newStudent.full_name.trim(),
      access_code: newStudent.access_code.trim() || generateAccessCode(6)
    });
    setNotice(`Peserta ${newStudent.full_name} berhasil ditambahkan.`);
    setNewStudent({
      student_id: '',
      full_name: '',
      class_name: newStudent.class_name,
      exam_code: db.config.exam_code,
      access_code: '',
      active: true
    });
    setShowAddForm(false);
  };

  const handleBulkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setBulkText(content);
    setNotice(`File "${file.name}" dimuat ke pratinjau impor.`);
  };

  const handleBulkSubmit = async () => {
    if (!parsedBulk.students.length) return;
    await onBulkImportStudents(parsedBulk.students);
    setNotice(`${parsedBulk.students.length} peserta berhasil diimpor ke database.`);
    setShowBulkModal(false);
  };

  const handleRandomizeMissingCodes = async () => {
    const updated = allStudents.map((s) => ({
      ...s,
      access_code: generateAccessCode(6)
    }));
    await onBulkImportStudents(updated);
    setNotice(`Kode akses acak 6 karakter dibuat ulang untuk ${updated.length} peserta.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Manajemen Peserta Ujian
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Unduh template CSV, impor massal peserta dari Excel/CSV, atau buat kode akses acak.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden">
            <select
              aria-label="Pemisah kolom CSV"
              value={csvDelimiter}
              onChange={(e) => setCsvDelimiter(e.target.value as CsvDelimiter)}
              className="border-r border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value=",">CSV Koma (,)</option>
              <option value=";">CSV Excel ID (;)</option>
            </select>
            <button
              type="button"
              onClick={() => downloadStudentsTemplate(db.config.exam_code, csvDelimiter)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh Template
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowBulkModal(!showBulkModal);
              setShowAddForm(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Impor Excel / CSV
          </button>

          <button
            type="button"
            onClick={handleRandomizeMissingCodes}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Acak Kode Akses
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowBulkModal(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Tambah Peserta
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleAddSingle}
          className="rounded-lg border border-slate-200 bg-white p-5 grid grid-cols-1 gap-4 sm:grid-cols-5 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NIS / NISN</label>
            <input
              type="text"
              value={newStudent.student_id}
              onChange={(e) => setNewStudent({ ...newStudent, student_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              value={newStudent.full_name}
              onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
            <input
              type="text"
              value={newStudent.class_name}
              onChange={(e) => setNewStudent({ ...newStudent, class_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kode Akses (kosongkan = acak)
            </label>
            <input
              type="text"
              value={newStudent.access_code}
              onChange={(e) => setNewStudent({ ...newStudent, access_code: e.target.value })}
              placeholder="Otomatis 6 digit"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
            >
              Simpan
            </button>
          </div>
        </form>
      )}

      {showBulkModal && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Impor Massal Peserta (Upload File .csv atau Tempel dari Excel)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mendukung pemisah koma (,), titik koma (;), dan Tab dari Excel. Kolom:
                <span className="font-mono">
                  {' '}
                  student_id, full_name, class_name, exam_code, access_code, active
                </span>
              </p>
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer whitespace-nowrap">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Pilih File .csv / .tsv
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleBulkFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          <textarea
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Terdeteksi{' '}
              <span className="font-mono font-semibold text-slate-900">
                {parsedBulk.students.length}
              </span>{' '}
              peserta valid
              {parsedBulk.skipped > 0 && ` (${parsedBulk.skipped} baris tidak lengkap dilewati)`}.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={parsedBulk.students.length === 0}
                onClick={handleBulkSubmit}
                className="rounded-lg bg-emerald-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                Simpan {parsedBulk.students.length} Peserta ke Database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS atau nama peserta..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-emerald-800 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {classes.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setClassFilter(cls)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                classFilter === cls
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* Students Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">NIS / ID</th>
              <th className="px-4 py-3">Nama Peserta</th>
              <th className="px-4 py-3">Kelas</th>
              <th className="px-4 py-3">Kode Akses</th>
              <th className="px-4 py-3">Status Ujian</th>
              <th className="px-4 py-3">Akun</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Tidak ada peserta yang sesuai filter.
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const resp = db.responses?.[s.student_id];
              const examStatus =
                resp?.status === 'SUBMITTED'
                  ? 'Sudah Mengirim'
                  : resp?.status === 'IN_PROGRESS'
                  ? 'Sedang Mengerjakan'
                  : 'Belum Masuk';
              return (
                <tr key={s.student_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 tabular-nums">
                    {s.student_id}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.class_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                    {s.access_code}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={
                        resp?.status === 'SUBMITTED'
                          ? 'font-medium text-emerald-700'
                          : resp?.status === 'IN_PROGRESS'
                          ? 'font-medium text-amber-700'
                          : 'text-slate-500'
                      }
                    >
                      {examStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      type="button"
                      onClick={() => onSaveStudent({ ...s, active: !s.active })}
                      className={`font-medium cursor-pointer ${
                        s.active
                          ? 'text-emerald-700 hover:underline'
                          : 'text-slate-400 hover:underline'
                      }`}
                    >
                      {s.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {resp?.status === 'SUBMITTED' && (
                      <button
                        type="button"
                        onClick={() => onResetSubmission(s.student_id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Buka Kunci Kiriman
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
