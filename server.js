const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = __dirname;
const DATA_DIR = path.join(PROJECT_ROOT, "backend-data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const LAWYERS_FILE = path.join(DATA_DIR, "lawyers.json");
const COURSE_OVERRIDES_FILE = path.join(DATA_DIR, "course-overrides.json");
const SITE_SETTINGS_FILE = path.join(DATA_DIR, "site-settings.json");
const LAWYER_SEED_DIRECTORY = require("./default-lawyers.js");
const LEGACY_LAWYER_SEED_IDS = new Set([
    "lawyer-seed-1",
    "lawyer-seed-2",
    "lawyer-seed-3",
    "lawyer-seed-4"
]);
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@yurforce.uz";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin12345!";
const DEFAULT_ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";

const PLAN_CATALOG = {
    free: {
        id: "free",
        label: "Free",
        monthlyPrice: 0
    },
    standard: {
        id: "standard",
        label: "Standart",
        monthlyPrice: 129000
    },
    premium: {
        id: "premium",
        label: "Premium",
        monthlyPrice: 249000
    }
};

const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp"
};

function buildDefaultLawyers(nowIso = new Date().toISOString()) {
    return LAWYER_SEED_DIRECTORY.map((lawyer) => ({
        ownerUserId: null,
        ownerEmail: "",
        telegram: "",
        ...lawyer,
        formats: Array.isArray(lawyer.formats) ? [...lawyer.formats] : [],
        createdAt: lawyer.createdAt || nowIso,
        updatedAt: lawyer.updatedAt || lawyer.createdAt || nowIso
    }));
}

function buildDefaultSiteSettings() {
    return {
        branding: {
            wordmarkMain: "YURFORCE",
            wordmarkAccent: ".AI",
            subtitle: "Apple Experience"
        },
        theme: {
            brand: "#3b82f6",
            brandSoft: "rgba(59, 130, 246, 0.22)",
            bgMain: "#050a18",
            textMain: "#eaf1ff",
            panelBg: "#0f172a",
            glassBg: "#182235"
        },
        home: {
            badge: "YurForce.AI",
            titleMain: "Huquqni",
            titleAccent: "amaliy o'rganing",
            description: "O'zingizga mos kursni tanlang, darsni davom ettiring va natijangizni shaxsiy kabinetingizdan kuzating.",
            primaryCta: "Kurslar",
            secondaryCta: "Dashboard",
            menuEyebrow: "Asosiy menyu",
            menuTitle: "Kerakli bo'limni tanlang"
        },
        about: {
            badge: "Biz haqimizda",
            titleMain: "YurForce.AI",
            titleAccent: "haqida",
            description: "Yuridik o'qishni qulayroq qilish uchun kurslar, testlar, shaxsiy kabinet va planner bir platformada jamlangan.",
            videoUrl: "https://www.youtube.com/embed/mFJCaYWWrBA?si=aK8GdjSg_SOiAq99"
        },
        pricing: {
            title: "Tariflar va Bonuslar 💳",
            description: "Endi tariflar kurs slotlari asosida ishlaydi: Free foydalanuvchi 1 ta, Standart foydalanuvchi 3 ta kursni tanlab to'liq o'qiydi. Premium tarif esa barcha kurslar, bonuslar va maxsus imkoniyatlarni bir vaqtning o'zida ochadi."
        },
        lawyer: {
            badge: "Advokat kerakmi?",
            titleMain: "Mos",
            titleAccent: "advokatni toping",
            description: "Foydalanuvchilar bu bo'limda faol advokatlarni ko'radi, murojaat soni va reyting bo'yicha saralaydi. Eng ko'p murojaatga ega, tajribali advokatlar yuqorida tavsiya qilinadi."
        }
    };
}

function normalizeSiteSettings(siteSettings = {}) {
    const defaults = buildDefaultSiteSettings();

    return {
        branding: {
            ...defaults.branding,
            ...(siteSettings.branding || {})
        },
        theme: {
            ...defaults.theme,
            ...(siteSettings.theme || {})
        },
        home: {
            ...defaults.home,
            ...(siteSettings.home || {})
        },
        about: {
            ...defaults.about,
            ...(siteSettings.about || {})
        },
        pricing: {
            ...defaults.pricing,
            ...(siteSettings.pricing || {})
        },
        lawyer: {
            ...defaults.lawyer,
            ...(siteSettings.lawyer || {})
        }
    };
}

