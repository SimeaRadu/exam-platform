/*
----------------------------
  Initializare dashboard admin
----------------------------
Se verifica sesiunea profesorului/adminului si se leaga elementele HTML folosite in pagina.
*/
const user = requireAuth("professor");
const professorName = document.getElementById("professorName");
const logoutButton = document.getElementById("logoutButton");
const createUserForm = document.getElementById("createUserForm");
const createUserMessage = document.getElementById("createUserMessage");
const usersTableBody = document.getElementById("usersTableBody");
const refreshUsersButton = document.getElementById("refreshUsersButton");
const roleSelect = document.getElementById("role");
const emailField = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");
const createUserPanel = document.getElementById("createUserPanel");
const importUsersPanel = document.getElementById("importUsersPanel");
const importUsersForm = document.getElementById("importUsersForm");
const importUsersMessage = document.getElementById("importUsersMessage");
const readonlyUsersNotice = document.getElementById("readonlyUsersNotice");
const adminMenuSection = document.getElementById("adminMenuSection");
const dashboardSections = document.querySelectorAll(".dashboard-section");
const createSubjectForm = document.getElementById("createSubjectForm");
const createSubjectMessage = document.getElementById("createSubjectMessage");
const subjectProfessor = document.getElementById("subjectProfessor");
const subjectAdminPanel = document.getElementById("subjectAdminPanel");
const subjectReadonlyNotice = document.getElementById("subjectReadonlyNotice");
const subjectAssignmentPanel = document.getElementById("subjectAssignmentPanel");
const assignSubjectForm = document.getElementById("assignSubjectForm");
const assignSubject = document.getElementById("assignSubject");
const assignProfessor = document.getElementById("assignProfessor");
const clearSubjectAssignmentButton = document.getElementById("clearSubjectAssignmentButton");
const assignSubjectMessage = document.getElementById("assignSubjectMessage");
const subjectInfoForm = document.getElementById("subjectInfoForm");
const infoSubject = document.getElementById("infoSubject");
const subjectInfo = document.getElementById("subjectInfo");
const subjectRules = document.getElementById("subjectRules");
const subjectInfoMessage = document.getElementById("subjectInfoMessage");
const subjectsList = document.getElementById("subjectsList");
const createExamForm = document.getElementById("createExamForm");
const createExamMessage = document.getElementById("createExamMessage");
const examSubject = document.getElementById("examSubject");
const examsTableBody = document.getElementById("examsTableBody");
const refreshExamsButton = document.getElementById("refreshExamsButton");
const variantExamsTableBody = document.getElementById("variantExamsTableBody");
const refreshVariantExamsButton = document.getElementById("refreshVariantExamsButton");
const archiveList = document.getElementById("archiveList");
const refreshArchiveButton = document.getElementById("refreshArchiveButton");
const variantsPanel = document.getElementById("variantsPanel");
const variantsPanelTitle = document.getElementById("variantsPanelTitle");
const variantsEmptyPanel = document.getElementById("variantsEmptyPanel");
const closeVariantsPanelButton = document.getElementById("closeVariantsPanelButton");
const createVariantForm = document.getElementById("createVariantForm");
const createVariantMessage = document.getElementById("createVariantMessage");
const variantRtfImportForm = document.getElementById("variantRtfImportForm");
const variantRtfImportMessage = document.getElementById("variantRtfImportMessage");
const createQuestionForm = document.getElementById("createQuestionForm");
const createQuestionMessage = document.getElementById("createQuestionMessage");
const questionVariant = document.getElementById("questionVariant");
const variantsList = document.getElementById("variantsList");
const assignmentsPanel = document.getElementById("assignmentsPanel");
const assignmentsPanelTitle = document.getElementById("assignmentsPanelTitle");
const closeAssignmentsPanelButton = document.getElementById("closeAssignmentsPanelButton");
const assignmentsTableBody = document.getElementById("assignmentsTableBody");
const assignmentsMessage = document.getElementById("assignmentsMessage");
const assignmentsPanelDescription = document.getElementById("assignmentsPanelDescription");
const randomAssignmentsButton = document.getElementById("randomAssignmentsButton");
const rtfImportForm = document.getElementById("rtfImportForm");
const rtfImportMessage = document.getElementById("rtfImportMessage");
const rtfExam = document.getElementById("rtfExam");
const refreshResultsButton = document.getElementById("refreshResultsButton");
const resultsExamList = document.getElementById("resultsExamList");
const examResultsPanel = document.getElementById("examResultsPanel");
const examResultsTitle = document.getElementById("examResultsTitle");
const examResultsMeta = document.getElementById("examResultsMeta");
const backToResultExamsButton = document.getElementById("backToResultExamsButton");
const downloadResultsExcelButton = document.getElementById("downloadResultsExcelButton");
const resultsTableBody = document.getElementById("resultsTableBody");
const resultDetailsPanel = document.getElementById("resultDetailsPanel");
const resultDetailsTitle = document.getElementById("resultDetailsTitle");
const resultDetailsMeta = document.getElementById("resultDetailsMeta");
const resultDetailsContent = document.getElementById("resultDetailsContent");
const closeResultDetailsButton = document.getElementById("closeResultDetailsButton");
const testLockNotifications = document.getElementById("testLockNotifications");
let canManageUsers = user && user.unique_code === "PROF-ADMIN";
let allExams = [];
let examFilter = "all";
let activeSectionId = "menu";
let selectedExamForVariants = null;
let variantsReturnSectionId = "variantsSection";
let selectedExamVariants = [];
let selectedExamForAssignments = null;
let assignmentVariants = [];
let assignmentsReadOnly = false;
let allSubjects = [];
let allProfessors = [];
let allResults = [];
let selectedResultsExamId = null;
let selectedResultDetailsId = null;
let canManageAccounts = true;
let activeTestLocks = [];

if (user) {
  professorName.textContent = user.full_name || "Profesor";
}

/*
----------------------------
       Navigare meniu
----------------------------
Controleaza afisarea sectiunilor din dashboard fara a reincarca pagina.
*/
function showAdminMenu() {
  activeSectionId = "menu";
  adminMenuSection.classList.remove("hidden");
  dashboardSections.forEach((section) => section.classList.add("hidden"));
  professorName.textContent = "Meniu principal";
}

function showDashboardSection(sectionId) {
  activeSectionId = sectionId;
  adminMenuSection.classList.add("hidden");
  dashboardSections.forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });

  if (sectionId === "usersSection") {
    professorName.textContent = "Administrare utilizatori";
    loadUsers();
    return;
  }

  if (sectionId === "subjectsSection") {
    professorName.textContent = "Materii";
    loadSubjects();
    return;
  }

  if (sectionId === "subjectInfoSection") {
    professorName.textContent = "Informatii materie";
    loadSubjects();
    return;
  }

  if (sectionId === "examsSection") {
    professorName.textContent = "Examene";
    loadExamData();
    return;
  }

  if (sectionId === "variantsSection") {
    professorName.textContent = "Variante";
    variantsPanel.classList.toggle("hidden", !selectedExamForVariants);
    variantsEmptyPanel.classList.toggle("hidden", Boolean(selectedExamForVariants));
    loadExams({ silent: true });
    return;
  }

  if (sectionId === "archiveSection") {
    professorName.textContent = "Arhiva";
    loadExams();
    loadResults({ silent: true });
    return;
  }

  if (sectionId === "rtfSection") {
    professorName.textContent = "Import RTF";
    loadRtfExams();
    return;
  }

  professorName.textContent = "Rezultate";
  loadResults();
}

