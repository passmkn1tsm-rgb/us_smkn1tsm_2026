import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  CheckSquare,
  BarChart3,
  Shield,
  Database as DatabaseIcon,
  GraduationCap,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { INITIAL_DATABASE } from './data/seedDatabase';
import {
  AdminRole,
  AdminUser,
  AuthSession,
  ExamConfig,
  ExamDatabase,
  QuestionGrade,
  QuestionItem,
  StudentRecord
} from './types/exam';
import {
  bulkUpsertGradesSupabase,
  bulkUpsertQuestionsWithRubricsSupabase,
  checkHardenedSecurityActive,
  deleteAdminUserSupabase,
  deleteQuestionSupabase,
  fetchExamDatabaseFromSupabase,
  fetchStudentExamScopeFromSupabase,
  isSessionExpiredError,
  pushFullDatabaseToSupabase,
  resetSubmissionSupabase,
  subscribeExamSupabase,
  subscribeStudentConfigSupabase,
  supabase,
  upsertAdminUserSupabase,
  upsertExamConfigSupabase,
  upsertGradeSupabase,
  upsertQuestionWithRubricsSupabase,
  upsertStudentAnswersSupabase,
  upsertStudentsSupabase
} from './services/supabaseService';
import { LoginPortal } from './components/LoginPortal';
import { OverviewAndAudit } from './components/OverviewAndAudit';
import { QuestionsManager } from './components/QuestionsManager';
import { StudentsManager } from './components/StudentsManager';
import { GradingWorkspace } from './components/GradingWorkspace';
import { ResultsAndAnalysis } from './components/ResultsAndAnalysis';
import { AccessControlManager } from './components/AccessControlManager';
import { SupabaseSyncHub } from './components/SupabaseSyncHub';
import { StudentExamPortal } from './components/StudentExamPortal';

type AdminTab =
  | 'overview'
  | 'questions'
  | 'students'
  | 'grading'
  | 'results'
  | 'access'
  | 'supabase';

const LOCAL_STORAGE_KEY = 'ujian_sekolah_xii_supabase_mirror_v1';
const SESSION_STORAGE_KEY = 'ujian_sekolah_xii_session_v1';

const ROLE_TAB_ALLOWLIST: Record<AdminRole, AdminTab[]> = {
  super_admin: ['overview', 'questions', 'students', 'grading', 'results', 'access', 'supabase'],
  teacher: ['overview', 'questions', 'students', 'grading', 'results'],
  proctor: ['overview', 'students']
};

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  teacher: 'Guru Mapel',
  proctor: 'Pengawas Ruang'
};

