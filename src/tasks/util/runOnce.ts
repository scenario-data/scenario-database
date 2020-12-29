import { TaskFunction } from "gulp";
import { Done } from "./done";

const undefinedDoneRes = {}; // We don't know what the result type is, so use ref check on an object
export const runOnce = (fn: TaskFunction): TaskFunction => {
    let pending = false;
    let doneRes: any = undefinedDoneRes;
    let returnRes: any;
    let pendingCalls: Done[] = [];
    return done => {
        if (doneRes !== undefinedDoneRes) {
            done(doneRes);
            return returnRes;
        }

        if (pending) {
            pendingCalls.push(done);
            return returnRes;
        }

        pending = true;
        returnRes = fn(err => {
            doneRes = err;
            done(doneRes);

            pendingCalls.forEach(d => d(doneRes));
            pendingCalls = [];
        });

        return returnRes;
    };
};
