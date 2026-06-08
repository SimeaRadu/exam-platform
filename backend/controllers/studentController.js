/*
----------------------------
       Dashboard student
----------------------------
*/
// Controleaza ce vede studentul: materii, examene, testul activ, autosave si rezultate.
const { getPool, sql } = require("../db");

async function attachQuestionImages(pool, questions) {
  if (!questions.length) {
    return questions;
  }

  const ids = questions.map((question) => Number(question.id)).filter(Number.isInteger);

  if (!ids.length) {
    return questions;
  }

  const result = await pool
    .request()
    .input("ids", sql.NVarChar(sql.MAX), ids.join(","))
    .query(`
      SELECT qi.id, qi.question_id, qi.image_path, qi.image_original_name, qi.sort_order
      FROM question_images qi
      INNER JOIN STRING_SPLIT(@ids, ',') ids ON TRY_CAST(ids.value AS INT) = qi.question_id
      ORDER BY qi.question_id, qi.sort_order, qi.id
    `);
  const imagesByQuestion = new Map();

  result.recordset.forEach((image) => {
    const key = Number(image.question_id);

    if (!imagesByQuestion.has(key)) {
      imagesByQuestion.set(key, []);
    }

    imagesByQuestion.get(key).push({
      id: image.id,
      image_path: image.image_path,
      image_original_name: image.image_original_name,
      sort_order: image.sort_order,
    });
  });

  questions.forEach((question) => {
    const images = imagesByQuestion.get(Number(question.id)) || [];

    if (!images.length && question.image_path) {
      images.push({
        id: null,
        image_path: question.image_path,
        image_original_name: question.image_original_name,
        sort_order: 1,
      });
    }

    question.images = images;
  });

  return questions;
}

/*
----------------------------
      Asignare varianta student
----------------------------
*/
// Gaseste varianta deja asignata studentului. Studentul trebuie sa aleaga randul inainte de start.
async function getStudentAssignment(pool, studentId, examId) {
  const assignmentResult = await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .input("examId", sql.Int, examId)
    .query(`
      SELECT TOP 1 id, student_id, exam_id, variant_id, row_number
      FROM student_exam_assignments
      WHERE student_id = @studentId AND exam_id = @examId
    `);

  if (assignmentResult.recordset.length > 0) {
    return assignmentResult.recordset[0];
  }

  return null;
}

async function assignStudentRow(pool, studentId, examId, rowNumber) {
  const variantResult = await pool
    .request()
    .input("examId", sql.Int, examId)
    .input("rowNumber", sql.Int, rowNumber)
    .query(`
      SELECT TOP 1 id, row_number
      FROM exam_variants
      WHERE exam_id = @examId AND row_number = @rowNumber
      ORDER BY id
    `);

  if (variantResult.recordset.length === 0) {
    return null;
  }

  const variant = variantResult.recordset[0];
  const createdAssignment = await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .input("examId", sql.Int, examId)
    .input("variantId", sql.Int, variant.id)
    .input("rowNumber", sql.Int, variant.row_number)
    .query(`
      MERGE student_exam_assignments AS target
      USING (
        SELECT @studentId AS student_id, @examId AS exam_id
      ) AS source
      ON target.student_id = source.student_id AND target.exam_id = source.exam_id
      WHEN MATCHED THEN
        UPDATE SET variant_id = @variantId, row_number = @rowNumber
      WHEN NOT MATCHED THEN
        INSERT (student_id, exam_id, variant_id, row_number)
        VALUES (@studentId, @examId, @variantId, @rowNumber)
      OUTPUT INSERTED.id, INSERTED.student_id, INSERTED.exam_id,
             INSERTED.variant_id, INSERTED.row_number;
    `);

  return createdAssignment.recordset[0];
}

