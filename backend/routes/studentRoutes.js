/*
----------------------------
        Rute student
----------------------------
*/
// Endpoint-urile folosite de dashboard-ul studentului pentru examene, rezultate si test.
const express = require("express");
const {
  autosaveStudentTest,
  getStudentTest,
  heartbeatStudentSession,
  listStudentExams,
  listStudentResults,
  recordStudentTestEvent,
  submitStudentTest,
} = require("../controllers/studentController");
const {
  authenticateToken,
  requireRole,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole("student"));

/*
----------------------------
      Endpoint-uri dashboard
----------------------------
*/
// Studentul incarca materiile, rezultatele, testul activ si autosave-ul raspunsurilor.
router.get("/exams", listStudentExams);
router.get("/results", listStudentResults);
router.post("/heartbeat", heartbeatStudentSession);
router.get("/exams/:examId/test", getStudentTest);
router.post("/exams/:examId/autosave", autosaveStudentTest);
router.post("/exams/:examId/events", recordStudentTestEvent);
router.post("/exams/:examId/submit", submitStudentTest);

module.exports = router;
