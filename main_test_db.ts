// import config from "./config.ts";
import * as user from "./service/user.ts";
import * as db from "./service/db.ts";

console.log(user.getbyip("127.0.0.1"));
console.log(user.getbyip("1.2.3.4"));
db.close();
