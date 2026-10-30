import { db, vacuumInto } from "./db.ts";
import * as ipfact from "./ipfact.ts";
import * as registrations from "./registrations.ts";
import * as cookiepresents from "./cookiepresents.ts";
import * as users from "./users.ts";
import * as abgaben from "./abgaben.ts";
import * as exam from "./exam.ts";
import * as ldap from "./ldapuser.ts";
import * as adminmac from "./adminmac.ts";

export {
    db,
    vacuumInto,
    ipfact,
    ldap,
    registrations,
    cookiepresents,
    users,
    abgaben,
    exam,
    adminmac,
};
