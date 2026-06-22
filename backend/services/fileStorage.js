const fs = require("fs/promises");
const path = require("path");

const questionUploadDir = path.join(__dirname, "..", "uploads", "questions");

function getSafeFileName(originalName) {
  const extension = path.extname(originalName || "").toLowerCase();
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
}

async function saveQuestionImage(file) {
  if (!file) {
    return null;
  }

  const safeName = getSafeFileName(file.originalname);

  await fs.mkdir(questionUploadDir, { recursive: true });
  await fs.writeFile(path.join(questionUploadDir, safeName), file.buffer);

  return {
    path: `/uploads/questions/${safeName}`,
    originalName: file.originalname,
    data: file.buffer,
    mimeType: file.mimetype || "application/octet-stream",
  };
}

module.exports = {
  saveQuestionImage,
};
