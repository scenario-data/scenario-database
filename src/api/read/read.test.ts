import expect = require("expect.js");

import { Any } from "ts-toolbelt";
import { QueryRunner } from "../query_runner/query_runner_api";
import { executeMigrations, prepare, refColumnName } from "../migrations/execute_migrations";
import { entity, EntityDef, EntityRestriction, Id, isId } from "../../definition/entity";
import { createRead } from "./read";
import { BranchId, isVersionId, masterBranchId } from "../../temporal";
import { LocalDate, LocalDateTime } from "js-joda";
import { isUserId, rootUserId, UserId } from "../../user";
import { pgFormat } from "../../misc/pg_format";
import { getQueryRunner } from "../query_runner/query_runner";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { FetchNode } from "../fetch_types/fetch_node";
import { NoExtraProperties } from "../../misc/no_extra_properties";
import { FetchResponse } from "../fetch_types/fetch_response";
import { path, Path } from "../../misc/tspath";
import {
    atLeastOne,
    isLocalDateTime,
    isNotNull,
    isUndefined,
    nevah,
    nullableGuard,
    objectKeys
} from "../../misc/typeguards";
import {
    DataPrimitive,
    getPrimitiveComparator,
    getPrimitiveGuard,
    isDataPrimitive,
    primitiveBool,
    primitiveBranch,
    primitiveBuffer,
    primitiveEnum,
    primitiveFloat,
    primitiveInt,
    primitiveLocalDate,
    primitiveLocalDateTime,
    primitiveMoney,
    primitiveString,
    primitiveUser,
    PrimitiveValue,
    primitiveVersion
} from "../../definition/primitives";
import { hasMany, HasOne, hasOne, hasOneInverse, isDataReference } from "../../definition/references";
import { isPlainObject } from "lodash";
import { generateMigrations } from "../migrations/generate_migrations";
import { getUniverseElementName, UniverseElement, UniverseRestriction } from "../universe";
import { createBranching } from "../branch/branch";
import { serializeBranchId, serializeId, serializePrimitive, serializeUserId } from "../db_values/serialize";
import { KeysHaving } from "../../misc/misc";
import { nullableComparator } from "../../misc/comparisons";
import { hydrateId, hydrateVersionId } from "../db_values/hydrate";
import { expectToFail } from "../../misc/test_util";
import { stub } from "sinon";
import { ReadRequest } from "./read_api";
import { migrate } from "../migrations/migrations_builder";

const builtIns: { [P in keyof FetchResponse<{}, {}>]: ((val: unknown) => val is FetchResponse<{}, {}>[P]) } = {
    id: isId,
    at: isVersionId,
    by: isUserId,
    ts: isLocalDateTime,
};

function _checkFetchResponse<
    Entity extends EntityRestriction<Entity>,
    References extends FetchNode<Entity>
