const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const AdmZip = require("adm-zip");

const app = express();
const PORT = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

const getFilePaths = (filename) => {
  const encPath = path.join(uploadDir, filename);
  return { encPath, metaPath: `${encPath}.json` };
};

const cleanupFile = (filename) => {
  const { encPath, metaPath } = getFilePaths(filename);
  if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
};

const readMeta = (filename) => {
  const { metaPath } = getFilePaths(filename);
  return JSON.parse(fs.readFileSync(metaPath));
};

const writeMeta = (filename, meta) => {
  const { metaPath } = getFilePaths(filename);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
};

const isExpired = (timestamp) => Number.isFinite(timestamp) && Date.now() > timestamp;

const purgeExpiredShareLinks = (meta) => {
  const nextLinks = (meta.shareLinks || []).filter((link) => !isExpired(link.expiresAt));
  return { ...meta, shareLinks: nextLinks };
};

const ensureActiveFile = (filename) => {
  const { encPath, metaPath } = getFilePaths(filename);
  if (!fs.existsSync(encPath) || !fs.existsSync(metaPath)) return null;

  const meta = purgeExpiredShareLinks(readMeta(filename));
  if (isExpired(meta.expiresAt)) {
    cleanupFile(filename);
    return null;
  }

  writeMeta(filename, meta);
  return meta;
};

const toPublicFile = (filename, meta) => ({
  name: filename,
  originalName: meta.originalName,
  burn: meta.burnOnRead,
  expiresAt: meta.expiresAt,
});

app.post("/upload", upload.array("files"), (req, res) => {
  try {
    const { password, burnOnRead } = req.body;
    if (!password || !req.files) return res.status(400).send("Missing data");

    let finalBuffer;
    let originalName;

    if (req.files.length > 1) {
      const zip = new AdmZip();
      req.files.forEach((file) => zip.addLocalFile(file.path));
      finalBuffer = zip.toBuffer();
      originalName = `SecureBundle-${Date.now()}.zip`;
    } else {
      finalBuffer = fs.readFileSync(req.files[0].path);
      originalName = req.files[0].originalname;
    }

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = deriveKey(password, salt);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(finalBuffer), cipher.final()]);

    const fileId = `${Date.now()}.enc`;
    const { encPath } = getFilePaths(fileId);

    fs.writeFileSync(encPath, encrypted);
    writeMeta(fileId, {
      originalName,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      burnOnRead: burnOnRead === "true",
      expiresAt: Date.now() + DAY_MS,
      shareLinks: [],
    });

    req.files.forEach((file) => fs.unlinkSync(file.path));

    res.json({ message: "Success", fileId });
  } catch (err) {
    res.status(500).send("Encryption Failed");
  }
});

app.post("/download/:filename", (req, res) => {
  try {
    const { password } = req.body;
    const filename = req.params.filename;
    const { encPath } = getFilePaths(filename);
    const meta = ensureActiveFile(filename);

    if (!meta || !fs.existsSync(encPath)) {
      return res.status(404).send("File not found");
    }

    const key = deriveKey(password, Buffer.from(meta.salt, "hex"));
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(meta.iv, "hex"));
    const encryptedData = fs.readFileSync(encPath);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    res.setHeader("Content-Disposition", `attachment; filename="${meta.originalName}"`);
    res.send(decrypted);

    if (meta.burnOnRead) {
      setTimeout(() => cleanupFile(filename), 5000);
    }
  } catch (err) {
    res.status(401).send("Invalid Key");
  }
});

app.post("/share/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const { expiresInMinutes } = req.body;
    const meta = ensureActiveFile(filename);

    if (!meta) {
      return res.status(404).send("File not found");
    }

    const minutes = Number(expiresInMinutes);
    if (![15, 60, 360, 1440].includes(minutes)) {
      return res.status(400).send("Unsupported expiry window");
    }

    const token = crypto.randomBytes(18).toString("hex");
    const shareExpiresAt = Math.min(Date.now() + minutes * 60 * 1000, meta.expiresAt);
    const nextMeta = {
      ...meta,
      shareLinks: [...(meta.shareLinks || []), { token, expiresAt: shareExpiresAt }],
    };

    writeMeta(filename, nextMeta);

    res.json({
      token,
      shareExpiresAt,
      file: toPublicFile(filename, nextMeta),
    });
  } catch (err) {
    res.status(500).send("Share link generation failed");
  }
});

app.get("/share/:token", (req, res) => {
  try {
    const token = req.params.token;
    const encryptedFiles = fs.readdirSync(uploadDir).filter((file) => file.endsWith(".enc"));

    for (const filename of encryptedFiles) {
      const meta = ensureActiveFile(filename);
      if (!meta) continue;

      const shareLink = (meta.shareLinks || []).find((entry) => entry.token === token);
      if (!shareLink) continue;

      if (isExpired(shareLink.expiresAt)) {
        const nextMeta = purgeExpiredShareLinks(meta);
        writeMeta(filename, nextMeta);
        return res.status(410).send("Share link expired");
      }

      return res.json({
        file: toPublicFile(filename, meta),
        shareExpiresAt: shareLink.expiresAt,
      });
    }

    res.status(404).send("Share link not found");
  } catch (err) {
    res.status(500).send("Could not resolve share link");
  }
});

app.get("/files", (req, res) => {
  try {
    const files = fs
      .readdirSync(uploadDir)
      .filter((file) => file.endsWith(".enc"))
      .map((filename) => {
        const meta = ensureActiveFile(filename);
        return meta ? toPublicFile(filename, meta) : null;
      })
      .filter(Boolean);

    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
