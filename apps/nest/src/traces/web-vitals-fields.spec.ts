import { SPAN_FIELD_MAP } from './traces-contract';
describe('Web Vitals query fields', () => {
  it.each([
    'lcp.value',
    'inp.value',
    'cls.value',
    'fcp.value',
    'ttfb.value',
    'lcp.load_time',
    'lcp.render_time',
    'lcp.size',
    'inp.input_delay',
    'inp.processing_duration',
    'inp.presentation_delay',
  ])('supports numeric aggregation, filtering and grouping: %s', (key) => {
    expect(SPAN_FIELD_MAP.get(`browser.web_vital.${key}`)).toMatchObject({
      type: 'number',
      groupable: true,
      operators: expect.arrayContaining(['gt', 'exists']),
      aggregations: expect.arrayContaining(['p75']),
    });
  });
  it.each(['lcp.url', 'inp.target', 'inp.interaction_type'])(
    'supports string dimensions: %s',
    (key) => {
      expect(SPAN_FIELD_MAP.get(`browser.web_vital.${key}`)).toMatchObject({
        type: 'string',
        groupable: true,
      });
    },
  );
});