>(
    Etty: EntityDef<Entity>,
    references: Any.Cast<References, NoExtraProperties<FetchNode<Entity>, References>>,
    value: FetchResponse<Entity, References>,
    pathSoFar: Path<any, any>
): void {
    const typeDef = new Etty();
    const builtinKeys = objectKeys(builtIns);
    const definitionKeys = objectKeys(typeDef);

    // Check built-in properties
    builtinKeys.forEach(prop => {
        if (!(prop in value)) { throw new Error(`Built-in property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }
        if (!builtIns[prop](value[prop])) { throw new Error(`'${ prop }' doesn't match expected type on '${ pathSoFar.toString() }'`); }
    });

    // Check primitives
    definitionKeys.forEach((prop: keyof Entity) => {
        const propDef = typeDef[prop];
        if (!isDataPrimitive(propDef)) { return; }
        if (!(prop in value)) { throw new Error(`Primitive property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }

        const guard = nullableGuard(getPrimitiveGuard(propDef));
        if (!guard((value as any)[prop])) {
            throw new Error(`Primitive property '${ prop }' does not match expected type`);
        }
    });

    // Check relations
    definitionKeys.forEach((prop: keyof Entity) => {
        const propDef = typeDef[prop];
        if (!isDataReference(propDef)) { return; }
        if (!(prop in value)) {
            if (prop in references) { throw new Error(`Requested reference property '${ prop }' is missing on '${ pathSoFar.toString() }'`); }
            return;
        }

        if (!(prop in references)) { throw new Error(`Ref property '${ prop }' wasn't requested, but exists on '${ pathSoFar.toString() }'`); }

        const ref = (value as any)[prop];
        const refPath = pathSoFar[prop]!;

        switch (propDef.reference_type) {
            case "has_one":
            case "has_one_inverse":
                if (ref === null) { return; } // Null value ok on a to-one reference
                if (!isPlainObject(ref)) { throw new Error(`Expected referenced data to be a plain object on: ${ refPath.toString() }`); }
                return _checkFetchResponse(propDef.target(), (references as any)[prop], ref, refPath);

            case "has_many":
                if (!Array.isArray(ref)) { throw new Error(`Expected referenced data to be an array on: ${ refPath.toString() }`); }
                return ref.forEach((item, idx) => _checkFetchResponse(propDef.target(), (references as any)[prop], item, refPath[idx]!));

            default:
                nevah(propDef);
                throw new Error("Unhandled reference type");
        }
    });

    const unknownKeys = objectKeys(value).filter(k => !builtinKeys.includes(k as any) && !definitionKeys.includes(k as any));
    if (unknownKeys.length > 0) { throw new Error(`Value contains unknown keys on ${ pathSoFar.toString() }: ${ unknownKeys.join(", ") }`); }
}

function checkFetchResponse<
    Entity extends EntityRestriction<Entity>,
    References extends FetchNode<Entity>
>(
    Etty: EntityDef<Entity>,
    references: Any.Cast<References, NoExtraProperties<FetchNode<Entity>, References>>,
    value: FetchResponse<Entity, References>
) {
    return _checkFetchResponse<Entity, References>(Etty, references, value, path());
}


interface InsertValue<
    Universe extends UniverseRestriction<Universe>,
    Entity extends UniverseElement<Universe>,
> {
    branch: BranchId;
    user: UserId;
    type: EntityDef<Entity>;
    value: { id?: Id<Entity> } & {
        [P in KeysHaving<DataPrimitive | HasOne<any>, Entity>]?:
        Entity[P] extends DataPrimitive ? PrimitiveValue<Entity[P]>
            : Entity[P] extends HasOne<infer Ref> ? (Ref extends EntityRestriction<Ref> ? Id<Ref> : never)
            : never
    };
}

async function insert<
    Universe extends UniverseRestriction<Universe>,
    Values extends [InsertValue<Universe, UniverseElement<Universe>>, ...InsertValue<Universe, UniverseElement<Universe>>[]]
>(
    qr: QueryRunner,
    universe: Universe,
    values: Values
): Promise<{ [P in keyof Values]: Values[P] extends InsertValue<Universe, infer Entity> ? Id<Entity> : never }> {
    const ids = [];
    for (const item of values) {
        const Type = item.type;
        const tableName = getUniverseElementName(universe, Type);

        const typeDef = new Type();
        const columnValues = objectKeys(item.value).map(prop => {
            const propValue = (item.value as any)[prop];
            if (isUndefined(propValue)) { return null; }
            if (prop === "id") { return { column: "id", value: serializeId(propValue) }; }

            const propDef = typeDef[prop];
            if (isDataPrimitive(propDef)) {
                return {
                    column: prop,
                    value: serializePrimitive(propDef, propValue!),
                };
            }

            const pd = propDef as unknown;
            if (isDataReference(pd)) {
                if (pd.reference_type !== "has_one") { throw new Error("to-one reference expected"); }
                return {
                    column: refColumnName(prop as string, getUniverseElementName(universe, pd.target())),
                    value: propValue !== null ? serializeId(propValue) : null,
                };
            }

            throw new Error(`Unhandled value type: ${ JSON.stringify(propDef) }`);
        }).filter(isNotNull);

        const columnPlaceholders = columnValues.map(() => "%I");
        const valuePlaceholders = columnValues.map(() => "%L");
        const hasValues = columnValues.length > 0;
        const res = await qr.query(pgFormat(
            `INSERT INTO "public".%I ("branch", "by"${ hasValues ? ", " : "" }${ columnPlaceholders.join(", ") })
            VALUES (%L, %L${ hasValues ? ", " : "" }${ valuePlaceholders.join(", ") }) RETURNING "id"`,
            [
                tableName, ...columnValues.map(val => val.column as string),
                serializeBranchId(item.branch), serializeUserId(item.user),
                ...columnValues.map(val => val.value as any),
            ]
        ));

        ids.push(...res.rows.map(r => hydrateId(r.id)));
    }

    return ids as any;
}


describe("Database read", () => {
    let queryRunner: QueryRunner;
    beforeEach(async () => {
        queryRunner = await getQueryRunner("tst-read-api", devDbConnectionConfig, true);
        await queryRunner.startTransaction();
        await prepare(queryRunner);
    });

    afterEach(async () => {
        if (!queryRunner.isReleased()) { await queryRunner.rollbackTransaction(); }
    });

    it("Should return an empty array if there is no matching entity", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const read = createRead(queryRunner, universe);
        const { empty } = await read({ empty: {
            type: Target,
            ids: [hydrateId(999)],
            branch: masterBranchId,
            references: {},
        } });

        expect(empty).to.have.length(0);
    });

    it("Should return basic info about the object", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        const { basic } = await read({ basic: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(basic).to.have.length(1);
        const item = basic[0]!;

        checkFetchResponse(universe.Target, {}, item);

        expect(item.id).to.eql(itemId);
        expect(item.ts.isAfter(LocalDateTime.now().minusMinutes(1))).to.be(true);
        expect(item.by).to.eql(rootUserId);
    });

    it("Should throw if specified ids don't match expected id type", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const read = createRead(queryRunner, universe);
        return expectToFail(
            () => read({ basic: {
                    type: Target,
                    ids: [false as any],
                    branch: masterBranchId,
                    references: {},
                } }),
            e => expect(e.message).to.match(/Request ids must match id type/)
        );
    });

    it("Should return null primitives", async () => {
        @entity()
        class Target {
            public vrsn = primitiveVersion();
            public brnch = primitiveBranch();
            public usr = primitiveUser();
            public buffer = primitiveBuffer();
            public float = primitiveFloat();
            public money = primitiveMoney();
            public int = primitiveInt();
            public string = primitiveString();
            public bool = primitiveBool();
            public localDate = primitiveLocalDate();
            public localDateTime = primitiveLocalDateTime();
            public enum = primitiveEnum("my_enum", ["one", "two", "three"]);
        }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        const { nullPrimitives } = await read({ nullPrimitives: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(nullPrimitives).to.have.length(1);
        checkFetchResponse(universe.Target, {}, atLeastOne(nullPrimitives)[0]);
    });

    it("Should return values for primitives", async () => {
        @entity()
        class Target {
            public vrsn = primitiveVersion();
            public brnch = primitiveBranch();
            public usr = primitiveUser();
            public buffer = primitiveBuffer();
            public float = primitiveFloat();
            public money = primitiveMoney();
            public int = primitiveInt();
            public str = primitiveString();
            public bool = primitiveBool();
            public localDate = primitiveLocalDate();
            public localDateTime = primitiveLocalDateTime();
            public enm = primitiveEnum("my_enum", ["one", "two", "three"]);
        }

        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const expectedPrimitiveValues: { [P in keyof Target]: PrimitiveValue<Target[P]> } = {
            vrsn: hydrateVersionId(1),
            brnch: masterBranchId,
            usr: rootUserId,
            buffer: Buffer.from("whatever"),
            float: 1.5,
            money: 2000,
            int: 3,
            str: "str",
            bool: true,
            localDate: LocalDate.now(),
            localDateTime: LocalDateTime.now().withNano(0),
            enm: "two",
        };

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: universe.Target,
            value: expectedPrimitiveValues,
        }]);

        const read = createRead(queryRunner, universe);
        const { primitiveValues } = await read({ primitiveValues: {
            type: universe.Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {},
        } });

        expect(primitiveValues).to.have.length(1);
        const item = primitiveValues[0]!;

        checkFetchResponse(universe.Target, {}, item);

        const targetDef = new Target();
        objectKeys(expectedPrimitiveValues).forEach(prop => {
            const comparator = nullableComparator(getPrimitiveComparator(targetDef[prop].primitive_type));
            expect(comparator(item[prop], expectedPrimitiveValues[prop])).to.eql(0);
        });
    });

    it("Should read an original value of an entity from a new branch, if entity is unchanged", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const val = "some value";
        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: universe.Target,
            value: { prop: val },
        }]);

        const otherBranch = await createBranching(queryRunner)(masterBranchId, rootUserId);

        const read = createRead(queryRunner, universe);
        const { fromNewBranch } = await read({ fromNewBranch: {
            type: universe.Target,
            ids: [itemId],
            branch: otherBranch,
            references: {},
        } });

        expect(atLeastOne(fromNewBranch)[0].prop).to.eql(val);
    });

    it("Should read different values for same id from different branches", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target  };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const version1Value = "version 1 value";
        const version2Value = "version 2 value";
        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: universe.Target,
            value: { prop: version1Value },
        }]);

        const otherBranch = await createBranching(queryRunner)(masterBranchId, rootUserId);
        await insert(queryRunner, universe, [{
            branch: otherBranch,
            user: rootUserId,
            type: universe.Target,
            value: { id: itemId, prop: version2Value },
        }]);

        const read = createRead(queryRunner, universe);
        const { v1, v2 } = await read({
            v1: {
                type: universe.Target,
                ids: [itemId],
                branch: masterBranchId,
                references: {},
            },
            v2: {
                type: universe.Target,
                ids: [itemId],
                branch: otherBranch,
                references: {},
            },
        });

        expect(atLeastOne(v1)[0].prop).to.eql(version1Value);
        expect(atLeastOne(v2)[0].prop).to.eql(version2Value);
    });

    it("Should fetch requested to-one references", async () => {
        @entity() class Target { public ref = hasOne(() => Reference); }
        @entity() class Reference { public prop = primitiveString(); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const propValue = "whatever";
        const [referenceId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Reference,
            value: { prop: propValue },
        }]);

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: { ref: referenceId },
        }]);

        const read = createRead(queryRunner, universe);
        const references = { ref: {} };
        const { withRef } = await read({ withRef: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references,
        } });

        const item = atLeastOne(withRef)[0];
        checkFetchResponse(Target, references, item);
        expect(item.ref?.prop).to.eql(propValue);
    });

    it("Should fetch requested inverse to-one references", async () => {
        @entity() class Target { public ref = hasOneInverse(() => Reference, "tgt"); }
        @entity() class Reference { public prop = primitiveString(); public tgt = hasOne(() => Target); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const propValue = "whatever";
        await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Reference,
            value: {
                tgt: itemId,
                prop: propValue,
            },
        }]);

        const read = createRead(queryRunner, universe);
        const references = { ref: {} };
        const { withInverseRef } = await read({ withInverseRef: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references,
        } });

        const item = atLeastOne(withInverseRef)[0];
        checkFetchResponse(Target, references, item);
        expect(item.ref?.prop).to.eql(propValue);
    });

    it("Should not fetch requested inverse to-one references after they were unset", async () => {
        @entity() class Target { public ref = hasOneInverse(() => Reference, "tgt"); }
        @entity() class Reference { public prop = primitiveString(); public tgt = hasOne(() => Target); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const [refId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Reference,
            value: {
                tgt: itemId,
                prop: "whatever",
            },
        }]);
        await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Reference,
            value: {
                id: refId,
                tgt: null,
                prop: "whatever",
            },
        }]);

        const read = createRead(queryRunner, universe);
        const references = { ref: {} };
        const { withInverseRef } = await read({ withInverseRef: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references,
        } });

        const item = atLeastOne(withInverseRef)[0];
        checkFetchResponse(Target, references, item);
        expect(item).to.have.property("ref", null);
    });

    it("Should fetch requested to-many references", async () => {
        @entity() class Target { public ref = hasMany(() => Reference, "tgt"); }
        @entity() class Reference { public prop = primitiveString(); public tgt = hasOne(() => Target); }
        const universe = { Target, Reference };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const propValue1 = "whatever1";
        const propValue2 = "whatever2";
        await insert(queryRunner, universe, [
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Reference,
                value: { tgt: itemId, prop: propValue1 },
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Reference,
                value: { tgt: itemId, prop: propValue2 },
            },
        ]);

        const read = createRead(queryRunner, universe);
        const references = { ref: {} };
        const { withMany } = await read({ withMany: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references,
        } });

        const item = atLeastOne(withMany)[0];
        checkFetchResponse(Target, references, item);

        expect(item.ref[0]?.prop).to.eql(propValue1);
        expect(item.ref[1]?.prop).to.eql(propValue2);
    });

    it("Should fetch deeply nested references", async () => {
        @entity()
        class Post {
            public text = primitiveString();
            public published = primitiveLocalDateTime();
            public tags = hasMany(() => PostTagLink, "post");
            public comments = hasMany(() => Comment, "post");
            public author = hasOne(() => Author);
        }

        @entity()
        class PostTagLink {
            public post = hasOne(() => Post);
            public tag = hasOne(() => Tag);
        }

        @entity()
        class Tag {
            public name = primitiveString();
            public posts = hasMany(() => PostTagLink, "tag");
        }

        @entity()
        class Comment {
            public text = primitiveString();
            public post = hasOne(() => Post);
            public author = hasOne(() => Author);
            public parent = hasOne(() => Comment);
            public children = hasMany(() => Comment, "parent");
        }

        @entity()
        class Author {
            public name = primitiveString();
            public comments = hasMany(() => Comment, "author");
            public posts = hasMany(() => Post, "author");
        }


        const universe = { Post, PostTagLink, Tag, Comment, Author };
        await executeMigrations(queryRunner, generateMigrations(universe));


        const authorName = "Author";
        const [authorId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Author,
            value: { name: authorName },
        }]);

        const tag1Name = "Tag1";
        const tag2Name = "Tag2";
        const [tag1Id, tag2Id] = await insert(queryRunner, universe, [
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Tag,
                value: { name: tag1Name },
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Tag,
                value: { name: tag2Name },
            },
        ]);

        const post1Text = "Lorem ipsum dolor sit amet";
        const post2Text = "Draft";
        const post1PublishTs = LocalDateTime.now().minusYears(1).withNano(0);
        const [post1Id, post2Id] = await insert(queryRunner, universe, [
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Post,
                value: {
                    text: post1Text,
                    published: post1PublishTs,
                    author: authorId,
                },
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Post,
                value: {
                    text: post2Text,
                    author: authorId,
                },
            },
        ]);

        await insert(queryRunner, universe, [
            {
                branch: masterBranchId,
                user: rootUserId,
                type: PostTagLink,
                value: { post: post1Id, tag: tag1Id },
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: PostTagLink,
                value: { post: post1Id, tag: tag2Id },
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: PostTagLink,
                value: { post: post2Id, tag: tag1Id },
            },
        ]);

        const comment1Text = "First!";
        const [comment1Id] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Comment,
            value: {
                text: comment1Text,
                author: authorId,
                post: post1Id,
            },
        }]);

        const comment2Text = "A reply";
        await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Comment,
            value: {
                text: comment2Text,
                author: authorId,
                post: post1Id,
                parent: comment1Id,
            },
        }]);

        const read = createRead(queryRunner, universe);
        const references = {
            comments: { parent: { children: {} } },
            posts: {
                comments: {},
                tags: { tag: {} },
            },
        } as const;
        const { authorData } = await read({
            authorData: {
                branch: masterBranchId,
                type: Author,
                ids: [authorId],
                references,
            },
        });

        const author = atLeastOne(authorData)[0];
        checkFetchResponse(Author, references, author);

        expect(author).to.have.property("name", authorName);
        expect(author.comments[0]?.text).to.eql(comment1Text);
        expect(author.comments[1]?.text).to.eql(comment2Text);
        expect(author.comments[1]?.parent?.children[0]?.text).to.eql(comment2Text);

        expect(author.posts[0]?.text).to.eql(post1Text);
        expect(author.posts[0]?.published?.isEqual(post1PublishTs)).to.be(true);
        expect(author.posts[1]?.text).to.eql(post2Text);
        expect(author.posts[0]?.comments[0]?.text).to.eql(comment1Text);

        expect(author.posts[0]?.tags[0]?.tag?.name).to.eql(tag1Name);
    });

    it("Should return entities in order of requested ids", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [id1, id2] = await insert(queryRunner, universe, [
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Target,
                value: {},
            },
            {
                branch: masterBranchId,
                user: rootUserId,
                type: Target,
                value: {},
            },
        ]);

        const read = createRead(queryRunner, universe);
        const { order } = await read({ order: {
            type: Target,
            ids: [id2, id1],
            branch: masterBranchId,
            references: {},
        } });

        const [item1, item2] = order;
        expect(item1).to.have.property("id", id2);
        expect(item2).to.have.property("id", id1);
    });

    it("Should read internal foreign keys", async () => {
        @entity()
        class Target {
            public brnch = primitiveBranch();
            public usr = primitiveUser();
        }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: { brnch: masterBranchId, usr: rootUserId },
        }]);

        const read = createRead(queryRunner, universe);
        const { data } = await read({ data: {
            type: Target,
            ids: [itemId],
            branch: masterBranchId,
            references: {
                brnch: { branched_from: { branched_from: { created_by: { created_by: {} } } }, created_by: {} },
                usr: { created_by: {} },
            },
        } });

        const item = atLeastOne(data)[0];
        expect(item.brnch?.created_by.id).to.eql(rootUserId);
        expect(item.brnch?.branched_from.id).to.eql(masterBranchId);
        expect(item.brnch?.branched_from.branched_from.created_by.created_by.id).to.eql(rootUserId);
        expect(item.usr?.created_by.id).to.eql(rootUserId);
    });

    it("Should throw if references contain a nonexistent key", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        return expectToFail(
            () => read({ basic: {
                type: Target,
                ids: [itemId],
                branch: masterBranchId,
                references: { nonexistent: {} } as any,
            } }),
            e => expect(e.message).to.match(/does not exists/)
        );
    });

    it("Should throw if references select a primitive that is not an internal fk", async () => {
        @entity() class Target { public prop = primitiveString(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        return expectToFail(
            () => read({ basic: {
                    type: Target,
                    ids: [itemId],
                    branch: masterBranchId,
                    references: { prop: {} } as any,
                } }),
            e => expect(e.message).to.match(/not a data reference or internal fk definition/)
        );
    });

    it("Should throw if references select a field that does not exists on internal fk ref", async () => {
        @entity() class Target { public brnch = primitiveBranch(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        return expectToFail(
            () => read({ basic: {
                    type: Target,
                    ids: [itemId],
                    branch: masterBranchId,
                    references: { brnch: { nonexistent: {} } as any },
                } }),
            e => expect(e.message).to.match(/not in internal fk shape/)
        );
    });

    it("Should throw if references select a field that is not an internal fk ref", async () => {
        @entity() class Target { public brnch = primitiveBranch(); }
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const [itemId] = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);
        return expectToFail(
            () => read({ basic: {
                    type: Target,
                    ids: [itemId],
                    branch: masterBranchId,
                    references: { brnch: { id: {} } as any },
                } }),
            e => expect(e.message).to.match(/not an internal ref/)
        );
    });

    it("Should return same results on repeated reads", async () => {
        @entity() class Target {} // tslint:disable-line:no-unnecessary-class
        const universe = { Target };
        await executeMigrations(queryRunner, generateMigrations(universe));

        const itemId = await insert(queryRunner, universe, [{
            branch: masterBranchId,
            user: rootUserId,
            type: Target,
            value: {},
        }]);

        const read = createRead(queryRunner, universe);

        const req = {
            r: {
                type: Target,
                branch: masterBranchId,
                references: {},
                ids: itemId,
            },
        };

        const results = await Promise.all(Array.from(Array(3)).map(() => read(req)));
        const r1 = atLeastOne(results)[0];
        results.slice(1).forEach(r => {
            expect(r).to.eql(r1); // All results must match
        });
    });
});

describe("Database read concurrency", () => {
    @entity()
    class T1 {
        public prop = primitiveInt();
        public t2 = hasOne(() => T2);
    }

    @entity()
    class T2 {
        public prop = primitiveInt();
        public t1 = hasOneInverse(() => T1, "t2");
    }
    const universe = { T1, T2 };

    let queryRunner: QueryRunner;
    before(async () => {
        queryRunner = await getQueryRunner("tst-read-api", devDbConnectionConfig, true);
        await prepare(queryRunner);
        await executeMigrations(queryRunner, generateMigrations(universe));
    });

    after(async () => {
        const teardown = migrate({
            T1: { prop: primitiveInt(), t2: { reference_target: "T2" } },
            T2: { prop: primitiveInt() },
        })
            .removeField("T1", "t2")
            .removeType("T2")
            .removeType("T1")
            .done();

        await executeMigrations(queryRunner, teardown);
        await queryRunner.release();
    });

    it("Should correctly fetch same data across multiple simultaneous transactions", async function() {
        this.timeout(10000); // Slow test

        const numEntities = 3;
        const t2s = await insert(queryRunner, universe, atLeastOne(Array.from(Array(numEntities)).map((_, i) => ({
            type: T2,
            branch: masterBranchId,
            value: { prop: i },
            user: rootUserId,
        }))));

        const t1s = await insert(queryRunner, universe, atLeastOne(Array.from(Array(numEntities)).map((_, i) => ({
            type: T1,
            branch: masterBranchId,
            value: { prop: i, t2: t2s[i] },
            user: rootUserId,
        }))));

        const deepCopy = (x: object) => objectKeys(x).reduce((_agg, k) => {
            const prop = x[k];
            _agg[k] = isPlainObject(prop) ? deepCopy(prop) : prop;
            return _agg;
        }, {} as any);

        // Generate progressively deep requests between t1 and t2, which is possible since they establish a circular graph
        const maxDepth = 5;
        const _generateRequests = (prev: FetchNode<T1>, tip: FetchNode<any>, iter: number): ReadRequest<T1, FetchNode<T1>>[] => {
            if (iter > maxDepth) { return []; }

            const next = {};
            tip[(iter % 2 ? "t1" : "t2") as unknown as keyof typeof tip] = next;

            const own = deepCopy(prev);
            const reqs = _generateRequests(prev, next, iter + 1);

            const r: ReadRequest<T1, FetchNode<T1>> = {
                type: T1,
                branch: masterBranchId,
                ids: t1s,
                references: own,
            };

            return [r, ...reqs];
        };
        const generateRequests = () => {
            const tip = {};
            return _generateRequests(tip, tip, 0);
        };
        const requests = generateRequests();

        const createStoredFnFailed = stub();
        await Promise.all(Array.from(Array(3)).map(async () => {
            const qr1 = await getQueryRunner("tst-read-api", devDbConnectionConfig, true);
            const qr2 = await getQueryRunner("tst-read-api", devDbConnectionConfig, true);

            await qr1.startTransaction("SERIALIZABLE");
            await qr2.startTransaction("SERIALIZABLE");

            try {
                const r1 = createRead(qr1, universe, createStoredFnFailed);
                const r2 = createRead(qr2, universe, createStoredFnFailed);

                const results = await Promise.all(requests.map(r => Promise.all([
                    r1({ data: r }),
                    r2({ data: r }),
                ])));

                results.forEach(([res1, res2]) => {
                    expect(res1).to.eql(res2); // Read results must match across pairs — independent from transaction
                });
            } finally {
                await qr1.rollbackTransaction();
                await qr2.rollbackTransaction();
            }
        }));

        // Check if test created a condition when creating stored function fails.
        expect(createStoredFnFailed.called).to.be(true);
    });
});
