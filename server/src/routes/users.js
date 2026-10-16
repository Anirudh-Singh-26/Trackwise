import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { allowRoles } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";
import { isObjectId, managerAssignmentError, managerRoleChangeError, managerDeactivationError } from "../utils/userPolicy.js";
const r = Router();
r.get("/", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const filter = req.user.role === "manager" ? { managerId: req.user._id, role: "employee" } : {};
    const users = await User.find(filter)
      .select("name email role managerId teamName isActive createdAt")
      .sort({ name: 1 })
      .limit(500);
    res.json({ users });
  } catch (e) {
    next(e);
  }
});
r.post("/", allowRoles("admin"), async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role = "employee",
      managerId = null,
      teamName = "",
    } = req.body || {};
    if (
      !name?.trim() ||
      !email?.trim() ||
      typeof password !== "string" ||
      password.length < 12
    )
      return res
        .status(400)
        .json({ message: "Name, email and password (12+ chars) required" });
    if (!["admin", "manager", "employee"].includes(role))
      return res.status(400).json({ message: "Invalid role" });
    const assignmentError = managerAssignmentError({ role, managerId });
    if (assignmentError) return res.status(400).json({ message: assignmentError });
    if (managerId) {
      const manager = await User.findOne({ _id: managerId, role: "manager", isActive: true }).select("_id");
      if (!manager) return res.status(400).json({ message: "Reporting manager must be an active manager account" });
    }
    const u = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
      managerId,
      teamName,
    });
    await writeAudit(req, { action: "USER_CREATED", targetType: "user", targetId: u.id, metadata: { role: u.role, teamName: u.teamName || "" } });
    res
      .status(201)
      .json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
});

r.patch("/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    const { name, email, role, managerId = null, teamName = "" } = req.body || {};
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid user ID" });
    if (typeof name !== "string" || name.trim().length < 2 || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: "Valid name and email are required" });
    }
    if (role && !["admin", "manager", "employee"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (String(req.params.id) === String(req.user.id) && role && role !== "admin") {
      return res.status(400).json({ message: "You cannot change your own admin role" });
    }
    const target = await User.findById(req.params.id).select("_id role");
    if (!target) return res.status(404).json({ message: "User not found" });
    const nextRole = role || target.role;
    const assignmentError = managerAssignmentError({ role: nextRole, managerId, userId: req.params.id });
    if (assignmentError) return res.status(400).json({ message: assignmentError });
    if (target.role === "manager" && nextRole !== "manager") {
      const directReports = await User.countDocuments({ managerId: target._id, role: "employee" });
      const roleError = managerRoleChangeError({ currentRole: target.role, nextRole, directReportsCount: directReports });
      if (roleError) return res.status(409).json({ message: roleError });
    }
    if (managerId) {
      const manager = await User.findOne({ _id: managerId, role: "manager", isActive: true }).select("_id");
      if (!manager) return res.status(400).json({ message: "Reporting manager must be an active manager account" });
    }
    const update = { name: name.trim(), email: email.trim().toLowerCase(), managerId: nextRole === "employee" ? managerId : null, teamName: String(teamName).trim() };
    if (role) update.role = role;
    const u = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .select("name email role managerId teamName isActive createdAt");
    if (!u) return res.status(404).json({ message: "User not found" });
    await writeAudit(req, { action: "USER_UPDATED", targetType: "user", targetId: u.id, metadata: { role: u.role, teamName: u.teamName || "", managerAssigned: Boolean(u.managerId) } });
    res.json({ user: u });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Email already exists" });
    next(e);
  }
});

r.patch("/:id/status", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid user ID" });
    if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ message: "isActive must be a boolean" });
    if (String(req.params.id) === String(req.user.id) && req.body.isActive === false) return res.status(400).json({ message: "You cannot deactivate your own account" });
    const target = await User.findById(req.params.id).select("_id role isActive");
    if (!target) return res.status(404).json({ message: "User not found" });
    if (!req.body.isActive && target.role === "manager") {
      const directReports = await User.countDocuments({ managerId: target._id, role: "employee" });
      const deactivationError = managerDeactivationError({ role: target.role, isActive: req.body.isActive, directReportsCount: directReports });
      if (deactivationError) return res.status(409).json({ message: deactivationError });
    }
    const u = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive },
      { new: true, runValidators: true },
    ).select("name email role isActive");
    if (!u) return res.status(404).json({ message: "User not found" });
    await writeAudit(req, { action: u.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED", targetType: "user", targetId: u.id, metadata: { role: u.role } });
    res.json({ user: u });
  } catch (e) {
    next(e);
  }
});
export default r;
