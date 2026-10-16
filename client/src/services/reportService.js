import { api } from "./api";
export function fetchReportSummary(query) {
    return api(`/reports/summary${query}`);
}
export function fetchPeopleReport(query) {
    return api(`/reports/people${query}`);
}
export function fetchDailyReport(query) {
    return api(`/reports/daily${query}`);
}
export function fetchBreakReport(query) {
    return api(`/breaks/report${query}`);
}
export function fetchMyTrackingEvents(query) {
    return api(`/tracking/events/mine${query}`);
}
export function fetchEmployeeDomainEvents(query, employeeId) {
    return api(`/reports/domains${query}&employeeId=${encodeURIComponent(employeeId)}`);
}
