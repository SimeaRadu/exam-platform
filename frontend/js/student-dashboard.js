/*
----------------------------
 Initializare dashboard student
----------------------------
Se citesc elementele din pagina si se pregatesc variabilele globale ale sesiunii studentului.
*/
const user = requireAuth("student");
const studentName = document.getElementById("studentName");
const logoutButton = document.getElementById("logoutButton");
const refreshStudentExamsButton = document.getElementById("refreshStudentExamsButton");
const studentQuickMenuSection = document.getElementById("studentQuickMenuSection");
const studentSubjectsSection = document.getElementById("studentSubjectsSection");
const studentSubjectMenuSection = document.getElementById("studentSubjectMenuSection");
const subjectsList = document.getElementById("subjectsList");
const selectedSubjectTitle = document.getElementById("selectedSubjectTitle");
const backToSubjectsButton = document.getElementById("backToSubjectsButton");
const futureExamsList = document.getElementById("futureExamsList");
const activeExamsList = document.getElementById("activeExamsList");
const finishedExamsList = document.getElementById("finishedExamsList");
const subjectInfoText = document.getElementById("subjectInfoText");
const refreshStudentResultsButton = document.getElementById("refreshStudentResultsButton");
const studentResultsList = document.getElementById("studentResultsList");
const solveTestForm = document.getElementById("solveTestForm");
const solveTestTitle = document.getElementById("solveTestTitle");
const solveTestMeta = document.getElementById("solveTestMeta");
const solveTestMessage = document.getElementById("solveTestMessage");
const studentCalendarList = document.getElementById("studentCalendarList");
const studentHistoryList = document.getElementById("studentHistoryList");
const studentAnnouncementsList = document.getElementById("studentAnnouncementsList");
const studentProfileContent = document.getElementById("studentProfileContent");
const studentStatusList = document.getElementById("studentStatusList");
const studentRulesContent = document.getElementById("studentRulesContent");
const fullscreenLockOverlay = document.getElementById("fullscreenLockOverlay");
const fullscreenLockTitle = document.getElementById("fullscreenLockTitle");
const fullscreenLockMessage = document.getElementById("fullscreenLockMessage");

let studentExams = [];
let studentSubjects = [];
let studentResults = [];
let selectedSubject = null;
let selectedSubjectId = null;
let studentExamsLoaded = false;
let activeTest = null;
let selectedAnswersByQuestion = new Map();
let selectedRowsByExam = new Map();
let autosaveTimer = null;
let lastEventLogAt = new Map();
let isSubmittingTest = false;
let serverTestLockActive = false;
let localTestLockPending = false;

if (user) {
  studentName.textContent = user.full_name || "Student";
}

logoutButton.addEventListener("click", () => {
  apiRequest("/auth/logout", { method: "POST" }).catch(() => {}).finally(() => {
    clearSession();
    window.location.href = "login.html";
  });
});

/*
----------------------------
      Functii utilitare
----------------------------
Functii refolosite pentru text sigur in HTML, formatare data si gruparea materiilor.
*/
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const menuIconPaths = {
  archive: "M4 4h16v4H4V4Zm2 6h12v10H6V10Zm4 3v2h4v-2h-4Z",
  book: "M5 3h12a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3V5a2 2 0 0 1 1-2Zm2 2v10.2A3 3 0 0 1 7 15h10V5H7Zm0 12a1 1 0 0 0 0 2h10v-2H7Z",
  calendar: "M7 2h2v3h6V2h2v3h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10ZM6 12h4v4H6v-4Z",
  chart: "M4 19h16v2H2V3h2v16Zm3-2V9h3v8H7Zm5 0V5h3v12h-3Zm5 0v-6h3v6h-3Z",
  check: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm5.6 12.2L17.7 8l-1.8-1.7-5.3 5.4-2.5-2.5-1.8 1.8 4.3 4.2Z",
  clipboard: "M9 2h6a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2-2Zm0 4h6V4H9v2Zm-2 6h10v-2H7v2Zm0 4h7v-2H7v2Z",
  file: "M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V8h4.5L13 3.5ZM8 12h8v-2H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z",
  graduation: "M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.2V16c0 2.2 2.7 4 6 4s6-1.8 6-4v-3.8l-6 3.3-6-3.3Z",
  info: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 8h-2v7h2v-7Zm0-4h-2v2h2V6Z",
  megaphone: "M3 10v4h3l4 5h3l-3.2-5H11l8 4V6l-8 4H3Zm17-3.6v11.2a4 4 0 0 0 0-11.2Z",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-9 9a9 9 0 0 1 18 0H3Z",
  users: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 21a6 6 0 0 1 12 0H2Zm12.5 0a8 8 0 0 0-2-5.3A5.5 5.5 0 0 1 22 19.5V21h-7.5Z",
};

