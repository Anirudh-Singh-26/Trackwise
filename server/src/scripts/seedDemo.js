import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

if (process.env.NODE_ENV === "production") {
  console.error("Demo seeding is disabled in production.");
  process.exit(1);
}

const demoUsers = [
  { name: "Demo Administrator", email: "admin@demo.local", password: "AdminDemo123!", role: "admin", teamName: "" },
  { name: "Demo Manager", email: "manager@demo.local", password: "ManagerDemo123!", role: "manager", teamName: "Product Team" },
  { name: "Demo Employee", email: "employee@demo.local", password: "EmployeeDemo123!", role: "employee", teamName: "Product Team" }
];

try {
  await connectDB();
  const managerExisting = await User.findOne({ email: "manager@demo.local" });
  const employeeExisting = await User.findOne({ email: "employee@demo.local" });

  for (const item of demoUsers) {
    const passwordHash = await bcrypt.hash(item.password, 12);
    const user = await User.findOneAndUpdate(
      { email: item.email },
      { $set: { name: item.name, passwordHash, role: item.role, teamName: item.teamName, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Seeded ${user.role}: ${user.email}`);
  }

  const manager = await User.findOne({ email: "manager@demo.local" });
  await User.updateOne({ email: "employee@demo.local" }, { $set: { managerId: manager._id } });

  console.log("\\nDEMO LOGIN ACCOUNTS (development only)");
  console.log("Admin:    admin@demo.local / AdminDemo123!");
  console.log("Manager:  manager@demo.local / ManagerDemo123!");
  console.log("Employee: employee@demo.local / EmployeeDemo123!");
  console.log("\\nDo not use these credentials in production.");
} catch (error) {
  console.error("Demo seed failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
