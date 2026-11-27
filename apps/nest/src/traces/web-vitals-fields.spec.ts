import { SPAN_FIELD_MAP } from './traces-contract';
import { SpanQueryPipe } from './traces-validation';
describe('Web Vitals query fields', () => {
  it('describes LCP size as visible area and CLS as unitless', () => {
    expect(SPAN_FIELD_MAP.get('browser.web_vital.lcp.size')?.unit).toBe('px²');
    expect(SPAN_FIELD_MAP.get('browser.web_vital.cls.value')?.unit).toBe(
      'none',
    );
  });
  it.each([
    'lcp.value',
    'inp.value',
    'cls.value',
    'fcp.value',
    'ttfb.value',
    'lcp.load_time',
    'lcp.render_time',
    'lcp.size',
    'lcp.timeToFirstByte',
    'lcp.resourceLoadDelay',
    'lcp.resourceLoadDuration',
    'lcp.elementRenderDelay',
    'inp.input_delay',
    'inp.processing_duration',
    'inp.presentation_delay',
  ])(
    'supports numeric aggregation and filtering without offering continuous values for grouping: %s',
    (key) => {
      expect(SPAN_FIELD_MAP.get(`browser.web_vital.${key}`)).toMatchObject({
        type: 'number',
        groupable: false,
        operators: expect.arrayContaining(['gt', 'exists']),
        aggregations: expect.arrayContaining(['p75']),
      });
    },
  );
  it.each([
    'lcp.url',
    'lcp.element',
    'inp.interactionTarget',
    'inp.interaction_type',
  ])('supports string dimensions: %s', (key) => {
    expect(SPAN_FIELD_MAP.get(`browser.web_vital.${key}`)).toMatchObject({
      type: 'string',
      groupable: true,
    });
  });
  it('retains numeric metrics and alias filters while rejecting their use as groups', () => {
    const pipe = new SpanQueryPipe();
    const input = {
      start: '2026-11-26T00:00:00Z',
      end: '2026-11-27T00:00:00Z',
      metrics: [{ function: 'p95', field: 'browser.web_vital.lcp.value' }],
      filters: [
        {
          field: 'browser.web_vital.inp.target',
          operator: 'eq',
          value: 'button',
        },
      ],
      groupBy: ['release'],
    };
    expect(pipe.transform(input).groupBy).toEqual(['release']);
    expect(() =>
      pipe.transform({ ...input, groupBy: ['browser.web_vital.lcp.value'] }),
    ).toThrow();
    expect(() =>
      pipe.transform({ ...input, groupBy: ['browser.web_vital.inp.target'] }),
    ).toThrow();
    expect(
      pipe.transform({
        ...input,
        groupBy: ['browser.web_vital.inp.interactionTarget'],
      }).groupBy,
    ).toEqual(['browser.web_vital.inp.interactionTarget']);
    expect(
      SPAN_FIELD_MAP.get('browser.web_vital.inp.target')?.operators,
    ).toContain('eq');
  });
});
