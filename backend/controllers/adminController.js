/*
----------------------------
      Administrare utilizatori
----------------------------
*/
// Contine logica pentru creare, import Excel, listare si stergere completa a utilizatorilor.
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const { getPool, sql } = require("../db");
const { isAdminUser } = require("../middleware/authMiddleware");

/*
----------------------------
      Citire import Excel
----------------------------
*/
// Normalizeaza antetele si valorile din Excel ca importul sa mearga si daca fisierul are denumiri usor diferite.
function normalizeImportHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function cleanExcelValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function isStudentName(value) {
  const text = cleanExcelValue(value);

  return text
    && /[a-zA-ZĂÂÎȘȚăâîșț]/.test(text)
    && !/^(nume|student|grupa|cod|email|sm\s*tst)/i.test(text);
}

function detectImportColumns(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const normalized = rows[rowIndex].map(normalizeImportHeader);
    const nameIndex = normalized.findIndex((header) => (
      ["nume", "numestudent", "numeprenume", "student", "numestudent"].includes(header)
    ));
    const codeIndex = normalized.findIndex((header) => (
      ["cod", "codunic", "parola", "password"].includes(header)
    ));

    if (nameIndex !== -1 && codeIndex !== -1) {
      const emailIndex = normalized.findIndex((header) => ["email", "mail"].includes(header));
      const matriculationIndex = normalized.findIndex((header) => (
        ["grupa", "grup", "nummatricol", "numarmatricol", "matricol", "nrmatricol", "nrmaticol"].includes(header)
      ));

      return {
        startRow: rowIndex + 1,
        nameIndex,
        codeIndex,
        emailIndex,
        matriculationIndex,
      };
    }
  }

  return {
    startRow: 0,
    nameIndex: 0,
    codeIndex: 2,
    emailIndex: -1,
    matriculationIndex: 1,
  };
}

function parseStudentsFromExcel(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const columns = detectImportColumns(rows);
  const students = [];

  for (let rowIndex = columns.startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const fullName = cleanExcelValue(row[columns.nameIndex]);
    const uniqueCode = cleanExcelValue(row[columns.codeIndex]);
    const email = columns.emailIndex >= 0 ? cleanExcelValue(row[columns.emailIndex]) : "";
    const matriculationNumber = columns.matriculationIndex >= 0
      ? cleanExcelValue(row[columns.matriculationIndex])
      : "";

    if (!isStudentName(fullName) || !uniqueCode) {
      continue;
    }

    students.push({
      rowNumber: rowIndex + 1,
      fullName,
      uniqueCode,
      email: email || null,
      matriculationNumber: matriculationNumber || null,
    });
  }

  return students;
}

