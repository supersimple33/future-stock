import { type OptionDataResponse, OptionDataResponseSchema } from "./models";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const ENDPOINT = "/api/stock/global/delayed_quotes/options";

export async function fetchOptionsData(
  symbol: string,
): Promise<OptionDataResponse> {
  const upperSymbol = symbol.toUpperCase().trim();
  const url = `${BASE_URL}${ENDPOINT}/${upperSymbol}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch options data for ${upperSymbol}`);
  }
  const rawData = await response.json();

  return OptionDataResponseSchema.parse(rawData);
}
