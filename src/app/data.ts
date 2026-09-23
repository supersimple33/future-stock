import { type OptionDataResponse, OptionDataResponseSchema } from "./models";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function fetchOptionsData(
  symbol: string,
): Promise<OptionDataResponse> {
  const upperSymbol = symbol.toUpperCase().trim();
  const url = `${API_URL}/cboe/options/${upperSymbol}.json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch options data for ${upperSymbol}`);
  }
  const rawData = await response.json();

  return OptionDataResponseSchema.parse(rawData);
}
