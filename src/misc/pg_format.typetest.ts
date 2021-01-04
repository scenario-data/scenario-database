import { PgFormat } from "./pg_format";

declare function noop(val: any): void;
declare const format: PgFormat;


noop(format(
    // @ts-expect-error — no placeholders in given literal
    "no placeholders",
    []
));

noop(format(`ALTER TABLE "public".%I ADD CONSTRAINT %I FOREIGN KEY ("branch") REFERENCES "public"."branch"("id")`, ["a", "b"]));

noop(format("%I", ["str"]));
noop(format(`SELECT * from "public".%I`, ["some_table"]));


noop(format(
    `SELECT * from "public".%I where prop = %L`,
    // @ts-expect-error — not enough params given
    ["some_table"]
));


noop(format(
    `SELECT * from "public".%I where prop = %L`,
    // @ts-expect-error — too many params given
    ["some_table", "some_prop", "unnecessary_param"]
));

// Should handle params when can't infer literal
noop(format("whatever" as string, []));
noop(format("whatever" as string, ["whop"]));
