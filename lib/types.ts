// Hier keine Template Types, bitte!

export type Variables = {
    remoteip: string;
    remoteuser: UserType | null;
};

export type Bindings = {
    info: Deno.ServeHandlerInfo;
};

export type TopType = {
    remote_ip: string;
    remote_user: UserType | null;
    page_title: string;
};

export type ForensicIPCount = {
    ip: string;
    count: number; // wie oft
    lastseen: string; // wann zuletzt
    lastseen_epoch?: number;
    is_stale?: boolean;
};
// key: IP
export type IPHistoryRecord = {
    name: string;
    at: string;
};
// key: email
export type UserHistoryRecord = {
    ip: string;
    at: string;
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
