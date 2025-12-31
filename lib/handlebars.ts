import Handlebars from "handlebars";
import {
    ForensicIPCount,
    IPHistoryRecord,
    UserHistoryRecord,
    UserType,
} from "./types.ts";

// Hier nur Template Types, bitte!

type TopType = {
    remote_ip: string;
    remote_user: UserType | null;
};
const dirIndexTemplate_untyped = Handlebars.compile(
    Deno.readTextFileSync("templates/dirindex.hbs"),
);
const uploadTemplate_untyped = Handlebars.compile(
    Deno.readTextFileSync("templates/upload.hbs"),
);
const successTemplate_untyped = Handlebars.compile(
    Deno.readTextFileSync("templates/success.hbs"),
);
const ldapTemplate_untyped = Handlebars.compile(
    Deno.readTextFileSync("templates/ldap.hbs"),
);
const whoamiTemplate_untyped = Handlebars.compile(
    Deno.readTextFileSync("templates/whoami.hbs"),
);

type ForensicTemplateData = {
    remote_ip: string;
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
};

Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
});

Handlebars.registerHelper("get", function (map, key) {
    return map.get(key);
});
Handlebars.registerHelper("let", function (value, options) {
    return options.fn(value, {
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

export const dirIndexTemplate =
    dirIndexTemplate_untyped as Handlebars.TemplateDelegate;
export const uploadTemplate =
    uploadTemplate_untyped as Handlebars.TemplateDelegate;
export const successTemplate =
    successTemplate_untyped as Handlebars.TemplateDelegate;
export const ldapTemplate = ldapTemplate_untyped as Handlebars.TemplateDelegate;
export const whoamiTemplate =
    whoamiTemplate_untyped as Handlebars.TemplateDelegate;
