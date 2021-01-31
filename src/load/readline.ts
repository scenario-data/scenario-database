import { ReadStream } from "fs";

export const readline = async (
    stream: ReadStream,
    lineHandler: (line: string) => Promise<void> | void
) => {
    const handler = (l: string) => {
        if (!l) { return;  } // Skip empty lines

        try {
            return lineHandler(l);
        } catch (e) {
            stream.close();
            throw e;
        }
    };

    let remainder = "";
    const handleChunk = async (chunk: string, final = false) => {
        const allLines = (remainder + chunk).split("\n");

        const lines = allLines.slice(0, -1);
        const last = allLines[allLines.length - 1]!;

        for (const line of lines) {
            await handler(line);
        }

        if (final) { return handler(last); }
        else { remainder = last; }
    };

    for await (const chunk of stream) {
        if (chunk === null) {
            // Done
            await handleChunk("", true);
            stream.close();
            return;
        }

        if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) { throw new Error("Unexpected object mode on stream"); }

        const chunkStr = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        await handleChunk(chunkStr);
    }
};
