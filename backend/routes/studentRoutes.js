/*
----------------------------
        Rute student
----------------------------
*/
// Endpoint-urile folosite de dashboard-ul studentului pentru examene, rezultate si test.
const express = require("express");
const {
  autosaveStudentTest,
  chooseStudentExamRow,
  getStudentTest,
  getStudentTestLockStatus,
  heartbeatStudentSession,
  listStudentExams,
  listStudentResults,
  recordStudentTestEvent,
  requestExamRestart,
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
router.post("/exams/:examId/row", chooseStudentExamRow);
router.get("/exams/:examId/test", getStudentTest);
router.get("/exams/:examId/lock-status", getStudentTestLockStatus);
router.post("/exams/:examId/autosave", autosaveStudentTest);
router.post("/exams/:examId/events", recordStudentTestEvent);
router.post("/exams/:examId/restart-request", requestExamRestart);
router.post("/exams/:examId/submit", submitStudentTest);

module.exports = router;