/*
----------------------------
       Calculare punctaj
----------------------------
*/
// Calculeaza nota cu puncte din oficiu, punctaj partial si penalizare pe raspunsuri gresite.
function calculateExamScore(questions, answersByQuestion, bonusPoints) {
  let score = bonusPoints;
  let maxScore = bonusPoints;
  let selectedCorrectCount = 0;
  let selectedWrongCount = 0;

  questions.forEach((question) => {
    maxScore += question.points;
    const selectedAnswerIds = answersByQuestion.get(question.id) || new Set();
    const selectedValidIds = [...selectedAnswerIds].filter((answerId) => (
      question.allAnswerIds.has(answerId)
    ));
    const correctAnswerCount = question.correctAnswerIds.size;

    if (correctAnswerCount === 0) {
      if (selectedValidIds.length === 0) {
        score += question.points;
      } else {
        selectedWrongCount += selectedValidIds.length;
      }

      return;
    }

    const questionSelectedCorrectCount = selectedValidIds.filter((answerId) => (
      question.correctAnswerIds.has(answerId)
    )).length;
    const questionSelectedWrongCount = selectedValidIds.length - questionSelectedCorrectCount;
    const netCorrectCount = Math.max(0, questionSelectedCorrectCount - questionSelectedWrongCount);
    const pointsPerCorrectAnswer = question.points / correctAnswerCount;

    selectedCorrectCount += questionSelectedCorrectCount;
    selectedWrongCount += questionSelectedWrongCount;
    score += netCorrectCount * pointsPerCorrectAnswer;
  });

  maxScore = Number(maxScore.toFixed(2));
  score = Number(Math.min(score, maxScore).toFixed(2));

  return {
    score,
    maxScore,
    grade: Number(Math.min(score, 10).toFixed(2)),
    selectedCorrectCount,
    selectedWrongCount,
  };
}

/*
----------------------------
     Normalizare raspunsuri
----------------------------
*/
// Transforma raspunsurile primite din frontend intr-o structura comuna, indiferent de format.
function normalizeSubmittedAnswers(rawBody) {
  const submittedAnswers = Array.isArray(rawBody.answers) ? rawBody.answers : [];
  const answersByQuestion = new Map();

  submittedAnswers.forEach((answer) => {
    const questionId = Number(answer.questionId);
    const rawAnswerIds = Array.isArray(answer.answerIds)
      ? answer.answerIds
      : Array.isArray(answer.selectedAnswerIds)
        ? answer.selectedAnswerIds
        : Array.isArray(answer.answers)
          ? answer.answers
          : [answer.answerId].filter((value) => value !== undefined && value !== null);
    const answerIds = rawAnswerIds.map(Number).filter(Number.isInteger);

    if (Number.isInteger(questionId)) {
      answersByQuestion.set(questionId, new Set(answerIds));
    }
  });

  if (Array.isArray(rawBody.selectedAnswers)) {
    rawBody.selectedAnswers.forEach((answer) => {
      const questionId = Number(answer.questionId);
      const answerId = Number(answer.answerId);

      if (!Number.isInteger(questionId) || !Number.isInteger(answerId)) {
        return;
      }

      if (!answersByQuestion.has(questionId)) {
        answersByQuestion.set(questionId, new Set());
      }

      answersByQuestion.get(questionId).add(answerId);
    });
  }

  return answersByQuestion;
}

/*
----------------------------
     Intrebari pentru corectare
----------------------------
*/
// Incarca intrebarile si raspunsurile corecte pentru varianta primita de student.
async function getVariantQuestionsForScoring(pool, variantId) {
  const correctResult = await pool
    .request()
    .input("variantId", sql.Int, variantId)
    .query(`
      SELECT q.id AS question_id, q.points, a.id AS answer_id, a.is_correct
      FROM questions q
      LEFT JOIN answers a ON a.question_id = q.id
      WHERE q.variant_id = @variantId
      ORDER BY q.id, a.id
    `);

  const questions = new Map();

  correctResult.recordset.forEach((row) => {
    const questionId = Number(row.question_id);
    const answerId = row.answer_id ? Number(row.answer_id) : null;

    if (!questions.has(questionId)) {
      questions.set(questionId, {
        id: questionId,
        points: Number(row.points) || 0,
        correctAnswerIds: new Set(),
        allAnswerIds: new Set(),
      });
    }

    if (answerId) {
      questions.get(questionId).allAnswerIds.add(answerId);

      if (row.is_correct) {
        questions.get(questionId).correctAnswerIds.add(answerId);
      }
    }
  });

  return questions;
}

