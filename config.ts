const config = {
  ABGABEN_DIR: `${Deno.env.get("HOME")}/abgaben`,
  UNTERLAGEN_DIR: `${Deno.env.get("HOME")}/unterlagen`,
  LISTEN_HOST: Deno.env.get("LISTEN_HOST"),
  LISTEN_PORT: Number(Deno.env.get("LISTEN_PORT")),
};
export default config;

for (const [key, value] of Object.entries(config)) {
  console.log(`config: ${key}: ${value}`);
}
