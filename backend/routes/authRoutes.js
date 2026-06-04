/*
----------------------------
       Rute autentificare
----------------------------
*/
// Expune endpoint-urile pentru login, logout, utilizator curent si grupele studentilor.
const express = require("express");
const {
  getCurrentUser,
  listStudentGroups,
  login,
  logout,
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/authMiddleware");

const router = express.Router();

/*
----------------------------
        Endpoint-uri auth
----------------------------
*/
// Login-ul este public, iar /me si /logout necesita token valid.
router.post("/login", login);
router.get("/student-groups", listStudentGroups);
router.post("/logout", authenticateToken, logout);
router.get("/me", authenticateToken, getCurrentUser);

module.exports = router;
