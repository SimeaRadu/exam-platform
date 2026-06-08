require("dotenv").config();

/*
----------------------------
   Configurare conexiune SQL
----------------------------
*/
// Aici se aleg datele de conectare la SQL Server, inclusiv autentificarea Windows sau cu user/parola.
const useWindowsAuth = process.env.DB_AUTH === "windows";
const sql = useWindowsAuth ? require("mssql/msnodesqlv8") : require("mssql");

const poolConfig = {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
};

const commonConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 60000),
  requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT_MS || 60000),
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
  pool: poolConfig,
};

const dbConfig = useWindowsAuth
  ? {
      connectionString: [
        `Driver={${process.env.DB_DRIVER || "ODBC Driver 17 for SQL Server"}}`,
        `Server=${process.env.DB_SERVER}`,
        `Database=${process.env.DB_DATABASE}`,
        "Trusted_Connection=Yes",
        "TrustServerCertificate=Yes",
      ].join(";"),
      driver: "msnodesqlv8",
      pool: poolConfig,
    }
  : {
      ...commonConfig,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

let poolPromise;
let schemaPromise;

/*
----------------------------
       Conectare la baza
----------------------------
*/
// Pastreaza o singura conexiune reutilizabila, ca fiecare ruta sa nu deschida alta conexiune inutil.
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }

  return poolPromise;
}

/*
----------------------------
      Pregatire schema SQL
----------------------------
*/
// Verifica si creeaza automat tabelele/coloanele necesare pentru rularea locala a aplicatiei.
async function ensureSchema() {
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const pool = await getPool();

    await pool.request().query(`
      IF OBJECT_ID('users', 'U') IS NULL
      BEGIN
        CREATE TABLE users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          full_name NVARCHAR(100) NOT NULL,
          email NVARCHAR(100) NULL,
          password_hash NVARCHAR(255) NOT NULL,
          role NVARCHAR(20) NOT NULL CHECK (role IN ('student', 'professor')),
          matriculation_number NVARCHAR(50) NULL,
          unique_code NVARCHAR(100) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        )
      END
    `);

    await pool.request().query(`
      DECLARE @dropEmailSql NVARCHAR(MAX) = N'';

      SELECT @dropEmailSql = @dropEmailSql +
        CASE
          WHEN kc.name IS NOT NULL THEN
            N'ALTER TABLE users DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';'
          ELSE
            N'DROP INDEX ' + QUOTENAME(i.name) + N' ON users;'
        END
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      LEFT JOIN sys.key_constraints kc
        ON kc.parent_object_id = i.object_id
       AND kc.unique_index_id = i.index_id
      WHERE i.object_id = OBJECT_ID('users')
        AND i.is_unique = 1
        AND c.name = 'email';

      IF @dropEmailSql <> N''
      BEGIN
        EXEC sp_executesql @dropEmailSql
      END
    `);

    await pool.request().query(`
      DECLARE @dropMatriculationSql NVARCHAR(MAX) = N'';

      SELECT @dropMatriculationSql = @dropMatriculationSql +
        CASE
          WHEN kc.name IS NOT NULL THEN
            N'ALTER TABLE users DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';'
          ELSE
            N'DROP INDEX ' + QUOTENAME(i.name) + N' ON users;'
        END
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      LEFT JOIN sys.key_constraints kc
        ON kc.parent_object_id = i.object_id
       AND kc.unique_index_id = i.index_id
      WHERE i.object_id = OBJECT_ID('users')
        AND i.is_unique = 1
        AND c.name = 'matriculation_number';

      IF @dropMatriculationSql <> N''
      BEGIN
        EXEC sp_executesql @dropMatriculationSql
      END
    `);

    await pool.request().query(`
      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        WHERE t.name = 'users'
          AND c.name = 'email'
          AND c.is_nullable = 0
      )
      BEGIN
        ALTER TABLE users ALTER COLUMN email NVARCHAR(100) NULL
      END
    `);

    await pool.request().query(`
      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        WHERE t.name = 'users'
          AND c.name = 'matriculation_number'
          AND c.is_nullable = 0
      )
      BEGIN
        ALTER TABLE users ALTER COLUMN matriculation_number NVARCHAR(50) NULL
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_users_email_not_null'
          AND object_id = OBJECT_ID('users')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_users_email_not_null
        ON users(email)
        WHERE email IS NOT NULL
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('subjects', 'U') IS NULL
      BEGIN
        CREATE TABLE subjects (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          professor_id INT NULL,
          info_text NVARCHAR(MAX) NULL,
          rules_text NVARCHAR(MAX) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_subjects_professor
            FOREIGN KEY (professor_id) REFERENCES users(id)
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('subjects', 'info_text') IS NULL
      BEGIN
        ALTER TABLE subjects ADD info_text NVARCHAR(MAX) NULL
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('subjects', 'rules_text') IS NULL
      BEGIN
        ALTER TABLE subjects ADD rules_text NVARCHAR(MAX) NULL
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('exams', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('exams', 'bonus_points') IS NULL
      BEGIN
        ALTER TABLE exams ADD bonus_points DECIMAL(5,2) NOT NULL DEFAULT 0
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('exam_variants', 'U') IS NULL
      BEGIN
        CREATE TABLE exam_variants (
          id INT IDENTITY(1,1) PRIMARY KEY,
          exam_id INT NOT NULL,
          variant_name NVARCHAR(50) NOT NULL,
          row_number INT NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_exam_variants_exam
            FOREIGN KEY (exam_id) REFERENCES exams(id)
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('questions', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('questions', 'image_path') IS NULL
      BEGIN
        ALTER TABLE questions ADD image_path NVARCHAR(2048) NULL
      END
      ELSE
      BEGIN
        ALTER TABLE questions ALTER COLUMN image_path NVARCHAR(2048) NULL
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('answers', 'U') IS NULL
      BEGIN
        CREATE TABLE answers (
          id INT IDENTITY(1,1) PRIMARY KEY,
          question_id INT NOT NULL,
          answer_text NVARCHAR(MAX) NOT NULL,
          is_correct BIT NOT NULL DEFAULT 0,
          CONSTRAINT FK_answers_question
            FOREIGN KEY (question_id) REFERENCES questions(id)
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('question_images', 'U') IS NULL
      BEGIN
        CREATE TABLE question_images (
          id INT IDENTITY(1,1) PRIMARY KEY,
          question_id INT NOT NULL,
          image_path NVARCHAR(2048) NOT NULL,
          image_original_name NVARCHAR(255) NULL,
          sort_order INT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_question_images_question
            FOREIGN KEY (question_id) REFERENCES questions(id)
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_exam_assignments', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_answers', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('results', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_sessions', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_student_sessions_active'
          AND object_id = OBJECT_ID('student_sessions')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_student_sessions_active
        ON student_sessions(student_id)
        WHERE is_active = 1
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_answer_drafts', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_student_answer_drafts'
          AND object_id = OBJECT_ID('student_answer_drafts')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_student_answer_drafts
        ON student_answer_drafts(student_id, exam_id, question_id, answer_id)
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_test_events', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF OBJECT_ID('student_test_locks', 'U') IS NULL
      BEGIN
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
        )
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UX_student_test_locks_active'
          AND object_id = OBJECT_ID('student_test_locks')
      )
      BEGIN
        CREATE UNIQUE INDEX UX_student_test_locks_active
        ON student_test_locks(student_id, exam_id)
        WHERE is_active = 1
      END
    `);

    await pool.request().query(`
      IF COL_LENGTH('questions', 'image_original_name') IS NULL
      BEGIN
        ALTER TABLE questions ADD image_original_name NVARCHAR(255) NULL
      END
    `);

    await pool.request().query(`
      IF EXISTS (
        SELECT 1
        FROM sys.columns c
        INNER JOIN sys.tables t ON t.object_id = c.object_id
        WHERE t.name = 'subjects'
          AND c.name = 'professor_id'
          AND c.is_nullable = 0
      )
      BEGIN
        ALTER TABLE subjects ALTER COLUMN professor_id INT NULL
      END
    `);

    await seedAdminProfessor(pool);
  })();

  return schemaPromise;
}