function renderMenuIcon(iconName) {
  const path = menuIconPaths[iconName] || menuIconPaths.book;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
}

function hydrateMenuIcons(root = document) {
  root.querySelectorAll(".menu-card-icon[data-menu-icon]").forEach((icon) => {
    icon.innerHTML = renderMenuIcon(icon.dataset.menuIcon);
  });
}

function getQuestionImages(question) {
  if (Array.isArray(question.images) && question.images.length > 0) {
    return question.images;
  }

  return question.image_path
    ? [{
      image_path: question.image_path,
      image_original_name: question.image_original_name,
    }]
    : [];
}

function renderQuestionImages(question) {
  return getQuestionImages(question).map((image) => `
    <img class="question-image" src="${escapeHtml(getFileUrl(image.image_path))}" alt="${escapeHtml(image.image_original_name || "Imagine intrebare")}">
  `).join("");
}

function formatExamDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusText(status) {
  if (status === "future") {
    return "Programat";
  }

  if (status === "active") {
    return "Inceput";
  }

  return "Terminat";
}

function isPlagiarismResult(result) {
  return result
    && result.grade === null
    && Number(result.score) === 0
    && Number(result.max_score) === 0;
}

function renderStudentGradeBadge(result) {
  if (isPlagiarismResult(result)) {
    return '<span class="status-badge status-plagiarism">Plagiat</span>';
  }

  return `<span class="status-badge status-active">Nota ${escapeHtml(result.grade)}</span>`;
}

function groupSubjects(subjects, exams) {
  const subjectGroups = new Map();

  subjects.forEach((subject) => {
    subjectGroups.set(String(subject.id), {
      id: subject.id,
      name: subject.name || "Fara materie",
      info: subject.info_text || "",
      rules: subject.rules_text || "",
      exams: [],
    });
  });

  exams.forEach((exam) => {
    const key = exam.subject_id ? String(exam.subject_id) : `name:${exam.subject_name}`;

    if (!subjectGroups.has(key)) {
      subjectGroups.set(key, {
        id: exam.subject_id || key,
        name: exam.subject_name || "Fara materie",
        info: exam.subject_info || "",
        rules: exam.subject_rules || "",
        exams: [],
      });
    }

    subjectGroups.get(key).exams.push(exam);
  });

  return [...subjectGroups.values()].sort((first, second) => first.name.localeCompare(second.name));
}

/*
----------------------------
          Materiile mele
----------------------------
Afiseaza materiile disponibile studentului si numara examenele pe status.
*/
function renderSubjects() {
  const subjects = groupSubjects(studentSubjects, studentExams);

  if (!subjects.length) {
    subjectsList.innerHTML = "<p>Nu exista materii cu examene disponibile.</p>";
    return;
  }

  subjectsList.innerHTML = subjects.map((subject) => {
    const activeCount = subject.exams.filter((exam) => exam.status === "active").length;
    const futureCount = subject.exams.filter((exam) => exam.status === "future").length;
    const finishedCount = subject.exams.filter((exam) => exam.status === "finished" || exam.status === "archived").length;

    return `
      <button class="admin-menu-card" type="button" data-open-subject="${escapeHtml(subject.id)}">
        <span class="menu-card-icon" data-menu-icon="book" aria-hidden="true"></span>
        <strong>${escapeHtml(subject.name)}</strong>
        <span>${futureCount} programate, ${activeCount} incepute, ${finishedCount} terminate</span>
      </button>
    `;
  }).join("");

  hydrateMenuIcons(subjectsList);
}

function renderExamList(container, exams, emptyText) {
  if (!exams.length) {
    container.innerHTML = `<p>${emptyText}</p>`;
    return;
  }

  container.innerHTML = exams.map((exam) => `
    <article class="exam-card">
      <div>
        <h3>${escapeHtml(exam.title)}</h3>
        <div class="exam-card-meta">
          <span>${formatExamDate(exam.exam_date)}</span>
        </div>
      </div>
      <span class="status-badge status-${escapeHtml(exam.status)}">
        ${getStatusText(exam.status)}
      </span>
      ${exam.status === "active" && !exam.has_result ? `
        ${renderExamRowPicker(exam)}
      ` : ""}
      ${exam.status === "active" && exam.has_result ? `
        <span class="muted-note">Trimis deja</span>
      ` : ""}
    </article>
  `).join("");
}

