"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = exports.MQTTTest = exports.MQTTAckTest = void 0;
const utils_1 = require("./utils");
class MQTTTestCase {
    constructor(desc) {
        this.desc = desc;
        this.index = 0;
    }
    get title() {
        return this.desc.title;
    }
    run(send) {
        this.current_stage = this.desc.stages[this.index];
        if (this.current_stage) {
            console.log('publish stage', this.index);
            send(this.current_stage.packets);
            return true;
        }
        else {
            console.log('no tests to be done');
            return false;
        }
    }
    got_ack(ack) {
        if (!this.current_stage) {
            return 'failed';
        }
        if (ack === this.current_stage.expected_ack) {
            this.index++;
            if (this.index < this.desc.stages.length) {
                this.current_stage = this.desc.stages[this.index];
                return 'next';
            }
            else {
                // finished
                return 'done';
            }
        }
        else {
            console.error(`expected ack: ${this.current_stage.expected_ack}, got ${ack}`);
            return 'failed';
        }
    }
}
class MQTTAckTest {
    constructor() {
        this.acks = [2, 0, 0xFFFF];
        this.index = 0;
        this.count = 0;
        this.expected_N = [7, 5, 7];
    }
    newPacket(payload) {
        const packet_number = payload.readUInt16LE(0);
        const total_packets = payload.readUInt16LE(2);
        this.count++;
        if (packet_number === (total_packets - 1)) {
            // done, return ack
            const rmsg = new Buffer(2);
            if (this.count === this.expected_N[this.index]) {
                console.log('acktest count:', this.count);
                console.log(`ACK TEST ${this.index} PASSED`);
                rmsg.writeUInt16LE(this.acks[this.index], 0);
                this.index++;
                if (this.index > 2) {
                    this.index = 0;
                }
            }
            else {
                console.error(`ACK TEST ${this.index} FAILED`);
                this.index = 0;
                rmsg.writeUInt16LE(0, 0);
            }
            this.count = 0;
            console.log('acktest send ack:', rmsg);
            return rmsg;
        }
        return;
    }
}
exports.MQTTAckTest = MQTTAckTest;
class MQTTTest {
    constructor(testCases, sendPacketsFunc) {
        this.testCases = testCases;
        this.sendPacketsFunc = sendPacketsFunc;
        this.run_next_test();
    }
    run_next_test() {
        if (this.testCases) {
            this.current_test = this.testCases.shift();
            if (this.current_test) {
                console.log('Start', this.current_test.title);
                this.current_test.run(this.sendPacketsFunc);
                return true;
            }
        }
        return false;
    }
    got_ack(ack) {
        console.log('got ack:', ack);
        if (!this.current_test) {
            return true;
        }
        const status = this.current_test.got_ack(ack);
        if (status === 'done') {
            console.log(`test ${this.current_test.title}: PASSED`);
            const run = this.run_next_test();
            return !run;
        }
        else if (status === 'failed') {
            console.error(`test ${this.current_test.title}: FAILED`);
            return true;
        }
        else { // same test case, next stage
            this.current_test.run(this.sendPacketsFunc);
            return false;
        }
    }
}
exports.MQTTTest = MQTTTest;
function runTests(sendFunc) {
    const tests = [
        test0_normal(),
        test1a_skip(),
        test1b_skip(),
        test2_early_restart(),
        test3_change_length(),
        test4_duplicate(),
        test5_crc(),
        test6_crc()
    ];
    const cases = tests.map(t => new MQTTTestCase(t));
    return new MQTTTest(cases, sendFunc);
}
exports.runTests = runTests;
function test0_normal() {
    const test_str = 'TestData';
    const data = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(4)), 8);
    return {
        title: 'Test 0 normal',
        stages: [
            {
                packets: data,
                expected_ack: data.length
            }
        ]
    };
}
function test1a_skip() {
    const test_str = 'TestData';
    const data1 = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(4)), 8);
    const data2 = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(6)), 8);
    data1.splice(2, 1);
    return {
        title: 'Test 1a skip and reset',
        stages: [
            {
                packets: data1,
                expected_ack: 2
            },
            {
                packets: data2,
                expected_ack: data2.length
            }
        ]
    };
}
function test1b_skip() {
    const test_str = 'TestData';
    const data = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(4)), 8);
    const data1 = [...data.slice(0, 2), ...data.slice(3)];
    const data2 = data.slice(2);
    data1.splice(2, 1);
    return {
        title: 'Test 1b skip and continue',
        stages: [
            {
                packets: data1,
                expected_ack: 2
            },
            {
                packets: data2,
                expected_ack: data.length
            }
        ]
    };
}
function test2_early_restart() {
    const test_str = 'TestData';
    const data1 = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(4)), 8);
    const data2 = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(3)), 8);
    const data = data1.slice(0, 2).concat(data2);
    return {
        title: 'Test 2 early restart',
        stages: [
            {
                packets: data,
                expected_ack: data2.length
            }
        ]
    };
}
function test3_change_length() {
    const test_str = 'TestData';
    const data_short = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(4)), 8);
    const data_long = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(6)), 8);
    data_short[2] = data_long[2];
    return {
        title: 'Test 3 change length',
        stages: [
            {
                packets: data_short,
                expected_ack: 0
            },
            {
                packets: data_long,
                expected_ack: data_long.length
            }
        ]
    };
}
function test4_duplicate() {
    const test_str = 'TestData';
    let data_dup = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(5)), 8);
    const N = data_dup.length;
    data_dup = [...data_dup.slice(0, 2), ...data_dup.slice(1)];
    return {
        title: 'Test 4 duplicate',
        stages: [
            {
                packets: data_dup,
                expected_ack: N
            }
        ]
    };
}
function test5_crc() {
    const test_str = 'TestData';
    const data_a = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(5)), 8);
    const test_str2 = 'blabla12';
    const data_b = utils_1.utils.createFixedDataPacket(new Buffer(test_str2.repeat(5)), 8);
    data_a[2] = data_b[2];
    return {
        title: 'Test 5 CRC error',
        stages: [
            {
                packets: data_a,
                expected_ack: 0
            }
        ]
    };
}
function test6_crc() {
    const test_str = 'TestData';
    const bad_packet = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(2)), 8);
    bad_packet[1].writeInt32LE(0xDEAD, 4);
    bad_packet[2].writeInt32LE(0xC0DE, 4);
    const good_packet = utils_1.utils.createFixedDataPacket(new Buffer(test_str.repeat(2)), 8);
    return {
        title: 'Test 6 Force ACK',
        stages: [
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: good_packet,
                expected_ack: good_packet.length
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0
            },
            {
                packets: bad_packet,
                expected_ack: 0xFFFF
            },
            {
                packets: good_packet,
                expected_ack: good_packet.length
            }
        ]
    };
}
//# sourceMappingURL=mqtt-protocol-test.js.map