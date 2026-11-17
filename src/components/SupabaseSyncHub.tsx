import React, { useState } from 'react';
import { Copy, Check, CloudUpload, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import {
  GAS_SUPABASE_BRIDGE_GS,
  SUPABASE_CLIENT_TS,
  SUPABASE_SCHEMA_SQL
} from '../data/codeBlueprints';
import { SUPABASE_PROJECT_URL } from '../services/supabaseService';
import { ExamDatabase } from '../types/exam';

interface SupabaseSyncHubProps {
  db: ExamDatabase;
  supabaseStatus: 'connected' | 'needs_schema' | 'empty' | 'error';
  syncError: string | null;
  onRefreshFromSupabase: () => Promise<void>;
  onPushSeedToSupabase: () => Promise<void>;
  onImportJsonSnapshot: (parsed: ExamDatabase) => Promise<void>;
}

type CodeTab = 'sql' | 'gas' | 'sdk';

export const SupabaseSyncHub: React.FC<SupabaseSyncHubProps> = ({
  db,
  supabaseStatus,
  syncError,
  onRefreshFromSupabase,
  onPushSeedToSupabase,
  onImportJsonSnapshot
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('sql');
  const [copiedTab, setCopiedTab] = useState<CodeTab | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setLocalError(null);
    setActionMsg(null);
    try {
      await onRefreshFromSupabase();
      setActionMsg('Data berhasil dimuat ulang dari Supabase PostgreSQL.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setLocalError(null);
    setActionMsg(null);
    try {
      await onPushSeedToSupabase();
      setActionMsg(
        'Seluruh data ujian saat ini berhasil diunggah ke tabel exam_config, questions, rubrics, students, responses, dan grades di Supabase.'
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify(db, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supabase-backup-${db.config.exam_code}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed.examApp ? parsed.examApp : parsed;
      if (!data.config || !data.questions) {
        throw new Error('File JSON tidak sesuai struktur database ujian.');
      }
      await onImportJsonSnapshot(data as ExamDatabase);
      setActionMsg('Snapshot JSON berhasil dimuat ke workspace.');
      setLocalError(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const codeMap: Record<CodeTab, { title: string; subtitle: string; code: string }> = {
    sql: {
      title: 'schema.sql (SQL Pembuatan 6 Tabel PostgreSQL, View Nilai & Realtime)',
      subtitle:
        'Salin dan jalankan di Supabase Dashboard → SQL Editor → New Query. Skrip ini aman dijalankan ulang (idempoten).',
      code: SUPABASE_SCHEMA_SQL
    },
    gas: {
      title: 'Code-Supabase.gs (Bridge Google Apps Script → Supabase PostgREST API)',
      subtitle:
        'Salin fungsi ini ke proyek Google Apps Script Anda untuk mengganti SpreadsheetApp dengan Supabase REST API.',
      code: GAS_SUPABASE_BRIDGE_GS
    },
    sdk: {
      title: 'supabaseClient.ts (SDK Frontend @supabase/supabase-js & Realtime)',
      subtitle:
        'Contoh implementasi auto-save draf esai, submit paralel, dan langganan perubahan real-time dari browser.',
      code: SUPABASE_CLIENT_TS
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(codeMap[activeCodeTab].code);
    setCopiedTab(activeCodeTab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const statusLabel =
    supabaseStatus === 'connected'
      ? 'Sinkron dengan Supabase'
      : supabaseStatus === 'empty'
      ? 'Tabel Siap (Belum Ada Data)'
      : supabaseStatus === 'needs_schema'
      ? 'Menunggu Eksekusi schema.sql'
      : 'Gangguan Koneksi';

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Sinkronisasi Supabase PostgreSQL &amp; Kode SQL
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Aplikasi telah dikonfigurasi ke proyek Supabase Anda. Jalankan skrip{' '}
          <span className="font-mono">schema.sql</span> di SQL Editor Supabase, lalu unggah data
          awal dengan satu klik.
        </p>
      </div>

      {/* Supabase Sync Control Card */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Status Proyek Supabase</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{SUPABASE_PROJECT_URL}</p>
          </div>
          <div className="text-xs font-medium">
            <span
              className={
                supabaseStatus === 'connected'
                  ? 'text-emerald-700'
                  : supabaseStatus === 'needs_schema' || supabaseStatus === 'empty'
                  ? 'text-amber-700'
                  : 'text-red-700'
              }
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {(localError || syncError) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{localError || syncError}</div>
          </div>
        )}

        {actionMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            <Check className="h-4 w-4 shrink-0" />
            {actionMsg}
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <div className="font-semibold text-slate-900">Langkah Aktivasi Database (Sekali Saja):</div>
          <p>
            1. Klik <strong>Salin Kode</strong> pada tab <span className="font-mono">schema.sql</span>{' '}
            di bawah ini.
          </p>
          <p>
            2. Buka <strong>Supabase Dashboard → SQL Editor → New Query</strong>, tempel skrip SQL,
            lalu klik <strong>Run</strong>.
          </p>
          <p>
            3. Kembali ke halaman ini dan klik <strong>Unggah Data Saat Ini ke Supabase</strong>{' '}
            untuk mengisi tabel <span className="font-mono">exam_config</span>,{' '}
            <span className="font-mono">questions</span>, <span className="font-mono">rubrics</span>,
            dan <span className="font-mono">students</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Memuat...' : 'Muat Ulang dari Supabase'}
          </button>

          <button
            type="button"
            disabled={pushing}
            onClick={handlePush}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
          >
            <CloudUpload className="h-4 w-4" />
            {pushing ? 'Mengunggah...' : 'Unggah Data Saat Ini ke Supabase'}
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Ekspor JSON
          </button>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
            Impor JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleUploadJsonFile}
              className="sr-only"
            />
          </label>
        </div>
      </section>

      {/* Code Blueprints Tabs */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(
              [
                ['sql', 'schema.sql (Tabel PostgreSQL)'],
                ['gas', 'Apps Script Bridge (.gs)'],
                ['sdk', 'SDK Frontend (TypeScript)']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCodeTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeCodeTab === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          >
            {copiedTab === activeCodeTab ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-700" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Salin Kode
              </>
            )}
          </button>
        </div>

        <div className="p-6 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {codeMap[activeCodeTab].title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{codeMap[activeCodeTab].subtitle}</p>
          </div>

          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 max-h-[540px]">
            <code>{codeMap[activeCodeTab].code}</code>
          </pre>
        </div>
      </section>
    </div>
  );
};
