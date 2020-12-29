// tslint:disable:no-console

import { spawn } from "child_process";
import { Readable } from "stream";
import { red, green } from "chalk";
import * as EE from "events";
import * as supportsColor from "supports-color";
import { TaskFunction } from "gulp";
import { Done } from "./done";

type Consume = (cb: (b: Buffer) => void, force?: boolean) => void;
export const buffer = (...streams: Readable[]): Consume => {
    let streamsEnded = 0;
    const bufs: Buffer[] = [];
    let resultingBuffer: Buffer;

    type BufferHandler = (b: Buffer) => void;
    let _cb: BufferHandler = () => void 0;

    const dataListeners = new Map<Readable, (d: Buffer) => void>();
    const endListeners = new Map<Readable, () => void>();
    streams.forEach(stream => {
        const dataListener = (d: Buffer) => bufs.push(d);
        dataListeners.set(stream, dataListener);
        stream.on("data", dataListener);

        const endListener = () => {
            streamsEnded += 1;
            if (streamsEnded === streams.length) {
                resultingBuffer = Buffer.concat(bufs);
                _cb(resultingBuffer);
            }
        };
        endListeners.set(stream, endListener);
        stream.on("end", endListener);
    });

    let consumed = false;
    return (cb: (b: Buffer) => void, force = false) => {
        if (consumed) { return; }
        consumed = true;

        if (resultingBuffer) {
            cb(resultingBuffer);
        } else if (force) {
            streams.forEach(stream => {
                stream.removeListener("data", dataListeners.get(stream)!);
                stream.removeListener("end", endListeners.get(stream)!);
            });

            cb(Buffer.concat(bufs));
        } else {
            _cb = cb;
        }
    };
};

// `nyc` uses 'supports-color' module to detect if color should be shown.
// We lose that info, so manually detecting that and forwarding is a good option.
const chalkForceColorEnv = supportsColor.stdout ? { FORCE_COLOR: true } : {};

const execEvents = new EE.EventEmitter().setMaxListeners(0);
process.setMaxListeners(0);

interface ExecOptions {
    env?: object;
    background?: boolean | ((stdout: Readable, stderr: Readable, started: Done) => void);
}

export const execTask = (command: string, options: ExecOptions = {}): TaskFunction => cb => {
    const cmd = command.replace(/\s+/g, " ").trim();
    const [executable, ...args] = cmd.split(" ");
    if (!executable) { throw new Error("No executable given"); }

    console.log("\nRunning", cmd);
    const start = Date.now();
    const combinedEnv = Object.assign({}, process.env, options.env || {}, chalkForceColorEnv);
    const spawned = spawn(executable, args, { shell: true, detached: true, stdio: "pipe", cwd: process.cwd(), env: combinedEnv });

    const consume = buffer(spawned.stdout, spawned.stderr);

    // Output heartbeat message every minute so that CI doesn't hang up.
    const heartbeatInterval = setInterval(
        () => console.log("\nStill running %s for %dm", cmd, Math.round((Date.now() - start) / 60000)),
        60000
    );

    let exitTimer: any;

    let isKilled = false;
    const kill = () => {
        isKilled = true;
        try {
            process.kill(-spawned.pid, "SIGTERM");
            process.kill(-spawned.pid, "SIGKILL");
            spawned.kill();
        } catch (e) { /* ignored on purpose */ }

        clearInterval(heartbeatInterval);
        clearTimeout(exitTimer);

        // Write the output of the dying process
        consume(buf => process.stdout.write(buf), true);
    };
    execEvents.on("kill", kill);
    [{ sig: "SIGTERM", number: 15 }, { sig: "SIGINT", number: 2 }].forEach(sig => {
        process.on(sig.sig as any, () => {
            kill();

            // Listening to signals removes default handling, so exiting manually.
            process.exit(128 + sig.number);
        });
    });

    process.on("exit", kill);
    const exitCB = (err: any, forceLog: boolean) => {
        if (isKilled) { return; }
        isKilled = true;

        clearInterval(heartbeatInterval);
        clearTimeout(exitTimer);

        execEvents.removeListener("kill", kill);

        if (err) {
            // Kill every spawned process if in CI and one of the executed commands fails
            execEvents.emit("kill");
        }

        consume(output => {
            console.log("\n");
            process.stdout.write(output); // Own output after any killed process
            if (err) {
                console.log(red("Failed with code %s: %s"), err, cmd);
            } else {
                const doneQualifier = options.background ? "Started" : "Finished";
                console.log(green("%s in %ds: %s"), doneQualifier, (Date.now() - start) / 1000, cmd);
            }

            cb(err);
        }, forceLog);
    };

    if (options.background) {
        const backgroundFinished: Done = err => {
            spawned.stdout.pipe(process.stdout);
            spawned.stderr.pipe(process.stderr);

            exitCB(err, true);
        };

        if (typeof options.background === "boolean") { backgroundFinished(); }
        else { options.background(spawned.stdout, spawned.stderr, backgroundFinished); }
    }

    spawned.on("close", (code, sig) => exitCB(code || sig || undefined, false));
    spawned.on("exit", (code, sig) => {
        exitTimer = setTimeout(() => exitCB(code || sig || undefined, false), 1000);
    });
};
