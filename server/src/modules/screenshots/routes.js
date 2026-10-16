import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import Screenshot from "../../models/Screenshot.js";
import ScreenshotCaptureGate from "../../models/ScreenshotCaptureGate.js";
import ScreenshotPolicy from "../../models/ScreenshotPolicy.js";
import WorkSession from "../../models/WorkSession.js";
import Break from "../../models/Break.js";
import User from "../../models/User.js";
import { allowRoles } from "../../middleware/auth.js";
import { writeAudit } from "../../utils/audit.js";
import { getCloudinary } from "../../config/cloudinary.js";
import { DEFAULT_SCREENSHOT_POLICY, validatePolicy } from "./policy.js";

const router = Router();
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 8, parts: 10 }, fileFilter(_req, file, cb) {
  if (!["image/jpeg", "image/webp"].includes(file.mimetype)) return cb(Object.assign(new Error("Only JPEG and WebP screenshots are accepted"), { status: 415 }));
  cb(null, true);
} });
const publicPolicy = policy => ({ enabled: policy.enabled, intervalSeconds: policy.intervalSeconds, idleThresholdSeconds: policy.idleThresholdSeconds || 60, captureScope: policy.captureScope, pauseDuringIdle: policy.pauseDuringIdle, pauseDuringBreaks: policy.pauseDuringBreaks, retentionDays: policy.retentionDays, excludedDomains: policy.excludedDomains || [], updatedAt: policy.updatedAt });
async function getPolicy() {
  let policy = await ScreenshotPolicy.findOne({ key: "screenshot-monitoring" });
  if (!policy) policy = await ScreenshotPolicy.create({ key: "screenshot-monitoring", ...DEFAULT_SCREENSHOT_POLICY });
  return policy;
}
async function canViewEmployee(req, employeeId) {
  if (req.user.role === "admin") return true;
  if (req.user.role !== "manager") return false;
  return Boolean(await User.exists({ _id: employeeId, role: "employee", managerId: req.user._id }));
}
function domainIsExcluded(domain, excludedDomains = []) {
  if (!domain) return true;
  const normalized = String(domain).toLowerCase().replace(/^www\./, "");
  return excludedDomains.some(entry => {
    const rule = String(entry).toLowerCase().replace(/^www\./, "");
    return normalized === rule || normalized.endsWith(`.${rule}`);
  });
}

// Extension token endpoint. The token is bound to one employee and one work session.
router.get("/policy", async (req, res, next) => {
  try {
    const policy = await getPolicy();
    if (req.user.role === "employee") {
      const sessionId = req.extensionSessionId;
      if (!sessionId) return res.status(403).json({ message: "A session-bound extension token is required" });
      const session = await WorkSession.findOne({ _id: sessionId, employeeId: req.user._id, status: "active" }).select("_id").lean();
      if (!session) return res.status(409).json({ message: "Work session is no longer active" });
      const activeBreak = await Break.exists({ sessionId, status: "active" });
      return res.json({ policy: publicPolicy(policy), sessionActive: true, breakActive: Boolean(activeBreak) });
    }
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Insufficient permissions" });
    res.json({ policy: publicPolicy(policy) });
  } catch (e) { next(e); }
});

