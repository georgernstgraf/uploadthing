import cf from "../lib/config.ts";
import ldap from "ldapjs";
export const serviceClient = await getServiceClient();

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
  return new Promise((resolve, reject) => {
    try {
      serviceClient.search(
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
      return [(error as Error).message];
    }
  });
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
    function bindCB(err: Error | null) {
      if (!pending) {
        console.warn("ldap bindCB called but not pending, ignoring ...");
        return;
      }
      pending = false;
      if (!err) {
        console.log("ldap Binding has completed w/o Errors");
        return resolve(client);
      } else {
        const msg = `ldap error: ${err.message}`;
        console.error(msg);
        return reject(msg);
      }
    }
  });
}
