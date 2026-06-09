/*
----------------------------
       Gestionare examene
----------------------------
*/
// Contine logica profesor/admin pentru materii, examene, variante, import RTF, asignari si rezultate.
const { getPool, sql } = require("../db");
const { isAdminUser } = require("../middleware/authMiddleware");
const { saveQuestionImage } = require("../services/fileStorage");
const { TextDecoder } = require("util");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const windows1250Decoder = new TextDecoder("windows-1250");
const rtfQuestionImageDir = path.join(__dirname, "..", "uploads", "questions");

function getStoredQuestionImageName(imagePath) {
  const normalizedPath = String(imagePath || "").replace(/\\/g, "/");

  if (!normalizedPath.startsWith("/uploads/questions/")) {
    return null;
  }

  const fileName = path.basename(normalizedPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return fileName;
}

async function deleteQuestionImageFiles(imagePaths) {
  const fileNames = [...new Set(
    (imagePaths || [])
      .map(getStoredQuestionImageName)
      .filter(Boolean),
  )];

  await Promise.all(fileNames.map(async (fileName) => {
    try {
      await fs.unlink(path.join(rtfQuestionImageDir, fileName));
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`Nu am putut sterge imaginea ${fileName}: ${error.message}`);
      }
    }
  }));
}

function normalizeQuestionImages(questionData) {
  const images = Array.isArray(questionData.images) ? questionData.images : [];
  const normalized = images
    .map((image) => ({
      imagePath: image.imagePath || image.image_path || null,
      imageOriginalName: image.imageOriginalName || image.image_original_name || null,
    }))
    .filter((image) => image.imagePath);

  if (questionData.imagePath && !normalized.some((image) => image.imagePath === questionData.imagePath)) {
    normalized.unshift({
      imagePath: questionData.imagePath,
      imageOriginalName: questionData.imageOriginalName || null,
    });
  }

  return normalized;
}

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
       Parsare campuri JSON
----------------------------
*/
// Converteste campurile salvate ca text JSON in structuri JavaScript sigure.
function parseJsonField(value, fallback) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

/*
----------------------------
      Curatare text RTF
----------------------------
*/
// Normalizeaza textul extras din RTF ca intrebarile si raspunsurile sa poata fi detectate corect.
function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/*
----------------------------
      Decodare continut RTF
----------------------------
*/
// Converteste caracterele speciale si comenzile RTF in text simplu utilizabil de parser.
function decodeRtfBuffer(buffer) {
  const header = buffer.toString("latin1", 0, Math.min(buffer.length, 2000));

  if (/\\ansicpg1250\b/i.test(header)) {
    return windows1250Decoder.decode(buffer);
  }

  return buffer.toString("latin1");
}

function decodeRtfHex(hex) {
  return windows1250Decoder.decode(Uint8Array.from([parseInt(hex, 16)]));
}

function removeRtfControlWords(value) {
  return String(value || "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/\\./g, "");
}

function removeRtfDestinationGroups(input) {
  const blockedDestinations = new Set([
    "pict",
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "themedata",
    "colorschememapping",
    "datastore",
    "xmlnstbl",
    "latentstyles",
    "listtable",
    "listoverridetable",
  ]);
  const stack = [];
  let output = "";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const parentSkip = stack.length > 0 && stack[stack.length - 1].skip;

    if (char === "{") {
      const rest = input.slice(index + 1, index + 80);
      const destination = rest.match(/^\\(\*\\)?([a-zA-Z]+)/);
      const isStarDestination = Boolean(destination?.[1]);
      const destinationName = destination?.[2]?.toLowerCase();
      const skip = parentSkip || isStarDestination || blockedDestinations.has(destinationName);
      stack.push({ skip });

      if (!skip) {
        output += char;
      }

      continue;
    }

    if (char === "}") {
      const current = stack.pop();

      if (!current?.skip) {
        output += char;
      }

      continue;
    }

    if (!parentSkip) {
      output += char;
    }
  }

  return output;
}