/*
----------------------------
       Seed admin principal
----------------------------
*/
// Creeaza sau actualizeaza contul principal de admin folosind valorile din fisierul .env.
async function seedAdminProfessor(pool) {
  const {
    ADMIN_FULL_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_UNIQUE_CODE,
  } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_UNIQUE_CODE) {
    return;
  }

  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const fullName = ADMIN_FULL_NAME || "Profesor Admin";
  const existing = await pool
    .request()
    .input("email", sql.NVarChar(100), ADMIN_EMAIL)
    .query("SELECT TOP 1 id FROM users WHERE email = @email");

  if (existing.recordset.length > 0) {
    await pool
      .request()
      .input("id", sql.Int, Number(existing.recordset[0].id))
      .input("fullName", sql.NVarChar(100), fullName)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("uniqueCode", sql.NVarChar(100), ADMIN_UNIQUE_CODE)
      .query(`
        UPDATE users
        SET full_name = @fullName,
            password_hash = @passwordHash,
            role = 'professor',
            matriculation_number = NULL,
            unique_code = @uniqueCode
        WHERE id = @id
      `);
    return;
  }

  await pool
    .request()
    .input("fullName", sql.NVarChar(100), fullName)
    .input("email", sql.NVarChar(100), ADMIN_EMAIL)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .input("uniqueCode", sql.NVarChar(100), ADMIN_UNIQUE_CODE)
    .query(`
      INSERT INTO users
        (full_name, email, password_hash, role, matriculation_number, unique_code)
      VALUES
        (@fullName, @email, @passwordHash, 'professor', NULL, @uniqueCode)
    `);
}

module.exports = {
  sql,
  getPool,
  ensureSchema,
};
