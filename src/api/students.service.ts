import type { Student, StudentGrade } from '../types/scolarite';
import { apiClient } from './client';

export interface CreateStudentPayload {
  matricule: string;
  nom: string;
  prenom: string;
  promotion: string;
  contact?: string;
}

export interface CreateGradePayload {
  semester: string;
  courseCode: string;
  courseName: string;
  credits: number;
  grade: number;
}

export const studentsService = {
  async searchStudents(q?: string): Promise<Student[]> {
    const res = await apiClient.get<{ students: Student[] }>('/students', { q });
    return res.students;
  },

  async getStudentByMatricule(matricule: string): Promise<Student> {
    const res = await apiClient.get<{ student: Student }>(
      `/students/by-matricule/${encodeURIComponent(matricule.trim())}`
    );
    return res.student;
  },

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
    const res = await apiClient.post<{ student: Student }>('/students', payload);
    return res.student;
  },

  async getStudentGrades(studentId: string): Promise<{ student: Student; grades: StudentGrade[] }> {
    return apiClient.get<{ student: Student; grades: StudentGrade[] }>(
      `/students/${encodeURIComponent(studentId)}/grades`
    );
  },

  async addStudentGrade(studentId: string, payload: CreateGradePayload): Promise<StudentGrade> {
    const res = await apiClient.post<{ grade: StudentGrade }>(
      `/students/${encodeURIComponent(studentId)}/grades`,
      payload
    );
    return res.grade;
  },
};
