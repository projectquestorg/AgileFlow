// Legacy exports (for backwards compatibility)
export { AutomationsList } from "./AutomationsList";
export { InboxList } from "./InboxList";
export { SessionsList, type Session, type SessionType, type SessionStatus } from "./SessionsList";
export { SkillsBrowser, type Skill } from "./SkillsBrowser";

// New shadcn-style nav components
export { AppSidebar } from "./AppSidebar";
export { NavSessions, type Session as NavSession } from "./NavSessions";
export { NavAutomations, type Automation } from "./NavAutomations";
export { NavInbox, type InboxItem } from "./NavInbox";
export { NavStatus } from "./NavStatus";
export { UserMenu } from "./UserMenu";
export { ProjectSelector } from "./ProjectSelector";
