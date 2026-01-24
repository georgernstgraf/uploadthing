// just re-export all repo functions
import db from "./db.ts";
import prismadb from "./prismadb.ts";
import * as ipfact from "./ipfact.ts";
import * as user from "./user.ts";
import * as ldap from "./ldapuser.ts";
import * as history from "./history.ts";
import * as ldapusercache from "./ldapusercache.ts";

export { db, history, ipfact, ldap, ldapusercache, prismadb, user };