function stripRtf(buffer) {
  return removeRtfDestinationGroups(decodeRtfBuffer(buffer))
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, " ")
    .replace(/\\'([0-9a-fA-F]{2})/g, (match, hex) => decodeRtfHex(hex))
    .replace(/\\u(-?\d+)\??/g, (match, code) => {
      const value = Number(code);
      return String.fromCharCode(value < 0 ? value + 65536 : value);
    })
    .replace(/[{}]/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/\\./g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBalancedGroupEnd(input, startIndex) {
  let depth = 0;

  for (let index = startIndex; index < input.length; index += 1) {
    if (input[index] === "{") {
      depth += 1;
    } else if (input[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function getLastQuestionNumber(rawPrefix) {
  let lastQuestionNumber = null;
  const decodedPrefix = rawPrefix
    .replace(/\\'([0-9a-fA-F]{2})/g, (match, hex) => decodeRtfHex(hex))
    .replace(/\\u(-?\d+)\??/g, (match, code) => {
      const value = Number(code);
      return String.fromCharCode(value < 0 ? value + 65536 : value);
    })
    .replace(/[{}]/g, "");
  const plainPrefix = removeRtfControlWords(decodedPrefix);
  const questionPattern = /Q\s*(\d+)[\.)]/gi;
  let match;

  while ((match = questionPattern.exec(plainPrefix)) !== null) {
    lastQuestionNumber = Number(match[1]);
  }

  return lastQuestionNumber;
}

function readUInt32LE(buffer, offset) {
  if (buffer.length < offset + 4) {
    return 0;
  }

  return buffer.readUInt32LE(offset);
}

function convertDibToBmp(dibBuffer) {
  if (dibBuffer.length < 16) {
    return null;
  }

  const headerSize = readUInt32LE(dibBuffer, 0);

  if (headerSize <= 0 || headerSize > dibBuffer.length) {
    return null;
  }

  const bitCount = dibBuffer.length >= 16 ? dibBuffer.readUInt16LE(14) : 0;
  const colorsUsed = dibBuffer.length >= 40 ? readUInt32LE(dibBuffer, 32) : 0;
  const colorTableSize = bitCount > 0 && bitCount <= 8
    ? (colorsUsed || (1 << bitCount)) * 4
    : 0;
  const pixelOffset = 14 + headerSize + colorTableSize;
  const bmpHeader = Buffer.alloc(14);

  bmpHeader.write("BM", 0, "ascii");
  bmpHeader.writeUInt32LE(14 + dibBuffer.length, 2);
  bmpHeader.writeUInt32LE(0, 6);
  bmpHeader.writeUInt32LE(Math.min(pixelOffset, 14 + dibBuffer.length), 10);

  return Buffer.concat([bmpHeader, dibBuffer]);
}

function getLongestHexRun(value) {
  const runs = value.match(/[\da-fA-F]{64,}/g) || [];

  return runs
    .sort((left, right) => right.length - left.length)[0] || null;
}

function sliceImageHexBySize(hex, extension) {
  const buffer = Buffer.from(hex, "hex");

  if (extension === "webp" && buffer.length >= 12) {
    const size = buffer.readUInt32LE(4) + 8;
    return hex.slice(0, Math.min(size, buffer.length) * 2);
  }

  if (extension === "bmp" && buffer.length >= 6) {
    const size = buffer.readUInt32LE(2);
    return hex.slice(0, Math.min(size || buffer.length, buffer.length) * 2);
  }

  if (extension === "ico" && buffer.length >= 6) {
    const imageCount = buffer.readUInt16LE(4);
    const directorySize = 6 + imageCount * 16;
    let size = directorySize;

    for (let index = 0; index < imageCount; index += 1) {
      const entryOffset = 6 + index * 16;

      if (buffer.length >= entryOffset + 16) {
        const imageSize = buffer.readUInt32LE(entryOffset + 8);
        const imageOffset = buffer.readUInt32LE(entryOffset + 12);
        size = Math.max(size, imageOffset + imageSize);
      }
    }

    return hex.slice(0, Math.min(size, buffer.length) * 2);
  }

  return hex;
}

function getRtfImagePayload(group) {
  const compactGroup = group.replace(/\s+/g, "");
  const signatures = [
    { extension: "png", pattern: /89504e47[\da-fA-F]+?49454e44ae426082/i },
    { extension: "jpg", pattern: /ffd8ff[\da-fA-F]+?ffd9/i },
    { extension: "gif", pattern: /47494638(?:37|39)61[\da-fA-F]+/i },
    { extension: "webp", pattern: /52494646[\da-fA-F]+/i },
    { extension: "bmp", pattern: /424d[\da-fA-F]+/i },
    { extension: "tif", pattern: /(?:49492a00|4d4d002a)[\da-fA-F]+/i },
  ];

  for (const signature of signatures) {
    const match = compactGroup.match(signature.pattern);

    if (match) {
      const hex = ["webp", "bmp"].includes(signature.extension)
        ? sliceImageHexBySize(match[0], signature.extension)
        : match[0];

      return {
        buffer: Buffer.from(hex, "hex"),
        extension: signature.extension,
      };
    }
  }

  const hexRun = getLongestHexRun(group);

  if (!hexRun) {
    return null;
  }

  if (/\\dibitmap\b/i.test(group)) {
    const bmpBuffer = convertDibToBmp(Buffer.from(hexRun, "hex"));

    return bmpBuffer ? { buffer: bmpBuffer, extension: "bmp" } : null;
  }

  if (/\\emfblip\b/i.test(group)) {
    return {
      buffer: Buffer.from(hexRun, "hex"),
      extension: "emf",
    };
  }

  if (/\\wmetafile\b/i.test(group)) {
    return {
      buffer: Buffer.from(hexRun, "hex"),
      extension: "wmf",
    };
  }

  if (/\\jpegblip\b/i.test(group)) {
    return {
      buffer: Buffer.from(hexRun, "hex"),
      extension: "jpg",
    };
  }

  if (/\\pngblip\b/i.test(group)) {
    return {
      buffer: Buffer.from(hexRun, "hex"),
      extension: "png",
    };
  }

  return null;
}

/*
----------------------------
      Imagini din RTF
----------------------------
*/
// Extrage imaginile gasite in fisierul RTF si le salveaza pentru afisarea intrebarilor.
async function extractRtfQuestionImages(buffer, examId) {
  const raw = decodeRtfBuffer(buffer);
  const images = [];
  const seenByQuestion = new Map();
  let searchIndex = 0;
  let imageIndex = 1;

  await fs.mkdir(rtfQuestionImageDir, { recursive: true });

  while (searchIndex < raw.length) {
    const shapeGroupStart = raw.indexOf("{\\*\\shppict", searchIndex);
    const pictGroupStart = raw.indexOf("{\\pict", searchIndex);
    const groupStart = [shapeGroupStart, pictGroupStart]
      .filter((index) => index !== -1)
      .sort((a, b) => a - b)[0];

    if (groupStart === undefined) {
      break;
    }

    const groupEnd = findBalancedGroupEnd(raw, groupStart);

    if (groupEnd === -1) {
      break;
    }

    const group = raw.slice(groupStart, groupEnd);
    const imagePayload = getRtfImagePayload(group);
    const questionNumber = getLastQuestionNumber(raw.slice(0, groupStart));

    if (imagePayload && questionNumber) {
      const imageHash = crypto
        .createHash("sha1")
        .update(imagePayload.buffer)
        .digest("hex");

      if (!seenByQuestion.has(questionNumber)) {
        seenByQuestion.set(questionNumber, new Set());
      }

      if (seenByQuestion.get(questionNumber).has(imageHash)) {
        searchIndex = groupEnd;
        continue;
      }

      seenByQuestion.get(questionNumber).add(imageHash);
      const fileName = `rtf-exam-${examId}-q${questionNumber}-${Date.now()}-${imageIndex}.${imagePayload.extension}`;
      const filePath = path.join(rtfQuestionImageDir, fileName);

      await fs.writeFile(filePath, imagePayload.buffer);
      images.push({
        questionNumber,
        imagePath: `/uploads/questions/${fileName}`,
        imageOriginalName: fileName,
      });
      imageIndex += 1;
    }

    searchIndex = groupEnd;
  }

  return images;
}

/*
----------------------------
     Transformare RTF in test
----------------------------
*/
// Citeste varianta din RTF si o transforma in intrebari, raspunsuri si marcaje de corectitudine.
function normalizeImportKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
}

/*
----------------------------
      Raspunsuri corecte RTF
----------------------------
*/
// Interpreteaza valorile marcate ca raspunsuri corecte, indiferent daca sunt litere sau numere.
function parseCorrectIndexes(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      if (/^[a-z]$/.test(item)) {
        return item.charCodeAt(0) - 97;
      }

      return Number(item.replace(/\D/g, "")) - 1;
    })
    .filter((index) => Number.isInteger(index) && index >= 0);
}

/*
----------------------------
      Intrebari din text RTF
----------------------------
*/
// Parcurge textul curatat si construieste variantele, intrebarile, raspunsurile si punctajele.
function parseRtfQuestions(text) {
  const lines = normalizeText(text).split("\n");
  const variants = [];
  let currentVariant = null;
  let currentQuestion = null;
  let lastAnswerIndex = null;
  let pendingCorrectMarker = false;

  function ensureVariant() {
    if (!currentVariant) {
      currentVariant = {
        variantName: "Varianta 1",
        rowNumber: 1,
        questions: [],
      };
      variants.push(currentVariant);
    }

    return currentVariant;
  }

  function finishQuestion() {
    if (currentQuestion) {
      currentQuestion.questionText = currentQuestion.questionText.trim();
      ensureVariant().questions.push(currentQuestion);
      currentQuestion = null;
      lastAnswerIndex = null;
      pendingCorrectMarker = false;
    }
  }

  function appendQuestionText(value) {
    const text = String(value || "").trim();

    if (text && currentQuestion) {
      currentQuestion.questionText = `${currentQuestion.questionText} ${text}`.trim();
    }
  }

  function applyQuestionHeaderRemainder(value) {
    const remainder = String(value || "").trim();

    if (!remainder || !currentQuestion) {
      return;
    }

    const pointMatch = remainder.match(/^\(([0-9]+(?:[.,][0-9]+)?)\s*p?\)\s*(.*)$/i);

    if (pointMatch) {
      currentQuestion.points = Number(String(pointMatch[1]).replace(",", ".")) || 1;
      appendQuestionText(pointMatch[2]);
      return;
    }

    appendQuestionText(remainder);
  }

  lines.forEach((line) => {
    const questionMatch = line.match(/^Q\s*(\d+)\s*[\.)]?\s*(.*)$/i);
    const starredAnswer = line.match(/^(\*)?\s*([a-fA-F])[\.)]\s*(.+)$/);

    if (questionMatch) {
      finishQuestion();
      ensureVariant();
      currentQuestion = {
        questionText: "",
        points: 1,
        answers: [],
        correctAnswerIndexes: [],
      };
      lastAnswerIndex = null;
      pendingCorrectMarker = false;
      applyQuestionHeaderRemainder(questionMatch[2]);
      return;
    }

    if (line === "." && currentQuestion && currentQuestion.answers.length === 0) {
      return;
    }

    if (line === "*" && currentQuestion) {
      pendingCorrectMarker = true;
      return;
    }

    if (starredAnswer && currentQuestion) {
      const answerIndex = currentQuestion.answers.length;
      currentQuestion.answers.push(starredAnswer[3].trim());
      lastAnswerIndex = answerIndex;

      if (starredAnswer[1] || pendingCorrectMarker) {
        currentQuestion.correctAnswerIndexes.push(answerIndex);
      }

      pendingCorrectMarker = false;
      return;
    }

    if (currentQuestion && currentQuestion.answers.length === 0) {
      const pointLine = line.match(/^\(([0-9]+(?:[.,][0-9]+)?)\s*p?\)\s*(.*)$/i);

      if (pointLine) {
        currentQuestion.points = Number(String(pointLine[1]).replace(",", ".")) || 1;
        appendQuestionText(pointLine[2]);
        return;
      }
    }

    const [rawKey, ...rawValueParts] = line.split(":");
    const key = normalizeImportKey(rawKey);
    const value = rawValueParts.join(":").trim();
    const numberedQuestion = line.match(/^\d+[\.)]\s+(.+)$/);
    const letterAnswer = line.match(/^([a-fA-F])[\.)]\s*(.+)$/);

    if (numberedQuestion) {
      finishQuestion();
      ensureVariant();
      currentQuestion = {
        questionText: numberedQuestion[1].trim(),
        points: 1,
        answers: [],
        correctAnswerIndexes: [],
      };
      lastAnswerIndex = null;
      return;
    }

    if (letterAnswer && currentQuestion) {
      lastAnswerIndex = currentQuestion.answers.length;
      currentQuestion.answers.push(letterAnswer[2].trim());
      if (pendingCorrectMarker) {
        currentQuestion.correctAnswerIndexes.push(lastAnswerIndex);
      }
      pendingCorrectMarker = false;
      return;
    }

    if (["VARIANTA", "VARIANT"].includes(key)) {
      finishQuestion();
      currentVariant = {
        variantName: value || `Varianta ${variants.length + 1}`,
        rowNumber: variants.length + 1,
        questions: [],
      };
      variants.push(currentVariant);
      lastAnswerIndex = null;
      pendingCorrectMarker = false;
      return;
    }

    if (["RAND", "ROW"].includes(key)) {
      ensureVariant().rowNumber = Number(value) || ensureVariant().rowNumber;
      return;
    }

    if (["INTREBARE", "QUESTION"].includes(key)) {
      finishQuestion();
      currentQuestion = {
        questionText: value,
        points: 1,
        answers: [],
        correctAnswerIndexes: [],
      };
      lastAnswerIndex = null;
      pendingCorrectMarker = false;
      return;
    }

    if (["PUNCTAJ", "POINTS"].includes(key) && currentQuestion) {
      currentQuestion.points = Number(value.replace(",", ".")) || 1;
      return;
    }

    if (["RASPUNS", "ANSWER"].includes(key) && currentQuestion) {
      lastAnswerIndex = currentQuestion.answers.length;
      currentQuestion.answers.push(value);
      if (pendingCorrectMarker) {
        currentQuestion.correctAnswerIndexes.push(lastAnswerIndex);
      }
      pendingCorrectMarker = false;
      return;
    }

    if (["CORECT", "CORRECT"].includes(key) && currentQuestion) {
      currentQuestion.correctAnswerIndexes = parseCorrectIndexes(value);
      lastAnswerIndex = null;
      pendingCorrectMarker = false;
      return;
    }

    if (currentQuestion) {
      const continuation = line.replace(/^p\)\s*/i, "").trim();

      if (continuation) {
        if (currentQuestion.answers.length === 0) {
          appendQuestionText(continuation);
        } else if (lastAnswerIndex !== null && currentQuestion.answers[lastAnswerIndex]) {
          lastAnswerIndex = currentQuestion.answers.length;
          currentQuestion.answers.push(continuation);
        } else {
          appendQuestionText(continuation);
        }
      }
    }
  });

  finishQuestion();

  return variants.filter((variant) => variant.questions.length > 0);
}