async function ensureStorage() {
    await fsp.mkdir(DATA_DIR, { recursive: true });

    for (const filePath of [USERS_FILE, LAWYERS_FILE]) {
        try {
            await fsp.access(filePath, fs.constants.F_OK);
        } catch (error) {
            await fsp.writeFile(filePath, "[]\n", "utf8");
        }
    }

    const raw = await fsp.readFile(USERS_FILE, "utf8");
    const users = JSON.parse(raw || "[]");
    const hasAdmin = users.some((user) => user.role === "admin" || normalizeEmail(user.email) === normalizeEmail(DEFAULT_ADMIN_EMAIL));

    if (!hasAdmin) {
        const nowIso = new Date().toISOString();
        const passwordMeta = hashPassword(DEFAULT_ADMIN_PASSWORD);

        users.push({
            id: crypto.randomUUID(),
            role: "admin",
            fullName: DEFAULT_ADMIN_NAME,
            phone: "+998000000000",
            email: normalizeEmail(DEFAULT_ADMIN_EMAIL),
            passwordHash: passwordMeta.hash,
            passwordSalt: passwordMeta.salt,
            createdAt: nowIso,
            updatedAt: nowIso,
            lastLoginAt: null,
            subscription: {
                plan: "premium",
                startedAt: nowIso,
                updatedAt: nowIso
            }
        });

        await fsp.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
    }

    const lawyersRaw = await fsp.readFile(LAWYERS_FILE, "utf8");
    const lawyers = JSON.parse(lawyersRaw || "[]");
    if (!Array.isArray(lawyers) || !lawyers.length) {
        await fsp.writeFile(LAWYERS_FILE, `${JSON.stringify(buildDefaultLawyers(), null, 2)}\n`, "utf8");
    }

    try {
        await fsp.access(COURSE_OVERRIDES_FILE, fs.constants.F_OK);
    } catch (error) {
        await fsp.writeFile(COURSE_OVERRIDES_FILE, `${JSON.stringify({ upserts: [], deletedIds: [] }, null, 2)}\n`, "utf8");
    }

    try {
        await fsp.access(SITE_SETTINGS_FILE, fs.constants.F_OK);
    } catch (error) {
        await fsp.writeFile(SITE_SETTINGS_FILE, `${JSON.stringify(buildDefaultSiteSettings(), null, 2)}\n`, "utf8");
    }
}

async function readUsers() {
    await ensureStorage();
    const raw = await fsp.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
}

