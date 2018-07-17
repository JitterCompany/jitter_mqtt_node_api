"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Fiber = require('fibers');
var mqtt_protocol_test_1 = require("./mqtt-protocol-test");
var mqtt_utils_1 = require("./mqtt.utils");
var MAX_TRANSFER_RETRIES = 5;
var FixedDataReceiveState = /** @class */ (function () {
    function FixedDataReceiveState() {
        this.total_packets = 0;
        this.data = [];
        this.retries = MAX_TRANSFER_RETRIES;
    }
    /**
     * returns true if total package received is as expected
     */
    FixedDataReceiveState.prototype.tranfser_complete = function () {
        return this.packets_received() === this.total_packets;
    };
    FixedDataReceiveState.prototype.packets_received = function () {
        return this.data.length;
    };
    FixedDataReceiveState.prototype.reset_retries = function () {
        this.retries = MAX_TRANSFER_RETRIES;
    };
    FixedDataReceiveState.prototype.retry = function () {
        this.retries -= 1;
        var limit = this.retries <= 0;
        if (limit) {
            this.retries = MAX_TRANSFER_RETRIES;
            return false;
        }
        return true;
    };
    FixedDataReceiveState.prototype.clear = function () {
        this.total_packets = 0;
        this.data = [];
    };
    return FixedDataReceiveState;
}());
var FixedDataSendState = /** @class */ (function () {
    function FixedDataSendState(data) {
        this.data = data;
        this.packets_received = 0; // by receiver
        this.retries = MAX_TRANSFER_RETRIES;
    }
    Object.defineProperty(FixedDataSendState.prototype, "total_packets", {
        get: function () {
            return this.data.length;
        },
        enumerable: true,
        configurable: true
    });
    FixedDataSendState.prototype.tranfser_finished = function () {
        return this.packets_received === this.total_packets;
    };
    FixedDataSendState.prototype.retry = function () {
        this.retries -= 1;
        var limit = this.retries <= 0;
        if (limit) {
            this.retries = MAX_TRANSFER_RETRIES;
            return false;
        }
        this.packets_received = 0;
        return true;
    };
    return FixedDataSendState;
}());
/**
 * MQTTWorker base class
 *
 * This class can be subclassed to create a specific
 * Jitter MQTT DataProtocol object
 */
