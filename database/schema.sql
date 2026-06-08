CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  full_name NVARCHAR(100) NOT NULL,
  email NVARCHAR(100) NULL,
  password_hash NVARCHAR(255) NOT NULL,
  role NVARCHAR(20) NOT NULL CHECK (role IN ('student', 'professor')),
  matriculation_number NVARCHAR(50) NULL,
  unique_code NVARCHAR(100) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE UNIQUE INDEX UX_users_email_not_null
ON users(email)
WHERE email IS NOT NULL;

CREATE TABLE subjects (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(100) NOT NULL,
  professor_id INT NULL,
  info_text NVARCHAR(MAX) NULL,
  rules_text NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_subjects_professor
    FOREIGN KEY (professor_id) REFERENCES users(id)
);

CREATE TABLE exams (
  id INT IDENTITY(1,1) PRIMARY KEY,
  subject_id INT NOT NULL,
  title NVARCHAR(150) NOT NULL,
  exam_date DATETIME2 NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT 'future'
    CHECK (status IN ('future', 'active', 'finished', 'archived')),
  bonus_points DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_by INT NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_exams_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT FK_exams_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE exam_variants (
  id INT IDENTITY(1,1) PRIMARY KEY,
  exam_id INT NOT NULL,
  variant_name NVARCHAR(50) NOT NULL,
  row_number INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_exam_variants_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id)
);

CREATE TABLE questions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  variant_id INT NOT NULL,
  question_text NVARCHAR(MAX) NOT NULL,
  question_type NVARCHAR(30) NOT NULL DEFAULT 'single_choice'
    CHECK (question_type IN ('single_choice', 'multiple_choice', 'text')),
  points DECIMAL(5,2) NOT NULL DEFAULT 1,
  image_path NVARCHAR(2048) NULL,
  image_original_name NVARCHAR(255) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_questions_variant
    FOREIGN KEY (variant_id) REFERENCES exam_variants(id)
);

CREATE TABLE answers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  question_id INT NOT NULL,
  answer_text NVARCHAR(MAX) NOT NULL,
  is_correct BIT NOT NULL DEFAULT 0,
  CONSTRAINT FK_answers_question
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE student_exam_assignments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  variant_id INT NOT NULL,
  row_number INT NULL,
  assigned_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_assignments_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_assignments_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT FK_assignments_variant
    FOREIGN KEY (variant_id) REFERENCES exam_variants(id),
  CONSTRAINT UQ_assignments_student_exam UNIQUE (student_id, exam_id)
);

CREATE TABLE student_answers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_id INT NULL,
  answer_text NVARCHAR(MAX) NULL,
  submitted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_student_answers_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_student_answers_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT FK_student_answers_question
    FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT FK_student_answers_answer
    FOREIGN KEY (answer_id) REFERENCES answers(id)
);

CREATE TABLE results (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  grade DECIMAL(4,2) NULL,
  submitted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_results_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_results_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT UQ_results_student_exam UNIQUE (student_id, exam_id)
);

CREATE TABLE student_sessions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  token_id NVARCHAR(64) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ended_at DATETIME2 NULL,
  CONSTRAINT FK_student_sessions_student
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX UX_student_sessions_active
ON student_sessions(student_id)
WHERE is_active = 1;

CREATE TABLE student_answer_drafts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_id INT NOT NULL,
  saved_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_answer_drafts_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_answer_drafts_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT FK_answer_drafts_question
    FOREIGN KEY (question_id) REFERENCES questions(id),
  CONSTRAINT FK_answer_drafts_answer
    FOREIGN KEY (answer_id) REFERENCES answers(id)
);

CREATE UNIQUE INDEX UX_student_answer_drafts
ON student_answer_drafts(student_id, exam_id, question_id, answer_id);

CREATE TABLE student_test_events (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  event_type NVARCHAR(50) NOT NULL,
  details NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_test_events_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_test_events_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id)
);

CREATE TABLE student_test_locks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  event_type NVARCHAR(50) NOT NULL,
  details NVARCHAR(500) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  released_at DATETIME2 NULL,
  released_by INT NULL,
  CONSTRAINT FK_test_locks_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT FK_test_locks_exam
    FOREIGN KEY (exam_id) REFERENCES exams(id),
  CONSTRAINT FK_test_locks_released_by
    FOREIGN KEY (released_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX UX_student_test_locks_active
ON student_test_locks(student_id, exam_id)
WHERE is_active = 1;
