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

const { ensureSchema, getPool } = require("./db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");

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
    schemaReady = ensureSchema();
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

/*
----------------------------
          Rute de baza
----------------------------
*/
// Ofera endpoint-uri simple pentru verificarea API-ului si a conexiunii la SQL Server.
app.get("/", (req, res) => {
  res.json({
    message: "Exam Platform API is running",
  });
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
