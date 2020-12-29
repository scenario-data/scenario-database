import expect = require("expect.js");
import { sum } from "./example";

it("Should work", async () => {
    expect(sum(1, 2)).to.eql(3);
});
