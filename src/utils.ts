import { crc32 } from 'crc';
import { PBKDF2, algo, enc } from 'crypto-js';
import * as crypto from 'crypto';

export namespace utils {

  export function getAckTopicName(topic: string) {
    return 't' + topic.slice(1) + '/ack';
  }

  export function createFixedDataPacket(data: Buffer, maxPacketSize: number) {

    const checksum = new Buffer(4);
    checksum.writeUInt32LE(crc32(data), 0);
    data = Buffer.concat([data, checksum]);

    let N = Math.floor(data.byteLength / maxPacketSize);
    if (data.byteLength % maxPacketSize) {
      N += 1;
    }

    const packets: Buffer[] = [];
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

  export function checkCRC32(data: Buffer) {
    const N = data.byteLength;
    if (N) {
      const checksum = data.readUInt32LE(N - 4);
      return checksum === crc32(data.slice(0, N - 4));
    }
    return false;
  }

  export function randomSecret(n: number) {
    return crypto.randomBytes(n).toString('hex');
  }

  export function password_encoding(password: string) {
    const salt = randomSecret(20);
    const iterations = 1;
    const word = PBKDF2(password, salt, { keySize: 512 / 32, hasher: algo.SHA256, iterations });
    const hash = enc.Base64.stringify(word);
    const pw_store = `PBKDF2$sha256$${iterations}$${salt}$${hash}`;
    return pw_store;
  }

  export function newMQttLoginCredentials() {
    const password = randomSecret(16);
    const random = randomSecret(48);
    const username = randomSecret(4);

    return { username, password, random };
  }
}
