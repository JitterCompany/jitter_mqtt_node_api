"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utils = void 0;
const crc_1 = require("crc");
const crypto_js_1 = require("crypto-js");
const crypto = require("crypto");
var utils;
(function (utils) {
    function getAckTopicName(topic) {
        return 't' + topic.slice(1) + '/ack';
    }
    utils.getAckTopicName = getAckTopicName;
    function createFixedDataPacket(data, maxPacketSize) {
        const checksum = new Buffer(4);
        checksum.writeUInt32LE(crc_1.crc32(data), 0);
        data = Buffer.concat([data, checksum]);
        let N = Math.floor(data.byteLength / maxPacketSize);
        if (data.byteLength % maxPacketSize) {
            N += 1;
        }
        const packets = [];
        const header = new Buffer(4);
        header.writeUInt16LE(0, 0);
        header.writeUInt16LE(N, 2);
        for (let i = 0; i < N; i++) {
            header.writeUInt16LE(i, 0);
            packets.push(Buffer.concat([
                header,
                data.slice(i * maxPacketSize, (i + 1) * maxPacketSize)
            ]));
        }
        return packets;
    }
    utils.createFixedDataPacket = createFixedDataPacket;
    function checkCRC32(data) {
        const N = data.byteLength;
        if (N) {
            const checksum = data.readUInt32LE(N - 4);
            return checksum === crc_1.crc32(data.slice(0, N - 4));
        }
        return false;
    }
    utils.checkCRC32 = checkCRC32;
    function randomSecret(n) {
        return crypto.randomBytes(n).toString('base64').slice(0, n);
    }
    utils.randomSecret = randomSecret;
    function password_encoding(password) {
        const salt = randomSecret(20);
        const iterations = 1;
        const word = crypto_js_1.PBKDF2(password, salt, { keySize: 512 / 32, hasher: crypto_js_1.algo.SHA256, iterations });
        const hash = crypto_js_1.enc.Base64.stringify(word);
        const pw_store = `PBKDF2$sha256$${iterations}$${salt}$${hash}`;
        return pw_store;
    }
    utils.password_encoding = password_encoding;
    function newMQttLoginCredentials() {
        const password = randomSecret(16);
        const random = randomSecret(48);
        const username = randomSecret(4);
        return { username, password, random };
    }
    utils.newMQttLoginCredentials = newMQttLoginCredentials;
})(utils = exports.utils || (exports.utils = {}));
//# sourceMappingURL=utils.js.map