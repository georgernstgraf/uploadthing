// Hier keine Template Types, bitte!

export type Variables = {
    remoteip: string;
    remoteuser: UserType | null;
};

export type Bindings = {
    info: Deno.ServeHandlerInfo;
};

export type ForensicIPCount = {
    ip: string;
    count: number;
    lastseen: string;
};

export type IPHistoryRecord = {
    ip: string;
    name: string;
    at: string;
};

export type UserType = {
    ip?: string;
    name: string;
    email: string;
    klasse: string;
};
export type LdapUserType = {
    displayName: string;
    mail: string;
    physicalDeliveryOfficeName: string; // Klasse
};
