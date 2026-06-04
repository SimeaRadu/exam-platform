/*
----------------------------
        Autentificare
----------------------------
*/
// Gestioneaza intrarea in cont pentru profesor/admin si student, cu reguli diferite pentru fiecare rol.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db");

/*
----------------------------
          Token JWT
----------------------------
*/
// Pregateste numele pentru login flexibil si creeaza tokenul folosit dupa autentificare.
function normalizeLoginName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function nameMatchesLogin(fullName, loginName) {
  const fullTokens = normalizeLoginName(fullName).split(" ").filter(Boolean);
  const loginTokens = normalizeLoginName(loginName).split(" ").filter(Boolean);

  if (loginTokens.length === 0) {
    return false;
  }

  return loginTokens.every((token) => fullTokens.includes(token));
}

function createToken(user, sessionId = null) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      uniqueCode: user.unique_code || user.uniqueCode,
      sessionId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );
}

/*
----------------------------
       Sesiune student unica
----------------------------
*/
// Blocheaza conectarea simultana a aceluiasi student de pe doua sesiuni active.
async function createStudentSession(pool, studentId) {
  await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .query(`
      UPDATE student_sessions
      SET is_active = 0,
          ended_at = SYSUTCDATETIME()
      WHERE student_id = @studentId
        AND is_active = 1
        AND last_seen < DATEADD(SECOND, -20, SYSUTCDATETIME())
    `);

  const activeSession = await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .query(`
      SELECT TOP 1 id, last_seen
      FROM student_sessions
      WHERE student_id = @studentId
        AND is_active = 1
      ORDER BY last_seen DESC
    `);

  if (activeSession.recordset.length > 0) {
    const error = new Error("Acest student este deja conectat pe alta sesiune. Asteapta aproximativ 20 de secunde sau cere profesorului sa il deblocheze.");
    error.statusCode = 409;
    throw error;
  }

  const tokenId = crypto.randomUUID();
  await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .input("tokenId", sql.NVarChar(64), tokenId)
    .query(`
      INSERT INTO student_sessions (student_id, token_id)
      VALUES (@studentId, @tokenId)
    `);

  return tokenId;
}

/*
----------------------------
              Login
----------------------------
*/
// Verifica nume/parola sau cod unic, rolul selectat si grupa studentului inainte de autentificare.
async function login(req, res) {
  try {
    const {
      identifier,
      password,
      fullName,
      uniqueCode,
      expectedRole,
      group,
    } = req.body;
    const loginName = fullName || identifier;
    const loginSecret = uniqueCode || password;

    if (!loginName || !loginSecret) {
      return res.status(400).json({
        message: "Numele si codul unic sunt obligatorii.",
      });
    }

    if (expectedRole === "student" && !group) {
      return res.status(400).json({
        message: "Numele, grupa si codul unic sunt obligatorii.",
      });
    }

    const pool = await getPool();
    let result;

    if (uniqueCode) {
      result = await pool
        .request()
        .input("uniqueCode", sql.NVarChar(100), uniqueCode)
        .query(`
          SELECT id, full_name, email, password_hash, role,
                       matriculation_number, unique_code
          FROM users
          WHERE unique_code = @uniqueCode
        `);
    } else {
      result = await pool
        .request()
        .input("loginName", sql.NVarChar(100), loginName)
        .query(`
        SELECT id, full_name, email, password_hash, role,
                     matriculation_number, unique_code
        FROM users
        WHERE full_name = @loginName
           OR email = @loginName
      `);
    }

    if (result.recordset.length === 0) {
      return res.status(401).json({
        message: "Date de autentificare incorecte.",
      });
    }

    let user = result.recordset[0];

    if (uniqueCode) {
      const matchingUsers = expectedRole
        ? result.recordset.filter((item) => item.role === expectedRole)
        : result.recordset;

      user = matchingUsers.find((item) => {
        const groupMatches = expectedRole !== "student"
          || String(item.matriculation_number || "").trim() === String(group || "").trim();

        return groupMatches && nameMatchesLogin(item.full_name, loginName);
      });

      if (!user) {
        return res.status(401).json({
          message: "Date de autentificare incorecte.",
        });
      }
    }

    if (expectedRole && user.role !== expectedRole) {
      return res.status(403).json({
        message: expectedRole === "professor"
          ? "Acest cont nu este cont de profesor."
          : "Acest cont nu este cont de student.",
      });
    }

    const passwordMatches = await bcrypt.compare(loginSecret, user.password_hash);
    const codeMatches = uniqueCode && user.unique_code === uniqueCode;

    if (!passwordMatches && !codeMatches) {
      return res.status(401).json({
        message: "Date de autentificare incorecte.",
      });
    }

    let sessionId = null;

    if (user.role === "student") {
      try {
        sessionId = await createStudentSession(pool, Number(user.id));
      } catch (sessionError) {
        return res.status(sessionError.statusCode || 500).json({
          message: sessionError.message,
        });
      }
    }

    delete user.password_hash;

    res.json({
      message: "Autentificare reusita.",
      user,
      token: createToken(user, sessionId),
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la autentificare.",
      error: error.message,
    });
  }
}

/*
----------------------------
          Grupe studenti
----------------------------
*/
// Citeste grupele existente din studentii salvati, pentru dropdown-ul de pe pagina de logare.
async function listStudentGroups(req, res) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(`
        SELECT name
        FROM (
          SELECT DISTINCT
            LTRIM(RTRIM(matriculation_number)) AS name,
            TRY_CONVERT(INT, LTRIM(RTRIM(matriculation_number))) AS numeric_value
          FROM users
          WHERE role = 'student'
            AND matriculation_number IS NOT NULL
            AND LTRIM(RTRIM(matriculation_number)) <> ''
            AND TRY_CONVERT(INT, LTRIM(RTRIM(matriculation_number))) IS NOT NULL
        ) groups
        ORDER BY numeric_value, name
      `);

    res.json({
      groups: result.recordset.map((item) => item.name),
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea grupelor.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Utilizator curent
----------------------------
*/
// Returneaza datele utilizatorului autentificat, folosite la incarcare dashboard.
async function getCurrentUser(req, res) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, req.user.id)
      .query(`
        SELECT id, full_name, email, role, matriculation_number, unique_code
        FROM users
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Utilizatorul nu a fost gasit.",
      });
    }

    res.json({
      user: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea utilizatorului curent.",
      error: error.message,
    });
  }
}

/*
----------------------------
              Logout
----------------------------
*/
// Inchide sesiunea curenta si elibereaza studentul pentru o noua conectare.
async function logout(req, res) {
  try {
    if (req.user?.role === "student" && req.user.sessionId) {
      const pool = await getPool();
      await pool
        .request()
        .input("studentId", sql.Int, req.user.id)
        .input("tokenId", sql.NVarChar(64), req.user.sessionId)
        .query(`
          UPDATE student_sessions
          SET is_active = 0,
              ended_at = SYSUTCDATETIME(),
              last_seen = SYSUTCDATETIME()
          WHERE student_id = @studentId
            AND token_id = @tokenId
        `);
    }

    res.json({
      message: "Sesiune inchisa.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la inchiderea sesiunii.",
      error: error.message,
    });
  }
}

module.exports = {
  getCurrentUser,
  listStudentGroups,
  login,
  logout,
};
