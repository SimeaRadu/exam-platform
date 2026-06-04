/*
----------------------------
     Middleware autentificare
----------------------------
*/
// Contine filtrele care decid daca o cerere are token valid si rolul potrivit.
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db");

/*
----------------------------
       Verificare token
----------------------------
*/
// Citeste tokenul JWT din header si pune datele utilizatorului pe req.user.
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Token lipsa.",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(403).json({
      message: "Token invalid sau expirat.",
    });
  }
}

/*
----------------------------
       Verificare roluri
----------------------------
*/
// Confirma rolul utilizatorului si valideaza sesiunea unica pentru student.
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(403).json({
          message: "Nu ai permisiunea necesara.",
        });
      }

      const pool = await getPool();
      const result = await pool
        .request()
        .input("id", sql.Int, Number(req.user.id))
        .query(`
          SELECT TOP 1 id, full_name, email, role, unique_code
          FROM users
          WHERE id = @id
        `);

      if (result.recordset.length === 0) {
        return res.status(403).json({
          message: "Nu ai permisiunea necesara.",
        });
      }

      const dbUser = result.recordset[0];
      req.user = {
        ...req.user,
        id: Number(dbUser.id),
        fullName: dbUser.full_name,
        email: dbUser.email,
        role: dbUser.role,
        uniqueCode: dbUser.unique_code,
        unique_code: dbUser.unique_code,
      };

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Nu ai permisiunea necesara.",
        });
      }

      if (req.user.role === "student") {
        if (!req.user.sessionId) {
          return res.status(401).json({
            message: "Sesiunea studentului nu este valida. Conecteaza-te din nou.",
          });
        }

        const sessionResult = await pool
          .request()
          .input("studentId", sql.Int, req.user.id)
          .input("tokenId", sql.NVarChar(64), req.user.sessionId)
          .query(`
            SELECT TOP 1 id
            FROM student_sessions
            WHERE student_id = @studentId
              AND token_id = @tokenId
              AND is_active = 1
          `);

        if (sessionResult.recordset.length === 0) {
          return res.status(401).json({
            message: "Sesiunea studentului a fost inchisa sau este activa pe alt dispozitiv.",
          });
        }

        await pool
          .request()
          .input("studentId", sql.Int, req.user.id)
          .input("tokenId", sql.NVarChar(64), req.user.sessionId)
          .query(`
            UPDATE student_sessions
            SET last_seen = SYSUTCDATETIME()
            WHERE student_id = @studentId
              AND token_id = @tokenId
              AND is_active = 1
          `);
      }

      next();
    } catch (error) {
      return res.status(403).json({
        message: "Nu ai permisiunea necesara.",
      });
    }
  };
}

/*
----------------------------
       Verificare admin
----------------------------
*/
// Diferentiaza adminul principal de un profesor normal prin codul unic din .env.
function isAdminUser(user) {
  if (!user) {
    return false;
  }

  return user.uniqueCode === process.env.ADMIN_UNIQUE_CODE
    || user.unique_code === process.env.ADMIN_UNIQUE_CODE;
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({
      message: "Doar adminul principal poate crea sau sterge utilizatori.",
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  isAdminUser,
  requireAdmin,
  requireRole,
};
