import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Plus, Search, UserPlus, X, AlertCircle } from 'lucide-react';
import { studentsService } from '../api/students.service';
import type { Student, StudentGrade, User } from '../types/scolarite';

interface StudentsDirectoryPageProps {
  currentUser: User;
}

export function StudentsDirectoryPage({ currentUser }: StudentsDirectoryPageProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected student transcript drawer
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  // Add student modal
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newMatricule, setNewMatricule] = useState('');
  const [newNom, setNewNom] = useState('');
  const [newPrenom, setNewPrenom] = useState('');
  const [newPromotion, setNewPromotion] = useState('');
  const [newContact, setNewContact] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);

  // Add grade form (Supervisor only)
  const [semester, setSemester] = useState('S5');
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [credits, setCredits] = useState('5');
  const [gradeValue, setGradeValue] = useState('14');
  const [savingGrade, setSavingGrade] = useState(false);

  async function loadStudents(query?: string) {
    setLoading(true);
    setError(null);
    try {
      const list = await studentsService.searchStudents(query !== undefined ? query : search);
      setStudents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement des étudiants.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents('');
  }, []);

  async function openTranscript(student: Student) {
    setSelectedStudent(student);
    setLoadingGrades(true);
    try {
      const res = await studentsService.getStudentGrades(student.id);
      setGrades(res.grades);
    } catch {
      setGrades([]);
    } finally {
      setLoadingGrades(false);
    }
  }

  async function handleCreateStudent(e: FormEvent) {
    e.preventDefault();
    setSavingStudent(true);
    setError(null);
    try {
      await studentsService.createStudent({
        matricule: newMatricule.trim().toUpperCase(),
        nom: newNom.trim().toUpperCase(),
        prenom: newPrenom.trim(),
        promotion: newPromotion.trim(),
        contact: newContact.trim(),
      });
      setShowAddStudent(false);
      setNewMatricule('');
      setNewNom('');
      setNewPrenom('');
      setNewPromotion('');
      setNewContact('');
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer l’étudiant.');
    } finally {
      setSavingStudent(false);
    }
  }

  async function handleAddGrade(e: FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;
    setSavingGrade(true);
    setError(null);
    try {
      await studentsService.addStudentGrade(selectedStudent.id, {
        semester: semester.trim(),
        courseCode: courseCode.trim().toUpperCase(),
        courseName: courseName.trim(),
        credits: Number(credits),
        grade: Number(gradeValue),
      });
      setCourseCode('');
      setCourseName('');
      await openTranscript(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ajouter la note.');
    } finally {
      setSavingGrade(false);
    }
  }

  const average =
    grades.length > 0
      ? (grades.reduce((sum, g) => sum + g.grade * g.credits, 0) / grades.reduce((sum, g) => sum + g.credits, 0)).toFixed(2)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">UniNotes Académique</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Étudiants &amp; Notes</h1>
          <p className="text-sm text-slate-600 mt-1">
            Base étudiante unifiée partagée entre les relevés académiques UniNotes et les prestations Scolarité.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddStudent(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#332E86] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#28246b] self-start cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          Nouvel étudiant
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadStudents();
            }}
            placeholder="Rechercher par matricule, nom, prénom ou promotion..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => loadStudents()}
          className="rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] cursor-pointer"
        >
          Rechercher
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement de l’annuaire étudiant...</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Aucun étudiant trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Matricule</th>
                  <th className="py-3 px-4">Nom &amp; Prénom</th>
                  <th className="py-3 px-4">Promotion</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-right">Dossier académique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {students.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-ref text-xs font-semibold text-[#332E86] whitespace-nowrap">
                      {st.matricule}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {st.nom} {st.prenom}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{st.promotion}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{st.contact || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openTranscript(st)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#332E86] hover:text-[#332E86] cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Notes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transcript Modal */}
      {selectedStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedStudent.nom} {selectedStudent.prenom}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Matricule : <strong className="font-mono-ref text-[#332E86]">{selectedStudent.matricule}</strong> ·{' '}
                  {selectedStudent.promotion}
                  {average && ` · Moyenne pondérée : ${average}/20`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {loadingGrades ? (
                <div className="py-8 text-center text-sm text-slate-500">Chargement des notes...</div>
              ) : grades.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  Aucune note académique enregistrée pour cet étudiant.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2 pr-3">Sem.</th>
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Matière</th>
                      <th className="py-2 px-3 text-right">Crédits</th>
                      <th className="py-2 px-3 text-right">Note / 20</th>
                      <th className="py-2 pl-3">Résultat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grades.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2 pr-3 text-xs font-semibold text-slate-600">{g.semester}</td>
                        <td className="py-2 px-3 font-mono-ref text-xs text-[#332E86]">{g.courseCode}</td>
                        <td className="py-2 px-3 text-slate-900">{g.courseName}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-600">{g.credits}</td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums text-slate-900">
                          {g.grade.toFixed(2)}
                        </td>
                        <td className="py-2 pl-3 text-xs font-medium text-emerald-700">{g.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {currentUser.role === 'SUPERVISOR' && (
                <form onSubmit={handleAddGrade} className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-[#332E86]" />
                    Saisir une note académique
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <input
                      type="text"
                      required
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                      placeholder="Sem."
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="Code UE"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs uppercase"
                    />
                    <input
                      type="text"
                      required
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="Intitulé matière"
                      className="col-span-2 sm:col-span-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      required
                      min={1}
                      max={30}
                      value={credits}
                      onChange={(e) => setCredits(e.target.value)}
                      placeholder="Crédits"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                    />
                    <input
                      type="number"
                      required
                      min={0}
                      max={20}
                      step="0.25"
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      placeholder="Note /20"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingGrade}
                      className="rounded-lg bg-[#332E86] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 cursor-pointer"
                    >
                      {savingGrade ? 'Ajout...' : 'Ajouter la note'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Student Modal */}
      {showAddStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCreateStudent} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Ajouter un étudiant</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="add-stu-mat">
                Matricule *
              </label>
              <input
                id="add-stu-mat"
                type="text"
                required
                value={newMatricule}
                onChange={(e) => setNewMatricule(e.target.value)}
                placeholder="Ex. 2025-INF-042"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-mono-ref uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="add-stu-nom">
                  Nom *
                </label>
                <input
                  id="add-stu-nom"
                  type="text"
                  required
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="add-stu-prenom">
                  Prénom *
                </label>
                <input
                  id="add-stu-prenom"
                  type="text"
                  required
                  value={newPrenom}
                  onChange={(e) => setNewPrenom(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="add-stu-promo">
                Promotion *
              </label>
              <input
                id="add-stu-promo"
                type="text"
                required
                value={newPromotion}
                onChange={(e) => setNewPromotion(e.target.value)}
                placeholder="Ex. L2 Informatique"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="add-stu-contact">
                Contact (optionnel)
              </label>
              <input
                id="add-stu-contact"
                type="text"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="Téléphone ou email"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddStudent(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingStudent}
                className="rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 cursor-pointer"
              >
                {savingStudent ? 'Création...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