function setCreateMessage(text, type) {
  createUserMessage.textContent = text;
  createUserMessage.className = `message form-message ${type}`;
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message form-message ${type}`;
}

/*
----------------------------
      Functii utilitare
----------------------------
Functii comune pentru afisare sigura, mesaje, parole si campuri dependente de rol.
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

function updateRoleFields() {
  const isProfessor = roleSelect.value === "professor";

  passwordField.classList.toggle("hidden", !isProfessor);

  document.getElementById("email").required = isProfessor;
  document.getElementById("password").required = isProfessor;
}

/*
----------------------------
          Utilizatori
----------------------------
Afiseaza utilizatorii grupati pe grupe, permite import Excel si stergere doar pentru admin.
*/
function renderUsers(users) {
  if (!users.length) {
    usersTableBody.innerHTML = `<tr><td colspan="${canManageAccounts ? 6 : 4}">Nu exista utilizatori.</td></tr>`;
    return;
  }

  const columnsCount = canManageAccounts ? 6 : 4;
  const students = users
    .filter((item) => item.role === "student")
    .sort((first, second) => {
      const firstGroup = first.matriculation_number || "Fara grupa";
      const secondGroup = second.matriculation_number || "Fara grupa";

      return firstGroup.localeCompare(secondGroup, "ro")
        || String(first.full_name || "").localeCompare(String(second.full_name || ""), "ro");
    });
  const professors = users
    .filter((item) => item.role !== "student")
    .sort((first, second) => String(first.full_name || "").localeCompare(String(second.full_name || ""), "ro"));
  const rows = [];
  let currentGroup = null;

  function renderUserRow(item) {
    return `
    <tr>
      <td>${escapeHtml(item.full_name) || "-"}</td>
      <td>${escapeHtml(item.role) || "-"}</td>
      <td>${escapeHtml(item.email) || "-"}</td>
      <td>${escapeHtml(item.matriculation_number) || "-"}</td>
      ${canManageAccounts ? `
        <td>
          <div class="secret-cell">
            <span data-secret-value="${escapeHtml(item.unique_code)}">••••••</span>
            <button class="icon-button table-eye-button" type="button" data-toggle-secret aria-label="Arata codul unic">
              <span class="eye-icon" aria-hidden="true"></span>
            </button>
          </div>
        </td>
      ` : ""}
      ${canManageAccounts ? `
        <td>
          <button class="danger-button" type="button" data-delete-user="${item.id}">
            Sterge
          </button>
        </td>
      ` : ""}
    </tr>
  `;
  }

  students.forEach((student) => {
    const groupName = student.matriculation_number || "Fara grupa";

    if (groupName !== currentGroup) {
      currentGroup = groupName;
      rows.push(`
        <tr class="table-group-row">
          <td colspan="${columnsCount}">
            <div class="group-row-content">
              <span>Grupa ${escapeHtml(groupName)}</span>
              ${canManageAccounts ? `
                <button class="danger-button group-delete-button" type="button" data-delete-group="${escapeHtml(groupName)}">
                  Sterge grupa
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `);
    }

    rows.push(renderUserRow(student));
  });

  if (professors.length) {
    rows.push(`
      <tr class="table-group-row">
        <td colspan="${columnsCount}">Profesori</td>
      </tr>
    `);
    professors.forEach((professor) => rows.push(renderUserRow(professor)));
  }

  usersTableBody.innerHTML = rows.join("");
}

async function loadUsers(options = {}) {
  const silent = options.silent === true;

  if (!silent) {
    usersTableBody.innerHTML = `<tr><td colspan="${canManageAccounts ? 6 : 4}">Se incarca...</td></tr>`;
  }

  try {
    const data = await apiRequest("/admin/users");
    canManageAccounts = Boolean(data.canManageUsers);
    canManageUsers = Boolean(data.canManageAllUsers);
    updateUserManagementVisibility();
    renderUsers(data.users);
  } catch (error) {
    if (silent) {
      return;
    }

    usersTableBody.innerHTML = `<tr><td colspan="${canManageAccounts ? 6 : 4}">${escapeHtml(error.message)}</td></tr>`;
  }
}

function updateUserManagementVisibility() {
  createUserPanel.classList.toggle("hidden", !canManageAccounts);
  importUsersPanel.classList.toggle("hidden", !canManageAccounts);
  readonlyUsersNotice.classList.toggle("hidden", canManageAccounts);
  const professorRoleOption = roleSelect.querySelector('option[value="professor"]');

  if (professorRoleOption) {
    professorRoleOption.hidden = !canManageUsers;
    professorRoleOption.disabled = !canManageUsers;
  }

  if (!canManageUsers && roleSelect.value === "professor") {
    roleSelect.value = "student";
    updateRoleFields();
  }

  subjectAdminPanel.classList.toggle("hidden", !canManageUsers);
  subjectReadonlyNotice.classList.toggle("hidden", canManageUsers);
  subjectAssignmentPanel.classList.toggle("hidden", !canManageUsers);
  document.querySelectorAll("[data-admin-only-menu]").forEach((item) => {
    item.classList.toggle("hidden", !canManageUsers);
  });
  document.querySelectorAll("[data-admin-only-column]").forEach((cell) => {
    cell.classList.toggle("hidden", !canManageUsers);
  });
  document.querySelectorAll("[data-account-manager-column]").forEach((cell) => {
    cell.classList.toggle("hidden", !canManageAccounts);
  });
}

updateUserManagementVisibility();

