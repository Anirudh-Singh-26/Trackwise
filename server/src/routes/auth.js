import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import WorkSession from "../models/WorkSession.js";
import Break from "../models/Break.js";
import { requireAuth } from "../middleware/auth.js";
import { closeOpenVisits } from "../utils/closeOpenVisits.js";
import { writeAudit } from "../utils/audit.js";
const r = Router();
const cookieOpts = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
});
r.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
        .trim()
        .toLowerCase(),
      password = String(req.body?.password || "");
    if (!email || !password) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "auth_login_rejected",
          requestId: req.requestId,
          reason: "missing_credentials",
        }),
      );
      return res
        .status(400)
        .json({
          message: "Email and password required",
          requestId: req.requestId,
        });
    }
    const u = await User.findOne({ email }).select("+passwordHash");
    if (
      !u ||
      !u.isActive ||
      !(await bcrypt.compare(password, u.passwordHash))
    ) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "auth_login_rejected",
          requestId: req.requestId,
          reason: "invalid_credentials",
        }),
      );
      return res
        .status(401)
        .json({ message: "Invalid credentials", requestId: req.requestId });
    }
    const token = jwt.sign({ sub: u.id }, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });
    console.info(
      JSON.stringify({
        level: "info",
        event: "auth_login_success",
        requestId: req.requestId,
        userId: u.id,
        role: u.role,
      }),
    );
    res
      .cookie("tracker_token", token, cookieOpts())
      .json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  } catch (e) {
    next(e);
  }
});
// Exchange an already-authenticated dashboard employee session for a scoped extension token.
// The extension reads the HttpOnly dashboard cookie through the explicit Chrome cookies permission;
// this endpoint never returns the dashboard token and issues tracking-only access instead.
r.post("/extension-session", async (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ message: "Sign in to Trackwise first, then retry." });

    let payload;
    try {
      payload = jwt.verify(match[1].trim(), process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Your Trackwise login has expired. Sign in again." });
    }

    const u = await User.findById(payload.sub);
    if (!u || !u.isActive) return res.status(401).json({ message: "Account unavailable. Sign in again." });
    if (u.role !== "employee") return res.status(403).json({ message: "Please sign in with an employee account; admin accounts cannot connect to the tracker." });

    const { default: WorkSession } = await import("../models/WorkSession.js");
    const session = await WorkSession.findOne({ employeeId: u.id, status: "active" }).sort({ startedAt: -1 });
    if (!session) return res.status(409).json({ message: "Start a work session in Trackwise before connecting the extension." });

    const token = jwt.sign({ sub: u.id, scope: "tracking:write", sessionId: session.id }, process.env.JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, expiresInSeconds: 43200, sessionId: session.id, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});

// Extension login returns a short-lived, tracking-only bearer token. It cannot access
// users, sessions, reports, or other protected APIs.
r.post("/extension-login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const u = await User.findOne({ email }).select("+passwordHash");
    if (!u || !u.isActive || u.role !== "employee" || !(await bcrypt.compare(password, u.passwordHash))) {
      return res.status(401).json({ message: "Invalid employee credentials" });
    }
    const { default: WorkSession } = await import("../models/WorkSession.js");
    const session = await WorkSession.findOne({ employeeId: u.id, status: "active" }).sort({ startedAt: -1 });
    if (!session) return res.status(409).json({ message: "Start a work session in Trackwise before connecting the extension." });
    const token = jwt.sign({ sub: u.id, scope: "tracking:write", sessionId: session.id }, process.env.JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, expiresInSeconds: 43200, sessionId: session.id, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});

r.post("/logout", requireAuth, async (req, res, next) => {
  try {
    let endedSession = false;

    // Signing out ends the employee's active work session as well. This makes
    // the session-bound extension token unusable immediately on the server;
    // the extension clears its local connection on its next heartbeat.
    if (req.user.role === "employee") {
      const session = await WorkSession.findOne({
        employeeId: req.user.id,
        status: "active",
      }).sort({ startedAt: -1 });

      if (session) {
        const endedAt = new Date();
        const activeBreak = await Break.findOne({
          sessionId: session._id,
          status: "active",
        });
        if (activeBreak) {
          activeBreak.endedAt = endedAt;
          activeBreak.status = "ended";
          await activeBreak.save();
        }

        session.endedAt = endedAt;
        session.status = "ended";
        await session.save();
        await closeOpenVisits(session, endedAt);
        await writeAudit(req, {
          action: "WORK_SESSION_ENDED_ON_LOGOUT",
          targetType: "work_session",
          targetId: session.id,
          metadata: { closedActiveBreak: Boolean(activeBreak) },
        });
        endedSession = true;
      }
    }

    console.info(JSON.stringify({
      level: "info",
      event: "auth_logout",
      requestId: req.requestId,
      userId: req.user.id,
      endedSession,
    }));
    res.clearCookie("tracker_token", {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
    });
    res.json({ message: "Logged out", endedSession });
  } catch (e) {
    next(e);
  }
});
r.get("/me", requireAuth, (req, res) =>
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      teamName: req.user.teamName,
    },
  }),
);
export default r;
