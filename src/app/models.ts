import { z } from "zod";

const SecurityType = z.enum(["stock"]);

const TickStatus = z.enum(["up", "down", "no_change"]);

const OptionDataSchema = z.object({
  option: z.string().uppercase(),
  bid: z.number().nonnegative(),
  bid_size: z.int().nonnegative(),
  ask: z.number().nonnegative(),
  ask_size: z.int().nonnegative(),
  iv: z.number().nonnegative(),
  open_interest: z.int().nonnegative(),
  volume: z.int().nonnegative(),
  delta: z.number(),
  gamma: z.number(),
  vega: z.number(),
  theta: z.number(),
  rho: z.number(),
  theo: z.number().nonnegative(),
  change: z.number(),
  open: z.number().nonnegative(),
  high: z.number().nonnegative(),
  low: z.number().nonnegative(),
  tick: TickStatus,
  last_trade_price: z.number().nonnegative(),
  last_trade_time: z.iso.datetime({ local: true }).nullable(),
  percent_change: z.number(),
  prev_day_close: z.number().nonnegative(),
});

const TickerDataSchema = z.object({
  options: z.array(OptionDataSchema),
  symbol: z.string().uppercase(),
  security_type: SecurityType,
  exchange_id: z.int().nonnegative(),
  current_price: z.number().nonnegative(),
  price_change: z.number(),
  price_change_percent: z.number(),
  bid: z.number().nonnegative(),
  ask: z.number().nonnegative(),
  bid_size: z.int().nonnegative(),
  ask_size: z.int().nonnegative(),
  open: z.number().nonnegative(),
  high: z.number().nonnegative(),
  low: z.number().nonnegative(),
  close: z.number().nonnegative(),
  prev_day_close: z.number().nonnegative(),
  volume: z.int().nonnegative(),
  iv30: z.number().nonnegative(),
  iv30_change: z.number(),
  iv30_change_percent: z.number(),
  seqno: z.int().nonnegative(),
  last_trade_time: z.iso.datetime({ local: true }),
  tick: TickStatus,
});

export const OptionDataResponseSchema = z.object({
  timestamp: z.string(),
  data: TickerDataSchema,
  symbol: z.string().uppercase(),
});

export type OptionDataResponse = z.infer<typeof OptionDataResponseSchema>;
