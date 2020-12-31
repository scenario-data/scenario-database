import expect = require("expect.js");
import { isPath, path, pathsEqual } from "./tspath";
import { PathTestShape } from "./tspath.typetest";

describe("Path", async () => {
    describe("Builder", async () => {
        it("Should return correct path to simple properties", async () => {
            expect(path<PathTestShape>().str.getChunks()).to.eql(["str"]);
            expect(path<PathTestShape>().num.getChunks()).to.eql(["num"]);
        });

        it("Should return correct path to objects", async () => {
            expect(path<PathTestShape>().obj.num.getChunks()).to.eql(["obj", "num"]);
        });

        it("Should return correct path to array elements", async () => {
            expect(path<PathTestShape>().arr[0]!.getChunks()).to.eql(["arr", "0"]);
        });

        it("Should handle index properties", async () => {
            const dictProp = String(Math.random());
            expect(path<PathTestShape>().dict[dictProp]!.val.getChunks()).to.eql(["dict", dictProp, "val"]);
        });

        it("Should support self paths", async () => {
            expect(path<PathTestShape>().getChunks()).to.eql([]);
        });

        it("Should have no enumerable properties", async () => {
            expect(Object.keys(path<PathTestShape>().obj.num)).to.have.length(0);
        });

        it("Should throw if traversing symbols", async () => {
            expect(() => path<PathTestShape>().arr[Symbol.iterator]).to.throwError(/Symbol traversal not supported/);
        });
    });

    describe("API", async () => {
        describe("toString", async () => {
            it("Should return 'self' for a zero-length path", async () => {
                expect(path<PathTestShape>().toString()).to.eql("self");
            });

            it("Should return path representation", async () => {
                expect(path<PathTestShape>().arr[0]!.val.toString()).to.eql(`["arr"]["0"]["val"]`);
            });
        });

        describe("pathsEqual", async () => {
            it("Should return true for paths consisting of same chunks", async () => {
                expect(pathsEqual(path<PathTestShape>().arr[0]!.val, path<PathTestShape>().arr[0]!.val)).to.eql(true);
            });

            it("Should return false for paths of different chunks", async () => {
                expect(pathsEqual(path<PathTestShape>().dict.prop!, path<PathTestShape>().dict.otherProp!)).to.eql(false);
            });
        });

        describe("isPath", () => {
            it("Should return true for a path", async () => {
                expect(isPath(path<PathTestShape>().dict)).to.be(true);
            });

            it("Should return false when not a path", async () => {
                expect(isPath(1 as any)).to.eql(false);
            });
        });
    });
});
