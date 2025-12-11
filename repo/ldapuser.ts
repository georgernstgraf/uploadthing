import cf from "../lib/config.ts";
import { sleep } from "../lib/lib.ts";
import ldap from "ldapjs";
export const serviceClientCarrier = { "client": await getServiceClient() };

export function getUsersStartingWith(
  initial: string,
): Promise<Record<string, string>[]> {
  const filter = `(mail=${initial}*)`;
  const attributes = [
    "mail",
    "displayName",
  ];
  const options = {
    filter,
    scope: "sub",
    attributes: attributes,
  };
  const searchPromise = new Promise((resolve, reject) => {
    try {
      serviceClientCarrier.client.search(
        cf.SEARCH_BASE,
        options,
        (_err: Error, res: ldap.SearchCallbackResponse) => {
          const searchStatus = {
            results: [] as ldap.SearchEntry[],
            searchRequest: [] as ldap.SearchRequest[],
            searchReference: [] as ldap.SearchReference[],
            end: [] as ldap.SearchEnd[],
          };
          res.on("searchRequest", (req: ldap.SearchRequest) => {
            searchStatus.searchRequest.push(req);
          });
          res.on("searchEntry", (entry: ldap.SearchEntry) => {
            searchStatus.results.push(entry);
          });
          res.on("searchReference", (referral: ldap.SearchReference) => {
            searchStatus.searchReference.push(referral);
          });
          res.on("end", (result: ldap.SearchEnd) => {
            searchStatus.end.push(result);
            if (result.status != 0) {
              return reject(
                `LDAP Status ${result.status}, results: ${searchStatus.results.length}`,
              );
            }
            return resolve([
              ...searchStatus.results.map(resultFromResponse),
            ]);
          });
          res.on("error", (error: Error) => {
            const msg = `res.on.error: ${error.message}`;
            console.log(msg);
            return reject(msg);
          });
        },
      );
    } catch (error) {
      console.log(
        `ERROR .. catch serviceClient search: [${(error as Error).message}]`,
      );
      reject((error as Error).message);
    }
  });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error("LDAP Search Timeout - Server unreachable? dead?"));
    }, 7000);
  });
  return Promise.race([searchPromise, timeoutPromise]).catch((err) => {
    if (err.message.includes("Timeout")) {
      console.error("Search timed out. Killing Zombie Client.");
      try {
        serviceClientCarrier.client.emit(
          "error",
          new Error("Force Kill by Timeout"),
        );
      } catch {
        // just try
      }
    }
    throw err; // Fehler weiterwerfen an den Aufrufer
  }) as Promise<
    Record<string, string>[]
  >;
}

function resultFromResponse(response: ldap.Response) {
  const result: Record<string, string> = {};
  response.pojo.attributes.forEach((attr: ldap.Attribute) => {
    result[attr.type] = attr.values.join(", ");
  });
  return result;
}

function getServiceClient(): Promise<ldap.Client> {
  return new Promise((resolve, reject) => {
    let pending = true;
    const client = ldap.createClient({
      url: cf.SERVICE_URL,
      reconnect: true,
      idleTimeout: 1000 * 60 * 15, // 15 minutes
    });
    console.log(
      `INFO created serviceClient (url: ${cf.SERVICE_URL}, idleTimeout: ${
        1000 * 60 * 15
      })`,
    );
    client.on("connect", () => {
      console.log("ldap client_on_connect: now start binding ...");
      client.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
    });
    client.on("reconnect", () => {
      console.log("ldap client_on_reconnect: binding ...");
      client.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
    });
    client.on("error", (err: Error) => {
      console.error(`ldap ERROR client_on_error [${err.message}]`);
    });
    client.on("close", () => {
      console.log("ldap INFO client_on_close");
    });
    client.on("timeout", () => {
      console.log("ldap client_on_timeout");
    });
    client.on("end", () => {
      console.log("ldap client_on_end");
    });
    client.on("idle", () => {
      console.log("ldap client_on_idle: binding ...");
      client.bind(cf.SERVICE_DN, cf.SERVICE_PW, bindCB);
    });
    client.on("destroy", () => {
      console.log("ldap client_on_destroy");
    });
    client.on("unbind", () => {
      console.log("ldap client_on_unbind");
    });
    // Nested Function, need to resolve/reject the outer Promise
    async function bindCB(err: Error | null) {
      let msg = "";
      if (!err) {
        console.log("bindCB: Binding has completed successfully.");
      } else {
        msg = `bindCB: error: ${err.message}`;
        console.error(err);
      }
      if (pending) {
        pending = false; // never resolve/reject more than once
        if (err) {
          return reject(msg);
        }
        return resolve(client);
      } else { // not pending, only return
        if (err) {
          console.error("bindCB: not pending (promise resolved), error:", err);
          try {
            client.unbind(); // Versuch höflich zu sein
          } catch { // just try
          }
          try {
            client.destroy(); // Hard kill des Sockets
          } catch { // just try
          }
          client.removeAllListeners(); // Wichtig: Zombie-Listener entfernen
          console.info("bindCB: detroyed old client, retrying in 20s ...");
          await sleep(20);

          let newClient = null;
          while (!newClient) {
            try {
              newClient = await getServiceClient();
            } catch (e) {
              console.error("Retry failed, waiting another 20s...", e);
              await sleep(20);
            }
          }
          serviceClientCarrier.client = newClient;
          return;
        }
        console.info("bindCB: called, not pending, simply returning.");
        return;
      }
    }
  });
}
