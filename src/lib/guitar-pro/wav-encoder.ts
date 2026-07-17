/**
 * WAV (RIFF/WAVE) encoder for alphaTab audio-export PCM chunks (Guitar Pro
 * Phase B.2 — Guitar Pro viewer's "download audio" feature).
 *
 * alphaTab 1.8.4's `api.exportAudio()` streams raw PCM audio one
 * `AudioExportChunk` at a time (one chunk per `render()` call on the
 * returned exporter). Each chunk's `samples` field is a `Float32Array`.
 *
 * CHANNEL LAYOUT ASSUMPTION: the official alphaTab audio-export guide
 * (https://www.alphatab.net/docs/guides/audio-export) does not explicitly
 * spell out "interleaved" vs "planar" in prose, but its own WAV-encoding
 * example writes `chunk.samples` directly into the WAV file's `data`
 * subchunk sample-by-sample with no deinterleaving step, and WAV's `data`
 * subchunk is itself natively interleaved per-frame (L,R,L,R,... for
 * stereo). The guide also defaults `AudioExportOptions` to 2 channels
 * (`channels = 2`) and a 44100 Hz sample rate. Taken together, this module
 * assumes `samples` is INTERLEAVED stereo (L,R,L,R,...) at those defaults,
 * and documents that assumption here since it could not be independently
 * confirmed against alphaTab's TypeScript source. If a future alphaTab
 * version (or a different `AudioExportOptions.channels` value) changes
 * this, only the `channels`/`sampleRate` passed into `encodeWav` need to
 * change — the encoder itself is channel-count agnostic.
 *
 * DELIBERATELY has no dependency on React, alphaTab, or the DOM (other
 * than the `Blob` constructor used only by the thin `encodeWavBlob`
 * wrapper): `encodeWav` and `concatFloat32` are pure and unit-testable in
 * isolation from the (separately owned) viewer component that collects
 * the streamed chunks and triggers the download.
 */

/** Encoding parameters for `encodeWav` / `encodeWavBlob`. */
export interface WavEncodeOptions {
  /** Samples per second per channel, e.g. 44100. */
  sampleRate: number;
  /** Number of interleaved audio channels, e.g. 2 for stereo. */
  channels: number;
}

const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const PCM_FORMAT = 1; // WAVE_FORMAT_PCM
const RIFF_HEADER_SIZE = 44; // fixed size of the canonical 44-byte WAV header this module writes

/**
 * Converts a single Float32 sample into a 16-bit signed PCM integer.
 * LOGIC: clamps to [-1, 1] first (out-of-range samples are clipped rather
 * than wrapped), then scales by the appropriate positive/negative int16
 * bound and rounds. NaN/Infinity (and -Infinity) are treated as silence
 * (0) rather than propagating into corrupt/clipped-wrong audio data.
 */
function floatSampleToInt16(sample: number): number {
  if (!Number.isFinite(sample)) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(-1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

/**
 * Encodes raw interleaved Float32 PCM samples into a canonical 16-bit
 * PCM WAV (RIFF/WAVE) container.
 *
 * Pure and framework-free: returns the raw bytes as an `ArrayBuffer` so it
 * can be unit-tested with a plain `DataView`, wrapped in a `Blob` for
 * browser download (see `encodeWavBlob`), or written to disk in Node.
 *
 * `samples.length === 0` produces a valid 44-byte header with a
 * zero-length `data` subchunk rather than throwing.
 */
export function encodeWav(samples: Float32Array, options: WavEncodeOptions): ArrayBuffer {
  const { sampleRate, channels } = options;
  const dataSize = samples.length * BYTES_PER_SAMPLE;
  const blockAlign = channels * BYTES_PER_SAMPLE;
  const byteRate = sampleRate * blockAlign;

  const buffer = new ArrayBuffer(RIFF_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // chunkSize: 4 (WAVE) + 24 (fmt chunk) + 8 (data header) + dataSize
  writeAsciiString(view, 8, "WAVE");

  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt subchunk size (16 for PCM)
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true); // bitsPerSample

  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = RIFF_HEADER_SIZE;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, floatSampleToInt16(samples[i]), true);
    offset += BYTES_PER_SAMPLE;
  }

  return buffer;
}

/** Writes an ASCII string into a `DataView` at `offset`, one byte per char (no null terminator). */
function writeAsciiString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

/**
 * Concatenates streamed `AudioExportChunk.samples` arrays into a single
 * Float32Array, ready for `encodeWav`.
 *
 * LOGIC: allocates the destination buffer once (summed length) and copies
 * each chunk in with `.set()`, rather than reallocating/growing on every
 * chunk in a loop.
 */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Thin browser wrapper around `encodeWav`: same encoding, packaged as a
 * downloadable `Blob` of type "audio/wav". Kept trivial so the actual
 * encoding logic in `encodeWav` stays pure and independently testable.
 */
export function encodeWavBlob(samples: Float32Array, options: WavEncodeOptions): Blob {
  return new Blob([encodeWav(samples, options)], { type: "audio/wav" });
}
