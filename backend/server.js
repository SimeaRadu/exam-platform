/*
----------------------------
       Initializare server
----------------------------
*/
// Porneste aplicatia Express si incarca rutele, conexiunea la baza si configurarea generala.
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { ensureSchema, getPool, sql } = require("./db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const { backfillQuestionImages } = require("./scripts/backfillQuestionImages");

const app = express();
const port = process.env.PORT || 5000;
let schemaReady;

/*
----------------------------
      Pregatire schema SQL
----------------------------
*/
// Ruleaza pregatirea bazei o singura data, inainte ca API-ul sa proceseze cereri reale.
function getSchemaReady() {
  if (!schemaReady) {
    schemaReady = ensureSchema().then(async () => {
      const pool = await getPool();
      const summary = await backfillQuestionImages(pool);

      if (summary.updated > 0 || summary.missing > 0) {
        console.log("Question image storage sync:", summary);
      }
    });
  }

  return schemaReady;
}

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Originea nu este permisa de server."));
  },
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

/*
----------------------------
          Rute de baza
----------------------------
*/
// Ofera endpoint-uri simple pentru verificarea API-ului si a conexiunii la SQL Server.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

app.get("/api/health", async (req, res) => {
  try {
    await getPool();
    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "not connected",
      message: error.message,
    });
  }
});

app.get("/api/files/question-images/:imageId", async (req, res) => {
  try {
    await getSchemaReady();
    const imageId = Number(req.params.imageId);

    if (!Number.isInteger(imageId)) {
      return res.status(400).json({ message: "ID imagine invalid." });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("imageId", sql.Int, imageId)
      .query(`
        SELECT TOP 1 image_data, mime_type, image_original_name
        FROM question_images
        WHERE id = @imageId
      `);
    const image = result.recordset[0];

    if (!image?.image_data) {
      return res.status(404).json({ message: "Imaginea nu a fost gasita." });
    }

    res.setHeader("Content-Type", image.mime_type || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(image.image_original_name || `question-${imageId}`)}"`);
    return res.send(image.image_data);
  } catch (error) {
    return res.status(500).json({
      message: "Imaginea nu a putut fi incarcata.",
      error: error.message,
    });
  }
});

/*
----------------------------
        Middleware API
----------------------------
*/
// Se asigura ca schema bazei este pregatita inainte de orice ruta /api.
app.use("/api", async (req, res, next) => {
  try {
    await getSchemaReady();
    next();
  } catch (error) {
    res.status(500).json({
      message: "Nu am putut pregati schema bazei de date.",
      details: error.message,
    });
  }
});

/*
----------------------------
        Rute aplicatie
----------------------------
*/
// Leaga modulele principale: autentificare, admin/profesor, examene si student.
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", examRoutes);
app.use("/api/student", studentRoutes);

/*
----------------------------
     Tratare erori si 404
----------------------------
*/
// Intoarce raspunsuri clare pentru erori generale si rute inexistente.
app.use((error, req, res, next) => {
  if (error) {
    return res.status(400).json({
      message: error.message || "Cererea nu a putut fi procesata.",
    });
  }

  return next();
});

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

/*
----------------------------
        Pornire server
----------------------------
*/
// Cand fisierul este rulat direct, porneste serverul local pe portul configurat.
if (require.main === module) {
  getSchemaReady()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error("Nu am putut pregati schema bazei de date:", error.message);
      process.exit(1);
    });
}

module.exports = app;
