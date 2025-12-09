import db from "./db.ts";
console.log(db.prepare("SELECT * FROM ipfact").all());
db.close();