async function writeUsers(users) {
    await ensureStorage();
    await fsp.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

async function readLawyers() {
    await ensureStorage();
    const raw = await fsp.readFile(LAWYERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "[]");
    const merged = new Map();

    buildDefaultLawyers().forEach((lawyer) => {
        const normalized = normalizeLawyerRecord(lawyer);
        merged.set(normalized.id, normalized);
    });

    (Array.isArray(parsed) ? parsed : []).forEach((lawyer) => {
        if (LEGACY_LAWYER_SEED_IDS.has(String(lawyer?.id || ""))) {
            return;
        }

        const normalized = normalizeLawyerRecord(lawyer);
        const existing = merged.get(normalized.id);

        merged.set(normalized.id, existing
            ? {
                ...existing,
                ...normalized,
                formats: [...normalized.formats]
            }
            : normalized);
    });

    return [...merged.values()];
}

async function writeLawyers(lawyers) {
    await ensureStorage();
    await fsp.writeFile(LAWYERS_FILE, `${JSON.stringify(lawyers, null, 2)}\n`, "utf8");
}

async function readCourseOverrides() {
    await ensureStorage();
    const raw = await fsp.readFile(COURSE_OVERRIDES_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
        upserts: Array.isArray(parsed.upserts) ? parsed.upserts : [],
        deletedIds: Array.from(new Set((Array.isArray(parsed.deletedIds) ? parsed.deletedIds : []).map((item) => String(item || "").trim()).filter(Boolean)))
    };
}

async function writeCourseOverrides(courseOverrides) {
    await ensureStorage();
    const payload = {
        upserts: Array.isArray(courseOverrides?.upserts) ? courseOverrides.upserts : [],
        deletedIds: Array.from(new Set((Array.isArray(courseOverrides?.deletedIds) ? courseOverrides.deletedIds : []).map((item) => String(item || "").trim()).filter(Boolean)))
    };

    await fsp.writeFile(COURSE_OVERRIDES_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readSiteSettings() {
    await ensureStorage();
    const raw = await fsp.readFile(SITE_SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return normalizeSiteSettings(parsed);
}

async function writeSiteSettings(siteSettings) {
    await ensureStorage();
    const normalized = normalizeSiteSettings(siteSettings);
    await fsp.writeFile(SITE_SETTINGS_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function slugifyCourseId(value = "") {
    const slug = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || `course-${Date.now()}`;
}

function normalizeCourseModule(module = {}) {
    const rawBullets = Array.isArray(module.bullets) ? module.bullets : [];
    const rawFlashcards = Array.isArray(module.flashcards) ? module.flashcards : [];

    return {
        title: String(module.title || "").trim(),
        intro: String(module.intro || "").trim(),
        bullets: rawBullets.map((item) => String(item || "").trim()).filter(Boolean),
        quote: String(module.quote || "").trim(),
        flashcards: rawFlashcards.map((item) => ({
            q: String(item?.q || "").trim(),
            a: String(item?.a || "").trim()
        })).filter((item) => item.q && item.a)
    };
}

function normalizeCourseQuizItem(item = {}) {
    const options = Array.isArray(item.options) ? item.options.map((option) => String(option || "").trim()).filter(Boolean) : [];
    const answer = Number(item.answer);

    return {
        question: String(item.question || "").trim(),
        options,
        answer: Number.isFinite(answer) ? answer : 0
    };
}

function normalizeCoursePayload(payload = {}, existingCourse = null) {
    const title = String(payload.title || existingCourse?.title || "").trim();
    const tier = String(payload.tier || existingCourse?.tier || "free").trim().toLowerCase();
    const modules = (Array.isArray(payload.modules) ? payload.modules : existingCourse?.modules || []).map((module) => normalizeCourseModule(module));
    const quiz = (Array.isArray(payload.quiz) ? payload.quiz : existingCourse?.quiz || []).map((item) => normalizeCourseQuizItem(item));
    const courseId = slugifyCourseId(payload.id || existingCourse?.id || title);

    return {
        id: courseId,
        role: String(payload.role || existingCourse?.role || "Talaba").trim(),
        level: String(payload.level || existingCourse?.level || "Boshlang'ich").trim(),
        premium: tier === "premium",
        tier: ["free", "standard", "premium"].includes(tier) ? tier : "free",
        duration: Math.max(1, Number(payload.duration || existingCourse?.duration || 30) || 30),
        popularity: Math.max(1, Math.min(100, Number(payload.popularity || existingCourse?.popularity || 70) || 70)),
        previewModules: Math.max(1, Math.min(modules.length || 1, Number(payload.previewModules || existingCourse?.previewModules || 1) || 1)),
        title,
        description: String(payload.description || existingCourse?.description || "").trim(),
        tags: Array.from(new Set((Array.isArray(payload.tags) ? payload.tags : existingCourse?.tags || []).map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 12),
        modules,
        quiz
    };
}

function validateRegistrationPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "Yuborilgan ma'lumot noto'g'ri.";
    }
    if (!payload.fullName || String(payload.fullName).trim().length < 3) {
        return "F.I.O kamida 3 belgidan iborat bo'lishi kerak.";
    }
    if (!payload.phone || String(payload.phone).trim().length < 7) {
        return "Telefon raqamni to'g'ri kiriting.";
    }
    if (!payload.email || !normalizeEmail(payload.email).includes("@")) {
        return "Email manzilni to'g'ri kiriting.";
    }
    if (!payload.password || String(payload.password).trim().length < 6) {
        return "Parol kamida 6 belgidan iborat bo'lishi kerak.";
    }

    return "";
}

function validateLoginPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "Yuborilgan ma'lumot noto'g'ri.";
    }
    if (!payload.email || !normalizeEmail(payload.email).includes("@")) {
        return "Email manzilni to'g'ri kiriting.";
    }
    if (!payload.password || String(payload.password).trim().length < 6) {
        return "Parol kamida 6 belgidan iborat bo'lishi kerak.";
    }

    return "";
}

function validateAdminManagedUserPayload(payload, options = {}) {
    const requirePassword = options.requirePassword !== false;
    if (!payload || typeof payload !== "object") {
        return "Yuborilgan ma'lumot noto'g'ri.";
    }
    if (!payload.fullName || String(payload.fullName).trim().length < 3) {
        return "F.I.O kamida 3 belgidan iborat bo'lishi kerak.";
    }
    if (!payload.phone || String(payload.phone).trim().length < 7) {
        return "Telefon raqamni to'g'ri kiriting.";
    }
    if (!payload.email || !normalizeEmail(payload.email).includes("@")) {
        return "Email manzilni to'g'ri kiriting.";
    }
    if (requirePassword && (!payload.password || String(payload.password).trim().length < 6)) {
        return "Parol kamida 6 belgidan iborat bo'lishi kerak.";
    }
    if (typeof payload.password === "string" && payload.password.trim() && payload.password.trim().length < 6) {
        return "Parol kamida 6 belgidan iborat bo'lishi kerak.";
    }
    if (payload.role && !["user", "admin"].includes(String(payload.role).trim().toLowerCase())) {
        return "Rol noto'g'ri.";
    }
    if (payload.subscription?.plan && !PLAN_CATALOG[String(payload.subscription.plan).trim().toLowerCase()]) {
        return "Tarif topilmadi.";
    }

    return "";
}

function validateLawyerPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "Yuborilgan ma'lumot noto'g'ri.";
    }
    if (!payload.fullName || String(payload.fullName).trim().length < 3) {
        return "Advokat F.I.O kamida 3 belgidan iborat bo'lishi kerak.";
    }
    if (!payload.specialty || String(payload.specialty).trim().length < 3) {
        return "Yo'nalishni aniq kiriting.";
    }
    if (!payload.city || String(payload.city).trim().length < 2) {
        return "Shahar nomini kiriting.";
    }
    if (!payload.phone || String(payload.phone).trim().length < 7) {
        return "Telefon raqamni to'g'ri kiriting.";
    }
    if (!payload.bio || String(payload.bio).trim().length < 20) {
        return "Qisqa tavsif kamida 20 belgidan iborat bo'lishi kerak.";
    }

    return "";
}

function validateCoursePayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "Kurs ma'lumoti noto'g'ri.";
    }

    const course = normalizeCoursePayload(payload);
    if (!course.title || course.title.length < 3) {
        return "Kurs nomi kamida 3 belgidan iborat bo'lishi kerak.";
    }
    if (!course.description || course.description.length < 10) {
        return "Kurs tavsifi kamida 10 belgidan iborat bo'lishi kerak.";
    }
    if (!["free", "standard", "premium"].includes(course.tier)) {
        return "Kurs tarifi noto'g'ri.";
    }
    if (!Array.isArray(course.modules) || !course.modules.length) {
        return "Kamida 1 ta modul bo'lishi kerak.";
    }
    if (!course.modules.every((module) => module.title && module.intro && module.bullets.length)) {
        return "Har bir modulda nom, intro va kamida 1 ta bullet bo'lishi kerak.";
    }
    if (!Array.isArray(course.quiz) || !course.quiz.length) {
        return "Kamida 1 ta quiz savoli bo'lishi kerak.";
    }
    if (!course.quiz.every((item) => item.question && item.options.length >= 2 && item.answer >= 0 && item.answer < item.options.length)) {
        return "Quiz savollari va javob variantlarini to'g'ri kiriting.";
    }

    return "";
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}