router.put("/policy", allowRoles("admin"), async (req, res, next) => {
  try {
    const error = validatePolicy(req.body);
    if (error) return res.status(400).json({ message: error });
    const policy = await ScreenshotPolicy.findOneAndUpdate(
      { key: "screenshot-monitoring" },
      { $set: { ...req.body, updatedBy: req.user._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    // Apply retention changes to existing screenshots as well as future captures.
    // The cleaner uses these expiry timestamps to remove both Cloudinary assets and DB records.
    const retentionMs = policy.retentionDays * 86400000;
    const retentionUpdate = await Screenshot.updateMany({}, [
      { $set: { expiresAt: { $add: ["$capturedAt", retentionMs] } } },
    ]);
    await writeAudit(req, { action: "SCREENSHOT_POLICY_UPDATED", targetType: "screenshot_policy", targetId: policy.id, metadata: { enabled: policy.enabled, intervalSeconds: policy.intervalSeconds, idleThresholdSeconds: policy.idleThresholdSeconds || 60, captureScope: policy.captureScope, pauseDuringIdle: policy.pauseDuringIdle, pauseDuringBreaks: policy.pauseDuringBreaks, retentionDays: policy.retentionDays, excludedDomainCount: policy.excludedDomains.length, screenshotsRecalculated: retentionUpdate.modifiedCount ?? retentionUpdate.nModified ?? 0 } });
    res.json({ policy: publicPolicy(policy), retentionUpdated: retentionUpdate.modifiedCount ?? retentionUpdate.nModified ?? 0 });
  } catch (e) { next(e); }
});

router.post("/", (req, res, next) => upload.single("image")(req, res, error => error ? next(error) : next()), async (req, res, next) => {
  // Multer's callback middleware is intentionally isolated above so errors reach the shared handler.
  try {
    if (req.user.role !== "employee" || !req.extensionSessionId) return res.status(403).json({ message: "A session-bound employee extension token is required" });
    if (!req.file) return res.status(400).json({ message: "image file is required" });
    const { captureId, capturedAt, captureScope, tabDomain } = req.body || {};
    if (typeof captureId !== "string" || !/^[a-zA-Z0-9_-]{12,120}$/.test(captureId)) return res.status(400).json({ message: "captureId must be a unique 12-120 character identifier" });
    const captured = new Date(capturedAt);
    if (!capturedAt || Number.isNaN(captured.getTime()) || captured.getTime() > Date.now() + 60_000 || captured.getTime() < Date.now() - 10 * 60_000) return res.status(400).json({ message: "capturedAt is outside the accepted time window" });
    if (captureScope !== "visible-tab") return res.status(400).json({ message: "Only visible-tab capture is supported" });
    if (typeof tabDomain !== "string" || tabDomain.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(tabDomain)) return res.status(400).json({ message: "A valid tab domain is required" });
    const [policy, session] = await Promise.all([getPolicy(), WorkSession.findOne({ _id: req.extensionSessionId, employeeId: req.user._id, status: "active" })]);
    if (!policy.enabled) return res.status(409).json({ message: "Screenshot monitoring is disabled" });
    if (!session) return res.status(409).json({ message: "Work session is no longer active" });
    if (policy.pauseDuringBreaks && await Break.exists({ sessionId: session._id, status: "active" })) return res.status(409).json({ message: "Screenshot capture is paused during breaks" });
    if (policy.pauseDuringIdle) {
      const stateIsFresh = session.browserStateUpdatedAt && Date.now() - new Date(session.browserStateUpdatedAt).getTime() <= 120000;
      if (!stateIsFresh || session.browserState !== "active") return res.status(409).json({ message: "Screenshot capture is paused while idle or while browser state is unavailable" });
    }
    if (domainIsExcluded(tabDomain, policy.excludedDomains)) return res.status(204).end();
    const existing = await Screenshot.findOne({ employeeId: req.user._id, sessionId: session._id, captureId }).lean();
    if (existing) return res.status(200).json({ ok: true, duplicate: true, screenshotId: String(existing._id) });
    const signature = req.file.buffer.subarray(0, 12).toString("hex");
    const isJpeg = signature.startsWith("ffd8ff");
    const isWebp = req.file.buffer.subarray(0, 4).toString("ascii") === "RIFF" && req.file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isJpeg && !isWebp) return res.status(415).json({ message: "Uploaded bytes are not a valid JPEG or WebP image" });
    const now = new Date();
    const minimumGapMs = policy.intervalSeconds * 1000 - 2000;
    const cutoff = new Date(now.getTime() - minimumGapMs);
    try {
      await ScreenshotCaptureGate.findOneAndUpdate(
        { employeeId: req.user._id, sessionId: session._id, $or: [{ lastAcceptedAt: { $lte: cutoff } }, { lastAcceptedAt: { $exists: false } }] },
        { $set: { lastAcceptedAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) }, $setOnInsert: { employeeId: req.user._id, sessionId: session._id } },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (error) {
      if (error?.code === 11000) {
        const gate = await ScreenshotCaptureGate.findOne({ employeeId: req.user._id, sessionId: session._id }).select("lastAcceptedAt").lean();
        const retrySeconds = Math.max(1, Math.ceil((minimumGapMs - (Date.now() - new Date(gate?.lastAcceptedAt || now).getTime())) / 1000));
        res.setHeader("Retry-After", String(retrySeconds));
        return res.status(429).json({ message: "Screenshot interval has not elapsed", retryAfterSeconds: retrySeconds });
      }
      throw error;
    }
    const cloudinary = getCloudinary();
    const publicId = `trackwise/screenshots/${String(req.user._id)}/${String(session._id)}/${captureId}`;
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id: publicId, asset_folder: "Trackwise", resource_type: "image", type: "authenticated", overwrite: false, unique_filename: false, format: isWebp ? "webp" : "jpg", tags: ["trackwise-screenshot"] }, (error, value) => error ? reject(error) : resolve(value));
      stream.end(req.file.buffer);
    });
    const expiresAt = new Date(captured.getTime() + policy.retentionDays * 86400000);
    try {
      const screenshot = await Screenshot.create({ employeeId: req.user._id, sessionId: session._id, captureId, capturedAt: captured, captureScope: "visible-tab", tabDomain: tabDomain.toLowerCase(), assetId: result.asset_id, publicId: result.public_id, resourceType: result.resource_type || "image", format: result.format, bytes: result.bytes, expiresAt });
      res.status(201).json({ ok: true, screenshotId: String(screenshot._id), expiresAt });
    } catch (error) {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: "image", type: "authenticated", invalidate: true }).catch(() => {});
      if (error?.code === 11000) {
        const existingAfterRace = await Screenshot.findOne({ employeeId: req.user._id, sessionId: session._id, captureId }).lean();
        if (existingAfterRace) return res.status(200).json({ ok: true, duplicate: true, screenshotId: String(existingAfterRace._id) });
      }
      throw error;
    }
  } catch (e) { next(e); }
});

