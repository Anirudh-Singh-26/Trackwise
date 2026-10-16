import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  schemaVersion: { type: Number, default: 1 },
  source: { type: String, enum: ["chrome_extension", "web"], required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkSession", required: true, index: true },
  // DOMAIN_STATE_CHANGE is retained for compatibility with older extension events.
  type: { type: String, enum: ["DOMAIN_STATE_CHANGE", "VISIT_START", "VISIT_END", "IDLE_START", "IDLE_END", "TAB_SWITCH"], required: true },
  visitId: { type: String, default: null, index: true },
  activityId: { type: String, default: null, index: true },
  tabId: { type: Number, default: null },
  previousDomain: { type: String, default: null, lowercase: true },
  domain: { type: String, required: true, lowercase: true },
  observedAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now }
}, { timestamps: true });

schema.index({ employeeId: 1, observedAt: 1 });
schema.index({ employeeId: 1, sessionId: 1, visitId: 1, observedAt: 1 });
export default mongoose.model("TrackingEvent", schema);
