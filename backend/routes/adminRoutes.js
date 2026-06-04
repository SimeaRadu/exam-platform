/*
----------------------------
       Rute utilizatori
----------------------------
*/
// Leaga API-ul pentru administrarea utilizatorilor si importul studentilor din Excel.
const express = require("express");
const multer = require("multer");
const {
  createUser,
  deleteStudentGroup,
  deleteUser,
  importUsersFromExcel,
  listUsers,
} = require("../controllers/adminController");
const {
  authenticateToken,
  requireRole,
} = require("../middleware/authMiddleware");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.use(authenticateToken);
router.use(requireRole("professor"));

/*
----------------------------
      Endpoint-uri admin
----------------------------
*/
// Profesorii si adminul pot administra studentii; adminul ramane singurul care poate gestiona profesori.
router.get("/users", listUsers);
router.post("/users", createUser);
router.post("/users/import-excel", upload.single("studentsFile"), importUsersFromExcel);
router.delete("/users/groups/:groupName", deleteStudentGroup);
router.delete("/users/:id", deleteUser);

module.exports = router;
