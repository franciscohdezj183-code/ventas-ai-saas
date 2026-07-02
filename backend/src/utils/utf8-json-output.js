import fs from 'node:fs';

export function jsonLine(value) {
  return JSON.stringify(value);
}

export function utf8LineBuffer(line) {
  return Buffer.from(`${line}\n`, 'utf8');
}

export function appendUtf8JsonLine(filePath, value) {
  fs.appendFileSync(filePath, utf8LineBuffer(jsonLine(value)));
}

export function writeUtf8JsonToStream(stream, value) {
  stream.write(utf8LineBuffer(jsonLine(value)));
}
