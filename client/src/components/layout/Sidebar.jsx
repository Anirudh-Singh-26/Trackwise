import { Activity, Clock3, Coffee, ShieldCheck, Users, Camera, Settings, AlertTriangle, ChartNoAxesCombined, LayoutDashboard } from "lucide-react";
export default function Sidebar({ user, section, setSection, setSelectedEmployeeId }) {
    const nav = [{ name: "Overview", icon: LayoutDashboard }, { name: "Sessions", icon: Clock3 }, { name: "Breaks", icon: Coffee }, { name: "Activities", icon: ChartNoAxesCombined }, ...(user.role !== "employee" ? [{ name: "Screenshots", icon: Camera }, { name: "Team & users", icon: Users }, { name: "Reports & policies", icon: ShieldCheck }, ...(user.role === "admin" ? [{ name: "Configuration", icon: Settings }, { name: "Session health", icon: AlertTriangle }, { name: "Audit log", icon: ShieldCheck }] : [{ name: "Session health", icon: AlertTriangle }])] : [])];
    return <aside className="sidebar"><div className="brand"><span className="mark"><Activity /></span><div><b>Trackwise</b><small>Employee workspace</small></div></div><p className="navlabel">WORKSPACE</p>{nav.map(({ name, icon: Icon }) => <button type="button" key={name} className={`nav ${(section === name || (name === "Sessions" && section === "Attendance") || (name === "Activities" && section === "Activity analytics") || (name === "Breaks" && section === "Break analytics")) ? "active" : ""}`} onClick={() => {
                if (name === "Activities" && user.role === "employee") {
                    setSelectedEmployeeId(null);
                    setSection("Activity analytics");
                }
                else {
                    setSelectedEmployeeId(null);
                    setSection(name === "Sessions" ? "Attendance" : name);
                }
            }}><Icon /> {name}</button>)}<div className="sidefoot">● {`${user.role} workspace`}</div></aside>;
}
