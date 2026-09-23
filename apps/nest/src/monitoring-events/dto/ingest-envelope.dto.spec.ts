import { BadRequestException } from '@nestjs/common';
import { IngestEnvelopePipe } from '../ingest-envelope.pipe';
import { IngestEnvelopeDto } from './ingest-envelope.dto';

const eventEnvelope = () => ({
  version: 1,
  type: 'event',
  sentAt: '2026-09-23T03:00:00.000Z',
  event: {
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    timestamp: '2026-09-23T02:59:00.000Z',
    type: 'error',
    level: 'error',
    source: 'vue',
    message: 'Render failed',
    exception: { type: 'TypeError', value: 'Render failed' },
  },
});

const clientReport = () => ({
  version: 1,
  type: 'client_report',
  sentAt: '2026-09-23T03:00:00.000Z',
  sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
});

const pipe = new IngestEnvelopePipe();
const validate = (value: unknown): Promise<IngestEnvelopeDto> =>
  Promise.resolve().then(() => pipe.transform(value));

describe('IngestEnvelopeDto', () => {
  // Review R1: invalid raw objects must be rejected before scalar coercion.
  it.each([
    [
      'message',
      {
        ...eventEnvelope(),
        event: { ...eventEnvelope().event, message: { toString: null } },
      },
    ],
    [
      'exception value',
      {
        ...eventEnvelope(),
        event: {
          ...eventEnvelope().event,
          exception: { type: 'Error', value: { toString: null } },
        },
      },
    ],
    [
      'SDK name',
      { ...clientReport(), sdk: { name: { toString: null }, version: '1' } },
    ],
    ['version', { ...eventEnvelope(), version: { toString: null } }],
  ])(
    'returns 400 for an object-valued %s without attempting coercion',
    async (_name, input) => {
      await expect(validate(input)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  // Review R2: validate raw own keys before a transformer can silently drop them.
  it.each(['__proto__', 'prototype', 'constructor', 'toString'])(
    'rejects the unknown raw key %s at every fixed-schema level',
    async (key) => {
      const extra = Object.fromEntries([[key, 'unexpected']]);
      const input = eventEnvelope();
      for (const value of [
        { ...input, ...extra },
        { ...input, event: { ...input.event, ...extra } },
        {
          ...input,
          event: {
            ...input.event,
            exception: { ...input.event.exception, ...extra },
          },
        },
        { ...clientReport(), sdk: { ...clientReport().sdk, ...extra } },
      ]) {
        await expect(validate(value)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    },
  );

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects the reserved tag key %s',
    async (key) => {
      const input = eventEnvelope();
      const tags = Object.fromEntries([[key, 'value']]);
      await expect(
        validate({ ...input, event: { ...input.event, tags } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('preserves a valid toString tag in the accepted envelope', async () => {
    const input = eventEnvelope();
    const result = await validate({
      ...input,
      event: { ...input.event, tags: { toString: 'user-provided tag' } },
    });
    expect(Object.hasOwn(result.event!.tags!, 'toString')).toBe(true);
    expect(result.event!.tags).toEqual({ toString: 'user-provided tag' });
  });

  // Review R3: accepted protocol timestamps must be RFC3339 and Date.parse-able.
  it.each([
    '20260923T030000Z',
    '2026-W39-3T03:00:00Z',
    '2026-266T03:00:00Z',
    '2026-09-23',
    '2026-09-23T03:00:00',
    '2026-02-30T03:00:00Z',
    '2026-09-23T24:00:00Z',
  ])('rejects %s in both protocol timestamp fields', async (timestamp) => {
    const input = eventEnvelope();
    await expect(
      validate({ ...input, sentAt: timestamp }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate({ ...input, event: { ...input.event, timestamp } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    '2026-09-23T03:00:00Z',
    '2026-09-23T03:00:00.123456Z',
    '2026-09-23T11:00:00+08:00',
    '2026-09-22T20:00:00-07:00',
  ])(
    'accepts the RFC3339 timestamp %s without changing it',
    async (timestamp) => {
      const input = eventEnvelope();
      const result = await validate({
        ...input,
        sentAt: timestamp,
        event: { ...input.event, timestamp },
      });
      expect(result.sentAt).toBe(timestamp);
      expect(result.event!.timestamp).toBe(timestamp);
      expect(Number.isFinite(Date.parse(result.event!.timestamp))).toBe(true);
    },
  );

  // Catches missing nested validation and accidentally optional required fields.
  it('transforms both protocol variants and accepts all supported sources', async () => {
    expect(await validate(clientReport())).toBeInstanceOf(IngestEnvelopeDto);
    for (const source of ['vue', 'window', 'unhandledrejection', 'manual']) {
      const input = eventEnvelope();
      input.event.source = source;
      expect(await validate(input)).toMatchObject(input);
    }
  });

  it.each([
    ['event payload', { ...eventEnvelope(), event: undefined }],
    ['client SDK', { ...clientReport(), sdk: undefined }],
    ['SDK name', { ...clientReport(), sdk: { version: '0.1.0' } }],
    ['SDK version', { ...clientReport(), sdk: { name: '@pms/sdk-vue' } }],
    ['sentAt', { ...clientReport(), sentAt: undefined }],
    [
      'exception',
      {
        ...eventEnvelope(),
        event: { ...eventEnvelope().event, exception: undefined },
      },
    ],
  ])('rejects a missing %s', async (_name, input) => {
    await expect(validate(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  // Catches accepting unknown keys or fields belonging to the other envelope type.
  it.each([
    ['root extra', { ...eventEnvelope(), extra: true }],
    [
      'event extra',
      { ...eventEnvelope(), event: { ...eventEnvelope().event, extra: true } },
    ],
    [
      'exception extra',
      {
        ...eventEnvelope(),
        event: {
          ...eventEnvelope().event,
          exception: { type: 'Error', value: 'x', extra: true },
        },
      },
    ],
    [
      'SDK extra',
      { ...clientReport(), sdk: { ...clientReport().sdk, extra: true } },
    ],
    ['report event', { ...clientReport(), event: eventEnvelope().event }],
    ['event SDK', { ...eventEnvelope(), sdk: clientReport().sdk }],
    ['event root environment', { ...eventEnvelope(), environment: 'prod' }],
    ['event root release', { ...eventEnvelope(), release: 'v1' }],
  ])('rejects %s', async (_name, input) => {
    await expect(validate(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['version', 2],
    ['version string', '1'],
    ['type', 'transaction'],
    ['sentAt', 'yesterday'],
  ])('rejects an invalid root %s', async (key, value) => {
    await expect(
      validate({
        ...eventEnvelope(),
        [key === 'version string' ? 'version' : key]: value,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Catches global implicit conversion turning invalid JSON scalars into strings.
  it.each([
    [
      'event message',
      { ...eventEnvelope(), event: { ...eventEnvelope().event, message: 42 } },
    ],
    [
      'event URL',
      { ...eventEnvelope(), event: { ...eventEnvelope().event, url: 42 } },
    ],
    [
      'event environment',
      {
        ...eventEnvelope(),
        event: { ...eventEnvelope().event, environment: 42 },
      },
    ],
    [
      'event release',
      { ...eventEnvelope(), event: { ...eventEnvelope().event, release: 42 } },
    ],
    [
      'exception type',
      {
        ...eventEnvelope(),
        event: {
          ...eventEnvelope().event,
          exception: { type: 42, value: 'x' },
        },
      },
    ],
    [
      'exception value',
      {
        ...eventEnvelope(),
        event: {
          ...eventEnvelope().event,
          exception: { type: 'Error', value: 42 },
        },
      },
    ],
    [
      'exception stacktrace',
      {
        ...eventEnvelope(),
        event: {
          ...eventEnvelope().event,
          exception: { type: 'Error', value: 'x', stacktrace: 42 },
        },
      },
    ],
    ['SDK name', { ...clientReport(), sdk: { name: 42, version: '0.1.0' } }],
    [
      'SDK version',
      { ...clientReport(), sdk: { name: '@pms/sdk-vue', version: 42 } },
    ],
    ['report environment', { ...clientReport(), environment: 42 }],
    ['report release', { ...clientReport(), release: 42 }],
  ])('rejects a non-string %s without coercion', async (_name, input) => {
    await expect(validate(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['eventId', 'not-a-uuid'],
    ['timestamp', 'yesterday'],
    ['type', 'log'],
    ['level', 'warning'],
    ['source', 'react'],
    ['message', undefined],
  ])('rejects an invalid event %s', async (key, value) => {
    const input = eventEnvelope();
    await expect(
      validate({ ...input, event: { ...input.event, [key]: value } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Catches off-by-one limits, including UTF-8 bytes rather than JS string length.
  it.each([
    ['message', 2000],
    ['url', 2048],
    ['environment', 128],
    ['release', 128],
  ])('enforces the %s length boundary', async (key, limit) => {
    const input = eventEnvelope();
    await expect(
      validate({
        ...input,
        event: { ...input.event, [key]: 'x'.repeat(limit) },
      }),
    ).resolves.toBeDefined();
    await expect(
      validate({
        ...input,
        event: { ...input.event, [key]: 'x'.repeat(limit + 1) },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['type', 128],
    ['value', 2000],
  ])('enforces exception.%s length', async (key, limit) => {
    const input = eventEnvelope();
    const withValue = (value: string) => ({
      ...input,
      event: {
        ...input.event,
        exception: { ...input.event.exception, [key]: value },
      },
    });
    await expect(validate(withValue('x'.repeat(limit)))).resolves.toBeDefined();
    await expect(
      validate(withValue('x'.repeat(limit + 1))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['environment', 'release'])(
    'enforces report %s length',
    async (key) => {
      await expect(
        validate({ ...clientReport(), [key]: 'x'.repeat(128) }),
      ).resolves.toBeDefined();
      await expect(
        validate({ ...clientReport(), [key]: 'x'.repeat(129) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('limits stacktrace to 64 KiB of UTF-8', async () => {
    const input = eventEnvelope();
    const withStack = (stacktrace: string) => ({
      ...input,
      event: {
        ...input.event,
        exception: { ...input.event.exception, stacktrace },
      },
    });
    await expect(validate(withStack('x'.repeat(65536)))).resolves.toBeDefined();
    await expect(validate(withStack('x'.repeat(65537)))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      validate(withStack('中'.repeat(21845) + 'x')),
    ).resolves.toBeDefined();
    await expect(
      validate(withStack('中'.repeat(21846))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts tags at all limits', async () => {
    const input = eventEnvelope();
    const tags = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        String(i).padStart(64, 'x'),
        'v'.repeat(256),
      ]),
    );
    await expect(
      validate({ ...input, event: { ...input.event, tags } }),
    ).resolves.toBeDefined();
  });

  it.each([
    [
      'too many tags',
      Object.fromEntries(
        Array.from({ length: 51 }, (_, i) => [String(i), 'v']),
      ),
    ],
    ['long key', { ['x'.repeat(65)]: 'v' }],
    ['long value', { key: 'v'.repeat(257) }],
    ['non-string value', { key: 1 }],
    ['nested value', { key: { nested: 'v' } }],
    ['array', []],
    ['null', null],
    ['string', 'tags'],
  ])('rejects tags with %s', async (_name, tags) => {
    const input = eventEnvelope();
    await expect(
      validate({ ...input, event: { ...input.event, tags } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
