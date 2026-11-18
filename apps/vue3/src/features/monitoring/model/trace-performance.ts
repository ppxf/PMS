import { intlLocale } from '@/i18n'
import type { Span } from './traces'
import type { VitalSample } from './web-vitals'

export interface TraceVitalMarker {
  key: string
  name: string
  value: number
  at: number
}

// Paint values are document-relative timestamps. CLS scores and INP durations
// alone cannot identify an event position on the timeline.
export function traceVitalMarkers(samples: VitalSample[]): TraceVitalMarker[] {
  return samples
    .flatMap((sample) => {
      const origin = Date.parse(sample.startedAt)
      if (!Number.isFinite(origin)) return []
      return sample.measurements.flatMap((measurement) =>
        ['FCP', 'LCP'].includes(measurement.name) &&
        Number.isFinite(measurement.value) &&
        measurement.value >= 0
          ? [
              {
                key: `${sample.pageViewId}:${measurement.name}`,
                name: measurement.name,
                value: measurement.value,
                at: origin + measurement.value,
              },
            ]
          : [],
      )
    })
    .sort((a, b) => a.at - b.at)
}

export function spanCategory(op: string) {
  if (op.startsWith('resource.')) return 'resource'
  if (op.startsWith('browser.')) return 'browser'
  if (op.startsWith('http')) return 'http'
  return 'operation'
}

const numberLabel = (value: unknown, unit: string) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${value.toLocaleString(intlLocale(), { maximumFractionDigits: 2 })} ${unit}`
    : 'Unavailable'

export function resourceDetails(span: Pick<Span, 'attributes'> & Partial<Span>) {
  const attributes = span.attributes
  const available = attributes['resource.timing_available']
  const scalarText = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : 'Unavailable'
  return [
    {
      label: 'Resource URL',
      value: scalarText(attributes['resource.url'] ?? span.name),
    },
    { label: 'Initiator', value: scalarText(attributes['resource.initiator_type']) },
    { label: 'Protocol', value: scalarText(attributes['network.protocol']) },
    {
      label: 'Timing access',
      value: available === true ? 'Available' : available === false ? 'Unavailable' : 'Unknown',
    },
    {
      label: 'Transferred',
      value: numberLabel(available === false ? undefined : span.transferSize, 'B'),
    },
    {
      label: 'Encoded body',
      value: numberLabel(available === false ? undefined : span.encodedBodySize, 'B'),
    },
    {
      label: 'Decoded body',
      value: numberLabel(available === false ? undefined : span.decodedBodySize, 'B'),
    },
    { label: 'TTFB', value: numberLabel(available === false ? undefined : span.ttfbMs, 'ms') },
    ...Object.entries({
      dns: 'DNS',
      connect: 'Connection',
      tls: 'TLS',
      request: 'Request',
      response: 'Response',
    }).map(([key, label]) => ({
      label,
      value: numberLabel(
        available === false ? undefined : attributes[`resource.${key}_duration`],
        'ms',
      ),
    })),
  ]
}