/*
----------------------------
       Autosave raspunsuri
----------------------------
*/
// Salveaza temporar raspunsurile bifate, ca studentul sa poata relua testul dupa intreruperi.
async function getDraftAnswersByQuestion(pool, studentId, examId) {
  const draftResult = await pool
    .request()
    .input("studentId", sql.Int, studentId)
    .input("examId", sql.Int, examId)
    .query(`
      SELECT question_id, answer_id
      FROM student_answer_drafts
      WHERE student_id = @studentId AND exam_id = @examId
      ORDER BY question_id, answer_id
    `);

  const answersByQuestion = new Map();

  draftResult.recordset.forEach((row) => {
    const questionId = Number(row.question_id);
    const answerId = Number(row.answer_id);

    if (!answersByQuestion.has(questionId)) {
      answersByQuestion.set(questionId, new Set());
    }

    answersByQuestion.get(questionId).add(answerId);
  });

  return answersByQuestion;
}

async function saveDraftAnswers(transaction, studentId, examId, questions, answersByQuestion) {
  await new sql.Request(transaction)
    .input("studentId", sql.Int, studentId)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE FROM student_answer_drafts
      WHERE student_id = @studentId AND exam_id = @examId
    `);

  for (const question of questions.values()) {
    const selectedAnswerIds = [...(answersByQuestion.get(question.id) || new Set())]
      .filter((answerId) => question.allAnswerIds.has(answerId));

    for (const answerId of selectedAnswerIds) {
      await new sql.Request(transaction)
        .input("studentId", sql.Int, studentId)
        .input("examId", sql.Int, examId)
        .input("questionId", sql.Int, question.id)
        .input("answerId", sql.Int, answerId)
        .query(`
          INSERT INTO student_answer_drafts (student_id, exam_id, question_id, answer_id)
          VALUES (@studentId, @examId, @questionId, @answerId)
        `);
    }
  }
}

/*
----------------------------
       Examene student
----------------------------
*/
// Trimite catre dashboard materiile si examenele vizibile studentului.
async function listStudentExams(req, res) {
  try {
    const pool = await getPool();
    const subjectsResult = await pool
      .request()
      .query(`
        SELECT id, name, info_text, rules_text
        FROM subjects
        ORDER BY name
      `);
    const result = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .query(`
        SELECT e.id, e.title, e.exam_date, e.status, e.bonus_points,
               s.id AS subject_id, s.name AS subject_name,
               s.info_text AS subject_info, s.rules_text AS subject_rules,
               sea.variant_id AS assigned_variant_id,
               sea.row_number AS assigned_row_number,
               CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS has_result
        FROM exams e
        INNER JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN student_exam_assignments sea
          ON sea.exam_id = e.id AND sea.student_id = @studentId
        LEFT JOIN results r ON r.exam_id = e.id AND r.student_id = @studentId
        WHERE e.status IN ('future', 'active', 'finished', 'archived')
        ORDER BY
          CASE e.status
            WHEN 'active' THEN 1
            WHEN 'future' THEN 2
            WHEN 'finished' THEN 3
            WHEN 'archived' THEN 3
          END,
          e.exam_date ASC
      `);
    const variantsResult = await pool
      .request()
      .query(`
        SELECT v.exam_id, v.id, v.variant_name, v.row_number
        FROM exam_variants v
        INNER JOIN exams e ON e.id = v.exam_id
        WHERE e.status IN ('future', 'active', 'finished', 'archived')
        ORDER BY v.exam_id, v.row_number, v.id
      `);
    const variantsByExam = new Map();

    variantsResult.recordset.forEach((variant) => {
      const examKey = Number(variant.exam_id);

      if (!variantsByExam.has(examKey)) {
        variantsByExam.set(examKey, []);
      }

      variantsByExam.get(examKey).push({
        id: variant.id,
        variant_name: variant.variant_name,
        row_number: variant.row_number,
      });
    });

    const questions = [...questionsMap.values()];
    await attachQuestionImages(pool, questions);

    res.json({
      subjects: subjectsResult.recordset,
      exams: result.recordset.map((exam) => ({
        ...exam,
        row_options: variantsByExam.get(Number(exam.id)) || [],
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea examenelor pentru student.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Alegere rand test
----------------------------
*/
// Studentul alege randul, iar backend-ul ii asigneaza varianta pregatita de profesor pentru acel rand.
async function chooseStudentExamRow(req, res) {
  try {
    const examId = Number(req.params.examId);
    const rowNumber = Number(req.body.rowNumber);

    if (!Number.isInteger(examId) || !Number.isInteger(rowNumber)) {
      return res.status(400).json({
        message: "Alege un rand valid inainte sa pornesti examenul.",
      });
    }

    const pool = await getPool();
    const examResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, status
        FROM exams
        WHERE id = @examId
      `);

    if (examResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit.",
      });
    }

    if (examResult.recordset[0].status !== "active") {
      return res.status(403).json({
        message: "Examenul nu este activ.",
      });
    }

    const existingResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id
        FROM results
        WHERE student_id = @studentId AND exam_id = @examId
      `);

    if (existingResult.recordset.length > 0) {
      return res.status(409).json({
        message: "Ai trimis deja acest test.",
      });
    }

    const existingAssignment = await getStudentAssignment(pool, req.user.id, examId);

    if (existingAssignment && Number(existingAssignment.row_number) === rowNumber) {
      return res.json({
        message: "Randul era deja ales.",
        assignment: existingAssignment,
      });
    }

    const assignment = await assignStudentRow(pool, req.user.id, examId, rowNumber);

    if (!assignment) {
      return res.status(404).json({
        message: "Profesorul nu a setat o varianta pentru randul ales.",
      });
    }

    await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        DELETE FROM student_answer_drafts
        WHERE student_id = @studentId AND exam_id = @examId
      `);

    res.status(201).json({
      message: "Rand ales.",
      assignment,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la alegerea randului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Deschidere test
----------------------------
*/
// Incarca varianta asignata studentului, intrebarile si raspunsurile salvate automat.
async function getStudentTest(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();
    const examResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 e.id, e.title, e.exam_date, e.status, e.bonus_points,
                     s.name AS subject_name, s.rules_text AS subject_rules
        FROM exams e
        INNER JOIN subjects s ON s.id = e.subject_id
        WHERE e.id = @examId
      `);

    if (examResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit.",
      });
    }

    const exam = examResult.recordset[0];

    if (exam.status !== "active") {
      return res.status(403).json({
        message: "Examenul nu este activ.",
      });
    }

    const existingResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, score, max_score, grade, submitted_at
        FROM results
        WHERE student_id = @studentId AND exam_id = @examId
      `);

    if (existingResult.recordset.length > 0) {
      return res.status(409).json({
        message: "Ai trimis deja acest test.",
        result: existingResult.recordset[0],
      });
    }

    const assignment = await getStudentAssignment(pool, req.user.id, examId);

    if (!assignment) {
      return res.status(400).json({
        message: "Alege randul inainte sa pornesti examenul.",
      });
    }

    const variantResult = await pool
      .request()
      .input("variantId", sql.Int, assignment.variant_id)
      .query(`
        SELECT id, exam_id, variant_name, row_number
        FROM exam_variants
        WHERE id = @variantId
      `);

    const questionsResult = await pool
      .request()
      .input("variantId", sql.Int, assignment.variant_id)
      .query(`
        SELECT q.id AS question_id, q.question_text, q.question_type, q.points,
               q.image_path, q.image_original_name,
               a.id AS answer_id, a.answer_text
        FROM questions q
        LEFT JOIN answers a ON a.question_id = q.id
        WHERE q.variant_id = @variantId
        ORDER BY q.id, a.id
      `);

    const questionsMap = new Map();

    questionsResult.recordset.forEach((row) => {
      const questionId = Number(row.question_id);
      const answerId = row.answer_id ? Number(row.answer_id) : null;

      if (!questionsMap.has(questionId)) {
        questionsMap.set(questionId, {
          id: questionId,
          question_text: row.question_text,
          question_type: row.question_type,
          points: row.points,
          image_path: row.image_path,
          image_original_name: row.image_original_name,
          answers: [],
        });
      }

      if (answerId) {
        questionsMap.get(questionId).answers.push({
          id: answerId,
          answer_text: row.answer_text,
        });
      }
    });

    const questions = [...questionsMap.values()];
    await attachQuestionImages(pool, questions);

    const draftAnswersByQuestion = await getDraftAnswersByQuestion(pool, req.user.id, examId);
    const draftAnswers = [...draftAnswersByQuestion.entries()].map(([questionId, answerIds]) => ({
      questionId,
      answerIds: [...answerIds],
    }));

    res.json({
      exam,
      variant: variantResult.recordset[0],
      questions,
      draftAnswers,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la incarcarea testului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Trimitere test
----------------------------
*/
// Corecteaza raspunsurile, salveaza nota finala si inchide testul pentru student.
async function submitStudentTest(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();
    const examResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, status, bonus_points
        FROM exams
        WHERE id = @examId
      `);

    if (examResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit.",
      });
    }

    if (examResult.recordset[0].status !== "active") {
      return res.status(403).json({
        message: "Examenul nu mai este activ.",
      });
    }

    const existingResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id
        FROM results
        WHERE student_id = @studentId AND exam_id = @examId
      `);

    if (existingResult.recordset.length > 0) {
      return res.status(409).json({
        message: "Ai trimis deja acest test.",
      });
    }

    const assignment = await getStudentAssignment(pool, req.user.id, examId);

    if (!assignment) {
      return res.status(400).json({
        message: "Alege randul inainte sa trimiti examenul.",
      });
    }

    const questions = await getVariantQuestionsForScoring(pool, assignment.variant_id);
    let answersByQuestion = normalizeSubmittedAnswers(req.body);

    if ([...answersByQuestion.values()].every((answerIds) => answerIds.size === 0)) {
      answersByQuestion = await getDraftAnswersByQuestion(pool, req.user.id, examId);
    }

    const selectedValidAnswerCount = [...questions.values()].reduce((total, question) => {
      const selectedAnswerIds = answersByQuestion.get(question.id) || new Set();
      const selectedValidIds = [...selectedAnswerIds].filter((answerId) => (
        question.allAnswerIds.has(answerId)
      ));

      return total + selectedValidIds.length;
    }, 0);

    const hasAnswerOptions = [...questions.values()].some((question) => (
      question.allAnswerIds.size > 0
    ));

    if (hasAnswerOptions && selectedValidAnswerCount === 0) {
      return res.status(400).json({
        message: "Nu a fost primit niciun raspuns selectat. Reincarca pagina cu Ctrl+F5 si selecteaza raspunsurile din nou.",
      });
    }

    const bonusPoints = Number(examResult.recordset[0].bonus_points) || 0;
    const scoring = calculateExamScore(questions, answersByQuestion, bonusPoints);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const question of questions.values()) {
        const selectedAnswerIds = [...(answersByQuestion.get(question.id) || new Set())]
          .filter((answerId) => question.allAnswerIds.has(answerId));

        if (!selectedAnswerIds.length) {
          continue;
        }

        for (const answerId of selectedAnswerIds) {
          const request = new sql.Request(transaction);
          await request
            .input("studentId", sql.Int, req.user.id)
            .input("examId", sql.Int, examId)
            .input("questionId", sql.Int, question.id)
            .input("answerId", sql.Int, answerId)
            .query(`
              INSERT INTO student_answers (student_id, exam_id, question_id, answer_id, answer_text)
              VALUES (@studentId, @examId, @questionId, @answerId, NULL)
            `);
        }
      }

      const resultRequest = new sql.Request(transaction);
      const result = await resultRequest
        .input("studentId", sql.Int, req.user.id)
        .input("examId", sql.Int, examId)
        .input("score", sql.Decimal(5, 2), scoring.score)
        .input("maxScore", sql.Decimal(5, 2), scoring.maxScore)
        .input("grade", sql.Decimal(4, 2), scoring.grade)
        .query(`
          INSERT INTO results (student_id, exam_id, score, max_score, grade)
          OUTPUT INSERTED.id, INSERTED.student_id, INSERTED.exam_id,
                 INSERTED.score, INSERTED.max_score, INSERTED.grade, INSERTED.submitted_at
          VALUES (@studentId, @examId, @score, @maxScore, @grade)
        `);

      await new sql.Request(transaction)
        .input("studentId", sql.Int, req.user.id)
        .input("examId", sql.Int, examId)
        .query(`
          DELETE FROM student_answer_drafts
          WHERE student_id = @studentId AND exam_id = @examId
        `);

      await transaction.commit();

      res.status(201).json({
        message: "Test trimis.",
        result: {
          ...result.recordset[0],
          selected_answers_count: [...answersByQuestion.values()]
            .reduce((total, answerIds) => total + answerIds.size, 0),
          correct_answers_count: scoring.selectedCorrectCount,
          wrong_answers_count: scoring.selectedWrongCount,
        },
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      message: "Eroare la trimiterea testului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Salvare automata
----------------------------
*/
// Actualizeaza raspunsurile temporare pe masura ce studentul bifeaza variantele.
async function autosaveStudentTest(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();
    const examResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, status
        FROM exams
        WHERE id = @examId
      `);

    if (examResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit.",
      });
    }

    if (examResult.recordset[0].status !== "active") {
      return res.status(403).json({
        message: "Examenul nu mai este activ.",
      });
    }

    const existingResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id
        FROM results
        WHERE student_id = @studentId AND exam_id = @examId
      `);

    if (existingResult.recordset.length > 0) {
      return res.json({
        message: "Testul este deja trimis.",
        saved: false,
      });
    }

    const assignment = await getStudentAssignment(pool, req.user.id, examId);

    if (!assignment) {
      return res.status(400).json({
        message: "Alege randul inainte sa rezolvi examenul.",
      });
    }

    const questions = await getVariantQuestionsForScoring(pool, assignment.variant_id);
    const answersByQuestion = normalizeSubmittedAnswers(req.body);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await saveDraftAnswers(transaction, req.user.id, examId, questions, answersByQuestion);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const savedCount = [...answersByQuestion.values()]
      .reduce((total, answerIds) => total + answerIds.size, 0);

    res.json({
      message: "Raspunsuri salvate automat.",
      saved: true,
      savedCount,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la salvarea automata.",
      error: error.message,
    });
  }
}

/*
----------------------------
      Evenimente test
----------------------------
*/
// Inregistreaza iesiri din fullscreen, pierdere focus si alte actiuni relevante in timpul testului.
async function recordStudentTestEvent(req, res) {
  try {
    const examId = Number(req.params.examId);
    const eventType = String(req.body.eventType || "").trim();
    const details = String(req.body.details || "").trim();

    if (!Number.isInteger(examId) || !eventType) {
      return res.status(400).json({
        message: "Eveniment invalid.",
      });
    }

    const pool = await getPool();
    await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .input("eventType", sql.NVarChar(50), eventType.slice(0, 50))
      .input("details", sql.NVarChar(500), details ? details.slice(0, 500) : null)
      .query(`
        INSERT INTO student_test_events (student_id, exam_id, event_type, details)
        VALUES (@studentId, @examId, @eventType, @details)
      `);

    await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .input("eventType", sql.NVarChar(50), eventType.slice(0, 50))
      .input("details", sql.NVarChar(500), details ? details.slice(0, 500) : null)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM student_test_locks
          WHERE student_id = @studentId
            AND exam_id = @examId
            AND is_active = 1
        )
        BEGIN
          UPDATE student_test_locks
          SET event_type = @eventType,
              details = @details,
              created_at = SYSUTCDATETIME()
          WHERE student_id = @studentId
            AND exam_id = @examId
            AND is_active = 1
        END
        ELSE
        BEGIN
          INSERT INTO student_test_locks (student_id, exam_id, event_type, details)
          VALUES (@studentId, @examId, @eventType, @details)
        END
      `);

    res.json({
      message: "Eveniment salvat.",
      locked: true,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la salvarea evenimentului.",
      error: error.message,
    });
  }
}

async function getStudentTestLockStatus(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();
    const lockResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, event_type, details, created_at
        FROM student_test_locks
        WHERE student_id = @studentId
          AND exam_id = @examId
          AND is_active = 1
        ORDER BY created_at DESC
      `);
    const resultCheck = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .input("examId", sql.Int, examId)
      .query(`
        SELECT TOP 1 id, score, max_score, grade, submitted_at
        FROM results
        WHERE student_id = @studentId AND exam_id = @examId
      `);
    const completedResult = resultCheck.recordset[0] || null;

    res.json({
      locked: lockResult.recordset.length > 0,
      lock: lockResult.recordset[0] || null,
      completed: Boolean(completedResult),
      isPlagiarism: Boolean(
        completedResult
        && completedResult.grade === null
        && Number(completedResult.score) === 0
        && Number(completedResult.max_score) === 0
      ),
      result: completedResult,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la verificarea blocarii testului.",
      error: error.message,
    });
  }
}

/*
----------------------------
      Heartbeat sesiune
----------------------------
*/
// Pastreaza sesiunea studentului activa si ajuta la blocarea conectarilor duplicate.
async function heartbeatStudentSession(req, res) {
  res.json({
    message: "Sesiune activa.",
  });
}

/*
----------------------------
       Rezultate student
----------------------------
*/
// Afiseaza catalogul studentului cu punctaj, nota si statistici de raspunsuri.
async function listStudentResults(req, res) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .query(`
        SELECT r.id, r.exam_id, r.score, r.max_score, r.grade, r.submitted_at,
               e.title, e.exam_date, e.status, s.id AS subject_id, s.name AS subject_name
        FROM results r
        INNER JOIN exams e ON e.id = r.exam_id
        INNER JOIN subjects s ON s.id = e.subject_id
        WHERE r.student_id = @studentId
        ORDER BY r.submitted_at DESC
      `);

    const statsResult = await pool
      .request()
      .input("studentId", sql.Int, req.user.id)
      .query(`
        SELECT sa.exam_id,
               SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers_count,
               SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_answers_count
        FROM student_answers sa
        INNER JOIN answers a ON a.id = sa.answer_id
        WHERE sa.student_id = @studentId AND sa.answer_id IS NOT NULL
        GROUP BY sa.exam_id
      `);

    const statsByExam = new Map(
      statsResult.recordset.map((row) => [Number(row.exam_id), row]),
    );
    const results = result.recordset.map((row) => {
      const stats = statsByExam.get(Number(row.exam_id));

      return {
        ...row,
        correct_answers_count: stats ? Number(stats.correct_answers_count) || 0 : 0,
        wrong_answers_count: stats ? Number(stats.wrong_answers_count) || 0 : 0,
      };
    });

    res.json({
      results,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea rezultatelor.",
      error: error.message,
    });
  }
}

