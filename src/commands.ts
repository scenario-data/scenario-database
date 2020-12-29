// tslint:disable:no-console
process.argv[1] = "npm run task"; // Force yargs to print this string (instead of the name of the source file) in the
                                  // autogenerated usage text.
                                  // *** IMPORTANT *** : must be before the import of yargs.

import * as gulp from "gulp";
import * as yargs from "yargs";
import { red, green } from "chalk";

import buildTasks from "./tasks/build";
import testTasks, { defaultTestSpec } from "./tasks/test";

const start = (task: string, background?: boolean) => {
    const taskDef = gulp.task(task);
    if (!taskDef) { throw new Error(`Unknown task: ${ task }`); }

    const startTs = Date.now();

    gulp.on("error", err => {
        console.log(red("Failed task %s due to %s"), task, err instanceof Error ? err.stack : JSON.stringify(err, null, 4));
        process.exit(1); // Return a non-zero exit code
    });

    taskDef(err => {
        console.log("\n");

        if (err) {
            console.log(red("Failed task %s"), task);
            process.exit(1); // Return a non-zero exit code
        } else {
            const doneQualifier = background ? "Started" : "Finished task";
            console.log(green("%s %s in %ds"), doneQualifier, task, (Date.now() - startTs) / 1000);
            if (!background) {
                process.exit(0);
            }
        }
    });
};


yargs
    .command(
        "test", "Run all tests", {},
        () => {
            buildTasks();
            testTasks({});

            start("all_tests");
        }
    )

    .command("typecheck", "Check types in the project", {}, () => {
        buildTasks();
        start("typecheck");
    })

    .command(
        "mocha [spec]", "Run mocha tests",
        (_yargs: typeof yargs) => {
            return _yargs
                .positional("spec", {
                    describe: "Spec to run",
                    type: "string",
                    default: defaultTestSpec,
                })
                .option("noCoverage", {
                    description: "No code coverage summary",
                    type: "boolean",
                    default: false,
                })
                .option("bail", {
                    description: "Stop after first test failure",
                    type: "boolean",
                    default: false,
                })
                .option("debug", {
                    description: "Run inspector and wait for debugger to connect",
                    type: "boolean",
                    default: false,
                });
        },
        argv => {
            buildTasks();
            testTasks({
                testSpec: argv.spec,
                noCoverage: argv.noCoverage,
                bail: argv.bail,
                debugMocha: argv.debug,
            });

            start("mocha_tests");
        }
    )

    .demandCommand(1, "Please specify command").strict()
    .version(false)
    .parse();