/*
----------------------------
        Listare utilizatori
----------------------------
*/
// Adminul vede toate conturile, iar profesorul normal vede doar lista studentilor.
async function listUsers(req, res) {
  try {
    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const request = pool.request();
    const result = admin
      ? await request.query(`
          SELECT id, full_name, email, role, matriculation_number, unique_code, created_at
          FROM users
          ORDER BY created_at DESC
        `)
      : await request.query(`
          SELECT id, full_name, email, role, matriculation_number, created_at
          FROM users
          WHERE role = 'student'
          ORDER BY created_at DESC
        `);

    res.json({
      canManageUsers: admin,
      users: result.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea utilizatorilor.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Creare utilizator
----------------------------
*/
// Salveaza studenti sau profesori noi, cu parola criptata si validari pentru date duplicate.
async function createUser(req, res) {
  try {
    const {
      fullName,
      role = "student",
      email,
      matriculationNumber,
      uniqueCode,
      password,
    } = req.body;

    if (!fullName || !role || !uniqueCode) {
      return res.status(400).json({
        message: "Numele, rolul si codul unic sunt obligatorii.",
      });
    }

    if (!["student", "professor"].includes(role)) {
      return res.status(400).json({
        message: "Rol invalid.",
      });
    }

    if (role === "professor" && (!email || !password)) {
      return res.status(400).json({
        message: "Pentru profesor sunt obligatorii emailul si parola.",
      });
    }

    const pool = await getPool();
    const isAdminCode = uniqueCode === process.env.ADMIN_UNIQUE_CODE;

    const existingUser = await pool
      .request()
      .input("email", sql.NVarChar(100), email || null)
      .input("uniqueCode", sql.NVarChar(100), uniqueCode)
      .input("isAdminCode", sql.Bit, isAdminCode ? 1 : 0)
      .query(`
        SELECT TOP 1 id, email, matriculation_number, unique_code
        FROM users
        WHERE (@email IS NOT NULL AND email = @email)
           OR (@isAdminCode = 0 AND unique_code = @uniqueCode)
      `);

    if (existingUser.recordset.length > 0) {
      const existing = existingUser.recordset[0];
      const conflicts = [];

      if (email && existing.email === email) {
        conflicts.push("emailul");
      }

      if (!isAdminCode && existing.unique_code === uniqueCode) {
        conflicts.push("codul unic");
      }

      return res.status(409).json({
        message: `Exista deja un utilizator cu ${conflicts.join(", ")}.`,
      });
    }

    const loginSecret = password || uniqueCode;
    const passwordHash = await bcrypt.hash(loginSecret, 10);

    const result = await pool
      .request()
      .input("fullName", sql.NVarChar(100), fullName)
      .input("email", sql.NVarChar(100), email || null)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("role", sql.NVarChar(20), role)
      .input("matriculationNumber", sql.NVarChar(50), matriculationNumber || null)
      .input("uniqueCode", sql.NVarChar(100), uniqueCode)
      .query(`
        INSERT INTO users
          (full_name, email, password_hash, role, matriculation_number, unique_code)
        OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.role,
               INSERTED.matriculation_number, INSERTED.unique_code, INSERTED.created_at
        VALUES
          (@fullName, @email, @passwordHash, @role, @matriculationNumber, @uniqueCode)
      `);

    res.status(201).json({
      message: "Utilizator creat de profesor.",
      user: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la crearea utilizatorului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Import studenti Excel
----------------------------
*/
// Citeste fisierul Excel cu studenti si transforma codul unic in parola de autentificare.
async function importUsersFromExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Alege un fisier Excel.",
      });
    }

    const students = parseStudentsFromExcel(req.file.buffer);

    if (students.length === 0) {
      return res.status(400).json({
        message: "Nu am gasit studenti in fisierul Excel. Sunt necesare cel putin coloanele Nume si Cod, iar Grupa este preluata daca exista.",
      });
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    const imported = [];
    const skipped = [];
    const seenCodes = new Set();
    const seenEmails = new Set();

    await transaction.begin();

    try {
      for (const student of students) {
        const localDuplicate =
          seenCodes.has(student.uniqueCode)
          || (student.email && seenEmails.has(student.email.toLowerCase()));

        if (localDuplicate) {
          skipped.push({
            rowNumber: student.rowNumber,
            fullName: student.fullName,
            reason: "Duplicat in fisier.",
          });
          continue;
        }

        const existingUser = await new sql.Request(transaction)
          .input("email", sql.NVarChar(100), student.email)
          .input("uniqueCode", sql.NVarChar(100), student.uniqueCode)
          .query(`
            SELECT TOP 1 id
            FROM users
            WHERE (@email IS NOT NULL AND email = @email)
               OR unique_code = @uniqueCode
          `);

        if (existingUser.recordset.length > 0) {
          skipped.push({
            rowNumber: student.rowNumber,
            fullName: student.fullName,
            reason: "Exista deja in baza de date acelasi email sau cod.",
          });
          continue;
        }

        const passwordHash = await bcrypt.hash(student.uniqueCode, 10);
        const createdUser = await new sql.Request(transaction)
          .input("fullName", sql.NVarChar(100), student.fullName)
          .input("email", sql.NVarChar(100), student.email)
          .input("passwordHash", sql.NVarChar(255), passwordHash)
          .input("role", sql.NVarChar(20), "student")
          .input("matriculationNumber", sql.NVarChar(50), student.matriculationNumber)
          .input("uniqueCode", sql.NVarChar(100), student.uniqueCode)
          .query(`
            INSERT INTO users
              (full_name, email, password_hash, role, matriculation_number, unique_code)
            OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.role,
                   INSERTED.matriculation_number, INSERTED.unique_code, INSERTED.created_at
            VALUES
              (@fullName, @email, @passwordHash, @role, @matriculationNumber, @uniqueCode)
          `);

        imported.push(createdUser.recordset[0]);
        seenCodes.add(student.uniqueCode);

        if (student.email) {
          seenEmails.add(student.email.toLowerCase());
        }

      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    res.status(201).json({
      message: `Import finalizat. Studenti adaugati: ${imported.length}. Sariti: ${skipped.length}.`,
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la importul studentilor din Excel.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Stergere utilizator
----------------------------
*/
// Sterge in cascada datele legate de un utilizator, ca baza sa ramana curata.
async function deleteExamTree(transaction, examId) {
  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_answer_drafts WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_test_events WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_answers WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM results WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_exam_assignments WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE a
      FROM answers a
      INNER JOIN questions q ON q.id = a.question_id
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE q
      FROM questions q
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM exam_variants WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM exams WHERE id = @examId");
}

/*
----------------------------
      Stergere date student
----------------------------
*/
// Curata raspunsurile, rezultatele, asignarile si sesiunile unui student inainte de stergerea contului.
async function deleteStudentData(transaction, userId) {
  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM student_answer_drafts WHERE student_id = @userId");

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM student_test_events WHERE student_id = @userId");

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM student_answers WHERE student_id = @userId");

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM results WHERE student_id = @userId");

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM student_exam_assignments WHERE student_id = @userId");

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM student_sessions WHERE student_id = @userId");
}

/*
----------------------------
     Stergere date profesor
----------------------------
*/
// Sterge examenele si materiile administrate de profesor, impreuna cu datele dependente.
async function deleteProfessorData(transaction, userId) {
  const examsResult = await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query(`
      SELECT DISTINCT e.id
      FROM exams e
      LEFT JOIN subjects s ON s.id = e.subject_id
      WHERE e.created_by = @userId
         OR s.professor_id = @userId
    `);

  for (const exam of examsResult.recordset) {
    await deleteExamTree(transaction, Number(exam.id));
  }

  await new sql.Request(transaction)
    .input("userId", sql.Int, userId)
    .query("DELETE FROM subjects WHERE professor_id = @userId");
}

/*
----------------------------
       Stergere cont finala
----------------------------
*/
// Alege fluxul corect de stergere in functie de rol si confirma ca utilizatorul poate fi eliminat.
async function deleteUser(req, res) {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        message: "ID utilizator invalid.",
      });
    }

    if (userId === Number(req.user.id)) {
      return res.status(400).json({
        message: "Nu poti sterge contul cu care esti autentificat.",
      });
    }

    const pool = await getPool();
    const userResult = await pool
      .request()
      .input("id", sql.Int, userId)
      .query("SELECT TOP 1 id, role FROM users WHERE id = @id");

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Utilizatorul nu a fost gasit.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const role = userResult.recordset[0].role;

      if (role === "student") {
        await deleteStudentData(transaction, userId);
      }

      if (role === "professor") {
        await deleteProfessorData(transaction, userId);
      }

      await new sql.Request(transaction)
        .input("id", sql.Int, userId)
        .query("DELETE FROM users WHERE id = @id");

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    res.json({
      message: "Utilizatorul si toate datele legate de el au fost sterse.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Nu am putut sterge utilizatorul si datele legate de el.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Stergere grupa
----------------------------
*/
// Sterge toti studentii dintr-o grupa si curata toate datele legate de fiecare student.
async function deleteStudentGroup(req, res) {
  try {
    const groupName = String(req.params.groupName || "").trim();

    if (!groupName) {
      return res.status(400).json({
        message: "Grupa este obligatorie.",
      });
    }

    const pool = await getPool();
    const studentsResult = await pool
      .request()
      .input("groupName", sql.NVarChar(50), groupName)
      .query(`
        SELECT id
        FROM users
        WHERE role = 'student'
          AND ISNULL(LTRIM(RTRIM(matriculation_number)), '') = @groupName
      `);

    if (studentsResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Nu exista studenti in aceasta grupa.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const student of studentsResult.recordset) {
        await deleteStudentData(transaction, Number(student.id));

        await new sql.Request(transaction)
          .input("id", sql.Int, Number(student.id))
          .query("DELETE FROM users WHERE id = @id");
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    res.json({
      message: `Grupa ${groupName} si toate datele studentilor din ea au fost sterse.`,
      deletedStudents: studentsResult.recordset.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Nu am putut sterge grupa si datele legate de ea.",
      error: error.message,
    });
  }
}

module.exports = {
  createUser,
  deleteStudentGroup,
  deleteUser,
  importUsersFromExcel,
  listUsers,
};
