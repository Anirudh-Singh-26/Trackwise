import mongoose from "mongoose";

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  actorRole: { type: String, enum: ["admin", "manager", "employee", "system"], default: "system" },
  action: { type: String, required: true, trim: true, maxlength: 80, index: true },
  targetType: { type: String, required: true, trim: true, maxlength: 80, index: true },
  targetId: { type: String, default: null, maxlength: 120, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestId: { type: String, default: null, maxlength: 120 },
  occurredAt: { type: Date, default: Date.now, required: true, index: true },
}, { versionKey: false });

schema.index({ occurredAt: -1, action: 1 });
export default mongoose.model("AuditLog", schema);
