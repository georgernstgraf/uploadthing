// import config from "./config.ts";
import * as history from "./repo/history.ts";

console.log("Recent Events:");
console.log(
  history.getHistoryEventsRange("2025-12-18 14:25", "2025-12-18 16:25"),
);
console.log("Stats from seen:");
import * as ip from "./repo/ip.ts";
console.log(
  ip.seenStatsForRange("2025-12-18 14:25", "2025-12-18 16:25"),
);

// Close the databases
history.db.close();
