import expect = require("expect.js");
import { atLeastOne, isArrayOf, isNotNull, nevah } from "./typeguards";

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
});
