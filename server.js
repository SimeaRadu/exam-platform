/*
----------------------------
     Pornire backend Azure
----------------------------
Acest fisier sta in radacina proiectului pentru Azure App Service si porneste aplicatia Express din backend.
*/
const app = require("./backend/server");

const port = process.env.PORT || process.env.WEBSITE_PORT || 5000;

app.listen(port, () => {
  console.log(`Exam Platform API running on port ${port}`);
});
