import mongoose from "mongoose";

const schema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkSession", required: true, index: true },
  captureId: { type: String, required: true, maxlength: 120 },
  capturedAt: { type: Date, required: true, index: true },
  receivedAt: { type: Date, default: Date.now, required: true },
  captureScope: { type: String, enum: ["visible-tab"], required: true },
  tabDomain: { type: String, default: null, maxlength: 253 },
  storageProvider: { type: String, enum: ["cloudinary"], default: "cloudinary" },
  assetId: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, default: "image" },
  format: { type: String, enum: ["jpg", "jpeg", "webp"], required: true },
  bytes: { type: Number, required: true, min: 1 },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true, versionKey: false });
schema.index({ employeeId: 1, sessionId: 1, captureId: 1 }, { unique: true });
schema.index({ employeeId: 1, capturedAt: -1 });
schema.index({ sessionId: 1, capturedAt: -1 });
export default mongoose.model("Screenshot", schema);
