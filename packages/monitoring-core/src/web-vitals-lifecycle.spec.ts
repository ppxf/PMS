import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const observers = vi.hoisted(() => new Map<string, (metric: unknown) => void>())
vi.mock('web-vitals/attribution', () => Object.fromEntries(['CLS','FCP','INP','LCP','TTFB'].map(name => [`on${name}`, (report: (metric: unknown) => void) => observers.set(name, report)])))
import { createMonitoringClient } from './client.js'
import type { MonitoringEnvelope } from './types.js'
import type { WebVitalsEnvelope } from './web-vitals-types.js'
const clients: ReturnType<typeof createMonitoringClient>[] = []
const dsn = 'https://key@monitor.example.com/api/sdk/project'
function browser() {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), {visibilityState: 'visible'}))
  vi.stubGlobal('location', {pathname: '/checkout', href: 'https://example.com/checkout?secret=1#private'})
}
function setup(tracesSampleRate = 0) {
  const sent: MonitoringEnvelope[] = []
  const client = createMonitoringClient(); clients.push(client)
  client.init({dsn, tracesSampleRate, transport: {send: e => {sent.push(e); return Promise.resolve()}}})
  return {client, vitals: () => sent.filter((e): e is WebVitalsEnvelope => e.type === 'web_vitals')}
}
function report(name: string, value: number, attribution: object = {}) {
  observers.get(name)!({name, value, id: `metric-${name}`, attribution})
}
beforeEach(() => { observers.clear() })
afterEach(() => { for (const c of clients.splice(0)) c.resetClientForTests(); vi.unstubAllGlobals() })
describe('automatic document Web Vitals', () => {
  it('collects without custom metrics or traces and preserves missing INP and zero CLS', async () => {
    browser(); const {client, vitals} = setup(); await client.flush()
    expect(vitals()).toHaveLength(1)
    expect(vitals()[0]?.page.route).toBe('/checkout')
    expect(vitals()[0]?.measurements).toEqual([])
    expect(observers.size).toBe(5)
    report('CLS', 0); report('LCP', 2000); await client.flush()
    expect(vitals().flatMap(e=>e.measurements).map(x=>[x.name,x.value])).toEqual([['CLS',0],['LCP',2000]])
    expect(vitals().some(e=>e.measurements.some(m=>m.name==='INP'))).toBe(false)
  })
  it('deduplicates unchanged values and updates revisions within the same document identity', async () => {
    browser(); const {client,vitals} = setup(); await client.flush()
    report('LCP',1000); report('LCP',1000); report('LCP',3000); await client.flush()
    expect(vitals().flatMap(e=>e.measurements).map(x=>x.revision)).toEqual([1,2])
    expect(new Set(vitals().map(e=>e.page.id)).size).toBe(1)
    Object.assign(location,{pathname:'/next'}); report('CLS',0.2); await client.flush()
    expect(vitals().at(-1)?.page.route).toBe('/checkout')
  })
  it('preserves an observed zero INP reported by the official library', async () => {
    browser();const {client,vitals}=setup();await client.flush();report('INP',0);await client.flush()
    expect(vitals().flatMap(e=>e.measurements).find(m=>m.name==='INP')?.value).toBe(0)
  })
  it('creates a new experience on BFCache restoration', async () => {
    browser(); const {client,vitals} = setup(); await client.flush()
    const old = vitals()[0].page.id
    window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true})); report('LCP',500); await client.flush()
    expect(vitals().at(-1)?.page.id).not.toBe(old)
    expect(vitals().at(-1)?.page.navigationType).toBe('back-forward-cache')
    expect(vitals().at(-1)?.measurements[0]?.revision).toBe(1)
  })
  it('keeps a failed envelope for a later flush without losing newer updates', async () => {
    browser(); const sent: WebVitalsEnvelope[]=[]; let fail=true
    const client=createMonitoringClient();clients.push(client)
    client.init({dsn,transport:{send:e=>{if(e.type==='web_vitals'){if(fail)return Promise.reject(new Error('offline'));sent.push(e)}return Promise.resolve()}}})
    await client.flush(); report('INP',220); fail=false; await client.flush(); await client.flush()
    expect(sent).toHaveLength(2)
    expect(sent[1]?.measurements[0]).toMatchObject({name:'INP',value:220,revision:1})
  })
  it('does not collect in SSR', async () => {
    const {client,vitals}=setup(); await client.flush(); expect(vitals()).toEqual([])
  })
  it('dispatches final measurements on hide while a previous upload is unresolved', async () => {
    browser();const sent: WebVitalsEnvelope[]=[];let finishFirst!:()=>void
    const client=createMonitoringClient();clients.push(client)
    client.init({dsn,transport:{send:e=>{if(e.type!=='web_vitals')return Promise.resolve();sent.push(e);return sent.length===1?new Promise<void>(resolve=>{finishFirst=resolve}):Promise.resolve()}}})
    await Promise.resolve();report('LCP',2200);report('CLS',0.2);report('INP',230)
    Object.assign(document,{visibilityState:'hidden'});document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();await Promise.resolve()
    const final=sent.slice(1).flatMap(e=>e.measurements)
    finishFirst();await client.flush()
    expect(final.map(m=>m.name).sort()).toEqual(['CLS','INP','LCP'])
  })
  it('uses the initial page trace after the active page context changes', async () => {
    browser(); const {client,vitals}=setup(1)
    const page=client.startInactiveSpan({name:'page',op:'pageload'});client.setPageSpan(page)
    await client.flush()
    const next=client.startInactiveSpan({name:'next',op:'navigation'});client.setPageSpan(next)
    report('LCP',1000);await client.flush()
    expect(vitals().at(-1)?.page.traceId).toBe(page.context.traceId)
  })
  it('uses the initial route template and removes URL secrets and DOM selectors from attribution', async () => {
    browser(); const {client,vitals}=setup();client.setWebVitalsRouteResolver(()=>'/products/:id');await client.flush()
    report('LCP',1500,{url:'https://user:password@example.test/image.webp?token=secret#private',target:'img#user-email',elementRenderDelay:100,html:'private text'})
    await client.flush()
    expect(vitals().at(-1)?.page.route).toBe('/products/:id')
    expect(vitals().at(-1)?.measurements[0]?.attribution).toEqual({url:'/image.webp',target:'img',elementRenderDelay:100})
  })
})
