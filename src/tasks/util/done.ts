import { TaskFunction } from "gulp";

export type Done = TaskFunction extends (...args: [infer doneArg]) => any ? doneArg : never;
