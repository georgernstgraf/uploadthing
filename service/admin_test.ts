import { assertEquals } from "@std/assert";
import config from "../lib/config.ts";
import { getExamModeCommandArg, setInternetActive } from "./admin.ts";

Deno.test("getExamModeCommandArg maps internet state to script arg", () => {
    assertEquals(getExamModeCommandArg(true), "off");
    assertEquals(getExamModeCommandArg(false), "on");
});

Deno.test("setInternetActive updates runtime state on success", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = false;

        const result = await setInternetActive(true, (command, args) => {
            assertEquals(command, "exammode");
            assertEquals(args, ["off"]);
            return Promise.resolve({
                code: 0,
                stdout: "internet enabled",
                stderr: "",
            });
        });

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, true);
        assertEquals(config.INTERNET_ACTIVE, true);
        assertEquals(result.stdout, "internet enabled");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});

Deno.test("setInternetActive keeps previous state on failure", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = true;

        const result = await setInternetActive(false, () => {
            return Promise.resolve({
                code: 0,
                stdout: "internet disabled",
                stderr: "",
            });
        });

        assertEquals(result.ok, true);
        assertEquals(result.internet_active, false);
        assertEquals(config.INTERNET_ACTIVE, false);
        assertEquals(result.stdout, "internet disabled");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});

Deno.test("setInternetActive keeps previous state on failure", async () => {
    const originalCommand = config.EXAMMODE_COMMAND;
    const originalInternetState = config.INTERNET_ACTIVE;

    try {
        config.EXAMMODE_COMMAND = "exammode";
        config.INTERNET_ACTIVE = true;

        const result = await setInternetActive(false, () => {
            return Promise.resolve({ code: 7, stdout: "", stderr: "ssh failed" });
        });

        assertEquals(result.ok, false);
        assertEquals(result.internet_active, true);
        assertEquals(config.INTERNET_ACTIVE, true);
        assertEquals(result.stderr, "ssh failed");
    } finally {
        config.EXAMMODE_COMMAND = originalCommand;
        config.INTERNET_ACTIVE = originalInternetState;
    }
});