function verifyPassword(password, user) {
    const attempted = crypto.scryptSync(password, user.passwordSalt, 64);
    const stored = Buffer.from(user.passwordHash, "hex");
    if (attempted.length !== stored.length) {
        return false;
    }

    return crypto.timingSafeEqual(attempted, stored);
}

function toPublicUser(user) {
    return {
        id: user.id,
        role: user.role || "user",
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt || null,
        source: "server",
        subscription: user.subscription
    };
}

function normalizeTelegramHandle(value = "") {
    return String(value || "")
        .trim()
        .replace(/^https?:\/\/t\.me\//i, "")
        .replace(/^@/, "");
}

function normalizeLawyerRecord(lawyer = {}) {
    const nowIso = new Date().toISOString();
    const rawFormats = Array.isArray(lawyer.formats)
        ? lawyer.formats
        : String(lawyer.formats || "").split(",");
    const formats = Array.from(new Set(rawFormats.map((item) => String(item).trim()).filter(Boolean))).slice(0, 2);

    return {
        id: lawyer.id || crypto.randomUUID(),
        ownerUserId: lawyer.ownerUserId || null,
        ownerEmail: String(lawyer.ownerEmail || "").trim().toLowerCase(),
        fullName: String(lawyer.fullName || "").trim(),
        specialty: String(lawyer.specialty || "Umumiy advokatlik").trim(),
        city: String(lawyer.city || "Toshkent").trim(),
        experienceYears: Math.max(0, Math.min(60, Number(lawyer.experienceYears) || 0)),
        phone: String(lawyer.phone || "").trim(),
        telegram: normalizeTelegramHandle(lawyer.telegram || ""),
        consultationFee: String(lawyer.consultationFee || "Kelishiladi").trim(),
        bio: String(lawyer.bio || "").trim(),
        formats: formats.length ? formats : ["Online"],
        leadCount: Math.max(0, Number(lawyer.leadCount) || 0),
        ratingBase: Math.max(3.8, Math.min(4.9, Number(lawyer.ratingBase) || 4.1)),
        verified: Boolean(lawyer.verified),
        createdAt: lawyer.createdAt || nowIso,
        updatedAt: lawyer.updatedAt || lawyer.createdAt || nowIso
    };
}

function toPublicLawyer(lawyer) {
    return {
        id: lawyer.id,
        ownerUserId: lawyer.ownerUserId || null,
        fullName: lawyer.fullName,
        specialty: lawyer.specialty,
        city: lawyer.city,
        experienceYears: lawyer.experienceYears,
        phone: lawyer.phone,
        telegram: lawyer.telegram,
        consultationFee: lawyer.consultationFee,
        bio: lawyer.bio,
        formats: lawyer.formats,
        leadCount: lawyer.leadCount || 0,
        ratingBase: lawyer.ratingBase || 4.1,
        verified: Boolean(lawyer.verified),
        createdAt: lawyer.createdAt,
        updatedAt: lawyer.updatedAt
    };
}

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-Id");
}

function sendJson(res, statusCode, payload) {
    setCorsHeaders(res);
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
}

async function parseBody(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
            const error = new Error("Payload juda katta.");
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return {};
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
        error.statusCode = 400;
        error.message = "JSON format noto'g'ri.";
        throw error;
    }
}

