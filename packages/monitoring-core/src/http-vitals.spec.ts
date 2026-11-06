import { expect, it } from 'vitest'
import { HttpTransport } from './http-transport.js'
it('keeps Web Vitals uploads alive during page hide', async () => {
  const requests: RequestInit[]=[]
  const transport = new HttpTransport('https://pms.test/sdk/id','key',((_url: unknown, init: RequestInit)=>{requests.push(init);return Promise.resolve({ok:true})}) as typeof fetch)
  await transport.send({version:1,type:'web_vitals',eventId:'event',sentAt:new Date().toISOString(),page:{id:'page',startedAt:new Date().toISOString(),route:'/',navigationType:'navigate'},measurements:[]})
  expect(requests[0]?.keepalive).toBe(true)
})
