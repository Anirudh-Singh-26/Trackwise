/** Pure user-management policy checks shared by routes and unit tests. */
export function isObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

export function managerAssignmentError({ role, managerId, userId }) {
  if (managerId && role !== "employee") {
    return "Only employee accounts can be assigned a reporting manager";
  }
  if (managerId && userId && String(managerId) === String(userId)) {
    return "A user cannot report to themselves";
  }
  return null;
}

export function managerRoleChangeError({ currentRole, nextRole, directReportsCount = 0 }) {
  if (currentRole === "manager" && nextRole !== "manager" && directReportsCount > 0) {
    return "Reassign this manager's employees before changing their role";
  }
  return null;
}

export function managerDeactivationError({ role, isActive, directReportsCount = 0 }) {
  if (role === "manager" && isActive === false && directReportsCount > 0) {
    return "Reassign this manager's employees before deactivating their account";
  }
  return null;
}
