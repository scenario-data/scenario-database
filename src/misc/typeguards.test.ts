import expect = require("expect.js");
import { atLeastOne, isArrayOf, isBoolean, isEither, isNotNull, isString, nevah } from "./typeguards";

describe("Type guards", () => {
    describe("atLeastOne", () => {
        it("Should throw if no items exist in array", async () => {
            expect(() => atLeastOne([])).to.throwError(/Empty array/);
        });
    });

    describe("isArrayOf", () => {
        const check = isArrayOf(isNotNull);
        it("Should return true if every item in array matches the check", async () => {
            expect(check([1, "a", false])).to.be(true);
        });

        it("Should return false if any item in array doesn't match the check", async () => {
            expect(check([1, "a", false, null])).to.be(false);
        });
    });

    describe("nevah", () => {
        it("Should throw if called", async () => {
            expect(() => nevah(1 as never)).to.throwError();
        });
    });

    describe("isEither", () => {
        const combined = isEither(isBoolean, isString);
        it("Should return true if any guard matches", async () => {
            expect(combined(false)).to.be(true);
            expect(combined("blah")).to.be(true);
        });

        it("Should return false if neither guard matches", async () => {
            expect(combined(1)).to.be(false);
        });
    });
});
