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

// --- 2. Adaptive Volatility Smoothing Engine ---

/**
 * Evaluates implied volatility using a Gaussian kernel smoother over strike prices.
 * Unlike an interpolating cubic spline, kernel smoothing avoids high-frequency
 * oscillations in the second derivative (which cause butterfly arbitrage violations
 * and jagged zero-clamping in Breeden-Litzenberger density extraction).
 */
function evaluateSmoothedIv(
  targetStrike: number,
  strikes: number[],
  ivs: number[],
  bandwidth: number,
): number {
  let sumWeight = 0;
  let sumWeightedIv = 0;

  for (let i = 0; i < strikes.length; i++) {
    const d = (targetStrike - strikes[i]) / bandwidth;
    // Gaussian kernel weight
    const weight = Math.exp(-0.5 * d * d);
    sumWeight += weight;
    sumWeightedIv += weight * ivs[i];
  }

  if (sumWeight <= 0) return ivs[0];
  const smoothed = sumWeightedIv / sumWeight;
  // Floor and cap IV to reasonable boundaries
  return Math.max(0.05, Math.min(3.0, smoothed));
}

/**
 * 5-point discrete Gaussian smoothing filter to clean finite-difference noise.
 */
function applyDensitySmoothing(data: Float64Array): Float64Array {
  const n = data.length;
  const smoothed = new Float64Array(n);
  // Normalized 5-tap Gaussian weights (sigma ~= 1.0)
  const weights = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136];
  const half = 2;

  for (let i = 0; i < n; i++) {
    let wSum = 0;
    let valSum = 0;

    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < n) {
        const w = weights[j + half];
        wSum += w;
        valSum += w * data[idx];
      }
    }

    smoothed[i] = wSum > 0 ? Math.max(0, valSum / wSum) : data[i];
  }

  return smoothed;
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
  expectedQ: number; // Risk-Neutral Expected Value: E^Q[S_T]
  expectedP: number; // Physical Expected Value: E^P[S_T]
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
    gridPoints = 250,
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

  // 2. Parse and filter options: prioritize liquid Out-Of-The-Money (OTM) contracts
  // OTM Puts for K < spot, OTM Calls for K >= spot have the highest open interest
  // and cleanest IV quotes, eliminating noise from wide ITM spreads.
  type ContractCandidate = {
    strike: number;
    iv: number;
    isOtm: boolean;
    oi: number;
  };

  const strikeMap = new Map<number, ContractCandidate>();

  for (const opt of payload.data.options) {
    const match = opt.option.match(OCC_REGEX);
    if (!match) continue;

    const [, , yy, mm, dd, side, strikeStr] = match;
    const optExpiry = `20${yy}-${mm}-${dd}`;
    if (optExpiry !== targetExpiry) continue;

    const strike = parseInt(strikeStr, 10) / 1000;

    // Strike band: focus on liquid range around spot (40% to 180%)
    if (strike < spot * 0.4 || strike > spot * 1.8) continue;
    if (opt.iv <= 0.01 || opt.bid <= 0) continue;

    const isOtm =
      (strike < spot && side === "P") || (strike >= spot && side === "C");
    const candidate: ContractCandidate = {
      strike,
      iv: opt.iv,
      isOtm,
      oi: opt.open_interest,
    };

    const existing = strikeMap.get(strike);
    if (!existing) {
      strikeMap.set(strike, candidate);
    } else {
      // Prioritize OTM contract; if both or neither are OTM, choose higher open interest
      if (!existing.isOtm && isOtm) {
        strikeMap.set(strike, candidate);
      } else if (existing.isOtm === isOtm && candidate.oi > existing.oi) {
        strikeMap.set(strike, candidate);
      }
    }
  }

  const sorted = Array.from(strikeMap.values()).sort(
    (a, b) => a.strike - b.strike,
  );

  if (sorted.length < 5) {
    throw new Error(
      `Insufficient valid strikes (${sorted.length}) for expiry ${targetExpiry}.`,
    );
  }

  const strikes = sorted.map((s) => s.strike);
  const ivs = sorted.map((s) => s.iv);

  // Bandwidth for Gaussian kernel: proportional to spot (~5-7% of spot)
  const bandwidth = Math.max(2, spot * 0.06);

  // 3. Generate dense grid and reprice calls via Black-Scholes
  const minK = strikes[0];
  const maxK = strikes[strikes.length - 1];
  const step = (maxK - minK) / (gridPoints - 1);

  const kGrid = new Float64Array(gridPoints);
  const cGrid = new Float64Array(gridPoints);

  for (let i = 0; i < gridPoints; i++) {
    const k = minK + i * step;
    const smoothedIv = evaluateSmoothedIv(k, strikes, ivs, bandwidth);
    kGrid[i] = k;
    cGrid[i] = blackScholesCall(spot, k, T, riskFreeRate, smoothedIv);
  }

  // 4. Breeden-Litzenberger Numerical Second Derivative (Q-Density)
  const discountFactor = Math.exp(riskFreeRate * T);
  const rawQ = new Float64Array(gridPoints);

  for (let i = 1; i < gridPoints - 1; i++) {
    const d2C = (cGrid[i + 1] - 2 * cGrid[i] + cGrid[i - 1]) / (step * step);
    rawQ[i] = Math.max(0, discountFactor * d2C);
  }
  rawQ[0] = rawQ[1];
  rawQ[gridPoints - 1] = rawQ[gridPoints - 2];

  // Apply smoothing filter to eliminate any discrete differentiation noise
  const cleanQ = applyDensitySmoothing(rawQ);

  // 5. Compute Physical P-Density via CRRA Pricing Kernel: p(K) = q(K) * (K / spot)^gamma
  const rawP = new Float64Array(gridPoints);
  for (let i = 0; i < gridPoints; i++) {
    rawP[i] = cleanQ[i] * (kGrid[i] / spot) ** riskAversion;
  }
  const cleanP = applyDensitySmoothing(rawP);

  // 6. Normalize both densities so integral == 1 and compute expected values (Trapezoidal Rule)
  let qSum = 0;
  let pSum = 0;
  for (let i = 0; i < gridPoints - 1; i++) {
    qSum += 0.5 * (cleanQ[i] + cleanQ[i + 1]) * step;
    pSum += 0.5 * (cleanP[i] + cleanP[i + 1]) * step;
  }

  const distribution: DensityPoint[] = [];
  for (let i = 0; i < gridPoints; i++) {
    distribution.push({
      strike: Number(kGrid[i].toFixed(2)),
      qDensity: qSum > 0 ? cleanQ[i] / qSum : 0,
      pDensity: pSum > 0 ? cleanP[i] / pSum : 0,
    });
  }

  // Calculate Expected Values: E[S_T] = integral(K * f(K) dK)
  let expectedQ = 0;
  let expectedP = 0;
  for (let i = 0; i < gridPoints - 1; i++) {
    const k0 = kGrid[i];
    const k1 = kGrid[i + 1];
    const q0 = distribution[i].qDensity;
    const q1 = distribution[i + 1].qDensity;
    const p0 = distribution[i].pDensity;
    const p1 = distribution[i + 1].pDensity;

    expectedQ += 0.5 * (k0 * q0 + k1 * q1) * step;
    expectedP += 0.5 * (k0 * p0 + k1 * p1) * step;
  }

  return {
    spotPrice: spot,
    expiry: targetExpiry,
    timeToExpiry: T,
    distribution,
    expectedQ: Number(expectedQ.toFixed(2)),
    expectedP: Number(expectedP.toFixed(2)),
  };
}
