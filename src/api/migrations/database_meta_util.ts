import { QueryRunner } from "../query_runner/query_runner_api";
import { refColumnName } from "./execute_migrations";


export async function tableExists(queryRunner: QueryRunner, table: string) {
    const res = await queryRunner.query(`SELECT * FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND "table_name" = $1`, [table]);
    return res.rows.length > 0;
}

export async function columnExists(queryRunner: QueryRunner, table: string, column: string) {
    const res = await queryRunner.query(`SELECT * FROM "information_schema"."columns" WHERE "table_schema" = 'public' AND "table_name" = $1 AND "column_name" = $2`, [table, column]);
    return res.rows.length > 0;
}

export async function columnDataType(queryRunner: QueryRunner, table: string, column: string) {
    const res = await queryRunner.query(`SELECT * FROM "information_schema"."columns" WHERE "table_schema" = 'public' AND "table_name" = $1 AND "column_name" = $2`, [table, column]);
    const item = res.rows[0];

    /* istanbul ignore if *//* not relevant for coverage */
    if (!item) { throw new Error(`Either table "${ table }" does not exists, or column "${ column }" is not defined on it`); }

    return item.data_type;
}

export async function findColumnsContainingString(queryRunner: QueryRunner, str: string): Promise<{ table_name: string, column_name: string }[]> {
    const res = await queryRunner.query(`SELECT "table_name", "column_name" FROM "information_schema"."columns" WHERE "table_schema" = 'public' and "column_name" LIKE $1`, [`%${ str }%`]);
    return res.rows.map(r => ({
        table_name: r.table_name,
        column_name: r.column_name,
    }));
}

export async function findReferenceColumn(queryRunner: QueryRunner, table: string, propName: string): Promise<string | null> {
    const res = await queryRunner.query(`SELECT "column_name" FROM "information_schema"."columns" WHERE "table_schema" = 'public' AND "table_name" = $1 AND "column_name" LIKE $2`, [table, `${ refColumnName(propName, "%") }`]);
    return res.rows.length > 0 ? res.rows[0]!.column_name : null;
}
