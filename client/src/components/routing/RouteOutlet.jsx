import OverviewPage from "../pages/OverviewPage";
import SessionsPage from "../pages/SessionsPage";
import BreaksPage from "../pages/BreaksPage";
import BreakAnalyticsPage from "../pages/BreakAnalyticsPage";
import ActivitiesPage from "../pages/ActivitiesPage";
import ActivityAnalyticsPage from "../pages/ActivityAnalyticsPage";
import TeamUsersPage from "../pages/TeamUsersPage";
import ConfigurationPage from "../pages/ConfigurationPage";
import ScreenshotsPage from "../pages/ScreenshotsPage";
import SessionHealthPage from "../pages/SessionHealthPage";
import AuditLogPage from "../pages/AuditLogPage";
import ReportsPage from "../pages/ReportsPage";
const routeComponents = {
    'Overview': OverviewPage,
    'Attendance': SessionsPage,
    'Breaks': BreaksPage,
    'Break analytics': BreakAnalyticsPage,
    'Activities': ActivitiesPage,
    'Activity analytics': ActivityAnalyticsPage,
    'Team & users': TeamUsersPage,
    'Configuration': ConfigurationPage,
    'Screenshots': ScreenshotsPage,
    'Session health': SessionHealthPage,
    'Audit log': AuditLogPage,
    'Reports & policies': ReportsPage,
};
export default function RouteOutlet({ section, ctx }) {
    const Page = routeComponents[section] || OverviewPage;
    return <Page ctx={ctx}/>;
}