/*
----------------------------
      Salvare intrebare
----------------------------
*/
// Insereaza intrebarea si toate variantele ei de raspuns in baza de date.
async function insertQuestion(transaction, variantId, questionData) {
  const answerEntries = questionData.answers
    .map((answer, index) => ({
      index,
      text: String(answer || "").trim(),
    }))
    .filter((answer) => answer.text);

  if (!questionData.questionText || answerEntries.length < 2) {
    return null;
  }

  const correctAnswerIndexes = (questionData.correctAnswerIndexes || [])
    .map(Number)
    .filter((index) => answerEntries.some((answer) => answer.index === index));
  const questionType = correctAnswerIndexes.length === 1 ? "single_choice" : "multiple_choice";
  const questionImages = normalizeQuestionImages(questionData);
  const primaryImage = questionImages[0] || {};
  const questionRequest = new sql.Request(transaction);
  const questionResult = await questionRequest
    .input("variantId", sql.Int, variantId)
    .input("questionText", sql.NVarChar(sql.MAX), questionData.questionText.trim())
    .input("points", sql.Decimal(5, 2), Number(questionData.points) || 1)
    .input("questionType", sql.NVarChar(30), questionType)
    .input("imagePath", sql.NVarChar(2048), primaryImage.imagePath || null)
    .input("imageOriginalName", sql.NVarChar(255), primaryImage.imageOriginalName || null)
    .query(`
      INSERT INTO questions (
        variant_id,
        question_text,
        question_type,
        points,
        image_path,
        image_original_name
      )
      OUTPUT INSERTED.id
      VALUES (
        @variantId,
        @questionText,
        @questionType,
        @points,
        @imagePath,
        @imageOriginalName
      )
    `);

  const questionId = Number(questionResult.recordset[0].id);

  for (let index = 0; index < questionImages.length; index += 1) {
    const image = questionImages[index];
    await new sql.Request(transaction)
      .input("questionId", sql.Int, questionId)
      .input("imagePath", sql.NVarChar(2048), image.imagePath)
      .input("imageOriginalName", sql.NVarChar(255), image.imageOriginalName || null)
      .input("sortOrder", sql.Int, index + 1)
      .query(`
        INSERT INTO question_images (question_id, image_path, image_original_name, sort_order)
        VALUES (@questionId, @imagePath, @imageOriginalName, @sortOrder)
      `);
  }

  for (const answer of answerEntries) {
    const answerRequest = new sql.Request(transaction);
    await answerRequest
      .input("questionId", sql.Int, questionId)
      .input("answerText", sql.NVarChar(sql.MAX), answer.text)
      .input("isCorrect", sql.Bit, correctAnswerIndexes.includes(answer.index) ? 1 : 0)
      .query(`
        INSERT INTO answers (question_id, answer_text, is_correct)
        VALUES (@questionId, @answerText, @isCorrect)
      `);
  }

  return questionId;
}