function isPathInside(parentPath, childPath) {
    const relative = path.relative(parentPath, childPath);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function serveStaticFile(req, res, urlPathname) {
    const safePath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
    const filePath = path.normalize(path.join(PROJECT_ROOT, safePath));

    if (filePath.startsWith(DATA_DIR)) {
        sendJson(res, 403, { error: "Bu faylga kirish taqiqlangan." });
        return;
    }

    if (filePath !== PROJECT_ROOT && !isPathInside(PROJECT_ROOT, filePath)) {
        sendJson(res, 403, { error: "Noto'g'ri yo'l." });
        return;
    }

    try {
        const stat = await fsp.stat(filePath);
        if (stat.isDirectory()) {
            sendJson(res, 404, { error: "Fayl topilmadi." });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const file = await fsp.readFile(filePath);
        setCorsHeaders(res);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(file);
    } catch (error) {
        sendJson(res, 404, { error: "Fayl topilmadi." });
    }
}

async function handleRegister(req, res) {
    const payload = await parseBody(req);
    const validationMessage = validateRegistrationPayload(payload);
    if (validationMessage) {
        sendJson(res, 400, { error: validationMessage });
        return;
    }

    const users = await readUsers();
    const email = normalizeEmail(payload.email);
    const existingUser = users.find((user) => normalizeEmail(user.email) === email);
    if (existingUser) {
        sendJson(res, 409, { error: "Bu email bilan foydalanuvchi allaqachon mavjud." });
        return;
    }

    const passwordMeta = hashPassword(String(payload.password).trim());
    const nowIso = new Date().toISOString();
    const user = {
        id: crypto.randomUUID(),
        role: "user",
        fullName: String(payload.fullName).trim(),
        phone: String(payload.phone).trim(),
        email,
        passwordHash: passwordMeta.hash,
        passwordSalt: passwordMeta.salt,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: null,
        subscription: {
            plan: "free",
            startedAt: nowIso,
            updatedAt: nowIso
        }
    };

    users.push(user);
    await writeUsers(users);

    sendJson(res, 201, {
        message: "Foydalanuvchi muvaffaqiyatli yaratildi.",
        user: toPublicUser(user)
    });
}

async function handleLogin(req, res) {
    const payload = await parseBody(req);
    const validationMessage = validateLoginPayload(payload);
    if (validationMessage) {
        sendJson(res, 400, { error: validationMessage });
        return;
    }

    const users = await readUsers();
    const email = normalizeEmail(payload.email);
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (!user || !verifyPassword(String(payload.password).trim(), user)) {
        sendJson(res, 401, { error: "Email yoki parol noto'g'ri." });
        return;
    }

    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    await writeUsers(users);

    sendJson(res, 200, {
        message: "Tizimga kirish muvaffaqiyatli.",
        user: toPublicUser(user)
    });
}

async function handleGetUser(res, userId) {
    const users = await readUsers();
    const user = users.find((item) => item.id === userId);
    if (!user) {
        sendJson(res, 404, { error: "Foydalanuvchi topilmadi." });
        return;
    }

    sendJson(res, 200, { user: toPublicUser(user) });
}

async function handlePatchUser(req, res, userId) {
    const payload = await parseBody(req);
    const users = await readUsers();
    const user = users.find((item) => item.id === userId);

    if (!user) {
        sendJson(res, 404, { error: "Foydalanuvchi topilmadi." });
        return;
    }

    if (typeof payload.fullName === "string") {
        const fullName = payload.fullName.trim();
        if (fullName.length < 3) {
            sendJson(res, 400, { error: "F.I.O kamida 3 belgidan iborat bo'lishi kerak." });
            return;
        }
        user.fullName = fullName;
    }

    if (typeof payload.phone === "string") {
        const phone = payload.phone.trim();
        if (phone.length < 7) {
            sendJson(res, 400, { error: "Telefon raqamni to'g'ri kiriting." });
            return;
        }
        user.phone = phone;
    }

    if (payload.subscription && typeof payload.subscription === "object" && payload.subscription.plan) {
        const nextPlan = String(payload.subscription.plan).trim().toLowerCase();
        if (!PLAN_CATALOG[nextPlan]) {
            sendJson(res, 400, { error: "Tarif topilmadi." });
            return;
        }

        user.subscription = {
            ...(user.subscription || {}),
            plan: nextPlan,
            updatedAt: new Date().toISOString(),
            startedAt: user.subscription?.startedAt || new Date().toISOString()
        };
    }

    user.updatedAt = new Date().toISOString();
    await writeUsers(users);

    sendJson(res, 200, {
        message: "Foydalanuvchi ma'lumoti yangilandi.",
        user: toPublicUser(user)
    });
}

function getRequestActorId(req) {
    return String(req.headers["x-user-id"] || "").trim();
}

async function requireAdminAccess(req, res) {
    const users = await readUsers();
    const actorId = getRequestActorId(req);
    const actor = users.find((item) => item.id === actorId);

    if (!actor || actor.role !== "admin") {
        sendJson(res, 403, { error: "Admin ruxsati talab qilinadi." });
        return null;
    }

    return { users, actor };
}

async function handleAdminOverview(req, res) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;
    const { users } = auth;

    const planCounts = users.reduce((acc, user) => {
        const plan = user.subscription?.plan || "free";
        acc[plan] = (acc[plan] || 0) + 1;
        return acc;
    }, {});

    const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;

    sendJson(res, 200, {
        stats: {
            totalUsers: users.length,
            adminUsers: users.filter((user) => user.role === "admin").length,
            premiumUsers: users.filter((user) => user.subscription?.plan === "premium").length,
            newUsers7d: users.filter((user) => new Date(user.createdAt).getTime() >= last7Days).length,
            planCounts
        },
        users: users.map((user) => toPublicUser(user))
    });
}

async function handleAdminCreateUser(req, res) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const payload = await parseBody(req);
    const validationMessage = validateAdminManagedUserPayload(payload, { requirePassword: true });
    if (validationMessage) {
        sendJson(res, 400, { error: validationMessage });
        return;
    }

    const users = auth.users;
    const email = normalizeEmail(payload.email);
    if (users.some((user) => normalizeEmail(user.email) === email)) {
        sendJson(res, 409, { error: "Bu email bilan foydalanuvchi allaqachon mavjud." });
        return;
    }

    const nowIso = new Date().toISOString();
    const passwordMeta = hashPassword(String(payload.password).trim());
    const role = String(payload.role || "user").trim().toLowerCase();
    const plan = String(payload.subscription?.plan || "free").trim().toLowerCase();
    const user = {
        id: crypto.randomUUID(),
        role: role === "admin" ? "admin" : "user",
        fullName: String(payload.fullName).trim(),
        phone: String(payload.phone).trim(),
        email,
        passwordHash: passwordMeta.hash,
        passwordSalt: passwordMeta.salt,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: null,
        subscription: {
            plan: PLAN_CATALOG[plan] ? plan : "free",
            startedAt: nowIso,
            updatedAt: nowIso
        }
    };

    users.push(user);
    await writeUsers(users);

    sendJson(res, 201, {
        message: "Foydalanuvchi admin panel orqali yaratildi.",
        user: toPublicUser(user)
    });
}

