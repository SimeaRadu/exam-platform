/*
----------------------------
             Logare
----------------------------
Se preiau elementele formularului si se retine modul curent de autentificare.
*/
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const professorFields = document.getElementById("professorFields");
const studentFields = document.getElementById("studentFields");
const studentGroup = document.getElementById("studentGroup");
const tabButtons = document.querySelectorAll("[data-login-mode]");

let loginMode = "professor";

/*
----------------------------
          Grupe studenti
----------------------------
Se incarca grupele existente din baza de date pentru autentificarea studentilor.
*/
async function loadStudentGroups() {
  try {
    const data = await apiRequest("/auth/student-groups", {
      skipAuthRedirect: true,
    });
    const groups = data.groups || [];

    studentGroup.innerHTML = '<option value="">Alege grupa</option>';
    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = group;
      studentGroup.appendChild(option);
    });
  } catch (error) {
    studentGroup.innerHTML = '<option value="">Grupele nu au putut fi incarcate</option>';
  }
}

/*
----------------------------
        Schimbare rol
----------------------------
Se comuta formularul intre profesor si student si se reseteaza mesajele afisate.
*/
function setLoginMode(mode) {
  loginMode = mode;

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.loginMode === mode);
  });

  professorFields.classList.toggle("hidden", mode !== "professor");
  studentFields.classList.toggle("hidden", mode !== "student");
  loginMessage.textContent = "";
  loginMessage.className = "message";

  if (mode === "student" && studentGroup.options.length <= 1) {
    loadStudentGroups();
  }
}

/*
----------------------------
          Mesaje UI
----------------------------
Functie mica folosita pentru afisarea erorilor sau confirmarilor in formular.
*/
function showMessage(text, type) {
  loginMessage.textContent = text;
  loginMessage.className = `message ${type}`;
}

/*
----------------------------
      Evenimente formular
----------------------------
Se leaga butoanele de rol si butoanele de afisare/ascundere parola.
*/
tabButtons.forEach((button) => {
  button.addEventListener("click", () => setLoginMode(button.dataset.loginMode));
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

/*
----------------------------
      Trimitere login
----------------------------
Se construieste payload-ul potrivit rolului si se trimite cererea catre API.
*/
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("Se verifica datele...", "");

  const formData = new FormData(loginForm);
  const payload = loginMode === "professor"
    ? {
        identifier: formData.get("identifier").trim(),
        password: formData.get("password"),
        expectedRole: "professor",
      }
    : {
        fullName: formData.get("fullName").trim(),
        group: formData.get("studentGroup"),
        uniqueCode: formData.get("uniqueCode").trim(),
        expectedRole: "student",
      };

  if (loginMode === "student" && (!payload.fullName || !payload.group || !payload.uniqueCode)) {
    showMessage("Completeaza numele, grupa si codul unic.", "error");
    return;
  }

  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession(data.token, data.user);

    if (data.user.role === "professor") {
      window.location.href = "admin-dashboard.html";
      return;
    }

    window.location.href = "student-dashboard.html";
  } catch (error) {
    showMessage(error.message, "error");
  }
});
