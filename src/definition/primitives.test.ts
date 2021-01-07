import expect = require("expect.js");

import {
    DataPrimitiveOfType,
    DataPrimitiveType,
    PrimitiveTypeValue,
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
    primitiveVersion, getPrimitiveGuard, getPrimitiveComparator
} from "./primitives";
import { asUserId, rootUserId } from "../user";
import { asBranchId, asVersionId, masterBranchId } from "../temporal";
import { LocalDate, LocalDateTime } from "js-joda";
import { objectKeys } from "../misc/typeguards";

describe("Primitives", () => {
    const primitives: { [P in Exclude<DataPrimitiveType, "bool">]: {
        primitive: DataPrimitiveOfType<P>;
        val: PrimitiveTypeValue<P>;
        lt: PrimitiveTypeValue<P>;
        gt: PrimitiveTypeValue<P>;
    } } = {
        user: {
            primitive: primitiveUser(),
            val: asUserId("100"),
            lt: rootUserId,
            gt: asUserId("999"),
        },
        branch: {
            primitive: primitiveBranch(),
            val: asBranchId("100"),
            lt: masterBranchId,
            gt: asBranchId("999"),
        },
        version: {
            primitive: primitiveVersion(),
            val: asVersionId("2"),
            lt: asVersionId("1"),
            gt: asVersionId("3"),
        },


        local_date_time: {
            primitive: primitiveLocalDateTime(),
            val: LocalDateTime.now(),
            lt: LocalDateTime.now().minusMinutes(2),
            gt: LocalDateTime.now().plusMinutes(2),
        },
        local_date: {
            primitive: primitiveLocalDate(),
            val: LocalDate.now(),
            lt: LocalDate.now().minusDays(2),
            gt: LocalDate.now().plusDays(2),
        },


        money: {
            primitive: primitiveMoney(),
            val: 0,
            lt: -1,
            gt: 1,
        },
        buffer: {
            primitive: primitiveBuffer(),
            val: Buffer.from("b", "utf8"),
            lt: Buffer.from("a", "utf8"),
            gt: Buffer.from("c", "utf8"),
        },
        string: {
            primitive: primitiveString(),
            val: "str",
            lt: "a",
            gt: "z",
        },
        float: {
            primitive: primitiveFloat(),
            val: 0.1,
            lt: -0.1,
            gt: 1.1,
        },
        enum: {
            primitive: primitiveEnum("someEnum", ["a", "b", "c"]),
            val: "b",
            lt: "a",
            gt: "c",
        },
        int: {
            primitive: primitiveInt(),
            val: 1,
            lt: 0,
            gt: 2,
        },
    };

    objectKeys(primitives).forEach(primType => {
        describe(`Primitive ${ primType }`, () => {
            const def = primitives[primType];

            it("Should have a guard", async () => {
                const guard = getPrimitiveGuard(def.primitive);
                expect(guard(def.val)).to.be(true);
                expect(guard(null)).to.be(false);
            });

            it("Should have a comparator", async () => {
                const comparator = getPrimitiveComparator(def.primitive.primitive_type);
                expect(comparator(def.val, def.val)).to.eql(0);
                expect(comparator(def.val, def.lt)).to.eql(1);
                expect(comparator(def.val, def.gt)).to.eql(-1);
            });
        });
    });

    describe("Primitive bool", () => {
        it("Should have a guard", async () => {
            const guard = getPrimitiveGuard(primitiveBool());
            expect(guard(false)).to.be(true);
            expect(guard(true)).to.be(true);
            expect(guard("whatever")).to.be(false);
        });

        it("Should have a comparator", async () => {
            const comparator = getPrimitiveComparator(primitiveBool().primitive_type);
            expect(comparator(true, true)).to.eql(0);
            expect(comparator(true, false)).to.eql(1);
            expect(comparator(false, true)).to.eql(-1);
        });
    });

    describe("Primitive enum", () => {
        it("Should guard against arbitrary strings", async () => {
            const guard = getPrimitiveGuard(primitiveEnum("some enum", ["val"]));
            expect(guard("not an enum value")).to.be(false);
        });
    });

    describe("Guards", () => {
        it("Should throw if no guard exists", async () => {
            expect(() => getPrimitiveGuard({ primitive_type: "not a primitive at all" as any })).to.throwError(/No guard found/);
        });
    });

    describe("Comparators", () => {
        it("Should throw if no comparator exists", async () => {
            expect(() => getPrimitiveComparator("not a primitive at all" as any)).to.throwError(/No comparator found/);
        });
    });
});