/*
----------------------------
       Formatare examene
----------------------------
Centralizeaza afisarea datelor, statusurilor si permisiunilor pentru actiunile pe examene.
*/
function formatExamDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getFileUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_FILE_BASE_URL}${path}`;
}

function getStatusLabel(status) {
  const labels = {
    future: "Viitor",
    active: "Activ",
    finished: "Finalizat",
    archived: "Arhivat",
  };

  return labels[status] || status;
}

function statusButton(exam, status, label) {
  const disabled = exam.status === status ? "disabled" : "";

  return `<button class="secondary-button" type="button" data-exam-status="${exam.id}:${status}" ${disabled}>${label}</button>`;
}

function canManageExam(exam) {
  return canManageUsers
    || String(exam.professor_id) === String(user.id);
}

function generateUniqueCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((value) => value.toString(36).padStart(2, "0").slice(-2).toUpperCase())
    .join("")
    .slice(0, 10);
}

/*
----------------------------
            Materii
----------------------------
Populeaza listele de materii si profesori si pregateste asignarea materiilor.
*/
function renderSubjects(subjects) {
  allSubjects = subjects;
  examSubject.innerHTML = '<option value="">Alege materia</option>';
  assignSubject.innerHTML = '<option value="">Alege materia</option>';
  infoSubject.innerHTML = '<option value="">Alege materia</option>';
  subjectsList.innerHTML = subjects.length
    ? subjects.map((subject) => `
      <article class="subject-row">
        <span>
          <strong>${escapeHtml(subject.name)}</strong>
          <span class="muted-note">Profesor: ${escapeHtml(subject.professor_name || "neasignat")}</span>
        </span>
        ${canManageUsers ? `
          <button class="danger-button" type="button" data-delete-subject="${subject.id}">
            Sterge
          </button>
        ` : ""}
      </article>
    `).join("")
    : "<p>Nu exista materii.</p>";

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    examSubject.appendChild(option);

    const assignOption = document.createElement("option");
    assignOption.value = subject.id;
    assignOption.textContent = `${subject.name}${subject.professor_name ? ` - ${subject.professor_name}` : " - neasignata"}`;
    assignSubject.appendChild(assignOption);

    const infoOption = document.createElement("option");
    infoOption.value = subject.id;
    infoOption.textContent = subject.name;
    infoSubject.appendChild(infoOption);
  });
}

function renderProfessorOptions(professors) {
  allProfessors = professors;
  subjectProfessor.innerHTML = '<option value="">Fara profesor asignat</option>';
  assignProfessor.innerHTML = '<option value="">Alege profesorul</option>';

  professors.forEach((professor) => {
    const label = `${professor.full_name}${professor.email ? ` (${professor.email})` : ""}`;

    const createOption = document.createElement("option");
    createOption.value = professor.id;
    createOption.textContent = label;
    subjectProfessor.appendChild(createOption);

    const assignOption = document.createElement("option");
    assignOption.value = professor.id;
    assignOption.textContent = label;
    assignProfessor.appendChild(assignOption);
  });
}

function renderRtfExamOptions(exams) {
  rtfExam.innerHTML = '<option value="">Alege examenul</option>';

  exams.forEach((exam) => {
    const option = document.createElement("option");
    option.value = exam.id;
    option.textContent = `${exam.subject_name} - ${exam.title}`;
    rtfExam.appendChild(option);
  });
}

/*
----------------------------
            Examene
----------------------------
Construieste tabelele de examene, arhiva si butoanele pentru schimbarea statusului.
*/
function renderExamRows(exams, options = {}) {
  const mode = options.mode || "main";

  return exams.map((exam) => `
    <tr>
      <td><span class="table-text">${escapeHtml(exam.subject_name)}</span></td>
      <td><span class="table-text">${escapeHtml(exam.title)}</span></td>
      <td><span class="table-date">${formatExamDate(exam.exam_date)}</span></td>
      <td>
        <div class="status-stack">
          <span class="status-badge status-${escapeHtml(exam.status)}">${getStatusLabel(exam.status)}</span>
          ${Number(exam.bonus_points) > 0 ? `<span class="muted-note">+${escapeHtml(exam.bonus_points)} oficiu</span>` : ""}
        </div>
      </td>
      <td>
        <div class="action-row exam-actions">
          ${canManageExam(exam) ? `
            ${mode === "main" ? `
              ${statusButton(exam, "future", "Viitor")}
              ${statusButton(exam, "active", "Start")}
              ${statusButton(exam, "finished", "Finalizeaza")}
              ${statusButton(exam, "archived", "Arhiveaza")}
            ` : ""}
            ${mode === "archive" ? `
              <button class="secondary-button" type="button" data-exam-status="${exam.id}:finished">Scoate din arhiva</button>
              <button class="secondary-button" type="button" data-download-archive="${exam.id}">Descarca Excel</button>
            ` : ""}
            ${mode === "main" ? `<button class="secondary-button" type="button" data-manage-assignments="${exam.id}">Asignari</button>` : ""}
            <button class="secondary-button" type="button" data-manage-variants="${exam.id}">Variante</button>
            ${mode !== "variant" ? `<button class="danger-button" type="button" data-delete-exam="${exam.id}">Sterge</button>` : ""}
          ` : '<span class="muted-note">Doar vizualizare</span>'}
        </div>
      </td>
    </tr>
  `).join("");
}

function groupExamsBySubject(exams) {
  const groups = new Map();

  exams.forEach((exam) => {
    const key = exam.subject_name || "Fara materie";

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(exam);
  });

  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
}

function renderVariantExamRows(exams) {
  const availableExams = exams.filter((exam) => exam.status !== "archived" && canManageExam(exam));

  variantExamsTableBody.innerHTML = availableExams.length
    ? renderExamRows(availableExams, { mode: "variant" })
    : '<tr><td colspan="5">Nu exista examene disponibile pentru variante.</td></tr>';
}

function renderArchive(exams) {
  const archivedExams = exams.filter((exam) => exam.status === "archived" && canManageExam(exam));

  if (!archivedExams.length) {
    archiveList.innerHTML = "<p>Nu exista examene arhivate.</p>";
    return;
  }

  archiveList.innerHTML = groupExamsBySubject(archivedExams).map(([subjectName, subjectExams]) => `
    <article class="variant-block">
      <h3>${escapeHtml(subjectName)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Materie</th>
              <th>Examen</th>
              <th>Data</th>
              <th>Status</th>
              <th>Actiuni</th>
            </tr>
          </thead>
          <tbody>
            ${renderExamRows(subjectExams, { mode: "archive" })}
          </tbody>
        </table>
      </div>
    </article>
  `).join("");
}

function renderExams(exams) {
  const sortedExams = [...exams].sort((first, second) => {
    const firstDate = new Date(first.exam_date).getTime();
    const secondDate = new Date(second.exam_date).getTime();
    const upcomingStatuses = ["future", "active"];

    if (upcomingStatuses.includes(first.status) && upcomingStatuses.includes(second.status)) {
      return firstDate - secondDate;
    }

    return secondDate - firstDate;
  });
  const visibleExams = sortedExams.filter((exam) => exam.status !== "archived");
  const filteredExams = examFilter === "all"
    ? visibleExams
    : visibleExams.filter((exam) => exam.status === examFilter);

  if (!filteredExams.length) {
    examsTableBody.innerHTML = '<tr><td colspan="5">Nu exista examene.</td></tr>';
  } else {
    examsTableBody.innerHTML = renderExamRows(filteredExams);
  }

  renderVariantExamRows(sortedExams);
  renderArchive(sortedExams);
}

/*
----------------------------
     Incarcare date generale
----------------------------
Ia din API materiile, examenele si datele necesare pentru refresh-ul sectiunilor.
*/
async function loadSubjects() {
  const data = await apiRequest("/admin/subjects");
  renderProfessorOptions(data.professors || []);
  renderSubjects(data.subjects);
  return data.subjects;
}

async function loadExams(options = {}) {
  const silent = options.silent === true;

  if (!silent) {
    examsTableBody.innerHTML = '<tr><td colspan="5">Se incarca...</td></tr>';
    variantExamsTableBody.innerHTML = '<tr><td colspan="5">Se incarca...</td></tr>';
    archiveList.innerHTML = "<p>Se incarca...</p>";
  }

  const data = await apiRequest("/admin/exams");
  allExams = data.exams;
  renderExams(allExams);
  return allExams;
}

async function loadExamData(options = {}) {
  const silent = options.silent === true;

  try {
    if (silent) {
      await loadExams({ silent: true });
      return;
    }

    await Promise.all([loadSubjects(), loadExams()]);
  } catch (error) {
    if (silent) {
      return;
    }

    examsTableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    variantExamsTableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    archiveList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function loadRtfExams() {
  try {
    const exams = await loadExams({ silent: true });
    renderRtfExamOptions(exams.filter((exam) => exam.status !== "archived"));
  } catch (error) {
    rtfExam.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`;
  }
}

/*
----------------------------
            Rezultate
----------------------------
Grupeaza rezultatele pe examene si pregateste exportul registrului in Excel.
*/
function groupResultsByExam(results) {
  const groups = new Map();

  results.forEach((result) => {
    const key = String(result.exam_id);

    if (!groups.has(key)) {
      groups.set(key, {
        exam_id: result.exam_id,
        exam_title: result.exam_title,
        subject_name: result.subject_name,
        exam_date: result.exam_date,
        results: [],
      });
    }

    groups.get(key).results.push(result);
  });

  return [...groups.values()].sort((first, second) => (
    new Date(second.exam_date || second.results[0]?.submitted_at).getTime()
      - new Date(first.exam_date || first.results[0]?.submitted_at).getTime()
  ));
}