async function handleAdminPatchUser(req, res, userId) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const payload = await parseBody(req);
    const users = auth.users;
    const actor = auth.actor;
    const user = users.find((item) => item.id === userId);
    if (!user) {
        sendJson(res, 404, { error: "Foydalanuvchi topilmadi." });
        return;
    }

    const nextRole = payload.role ? String(payload.role).trim().toLowerCase() : user.role;
    const adminCount = users.filter((item) => item.role === "admin").length;

    if (user.id === actor.id && nextRole !== "admin") {
        sendJson(res, 400, { error: "O'zingizni adminlikdan tushira olmaysiz." });
        return;
    }
    if (user.role === "admin" && nextRole !== "admin" && adminCount <= 1) {
        sendJson(res, 400, { error: "Oxirgi admin rolini o'zgartirib bo'lmaydi." });
        return;
    }

    if (typeof payload.fullName === "string") {
        const fullName = payload.fullName.trim();
        if (fullName.length < 3) {
            sendJson(res, 400, { error: "F.I.O kamida 3 belgidan iborat bo'lishi kerak." });
            return;
        }
        user.fullName = fullName;
    }

    if (typeof payload.phone === "string") {
        const phone = payload.phone.trim();
        if (phone.length < 7) {
            sendJson(res, 400, { error: "Telefon raqamni to'g'ri kiriting." });
            return;
        }
        user.phone = phone;
    }

    if (typeof payload.email === "string") {
        const email = normalizeEmail(payload.email);
        if (!email.includes("@")) {
            sendJson(res, 400, { error: "Email manzilni to'g'ri kiriting." });
            return;
        }
        if (users.some((item) => item.id !== user.id && normalizeEmail(item.email) === email)) {
            sendJson(res, 409, { error: "Bu email bilan boshqa foydalanuvchi mavjud." });
            return;
        }
        user.email = email;
    }

    if (typeof payload.role === "string") {
        if (!["user", "admin"].includes(nextRole)) {
            sendJson(res, 400, { error: "Rol noto'g'ri." });
            return;
        }
        user.role = nextRole;
    }

    if (payload.subscription && typeof payload.subscription === "object" && payload.subscription.plan) {
        const nextPlan = String(payload.subscription.plan).trim().toLowerCase();
        if (!PLAN_CATALOG[nextPlan]) {
            sendJson(res, 400, { error: "Tarif topilmadi." });
            return;
        }

        user.subscription = {
            ...(user.subscription || {}),
            plan: nextPlan,
            updatedAt: new Date().toISOString(),
            startedAt: user.subscription?.startedAt || new Date().toISOString()
        };
    }

    if (typeof payload.password === "string" && payload.password.trim()) {
        if (payload.password.trim().length < 6) {
            sendJson(res, 400, { error: "Parol kamida 6 belgidan iborat bo'lishi kerak." });
            return;
        }
        const passwordMeta = hashPassword(payload.password.trim());
        user.passwordHash = passwordMeta.hash;
        user.passwordSalt = passwordMeta.salt;
    }

    user.updatedAt = new Date().toISOString();
    await writeUsers(users);

    sendJson(res, 200, {
        message: "Foydalanuvchi admin panel orqali yangilandi.",
        user: toPublicUser(user)
    });
}

