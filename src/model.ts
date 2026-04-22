import { Generated } from 'kysely';

interface UserTable {
  id: Generated<number>;
  name: string;
  usn: string;
  mobile: string;
  program: string;
  password: string;
  email: string;
  about?: string;
  props?: string;
  verified: boolean;
  role?: string; // 'mentor' | 'mentee' — defaults to 'mentee' in DB
}

interface MessageTable {
  id: Generated<number>;
  name: string;
  email?: string;
  subject?: string;
  message?: string;
}

interface TeamTable {
  team_id: Generated<number>;
  team_type: string;
  leader_id: number;
  member1_id?: number;
  member2_id?: number;
  filled?: boolean;
}

interface RequestTable {
  request_id: Generated<number>;
  receiver_id: number;
  sender_id: number;
}

// ─── Quiz Tables ─────────────────────────────────────────────────────────────

interface QuizTable {
  quiz_id: Generated<number>;
  title: string;
  domain: string;       // web | app | dsa | aiml | uiux
  created_by: number;   // FK → users.id
  created_at: Generated<number>;
  is_active: Generated<number>; // 0 or 1
}

interface QuizQuestionTable {
  question_id: Generated<number>;
  quiz_id: number;      // FK → quizzes.quiz_id (CASCADE DELETE)
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string; // 'a' | 'b' | 'c' | 'd'
  marks: Generated<number>;
}

interface QuizAttemptTable {
  attempt_id: Generated<number>;
  quiz_id: number;      // FK → quizzes.quiz_id
  user_id: number;      // FK → users.id
  started_at: Generated<number>;
  submitted_at?: number;
  total_score: Generated<number>;
  is_submitted: Generated<number>; // 0 or 1
}

interface QuizAnswerTable {
  answer_id: Generated<number>;
  attempt_id: number;
  question_id: number;
  selected_option?: string;
  is_correct: Generated<number>; // 0 or 1
}

// ─── Assignment Tables ────────────────────────────────────────────────────────

interface AssignmentTable {
  assignment_id: Generated<number>;
  title: string;
  description: string;
  domain: string;       // web | app | dsa | aiml | uiux
  created_by: number;   // FK → users.id
  created_at: Generated<number>;
  due_date?: number;
  reference_link?: string;
}

interface AssignmentSubmissionTable {
  submission_id: Generated<number>;
  assignment_id: number; // FK → assignments.assignment_id
  user_id: number;       // FK → users.id
  github_link?: string;
  text_answer?: string;
  submitted_at: Generated<number>;
  grade?: string;
  remarks?: string;
}

export interface Database {
  messages: MessageTable;
  requests: RequestTable;
  teams: TeamTable;
  users: UserTable;
  // Quiz feature
  quizzes: QuizTable;
  quiz_questions: QuizQuestionTable;
  quiz_attempts: QuizAttemptTable;
  quiz_answers: QuizAnswerTable;
  // Assignment feature
  assignments: AssignmentTable;
  assignment_submissions: AssignmentSubmissionTable;
}
