import { api } from "./api";
export function fetchAuditLogs(limit = 150) {
    return api(`/audit?limit=${limit}`);
}
