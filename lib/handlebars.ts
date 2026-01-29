import Handlebars from "handlebars";
import { UserType, TopType } from "./types.ts";
import type { ServiceIpForensics } from "../service/ipforensics.ts";

// Hier nur Template Types, bitte!

// --- 2. Template Data Type Definitions ---

type DirIndexTemplateData = TopType & {
    files: string[];
    unterlagen_dir: string;
};

type UploadTemplateData = TopType;

type SuccessTemplateData = TopType & {
    filename: string;
    filesize: string;
    md5sum: string;
    duration_seconds: string;
};

type WhoamiTemplateData = TopType;

type LdapTemplateData = {
    users: UserType[];
};

type ForensicTemplateData = TopType & {
    remote_user: UserType;
    spg_times: string[];
    starttime: string;
    endtime: string;
    startdate: string;
    enddate: string;
    ips_with_name: ServiceIpForensics[];
    ips_without_name: ServiceIpForensics[];
    withinTimeCutoff: boolean;
    endtimeInFuture: boolean;
    endtimeProvided: boolean;
    forensic_refresh_seconds: number;
};

// --- 3. Handlebars Helpers ---

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

// --- 4. Handlebars Partials ---

Handlebars.registerPartial(
    "top",
    Deno.readTextFileSync("templates/top.hbs"),
);
Handlebars.registerPartial(
    "forensic-report",
    Deno.readTextFileSync("templates/forensic-report.hbs"),
);

// --- 5. Handlebars Compiled Templates (Exports) ---

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
export const forensicTemplate = Handlebars.compile<ForensicTemplateData>(
    Deno.readTextFileSync("templates/forensic.hbs"),
);
export const forensicReportTemplate = Handlebars.compile<ForensicTemplateData>(
    Deno.readTextFileSync("templates/forensic-report.hbs"),
);
