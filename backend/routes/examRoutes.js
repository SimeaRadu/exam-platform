/*
----------------------------
       Rute examene
----------------------------
*/
// Grupeaza endpoint-urile pentru materii, examene, variante, RTF, asignari si rezultate.
const express = require("express");
const multer = require("multer");
const {
  createExam,
  createQuestion,
  createSubject,
  createVariant,
  deleteVariant,
  deleteSubject,
  deleteExam,
  getResultDetails,
  importRtf,
  listExamAssignments,
  listExams,
  listResults,
  listSubjects,
  listVariants,
  randomizeExamAssignments,
  saveExamAssignment,
  updateSubjectAssignment,
  updateSubjectInfo,
  updateExamStatus,
} = require("../controllers/examController");
const {
  authenticateToken,
  requireAdmin,
  requireRole,
} = require("../middleware/authMiddleware");

const router = express.Router();
const uploadLimitBytes = 4 * 1024 * 1024;

/*
----------------------------
       Upload fisiere
----------------------------
*/
// Configureaza upload-ul pentru imagini de intrebari si fisiere RTF.
const uploadQuestionImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadLimitBytes,
  },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Fisierul incarcat trebuie sa fie o imagine."));
      return;
    }

    callback(null, true);
  },
});

const uploadRtf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadLimitBytes,
  },
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".rtf")) {
      callback(new Error("Fisierul incarcat trebuie sa fie RTF."));
      return;
    }

    callback(null, true);
  },
});

router.use(authenticateToken);
router.use(requireRole("professor"));

/*
----------------------------
       Endpoint-uri materii
----------------------------
*/
// Materiile sunt administrate de admin, iar informatiile pot fi editate si de profesorul asignat.
router.get("/subjects", listSubjects);
router.post("/subjects", requireAdmin, createSubject);
router.patch("/subjects/:id/assignment", requireAdmin, updateSubjectAssignment);
router.patch("/subjects/:id/info", updateSubjectInfo);
router.delete("/subjects/:id", requireAdmin, deleteSubject);

/*
----------------------------
       Endpoint-uri examene
----------------------------
*/
// Examenele se creeaza, se listeaza, se sterg si isi schimba statusul prin aceste rute.
router.get("/exams", listExams);
router.post("/exams", createExam);
router.patch("/exams/:id/status", updateExamStatus);
router.delete("/exams/:id", deleteExam);

/*
----------------------------
       Endpoint-uri rezultate
----------------------------
*/
// Profesorul vede rezultatele studentilor si detaliile testului rezolvat.
router.get("/results", listResults);
router.get("/results/:id", getResultDetails);

/*
----------------------------
       Endpoint-uri variante
----------------------------
*/
// Variantele se incarca din RTF, se verifica si se asigneaza studentilor.
router.get("/exams/:examId/variants", listVariants);
router.post("/exams/:examId/variants", createVariant);
router.delete("/variants/:variantId", deleteVariant);
router.get("/exams/:examId/assignments", listExamAssignments);
router.post("/exams/:examId/assignments", saveExamAssignment);
router.post("/exams/:examId/assignments/random", randomizeExamAssignments);
router.post("/exams/:examId/import-rtf", uploadRtf.single("rtfFile"), importRtf);
router.post("/variants/:variantId/questions", uploadQuestionImage.single("questionImage"), createQuestion);

module.exports = router;
