import expect = require("expect.js");
import { SinonStub, stub } from "sinon";
import { Comparator, nullableComparator } from "./comparisons";

describe("Comparisons", () => {
    describe("Nullable comparator", () => {
        let wrappedComparator: Comparator<number> & SinonStub;
        let comparator: Comparator<number | null>;
        beforeEach(async () => {
            wrappedComparator = stub().returns(0);
            comparator = nullableComparator(wrappedComparator);
        });

        it("Should return 0 for two null values", async () => {
            expect(comparator(null, null)).to.eql(0);
        });

        it("Should return sort nulls lower than values", async () => {
            expect(comparator(null, 1)).to.eql(-1);
            expect(comparator(1, null)).to.eql(1);
        });

        it("Should call out to wrapped comparator for non-null values", async () => {
            const expectedResult = { Iam: "an expected result" };
            wrappedComparator.returns(expectedResult);

            expect(comparator(1, 2)).to.eql(expectedResult);
            expect(wrappedComparator.calledWithExactly(1, 2)).to.be(true);
        });
    });
});
