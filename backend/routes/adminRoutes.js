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
  requireAdmin,
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
// Profesorii pot vedea studentii, iar creare/stergere/import sunt permise doar adminului principal.
router.get("/users", listUsers);
router.post("/users", requireAdmin, createUser);
router.post("/users/import-excel", requireAdmin, upload.single("studentsFile"), importUsersFromExcel);
router.delete("/users/groups/:groupName", requireAdmin, deleteStudentGroup);
router.delete("/users/:id", requireAdmin, deleteUser);

module.exports = router;
