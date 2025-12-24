import config from "./config.ts";
export async function get_unterlagen() {
  const files: string[] = [];
  for await (const dirEntry of Deno.readDir(config.UNTERLAGEN_DIR)) {
    if (!dirEntry.name.startsWith(".")) {
      files.push(dirEntry.name);
    }
  }
  files.sort();
  return files;
}
export type Variables = {
  remoteip: string;
  remoteuser: UserType | null;
};
export type ForensicIPCount = {
  ip: string;
  count: number;
};
export type UserType = {
  ip?: string;
  name: string;
  email: string;
  klasse: string;
};
export type LdapUserType = {
  displayName: string;
  mail: string;
  physicalDeliveryOfficeName: string; // Klasse
};
export function sleep(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}
export function nowString(date?: Date): string {
  const mydate = date ? date : new Date();
  return mydate.toLocaleTimeString("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // Use 24-hour format
  });
}
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function localTimeString(date: Date): string {
  return dateFormatter.format(date).replace(",", "");
}
