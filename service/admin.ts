import * as repo from "../repo/repo.ts";
import config from "../lib/config.ts";

export type ExamModeResult = {
    code: number;
    stdout: string;
    stderr: string;
    command_arg: "on" | "off";
    internet_active: boolean;
    ok: boolean;
};

export type ExamModeRunnerResult = {
    code: number;
    stdout: string;
    stderr: string;
};

export type ExamModeRunner = (
    command: string,
    args: string[],
) => Promise<ExamModeRunnerResult>;

export function getExamModeCommandArg(internet_active: boolean): "on" | "off" {
    return internet_active ? "off" : "on";
}

async function defaultExamModeRunner(
    command: string,
    args: string[],
): Promise<ExamModeRunnerResult> {
    const output = await new Deno.Command(command, {
        args,
        stdout: "piped",
        stderr: "piped",
    }).output();

    return {
        code: output.code,
        stdout: new TextDecoder().decode(output.stdout).trim(),
        stderr: new TextDecoder().decode(output.stderr).trim(),
    };
}

export async function setInternetActive(
    internet_active: boolean,
    runner: ExamModeRunner = defaultExamModeRunner,
): Promise<ExamModeResult> {
    const command_arg = getExamModeCommandArg(internet_active);
    const result = await runner(config.EXAMMODE_COMMAND, [command_arg]);
    const ok = result.code === 0;

    if (ok) {
        config.INTERNET_ACTIVE = internet_active;
    }

    return {
        ...result,
        command_arg,
        internet_active: config.INTERNET_ACTIVE,
        ok,
    };
}

export function createDatabaseBackup(destinationPath: string): void {
    try {
        Deno.removeSync(destinationPath);
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
            console.error("Error removing old vacuum.db:", e);
        }
    }

    repo.vacuumInto(destinationPath);
}

export function wipeAbgabenDirectory(dirPath: string): void {
    try {
        for (const dirEntry of Deno.readDirSync(dirPath)) {
            Deno.removeSync(`${dirPath}/${dirEntry.name}`, { recursive: true });
        }
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            Deno.mkdirSync(dirPath, { recursive: true });
        } else {
            console.error(`Error wiping directory ${dirPath}:`, e);
            throw e;
        }
    }
}