function getExamRowOptions(exam) {
  const rowsByNumber = new Map();

  (exam.row_options || []).forEach((variant) => {
    const rowNumber = Number(variant.row_number);

    if (Number.isInteger(rowNumber) && !rowsByNumber.has(rowNumber)) {
      rowsByNumber.set(rowNumber, variant);
    }
  });

  return [...rowsByNumber.values()]
    .sort((first, second) => Number(first.row_number) - Number(second.row_number));
}

function renderExamRowPicker(exam) {
  const rowOptions = getExamRowOptions(exam);
  const assignedRow = Number(exam.assigned_row_number);
  const hasAssignedRow = Number.isInteger(assignedRow);
  const locallySelectedRow = Number(selectedRowsByExam.get(String(exam.id)));
  const selectedRow = Number.isInteger(locallySelectedRow) ? locallySelectedRow : assignedRow;
  const hasSelectedRow = Number.isInteger(selectedRow);

  if (!rowOptions.length) {
    return `<span class="muted-note">Profesorul nu a setat randuri pentru variante.</span>`;
  }

  return `
    <div class="exam-start-controls">
      <label class="compact-field">
        <select data-exam-row-select="${exam.id}">
          <option value="">Alege randul</option>
          ${rowOptions.map((variant) => `
            <option value="${escapeHtml(variant.row_number)}" ${hasSelectedRow && selectedRow === Number(variant.row_number) ? "selected" : ""}>
              Rand ${escapeHtml(variant.row_number)}
            </option>
          `).join("")}
        </select>
      </label>
      <button
        class="primary-button"
        type="button"
        data-start-test="${exam.id}"
        ${hasSelectedRow ? "" : "disabled"}
      >
        Rezolva
      </button>
    </div>
  `;
}

function getSubjectName(subjectId) {
  const subject = groupSubjects(studentSubjects, studentExams)
    .find((item) => String(item.id) === String(subjectId));

  return subject?.name || "Fara materie";
}

function getExamStatusDetail(exam) {
  if (exam.status === "active" && exam.has_result) {
    return "Trimis";
  }

  if (exam.status === "active") {
    return "Activ / netrimis";
  }

  if (exam.status === "future") {
    return "Programat";
  }

  return "Finalizat";
}

/*
----------------------------
       Meniu principal student
----------------------------
Construieste cardurile globale: calendar, catalog, anunturi, profil, status si reguli.
*/
function renderGlobalStudentPanels() {
  const subjectGroups = groupSubjects(studentSubjects, studentExams);
  const calendarExams = [...studentExams]
    .filter((exam) => ["future", "active"].includes(exam.status))
    .sort((first, second) => new Date(first.exam_date).getTime() - new Date(second.exam_date).getTime());

  studentCalendarList.innerHTML = calendarExams.length
    ? calendarExams.map((exam) => `
      <article class="exam-card">
        <div>
          <h3>${escapeHtml(exam.title)}</h3>
          <div class="exam-card-meta">
            <span>${escapeHtml(exam.subject_name)}</span>
            <span>${formatExamDate(exam.exam_date)}</span>
          </div>
        </div>
        <span class="status-badge status-${escapeHtml(exam.status)}">${getStatusText(exam.status)}</span>
      </article>
    `).join("")
    : "<p>Nu exista examene viitoare sau active.</p>";

  studentHistoryList.innerHTML = studentResults.length
    ? studentResults.map((result) => `
      <article class="exam-card">
        <div>
          <h3>${escapeHtml(result.title)}</h3>
          <div class="exam-card-meta">
            <span>${escapeHtml(result.subject_name)}</span>
            <span>${formatExamDate(result.submitted_at)}</span>
            <span>${escapeHtml(result.score)} / ${escapeHtml(result.max_score)} puncte</span>
          </div>
        </div>
        ${renderStudentGradeBadge(result)}
      </article>
    `).join("")
    : "<p>Nu exista note salvate.</p>";

  const subjectsWithAnnouncements = subjectGroups
    .filter((subject) => subject.info && subject.info.trim());

  studentAnnouncementsList.innerHTML = subjectsWithAnnouncements.length
    ? subjectsWithAnnouncements.map((subject) => `
      <article class="exam-card">
        <div>
          <h3>${escapeHtml(subject.name)}</h3>
          <p class="preserve-lines">${escapeHtml(subject.info)}</p>
        </div>
      </article>
    `).join("")
    : "<p>Nu exista anunturi publicate.</p>";

  studentProfileContent.innerHTML = `
    <article class="profile-item">
      <span>Nume</span>
      <strong>${escapeHtml(user.full_name || "-")}</strong>
    </article>
    <article class="profile-item">
      <span>Email</span>
      <strong>${escapeHtml(user.email || "-")}</strong>
    </article>
    <article class="profile-item">
      <span>Grupa</span>
      <strong>${escapeHtml(user.matriculation_number || "-")}</strong>
    </article>
  `;

  const finishedStatusExams = studentExams
    .filter((exam) => exam.status === "finished" || exam.status === "archived");

  studentStatusList.innerHTML = finishedStatusExams.length
    ? [...finishedStatusExams]
      .sort((first, second) => new Date(first.exam_date).getTime() - new Date(second.exam_date).getTime())
      .map((exam) => `
        <article class="exam-card">
          <div>
            <h3>${escapeHtml(exam.title)}</h3>
            <div class="exam-card-meta">
              <span>${escapeHtml(getSubjectName(exam.subject_id))}</span>
              <span>${formatExamDate(exam.exam_date)}</span>
              <span>${escapeHtml(getExamStatusDetail(exam))}</span>
            </div>
          </div>
          <span class="status-badge status-${escapeHtml(exam.status)}">${getStatusText(exam.status)}</span>
        </article>
      `).join("")
    : "<p>Nu exista examene finalizate.</p>";

  const subjectsWithRules = selectedSubjectId
    ? subjectGroups.filter((subject) => String(subject.id) === String(selectedSubjectId))
    : subjectGroups;
  const visibleRules = subjectsWithRules.filter((subject) => subject.rules && subject.rules.trim());

  studentRulesContent.innerHTML = visibleRules.length
    ? visibleRules.map((subject) => `
      <article class="exam-card">
        <div>
          <h3>${escapeHtml(subject.name)}</h3>
          <p class="preserve-lines">${escapeHtml(subject.rules)}</p>
        </div>
      </article>
    `).join("")
    : `
      <p>Citeste intrebarile atent inainte sa selectezi raspunsurile.</p>
      <p>Dupa trimitere, testul nu mai poate fi modificat.</p>
      <p>La intrebarile cu raspunsuri multiple, un raspuns gresit selectat anuleaza un raspuns corect doar in cadrul acelei intrebari.</p>
      <p>Daca ai o problema tehnica, anunta profesorul inainte sa trimiti testul.</p>
    `;
}

