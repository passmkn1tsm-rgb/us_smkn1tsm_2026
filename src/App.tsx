import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  deleteAdminUserSupabase,
  deleteQuestionSupabase,
  fetchExamDatabaseFromSupabase,
  pushFullDatabaseToSupabase,
  resetSubmissionSupabase,
  subscribeExamSupabase,
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
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }, [db]);

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

  const refreshFromSupabase = useCallback(async () => {
    try {
      const res = await fetchExamDatabaseFromSupabase();
      if (res.isEmpty) {
        setSupabaseStatus('empty');
        setSyncError(null);
      } else if (res.data) {
        setDb(res.data);
        setSupabaseStatus('connected');
        setSyncError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSupabaseStatus(msg.includes('Tabel database belum dibuat') ? 'needs_schema' : 'error');
      setSyncError(msg);
      throw err;
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase().catch(() => {
      // Initial check may fail cleanly if schema.sql hasn't been executed yet
    });

    const channel = subscribeExamSupabase(() => {
      fetchExamDatabaseFromSupabase()
        .then((res) => {
          if (res.data) {
            setDb(res.data);
            setSupabaseStatus('connected');
            setSyncError(null);
          }
        })
        .catch(() => {
          // Ignore realtime refresh failures when schema isn't ready
        });
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshFromSupabase]);

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

  const syncRemote = async (operation: () => Promise<void>) => {
    if (supabaseStatus !== 'connected' && supabaseStatus !== 'empty') return;
    try {
      await operation();
      setSyncError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
    }
  };

  const handlePushSeedToSupabase = async () => {
    await pushFullDatabaseToSupabase(db);
    setSupabaseStatus('connected');
    setSyncError(null);
    await refreshFromSupabase();
  };

  const handleImportSnapshot = async (snapshot: ExamDatabase) => {
    const normalized: ExamDatabase = {
      ...snapshot,
      admin_users: snapshot.admin_users || db.admin_users || INITIAL_DATABASE.admin_users
    };
    setDb(normalized);
    if (supabaseStatus === 'connected' || supabaseStatus === 'empty') {
      await pushFullDatabaseToSupabase(normalized);
      setSupabaseStatus('connected');
    }
  };

  const handleUpdateConfig = async (config: ExamConfig) => {
    setDb((prev) => ({ ...prev, config }));
    await syncRemote(() => upsertExamConfigSupabase(config));
  };

  const handleSaveQuestion = async (question: QuestionItem) => {
    setDb((prev) => ({
      ...prev,
      questions: { ...prev.questions, [question.question_id]: question }
    }));
    await syncRemote(() => upsertQuestionWithRubricsSupabase(question));
  };

  const handleBulkSaveQuestions = async (questions: QuestionItem[]) => {
    setDb((prev) => {
      const nextQ = { ...prev.questions };
      questions.forEach((q) => {
        nextQ[q.question_id] = q;
      });
      return { ...prev, questions: nextQ };
    });
    await syncRemote(() => bulkUpsertQuestionsWithRubricsSupabase(questions));
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setDb((prev) => {
      const nextQ = { ...prev.questions };
      delete nextQ[questionId];
      return { ...prev, questions: nextQ };
    });
    await syncRemote(() => deleteQuestionSupabase(questionId));
  };

  const handleSaveStudent = async (student: StudentRecord) => {
    setDb((prev) => ({
      ...prev,
      students: { ...prev.students, [student.student_id]: student }
    }));
    await syncRemote(() => upsertStudentsSupabase([student]));
  };

  const handleBulkImportStudents = async (students: StudentRecord[]) => {
    setDb((prev) => {
      const updatedMap = { ...prev.students };
      students.forEach((s) => {
        updatedMap[s.student_id] = s;
      });
      return { ...prev, students: updatedMap };
    });
    await syncRemote(() => upsertStudentsSupabase(students));
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
    await syncRemote(() => resetSubmissionSupabase(studentId, existing.exam_code));
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
    await syncRemote(() => upsertGradeSupabase(enrichedGrade));
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
    await syncRemote(() => bulkUpsertGradesSupabase(enriched));
  };

  const handleSaveAdminUser = async (user: AdminUser) => {
    setDb((prev) => ({
      ...prev,
      admin_users: { ...prev.admin_users, [user.user_id]: user }
    }));
    await syncRemote(() => upsertAdminUserSupabase(user));
  };

  const handleDeleteAdminUser = async (userId: string) => {
    setDb((prev) => {
      const nextAdmins = { ...prev.admin_users };
      delete nextAdmins[userId];
      return { ...prev, admin_users: nextAdmins };
    });
    await syncRemote(() => deleteAdminUserSupabase(userId));
  };

  const handleSaveStudentDraft = async (student: StudentRecord, answers: Record<string, string>) => {
    const payload = {
      student_id: student.student_id,
      full_name: student.full_name,
      class_name: student.class_name,
      exam_code: student.exam_code,
      status: 'IN_PROGRESS' as const,
      started_at: db.responses?.[student.student_id]?.started_at || new Date().toISOString(),
      draft_updated_at: new Date().toISOString(),
      answers
    };
    setDb((prev) => ({
      ...prev,
      responses: { ...prev.responses, [student.student_id]: payload }
    }));
    await syncRemote(() => upsertStudentAnswersSupabase(student, answers, 'IN_PROGRESS'));
  };

  const handleSubmitStudentExam = async (student: StudentRecord, answers: Record<string, string>) => {
    const payload = {
      student_id: student.student_id,
      full_name: student.full_name,
      class_name: student.class_name,
      exam_code: student.exam_code,
      status: 'SUBMITTED' as const,
      started_at: db.responses?.[student.student_id]?.started_at || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      answers
    };
    setDb((prev) => ({
      ...prev,
      responses: { ...prev.responses, [student.student_id]: payload }
    }));
    await syncRemote(() => upsertStudentAnswersSupabase(student, answers, 'SUBMITTED'));
  };

  const handleLogout = () => {
    setPreviewStudentMode(false);
    setMobileMenuOpen(false);
    setActiveTab('overview');
    setSession(null);
  };

  // Gate 1: Belum Login -> Tampilkan Gerbang Autentikasi Berbasis Peran
  if (!session) {
    return (
      <LoginPortal
        db={db}
        supabaseStatus={supabaseStatus}
        onStudentAuthenticated={(student) => {
          setPreviewStudentMode(false);
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
          {/* Zone 1: Brand */}
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

          {/* Zone 2: Center Primary Navigation Links */}
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

          {/* Zone 3: Session User & Logout / Exit Preview */}
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
                syncError={syncError}
                onRefreshFromSupabase={refreshFromSupabase}
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
