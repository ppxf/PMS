import 'reflect-metadata';
import { HttpStatus, RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SKIP_RESPONSE_WRAP_KEY } from '../common/decorators/skip-response-wrap.decorator';
import { IngestEnvelopeDto } from './dto/ingest-envelope.dto';
import { SdkEnvelopeController } from './sdk-envelope.controller';

describe('SdkEnvelopeController', () => {
  // Catches dropped projectId/header/payload when forwarding the public request.
  it('passes the route id, key and transformed DTO to ingestion', async () => {
    const ingest = jest.fn(() => Promise.resolve(undefined));
    const controller = new SdkEnvelopeController({ ingest } as never);
    const envelope = (await new ValidationPipe({ transform: true }).transform(
      {
        version: 1,
        type: 'client_report',
        sentAt: '2026-09-23T03:00:00.000Z',
        sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
      },
      { type: 'body', metatype: IngestEnvelopeDto },
    )) as IngestEnvelopeDto;

    await expect(
      controller.ingest(
        '550e8400-e29b-41d4-a716-446655440000',
        'public-key',
        envelope,
        {},
      ),
    ).resolves.toBeUndefined();
    expect(ingest).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'public-key',
      envelope,
      {},
    );
    expect(envelope).toBeInstanceOf(IngestEnvelopeDto);
    await controller.ingest(
      '550e8400-e29b-41d4-a716-446655440000',
      undefined,
      envelope,
      {},
    );
    expect(ingest).toHaveBeenLastCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      undefined,
      envelope,
      {},
    );
  });

  it('forwards all ingress headers for request context enrichment', async () => {
    const ingest = jest.fn(() => Promise.resolve(undefined));
    const controller = new SdkEnvelopeController({ ingest } as never);
    const envelope = {
      version: 1,
      type: 'client_report',
      sentAt: '2026-09-23T03:00:00.000Z',
      sdk: { name: '@pms/sdk-vue', version: '0.1.0' },
    } as IngestEnvelopeDto;
    const headers = { accept: 'application/json', 'x-pms-key': 'public-key' };

    await controller.ingest(
      '550e8400-e29b-41d4-a716-446655440000',
      'public-key',
      envelope,
      headers,
    );

    expect(ingest).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      'public-key',
      envelope,
      headers,
    );
  });

  // Catches registration as a private/wrapped route or a 200/201 response.
  it('registers the public unwrapped POST envelope route with HTTP 202', () => {
    const handler = Object.getOwnPropertyDescriptor(
      SdkEnvelopeController.prototype,
      'ingest',
    )!.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, SdkEnvelopeController)).toBe(
      'sdk',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':projectId/envelope',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.ACCEPTED,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(SKIP_RESPONSE_WRAP_KEY, handler)).toBe(true);
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      SdkEnvelopeController,
      'ingest',
    ) as Record<string, { data: string; index: number; pipes: unknown[] }>;
    expect(args[`${RouteParamtypes.PARAM}:0`]).toMatchObject({
      data: 'projectId',
      index: 0,
    });
    expect(args[`${RouteParamtypes.PARAM}:0`].pipes).toHaveLength(1);
    expect(args[`${RouteParamtypes.HEADERS}:1`]).toMatchObject({
      data: 'x-pms-key',
      index: 1,
    });
    expect(args[`${RouteParamtypes.BODY}:2`]).toMatchObject({ index: 2 });
  });
});
