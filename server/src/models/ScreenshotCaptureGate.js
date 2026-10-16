import mongoose from "mongoose";

const schema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkSession", required: true },
  lastAcceptedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });
schema.index({ employeeId: 1, sessionId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("ScreenshotCaptureGate", schema);
