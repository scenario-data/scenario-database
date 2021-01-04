import { QueryRunner } from "./query_runner_api";


declare function noop(val: any): void;
declare const conn: QueryRunner;
const query = conn.query;

noop(query("no placeholders"));

// @ts-expect-error — no placeholders in query, but param given
noop(query("no placeholders", []));

noop(query("$1", ["str"]));
noop(query(`SELECT * from "public"."some_table" where id = $1`, [1]));
noop(query(`SELECT * from "public"."some_table" where id = $1 or id = $1`, [1]));
noop(query(`SELECT * from "public"."some_table" where id = $1 and prop = $2`, [1, "whatever"]));

// @ts-expect-error — not enough params given
noop(query(`SELECT * from "public"."some_table" where id = $1 and prop = $2`, [1]));

noop(query("whatever" as string));
noop(query("whatever" as string, ["whop"])); // Should allow params when can't infer literal
