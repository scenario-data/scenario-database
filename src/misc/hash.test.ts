import expect = require("expect.js");
import { hash } from "./hash";

describe("Hash", () => {
    it("Should provide a sha-256 hash of a string", async () => {
        expect(hash("blah")).to.eql("8b7df143d91c716ecfa5fc1730022f6b421b05cedee8fd52b1fc65a96030ad52");
    });

    it("Should trim hash to specified length", async () => {
        expect(hash("blah", 16)).to.eql("8b7df143d91c716e");
    });

    it("Should throw if requested length is more than avilable", async () => {
        expect(() => hash("blah", 9999)).to.throwError(/Requested length is higher than available/);
    });
});