async function handleAdminDeleteUser(req, res, userId) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const users = auth.users;
    const actor = auth.actor;
    const targetIndex = users.findIndex((item) => item.id === userId);
    if (targetIndex === -1) {
        sendJson(res, 404, { error: "Foydalanuvchi topilmadi." });
        return;
    }

    const targetUser = users[targetIndex];
    const adminCount = users.filter((item) => item.role === "admin").length;

    if (targetUser.id === actor.id) {
        sendJson(res, 400, { error: "O'zingizni o'chira olmaysiz." });
        return;
    }
    if (targetUser.role === "admin" && adminCount <= 1) {
        sendJson(res, 400, { error: "Oxirgi admin foydalanuvchini o'chirib bo'lmaydi." });
        return;
    }

    users.splice(targetIndex, 1);
    await writeUsers(users);

    const lawyers = await readLawyers();
    const filteredLawyers = lawyers.filter((lawyer) => lawyer.ownerUserId !== targetUser.id && normalizeEmail(lawyer.ownerEmail) !== normalizeEmail(targetUser.email));
    if (filteredLawyers.length !== lawyers.length) {
        await writeLawyers(filteredLawyers);
    }

    sendJson(res, 200, {
        message: "Foydalanuvchi o'chirildi."
    });
}

async function handleGetCourseOverrides(res) {
    const courseOverrides = await readCourseOverrides();
    sendJson(res, 200, courseOverrides);
}

async function handleGetSiteSettings(res) {
    const siteSettings = await readSiteSettings();
    sendJson(res, 200, {
        siteSettings
    });
}

async function handleAdminPatchSiteSettings(req, res) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const payload = await parseBody(req);
    const current = await readSiteSettings();
    const next = normalizeSiteSettings({
        ...current,
        ...(payload.siteSettings || payload),
        branding: {
            ...current.branding,
            ...((payload.siteSettings || payload).branding || {})
        },
        theme: {
            ...current.theme,
            ...((payload.siteSettings || payload).theme || {})
        },
        home: {
            ...current.home,
            ...((payload.siteSettings || payload).home || {})
        },
        about: {
            ...current.about,
            ...((payload.siteSettings || payload).about || {})
        },
        pricing: {
            ...current.pricing,
            ...((payload.siteSettings || payload).pricing || {})
        },
        lawyer: {
            ...current.lawyer,
            ...((payload.siteSettings || payload).lawyer || {})
        }
    });

    await writeSiteSettings(next);

    sendJson(res, 200, {
        message: "Site sozlamalari yangilandi.",
        siteSettings: next
    });
}

async function handleAdminUpsertCourse(req, res) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const payload = await parseBody(req);
    const validationMessage = validateCoursePayload(payload);
    if (validationMessage) {
        sendJson(res, 400, { error: validationMessage });
        return;
    }

    const courseOverrides = await readCourseOverrides();
    const prepared = normalizeCoursePayload(payload);
    const existingIndex = courseOverrides.upserts.findIndex((course) => String(course?.id || "") === prepared.id);

    if (existingIndex >= 0) {
        courseOverrides.upserts[existingIndex] = prepared;
    } else {
        courseOverrides.upserts.unshift(prepared);
    }

    courseOverrides.deletedIds = courseOverrides.deletedIds.filter((id) => id !== prepared.id);
    await writeCourseOverrides(courseOverrides);

    sendJson(res, existingIndex >= 0 ? 200 : 201, {
        message: existingIndex >= 0 ? "Kurs yangilandi." : "Kurs qo'shildi.",
        course: prepared
    });
}

async function handleAdminDeleteCourse(req, res, courseId) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const normalizedId = slugifyCourseId(courseId);
    const courseOverrides = await readCourseOverrides();
    courseOverrides.upserts = courseOverrides.upserts.filter((course) => String(course?.id || "") !== normalizedId);

    if (!courseOverrides.deletedIds.includes(normalizedId)) {
        courseOverrides.deletedIds.push(normalizedId);
    }

    await writeCourseOverrides(courseOverrides);
    sendJson(res, 200, {
        message: "Kurs katalogdan olib tashlandi.",
        deletedId: normalizedId
    });
}

async function handleAdminRestoreCourse(req, res, courseId) {
    const auth = await requireAdminAccess(req, res);
    if (!auth) return;

    const normalizedId = slugifyCourseId(courseId);
    const courseOverrides = await readCourseOverrides();
    courseOverrides.deletedIds = courseOverrides.deletedIds.filter((id) => id !== normalizedId);
    await writeCourseOverrides(courseOverrides);

    sendJson(res, 200, {
        message: "Kurs qayta tiklandi.",
        restoredId: normalizedId
    });
}

async function handleGetLawyers(res) {
    const lawyers = await readLawyers();
    const sorted = [...lawyers].sort((a, b) => {
        const leadDiff = (b.leadCount || 0) - (a.leadCount || 0);
        if (leadDiff !== 0) return leadDiff;
        return (b.experienceYears || 0) - (a.experienceYears || 0);
    });

    sendJson(res, 200, {
        lawyers: sorted.map((lawyer) => toPublicLawyer(lawyer))
    });
}

