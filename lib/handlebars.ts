import Handlebars from "handlebars";
import {
    ForensicIPCount,
    IPHistoryRecord,
    UserHistoryRecord,
    UserType,
    TopType,
} from "./types.ts";

// Hier nur Template Types, bitte!

type DirIndexTemplateData = TopType & {
    files: string[];
    UNTERLAGEN_DIR: string;
};

type UploadTemplateData = TopType;

type SuccessTemplateData = TopType & {
    filename: string;
    filesize: string;
    md5sum: string;
    durationSeconds: string;
};

type WhoamiTemplateData = TopType;

type LdapTemplateData = {
    users: UserType[];
};
export const dirIndexTemplate = Handlebars.compile<DirIndexTemplateData>(
    Deno.readTextFileSync("templates/dirindex.hbs"),
);
export const uploadTemplate = Handlebars.compile<UploadTemplateData>(
    Deno.readTextFileSync("templates/upload.hbs"),
);
export const successTemplate = Handlebars.compile<SuccessTemplateData>(
    Deno.readTextFileSync("templates/success.hbs"),
);
export const ldapTemplate = Handlebars.compile<LdapTemplateData>(
    Deno.readTextFileSync("templates/ldap.hbs"),
);
export const whoamiTemplate = Handlebars.compile<WhoamiTemplateData>(
    Deno.readTextFileSync("templates/whoami.hbs"),
);

type ForensicTemplateData = TopType & {
    remote_user: UserType;
    forensic_ipcount_array: ForensicIPCount[];
    spg_times: string[];
    starttime: string;
    endtime: string;
    startdate: string;
    enddate: string;
    ip2users: Map<string, UserType>;
    ip_history: Map<string, IPHistoryRecord[]>;
    user_history: Map<string, UserHistoryRecord[]>;
    // New properties for the two tables
    ips_with_name: ForensicIPCount[];
    ips_without_name: ForensicIPCount[];
    within12hours: boolean;
};

Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
});

Handlebars.registerHelper("get", function (map, key) {
    if (!map) return undefined;
    return map.get(key);
});

// Extract first letter of given name (after first blank in displayname)
// e.g., "Breuss Moritz Peter" → "M", "Indra Daniel Paul Philipp" → "D"
Handlebars.registerHelper("givenNameInitial", function (name: string) {
    if (!name || typeof name !== "string") return "?";
    const firstSpace = name.indexOf(" ");
    if (firstSpace === -1 || firstSpace >= name.length - 1) {
        // No space or space is at the end, use first character
        return name.charAt(0).toUpperCase();
    }
    return name.charAt(firstSpace + 1).toUpperCase();
});

// deno-lint-ignore no-explicit-any
Handlebars.registerHelper("let", function (this: any, value, options) {
    return options.fn(this, {
        data: options.data,
        blockParams: [value],
    });
});
Handlebars.registerPartial(
    "top",
    Deno.readTextFileSync("templates/top.hbs"),
);
export const forensicTemplate = Handlebars.compile<ForensicTemplateData>(
    Deno.readTextFileSync("templates/forensic.hbs"),
);
