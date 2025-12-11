import { db } from "./db.ts";

const insertPrep = db.prepare("INSERT INTO knownlog (file) VALUES (?)");
const findByNamePrep = db.prepare(
  "SELECT count() AS count FROM knownlog WHERE file = ?",
);

export function add(file: string) {
  insertPrep.run(file);
}

export function findByName(name: string): boolean {
  const row = findByNamePrep.get(name) as { count: number } | undefined;
  const count = row?.count ?? 0;
  return count > 0;
}

export function deleteAll() {
  db.exec("DELETE FROM knownlog");
}
