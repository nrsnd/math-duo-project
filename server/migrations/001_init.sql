CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  total_xp INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_activity_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problems (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mcq','input')),
  prompt TEXT NOT NULL,
  answer_text TEXT NULL,
  explanation_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_options (
  id SERIAL PRIMARY KEY,
  problem_id INT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS one_correct_mcq ON problem_options(problem_id) WHERE is_correct;

CREATE TABLE IF NOT EXISTS user_progress (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  correct_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  solved_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers JSONB NOT NULL,
  result JSONB NOT NULL,
  xp_awarded INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, lesson_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS practice_submissions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers JSONB NOT NULL,
  result JSONB NOT NULL,
  xp_awarded INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_lessons_order ON lessons(order_index, id);
CREATE INDEX IF NOT EXISTS idx_options_problem ON problem_options(problem_id);
CREATE INDEX IF NOT EXISTS idx_problems_lesson ON problems(lesson_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id, lesson_id);
