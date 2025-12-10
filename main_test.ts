// import config from "./config.ts";
import * as service from "./service/service.ts";

console.log("Testing LDAP user fetch...");
const users = await service.ldap.getUserByEmail("gra");
console.log("users:", users);
service.ldap.serviceClient.unbind();
