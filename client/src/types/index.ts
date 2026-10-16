export type Role = "admin" | "manager" | "employee";
export type User = { id: string; _id?: string; name: string; email: string; role: Role; teamName?: string; managerId?: string | null; isActive?: boolean };
export type Session = { _id: string; startedAt: string; endedAt?: string | null; status: "active" | "ended"; employeeId?: User | string; breakMs?: number; sessionMs?: number; qualityFlags?: string[] };
export type TrackingEvent = { _id: string; domain: string; previousDomain?: string | null; startedAt: string; endedAt?: string | null; durationMs?: number | null; employeeId?: User | string; sessionId: string; visitId?: string | null; activityId?: string | null; type?: string };
export type DailyActivityPoint = { day: string; websiteMs: number; idleMs: number; websiteCount: number; idleCount: number; tabSwitchCount: number };
