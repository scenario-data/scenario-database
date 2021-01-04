import expect = require("expect.js");
import { spy, SinonSpy, stub, SinonStub } from "sinon";

import { Client, Pool } from "pg";
import { getQueryRunnerForClient } from "./query_runner";
import { devDbConnectionConfig } from "../../config/dev_database_connection";
import { QueryRunner, TransactionStatus } from "./query_runner_api";
import { expectToFail } from "../../misc/test_util";


const noop = () => void 0;
describe("Query runner", () => {
    let clientTerminated: boolean;
    let client: Client;
    let qr: QueryRunner;
    beforeEach(async () => {
        client = new Client(devDbConnectionConfig);

        clientTerminated = false;
        const originalEnd: () => Promise<void> = client.end;
        stub(client, "end").callsFake(() => {
            if (clientTerminated) { return; } // Avoid terminating the client twice as this causes `afterEach` to hang
            clientTerminated = true;
            return originalEnd.call(client);
        });

        await client.connect();

        qr = await getQueryRunnerForClient("tst-query-runner", client);
    });

    afterEach(async () => {
        await client.end();
    });

    it("Should execute sql", async () => {
        const row = (await qr.query("SELECT NOW()")).rows[0];
        expect(row).to.have.property("now");
        expect(row!.now).to.be.a(Date);
    });

    it("Should reject if query fails", async () => {
        return expectToFail(
            () => qr.query("THIS IS NOT A VALID QUERY"),
            e => expect(e.message).to.match(/syntax/i)
        );
    });

    describe("Release", () => {
        it("Should release the client if query fails", async () => {
            spy(qr, "release");

            await qr.query("THIS IS NOT A VALID QUERY").catch(noop);
            expect((qr.release as SinonSpy).calledOnce).to.be(true);
        });

        it("Should release a standalone client by calling `end`", async () => {
            await qr.release();
            expect((client.end as SinonStub).calledOnce).to.be(true);
        });

        it("Should only release once", async () => {
            await qr.release();
            await qr.release();
            expect((client.end as SinonStub).calledOnce).to.be(true);
        });

        it("Should release a pool client by calling `release`", async () => {
            const pool = new Pool(devDbConnectionConfig);
            const poolClient = await pool.connect();
            const poolQr = getQueryRunnerForClient("tst-query-runner", poolClient);

            spy(poolClient, "release");
            await poolQr.release();
            expect((poolClient.release as SinonSpy).calledOnce).to.be(true);

            await pool.end();
        });

        it("Should fail when queried after release", async () => {
            await qr.release();

            return expectToFail(
                () => qr.query("SELECT NOW()"),
                e => expect(e.message).to.match(/Can't run a query on a released query runner/)
            );
        });
    });

    describe("Start Transaction", () => {
        beforeEach(async () => {
            stub(qr, "query").resolves();
        });

        it("Should not initiate the transaction by default", async () => {
            expect(qr.transactionStatus()).to.eql(TransactionStatus.NoTransaction);
        });

        it("Should start transaction", async () => {
            await qr.startTransaction();
            expect((qr.query as SinonStub).firstCall.firstArg).to.match(/START TRANSACTION/);
        });

        it("Should throw if given an invalid isolation level", async () => {
            return expectToFail(
                () => qr.startTransaction("READ WHATEVER" as any),
                e => expect(e.message).to.match(/Unexpected isolation level/)
            );
        });

        it("Should set transaction status to 'Started'", async () => {
            await qr.startTransaction();
            expect(qr.transactionStatus()).to.eql(TransactionStatus.Started);
        });

        it("Should release the client if initiating the transaction fails", async () => {
            spy(qr, "release");
            (qr.query as SinonStub).rejects();

            await qr.startTransaction().catch(noop);
            expect((qr.release as SinonSpy).calledOnce).to.be(true);
        });

        it("Should throw if transaction is already started", async () => {
            await qr.startTransaction();
            return expectToFail(
                () => qr.startTransaction(),
                e => expect(e.message).to.match(/already started/)
            );
        });
    });

    describe("Commit transaction", () => {
        beforeEach(async () => {
            stub(qr, "query").resolves();
            await qr.startTransaction();
        });

        it("Should commit transaction", async () => {
            await qr.commitTransaction();
            expect((qr.query as SinonStub).firstCall.firstArg).to.match(/COMMIT/);
        });

        it("Should set transaction status to 'Committed'", async () => {
            await qr.commitTransaction();
            expect(qr.transactionStatus()).to.eql(TransactionStatus.Committed);
        });

        it("Should release the client if committing the transaction fails", async () => {
            spy(qr, "release");
            (qr.query as SinonStub).rejects();

            await qr.commitTransaction().catch(noop);
            expect((qr.release as SinonSpy).calledOnce).to.be(true);
        });

        it("Should throw if transaction is already committed", async () => {
            await qr.commitTransaction();
            return expectToFail(
                () => qr.commitTransaction(),
                e => expect(e.message).to.match(/Can not commit/)
            );
        });
    });

    describe("Rollback transaction", () => {
        beforeEach(async () => {
            stub(qr, "query").resolves();
            await qr.startTransaction();
        });

        it("Should rollback transaction", async () => {
            await qr.rollbackTransaction();
            expect((qr.query as SinonStub).firstCall.firstArg).to.match(/COMMIT/);
        });

        it("Should set transaction status to 'Rejected'", async () => {
            await qr.rollbackTransaction();
            expect(qr.transactionStatus()).to.eql(TransactionStatus.Rejected);
        });

        it("Should release the client if rolling back the transaction fails", async () => {
            spy(qr, "release");
            (qr.query as SinonStub).rejects();

            await qr.rollbackTransaction().catch(noop);
            expect((qr.release as SinonSpy).calledOnce).to.be(true);
        });

        it("Should throw if transaction is already rolled back", async () => {
            await qr.rollbackTransaction();
            return expectToFail(
                () => qr.rollbackTransaction(),
                e => expect(e.message).to.match(/Can not roll back/)
            );
        });
    });
});
