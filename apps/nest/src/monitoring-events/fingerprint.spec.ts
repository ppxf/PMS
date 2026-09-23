import { createErrorFingerprint, findCulprit } from './fingerprint';

describe('createErrorFingerprint', () => {
  const firstError = {
    exceptionType: 'TypeError',
    message: 'payment   failed',
    stacktrace:
      'TypeError: payment failed\n  at submitOrder (checkout.ts:10:3)\n  at click (...)',
    url: 'https://app.test/a',
  };

  it('groups equivalent whitespace and the same first stack frame', () => {
    const first = createErrorFingerprint(firstError);
    const second = createErrorFingerprint({
      exceptionType: 'TypeError',
      message: ' payment failed ',
      stacktrace:
        'TypeError: payment failed\n  at submitOrder (checkout.ts:10:3)\n  at another (...)',
      url: 'https://app.test/b',
    });

    expect(second).toEqual(first);
    expect(first).toBe(
      'ccdbb35b4d346ea60fcdafe7ea3d903eebb5329017ad440ca53fb34c4b95dbf4',
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes the exception type, normalized message, and first stack frame', () => {
    const baseline = createErrorFingerprint(firstError);

    expect(
      createErrorFingerprint({ ...firstError, exceptionType: 'RangeError' }),
    ).not.toBe(baseline);
    expect(
      createErrorFingerprint({
        ...firstError,
        message: 'payment failed again',
      }),
    ).not.toBe(baseline);
    expect(
      createErrorFingerprint({
        ...firstError,
        stacktrace:
          'TypeError: payment failed\n  at retryOrder (checkout.ts:12:3)',
      }),
    ).not.toBe(baseline);
  });

  it('returns a stable digest for repeated input', () => {
    expect(createErrorFingerprint(firstError)).toBe(
      createErrorFingerprint(firstError),
    );
  });
});

describe('findCulprit', () => {
  it('uses the first trimmed at line', () => {
    expect(
      findCulprit(
        'TypeError: failed\n  at submitOrder (checkout.ts:10:3)\n at click (...)',
        'https://app.test/a',
      ),
    ).toBe('at submitOrder (checkout.ts:10:3)');
  });

  it('falls back to the URL when no stack frame exists', () => {
    expect(
      findCulprit('TypeError: failed\nother line', 'https://app.test/a'),
    ).toBe('https://app.test/a');
  });

  it('falls back to an empty string without a stack frame or URL', () => {
    expect(findCulprit('TypeError: failed')).toBe('');
    expect(findCulprit()).toBe('');
  });
});
