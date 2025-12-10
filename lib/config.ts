const config = {
  ABGABEN_DIR: `${Deno.env.get("HOME")}/abgaben`,
  UNTERLAGEN_DIR: `${Deno.env.get("HOME")}/unterlagen`,
  LISTEN_HOST: Deno.env.get("LISTEN_HOST"),
  LISTEN_PORT: Number(Deno.env.get("LISTEN_PORT")),
  SERVICE_DN: Deno.env.get("SERVICE_DN")!,
  SERVICE_PW: Deno.env.get("SERVICE_PW")!,
  SERVICE_URL: Deno.env.get("SERVICE_URL")!,
  SEARCH_BASE: Deno.env.get("SEARCH_BASE")!,
  logdir: "/var/log/exampy",
};
export default config;

for (const [key, value] of Object.entries(config)) {
  console.log(`config: ${key}: ${value}`);
}