/*
----------------------------
              Materii
----------------------------
*/
// Administreaza materiile, profesorii asignati si informatiile vizibile studentilor.
async function listSubjects(req, res) {
  try {
    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT s.id, s.name, s.professor_id, u.full_name AS professor_name,
               s.info_text, s.rules_text, s.created_at
        FROM subjects s
        LEFT JOIN users u ON u.id = s.professor_id
        WHERE @isAdmin = 1 OR s.professor_id = @professorId
        ORDER BY s.name
      `);
    const professors = admin
      ? await pool.request().query(`
          SELECT id, full_name, email
          FROM users
          WHERE role = 'professor'
          ORDER BY full_name
        `)
      : { recordset: [] };

    res.json({
      subjects: result.recordset,
      professors: professors.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea materiilor.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Creare materie
----------------------------
*/
// Permite adminului sa creeze o materie si optional sa o lege direct de un profesor.
async function createSubject(req, res) {
  try {
    const { name, professorId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Numele materiei este obligatoriu.",
      });
    }

    const pool = await getPool();
    const cleanProfessorId = professorId ? Number(professorId) : null;

    if (cleanProfessorId !== null) {
      if (!Number.isInteger(cleanProfessorId)) {
        return res.status(400).json({
          message: "Profesor invalid.",
        });
      }

      const professorCheck = await pool
        .request()
        .input("professorId", sql.Int, cleanProfessorId)
        .query(`
          SELECT TOP 1 id
          FROM users
          WHERE id = @professorId AND role = 'professor'
        `);

      if (professorCheck.recordset.length === 0) {
        return res.status(404).json({
          message: "Profesorul nu a fost gasit.",
        });
      }
    }

    const result = await pool
      .request()
      .input("name", sql.NVarChar(100), name.trim())
      .input("professorId", sql.Int, cleanProfessorId)
      .query(`
        INSERT INTO subjects (name, professor_id)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.professor_id,
               INSERTED.info_text, INSERTED.rules_text, INSERTED.created_at
        VALUES (@name, @professorId)
      `);

    res.status(201).json({
      message: "Materie creata.",
      subject: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la crearea materiei.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Asignare materie
----------------------------
*/
// Schimba profesorul responsabil pentru o materie sau scoate asignarea existenta.
async function updateSubjectAssignment(req, res) {
  try {
    const subjectId = Number(req.params.id);
    const { professorId } = req.body;
    const cleanProfessorId = professorId ? Number(professorId) : null;

    if (!Number.isInteger(subjectId)) {
      return res.status(400).json({
        message: "ID materie invalid.",
      });
    }

    const pool = await getPool();

    if (cleanProfessorId !== null) {
      if (!Number.isInteger(cleanProfessorId)) {
        return res.status(400).json({
          message: "Profesor invalid.",
        });
      }

      const professorCheck = await pool
        .request()
        .input("professorId", sql.Int, cleanProfessorId)
        .query(`
          SELECT TOP 1 id
          FROM users
          WHERE id = @professorId AND role = 'professor'
        `);

      if (professorCheck.recordset.length === 0) {
        return res.status(404).json({
          message: "Profesorul nu a fost gasit.",
        });
      }
    }

    const result = await pool
      .request()
      .input("subjectId", sql.Int, subjectId)
      .input("professorId", sql.Int, cleanProfessorId)
      .query(`
        UPDATE subjects
        SET professor_id = @professorId
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.professor_id,
               INSERTED.info_text, INSERTED.rules_text, INSERTED.created_at
        WHERE id = @subjectId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Materia nu a fost gasita.",
      });
    }

    res.json({
      message: cleanProfessorId ? "Materia a fost asignata." : "Asignarea materiei a fost scoasa.",
      subject: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la asignarea materiei.",
      error: error.message,
    });
  }
}

