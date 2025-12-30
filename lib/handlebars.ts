import Handlebars from "handlebars";
import { UserType } from "./lib.ts";
import { ForensicIPCount } from "./lib.ts";
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
    foundips: ForensicIPCount[];
    spg_times: string[];
    starttime: string;
    endtime: string;
    startdate: string;
    enddate: string;
    ip2users: Map<string, string>;
};

Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
});

Handlebars.registerHelper("get", function (map, key) {
    return map.get(key);
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
