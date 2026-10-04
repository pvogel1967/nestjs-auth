import type { ServerResponse } from 'node:http';
import { NEVER, Observable } from 'rxjs';

import { StringTo } from './helper-types.js';

export function observableResponse(
  response: ServerResponse,
  msg: StringTo<any>,
  code: number,
): Observable<any> {
  response.statusCode = code;
  response.setHeader('content-type', 'application/json');
  response.flushHeaders();
  response.write(JSON.stringify(msg));
  response.end();

  return NEVER;
}
