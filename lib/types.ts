// Hier keine Template Types, bitte!

import type { Session } from "../middleware/session.ts";

export type HonoContextVars = {
    remoteip: string;
    remoteuser: UserType | null;
    session: Session;
    is_admin: boolean;
};

export type Bindings = {
    info: Deno.ServeHandlerInfo;
};

export type TopType = {
    remote_ip: string;
    remote_user: UserType | null;
    page_title: string;
    is_admin: boolean;
};

export type ForensicIPCount = {
    ip: string;
    count: number; // wie oft
    lastseen: string; // wann zuletzt
    lastseen_epoch?: number;
    is_stale?: boolean;
};

export type UserType = {
    id?: number;
    name: string;
    email: string;
    klasse?: string;
};
export type LdapUserType = {
    displayName: string;
    mail: string;
    physicalDeliveryOfficeName: string; // Klasse
};