/*
----------------------------
     Informatii si reguli
----------------------------
*/
// Salveaza mesajele si regulile materiei, vizibile ulterior in panoul studentului.
async function updateSubjectInfo(req, res) {
  try {
    const subjectId = Number(req.params.id);
    const { infoText = "", rulesText = "" } = req.body;

    if (!Number.isInteger(subjectId)) {
      return res.status(400).json({
        message: "ID materie invalid.",
      });
    }

    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("subjectId", sql.Int, subjectId)
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .input("infoText", sql.NVarChar(sql.MAX), String(infoText || "").trim())
      .input("rulesText", sql.NVarChar(sql.MAX), String(rulesText || "").trim())
      .query(`
        UPDATE subjects
        SET info_text = @infoText,
            rules_text = @rulesText
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.professor_id,
               INSERTED.info_text, INSERTED.rules_text, INSERTED.created_at
        WHERE id = @subjectId AND (@isAdmin = 1 OR professor_id = @professorId)
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Materia nu a fost gasita sau nu ai dreptul sa modifici informatiile.",
      });
    }

    res.json({
      message: "Informatiile materiei au fost salvate.",
      subject: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la salvarea informatiilor materiei.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Stergere materie
----------------------------
*/
// Elimina materia si toate examenele, variantele, raspunsurile si rezultatele legate de ea.
async function deleteSubject(req, res) {
  try {
    const subjectId = Number(req.params.id);
    const imagePathsToDelete = [];

    if (!Number.isInteger(subjectId)) {
      return res.status(400).json({
        message: "ID materie invalid.",
      });
    }

    const pool = await getPool();
    const subjectCheck = await pool
      .request()
      .input("id", sql.Int, subjectId)
      .query("SELECT TOP 1 id FROM subjects WHERE id = @id");

    if (subjectCheck.recordset.length === 0) {
      return res.status(404).json({
        message: "Materia nu a fost gasita.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const examsResult = await new sql.Request(transaction)
        .input("subjectId", sql.Int, subjectId)
        .query("SELECT id FROM exams WHERE subject_id = @subjectId");

      for (const exam of examsResult.recordset) {
        imagePathsToDelete.push(...await deleteExamData(transaction, Number(exam.id)));
      }

      await new sql.Request(transaction)
        .input("id", sql.Int, subjectId)
        .query("DELETE FROM subjects WHERE id = @id");

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await deleteQuestionImageFiles(imagePathsToDelete);

    res.json({
      message: "Materie stearsa.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Nu am putut sterge materia. Verifica daca are examene legate de ea.",
      error: error.message,
    });
  }
}

/*
----------------------------
              Examene
----------------------------
*/
// Creeaza, listeaza, modifica statusul, arhiveaza si sterge examenele.
async function deleteExamData(transaction, examId) {
  const imageResult = await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      SELECT q.image_path
      FROM questions q
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
        AND q.image_path IS NOT NULL

      UNION

      SELECT qi.image_path
      FROM question_images qi
      INNER JOIN questions q ON q.id = qi.question_id
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);
  const imagePaths = imageResult.recordset.map((row) => row.image_path);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_answer_drafts WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_test_locks WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_test_events WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_answers WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM results WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM student_exam_assignments WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE a
      FROM answers a
      INNER JOIN questions q ON q.id = a.question_id
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE qi
      FROM question_images qi
      INNER JOIN questions q ON q.id = qi.question_id
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query(`
      DELETE q
      FROM questions q
      INNER JOIN exam_variants v ON v.id = q.variant_id
      WHERE v.exam_id = @examId
    `);

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM exam_variants WHERE exam_id = @examId");

  await new sql.Request(transaction)
    .input("examId", sql.Int, examId)
    .query("DELETE FROM exams WHERE id = @examId");

  return imagePaths;
}

/*
----------------------------
        Listare examene
----------------------------
*/
// Returneaza examenele ordonate dupa data si filtrate dupa permisiunile profesorului.
async function listExams(req, res) {
  try {
    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT e.id, e.subject_id, s.name AS subject_name, s.professor_id,
               p.full_name AS subject_professor_name,
               e.title, e.exam_date, e.status, e.created_by, e.bonus_points, e.created_at
        FROM exams e
        INNER JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN users p ON p.id = s.professor_id
        WHERE @isAdmin = 1 OR s.professor_id = @professorId
        ORDER BY
          CASE
            WHEN e.status IN ('future', 'active') THEN 0
            ELSE 1
          END,
          CASE
            WHEN e.status IN ('future', 'active') THEN e.exam_date
          END ASC,
          CASE
            WHEN e.status IN ('finished', 'archived') THEN e.exam_date
          END DESC,
          e.created_at DESC
      `);

    res.json({
      exams: result.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea examenelor.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Creare examen
----------------------------
*/
// Creeaza examenul pe materia selectata si salveaza punctele din oficiu.
async function createExam(req, res) {
  try {
    const { subjectId, title, examDate, bonusPoints = 0 } = req.body;

    if (!subjectId || !title || !examDate) {
      return res.status(400).json({
        message: "Materia, titlul si data examenului sunt obligatorii.",
      });
    }

    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const subjectCheck = await pool
      .request()
      .input("subjectId", sql.Int, Number(subjectId))
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT TOP 1 id
        FROM subjects
        WHERE id = @subjectId AND (@isAdmin = 1 OR professor_id = @professorId)
      `);

    if (subjectCheck.recordset.length === 0) {
      return res.status(404).json({
        message: "Materia nu a fost gasita pentru acest profesor.",
      });
    }

    const result = await pool
      .request()
      .input("subjectId", sql.Int, Number(subjectId))
      .input("title", sql.NVarChar(150), title.trim())
      .input("examDate", sql.DateTime, new Date(examDate))
      .input("bonusPoints", sql.Decimal(5, 2), Number(bonusPoints) || 0)
      .input("createdBy", sql.Int, req.user.id)
      .query(`
        INSERT INTO exams (subject_id, title, exam_date, status, bonus_points, created_by)
        OUTPUT INSERTED.id, INSERTED.subject_id, INSERTED.title,
               INSERTED.exam_date, INSERTED.status, INSERTED.bonus_points,
               INSERTED.created_by, INSERTED.created_at
        VALUES (@subjectId, @title, @examDate, 'future', @bonusPoints, @createdBy)
      `);

    res.status(201).json({
      message: "Examen creat.",
      exam: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la crearea examenului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Schimbare status
----------------------------
*/
// Trecerea intre viitor, activ, finalizat si arhivat se face doar pe examenele permise.
async function updateExamStatus(req, res) {
  try {
    const examId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    if (!["future", "active", "finished", "archived"].includes(status)) {
      return res.status(400).json({
        message: "Status examen invalid.",
      });
    }

    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("id", sql.Int, examId)
      .input("status", sql.NVarChar(20), status)
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        UPDATE e
        SET status = @status
        OUTPUT INSERTED.id, INSERTED.subject_id, INSERTED.title,
               INSERTED.exam_date, INSERTED.status, INSERTED.created_by, INSERTED.created_at
        FROM exams e
        INNER JOIN subjects s ON s.id = e.subject_id
        WHERE e.id = @id AND (@isAdmin = 1 OR s.professor_id = @professorId)
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit sau nu ai dreptul sa il modifici.",
      });
    }

    res.json({
      message: "Status examen actualizat.",
      exam: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la actualizarea examenului.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Stergere examen
----------------------------
*/
// Sterge examenul impreuna cu variantele, intrebarile, asignarile si rezultatele aferente.
async function deleteExam(req, res) {
  try {
    const examId = Number(req.params.id);
    let imagePathsToDelete = [];

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const examCheck = await pool
      .request()
      .input("id", sql.Int, examId)
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT TOP 1 e.id
        FROM exams e
        INNER JOIN subjects s ON s.id = e.subject_id
        WHERE e.id = @id AND (@isAdmin = 1 OR s.professor_id = @professorId)
      `);

    if (examCheck.recordset.length === 0) {
      return res.status(404).json({
        message: "Examenul nu a fost gasit sau nu ai dreptul sa il stergi.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      imagePathsToDelete = await deleteExamData(transaction, examId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await deleteQuestionImageFiles(imagePathsToDelete);

    res.json({
      message: "Examen sters.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Nu am putut sterge examenul si datele legate de el.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Permisiuni profesor
----------------------------
*/
// Verifica daca profesorul poate modifica examenul, in functie de materia asignata.
async function canManageExam(pool, req, examId) {
  if (isAdminUser(req.user)) {
    return true;
  }

  const result = await pool
    .request()
    .input("examId", sql.Int, examId)
    .input("professorId", sql.Int, req.user.id)
    .query(`
      SELECT TOP 1 e.id
      FROM exams e
      INNER JOIN subjects s ON s.id = e.subject_id
      WHERE e.id = @examId
        AND s.professor_id = @professorId
    `);

  return result.recordset.length > 0;
}

/*
----------------------------
       Variante si intrebari
----------------------------
*/
// Gestioneaza variantele incarcate din RTF si intrebarile atasate fiecarui examen.
async function listVariants(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa vezi variantele acestui examen.",
      });
    }

    const variantsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT id, exam_id, variant_name, row_number, created_at
        FROM exam_variants
        WHERE exam_id = @examId
        ORDER BY row_number, id
      `);

    const questionsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT q.id AS question_id, q.variant_id, q.question_text, q.question_type,
               q.points, q.image_path, q.image_original_name,
               a.id AS answer_id, a.answer_text, a.is_correct
        FROM questions q
        INNER JOIN exam_variants v ON v.id = q.variant_id
        LEFT JOIN answers a ON a.question_id = q.id
        WHERE v.exam_id = @examId
        ORDER BY q.id, a.id
      `);

    const questionsByVariant = new Map();

    questionsResult.recordset.forEach((row) => {
      const variantKey = String(row.variant_id);
      const questionKey = String(row.question_id);

      if (!questionsByVariant.has(variantKey)) {
        questionsByVariant.set(variantKey, new Map());
      }

      const variantQuestions = questionsByVariant.get(variantKey);

      if (!variantQuestions.has(questionKey)) {
        variantQuestions.set(questionKey, {
          id: row.question_id,
          question_text: row.question_text,
          question_type: row.question_type,
          points: row.points,
          image_path: row.image_path,
          image_original_name: row.image_original_name,
          answers: [],
        });
      }

      if (row.answer_id) {
        variantQuestions.get(questionKey).answers.push({
          id: row.answer_id,
          answer_text: row.answer_text,
          is_correct: Boolean(row.is_correct),
        });
      }
    });

    const variants = [];

    for (const variant of variantsResult.recordset) {
      const questions = [...(questionsByVariant.get(String(variant.id)) || new Map()).values()];
      await attachQuestionImages(pool, questions);
      variants.push({
        ...variant,
        questions,
      });
    }

    res.json({
      variants,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea variantelor.",
      error: error.message,
    });
  }
}

/*
----------------------------
        Creare varianta
----------------------------
*/
// Creeaza manual o varianta pentru examen, pastrat pentru compatibilitate cu datele existente.
async function createVariant(req, res) {
  try {
    const examId = Number(req.params.examId);
    const { variantName, rowNumber } = req.body;

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    if (!variantName || !variantName.trim()) {
      return res.status(400).json({
        message: "Numele variantei este obligatoriu.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa modifici variantele acestui examen.",
      });
    }

    const result = await pool
      .request()
      .input("examId", sql.Int, examId)
      .input("variantName", sql.NVarChar(50), variantName.trim())
      .input("rowNumber", sql.Int, rowNumber ? Number(rowNumber) : null)
      .query(`
        INSERT INTO exam_variants (exam_id, variant_name, row_number)
        OUTPUT INSERTED.id, INSERTED.exam_id, INSERTED.variant_name,
               INSERTED.row_number, INSERTED.created_at
        VALUES (@examId, @variantName, @rowNumber)
      `);

    res.status(201).json({
      message: "Varianta creata.",
      variant: result.recordset[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la crearea variantei.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Stergere varianta
----------------------------
*/
// Permite stergerea unei variante incarcate gresit, daca nu exista rezultate salvate pe ea.
async function deleteVariant(req, res) {
  try {
    const variantId = Number(req.params.variantId);

    if (!Number.isInteger(variantId)) {
      return res.status(400).json({
        message: "ID varianta invalid.",
      });
    }

    const pool = await getPool();
    const variantResult = await pool
      .request()
      .input("variantId", sql.Int, variantId)
      .query(`
        SELECT TOP 1 id, exam_id
        FROM exam_variants
        WHERE id = @variantId
      `);

    if (variantResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Varianta nu a fost gasita.",
      });
    }

    const examId = Number(variantResult.recordset[0].exam_id);
    const imageResult = await pool
      .request()
      .input("variantId", sql.Int, variantId)
      .query(`
        SELECT image_path
        FROM questions
        WHERE variant_id = @variantId
          AND image_path IS NOT NULL

        UNION

        SELECT qi.image_path
        FROM question_images qi
        INNER JOIN questions q ON q.id = qi.question_id
        WHERE q.variant_id = @variantId
      `);
    const imagePathsToDelete = imageResult.recordset.map((row) => row.image_path);

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa stergi aceasta varianta.",
      });
    }

    const resultCheck = await pool
      .request()
      .input("examId", sql.Int, examId)
      .input("variantId", sql.Int, variantId)
      .query(`
        SELECT TOP 1 id
        FROM (
          SELECT r.id
          FROM results r
          INNER JOIN student_exam_assignments a
            ON a.student_id = r.student_id
            AND a.exam_id = r.exam_id
          WHERE r.exam_id = @examId
            AND a.variant_id = @variantId

          UNION

          SELECT r.id
          FROM results r
          INNER JOIN student_answers sa
            ON sa.student_id = r.student_id
            AND sa.exam_id = r.exam_id
          INNER JOIN questions q ON q.id = sa.question_id
          WHERE r.exam_id = @examId
            AND q.variant_id = @variantId
        ) saved_results
      `);

    if (resultCheck.recordset.length > 0) {
      return res.status(409).json({
        message: "Varianta are rezultate salvate si nu poate fi stearsa fara sa afecteze notele.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query(`
          DELETE d
          FROM student_answer_drafts d
          INNER JOIN questions q ON q.id = d.question_id
          WHERE q.variant_id = @variantId
        `);

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query("DELETE FROM student_exam_assignments WHERE variant_id = @variantId");

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query(`
          DELETE sa
          FROM student_answers sa
          INNER JOIN questions q ON q.id = sa.question_id
          WHERE q.variant_id = @variantId
        `);

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query(`
          DELETE a
          FROM answers a
          INNER JOIN questions q ON q.id = a.question_id
          WHERE q.variant_id = @variantId
        `);

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query(`
          DELETE qi
          FROM question_images qi
          INNER JOIN questions q ON q.id = qi.question_id
          WHERE q.variant_id = @variantId
        `);

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query("DELETE FROM questions WHERE variant_id = @variantId");

      await new sql.Request(transaction)
        .input("variantId", sql.Int, variantId)
        .query("DELETE FROM exam_variants WHERE id = @variantId");

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await deleteQuestionImageFiles(imagePathsToDelete);

    res.json({
      message: "Varianta stearsa.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la stergerea variantei.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Creare intrebare
----------------------------
*/
// Salveaza manual o intrebare cu raspunsuri si imagine, util pentru editari punctuale.
async function createQuestion(req, res) {
  try {
    const variantId = Number(req.params.variantId);
    const { questionText, points = 1 } = req.body;
    const answers = parseJsonField(req.body.answers, []);
    const correctAnswerIndexes = parseJsonField(req.body.correctAnswerIndexes, [])
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index));

    if (!Number.isInteger(variantId)) {
      return res.status(400).json({
        message: "ID varianta invalid.",
      });
    }

    if (!questionText || !questionText.trim()) {
      return res.status(400).json({
        message: "Textul intrebarii este obligatoriu.",
      });
    }

    const answerEntries = answers
      .map((answer, index) => ({
        index,
        text: String(answer || "").trim(),
      }))
      .filter((answer) => answer.text);

    if (answerEntries.length < 2) {
      return res.status(400).json({
        message: "Adauga cel putin doua raspunsuri.",
      });
    }

    const invalidCorrectIndex = correctAnswerIndexes.some((index) => (
      !answerEntries.some((answer) => answer.index === index)
    ));

    if (invalidCorrectIndex) {
      return res.status(400).json({
        message: "Unul dintre raspunsurile corecte selectate este invalid.",
      });
    }

    const pool = await getPool();
    const variantResult = await pool
      .request()
      .input("variantId", sql.Int, variantId)
      .query(`
        SELECT TOP 1 v.id, v.exam_id
        FROM exam_variants v
        WHERE v.id = @variantId
      `);

    if (variantResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Varianta nu a fost gasita.",
      });
    }

    if (!(await canManageExam(pool, req, Number(variantResult.recordset[0].exam_id)))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa modifici intrebarile acestei variante.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const image = await saveQuestionImage(req.file);
      const imagePath = image ? image.path : null;
      const imageOriginalName = image ? image.originalName : null;
      const questionId = await insertQuestion(transaction, variantId, {
        questionText,
        points,
        answers,
        correctAnswerIndexes,
        imagePath,
        imageOriginalName,
      });

      await transaction.commit();

      res.status(201).json({
        message: "Intrebare creata.",
        question: {
          id: questionId,
          variant_id: variantId,
          question_text: questionText.trim(),
          points: Number(points) || 1,
          image_path: imagePath,
          image_original_name: imageOriginalName,
          images: imagePath ? [{
            id: null,
            image_path: imagePath,
            image_original_name: imageOriginalName,
            sort_order: 1,
          }] : [],
        },
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      message: "Eroare la crearea intrebarii.",
      error: error.message,
    });
  }
}

/*
----------------------------
             Rezultate
----------------------------
*/
// Grupeaza rezultatele pe examene si pregateste detaliile pentru corectare si export.
async function listResults(req, res) {
  try {
    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT r.id, r.student_id, u.full_name AS student_name,
               u.matriculation_number,
               r.exam_id, e.title AS exam_title, e.created_by,
               e.exam_date, s.name AS subject_name, s.professor_id,
               v.variant_name, v.row_number,
               r.score, r.max_score, r.grade, r.submitted_at,
               ISNULL(events.event_count, 0) AS event_count
        FROM results r
        INNER JOIN users u ON u.id = r.student_id
        INNER JOIN exams e ON e.id = r.exam_id
        INNER JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN student_exam_assignments sea
          ON sea.student_id = r.student_id AND sea.exam_id = r.exam_id
        LEFT JOIN exam_variants v ON v.id = sea.variant_id
        OUTER APPLY (
          SELECT COUNT(*) AS event_count
          FROM student_test_events ste
          WHERE ste.student_id = r.student_id
            AND ste.exam_id = r.exam_id
        ) events
        WHERE @isAdmin = 1 OR s.professor_id = @professorId
        ORDER BY r.submitted_at DESC
      `);

    res.json({
      results: result.recordset,
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
       Detalii rezultat
----------------------------
*/
// Afiseaza testul rezolvat: ce a ales studentul, ce era corect si evenimentele din timpul testului.
async function getResultDetails(req, res) {
  try {
    const resultId = Number(req.params.id);

    if (!Number.isInteger(resultId)) {
      return res.status(400).json({
        message: "ID rezultat invalid.",
      });
    }

    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("resultId", sql.Int, resultId)
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT r.id AS result_id, r.student_id, r.score, r.max_score, r.grade, r.submitted_at,
               u.full_name AS student_name, u.email AS student_email,
               e.id AS exam_id, e.title AS exam_title, s.name AS subject_name,
               v.id AS variant_id, v.variant_name, v.row_number
        FROM results r
        INNER JOIN users u ON u.id = r.student_id
        INNER JOIN exams e ON e.id = r.exam_id
        INNER JOIN subjects s ON s.id = e.subject_id
        LEFT JOIN student_exam_assignments sea
          ON sea.student_id = r.student_id AND sea.exam_id = r.exam_id
        LEFT JOIN exam_variants v ON v.id = sea.variant_id
        WHERE r.id = @resultId
          AND (@isAdmin = 1 OR s.professor_id = @professorId)
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Rezultatul nu a fost gasit sau nu ai dreptul sa il vezi.",
      });
    }

    const first = result.recordset[0];
    const eventsResult = await pool
      .request()
      .input("studentId", sql.Int, Number(first.student_id))
      .input("examId", sql.Int, Number(first.exam_id))
      .query(`
        SELECT event_type, details, created_at
        FROM student_test_events
        WHERE student_id = @studentId AND exam_id = @examId
        ORDER BY created_at DESC
      `);
    const questionsMap = new Map();

    if (first.variant_id) {
      const questionsResult = await pool
        .request()
        .input("studentId", sql.Int, Number(first.student_id))
        .input("examId", sql.Int, Number(first.exam_id))
        .input("variantId", sql.Int, Number(first.variant_id))
        .query(`
          SELECT q.id AS question_id, q.question_text, q.points,
                 q.image_path, q.image_original_name,
                 ans.id AS answer_id, ans.answer_text, ans.is_correct,
                 CASE WHEN sa.id IS NULL THEN 0 ELSE 1 END AS is_selected
          FROM questions q
          LEFT JOIN answers ans ON ans.question_id = q.id
          LEFT JOIN student_answers sa
            ON sa.student_id = @studentId
            AND sa.exam_id = @examId
            AND sa.question_id = q.id
            AND sa.answer_id = ans.id
          WHERE q.variant_id = @variantId
          ORDER BY q.id, ans.id
        `);

      questionsResult.recordset.forEach((row) => {
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
    }

    const questions = [...questionsMap.values()];
    await attachQuestionImages(pool, questions);

    res.json({
      result: {
        id: first.result_id,
        score: first.score,
        max_score: first.max_score,
        grade: first.grade,
        submitted_at: first.submitted_at,
        student_name: first.student_name,
        student_email: first.student_email,
        exam_id: first.exam_id,
        exam_title: first.exam_title,
        subject_name: first.subject_name,
        variant_name: first.variant_name,
        row_number: first.row_number,
      },
      questions,
      events: eventsResult.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea detaliilor rezultatului.",
      error: error.message,
    });
  }
}

/*
----------------------------
      Blocari test live
----------------------------
*/
// Profesorii vad studentii blocati la examenele lor si pot permite continuarea sau inchiderea testului.
async function listActiveTestLocks(req, res) {
  try {
    const pool = await getPool();
    const admin = isAdminUser(req.user);
    const result = await pool
      .request()
      .input("professorId", sql.Int, req.user.id)
      .input("isAdmin", sql.Bit, admin ? 1 : 0)
      .query(`
        SELECT l.id, l.student_id, u.full_name AS student_name,
               u.email AS student_email, u.matriculation_number,
               l.exam_id, e.title AS exam_title, e.exam_date,
               s.name AS subject_name, s.professor_id,
               l.event_type, l.details, l.created_at
        FROM student_test_locks l
        INNER JOIN users u ON u.id = l.student_id
        INNER JOIN exams e ON e.id = l.exam_id
        INNER JOIN subjects s ON s.id = e.subject_id
        WHERE l.is_active = 1
          AND (@isAdmin = 1 OR s.professor_id = @professorId)
        ORDER BY l.created_at DESC
      `);

    res.json({
      locks: result.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea blocarilor active.",
      error: error.message,
    });
  }
}

async function releaseTestLock(req, res) {
  try {
    const lockId = Number(req.params.lockId);

    if (!Number.isInteger(lockId)) {
      return res.status(400).json({
        message: "ID blocare invalid.",
      });
    }

    const pool = await getPool();
    const lockResult = await pool
      .request()
      .input("lockId", sql.Int, lockId)
      .query(`
        SELECT TOP 1 id, exam_id
        FROM student_test_locks
        WHERE id = @lockId AND is_active = 1
      `);

    if (lockResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Blocarea nu mai este activa.",
      });
    }

    const examId = Number(lockResult.recordset[0].exam_id);

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa deblochezi acest test.",
      });
    }

    await pool
      .request()
      .input("lockId", sql.Int, lockId)
      .input("releasedBy", sql.Int, req.user.id)
      .query(`
        UPDATE student_test_locks
        SET is_active = 0,
            released_at = SYSUTCDATETIME(),
            released_by = @releasedBy
        WHERE id = @lockId
      `);

    res.json({
      message: "Studentul poate continua testul.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la deblocarea testului.",
      error: error.message,
    });
  }
}

async function markTestLockPlagiarism(req, res) {
  try {
    const lockId = Number(req.params.lockId);

    if (!Number.isInteger(lockId)) {
      return res.status(400).json({
        message: "ID blocare invalid.",
      });
    }

    const pool = await getPool();
    const lockResult = await pool
      .request()
      .input("lockId", sql.Int, lockId)
      .query(`
        SELECT TOP 1 id, student_id, exam_id, event_type, details
        FROM student_test_locks
        WHERE id = @lockId AND is_active = 1
      `);

    if (lockResult.recordset.length === 0) {
      return res.status(404).json({
        message: "Blocarea nu mai este activa.",
      });
    }

    const lock = lockResult.recordset[0];
    const examId = Number(lock.exam_id);
    const studentId = Number(lock.student_id);

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa inchizi acest test.",
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input("studentId", sql.Int, studentId)
        .input("examId", sql.Int, examId)
        .query(`
          DELETE FROM student_answer_drafts
          WHERE student_id = @studentId AND exam_id = @examId
        `);

      await new sql.Request(transaction)
        .input("studentId", sql.Int, studentId)
        .input("examId", sql.Int, examId)
        .query(`
          DELETE FROM student_answers
          WHERE student_id = @studentId AND exam_id = @examId
        `);

      await new sql.Request(transaction)
        .input("studentId", sql.Int, studentId)
        .input("examId", sql.Int, examId)
        .query(`
          IF EXISTS (
            SELECT 1 FROM results
            WHERE student_id = @studentId AND exam_id = @examId
          )
          BEGIN
            UPDATE results
            SET score = 0,
                max_score = 0,
                grade = NULL,
                submitted_at = SYSUTCDATETIME()
            WHERE student_id = @studentId AND exam_id = @examId
          END
          ELSE
          BEGIN
            INSERT INTO results (student_id, exam_id, score, max_score, grade)
            VALUES (@studentId, @examId, 0, 0, NULL)
          END
        `);

      await new sql.Request(transaction)
        .input("studentId", sql.Int, studentId)
        .input("examId", sql.Int, examId)
        .input("details", sql.NVarChar(500), "Profesorul a incheiat testul si l-a marcat ca plagiat.")
        .query(`
          INSERT INTO student_test_events (student_id, exam_id, event_type, details)
          VALUES (@studentId, @examId, 'plagiarism_closed', @details)
        `);

      await new sql.Request(transaction)
        .input("lockId", sql.Int, lockId)
        .input("releasedBy", sql.Int, req.user.id)
        .query(`
          UPDATE student_test_locks
          SET is_active = 0,
              released_at = SYSUTCDATETIME(),
              released_by = @releasedBy
          WHERE id = @lockId
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    res.status(201).json({
      message: "Test incheiat ca plagiat.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la inchiderea testului.",
      error: error.message,
    });
  }
}

/*
----------------------------
       Asignare variante
----------------------------
*/
// Stabileste ce varianta primeste fiecare student, manual sau automat.
async function listExamAssignments(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa modifici asignarile acestui examen.",
      });
    }

    const examStatus = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query("SELECT TOP 1 status FROM exams WHERE id = @examId");

    const variantsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT id, variant_name, row_number
        FROM exam_variants
        WHERE exam_id = @examId
        ORDER BY row_number, id
      `);

    const studentsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT u.id, u.full_name, u.email, u.matriculation_number,
               a.variant_id, a.row_number
        FROM users u
        LEFT JOIN student_exam_assignments a
          ON a.student_id = u.id AND a.exam_id = @examId
        WHERE u.role = 'student'
        ORDER BY u.full_name
      `);

    res.json({
      readOnly: examStatus.recordset[0]?.status === "archived",
      variants: variantsResult.recordset,
      students: studentsResult.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la citirea asignarilor.",
      error: error.message,
    });
  }
}

/*
----------------------------
     Salvare asignare manuala
----------------------------
*/
// Salveaza varianta aleasa pentru un student si blocheaza schimbarea dupa trimiterea testului.
async function saveExamAssignment(req, res) {
  try {
    const examId = Number(req.params.examId);
    const { studentId, variantId } = req.body;
    const cleanStudentId = Number(studentId);
    const cleanVariantId = Number(variantId);

    if (!Number.isInteger(examId) || !Number.isInteger(cleanStudentId)) {
      return res.status(400).json({
        message: "Date asignare invalide.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa modifici asignarile acestui examen.",
      });
    }

    const statusCheck = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query("SELECT TOP 1 status FROM exams WHERE id = @examId");

    if (statusCheck.recordset[0]?.status === "archived") {
      return res.status(403).json({
        message: "Examenul este arhivat, asignarile pot fi doar vizualizate.",
      });
    }

    const submittedCheck = await pool
      .request()
      .input("examId", sql.Int, examId)
      .input("studentId", sql.Int, cleanStudentId)
      .query(`
        SELECT TOP 1 id
        FROM results
        WHERE exam_id = @examId AND student_id = @studentId
      `);

    if (submittedCheck.recordset.length > 0) {
      return res.status(409).json({
        message: "Studentul a trimis deja testul, deci varianta nu mai poate fi schimbata.",
      });
    }

    if (!Number.isInteger(cleanVariantId)) {
      await pool
        .request()
        .input("examId", sql.Int, examId)
        .input("studentId", sql.Int, cleanStudentId)
        .query(`
          DELETE FROM student_exam_assignments
          WHERE exam_id = @examId AND student_id = @studentId
        `);

      return res.json({
        message: "Asignare stearsa.",
      });
    }

    const variantCheck = await pool
      .request()
      .input("examId", sql.Int, examId)
      .input("variantId", sql.Int, cleanVariantId)
      .query(`
        SELECT TOP 1 id, row_number
        FROM exam_variants
        WHERE id = @variantId AND exam_id = @examId
      `);

    if (variantCheck.recordset.length === 0) {
      return res.status(404).json({
        message: "Varianta nu apartine acestui examen.",
      });
    }

    const rowNumber = variantCheck.recordset[0].row_number;
    await pool
      .request()
      .input("examId", sql.Int, examId)
      .input("studentId", sql.Int, cleanStudentId)
      .input("variantId", sql.Int, cleanVariantId)
      .input("rowNumber", sql.Int, rowNumber)
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
          VALUES (@studentId, @examId, @variantId, @rowNumber);
      `);

    res.json({
      message: "Asignare salvata.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la salvarea asignarii.",
      error: error.message,
    });
  }
}

/*
----------------------------
      Asignare random
----------------------------
*/
// Imparte automat variantele intre studentii care nu au trimis inca testul.
async function randomizeExamAssignments(req, res) {
  try {
    const examId = Number(req.params.examId);

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa modifici asignarile acestui examen.",
      });
    }

    const statusCheck = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query("SELECT TOP 1 status FROM exams WHERE id = @examId");

    if (statusCheck.recordset[0]?.status === "archived") {
      return res.status(403).json({
        message: "Examenul este arhivat, asignarile pot fi doar vizualizate.",
      });
    }

    const variantsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT id, row_number
        FROM exam_variants
        WHERE exam_id = @examId
        ORDER BY row_number, id
      `);

    if (variantsResult.recordset.length === 0) {
      return res.status(400).json({
        message: "Examenul nu are variante.",
      });
    }

    const studentsResult = await pool
      .request()
      .input("examId", sql.Int, examId)
      .query(`
        SELECT u.id
        FROM users u
        LEFT JOIN results r ON r.student_id = u.id AND r.exam_id = @examId
        WHERE u.role = 'student' AND r.id IS NULL
        ORDER BY NEWID()
      `);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (let index = 0; index < studentsResult.recordset.length; index += 1) {
        const student = studentsResult.recordset[index];
        const variant = variantsResult.recordset[index % variantsResult.recordset.length];
        const request = new sql.Request(transaction);

        await request
          .input("examId", sql.Int, examId)
          .input("studentId", sql.Int, Number(student.id))
          .input("variantId", sql.Int, Number(variant.id))
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
              VALUES (@studentId, @examId, @variantId, @rowNumber);
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    res.json({
      message: "Asignare random salvata.",
      assignedStudents: studentsResult.recordset.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Eroare la asignarea random.",
      error: error.message,
    });
  }
}

/*
----------------------------
          Import RTF examen
----------------------------
*/
// Primeste fisierul RTF, randul variantei si salveaza automat testul in examenul ales.
async function importRtf(req, res) {
  try {
    const examId = Number(req.params.examId);
    const requestedRowNumber = req.body.rowNumber ? Number(req.body.rowNumber) : null;

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "ID examen invalid.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Alege un fisier RTF.",
      });
    }

    if (requestedRowNumber !== null && (!Number.isInteger(requestedRowNumber) || requestedRowNumber < 1)) {
      return res.status(400).json({
        message: "Randul trebuie sa fie un numar pozitiv.",
      });
    }

    const pool = await getPool();

    if (!(await canManageExam(pool, req, examId))) {
      return res.status(403).json({
        message: "Nu ai dreptul sa importi intrebari pentru acest examen.",
      });
    }

    const parsedVariants = parseRtfQuestions(stripRtf(req.file.buffer));
    const extractedImages = await extractRtfQuestionImages(req.file.buffer, examId);
    const uploadedVariantName = String(req.file.originalname || "")
      .replace(/\.[^.]+$/, "")
      .trim();

    if (
      parsedVariants.length === 1
      && parsedVariants[0].variantName === "Varianta 1"
      && uploadedVariantName
    ) {
      parsedVariants[0].variantName = uploadedVariantName;
    }

    if (requestedRowNumber !== null) {
      parsedVariants.forEach((variant, index) => {
        variant.rowNumber = parsedVariants.length === 1
          ? requestedRowNumber
          : requestedRowNumber + index;
      });
    }

    if (!parsedVariants.length) {
      return res.status(400).json({
        message: "Nu am gasit intrebari in fisier. Accept formatul Q1. (1p) + *a. raspuns corect sau formatul VARIANTA/INTREBARE/RASPUNS/CORECT.",
      });
    }

    extractedImages.forEach((image) => {
      parsedVariants.forEach((variant) => {
        const question = variant.questions[image.questionNumber - 1];

        if (question) {
          question.images = question.images || [];
          question.images.push({
            imagePath: image.imagePath,
            imageOriginalName: image.imageOriginalName,
          });
        }
      });
    });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let importedQuestions = 0;
      let importedVariants = 0;

      for (const variant of parsedVariants) {
        const variantRequest = new sql.Request(transaction);
        const existingVariant = await variantRequest
          .input("examId", sql.Int, examId)
          .input("variantName", sql.NVarChar(50), variant.variantName)
          .query(`
            SELECT TOP 1 id
            FROM exam_variants
            WHERE exam_id = @examId AND variant_name = @variantName
          `);

        let variantId;

        if (existingVariant.recordset.length > 0) {
          variantId = Number(existingVariant.recordset[0].id);
          await new sql.Request(transaction)
            .input("variantId", sql.Int, variantId)
            .input("rowNumber", sql.Int, Number(variant.rowNumber) || null)
            .query(`
              UPDATE exam_variants
              SET row_number = @rowNumber
              WHERE id = @variantId
            `);
        } else {
          const createVariantRequest = new sql.Request(transaction);
          const createdVariant = await createVariantRequest
            .input("examId", sql.Int, examId)
            .input("variantName", sql.NVarChar(50), variant.variantName)
            .input("rowNumber", sql.Int, Number(variant.rowNumber) || null)
            .query(`
              INSERT INTO exam_variants (exam_id, variant_name, row_number)
              OUTPUT INSERTED.id
              VALUES (@examId, @variantName, @rowNumber)
            `);

          variantId = Number(createdVariant.recordset[0].id);
          importedVariants += 1;
        }

        for (const question of variant.questions) {
          const questionId = await insertQuestion(transaction, variantId, question);

          if (questionId) {
            importedQuestions += 1;
          }
        }
      }

      await transaction.commit();

      res.status(201).json({
        message: "RTF importat.",
        importedVariants,
        importedQuestions,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      message: "Eroare la importul RTF.",
      error: error.message,
    });
  }
}

module.exports = {
  createExam,
  createQuestion,
  createSubject,
  createVariant,
  deleteVariant,
  deleteSubject,
  deleteExam,
  importRtf,
  getResultDetails,
  listExamAssignments,
  listActiveTestLocks,
  listExams,
  listResults,
  listSubjects,
  listVariants,
  markTestLockPlagiarism,
  randomizeExamAssignments,
  releaseTestLock,
  saveExamAssignment,
  updateSubjectAssignment,
  updateSubjectInfo,
  updateExamStatus,
};
