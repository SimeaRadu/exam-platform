const bcrypt = require("bcrypt");
const { getPool, sql } = require("../db");

const professor = {
  fullName: process.env.ADMIN_FULL_NAME || "Profesor Test",
  email: process.env.ADMIN_EMAIL || "profesor@test.com",
  password: process.env.ADMIN_PASSWORD || "admin123",
  uniqueCode: process.env.ADMIN_UNIQUE_CODE || "PROF-ADMIN",
};

async function createOrUpdateProfessor() {
  const pool = await getPool();
  const passwordHash = await bcrypt.hash(professor.password, 10);

  const existing = await pool
    .request()
    .input("email", sql.NVarChar(100), professor.email)
    .query("SELECT TOP 1 id FROM users WHERE email = @email");

  if (existing.recordset.length > 0) {
    const professorId = existing.recordset[0].id;

    await pool
      .request()
      .input("id", sql.Int, professorId)
      .input("fullName", sql.NVarChar(100), professor.fullName)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("uniqueCode", sql.NVarChar(100), professor.uniqueCode)
      .query(`
        UPDATE users
        SET full_name = @fullName,
            password_hash = @passwordHash,
            role = 'professor',
            matriculation_number = NULL,
            unique_code = @uniqueCode
        WHERE id = @id
      `);

    console.log(`Profesor actualizat: ${professor.email}`);
    console.log(`Parola: ${professor.password}`);
    return;
  }

  await pool
    .request()
    .input("fullName", sql.NVarChar(100), professor.fullName)
    .input("email", sql.NVarChar(100), professor.email)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .input("uniqueCode", sql.NVarChar(100), professor.uniqueCode)
    .query(`
      INSERT INTO users
        (full_name, email, password_hash, role, matriculation_number, unique_code)
      VALUES
        (@fullName, @email, @passwordHash, 'professor', NULL, @uniqueCode)
    `);

  console.log(`Profesor creat: ${professor.email}`);
  console.log(`Parola: ${professor.password}`);
}

createOrUpdateProfessor()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Nu am putut crea/actualiza profesorul:");
    console.error(error.message);
    process.exit(1);
  });
