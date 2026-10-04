import type { Request as ExpressRequest } from 'express';

import { IdentityBill } from './types.js';

export type StringTo<T> = { [key: string]: T };
export type IdentityTag<TIdentity extends IdentityBill = IdentityBill> = {
  identity: TIdentity;
};

/**
 * The platform's request once authentication has run: its `identity`, and
 * `locals` for data the rights tree attaches. `TRequest` defaults to Express's
 * `Request`; Fastify apps pass `FastifyRequest`.
 */
export type IdentifiedRequest<TIdentity extends IdentityBill = IdentityBill, TRequest = ExpressRequest> = TRequest & {
  locals: StringTo<any>;
} & IdentityTag<TIdentity>;

export type ExpressRequestWithLocals = ExpressRequest & {
  locals: StringTo<any>;
};
export type IdentifiedExpressRequest<TIdentity extends IdentityBill = IdentityBill> = IdentifiedRequest<
  TIdentity,
  ExpressRequest
>;