router.get("/", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 30));
    const filter = { expiresAt: { $gt: new Date() } };
    if (req.query.employeeId) {
      if (!mongoose.isValidObjectId(req.query.employeeId)) return res.status(400).json({ message: "Invalid employeeId" });
      if (!await canViewEmployee(req, req.query.employeeId)) return res.status(403).json({ message: "You cannot view this employee's screenshots" });
      filter.employeeId = req.query.employeeId;
    } else if (req.user.role === "manager") {
      const reports = await User.find({ managerId: req.user._id, role: "employee" }).select("_id").lean();
      filter.employeeId = { $in: reports.map(item => item._id) };
    }
    if (String(req.query.activeOnly || "").toLowerCase() === "true") {
      const activeSessions = await WorkSession.find({ status: "active" }).select("_id").lean();
      filter.sessionId = { $in: activeSessions.map(item => item._id) };
    }
    if (req.query.sessionId) {
      if (!mongoose.isValidObjectId(req.query.sessionId)) return res.status(400).json({ message: "Invalid sessionId" });
      filter.sessionId = req.query.sessionId;
    }
    if (req.query.from || req.query.to) {
      filter.capturedAt = {};
      if (req.query.from) { const d = new Date(req.query.from); if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid from date" }); filter.capturedAt.$gte = d; }
      if (req.query.to) { const d = new Date(req.query.to); if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid to date" }); filter.capturedAt.$lte = d; }
    }
    const [items, total] = await Promise.all([Screenshot.find(filter).populate("employeeId", "name email teamName managerId").sort({ capturedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Screenshot.countDocuments(filter)]);
    const cloudinary = items.length ? getCloudinary() : null;
    const previewExpiry = Math.floor(Date.now() / 1000) + 300;
    const screenshots = items.map(({ publicId, assetId, ...item }) => ({
      ...item,
      employee: item.employeeId,
      employeeId: String(item.employeeId?._id || item.employeeId),
      screenshotId: String(item._id),
      previewUrl: cloudinary ? cloudinary.utils.private_download_url(publicId, item.format, { expires_at: previewExpiry, resource_type: "image", type: "authenticated", attachment: false }) : null,
      previewExpiresAt: cloudinary ? new Date(previewExpiry * 1000).toISOString() : null,
    }));
    if (screenshots.length) {
      await writeAudit(req, { action: "SCREENSHOT_GALLERY_VIEWED", targetType: "screenshot_gallery", metadata: { count: screenshots.length, page, limit, previewExpiresAt: new Date(previewExpiry * 1000).toISOString() } });
    }
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ screenshots, page, limit, total });
  } catch (e) { next(e); }
});

router.get("/:id/access", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid screenshot ID" });
    const screenshot = await Screenshot.findOne({ _id: req.params.id, expiresAt: { $gt: new Date() } }).lean();
    if (!screenshot) return res.status(404).json({ message: "Screenshot not found or expired" });
    if (!await canViewEmployee(req, screenshot.employeeId)) return res.status(403).json({ message: "You cannot view this employee's screenshots" });
    const cloudinary = getCloudinary();
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const url = cloudinary.utils.private_download_url(screenshot.publicId, screenshot.format, { expires_at: expiresAt, resource_type: "image", type: "authenticated", attachment: false });
    await writeAudit(req, { action: "SCREENSHOT_VIEWED", targetType: "screenshot", targetId: String(screenshot._id), metadata: { employeeId: String(screenshot.employeeId), sessionId: String(screenshot.sessionId), expiresAt: new Date(expiresAt * 1000).toISOString() } });
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ url, expiresAt: new Date(expiresAt * 1000).toISOString() });
  } catch (e) { next(e); }
});

router.delete("/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid screenshot ID" });
    const screenshot = await Screenshot.findById(req.params.id);
    if (!screenshot) return res.status(404).json({ message: "Screenshot not found" });
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(screenshot.publicId, { resource_type: "image", type: "authenticated", invalidate: true });
    await Screenshot.deleteOne({ _id: screenshot._id });
    await writeAudit(req, { action: "SCREENSHOT_DELETED", targetType: "screenshot", targetId: String(screenshot._id), metadata: { employeeId: String(screenshot.employeeId), sessionId: String(screenshot.sessionId) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