function showStudentMainSection(sectionId) {
  document.querySelectorAll(".student-main-section").forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });
}

function showSubjectSubsection(sectionId) {
  document.querySelectorAll(".student-subsection").forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });
}

/*
----------------------------
        Meniu materie aleasa
----------------------------
Deschide o materie si filtreaza examenele, notele si informatiile doar pentru acea materie.
*/
function openSubject(subjectId) {
  const subject = groupSubjects(studentSubjects, studentExams)
    .find((item) => String(item.id) === String(subjectId));

  selectedSubjectId = subject?.id || null;
  selectedSubject = subject?.name || "Materie";
  selectedSubjectTitle.textContent = selectedSubject;
  subjectInfoText.textContent = subject?.info
    ? subject.info
    : "Nu exista informatii publicate pentru aceasta materie.";

  renderSelectedSubjectExams();

  studentQuickMenuSection.classList.add("hidden");
  studentSubjectsSection.classList.add("hidden");
  studentSubjectMenuSection.classList.remove("hidden");
  showSubjectSubsection("subjectExamsPanel");
}

function renderSelectedSubjectExams() {
  if (!selectedSubject) {
    return;
  }

  const subjectExams = studentExams.filter((exam) => String(exam.subject_id) === String(selectedSubjectId));
  const future = subjectExams.filter((exam) => exam.status === "future");
  const active = subjectExams.filter((exam) => exam.status === "active");
  const finished = subjectExams.filter((exam) => exam.status === "finished" || exam.status === "archived");

  renderExamList(futureExamsList, future, "Nu exista examene programate.");
  renderExamList(activeExamsList, active, "Nu exista examene incepute.");
  renderExamList(finishedExamsList, finished, "Nu exista examene terminate.");
}

