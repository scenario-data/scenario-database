import { Readable } from "stream";
import { Done } from "./done";

type TriggerFn = (log: string) => boolean;
export const detectLog = (stream: Readable, trigger: string | RegExp | TriggerFn, done: Done) => {
    const bufs: Buffer[] = [];
    const hasTriggered = () => {
        const log = Buffer.concat(bufs).toString("utf8");
        if (typeof trigger === "function") { return trigger(log); }
        return typeof trigger === "string" ? log.indexOf(trigger) !== -1 : trigger.test(log);
    };

    let finished = false;
    const timedOut = setTimeout(() => {
        if (!finished) {
            done(new Error(`Timed out for trigger: ${ trigger }`));
        }
    }, 59000);

    const finish: Done = err => {
        if (finished) { return; }
        finished = true;

        clearTimeout(timedOut);

        return done(err);
    };

    stream.on("data", (d: Buffer) => {
        bufs.push(d);
        if (hasTriggered()) {
            finish();
        }
    });

    stream.on("error", finish);
    stream.on("end", () => {
        if (!hasTriggered()) {
            finish(new Error(`Trigger not found: ${ trigger }`));
        } else {
            finish();
        }
    });
};
