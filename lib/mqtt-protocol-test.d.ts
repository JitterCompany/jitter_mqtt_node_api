/// <reference types="node" />
interface MQTTTestStage {
    packets: Buffer[];
    expected_ack: number;
}
interface MQTTTestDescriptor {
    title: string;
    stages: MQTTTestStage[];
}
declare class MQTTTestCase {
    private desc;
    current_stage: MQTTTestStage | undefined;
    index: number;
    constructor(desc: MQTTTestDescriptor);
    readonly title: string;
    run(send: Function): boolean;
    got_ack(ack: number): "failed" | "next" | "done";
}
export declare class MQTTAckTest {
    acks: number[];
    index: number;
    count: number;
    expected_N: number[];
    newPacket(payload: Buffer): Buffer;
}
export declare class MQTTTest {
    private testCases;
    private sendPacketsFunc;
    private current_test;
    constructor(testCases: MQTTTestCase[], sendPacketsFunc: Function);
    run_next_test(): boolean;
    got_ack(ack: number): boolean;
}
export declare function runTests(sendFunc: Function): MQTTTest;
export {};