function renderResultExamList(results) {
  const groups = groupResultsByExam(results);

  if (!groups.length) {
    resultsExamList.innerHTML = "<p>Nu exista rezultate.</p>";
    examResultsPanel.classList.add("hidden");
    resultDetailsPanel.classList.add("hidden");
    return;
  }

  resultsExamList.innerHTML = groups.map((group) => {
    const gradedResults = group.results.filter((result) => !isPlagiarismResult(result));
    const average = gradedResults.length
      ? gradedResults.reduce((total, result) => total + Number(result.grade || 0), 0) / gradedResults.length
      : null;

    return `
      <button class="exam-card result-exam-card" type="button" data-open-result-exam="${group.exam_id}">
        <div>
          <h3>${escapeHtml(group.exam_title)}</h3>
          <div class="exam-card-meta">
            <span>${escapeHtml(group.subject_name)}</span>
            <span>${formatExamDate(group.exam_date)}</span>
            <span>${group.results.length} rezultate</span>
          </div>
        </div>
        <span class="status-badge ${average === null ? "status-plagiarism" : "status-active"}">
          ${average === null ? "Fara note" : `Media ${escapeHtml(Number(average.toFixed(2)))}`}
        </span>
      </button>
    `;
  }).join("");

  if (selectedResultsExamId && !groups.some((group) => String(group.exam_id) === String(selectedResultsExamId))) {
    selectedResultsExamId = null;
    selectedResultDetailsId = null;
    examResultsPanel.classList.add("hidden");
    resultDetailsPanel.classList.add("hidden");
  }
}