var MQTTWorker = /** @class */ (function () {
    function MQTTWorker(username, mqtt_client, max_packet_size) {
        this.username = username;
        this.mqtt_client = mqtt_client;
        this.max_packet_size = max_packet_size;
        this.queue = [];
        this.workerRunning = false;
        this.topicReceiveState = new Map();
        this.topicSendState = new Map();
    }
    MQTTWorker.prototype.allTransfersFinished = function () {
        var done = true;
        this.topicSendState.forEach(function (val, key) {
            if (!val.tranfser_finished()) {
                done = false;
            }
        });
        return done && !this.test;
    };
    MQTTWorker.prototype.getReceiveState = function (topic) {
        if (!this.topicReceiveState.get(topic)) {
            this.topicReceiveState.set(topic, new FixedDataReceiveState());
        }
        return this.topicReceiveState.get(topic);
    };
    MQTTWorker.prototype.getSendState = function (topic) {
        return this.topicSendState.get(topic);
    };
    MQTTWorker.prototype.createSendTransfer = function (topic, data) {
        var packets = mqtt_utils_1.createFixedDataPacket(new Buffer(data), this.max_packet_size);
        this.sendPackets(topic, packets);
    };
    MQTTWorker.prototype.sendPackets = function (topic, packets) {
        var _this = this;
        var state = this.topicSendState.get(topic);
        if (state) {
            console.warn("Previous transfer not finished on topic " + topic);
            return false;
        }
        if (!state) {
            state = new FixedDataSendState(packets);
            this.topicSendState.set(topic, state);
        }
        state.data.forEach(function (packet) { return _this.mqtt_client.publish(topic, packet); });
        return true;
    };
    /**
     * Starts a test routine to test the protocol implementation for the
     * client that requests it.
     * @param payload
     */
    MQTTWorker.prototype.topic_selftest = function (payload) {
        var _this = this;
        this.test = undefined;
        var topic = "t/" + this.username + "/fixeddatatest";
        if (!this.getSendState(topic)) {
            console.log('Starting tests on topic', topic);
            this.test = mqtt_protocol_test_1.runTests(function (packets) { return packets.forEach(function (packet) { return _this.mqtt_client.publish(topic, packet); }); });
        }
        else {
            console.error('Cannot start test when transfer in progress');
        }
    };
    MQTTWorker.prototype.topic_acktest_ack = function (payload) {
        var topic = "t/" + this.username + "/acktest";
        this.fixedDataAckHandler(topic, payload);
    };
    MQTTWorker.prototype.topic_acktest = function (payload) {
        if (!this.ackTest) {
            this.ackTest = new mqtt_protocol_test_1.MQTTAckTest();
        }
        var ack = this.ackTest.newPacket(payload);
        if (ack) {
            var topic = "f/" + this.username + "/acktest";
            this.mqtt_client.publish(mqtt_utils_1.getAckTopicName(topic), ack);
            if (ack.readUInt16LE(0) === 0xFFFF) {
                // start test in the other direction by sending a transfer of 7 packets
                var sendtopic = "t/" + this.username + "/acktest";
                if (this.getSendState(sendtopic)) {
                    console.warn('clearing sendstate for new acktest');
                    this.topicSendState.delete(sendtopic);
                }
                var test_str = 'TestData';
                var data = mqtt_utils_1.createFixedDataPacket(new Buffer(test_str.repeat(6)), 8);
                console.log('send acktest data to ', sendtopic);
                this.sendPackets(sendtopic, data);
            }
        }
    };
    MQTTWorker.prototype.addTask = function (topic_in, payload_in) {
        var _this = this;
        this.queue.push({ topic: topic_in, payload: payload_in });
        if (this.workerRunning) {
            return;
        }
        this.workerRunning = true;
        var processNext = function () {
            var item = _this.queue && _this.queue.shift();
            if (!item) {
                _this.workerRunning = false;
                return;
            }
            Fiber(function () {
                var blocked = true;
                var unblock = function () {
                    if (!blocked) {
                        return; // idempotent
                    }
                    blocked = false;
                    processNext();
                };
                if (_this.isVerified(item.topic)) {
                    var topicFuncName = item.topic.replace('/', '_');
                    // only call topic handler function if it exists
                    var handler = _this['topic_' + topicFuncName];
                    if (handler) {
                        handler(item.payload);
                    }
                    else {
                        console.error("unknown topic: " + item.topic);
                    }
                }
                else {
                    console.error("username " + _this.username + " without sensor object (topic '" + item.topic + "')");
                }
                unblock(); // in case the handler didn't already do it
            }).run();
        };
        processNext();
    };
    MQTTWorker.prototype.fixedDataProgessHandler = function (topic, payload) {
        var state = this.getSendState(topic);
        if (payload.byteLength) {
            var p = payload.readUInt16LE(0);
            if (state) {
                state.packets_received = p;
                return p / state.total_packets * 100;
            }
        }
        return 0;
    };
    MQTTWorker.prototype.fixedDataAckHandler = function (topic, payload) {
        var _this = this;
        var ack = payload.readUInt16LE(0);
        var state = this.topicSendState.get(topic);
        if (this.test && (topic === "t/" + this.username + "/fixeddatatest")) {
            var testFinished = this.test.got_ack(ack);
            if (testFinished) {
                console.log('test is finished');
                this.test = undefined;
            }
            return false;
        }
        var done = false;
        if (state) {
            if (ack === state.total_packets) {
                this.topicSendState.delete(topic);
                done = true;
            }
            else if (ack > state.total_packets) {
                if (ack === 0xFFFF) {
                    // got force ack, stop retrying this transfer: failure
                    console.error('Got Force ACK, transfer failed');
                }
                else {
                    console.error("Got illegal ack. ack (" + ack + ") > transfer size " + state.total_packets);
                }
                this.topicSendState.delete(topic);
                done = true;
            }
            else {
                // retry from acked packet
                if (state.retry()) {
                    state.data.slice(ack).forEach(function (packet) { return _this.mqtt_client.publish(topic, packet); });
                }
                else {
                    console.error('Send transfer failed: too many retries');
                }
            }
        }
        else {
            console.error("cannot find send state for topic " + topic);
        }
        return done;
    };
    MQTTWorker.prototype.fixedDataReceiveHandler = function (topic, payload) {
        var state = this.getReceiveState(topic);
        var packet_number = payload.readUInt16LE(0);
        var rmsg = new Buffer(2);
        var valid = true;
        // Check if packet number is expected
        if (!(packet_number === state.packets_received())) {
            console.error("unexpected packet number, got " + packet_number + ", expected " + state.packets_received());
            valid = false;
            if (packet_number === 0) {
                console.log('got packet no. 0: reset state for new transfer');
                state.clear();
                if (!state.retry()) {
                    // send 0xFFFF to Force Ack, failed too many times in a row
                    rmsg.writeUInt16LE(0xFFFF, 0);
                    console.error('MAX RETRIES reached: sending force ack');
                }
                valid = true;
            }
        }
        // if packet number is first packet in transfer: set total_packets
        if (packet_number === 0) {
            state.total_packets = payload.readUInt16LE(2);
        }
        else if (state.total_packets && (state.total_packets !== payload.readUInt16LE(2))) {
            // total package changed unexpectedly
            console.error('total package changed unexpectedly: sending 0 ack, reset state');
            valid = false;
            state.clear();
            if (state.retry()) {
                // send Ack to restart transfer from last correct package received
                rmsg.writeUInt16LE(0, 0);
            }
            else {
                // send 0xFFFF to Force Ack, failed too many times in a row
                rmsg.writeUInt16LE(0xFFFF, 0);
                console.error('MAX RETRIES reached: sending force ack');
            }
            this.mqtt_client.publish(mqtt_utils_1.getAckTopicName(topic), rmsg);
            return;
        }
        if (valid) {
            // add payload after header to data store
            state.data.push(payload.slice(4));
            // console.log('packet:', packet_number);
        }
        if (packet_number === (state.total_packets - 1)) {
            var complete = false;
            var all_data = void 0;
            // concatenate data and do something...
            if (state.tranfser_complete()) {
                all_data = Buffer.concat(state.data);
                if (mqtt_utils_1.checkCRC32(all_data)) {
                    var data = all_data.slice(0, -4);
                    console.log('transfer complete');
                    complete = true;
                    state.reset_retries();
                    rmsg.writeUInt16LE(state.packets_received(), 0);
                }
                else {
                    console.error('transfer failed: checksum error');
                    if (state.retry()) {
                        // send 0 as Ack to restart transfer, because crc32 failed
                        rmsg.writeUInt16LE(0, 0);
                        console.log('sending 0 ack');
                    }
                    else {
                        // send 0xFFFF to Force Ack, failed too many times in a row
                        console.error('MAX RETRIES reached: sending force ack');
                        rmsg.writeUInt16LE(0xFFFF, 0);
                    }
                }
                state.clear();
            }
            else {
                console.warn("transfer incomplete, nack at " + state.packets_received());
                if (state.retry()) {
                    // send Ack to restart transfer from last correct package received
                    rmsg.writeUInt16LE(state.packets_received(), 0);
                }
                else {
                    // send 0xFFFF to Force Ack, failed too many times in a row
                    console.error('MAX RETRIES reached: sending force ack');
                    rmsg.writeUInt16LE(0xFFFF, 0);
                }
            }
            // console.log('sending ack on:', getAckTopicName(topic));
            this.mqtt_client.publish(mqtt_utils_1.getAckTopicName(topic), rmsg);
            return complete ? all_data : undefined;
        }
        return;
    };
    return MQTTWorker;
}());
exports.MQTTWorker = MQTTWorker;