/*
----------------------------
              Catalog
----------------------------
Afiseaza rezultatele studentului, fie global, fie doar pentru materia selectata.
*/
function renderStudentResults() {
  const visibleResults = selectedSubject
    ? studentResults.filter((result) => String(result.subject_id) === String(selectedSubjectId))
    : studentResults;

  if (!visibleResults.length) {
    studentResultsList.innerHTML = "<p>Nu exista note salvate pentru aceasta materie.</p>";
    return;
  }

  studentResultsList.innerHTML = visibleResults.map((result) => `
    <article class="exam-card">
      <div>
        <h3>${escapeHtml(result.title)}</h3>
        <div class="exam-card-meta">
          <span>${escapeHtml(result.subject_name)}</span>
          <span>${formatExamDate(result.submitted_at)}</span>
          <span>${escapeHtml(result.score)} / ${escapeHtml(result.max_score)} puncte</span>
          <span>Raspunsuri corecte: ${escapeHtml(result.correct_answers_count || 0)}</span>
          <span>Raspunsuri gresite selectate: ${escapeHtml(result.wrong_answers_count || 0)}</span>
        </div>
      </div>
      ${renderStudentGradeBadge(result)}
    </article>
  `).join("");
}

/*
----------------------------
          Rezolvare test
----------------------------
Randarea testului creeaza intrebarile, raspunsurile selectabile si regulile de examen.
*/
function renderTestForm(test) {
  solveTestTitle.textContent = test.exam.title;
  solveTestMeta.textContent = `${test.exam.subject_name} - ${test.variant.variant_name}`;
  selectedAnswersByQuestion = new Map();

  if (!test.questions.length) {
    solveTestForm.innerHTML = "<p>Acest test nu are intrebari.</p>";
    return;
  }

  solveTestForm.innerHTML = `
    <section class="test-question">
      <div class="question-title">
        <strong>Reguli examen</strong>
      </div>
      <p class="preserve-lines">${
        escapeHtml(test.exam.subject_rules || "Citeste intrebarile atent. Dupa trimitere, testul nu mai poate fi modificat.")
      }</p>
    </section>
    <p class="message form-message">
      Raspunsuri selectate: <strong id="selectedAnswersCount">0</strong>
    </p>
    ${test.questions.map((question, questionIndex) => `
      <section class="test-question" data-question-id="${question.id}">
        <div class="question-title">
          <strong>${questionIndex + 1}. ${escapeHtml(question.question_text)}</strong>
          <span class="muted-note">${escapeHtml(question.points)} puncte</span>
        </div>
        ${renderQuestionImages(question)}
        <div class="test-answer-grid">
          ${question.answers.map((answer) => `
            <button
              class="check-card answer-option"
              type="button"
              data-question-id="${question.id}"
              data-answer-id="${answer.id}"
              aria-pressed="false"
            >
              <span class="check-mark" aria-hidden="true">*</span>
              <span>${escapeHtml(answer.answer_text)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("")}
    <button class="primary-button" type="submit">Trimite testul</button>
  `;

  (test.draftAnswers || []).forEach((draft) => {
    (draft.answerIds || []).forEach((answerId) => {
      const card = solveTestForm.querySelector(
        `.answer-option[data-question-id="${draft.questionId}"][data-answer-id="${answerId}"]`,
      );

      if (card) {
        card.classList.add("is-selected");
        syncSelectedAnswer(card);
      }
    });
  });
}

function updateSelectedAnswersCount() {
  const counter = document.getElementById("selectedAnswersCount");

  if (!counter) {
    return;
  }

  const count = [...selectedAnswersByQuestion.values()]
    .reduce((total, answerIds) => total + answerIds.size, 0);

  counter.textContent = String(count);
}

function setFullscreenLock(isLocked) {
  if (!fullscreenLockOverlay) {
    return;
  }

  if (fullscreenLockTitle && fullscreenLockMessage) {
    fullscreenLockTitle.textContent = "Test blocat";
    fullscreenLockMessage.textContent = "A fost detectat un eveniment in timpul testului. Asteapta aprobarea profesorului ca sa continui.";
  }

  fullscreenLockOverlay.classList.toggle("hidden", !isLocked);
  document.body.classList.toggle("test-fullscreen-locked", isLocked);
  solveTestForm.querySelectorAll("button, input").forEach((element) => {
    element.disabled = isLocked;
  });
}

function activateTestLock() {
  serverTestLockActive = true;
  localTestLockPending = true;
  setFullscreenLock(true);
}

function enforceFullscreenLock() {
  if (!activeTest || isSubmittingTest) {
    setFullscreenLock(false);
    return;
  }

  setFullscreenLock(serverTestLockActive || localTestLockPending);
}

/*
----------------------------
       Salvare raspunsuri live
----------------------------
Raspunsurile sunt salvate automat in draft, astfel incat testul poate fi reluat dupa o problema.
*/
function buildCurrentAnswersPayload() {
  if (!activeTest) {
    return {
      answers: [],
      selectedAnswers: [],
    };
  }

  const answers = activeTest.questions.map((question) => ({
    questionId: question.id,
    answerIds: selectedAnswersByQuestion.has(Number(question.id))
      ? [...selectedAnswersByQuestion.get(Number(question.id))]
      : [],
  }));
  const selectedAnswers = answers.flatMap((answer) => (
    answer.answerIds.map((answerId) => ({
      questionId: answer.questionId,
      answerId,
    }))
  ));

  return {
    answers,
    selectedAnswers,
  };
}

async function autosaveCurrentAnswers() {
  if (!activeTest) {
    return;
  }

  const payload = buildCurrentAnswersPayload();

  try {
    const data = await apiRequest(`/student/exams/${activeTest.exam.id}/autosave`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (data.saved) {
      solveTestMessage.textContent = `Salvat automat: ${data.savedCount || 0} raspunsuri selectate.`;
      solveTestMessage.className = "message form-message success";
    }
  } catch (error) {
    solveTestMessage.textContent = "Conexiunea a cazut sau salvarea automata a esuat. Raspunsurile se vor salva din nou cand revine conexiunea.";
    solveTestMessage.className = "message form-message error";
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveCurrentAnswers, 350);
}

async function logTestEvent(eventType, details = "") {
  if (!activeTest) {
    return;
  }

  activateTestLock();

  const now = Date.now();
  const lastLogged = lastEventLogAt.get(eventType) || 0;

  if (now - lastLogged < 1500) {
    return;
  }

  lastEventLogAt.set(eventType, now);

  try {
    const data = await apiRequest(`/student/exams/${activeTest.exam.id}/events`, {
      method: "POST",
      body: JSON.stringify({ eventType, details }),
    });

    serverTestLockActive = Boolean(data.locked);
    localTestLockPending = !serverTestLockActive;
    setFullscreenLock(serverTestLockActive || localTestLockPending);
  } catch (error) {
    solveTestMessage.textContent = "Testul este blocat, dar notificarea nu a ajuns la server. Verifica conexiunea sau anunta profesorul.";
    solveTestMessage.className = "message form-message error";
    activateTestLock();
  }
}

async function refreshTestLockStatus() {
  if (!activeTest || isSubmittingTest) {
    return;
  }

  try {
    const data = await apiRequest(`/student/exams/${activeTest.exam.id}/lock-status`);

    if (data.completed) {
      clearTimeout(autosaveTimer);
      activeTest = null;
      serverTestLockActive = false;
      localTestLockPending = false;
      setFullscreenLock(false);
      await exitTestFullscreen();
      await Promise.all([loadStudentExams({ silent: true }), loadStudentResults({ silent: true })]);
      solveTestMessage.textContent = data.isPlagiarism
        ? "Testul a fost incheiat de profesor si marcat ca plagiat."
        : "Testul a fost incheiat.";
      solveTestMessage.className = data.isPlagiarism
        ? "message form-message error"
        : "message form-message success";
      showSubjectSubsection("subjectExamsPanel");
      studentSubjectMenuSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    serverTestLockActive = Boolean(data.locked);

    if (serverTestLockActive) {
      localTestLockPending = false;
      setFullscreenLock(true);
      return;
    }

    if (localTestLockPending) {
      setFullscreenLock(true);
      return;
    }

    setFullscreenLock(false);
  } catch (error) {
    // Daca verificarea cade, lasam starea curenta neschimbata ca sa nu deblocam gresit testul.
  }
}

/*
----------------------------
      Fullscreen in timpul testului
----------------------------
Gestioneaza intrarea si revenirea in fullscreen in timpul rezolvarii testului.
*/
async function enterTestFullscreen() {
  try {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) {
      await refreshTestLockStatus();

      if (!serverTestLockActive && !localTestLockPending) {
        setFullscreenLock(false);
      }

      return;
    }

    await document.documentElement.requestFullscreen();
    await refreshTestLockStatus();

    if (!serverTestLockActive && !localTestLockPending) {
      setFullscreenLock(false);
    }
  } catch (error) {
    setFullscreenLock(true);
    logTestEvent("fullscreen_refused", "Browserul nu a permis fullscreen.");
  }
}

async function exitTestFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (error) {
    // Iesirea din fullscreen este best-effort.
  }
}

function syncSelectedAnswer(card) {
  const questionId = Number(card.dataset.questionId);
  const answerId = Number(card.dataset.answerId);
  const isSelected = card.classList.contains("is-selected");

  card.setAttribute("aria-pressed", isSelected ? "true" : "false");

  if (!Number.isInteger(questionId) || !Number.isInteger(answerId)) {
    return;
  }

  if (!selectedAnswersByQuestion.has(questionId)) {
    selectedAnswersByQuestion.set(questionId, new Set());
  }

  const selectedAnswers = selectedAnswersByQuestion.get(questionId);

  if (isSelected) {
    selectedAnswers.add(answerId);
  } else {
    selectedAnswers.delete(answerId);
  }

  updateSelectedAnswersCount();
}

/*
----------------------------
       Incarcare date student
----------------------------
Se cer din API materiile, examenele si rezultatele disponibile pentru studentul autentificat.
*/
function showSubjects() {
  selectedSubject = null;
  selectedSubjectId = null;
  studentQuickMenuSection.classList.remove("hidden");
  studentSubjectMenuSection.classList.add("hidden");
  showStudentMainSection("studentSubjectsSection");
}

async function loadStudentExams(options = {}) {
  const silent = options.silent === true;

  if (silent && document.activeElement?.matches("[data-exam-row-select]")) {
    return;
  }

  if (!silent && !studentExamsLoaded) {
    subjectsList.innerHTML = "<p>Se incarca...</p>";
  }

  try {
    const data = await apiRequest("/student/exams");
    studentSubjects = data.subjects || [];
    studentExams = data.exams;
    studentExamsLoaded = true;

    if (selectedSubject) {
      renderSubjects();
      renderSelectedSubjectExams();
    } else {
      renderSubjects();
    }

    renderGlobalStudentPanels();
  } catch (error) {
    if (!silent) {
      subjectsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }
}

async function loadStudentResults(options = {}) {
  const silent = options.silent === true;

  if (!silent) {
    studentResultsList.innerHTML = "<p>Se incarca...</p>";
  }

  try {
    const data = await apiRequest("/student/results");
    studentResults = data.results;
    renderStudentResults();
    renderGlobalStudentPanels();
  } catch (error) {
    if (!silent) {
      studentResultsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }
}

/*
----------------------------
        Deschidere examen
----------------------------
Incarca varianta asignata studentului si porneste modul de rezolvare a testului.
*/
async function openTest(examId, rowNumber = null) {
  solveTestMessage.textContent = "";
  solveTestForm.innerHTML = "<p>Se incarca testul...</p>";
  showSubjectSubsection("solveTestPanel");
  isSubmittingTest = false;
  serverTestLockActive = false;
  localTestLockPending = false;
  setFullscreenLock(false);

  try {
    const exam = studentExams.find((item) => String(item.id) === String(examId));
    const assignedRow = Number(exam?.assigned_row_number);
    const chosenRow = Number(rowNumber);

    if (!Number.isInteger(chosenRow)) {
      throw new Error("Alege randul inainte sa pornesti examenul.");
    }

    if (!Number.isInteger(assignedRow) || assignedRow !== chosenRow) {
      await apiRequest(`/student/exams/${examId}/row`, {
        method: "POST",
        body: JSON.stringify({ rowNumber: chosenRow }),
      });
    }

    const data = await apiRequest(`/student/exams/${examId}/test`);
    activeTest = data;
    renderTestForm(data);
    await enterTestFullscreen();
    if ((data.draftAnswers || []).length) {
      solveTestMessage.textContent = "Am incarcat raspunsurile salvate anterior.";
      solveTestMessage.className = "message form-message success";
    }
  } catch (error) {
    solveTestForm.innerHTML = "";
    solveTestMessage.textContent = error.message;
    solveTestMessage.className = "message form-message error";
  }
}

subjectsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-subject]");

  if (!button) {
    return;
  }

  openSubject(button.dataset.openSubject);
});

activeExamsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-start-test]");

  if (!button) {
    return;
  }

  if (button.disabled) {
    return;
  }

  const rowSelect = activeExamsList.querySelector(`[data-exam-row-select="${button.dataset.startTest}"]`);
  button.disabled = true;
  openTest(button.dataset.startTest, rowSelect?.value || null).finally(() => {
    if (!activeTest) {
      button.disabled = !rowSelect?.value;
    }
  });
});

