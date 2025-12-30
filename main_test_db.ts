// import config from "./config.ts";
import * as history from "./repo/history.ts";
import db from "./repo/db.ts";

const start = "2025-12-22 14:15";
const end = "2025-12-22 14:20";
console.log("Recent Events:");
console.log(
    history.getHistoryEventsRange(start, end),
);
console.log("Stats from seen:");
import * as ip from "./repo/ipfact.ts";
console.log(
    ip.seenStatsForRange(start, end),
);

// Close the databases
db.close();
