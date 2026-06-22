const fs = require("fs/promises");
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const { ensureSchema, getPool, sql } = require("../db");

const imageDirectory = path.join(__dirname, "..", "uploads", "questions");

function getMimeType(fileName) {
  const extension = path.extname(fileName || "").toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".ico": "image/x-icon",
    ".emf": "image/emf",
    ".wmf": "image/wmf",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

async function backfillQuestionImages(pool) {
  let localFileNames = [];

  try {
    localFileNames = await fs.readdir(imageDirectory);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await pool.request().query(`
    INSERT INTO question_images (
      question_id,
      image_path,
      image_original_name,
      sort_order
    )
    SELECT
      q.id,
      q.image_path,
      q.image_original_name,
      1
    FROM questions q
    WHERE q.image_path IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM question_images qi
        WHERE qi.question_id = q.id
      )
  `);

  const result = await pool.request().query(`
    SELECT id, image_path, image_original_name
    FROM question_images
    WHERE image_data IS NULL
    ORDER BY id
  `);

  let updated = 0;
  let missing = 0;
  let recoveredByQuestion = 0;

  for (const image of result.recordset) {
    const fileName = path.basename(String(image.image_path || "").replace(/\\/g, "/"));

    if (!fileName) {
      missing += 1;
      continue;
    }

    try {
      let sourceFileName = fileName;
      let imageData;

      try {
        imageData = await fs.readFile(path.join(imageDirectory, sourceFileName));
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }

        const prefixMatch = sourceFileName.match(/^(rtf-exam-\d+-q\d+)-/i);
        const extension = path.extname(sourceFileName).toLowerCase();
        const replacement = prefixMatch
          ? localFileNames.find((candidate) => (
            candidate.toLowerCase().startsWith(`${prefixMatch[1].toLowerCase()}-`)
            && path.extname(candidate).toLowerCase() === extension
          ))
          : null;

        if (!replacement) {
          throw error;
        }

        sourceFileName = replacement;
        imageData = await fs.readFile(path.join(imageDirectory, sourceFileName));
        recoveredByQuestion += 1;
      }

      await pool
        .request()
        .input("imageId", sql.Int, Number(image.id))
        .input("imageData", sql.VarBinary(sql.MAX), imageData)
        .input("mimeType", sql.NVarChar(100), getMimeType(sourceFileName))
        .query(`
          UPDATE question_images
          SET image_data = @imageData,
              mime_type = @mimeType
          WHERE id = @imageId
        `);

      updated += 1;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      missing += 1;
    }
  }

  return {
    checked: result.recordset.length,
    updated,
    missing,
    recoveredByQuestion,
  };
}

async function run() {
  await ensureSchema();
  const pool = await getPool();
  const summary = await backfillQuestionImages(pool);

  console.log(JSON.stringify(summary));

  await pool.close();
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  backfillQuestionImages,
};