activeExamsList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-exam-row-select]");

  if (!select) {
    return;
  }

  if (select.value) {
    selectedRowsByExam.set(String(select.dataset.examRowSelect), select.value);
  } else {
    selectedRowsByExam.delete(String(select.dataset.examRowSelect));
  }

  const button = activeExamsList.querySelector(`[data-start-test="${select.dataset.examRowSelect}"]`);

  if (button) {
    button.disabled = !select.value;
  }
});

solveTestForm.addEventListener("click", (event) => {
  const card = event.target.closest(".answer-option[data-question-id][data-answer-id]");

  if (!card || card.disabled) {
    return;
  }

  card.classList.toggle("is-selected");
  syncSelectedAnswer(card);
  scheduleAutosave();
});

document.querySelectorAll("[data-student-subsection]").forEach((button) => {
  button.addEventListener("click", () => {
    showSubjectSubsection(button.dataset.studentSubsection);

    if (button.dataset.studentSubsection === "subjectGradesPanel") {
      loadStudentResults();
    }
  });
});

document.querySelectorAll("[data-student-main-section]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.dataset.studentMainSection === "studentHistorySection") {
      await loadStudentResults();
    }

    renderGlobalStudentPanels();
    showStudentMainSection(button.dataset.studentMainSection);
  });
});

