import mongoose from "mongoose";

export async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
  });
  console.log(JSON.stringify({ level: "info", event: "database_connected", database: mongoose.connection.name }));
}

export function getDatabaseHealth() {
  const state = mongoose.connection.readyState;
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return {
    status: state === 1 ? "ok" : "unavailable",
    connected: state === 1,
    state: states[state] || "unknown",
  };
}
