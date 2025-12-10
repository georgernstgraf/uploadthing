// import config from "./config.ts";
import * as service from "./service/service.ts";

console.log(service.user.getbyip("127.0.0.1"));
console.log(service.user.getbyip("127.0.0.2"));
service.closedb();
service.closeldap();
