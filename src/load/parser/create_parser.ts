import * as peg from "pegjs";

export const createParser = <Ret = never>(def: string): (str: string) => Ret => {
    const parser = peg.generate(def);
    return text => {
        try {
            return parser.parse(text);
        } catch (e) {
            if (!(e instanceof parser.SyntaxError)) { throw e; }

            const startLine = e.location.start.line;
            const endLine = e.location.end.line;
            const lineRef = endLine === startLine ? `At line ${startLine}` : `At lines ${ startLine }-${ endLine }`;
            const lines = text.split("\n").slice(startLine - 1, endLine).join("\n");
            throw new Error(`\n\n${ e.message }\n${ lineRef }:\n${ lines }\n`);
        }
    };
};
