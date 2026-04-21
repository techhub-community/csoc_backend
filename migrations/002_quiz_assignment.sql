-- 002_quiz_assignment.sql
-- Migration to add role to users and create Quiz & Assignment feature tables.

-- Add role column to existing users table (mentor | mentee, defaults to mentee)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'mentee';

-- ─── Quizzes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quizzes (
  quiz_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  domain     TEXT    NOT NULL,  -- web | app | dsa | aiml | uiux
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT fk_quiz_creator
    FOREIGN KEY (created_by)
      REFERENCES users (id)
      ON DELETE CASCADE
);

-- ─── Quiz Questions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_questions (
  question_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id        INTEGER NOT NULL,
  question_text  TEXT    NOT NULL,
  option_a       TEXT    NOT NULL,
  option_b       TEXT    NOT NULL,
  option_c       TEXT    NOT NULL,
  option_d       TEXT    NOT NULL,
  correct_option TEXT    NOT NULL,  -- 'a' | 'b' | 'c' | 'd'
  CONSTRAINT fk_question_quiz
    FOREIGN KEY (quiz_id)
      REFERENCES quizzes (quiz_id)
      ON DELETE CASCADE
);

-- ─── Quiz Attempts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_attempts (
  attempt_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  score        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  answers      TEXT    NOT NULL,  -- JSON: { question_id: chosen_option }
  attempted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (quiz_id, user_id),      -- prevents re-attempting
  CONSTRAINT fk_attempt_quiz
    FOREIGN KEY (quiz_id)
      REFERENCES quizzes (quiz_id)
      ON DELETE CASCADE,
  CONSTRAINT fk_attempt_user
    FOREIGN KEY (user_id)
      REFERENCES users (id)
      ON DELETE CASCADE
);

-- ─── Assignments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL,
  domain        TEXT    NOT NULL,  -- web | app | dsa | aiml | uiux
  created_by    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  CONSTRAINT fk_assignment_creator
    FOREIGN KEY (created_by)
      REFERENCES users (id)
      ON DELETE CASCADE
);

-- ─── Assignment Submissions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignment_submissions (
  submission_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id  INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  github_link    TEXT,             -- nullable
  text_answer    TEXT,             -- nullable
  submitted_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (assignment_id, user_id), -- one submission per user per assignment
  CONSTRAINT fk_submission_assignment
    FOREIGN KEY (assignment_id)
      REFERENCES assignments (assignment_id)
      ON DELETE CASCADE,
  CONSTRAINT fk_submission_user
    FOREIGN KEY (user_id)
      REFERENCES users (id)
      ON DELETE CASCADE
);
