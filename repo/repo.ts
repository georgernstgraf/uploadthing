// just re-export all repo functions
import db from "./db.ts";
import * as ipfact from "./ipfact.ts";
import * as user from "./user.ts";
import * as knownlog from "./knownlog.ts";
import * as ldap from "./ldapuser.ts";

export { db, ipfact, knownlog, ldap, user };
