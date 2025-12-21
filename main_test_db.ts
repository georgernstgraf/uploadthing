// import config from "./config.ts";
import * as history from "./repo/history.ts";

console.log("Recent Events:");
console.log(
  history.getHistoryEventsRange("2025-12-18 14:25", "2025-12-18 16:25"),
);
history.db.close();
