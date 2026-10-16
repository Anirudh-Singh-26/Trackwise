import { duration } from "../../utils/dateTime";
export function buildDailyActivity(events, from, to) {
    const byDay = new Map();
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end)
        return [];
    const span = Math.min(31, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    const first = new Date(start);
    first.setDate(first.getDate() + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1 - span));
    for (let i = 0; i < span; i++) {
        const d = new Date(first);
        d.setDate(first.getDate() + i);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        byDay.set(day, { day, websiteMs: 0, idleMs: 0, websiteCount: 0, idleCount: 0, tabSwitchCount: 0 });
    }
    for (const event of events) {
        const d = new Date(event.startedAt);
        if (Number.isNaN(d.getTime()))
            continue;
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const point = byDay.get(day);
        if (!point)
            continue;
        if (event.type === "IDLE_PERIOD") {
            point.idleMs += event.durationMs || 0;
            point.idleCount += 1;
        }
        else if (event.type === "TAB_SWITCH") {
            point.tabSwitchCount += 1;
        }
        else {
            point.websiteMs += event.durationMs || 0;
            point.websiteCount += 1;
        }
    }
    return [...byDay.values()];
}
export function buildDomainActivity(events) {
    const counts = new Map();
    for (const event of events)
        if (event.type !== "TAB_SWITCH" && event.domain && event.domain !== "System idle" && event.domain !== "browser.internal")
            counts.set(event.domain, (counts.get(event.domain) || 0) + 1);
    return [...counts.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 6);
}
export function DailyActivityChart({ data, mode, metric, onSelectDay }) {
    if (!data.length)
        return <div className="chart-empty">No activity to chart for this date range.</div>;
    const width = 720, height = 230, left = 46, right = 12, top = 16, bottom = 42, plotH = height - top - bottom, plotW = width - left - right, slot = plotW / data.length, barW = Math.max(8, Math.min(34, slot * 0.56));
    const valueFor = (d) => metric === "website" ? (mode === "time" ? d.websiteMs / 60000 : d.websiteCount) : metric === "idle" ? (mode === "time" ? d.idleMs / 60000 : d.idleCount) : d.tabSwitchCount;
    const values = data.map(valueFor);
    const max = Math.max(...values, 1);
    const scale = plotH / max;
    const ticks = [0, max / 2, max];
    const label = metric === "website" ? "website visits" : metric === "idle" ? "idle intervals" : "tab switches";
    const colorClass = metric === "website" ? "chart-website-bar" : metric === "idle" ? "chart-idle-bar" : "chart-switch-bar";
    return <div className="chart-svg-wrap"><svg className="daily-activity-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily ${label} ${mode === "time" && metric !== "switch" ? "duration" : "count"}`}>
    {ticks.map((tick, i) => <g key={i}><line x1={left} x2={width - right} y1={top + plotH - tick * scale} y2={top + plotH - tick * scale} className="chart-gridline"/><text x={left - 8} y={top + plotH - tick * scale + 4} textAnchor="end" className="chart-axis-label">{mode === "time" && metric !== "switch" ? `${Math.round(tick)}m` : Math.round(tick)}</text></g>)}
    {data.map((d, i) => {
            const x = left + i * slot + (slot - barW) / 2;
            const value = valueFor(d);
            const h = value * scale;
            return <g key={d.day} className="chart-bar-group" role="button" tabIndex={0} aria-label={`${d.day}: ${label} ${mode === "time" && metric !== "switch" ? duration(value * 60000) : value}`} onClick={() => onSelectDay(d.day)} onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectDay(d.day);
                    }
                }}><title>{`${d.day} · ${label}: ${mode === "time" && metric !== "switch" ? duration(value * 60000) : value}. Click to filter this day.`}</title><rect x={x - 3} y={top} width={barW + 6} height={plotH + 5} rx="5" className="chart-hit-area"/><rect x={x} y={top + plotH - h} width={barW} height={Math.max(0, h)} rx="3" className={colorClass}/><text x={x + barW / 2} y={height - 17} textAnchor="middle" className="chart-axis-label">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</text></g>;
        })}
  </svg></div>;
}
