import test from "node:test";
import assert from "node:assert/strict";
import { isObjectId, managerAssignmentError, managerRoleChangeError, managerDeactivationError } from "./userPolicy.js";

test("validates Mongo-style object IDs without accepting malformed values", () => {
  assert.equal(isObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isObjectId("507f1f77bcf86cd79943901z"), false);
  assert.equal(isObjectId(""), false);
  assert.equal(isObjectId(null), false);
});

test("only employee accounts may have a reporting manager", () => {
  assert.match(managerAssignmentError({ role: "manager", managerId: "507f1f77bcf86cd799439011" }), /Only employee/);
  assert.equal(managerAssignmentError({ role: "employee", managerId: "507f1f77bcf86cd799439011" }), null);
  assert.equal(managerAssignmentError({ role: "employee", managerId: null }), null);
});

test("rejects self-reporting assignments", () => {
  assert.match(managerAssignmentError({ role: "employee", managerId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439011" }), /themselves/);
});

test("prevents demoting managers with assigned reports", () => {
  assert.match(managerRoleChangeError({ currentRole: "manager", nextRole: "employee", directReportsCount: 2 }), /Reassign/);
  assert.equal(managerRoleChangeError({ currentRole: "manager", nextRole: "employee", directReportsCount: 0 }), null);
  assert.equal(managerRoleChangeError({ currentRole: "employee", nextRole: "admin", directReportsCount: 3 }), null);
});

test("prevents deactivating managers with assigned reports", () => {
  assert.match(managerDeactivationError({ role: "manager", isActive: false, directReportsCount: 1 }), /Reassign/);
  assert.equal(managerDeactivationError({ role: "manager", isActive: false, directReportsCount: 0 }), null);
  assert.equal(managerDeactivationError({ role: "manager", isActive: true, directReportsCount: 2 }), null);
  assert.equal(managerDeactivationError({ role: "employee", isActive: false, directReportsCount: 2 }), null);
});