export default function App() {
  const [db, setDb] = useState<ExamDatabase>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<ExamDatabase>;
        return {
          ...INITIAL_DATABASE,
          ...parsed,
          config: parsed.config || INITIAL_DATABASE.config,
          admin_users: parsed.admin_users || INITIAL_DATABASE.admin_users,
          questions: parsed.questions || INITIAL_DATABASE.questions,
          students: parsed.students || INITIAL_DATABASE.students,
          responses: parsed.responses || INITIAL_DATABASE.responses,
          grades: parsed.grades || INITIAL_DATABASE.grades
        };
      }
    } catch {
      // Fallback to seed database
    }
    return INITIAL_DATABASE;
  });

  const [session, setSession] = useState<AuthSession>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as AuthSession;
      }
    } catch {
      // Ignore invalid session cache
    }
    return null;
  });

  const [previewStudentMode, setPreviewStudentMode] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [supabaseStatus, setSupabaseStatus] = useState<
    'connected' | 'needs_schema' | 'empty' | 'error'
  >('needs_schema');
  const [hardenedRpcActive, setHardenedRpcActive] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const adminRefreshTimerRef = useRef<number | null>(null);

  const adminToken = session?.kind === 'admin' ? session.admin.session_token : undefined;

  useEffect(() => {
    // Jangan menimpa cache mirror penuh bila sedang login sebagai siswa (isolasi data)
    if (session?.kind === 'student') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }, [db, session?.kind]);

  useEffect(() => {
    try {
      if (session) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, [session]);

  const refreshFromSupabase = useCallback(
    async (tokenOverride?: string) => {
      const tokenToUse = tokenOverride ?? adminToken;
      try {
        const res = await fetchExamDatabaseFromSupabase(tokenToUse);
        setHardenedRpcActive(res.hardenedRpcActive);
        if (res.isEmpty) {
          setSupabaseStatus('empty');
          setSyncError(null);
        } else if (res.data) {
          setDb(res.data);
          setSupabaseStatus('connected');
          setSyncError(null);
        }
      } catch (err) {
        if (isSessionExpiredError(err)) {
          setPreviewStudentMode(false);
          setMobileMenuOpen(false);
          setActiveTab('overview');
          setSession(null);
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setSupabaseStatus(msg.includes('Tabel database belum dibuat') ? 'needs_schema' : 'error');
        setSyncError(msg);
        throw err;
      }
    },
    [adminToken]
  );

  // Scoped Data & Realtime Subscription berdasarkan peran sesi aktif
  useEffect(() => {
    // 1. Belum login: cek cepat exam_config (1 baris saja) agar halaman login langsung siap tanpa mengunduh seluruh database
    if (!session) {
      let active = true;
      supabase
        .from('exam_config')
        .select('*')
        .limit(1)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            const msg = error.message || String(error);
            setSupabaseStatus(
              msg.includes('table') || msg.includes('42P01') || msg.includes('PGRST205')
                ? 'needs_schema'
                : 'error'
            );
            return;
          }
          checkHardenedSecurityActive().then((hardened) => {
            if (active) setHardenedRpcActive(hardened);
          });
          if (!data || data.length === 0) {
            setSupabaseStatus('empty');
            return;
          }
          const cfgRow = data[0];
          setSupabaseStatus('connected');
          setDb((prev) => ({
            ...prev,
            config: {
              exam_code: String(cfgRow.exam_code),
              school_name: String(cfgRow.school_name),
              exam_title: String(cfgRow.exam_title),
              duration_minutes: Number(cfgRow.duration_minutes || 120),
              max_score: Number(cfgRow.max_score || 100),
              exam_open: Boolean(cfgRow.exam_open),
              strict_focus:
                cfgRow.strict_focus !== undefined ? Boolean(cfgRow.strict_focus) : true,
              block_copy_paste:
                cfgRow.block_copy_paste !== undefined ? Boolean(cfgRow.block_copy_paste) : false,
              instructions: String(cfgRow.instructions || '')
            }
          }));
        });
      return () => {
        active = false;
      };
    }

    // 2. Sesi Siswa: Hanya tarik soal aktif (tanpa kunci jawaban) + jawaban dirinya sendiri via RPC tervalidasi,
    // serta hanya langganan Realtime pada tabel exam_config.
    if (session.kind === 'student') {
      const st = session.student;
      fetchStudentExamScopeFromSupabase(st)
        .then((scope) => {
          setSupabaseStatus('connected');
          setDb((prev) => ({
            ...prev,
            config: scope.config || prev.config,
            questions:
              Object.keys(scope.questions).length > 0 ? scope.questions : prev.questions,
            responses: scope.myResponse
              ? { [st.student_id]: scope.myResponse }
              : prev.responses[st.student_id]
              ? { [st.student_id]: prev.responses[st.student_id] }
              : {},
            students: { [st.student_id]: st },
            grades: {},
            admin_users: {}
          }));
        })
        .catch(() => {
          // Tetap izinkan fallback soal lokal bila schema belum disiapkan
        });

      const studentChannel = subscribeStudentConfigSupabase(st.exam_code, (nextCfg) => {
        setDb((prev) => ({ ...prev, config: nextCfg }));
      });

      return () => {
        supabase.removeChannel(studentChannel);
      };
    }

    // 3. Sesi Admin/Guru/Pengawas: Muat konsol lengkap dengan throttle 4 detik pada event Realtime
    const activeToken = session.admin.session_token;
    refreshFromSupabase(activeToken).catch(() => {
      // Ignore initial schema error cleanly
    });

    const adminChannel = subscribeExamSupabase(() => {
      if (adminRefreshTimerRef.current) return;
      adminRefreshTimerRef.current = window.setTimeout(() => {
        adminRefreshTimerRef.current = null;
        fetchExamDatabaseFromSupabase(activeToken)
          .then((res) => {
            setHardenedRpcActive(res.hardenedRpcActive);
            if (res.data) {
              setDb(res.data);
              setSupabaseStatus('connected');
              setSyncError(null);
            }
          })
          .catch((err) => {
            if (isSessionExpiredError(err)) {
              setSession(null);
            }
          });
      }, 4000);
    });

    return () => {
      if (adminRefreshTimerRef.current) {
        window.clearTimeout(adminRefreshTimerRef.current);
        adminRefreshTimerRef.current = null;
      }
      supabase.removeChannel(adminChannel);
    };
  }, [
    session?.kind,
    session?.kind === 'student' ? session.student.student_id : '',
    session?.kind === 'admin' ? session.admin.session_token : '',
    refreshFromSupabase
  ]);

  const currentAdminRole: AdminRole | null =
    session?.kind === 'admin' ? session.admin.role : null;

  const allowedTabs = useMemo<AdminTab[]>(() => {
    if (!currentAdminRole) return [];
    return ROLE_TAB_ALLOWLIST[currentAdminRole];
  }, [currentAdminRole]);

  useEffect(() => {
    if (currentAdminRole && !allowedTabs.includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [currentAdminRole, allowedTabs, activeTab]);

  const syncRemote = async (operation: () => Promise<void>, propagateError = false) => {
    if (supabaseStatus !== 'connected' && supabaseStatus !== 'empty') return;
    try {
      await operation();
      setSyncError(null);
    } catch (err) {
      if (isSessionExpiredError(err)) {
        setSession(null);
      }
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
      if (propagateError) throw err;
    }
  };

  const handlePushSeedToSupabase = async () => {
    await pushFullDatabaseToSupabase(db, adminToken);
    setSupabaseStatus('connected');
    setSyncError(null);
    await refreshFromSupabase(adminToken);
  };

  const handleImportSnapshot = async (snapshot: ExamDatabase) => {
    const normalized: ExamDatabase = {
      ...snapshot,
      admin_users: snapshot.admin_users || db.admin_users || INITIAL_DATABASE.admin_users
    };
    setDb(normalized);
    if (supabaseStatus === 'connected' || supabaseStatus === 'empty') {
      await pushFullDatabaseToSupabase(normalized, adminToken);
      setSupabaseStatus('connected');
    }
  };

  const handleUpdateConfig = async (config: ExamConfig) => {
    setDb((prev) => ({ ...prev, config }));
    await syncRemote(() => upsertExamConfigSupabase(config, adminToken));
  };

  const handleSaveQuestion = async (question: QuestionItem) => {
    setDb((prev) => ({
      ...prev,
      questions: { ...prev.questions, [question.question_id]: question }
    }));
    await syncRemote(() => upsertQuestionWithRubricsSupabase(question, adminToken));
  };

  const handleBulkSaveQuestions = async (questions: QuestionItem[]) => {
    setDb((prev) => {
      const nextQ = { ...prev.questions };
      questions.forEach((q) => {
        nextQ[q.question_id] = q;
      });
      return { ...prev, questions: nextQ };
    });
    await syncRemote(() => bulkUpsertQuestionsWithRubricsSupabase(questions, adminToken));
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setDb((prev) => {
      const nextQ = { ...prev.questions };
      delete nextQ[questionId];
      return { ...prev, questions: nextQ };
    });
    await syncRemote(() => deleteQuestionSupabase(questionId, adminToken));
  };

  const handleSaveStudent = async (student: StudentRecord) => {
    setDb((prev) => ({
      ...prev,
      students: { ...prev.students, [student.student_id]: student }
    }));
    await syncRemote(() => upsertStudentsSupabase([student], adminToken));
  };

  const handleBulkImportStudents = async (students: StudentRecord[]) => {
    setDb((prev) => {
      const updatedMap = { ...prev.students };
      students.forEach((s) => {
        updatedMap[s.student_id] = s;
      });
      return { ...prev, students: updatedMap };
    });
    await syncRemote(() => upsertStudentsSupabase(students, adminToken));
  };

  const handleResetSubmission = async (studentId: string) => {
    const existing = db.responses?.[studentId];
    if (!existing) return;
    const reopened = {
      ...existing,
      status: 'IN_PROGRESS' as const
    };
    setDb((prev) => ({
      ...prev,
      responses: { ...prev.responses, [studentId]: reopened }
    }));
    await syncRemote(() => resetSubmissionSupabase(studentId, existing.exam_code, adminToken));
  };

  const handleSaveGrade = async (grade: QuestionGrade) => {
    const enrichedGrade: QuestionGrade =
      session?.kind === 'admin'
        ? { ...grade, grader_email: session.admin.email }
        : grade;
    setDb((prev) => ({
      ...prev,
      grades: {
        ...prev.grades,
        [enrichedGrade.student_id]: {
          ...(prev.grades?.[enrichedGrade.student_id] || {}),
          [enrichedGrade.question_id]: enrichedGrade
        }
      }
    }));
    await syncRemote(() => upsertGradeSupabase(enrichedGrade, adminToken));
  };

  const handleBulkSaveGrades = async (grades: QuestionGrade[]) => {
    const graderEmail = session?.kind === 'admin' ? session.admin.email : undefined;
    const enriched = graderEmail ? grades.map((g) => ({ ...g, grader_email: graderEmail })) : grades;
    setDb((prev) => {
      const nextGrades = { ...prev.grades };
      enriched.forEach((g) => {
        nextGrades[g.student_id] = {
          ...(nextGrades[g.student_id] || {}),
          [g.question_id]: g
        };
      });
      return { ...prev, grades: nextGrades };
    });
    await syncRemote(() => bulkUpsertGradesSupabase(enriched, adminToken));
  };

  const handleSaveAdminUser = async (user: AdminUser) => {
    setDb((prev) => ({
      ...prev,
      admin_users: { ...prev.admin_users, [user.user_id]: user }
    }));
    await syncRemote(() => upsertAdminUserSupabase(user, adminToken));
  };

  const handleDeleteAdminUser = async (userId: string) => {
    setDb((prev) => {
      const nextAdmins = { ...prev.admin_users };
      delete nextAdmins[userId];
      return { ...prev, admin_users: nextAdmins };
    });
    await syncRemote(() => deleteAdminUserSupabase(userId, adminToken));
  };

  // Simpan hanya butir soal yang berubah (dirty-only save) + catatan fokus + propagasi error untuk offline queue
  const handleSaveStudentDraft = async (
    student: StudentRecord,
    changedAnswers: Record<string, string>,
    focusViolations: number
  ) => {
    const existingResp = db.responses?.[student.student_id];
    const mergedAnswers = {
      ...(existingResp?.answers || {}),
      ...changedAnswers
    };
    const payload = {
      student_id: student.student_id,
      full_name: student.full_name,
      class_name: student.class_name,
      exam_code: student.exam_code,
      status: 'IN_PROGRESS' as const,
      started_at: existingResp?.started_at || new Date().toISOString(),
      draft_updated_at: new Date().toISOString(),
      focus_violations: Math.max(existingResp?.focus_violations || 0, focusViolations),
      answers: mergedAnswers
    };
    setDb((prev) => ({
      ...prev,
      responses: { ...prev.responses, [student.student_id]: payload }
    }));
    await syncRemote(
      () => upsertStudentAnswersSupabase(student, changedAnswers, 'IN_PROGRESS', focusViolations),
      true
    );
  };

  const handleSubmitStudentExam = async (
    student: StudentRecord,
    answers: Record<string, string>,
    focusViolations: number
  ) => {
    const existingResp = db.responses?.[student.student_id];
    const payload = {
      student_id: student.student_id,
      full_name: student.full_name,
      class_name: student.class_name,
      exam_code: student.exam_code,
      status: 'SUBMITTED' as const,
      started_at: existingResp?.started_at || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      focus_violations: Math.max(existingResp?.focus_violations || 0, focusViolations),
      answers
    };
    setDb((prev) => ({
      ...prev,
      responses: { ...prev.responses, [student.student_id]: payload }
    }));
    await syncRemote(() =>
      upsertStudentAnswersSupabase(student, answers, 'SUBMITTED', focusViolations)
    );
  };

  const handleLogout = () => {
    setPreviewStudentMode(false);
    setMobileMenuOpen(false);
    setActiveTab('overview');
    setSession(null);
  };

  // Gate 1: Belum Login -> Tampilkan Gerbang Autentikasi (Siswa di /, Pengelola di ?portal=pengelola)
  if (!session) {
    return (
      <LoginPortal
        db={db}
        supabaseStatus={supabaseStatus}
        onStudentAuthenticated={(student, remoteConfig) => {
          setPreviewStudentMode(false);
          if (remoteConfig) {
            setDb((prev) => ({ ...prev, config: remoteConfig }));
          }
          setSession({ kind: 'student', student });
        }}
        onAdminAuthenticated={(admin) => {
          setPreviewStudentMode(false);
          setActiveTab('overview');
          setSession({ kind: 'admin', admin });
        }}
      />
    );
  }

  // Gate 2: Sesi Peserta (Siswa) -> Portal Ujian Murni Tanpa Akses Admin
  if (session.kind === 'student') {
    const liveStudent = db.students?.[session.student.student_id] || session.student;
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-6">
            <span className="font-semibold text-base tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Ujian Sekolah XII
            </span>

            <div className="hidden md:block text-sm text-slate-600 whitespace-nowrap truncate">
              Portal Peserta · {db.config.exam_title} ({db.config.exam_code})
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline text-xs font-medium text-slate-600 whitespace-nowrap">
                {liveStudent.full_name} · {liveStudent.class_name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Keluar
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <StudentExamPortal
            db={db}
            initialStudent={liveStudent}
            onSaveDraft={handleSaveStudentDraft}
            onSubmitExam={handleSubmitStudentExam}
            onLogout={handleLogout}
          />
        </main>
      </div>
    );
  }

  // Gate 3: Sesi Pengelola (Super Admin / Guru Mapel / Pengawas Ruang)
  const admin = session.admin;
  const canPreviewStudent = admin.role === 'super_admin' || admin.role === 'teacher';

  const allNavItems: Array<{ id: AdminTab; label: string; shortLabel: string; icon: React.ReactNode }> = [
    {
      id: 'overview',
      label: 'Ringkasan & Audit',
      shortLabel: 'Ringkasan',
      icon: <LayoutDashboard className="h-4 w-4" />
    },
    {
      id: 'questions',
      label: 'Bank Soal & Rubrik',
      shortLabel: 'Soal & Rubrik',
      icon: <FileText className="h-4 w-4" />
    },
    {
      id: 'students',
      label: 'Daftar Peserta',
      shortLabel: 'Peserta',
      icon: <Users className="h-4 w-4" />
    },
    {
      id: 'grading',
      label: 'Koreksi Jawaban',
      shortLabel: 'Koreksi',
      icon: <CheckSquare className="h-4 w-4" />
    },
    {
      id: 'results',
      label: 'Rekap & Analisis',
      shortLabel: 'Analisis',
      icon: <BarChart3 className="h-4 w-4" />
    },
    {
      id: 'access',
      label: 'Hak Akses & Akun',
      shortLabel: 'Hak Akses',
      icon: <Shield className="h-4 w-4" />
    },
    {
      id: 'supabase',
      label: 'Supabase & Kode SQL',
      shortLabel: 'Supabase SQL',
      icon: <DatabaseIcon className="h-4 w-4" />
    }
  ];

  const visibleNavItems = allNavItems.filter((item) => allowedTabs.includes(item.id));
  const currentTabTitle = visibleNavItems.find((n) => n.id === activeTab)?.label || 'Ringkasan';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3 shrink-0">
            {!previewStudentMode && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Buka menu navigasi"
                className="lg:hidden rounded-md p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
            <span className="font-semibold text-base tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Ujian Sekolah XII
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            {previewStudentMode ? (
              <span className="text-sm text-slate-600 whitespace-nowrap">
                Mode Pratinjau Portal Peserta · {db.config.exam_code}
              </span>
            ) : (
              visibleNavItems.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`whitespace-nowrap shrink-0 cursor-pointer py-1 transition-colors ${
                    activeTab === item.id
                      ? 'text-emerald-900 border-b-2 border-emerald-900'
                      : 'hover:text-slate-900'
                  }`}
                >
                  {item.shortLabel}
                </button>
              ))
            )}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-medium text-slate-600 whitespace-nowrap">
              {admin.full_name} · {ROLE_LABELS[admin.role]}
            </span>

            {previewStudentMode ? (
              <button
                type="button"
                onClick={() => setPreviewStudentMode(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Kembali ke Konsol
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Keluar
              </button>
            )}
          </div>
        </div>
      </header>

      {previewStudentMode && canPreviewStudent ? (
        <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <StudentExamPortal
            db={db}
            onSaveDraft={handleSaveStudentDraft}
            onSubmitExam={handleSubmitStudentExam}
            onLogout={() => setPreviewStudentMode(false)}
          />
        </main>
      ) : (
        <div className="mx-auto flex max-w-[1440px]">
          <aside
            className={`no-print ${
              mobileMenuOpen ? 'block fixed inset-y-14 left-0 z-20 w-64 shadow-lg' : 'hidden'
            } lg:block lg:w-64 lg:shrink-0 border-r border-slate-200 bg-white min-h-[calc(100vh-3.5rem)]`}
          >
            <div className="p-4 flex flex-col justify-between h-full gap-6">
              <div className="space-y-1">
                <div className="px-3 py-2 text-xs font-medium text-slate-500">
                  {ROLE_LABELS[admin.role]} ·{' '}
                  {supabaseStatus === 'connected' ? 'Supabase Aktif' : 'Lokal / Siap Migrasi'}
                </div>
                {visibleNavItems.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-900'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {canPreviewStudent && (
                <div className="border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewStudentMode(true);
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <GraduationCap className="h-4 w-4 text-emerald-800" />
                    Pratinjau Ujian Siswa
                  </button>
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-8">
            <div className="no-print mb-4 text-xs text-slate-500">
              {ROLE_LABELS[admin.role]} /{' '}
              <span className="font-medium text-slate-800">{currentTabTitle}</span>
            </div>

            {activeTab === 'overview' && (
              <OverviewAndAudit
                db={db}
                adminRole={admin.role}
                onUpdateConfig={handleUpdateConfig}
                onNavigate={(tab) => {
                  if (allowedTabs.includes(tab)) {
                    setActiveTab(tab);
                  }
                }}
              />
            )}
            {activeTab === 'questions' && allowedTabs.includes('questions') && (
              <QuestionsManager
                db={db}
                onSaveQuestion={handleSaveQuestion}
                onBulkSaveQuestions={handleBulkSaveQuestions}
                onDeleteQuestion={handleDeleteQuestion}
              />
            )}
            {activeTab === 'students' && allowedTabs.includes('students') && (
              <StudentsManager
                db={db}
                onSaveStudent={handleSaveStudent}
                onBulkImportStudents={handleBulkImportStudents}
                onResetSubmission={handleResetSubmission}
              />
            )}
            {activeTab === 'grading' && allowedTabs.includes('grading') && (
              <GradingWorkspace
                db={db}
                onSaveGrade={handleSaveGrade}
                onBulkSaveGrades={handleBulkSaveGrades}
              />
            )}
            {activeTab === 'results' && allowedTabs.includes('results') && (
              <ResultsAndAnalysis db={db} />
            )}
            {activeTab === 'access' && allowedTabs.includes('access') && (
              <AccessControlManager
                db={db}
                currentAdminEmail={admin.email}
                onSaveAdminUser={handleSaveAdminUser}
                onDeleteAdminUser={handleDeleteAdminUser}
              />
            )}
            {activeTab === 'supabase' && allowedTabs.includes('supabase') && (
              <SupabaseSyncHub
                db={db}
                supabaseStatus={supabaseStatus}
                hardenedRpcActive={hardenedRpcActive}
                syncError={syncError}
                onRefreshFromSupabase={() => refreshFromSupabase(adminToken)}
                onPushSeedToSupabase={handlePushSeedToSupabase}
                onImportJsonSnapshot={handleImportSnapshot}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
