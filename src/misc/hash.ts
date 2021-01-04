import { createHash } from "crypto";

export function hash(str: string, length?: number): string {
    const h = createHash("sha256");
    h.update(str);
    const hashed = h.digest("hex");

    if (!length) { return hashed; }

    if (length > hashed.length) { throw new Error(`Requested length is higher than available: ${ length } > ${ hashed.length }`); }
    return hashed.slice(0, length);
}
