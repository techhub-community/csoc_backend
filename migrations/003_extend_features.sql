-- 003_extend_features.sql
-- Missing features for Quizzes and Assignments

-- Quiz updates
ALTER TABLE quizzes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quiz_questions ADD COLUMN marks INTEGER NOT NULL DEFAULT 1;

-- Drop and recreate quiz_attempts to new shape
DROP TABLE IF EXISTS quiz_attempts;
CREATE TABLE IF NOT EXISTS quiz_attempts (
  attempt_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  submitted_at INTEGER,
  total_score  INTEGER NOT NULL DEFAULT 0,
  is_submitted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (quiz_id, user_id),
  CONSTRAINT fk_attempt_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (quiz_id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- New quiz_answers table
CREATE TABLE IF NOT EXISTS quiz_answers (
  answer_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id      INTEGER NOT NULL,
  question_id     INTEGER NOT NULL,
  selected_option TEXT,
  is_correct      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (attempt_id, question_id),
  CONSTRAINT fk_answer_attempt FOREIGN KEY (attempt_id) REFERENCES quiz_attempts (attempt_id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_question FOREIGN KEY (question_id) REFERENCES quiz_questions (question_id) ON DELETE CASCADE
);

-- Assignment updates
ALTER TABLE assignments ADD COLUMN due_date INTEGER;
ALTER TABLE assignments ADD COLUMN reference_link TEXT;
ALTER TABLE assignment_submissions ADD COLUMN grade TEXT;
ALTER TABLE assignment_submissions ADD COLUMN remarks TEXT;