document.querySelectorAll("[data-close-student-main]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".student-main-section").forEach((section) => {
      section.classList.add("hidden");
    });
  });
});

backToSubjectsButton.addEventListener("click", showSubjects);
refreshStudentExamsButton.addEventListener("click", loadStudentExams);
refreshStudentResultsButton.addEventListener("click", loadStudentResults);

solveTestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeTest) {
    return;
  }

  clearTimeout(autosaveTimer);
  localTestLockPending = false;
  await autosaveCurrentAnswers();

  const {
    answers,
    selectedAnswers,
  } = buildCurrentAnswersPayload();

  if (!selectedAnswers.length) {
    solveTestMessage.textContent = "Selecteaza cel putin un raspuns inainte sa trimiti testul.";
    solveTestMessage.className = "message form-message error";
    return;
  }

  solveTestMessage.textContent = "Se trimite testul...";
  solveTestMessage.className = "message form-message";
  isSubmittingTest = true;
  setFullscreenLock(false);
  solveTestForm.querySelectorAll("button, input").forEach((element) => {
    element.disabled = true;
  });

  try {
    const data = await apiRequest(`/student/exams/${activeTest.exam.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers, selectedAnswers }),
    });

    solveTestMessage.textContent = `Test trimis. Nota: ${data.result.grade}. Raspunsuri salvate: ${data.result.selected_answers_count || 0}`;
    solveTestMessage.className = "message form-message success";
    await Promise.all([loadStudentExams({ silent: true }), loadStudentResults({ silent: true })]);
    activeTest = null;
    serverTestLockActive = false;
    localTestLockPending = false;
    await exitTestFullscreen();
    isSubmittingTest = false;
    showSubjectSubsection("subjectExamsPanel");
    studentSubjectMenuSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    solveTestMessage.textContent = error.message;
    solveTestMessage.className = "message form-message error";
    isSubmittingTest = false;
    solveTestForm.querySelectorAll("button, input").forEach((element) => {
      element.disabled = false;
    });
  }
});

hydrateMenuIcons();
loadStudentExams();
setInterval(() => {
  apiRequest("/student/heartbeat", { method: "POST" }).catch(() => {});
  loadStudentExams({ silent: true });
  loadStudentResults({ silent: true });
  refreshTestLockStatus();
}, 3000);

document.addEventListener("keydown", (event) => {
  if (!activeTest) {
    return;
  }

  if (event.key === "Escape" || event.altKey || (event.key === "Tab" && event.altKey)) {
    event.preventDefault();
    event.stopPropagation();
    activateTestLock();

    if (event.altKey && event.key === "Tab") {
      logTestEvent("alt_tab", "Studentul a incercat sa schimbe fereastra cu Alt+Tab.");
      return;
    }

    logTestEvent("blocked_key", event.key === "Escape" ? "Escape" : "Alt");
  }
}, true);

document.addEventListener("fullscreenchange", () => {
  if (activeTest && !document.fullscreenElement && !isSubmittingTest) {
    activateTestLock();
    logTestEvent("fullscreen_exit", "Studentul a iesit din fullscreen.");
    return;
  }

  enforceFullscreenLock();
});

document.addEventListener("visibilitychange", () => {
  if (activeTest && document.visibilityState === "hidden") {
    activateTestLock();
    logTestEvent("tab_hidden", "Pagina testului nu mai este vizibila.");
  }
});

window.addEventListener("blur", () => {
  if (activeTest && !isSubmittingTest) {
    activateTestLock();
    logTestEvent("window_blur", "Fereastra testului a pierdut focusul.");
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!activeTest) {
    return;
  }

  const token = getToken();
  const payload = buildCurrentAnswersPayload();

  if (token) {
    fetch(`${API_BASE_URL}/student/exams/${activeTest.exam.id}/autosave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  event.preventDefault();
  event.returnValue = "";
});


setInterval(enforceFullscreenLock, 700);
