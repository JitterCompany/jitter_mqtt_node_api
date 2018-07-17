"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var crc_1 = require("crc");
function getAckTopicName(topic) {
    return 't' + topic.slice(1) + '/ack';
}
exports.getAckTopicName = getAckTopicName;
function createFixedDataPacket(data, maxPacketSize) {
    var checksum = new Buffer(4);
    checksum.writeUInt32LE(crc_1.crc32(data), 0);
    data = Buffer.concat([data, checksum]);
    var N = Math.floor(data.byteLength / maxPacketSize);
    if (data.byteLength % maxPacketSize) {
        N += 1;
    }
    var packets = [];
    var header = new Buffer(4);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(N, 2);
    for (var i = 0; i < N; i++) {
        header.writeUInt16LE(i, 0);
        packets.push(Buffer.concat([
            header,
            data.slice(i * maxPacketSize, (i + 1) * maxPacketSize)
        ]));
    }
    return packets;
}
exports.createFixedDataPacket = createFixedDataPacket;
function checkCRC32(data) {
    var N = data.byteLength;
    if (N) {
        var checksum = data.readUInt32LE(N - 4);
        return checksum === crc_1.crc32(data.slice(0, N - 4));
    }
    return false;
}
exports.checkCRC32 = checkCRC32;
