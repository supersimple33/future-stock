import type { OptionDataResponse } from "./models"; // your zod schema

// --- 1. Math Helpers: Normal CDF & Black-Scholes ---

function normCdf(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const erf =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

function blackScholesCall(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, S - K);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

// --- 2. Natural Cubic Spline for IV Smoothing ---

class NaturalCubicSpline {
  private x: number[];
  private a: number[];
  private b: number[];
  private c: number[];
  private d: number[];

  constructor(x: number[], y: number[]) {
    this.x = [...x];
    this.a = [...y];
    const n = x.length - 1;
    const h = new Array(n);
    for (let i = 0; i < n; i++) h[i] = x[i + 1] - x[i];

    const alpha = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      alpha[i] =
        (3 / h[i]) * (this.a[i + 1] - this.a[i]) -
        (3 / h[i - 1]) * (this.a[i] - this.a[i - 1]);
    }

    const l = new Array(n + 1).fill(1);
    const mu = new Array(n + 1).fill(0);
    const z = new Array(n + 1).fill(0);
    this.c = new Array(n + 1).fill(0);
    this.b = new Array(n).fill(0);
    this.d = new Array(n).fill(0);

    for (let i = 1; i < n; i++) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    for (let j = n - 1; j >= 0; j--) {
      this.c[j] = z[j] - mu[j] * this.c[j + 1];
      this.b[j] =
        (this.a[j + 1] - this.a[j]) / h[j] -
        (h[j] * (this.c[j + 1] + 2 * this.c[j])) / 3;
      this.d[j] = (this.c[j + 1] - this.c[j]) / (3 * h[j]);
    }
  }

  evaluate(val: number): number {
    const n = this.x.length;
    if (val <= this.x[0]) return this.a[0];
    if (val >= this.x[n - 1]) return this.a[n - 1];

    let i = 0;
    while (i < n - 1 && val > this.x[i + 1]) i++;
    const dx = val - this.x[i];
    return (
      this.a[i] +
      this.b[i] * dx +
      this.c[i] * dx * dx +
      this.d[i] * dx * dx * dx
    );
  }
}

// --- 3. Density Construction Engine ---

export interface DensityPoint {
  strike: number;
  qDensity: number; // Risk-Neutral (Q)
  pDensity: number; // Real-World / Physical (P)
}

export interface PdfResult {
  spotPrice: number;
  expiry: string;
  timeToExpiry: number;
  distribution: DensityPoint[];
}

// Parses OCC symbol: TICKER + YYMMDD + [C|P] + STRIKE*1000
const OCC_REGEX = /^([A-Z\s]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function generatePricePdf(
  payload: OptionDataResponse,
  targetExpiry: string, // format: "YYYY-MM-DD"
  options: {
    riskFreeRate?: number; // r: e.g., 0.045 (4.5%)
    riskAversion?: number; // gamma: 0 = risk-neutral, 2-4 = empirical market average
    gridPoints?: number; // Evaluation resolution
  } = {},
): PdfResult {
  const {
    riskFreeRate = 0.045,
    riskAversion = 2.5,
    gridPoints = 400,
  } = options;
  const spot = payload.data.current_price;

  // 1. Calculate Time to Expiration (T in years)
  const quoteDate = new Date(payload.timestamp);
  const expiryDate = new Date(`${targetExpiry}T20:00:00Z`); // ~market close UTC
  const diffDays = Math.max(
    1,
    (expiryDate.getTime() - quoteDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const T = diffDays / 365.25;

  // 2. Parse, filter, and extract calls for the selected expiry
  const validContracts: { strike: number; iv: number }[] = [];

  for (const opt of payload.data.options) {
    const match = opt.option.match(OCC_REGEX);
    if (!match) continue;

    const [, , yy, mm, dd, _side, strikeStr] = match;
    const optExpiry = `20${yy}-${mm}-${dd}`;
    if (optExpiry !== targetExpiry) continue;

    const strike = parseInt(strikeStr, 10) / 1000;

    // Filter liquid, reliable strikes: has positive IV, positive bid, and reasonable strike band
    if (
      opt.iv > 0.01 &&
      opt.bid > 0 &&
      strike >= spot * 0.5 &&
      strike <= spot * 1.6
    ) {
      validContracts.push({ strike, iv: opt.iv });
    }
  }

  // Deduplicate and sort by strike
  const sorted = Array.from(
    new Map(validContracts.map((c) => [c.strike, c.iv])).entries(),
  )
    .map(([strike, iv]) => ({ strike, iv }))
    .sort((a, b) => a.strike - b.strike);

  if (sorted.length < 5) {
    throw new Error(
      `Insufficient strikes (${sorted.length}) to interpolate an implied volatility curve.`,
    );
  }

  // 3. Fit Natural Cubic Spline to the Volatility Smile
  const strikes = sorted.map((s) => s.strike);
  const ivs = sorted.map((s) => s.iv);
  const ivSpline = new NaturalCubicSpline(strikes, ivs);

  // 4. Generate dense grid and reprice calls via Black-Scholes
  const minK = strikes[0];
  const maxK = strikes[strikes.length - 1];
  const step = (maxK - minK) / (gridPoints - 1);

  const kGrid = new Float64Array(gridPoints);
  const cGrid = new Float64Array(gridPoints);

  for (let i = 0; i < gridPoints; i++) {
    const k = minK + i * step;
    const smoothedIv = Math.max(0.02, Math.min(3.0, ivSpline.evaluate(k)));
    kGrid[i] = k;
    cGrid[i] = blackScholesCall(spot, k, T, riskFreeRate, smoothedIv);
  }

  // 5. Breeden-Litzenberger Numerical Second Derivative (Q-Density)
  const discountFactor = Math.exp(riskFreeRate * T);
  const rawQ = new Float64Array(gridPoints);

  for (let i = 1; i < gridPoints - 1; i++) {
    // Second central difference: (C[i+1] - 2*C[i] + C[i-1]) / deltaK^2
    const d2C = (cGrid[i + 1] - 2 * cGrid[i] + cGrid[i - 1]) / (step * step);
    rawQ[i] = Math.max(0, discountFactor * d2C);
  }
  rawQ[0] = rawQ[1];
  rawQ[gridPoints - 1] = rawQ[gridPoints - 2];

  // 6. Compute Physical P-Density via CRRA Pricing Kernel: p(K) = q(K) * K^gamma
  const rawP = new Float64Array(gridPoints);
  for (let i = 0; i < gridPoints; i++) {
    rawP[i] = rawQ[i] * kGrid[i] ** riskAversion;
  }

  // 7. Normalize both densities so integral == 1 (Trapezoidal Rule)
  let qSum = 0;
  let pSum = 0;
  for (let i = 0; i < gridPoints - 1; i++) {
    qSum += 0.5 * (rawQ[i] + rawQ[i + 1]) * step;
    pSum += 0.5 * (rawP[i] + rawP[i + 1]) * step;
  }

  const distribution: DensityPoint[] = [];
  for (let i = 0; i < gridPoints; i++) {
    distribution.push({
      strike: Number(kGrid[i].toFixed(2)),
      qDensity: qSum > 0 ? rawQ[i] / qSum : 0,
      pDensity: pSum > 0 ? rawP[i] / pSum : 0,
    });
  }

  return {
    spotPrice: spot,
    expiry: targetExpiry,
    timeToExpiry: T,
    distribution,
  };
}