async function handleUpsertLawyer(req, res) {
    const actorId = getRequestActorId(req);
    if (!actorId) {
        sendJson(res, 401, { error: "Avval tizimga kirish kerak." });
        return;
    }

    const users = await readUsers();
    const actor = users.find((item) => item.id === actorId);
    if (!actor) {
        sendJson(res, 401, { error: "Foydalanuvchi topilmadi." });
        return;
    }

    const payload = await parseBody(req);
    const validationMessage = validateLawyerPayload(payload);
    if (validationMessage) {
        sendJson(res, 400, { error: validationMessage });
        return;
    }

    const lawyers = await readLawyers();
    const nowIso = new Date().toISOString();
    const existing = lawyers.find((item) => item.ownerUserId === actor.id);
    const prepared = normalizeLawyerRecord({
        ...(existing || {}),
        ...payload,
        ownerUserId: actor.id,
        ownerEmail: actor.email,
        id: existing?.id || payload.id || crypto.randomUUID(),
        leadCount: existing?.leadCount || 0,
        ratingBase: existing?.ratingBase || 4.1,
        verified: existing?.verified || false,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
    });

    if (existing) {
        Object.assign(existing, prepared);
        await writeLawyers(lawyers);
        sendJson(res, 200, {
            message: "Advokat e'loni yangilandi.",
            lawyer: toPublicLawyer(existing)
        });
        return;
    }

    lawyers.unshift(prepared);
    await writeLawyers(lawyers);
    sendJson(res, 201, {
        message: "Advokat e'loni joylandi.",
        lawyer: toPublicLawyer(prepared)
    });
}

async function handleLawyerContact(req, res, lawyerId) {
    const lawyers = await readLawyers();
    const lawyer = lawyers.find((item) => item.id === lawyerId);
    if (!lawyer) {
        sendJson(res, 404, { error: "Advokat topilmadi." });
        return;
    }

    lawyer.leadCount = Math.max(0, Number(lawyer.leadCount) || 0) + 1;
    lawyer.updatedAt = new Date().toISOString();
    await writeLawyers(lawyers);

    sendJson(res, 200, {
        message: "Murojaat qayd etildi.",
        lawyer: toPublicLawyer(lawyer)
    });
}

async function handleApiRoutes(req, res, pathname) {
    if (req.method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, {
            ok: true,
            service: "YurForce API",
            date: new Date().toISOString()
        });
        return true;
    }

    if (req.method === "GET" && pathname === "/api/plans") {
        sendJson(res, 200, { plans: Object.values(PLAN_CATALOG) });
        return true;
    }

    if (req.method === "POST" && pathname === "/api/auth/register") {
        await handleRegister(req, res);
        return true;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
        await handleLogin(req, res);
        return true;
    }

    if (req.method === "GET" && pathname === "/api/admin/overview") {
        await handleAdminOverview(req, res);
        return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/users") {
        await handleAdminCreateUser(req, res);
        return true;
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9-]+)$/);
    if (adminUserMatch && req.method === "PATCH") {
        await handleAdminPatchUser(req, res, adminUserMatch[1]);
        return true;
    }

    if (adminUserMatch && req.method === "DELETE") {
        await handleAdminDeleteUser(req, res, adminUserMatch[1]);
        return true;
    }

    if (req.method === "GET" && pathname === "/api/courses") {
        await handleGetCourseOverrides(res);
        return true;
    }

    if (req.method === "GET" && pathname === "/api/site-settings") {
        await handleGetSiteSettings(res);
        return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/courses") {
        await handleAdminUpsertCourse(req, res);
        return true;
    }

    if (req.method === "PATCH" && pathname === "/api/admin/site-settings") {
        await handleAdminPatchSiteSettings(req, res);
        return true;
    }

    const adminCourseMatch = pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9-]+)$/);
    if (adminCourseMatch && req.method === "DELETE") {
        await handleAdminDeleteCourse(req, res, adminCourseMatch[1]);
        return true;
    }

    const adminCourseRestoreMatch = pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9-]+)\/restore$/);
    if (adminCourseRestoreMatch && req.method === "POST") {
        await handleAdminRestoreCourse(req, res, adminCourseRestoreMatch[1]);
        return true;
    }

    if (req.method === "GET" && pathname === "/api/lawyers") {
        await handleGetLawyers(res);
        return true;
    }

    if (req.method === "POST" && pathname === "/api/lawyers") {
        await handleUpsertLawyer(req, res);
        return true;
    }

    const lawyerContactMatch = pathname.match(/^\/api\/lawyers\/([a-zA-Z0-9-]+)\/contact$/);
    if (lawyerContactMatch && req.method === "POST") {
        await handleLawyerContact(req, res, lawyerContactMatch[1]);
        return true;
    }

    const userMatch = pathname.match(/^\/api\/users\/([a-zA-Z0-9-]+)$/);
    if (userMatch && req.method === "GET") {
        await handleGetUser(res, userMatch[1]);
        return true;
    }

    if (userMatch && req.method === "PATCH") {
        await handlePatchUser(req, res, userMatch[1]);
        return true;
    }

    return false;
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const apiHandled = await handleApiRoutes(req, res, pathname);
        if (apiHandled) {
            return;
        }

        if (pathname.startsWith("/api/")) {
            sendJson(res, 404, { error: "API endpoint topilmadi." });
            return;
        }

        await serveStaticFile(req, res, pathname);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        sendJson(res, statusCode, {
            error: error.message || "Ichki server xatosi yuz berdi."
        });
    }
});

ensureStorage()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`YurForce server running at http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Storage initialization failed:", error);
        process.exit(1);
    });
