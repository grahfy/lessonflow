// @vitest-environment node

import { describe, expect, it } from "vitest";

import { concatFloat32, encodeWav, encodeWavBlob, type WavEncodeOptions } from "@/lib/guitar-pro/wav-encoder";

const STEREO_44100: WavEncodeOptions = { sampleRate: 44100, channels: 2 };

/** Reads an ASCII-encoded 4-byte tag out of a DataView at `offset`. */
function readTag(view: DataView, offset: number): string {
  let tag = "";
  for (let i = 0; i < 4; i++) {
    tag += String.fromCharCode(view.getUint8(offset + i));
  }
  return tag;
}

describe("wav-encoder", () => {
  it("writes the RIFF/WAVE/fmt /data magic bytes at the canonical offsets", () => {
    const buffer = encodeWav(new Float32Array([0, 0.5, -0.5]), STEREO_44100);
    const view = new DataView(buffer);

    expect(readTag(view, 0)).toBe("RIFF");
    expect(readTag(view, 8)).toBe("WAVE");
    expect(readTag(view, 12)).toBe("fmt ");
    expect(readTag(view, 36)).toBe("data");
  });

  it("writes correct fmt subchunk fields for stereo 44100", () => {
    const buffer = encodeWav(new Float32Array([0, 0, 0, 0]), STEREO_44100);
    const view = new DataView(buffer);

    expect(view.getUint32(16, true)).toBe(16); // fmt subchunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100); // sampleRate
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2); // byteRate = sampleRate * blockAlign
    expect(view.getUint16(32, true)).toBe(2 * 2); // blockAlign = channels * bytesPerSample
  });

  it("writes correct fmt fields for a different channel/sample-rate combo (mono 22050)", () => {
    const buffer = encodeWav(new Float32Array([0, 0]), { sampleRate: 22050, channels: 1 });
    const view = new DataView(buffer);

    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(22050); // sampleRate
    expect(view.getUint32(28, true)).toBe(22050 * 1 * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(1 * 2); // blockAlign
  });

  it("sizes the data subchunk as samples.length * 2 bytes", () => {
    const samples = new Float32Array(10);
    const buffer = encodeWav(samples, STEREO_44100);
    const view = new DataView(buffer);

    expect(view.getUint32(40, true)).toBe(10 * 2);
  });

  it("sizes the overall RIFF chunkSize as 36 + dataSize", () => {
    const samples = new Float32Array(10);
    const buffer = encodeWav(samples, STEREO_44100);
    const view = new DataView(buffer);

    expect(view.getUint32(4, true)).toBe(36 + 10 * 2);
  });

  it("returns a buffer whose total byteLength is the 44-byte header plus data size", () => {
    const samples = new Float32Array(100);
    const buffer = encodeWav(samples, STEREO_44100);

    expect(buffer.byteLength).toBe(44 + 100 * 2);
  });

  it("maps known Float32 values to the expected int16 samples", () => {
    const samples = new Float32Array([1.0, -1.0, 0, 0.5]);
    const buffer = encodeWav(samples, STEREO_44100);
    const view = new DataView(buffer);

    expect(view.getInt16(44 + 0 * 2, true)).toBe(32767); // 1.0 -> 0x7fff
    expect(view.getInt16(44 + 1 * 2, true)).toBe(-32768); // -1.0 -> 0x8000 -> -32768
    expect(view.getInt16(44 + 2 * 2, true)).toBe(0); // 0 -> 0
    expect(view.getInt16(44 + 3 * 2, true)).toBe(16384); // 0.5 * 0x7fff = 16383.5 -> rounds to 16384
  });

  it("clamps out-of-range positive samples to the int16 max", () => {
    const buffer = encodeWav(new Float32Array([2.0]), STEREO_44100);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(32767);
  });

  it("clamps out-of-range negative samples to the int16 min", () => {
    const buffer = encodeWav(new Float32Array([-2.0]), STEREO_44100);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(-32768);
  });

  it("treats NaN samples as silence (0)", () => {
    const buffer = encodeWav(new Float32Array([Number.NaN]), STEREO_44100);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0);
  });

  it("treats +/-Infinity samples as silence (0) rather than propagating", () => {
    const buffer = encodeWav(new Float32Array([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]), STEREO_44100);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);
  });

  it("produces a valid header with a zero-length data subchunk for empty input", () => {
    const buffer = encodeWav(new Float32Array(0), STEREO_44100);
    const view = new DataView(buffer);

    expect(buffer.byteLength).toBe(44);
    expect(view.getUint32(40, true)).toBe(0); // data subchunk size
    expect(view.getUint32(4, true)).toBe(36); // RIFF chunkSize
    expect(readTag(view, 0)).toBe("RIFF");
    expect(readTag(view, 36)).toBe("data");
  });

  it("concatFloat32 concatenates multiple chunks in order", () => {
    const result = concatFloat32([new Float32Array([1, 2]), new Float32Array([3]), new Float32Array([4, 5])]);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    expect(result.length).toBe(5);
  });

  it("concatFloat32 handles an empty array of chunks", () => {
    const result = concatFloat32([]);
    expect(result.length).toBe(0);
  });

  it("concatFloat32 handles chunks that include empty arrays", () => {
    const result = concatFloat32([new Float32Array([1]), new Float32Array(0), new Float32Array([2])]);
    expect(Array.from(result)).toEqual([1, 2]);
  });

  it("encodeWavBlob returns a Blob of type audio/wav with the same byte length as encodeWav", () => {
    const samples = new Float32Array([0, 0.25, -0.25]);
    const blob = encodeWavBlob(samples, STEREO_44100);
    const buffer = encodeWav(samples, STEREO_44100);

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(buffer.byteLength);
  });
});