function renderResultsForExam(examId, options = {}) {
  const preserveDetails = options.preserveDetails === true;
  const group = groupResultsByExam(allResults).find((item) => String(item.exam_id) === String(examId));

  if (!group) {
    examResultsPanel.classList.add("hidden");
    selectedResultDetailsId = null;
    return;
  }

  selectedResultsExamId = String(examId);
  examResultsPanel.classList.remove("hidden");

  if (!preserveDetails || !group.results.some((result) => String(result.id) === String(selectedResultDetailsId))) {
    selectedResultDetailsId = null;
    resultDetailsPanel.classList.add("hidden");
    resultDetailsContent.innerHTML = "";
  }

  examResultsTitle.textContent = `Rezultate - ${group.exam_title}`;
  examResultsMeta.textContent = `${group.subject_name} | ${formatExamDate(group.exam_date)} | ${group.results.length} rezultate`;
  resultsTableBody.innerHTML = group.results.map((result) => `
    <tr>
      <td>${escapeHtml(result.student_name)}</td>
      <td>${escapeHtml(result.subject_name)}</td>
      <td>${escapeHtml(result.exam_title)}</td>
      <td>${escapeHtml(result.score)} / ${escapeHtml(result.max_score)}</td>
      <td>${renderGradeBadge(result)}</td>
      <td>${formatExamDate(result.submitted_at)}</td>
      <td>
        <div class="action-row">
          ${Number(result.event_count || 0) > 0 ? `
            <span class="problem-indicator" title="Exista evenimente in timpul testului">!</span>
          ` : ""}
          <button class="secondary-button" type="button" data-result-details="${result.id}">
            Detalii
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function ensureResultsLoaded() {
  if (allResults.length) {
    return allResults;
  }

  const data = await apiRequest("/admin/results");
  allResults = data.results;
  return allResults;
}

async function downloadArchiveRegister(examId) {
  const results = (await ensureResultsLoaded()).filter((result) => String(result.exam_id) === String(examId));
  const exam = allExams.find((item) => String(item.id) === String(examId));
  const firstResult = results[0];

  if (!exam && !firstResult) {
    return;
  }

  const subjectName = exam?.subject_name || firstResult.subject_name || "materie";
  const examTitle = exam?.title || firstResult.exam_title || "examen";
  const rows = [
    ["Nume student", "Grupa", "Materie", "Examen", "Varianta", "Rand", "Nota"],
    ...results.map((result) => [
      result.student_name,
      result.matriculation_number || "-",
      result.subject_name,
      result.exam_title,
      result.variant_name || "-",
      result.row_number || "-",
      isPlagiarismResult(result) ? "Plagiat" : result.grade,
    ]),
  ];
  const tableRows = rows.map((row, rowIndex) => `
    <tr>
      ${row.map((cell) => (
        rowIndex === 0
          ? `<th>${escapeHtml(cell)}</th>`
          : `<td>${escapeHtml(cell)}</td>`
      )).join("")}
    </tr>
  `).join("");
  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; }
          th { background: #d9eaf7; font-weight: bold; }
          th, td { border: 1px solid #7f8c99; padding: 8px 10px; }
        </style>
      </head>
      <body>
        <table>${tableRows}</table>
      </body>
    </html>
  `;
  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const link = document.createElement("a");
  const safeName = `${subjectName}-${examTitle}`
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_");

  link.href = URL.createObjectURL(blob);
  link.download = `registru_${safeName}.xls`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

/*
----------------------------
      Notificari test live
----------------------------
Afiseaza studentii blocati in timpul testului si permite profesorului sa ii deblocheze.
*/
function getLockLabel(eventType) {
  const labels = {
    alt_tab: "Alt+Tab",
    blocked_key: "Tasta blocata",
    fullscreen_exit: "Iesire fullscreen",
    fullscreen_refused: "Fullscreen refuzat",
    plagiarism_closed: "Test incheiat",
    tab_hidden: "Tab schimbat",
    window_blur: "Fereastra fara focus",
  };

  return labels[eventType] || eventType || "Eveniment test";
}

function isPlagiarismResult(result) {
  return result
    && result.grade === null
    && Number(result.score) === 0
    && Number(result.max_score) === 0;
}

function renderGradeBadge(result) {
  if (isPlagiarismResult(result)) {
    return '<span class="status-badge status-plagiarism">Plagiat</span>';
  }

  return `<span class="status-badge status-active">${escapeHtml(result.grade)}</span>`;
}

function renderTestLockNotifications() {
  if (!testLockNotifications) {
    return;
  }

  if (!activeTestLocks.length) {
    testLockNotifications.classList.add("hidden");
    testLockNotifications.innerHTML = "";
    return;
  }

  testLockNotifications.classList.remove("hidden");
  testLockNotifications.innerHTML = activeTestLocks.map((lock) => `
    <article class="test-lock-card">
      <h3>Student blocat in test</h3>
      <p><strong>${escapeHtml(lock.student_name)}</strong> - ${escapeHtml(lock.subject_name)}</p>
      <p>${escapeHtml(lock.exam_title)} | ${escapeHtml(getLockLabel(lock.event_type))}</p>
      <p>${escapeHtml(lock.details || "Eveniment detectat in timpul testului.")}</p>
      <p>${formatExamDate(lock.created_at)}</p>
      <div class="test-lock-actions">
        <button class="primary-button" type="button" data-release-test-lock="${lock.id}">
          Permite continuarea
        </button>
        <button class="danger-button" type="button" data-plagiarism-test-lock="${lock.id}">
          Incheie test
        </button>
      </div>
    </article>
  `).join("");
}

async function loadActiveTestLocks() {
  try {
    const data = await apiRequest("/admin/test-locks");
    activeTestLocks = data.locks || [];
    renderTestLockNotifications();
  } catch (error) {
    // Notificarile live nu trebuie sa blocheze dashboard-ul daca API-ul raspunde temporar greu.
  }
}

async function releaseTestLock(lockId) {
  await apiRequest(`/admin/test-locks/${lockId}/release`, {
    method: "POST",
  });
  activeTestLocks = activeTestLocks.filter((lock) => String(lock.id) !== String(lockId));
  renderTestLockNotifications();
  await loadResults({ silent: true });
}

async function markTestLockPlagiarism(lockId) {
  await apiRequest(`/admin/test-locks/${lockId}/plagiarism`, {
    method: "POST",
  });
  activeTestLocks = activeTestLocks.filter((lock) => String(lock.id) !== String(lockId));
  renderTestLockNotifications();
  await loadResults({ silent: true });
}

async function loadResults(options = {}) {
  const silent = options.silent === true;

  if (!silent) {
    resultsExamList.innerHTML = "<p>Se incarca...</p>";
  }

  try {
    const data = await apiRequest("/admin/results");
    allResults = data.results;
    renderResultExamList(allResults);

    if (selectedResultsExamId) {
      renderResultsForExam(selectedResultsExamId, { preserveDetails: silent });
    }
  } catch (error) {
    if (!silent) {
      resultsExamList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  }
}

/*
----------------------------
      Detalii rezultat
----------------------------
Afiseaza intrebarile, raspunsurile studentului, raspunsurile corecte si evenimentele de test.
*/
function getQuestionReviewScore(question) {
  const correctCount = question.answers.filter((answer) => answer.is_correct).length;
  const selectedCorrectCount = question.answers.filter((answer) => answer.is_correct && answer.is_selected).length;
  const selectedWrongCount = question.answers.filter((answer) => !answer.is_correct && answer.is_selected).length;
  const questionPoints = Number(question.points) || 0;
  const pointsPerCorrect = correctCount > 0 ? questionPoints / correctCount : 0;
  const earnedPoints = Math.max(0, selectedCorrectCount - selectedWrongCount) * pointsPerCorrect;

  return {
    correctCount,
    pointsPerCorrect,
    earnedPoints,
  };
}

function getReviewAnswerState(answer) {
  if (answer.is_selected && answer.is_correct) {
    return {
      className: "selected-correct",
      marker: "*",
      label: "Ales de student - corect",
    };
  }

  if (answer.is_selected && !answer.is_correct) {
    return {
      className: "selected-wrong",
      marker: "!",
      label: "Ales de student - gresit",
    };
  }

  if (!answer.is_selected && answer.is_correct) {
    return {
      className: "correct-unselected",
      marker: "+",
      label: "Raspuns corect neales",
    };
  }

  return {
    className: "neutral-answer",
    marker: "",
    label: "Neales",
  };
}

function renderResultDetails(data) {
  const result = data.result;
  const events = data.events || [];
  const gradeText = isPlagiarismResult(result) ? "Plagiat" : `Nota ${result.grade}`;

  resultDetailsTitle.textContent = `${result.student_name} - ${result.exam_title}`;
  resultDetailsMeta.textContent = `${result.subject_name} | ${result.variant_name || "Varianta neidentificata"} | ${result.score} / ${result.max_score} puncte | ${gradeText}`;
  resultDetailsContent.innerHTML = `
    ${events.length ? `
      <article class="review-question-card">
        <h3>Evenimente in timpul testului</h3>
        <ol class="answer-list">
          ${events.map((event) => `
            <li>
              <strong>${escapeHtml(event.event_type)}</strong>
              ${event.details ? ` - ${escapeHtml(event.details)}` : ""}
              <span class="muted-note">(${formatExamDate(event.created_at)})</span>
            </li>
          `).join("")}
        </ol>
      </article>
    ` : ""}
    ${data.questions.map((question, index) => `
    <article class="review-question-card">
      <div class="review-question-header">
        <div>
          <h3>${index + 1}. ${escapeHtml(question.question_text)}</h3>
          <p>${escapeHtml(question.points)} puncte</p>
        </div>
        ${(() => {
          const reviewScore = getQuestionReviewScore(question);

          return `
            <span class="status-badge status-active">
              ${escapeHtml(Number(reviewScore.earnedPoints.toFixed(2)))} / ${escapeHtml(question.points)} p
            </span>
          `;
        })()}
      </div>
      ${question.image_path ? `
        <img class="question-image" src="${escapeHtml(getFileUrl(question.image_path))}" alt="${escapeHtml(question.image_original_name || "Imagine intrebare")}">
      ` : ""}
      <div class="review-answer-grid">
        ${question.answers.map((answer, answerIndex) => {
          const reviewScore = getQuestionReviewScore(question);
          const state = getReviewAnswerState(answer);
          const pointLabel = answer.is_correct
            ? ` (+${Number(reviewScore.pointsPerCorrect.toFixed(2))}p)`
            : "";

          return `
          <div class="review-answer-card ${state.className}">
            <span class="check-mark">${escapeHtml(state.marker)}</span>
            <div>
              <strong>${answerIndex + 1}. ${escapeHtml(answer.answer_text)}</strong>
              <span class="answer-status">${escapeHtml(state.label)}${escapeHtml(pointLabel)}</span>
            </div>
          </div>
        `;
        }).join("")}
      </div>
    </article>
  `).join("")}
  `;
}

async function openResultDetails(resultId) {
  selectedResultDetailsId = String(resultId);
  resultDetailsPanel.classList.remove("hidden");
  resultDetailsContent.innerHTML = "<p>Se incarca...</p>";

  try {
    const data = await apiRequest(`/admin/results/${resultId}`);
    renderResultDetails(data);
    resultDetailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    selectedResultDetailsId = null;
    resultDetailsContent.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

/*
----------------------------
      Variante si intrebari
----------------------------
Gestioneaza variantele importate din RTF si afiseaza intrebarile fiecarei variante.
*/
function renderVariantOptions() {
  questionVariant.innerHTML = '<option value="">Alege varianta</option>';

  selectedExamVariants.forEach((variant) => {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = `${variant.variant_name}${variant.row_number ? ` - Rand ${variant.row_number}` : ""}`;
    questionVariant.appendChild(option);
  });
}

function renderVariantsList() {
  if (!selectedExamVariants.length) {
    variantsList.innerHTML = "<p>Nu exista variante pentru acest examen.</p>";
    return;
  }

  variantsList.innerHTML = selectedExamVariants.map((variant) => `
    <article class="variant-block">
      <div class="variant-block-header">
        <h3>${escapeHtml(variant.variant_name)}${variant.row_number ? ` - Rand ${escapeHtml(variant.row_number)}` : ""}</h3>
        <button class="danger-button" type="button" data-delete-variant="${variant.id}">Sterge varianta</button>
      </div>
      <div class="question-list">
        ${variant.questions.length ? variant.questions.map((question) => `
          <div class="question-item">
            <strong>${escapeHtml(question.question_text)}</strong>
            <span class="muted-note">(${escapeHtml(question.points)} puncte)</span>
            ${question.image_path ? `
              <img class="question-image" src="${escapeHtml(getFileUrl(question.image_path))}" alt="${escapeHtml(question.image_original_name || "Imagine intrebare")}">
            ` : ""}
            <ol class="answer-list">
              ${question.answers.map((answer) => `
                <li class="${answer.is_correct ? "correct-answer" : ""}">
                  ${escapeHtml(answer.answer_text)}${answer.is_correct ? " - corect" : ""}
                </li>
              `).join("")}
            </ol>
          </div>
        `).join("") : "<p>Nu exista intrebari pentru aceasta varianta.</p>"}
      </div>
    </article>
  `).join("");
}

async function loadVariants() {
  if (!selectedExamForVariants) {
    return;
  }

  const data = await apiRequest(`/admin/exams/${selectedExamForVariants.id}/variants`);
  selectedExamVariants = data.variants;
  renderVariantOptions();
  renderVariantsList();
}

async function openVariantsPanel(examId) {
  const previousSectionId = activeSectionId;
  selectedExamForVariants = allExams.find((exam) => String(exam.id) === String(examId));

  if (!selectedExamForVariants) {
    return;
  }

  variantsReturnSectionId = ["examsSection", "archiveSection"].includes(previousSectionId)
    ? previousSectionId
    : "variantsSection";
  variantsPanelTitle.textContent = `Variante si intrebari - ${selectedExamForVariants.title}`;
  showDashboardSection("variantsSection");
  variantsPanel.classList.remove("hidden");
  variantsEmptyPanel.classList.add("hidden");
  createVariantMessage.textContent = "";
  variantRtfImportMessage.textContent = "";
  createQuestionMessage.textContent = "";
  await loadVariants();
  variantsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/*
----------------------------
       Asignare variante
----------------------------
Permite atribuirea manuala sau random a variantelor catre studenti.
*/
function renderAssignments(students) {
  if (!students.length) {
    assignmentsTableBody.innerHTML = '<tr><td colspan="4">Nu exista studenti.</td></tr>';
    return;
  }

  assignmentsTableBody.innerHTML = students.map((student) => `
    <tr>
      <td>${escapeHtml(student.full_name)}</td>
      <td>${escapeHtml(student.email) || "-"}</td>
      <td>${escapeHtml(student.matriculation_number) || "-"}</td>
      <td>
        <select data-assignment-student="${student.id}" ${assignmentsReadOnly ? "disabled" : ""}>
          <option value="">Automat / neasignat</option>
          ${assignmentVariants.map((variant) => `
            <option value="${variant.id}" ${String(student.variant_id || "") === String(variant.id) ? "selected" : ""}>
              ${escapeHtml(variant.variant_name)}${variant.row_number ? ` - Rand ${escapeHtml(variant.row_number)}` : ""}
            </option>
          `).join("")}
        </select>
      </td>
    </tr>
  `).join("");
}

async function loadAssignments() {
  if (!selectedExamForAssignments) {
    return;
  }

  assignmentsTableBody.innerHTML = '<tr><td colspan="5">Se incarca...</td></tr>';

  try {
    const data = await apiRequest(`/admin/exams/${selectedExamForAssignments.id}/assignments`);
    assignmentVariants = data.variants;
    assignmentsReadOnly = Boolean(data.readOnly);
    randomAssignmentsButton.classList.toggle("hidden", assignmentsReadOnly);
    assignmentsPanelDescription.textContent = assignmentsReadOnly
      ? "Examen arhivat: poti vedea asignarile, dar nu le mai poti modifica."
      : "Alege manual varianta sau foloseste asignarea random. Modificarile se salveaza automat.";
    renderAssignments(data.students);
  } catch (error) {
    assignmentsTableBody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function openAssignmentsPanel(examId) {
  selectedExamForAssignments = allExams.find((exam) => String(exam.id) === String(examId));

  if (!selectedExamForAssignments) {
    return;
  }

  assignmentsPanelTitle.textContent = `Asignare variante - ${selectedExamForAssignments.title}`;
  assignmentsPanel.classList.remove("hidden");
  assignmentsMessage.textContent = "";
  await loadAssignments();
  assignmentsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

logoutButton.addEventListener("click", () => {
  clearSession();
  window.location.href = "login.html";
});

refreshUsersButton.addEventListener("click", loadUsers);
refreshExamsButton.addEventListener("click", loadExamData);
refreshResultsButton.addEventListener("click", loadResults);
roleSelect.addEventListener("change", updateRoleFields);

createUserForm.addEventListener("change", (event) => {
  if (event.target.name !== "uniqueCodeMode") {
    return;
  }

  const uniqueCodeInput = document.getElementById("uniqueCode");

  if (event.target.value === "auto") {
    uniqueCodeInput.value = generateUniqueCode();
    uniqueCodeInput.readOnly = true;
  } else {
    uniqueCodeInput.value = "";
    uniqueCodeInput.readOnly = false;
    uniqueCodeInput.focus();
  }
});

closeResultDetailsButton.addEventListener("click", () => {
  resultDetailsPanel.classList.add("hidden");
  resultDetailsContent.innerHTML = "";
  selectedResultDetailsId = null;
});

resultsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-result-details]");

  if (!button) {
    return;
  }

  openResultDetails(button.dataset.resultDetails);
});

resultsExamList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-result-exam]");

  if (!button) {
    return;
  }

  selectedResultDetailsId = null;
  renderResultsForExam(button.dataset.openResultExam);
  examResultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

backToResultExamsButton.addEventListener("click", () => {
  selectedResultsExamId = null;
  selectedResultDetailsId = null;
  examResultsPanel.classList.add("hidden");
  resultDetailsPanel.classList.add("hidden");
  resultDetailsContent.innerHTML = "";
  resultsExamList.scrollIntoView({ behavior: "smooth", block: "start" });
});

downloadResultsExcelButton.addEventListener("click", async () => {
  if (!selectedResultsExamId) {
    return;
  }

  await downloadArchiveRegister(selectedResultsExamId);
});

if (testLockNotifications) {
  testLockNotifications.addEventListener("click", async (event) => {
    const releaseButton = event.target.closest("[data-release-test-lock]");
    const plagiarismButton = event.target.closest("[data-plagiarism-test-lock]");
    const button = releaseButton || plagiarismButton;

    if (!button) {
      return;
    }

    if (plagiarismButton) {
      const confirmed = window.confirm("Inchei testul si marchezi studentul cu Plagiat?");

      if (!confirmed) {
        return;
      }
    }

    button.disabled = true;
    button.textContent = releaseButton ? "Se permite..." : "Se inchide...";

    try {
      if (releaseButton) {
        await releaseTestLock(button.dataset.releaseTestLock);
      } else {
        await markTestLockPlagiarism(button.dataset.plagiarismTestLock);
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = releaseButton ? "Permite continuarea" : "Incheie test";
      alert(error.message);
    }
  });
}

document.querySelectorAll("[data-exam-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    examFilter = button.dataset.examFilter;
    document.querySelectorAll("[data-exam-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderExams(allExams);
  });
});

document.querySelectorAll("[data-open-section]").forEach((button) => {
  button.addEventListener("click", () => showDashboardSection(button.dataset.openSection));
});

document.querySelectorAll("[data-back-menu]").forEach((button) => {
  button.addEventListener("click", showAdminMenu);
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const isHidden = input.type === "password";

    input.type = isHidden ? "text" : "password";
    button.classList.toggle("is-visible", isHidden);
    button.setAttribute("aria-label", isHidden ? "Ascunde valoarea" : "Arata valoarea");
  });
});

usersTableBody.addEventListener("click", async (event) => {
  const secretButton = event.target.closest("[data-toggle-secret]");

  if (secretButton) {
    const wrapper = secretButton.closest(".secret-cell");
    const valueElement = wrapper.querySelector("[data-secret-value]");
    const isVisible = secretButton.classList.toggle("is-visible");

    valueElement.textContent = isVisible
      ? valueElement.dataset.secretValue || "-"
      : "••••••";
    secretButton.setAttribute("aria-label", isVisible ? "Ascunde codul unic" : "Arata codul unic");
    return;
  }

  const groupButton = event.target.closest("[data-delete-group]");

  if (groupButton) {
    const groupName = groupButton.dataset.deleteGroup;
    const confirmed = window.confirm(`Esti sigur ca vrei sa stergi toata grupa ${groupName}? Se vor sterge toti studentii din grupa si toate datele lor.`);

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(`/admin/users/groups/${encodeURIComponent(groupName)}`, {
        method: "DELETE",
      });
      setCreateMessage(`Grupa ${groupName} a fost stearsa.`, "success");
      await loadUsers();
    } catch (error) {
      setCreateMessage(error.message, "error");
    }

    return;
  }

  const button = event.target.closest("[data-delete-user]");

  if (!button) {
    return;
  }

  const userId = button.dataset.deleteUser;
  const confirmed = window.confirm("Esti sigur ca vrei sa stergi acest utilizator?");

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(`/admin/users/${userId}`, {
      method: "DELETE",
    });
    await loadUsers();
  } catch (error) {
    setCreateMessage(error.message, "error");
  }
});

createUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setCreateMessage("Se salveaza...", "");

  const formData = new FormData(createUserForm);
  const payload = {
    fullName: formData.get("fullName").trim(),
    role: formData.get("role"),
    uniqueCode: formData.get("uniqueCode").trim(),
    matriculationNumber: formData.get("matriculationNumber").trim() || null,
    email: formData.get("email").trim() || null,
    password: formData.get("password").trim() || null,
  };

  try {
    await apiRequest("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    createUserForm.reset();
    document.getElementById("role").value = "student";
    document.getElementById("uniqueCode").readOnly = false;
    updateRoleFields();
    setCreateMessage("Utilizator salvat.", "success");
    await loadUsers();
  } catch (error) {
    setCreateMessage(error.message, "error");
  }
});

importUsersForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(importUsersMessage, "Se importa studentii...", "");

  const formData = new FormData(importUsersForm);
  const file = formData.get("studentsFile");

  if (!file || !file.name) {
    setMessage(importUsersMessage, "Alege un fisier Excel.", "error");
    return;
  }

  try {
    const data = await apiRequest("/admin/users/import-excel", {
      method: "POST",
      body: formData,
    });
    const skippedText = data.skippedCount
      ? ` Sariti: ${data.skippedCount}.`
      : "";

    importUsersForm.reset();
    setMessage(
      importUsersMessage,
      `Import finalizat. Studenti adaugati: ${data.importedCount}.${skippedText}`,
      data.importedCount ? "success" : "error",
    );
    await loadUsers();
  } catch (error) {
    setMessage(importUsersMessage, error.message, "error");
  }
});

createSubjectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(createSubjectMessage, "Se salveaza...", "");

  const formData = new FormData(createSubjectForm);
  const payload = {
    name: formData.get("subjectName").trim(),
    professorId: formData.get("subjectProfessor") || null,
  };

  try {
    await apiRequest("/admin/subjects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createSubjectForm.reset();
    setMessage(createSubjectMessage, "Materie salvata.", "success");
    await loadSubjects();
  } catch (error) {
    setMessage(createSubjectMessage, error.message, "error");
  }
});

assignSubject.addEventListener("change", () => {
  const selectedSubject = allSubjects.find((subject) => String(subject.id) === assignSubject.value);
  assignProfessor.value = selectedSubject?.professor_id ? String(selectedSubject.professor_id) : "";
});

assignSubjectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(assignSubjectMessage, "Se salveaza...", "");

  try {
    await apiRequest(`/admin/subjects/${assignSubject.value}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({
        professorId: assignProfessor.value,
      }),
    });

    setMessage(assignSubjectMessage, "Materia a fost asignata.", "success");
    await loadSubjects();
  } catch (error) {
    setMessage(assignSubjectMessage, error.message, "error");
  }
});

clearSubjectAssignmentButton.addEventListener("click", async () => {
  if (!assignSubject.value) {
    setMessage(assignSubjectMessage, "Alege materia mai intai.", "error");
    return;
  }

  try {
    await apiRequest(`/admin/subjects/${assignSubject.value}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({
        professorId: null,
      }),
    });

    setMessage(assignSubjectMessage, "Asignarea a fost scoasa.", "success");
    await loadSubjects();
    assignSubject.value = "";
    assignProfessor.value = "";
  } catch (error) {
    setMessage(assignSubjectMessage, error.message, "error");
  }
});

infoSubject.addEventListener("change", () => {
  const selectedSubject = allSubjects.find((subject) => String(subject.id) === infoSubject.value);
  subjectInfo.value = selectedSubject?.info_text || "";
  subjectRules.value = selectedSubject?.rules_text || "";
});

subjectInfoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(subjectInfoMessage, "Se salveaza...", "");

  try {
    await apiRequest(`/admin/subjects/${infoSubject.value}/info`, {
      method: "PATCH",
      body: JSON.stringify({
        infoText: subjectInfo.value,
        rulesText: subjectRules.value,
      }),
    });

    setMessage(subjectInfoMessage, "Informatiile au fost salvate.", "success");
    await loadSubjects();
  } catch (error) {
    setMessage(subjectInfoMessage, error.message, "error");
  }
});

subjectsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-subject]");

  if (!button) {
    return;
  }

  const confirmed = window.confirm(
    "Esti sigur ca vrei sa stergi aceasta materie? Se vor sterge si examenele, variantele, intrebarile, asignarile si rezultatele legate de ea.",
  );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(`/admin/subjects/${button.dataset.deleteSubject}`, {
      method: "DELETE",
    });
    setMessage(createSubjectMessage, "Materie stearsa.", "success");
    await loadSubjects();
  } catch (error) {
    setMessage(createSubjectMessage, error.message, "error");
  }
});

createExamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(createExamMessage, "Se salveaza...", "");

  const formData = new FormData(createExamForm);
  const payload = {
    subjectId: formData.get("examSubject"),
    title: formData.get("examTitle").trim(),
    examDate: formData.get("examDate"),
    bonusPoints: formData.get("bonusPoints"),
  };

  try {
    await apiRequest("/admin/exams", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createExamForm.reset();
    setMessage(createExamMessage, "Examen salvat.", "success");
    await loadExamData();
  } catch (error) {
    setMessage(createExamMessage, error.message, "error");
  }
});

