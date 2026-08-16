import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

/**
 * Keep the controller response untouched. Use for SSE, streaming, downloads,
 * redirects, or handlers that manage the platform response directly.
 */
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
