import { Callback, Context, EventBridgeEvent } from 'aws-lambda'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomHandler<TEvent = any, TResult = any, TContext = any> = (
  event: TEvent,
  context: Context & TContext,
  callback: Callback<TResult>,
) => void | Promise<TResult>

export type CustomEventBridgeHandler<
  TDetailType extends string,
  TDetail,
  TResult,
  TContext,
> = CustomHandler<EventBridgeEvent<TDetailType, TDetail>, TResult, TContext>

export * as utils from './utils/index.js'
