import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: "screenshot-monitoring", immutable: true },
  enabled: { type: Boolean, default: true, required: true },
  intervalSeconds: { type: Number, min: 30, max: 300, default: 30, required: true },
  idleThresholdSeconds: { type: Number, min: 30, max: 300, default: 60, required: true },
  captureScope: { type: String, enum: ["visible-tab"], default: "visible-tab", required: true },
  pauseDuringIdle: { type: Boolean, default: true, required: true },
  pauseDuringBreaks: { type: Boolean, default: true, required: true },
  retentionDays: { type: Number, min: 1, max: 30, default: 7, required: true },
  excludedDomains: { type: [String], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, versionKey: false });

export default mongoose.model("ScreenshotPolicy", schema);