/*
----------------------------
    Actiuni pe tabele examene
----------------------------
*/
// Asculta click-urile din tabele si decide ce actiune se executa: status, arhivare, variante, asignari sau stergere.
async function handleExamTableClick(event) {
  const downloadButton = event.target.closest("[data-download-archive]");

  if (downloadButton) {
    await downloadArchiveRegister(downloadButton.dataset.downloadArchive);
    return;
  }

  const variantsButton = event.target.closest("[data-manage-variants]");

  if (variantsButton) {
    await openVariantsPanel(variantsButton.dataset.manageVariants);
    return;
  }

  const assignmentsButton = event.target.closest("[data-manage-assignments]");

  if (assignmentsButton) {
    await openAssignmentsPanel(assignmentsButton.dataset.manageAssignments);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-exam]");

  if (deleteButton) {
    const confirmed = window.confirm("Esti sigur ca vrei sa stergi acest examen?");

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(`/admin/exams/${deleteButton.dataset.deleteExam}`, {
        method: "DELETE",
      });
      variantsPanel.classList.add("hidden");
      assignmentsPanel.classList.add("hidden");
      resultDetailsPanel.classList.add("hidden");
      selectedResultDetailsId = null;
      selectedExamForVariants = null;
      selectedExamForAssignments = null;
      await loadExamData();
      await loadResults({ silent: true });
    } catch (error) {
      setMessage(createExamMessage, error.message, "error");
    }

    return;
  }

  const button = event.target.closest("[data-exam-status]");

  if (!button) {
    return;
  }

  const [examId, status] = button.dataset.examStatus.split(":");

  try {
    await apiRequest(`/admin/exams/${examId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadExams();
    await loadResults({ silent: true });
  } catch (error) {
    setMessage(createExamMessage, error.message, "error");
  }
}

examsTableBody.addEventListener("click", handleExamTableClick);
variantExamsTableBody.addEventListener("click", handleExamTableClick);
archiveList.addEventListener("click", handleExamTableClick);
refreshVariantExamsButton.addEventListener("click", () => loadExams());
refreshArchiveButton.addEventListener("click", () => {
  loadExams();
  loadResults({ silent: true });
});

closeVariantsPanelButton.addEventListener("click", () => {
  variantsPanel.classList.add("hidden");
  variantsEmptyPanel.classList.remove("hidden");
  selectedExamForVariants = null;
  selectedExamVariants = [];

  if (variantsReturnSectionId !== "variantsSection") {
    showDashboardSection(variantsReturnSectionId);
  }
});

closeAssignmentsPanelButton.addEventListener("click", () => {
  assignmentsPanel.classList.add("hidden");
  selectedExamForAssignments = null;
  assignmentVariants = [];
});

assignmentsTableBody.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-assignment-student]");

  if (!select || !selectedExamForAssignments || assignmentsReadOnly) {
    return;
  }

  setMessage(assignmentsMessage, "Se salveaza...", "");

  try {
    await apiRequest(`/admin/exams/${selectedExamForAssignments.id}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        studentId: select.dataset.assignmentStudent,
        variantId: select.value || null,
      }),
    });
    setMessage(assignmentsMessage, "Asignare salvata.", "success");
  } catch (error) {
    setMessage(assignmentsMessage, error.message, "error");
    await loadAssignments();
  }
});

randomAssignmentsButton.addEventListener("click", async () => {
  if (!selectedExamForAssignments || assignmentsReadOnly) {
    return;
  }

  const confirmed = window.confirm("Vrei sa asignezi random variantele pentru studentii care nu au trimis deja testul?");

  if (!confirmed) {
    return;
  }

  setMessage(assignmentsMessage, "Se asigneaza random...", "");

  try {
    const data = await apiRequest(`/admin/exams/${selectedExamForAssignments.id}/assignments/random`, {
      method: "POST",
    });
    setMessage(assignmentsMessage, `Asignare random salvata pentru ${data.assignedStudents} studenti.`, "success");
    await loadAssignments();
  } catch (error) {
    setMessage(assignmentsMessage, error.message, "error");
  }
});

createVariantForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedExamForVariants) {
    return;
  }

  setMessage(createVariantMessage, "Se salveaza...", "");
  const formData = new FormData(createVariantForm);
  const payload = {
    variantName: formData.get("variantName").trim(),
    rowNumber: formData.get("rowNumber") || null,
  };

  try {
    await apiRequest(`/admin/exams/${selectedExamForVariants.id}/variants`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createVariantForm.reset();
    setMessage(createVariantMessage, "Varianta salvata.", "success");
    await loadVariants();
  } catch (error) {
    setMessage(createVariantMessage, error.message, "error");
  }
});

variantRtfImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedExamForVariants) {
    return;
  }

  const formData = new FormData(variantRtfImportForm);
  const file = formData.get("variantRtfFile");
  const rowNumber = formData.get("variantRtfRowNumber");
  const payload = new FormData();

  if (file && file.size > 0) {
    payload.append("rtfFile", file);
  }

  if (rowNumber) {
    payload.append("rowNumber", rowNumber);
  }

  setMessage(variantRtfImportMessage, "Se importa varianta RTF...", "");

  try {
    const data = await apiRequest(`/admin/exams/${selectedExamForVariants.id}/import-rtf`, {
      method: "POST",
      body: payload,
    });

    variantRtfImportForm.reset();
    setMessage(
      variantRtfImportMessage,
      `Import reusit: ${data.importedVariants} variante noi, ${data.importedQuestions} intrebari.`,
      "success",
    );
    await loadVariants();
    await loadExams({ silent: true });
  } catch (error) {
    setMessage(variantRtfImportMessage, error.message, "error");
  }
});

variantsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-variant]");

  if (!button || !selectedExamForVariants) {
    return;
  }

  const confirmed = window.confirm("Stergi varianta importata si toate intrebarile ei? Rezultatele deja salvate nu pot fi sterse de aici.");

  if (!confirmed) {
    return;
  }

  setMessage(variantRtfImportMessage, "Se sterge varianta...", "");

  try {
    await apiRequest(`/admin/variants/${button.dataset.deleteVariant}`, {
      method: "DELETE",
    });
    setMessage(variantRtfImportMessage, "Varianta a fost stearsa.", "success");
    await loadVariants();
    await loadExamData({ silent: true });
  } catch (error) {
    setMessage(variantRtfImportMessage, error.message, "error");
  }
});

createQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(createQuestionForm);
  const variantId = formData.get("questionVariant");
  const answers = [
    formData.get("answer1"),
    formData.get("answer2"),
    formData.get("answer3"),
    formData.get("answer4"),
  ];
  const correctAnswerIndexes = formData.getAll("correctAnswerIndexes").map(Number);
  const payload = new FormData();

  payload.append("questionText", formData.get("questionText").trim());
  payload.append("points", formData.get("questionPoints"));
  payload.append("answers", JSON.stringify(answers));
  payload.append("correctAnswerIndexes", JSON.stringify(correctAnswerIndexes));

  const imageFile = formData.get("questionImage");

  if (imageFile && imageFile.size > 0) {
    payload.append("questionImage", imageFile);
  }

  setMessage(createQuestionMessage, "Se salveaza...", "");

  try {
    await apiRequest(`/admin/variants/${variantId}/questions`, {
      method: "POST",
      body: payload,
    });
    createQuestionForm.reset();
    document.getElementById("questionPoints").value = "1";
    setMessage(createQuestionMessage, "Intrebare salvata.", "success");
    await loadVariants();
  } catch (error) {
    setMessage(createQuestionMessage, error.message, "error");
  }
});

rtfImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(rtfImportForm);
  const examId = formData.get("rtfExam");
  const payload = new FormData();
  const file = formData.get("rtfFile");

  if (file && file.size > 0) {
    payload.append("rtfFile", file);
  }

  setMessage(rtfImportMessage, "Se importa...", "");

  try {
    const data = await apiRequest(`/admin/exams/${examId}/import-rtf`, {
      method: "POST",
      body: payload,
    });
    rtfImportForm.reset();
    setMessage(
      rtfImportMessage,
      `Import reusit: ${data.importedVariants} variante noi, ${data.importedQuestions} intrebari.`,
      "success",
    );
  } catch (error) {
    setMessage(rtfImportMessage, error.message, "error");
  }
});

updateRoleFields();
updateUserManagementVisibility();
hydrateMenuIcons();
showAdminMenu();
setInterval(() => {
  if (activeSectionId === "usersSection") {
    loadUsers({ silent: true });
  }

  if (activeSectionId === "examsSection") {
    loadExamData({ silent: true });
  }

  if (activeSectionId === "variantsSection" || activeSectionId === "archiveSection") {
    loadExams({ silent: true });
  }

  if (activeSectionId === "resultsSection") {
    loadResults({ silent: true });
  }

  loadActiveTestLocks();
}, 3000);

loadActiveTestLocks();
