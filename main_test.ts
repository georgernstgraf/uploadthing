// import config from "./config.ts";
import * as ldap from "./service/ldapuser.ts";
import { sleep } from "./lib/timefunc.ts";
console.log("Testing LDAP user fetch...");
await sleep(.5);
const users = await ldap.searchUserByEmailStart("grafg");
console.log("users:", users);
ldap.close();
