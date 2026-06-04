/*
----------------------------
       Configurare API
----------------------------
Se stabileste adresa API-ului in functie de rulare locala sau servire din browser.
*/
const API_BASE_URL = window.EXAM_PLATFORM_API_BASE_URL
  || (["localhost", "127.0.0.1"].includes(window.location.hostname) || window.location.protocol === "file:"
    ? "http://localhost:5000/api"
    : "/api");
const API_FILE_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

/*
----------------------------
        Fisiere upload
----------------------------
Se transforma caile relative ale imaginilor incarcate in URL-uri afisabile in pagina.
*/
function getFileUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_FILE_BASE_URL}${path}`;
}

/*
----------------------------
       Sesiune utilizator
----------------------------
Token-ul si datele utilizatorului sunt pastrate in sessionStorage pana la inchiderea paginii.
*/
function getToken() {
  return sessionStorage.getItem("examPlatformToken");
}

function setSession(token, user) {
  sessionStorage.setItem("examPlatformToken", token);
  sessionStorage.setItem("examPlatformUser", JSON.stringify(user));
  localStorage.removeItem("examPlatformToken");
  localStorage.removeItem("examPlatformUser");
}

function getSessionUser() {
  const rawUser = sessionStorage.getItem("examPlatformUser");
  return rawUser ? JSON.parse(rawUser) : null;
}

function clearSession() {
  sessionStorage.removeItem("examPlatformToken");
  sessionStorage.removeItem("examPlatformUser");
  localStorage.removeItem("examPlatformToken");
  localStorage.removeItem("examPlatformUser");
}

/*
----------------------------
       Cereri catre API
----------------------------
Functie comuna pentru request-uri, adauga token-ul si trateaza raspunsurile de eroare.
*/
async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "A aparut o eroare.");
  }

  return data;
}

/*
----------------------------
      Protectie pagini
----------------------------
Verifica rolul utilizatorului si redirectioneaza spre login daca sesiunea nu este valida.
*/
function requireAuth(allowedRole) {
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const isPageReload = navigationEntry && navigationEntry.type === "reload";

  if (isPageReload) {
    const token = getToken();

    if (token) {
      fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => {});
    }

    clearSession();
    window.location.href = "login.html";
    return null;
  }

  const user = getSessionUser();
  const token = getToken();

  if (!user || !token || (allowedRole && user.role !== allowedRole)) {
    window.location.href = "login.html";
    return null;
  }

  return user;
}