/*
----------------------------
    Detalii rezultat student
----------------------------
*/
// Permite studentului sa vada doar sumarul permis pentru rezultatul propriu.
async function getStudentResultDetails(req, res) {
  try {
    const resultId = Number(req.params.id);

    if (!Number.isInteger(resultId)) {
      return res.status(400).json({
        message: "ID rezultat invalid.",
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input("resultId", sql.Int, resultId)
      .input("studentId", sql.Int, req.user.id)
      .query(`
        SELECT r.id AS result_id, r.score, r.max_score, r.grade, r.submitted_at,
               e.id AS exam_id, e.title AS exam_title, s.name AS subject_name,
               v.variant_name, v.row_number,
               q.id AS question_id, q.question_text, q.points,
               q.image_path, q.image_original_name,
               ans.id AS answer_id, ans.answer_text, ans.is_correct,
               CASE WHEN sa.id IS NULL THEN 0 ELSE 1 END AS is_selected
        FROM results r
        INNER JOIN exams e ON e.id = r.exam_id
        INNER JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN student_exam_assignments sea
          ON sea.student_id = r.student_id AND sea.exam_id = r.exam_id
        LEFT JOIN exam_variants v ON v.id = sea.variant_id
        INNER JOIN questions q ON q.variant_id = sea.variant_id
        LEFT JOIN answers ans ON ans.question_id = q.id
        LEFT JOIN student_answers sa
          ON sa.student_id = r.student_id
          AND sa.exam_id = r.exam_id
          AND sa.question_id = q.id
          AND sa.answer_id = ans.id
        WHERE r.id = @resultId AND r.student_id = @studentId
        ORDER BY q.id, ans.id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Rezultatul nu a fost gasit.",
      });
    }

    const first = result.recordset[0];
    const questionsMap = new Map();

    result.recordset.forEach((row) => {
      if (!questionsMap.has(row.question_id)) {
        questionsMap.set(row.question_id, {
          id: row.question_id,
          question_text: row.question_text,
          points: row.points,
          image_path: row.image_path,
          image_original_name: row.image_original_name,
          answers: [],
        });
      }

      if (row.answer_id) {
        questionsMap.get(row.question_id).answers.push({
          id: row.answer_id,
          answer_text: row.answer_text,
          is_correct: Boolean(row.is_correct),
          is_selected: Boolean(row.is_selected),
        });
      }
    });

    res.json({
      result: {
        id: first.result_id,
        score: first.score,
        max_score: first.max_score,
        grade: first.grade,
        submitted_at: first.submitted_at,
        exam_id: first.exam_id,
        exam_title: first.exam_title,
        subject_name: first.subject_name,
        variant_name: first.variant_name,
        row_number: first.row_number,
      },
      questions,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea detaliilor rezultatului.",
      error: error.message,
    });
  }
}

module.exports = {
  autosaveStudentTest,
  chooseStudentExamRow,
  getStudentTest,
  getStudentTestLockStatus,
  heartbeatStudentSession,
  listStudentExams,
  listStudentResults,
  recordStudentTestEvent,
  submitStudentTest,
};
