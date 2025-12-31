// just re-export all repo functions
import db from "./db.ts";
import * as ipfact from "./ipfact.ts";
import * as user from "./user.ts";
import * as ldap from "./ldapuser.ts";
import * as history from "./history.ts";

export { db, history, ipfact, ldap, user };
