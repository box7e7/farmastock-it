// Parses what a pharmacy scanner can return:
//  - GS1 Data Matrix (FMD): raw with GS (\x1d) separators, or human-readable "(01)...(17)...(10)...(21)..."
//  - Italian "bollino ottico" code: "A" + 9-digit AIC, or bare 9-digit AIC
//  - EAN-13 / GTIN-14 barcodes

export interface ScanResult {
  kind: "DATAMATRIX" | "AIC" | "EAN" | "UNKNOWN";
  gtin?: string;
  aic?: string;
  lot?: string;
  expiry?: string; // ISO date yyyy-mm-dd
  serial?: string;
  raw: string;
}

const GS = "\x1d";
const FIXED: Record<string, number> = { "01": 14, "17": 6, "11": 6, "15": 6 };

function yymmddToIso(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const y = 2000 + Number(v.slice(0, 2));
  const m = Number(v.slice(2, 4));
  let d = Number(v.slice(4, 6));
  if (m < 1 || m > 12) return undefined;
  // GS1: day "00" means last day of the month
  if (d === 0) d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Italian NTIN built from AIC is assumed to carry the 9-digit AIC before the check digit.
export function aicFromGtin(gtin: string): string | undefined {
  return gtin.length === 14 ? gtin.slice(4, 13) : undefined;
}

function parseAis(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.startsWith("(")) {
    for (const m of input.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = m[2].trim();
    return out;
  }
  let s = input.replace(/^\]d2/, "").replace(/^\x1d/, "");
  while (s.length >= 2) {
    const ai = s.slice(0, 2);
    s = s.slice(2);
    if (FIXED[ai]) {
      out[ai] = s.slice(0, FIXED[ai]);
      s = s.slice(FIXED[ai]);
    } else {
      const end = s.indexOf(GS);
      out[ai] = end === -1 ? s : s.slice(0, end);
      s = end === -1 ? "" : s.slice(end + 1);
    }
    if (s.startsWith(GS)) s = s.slice(1);
  }
  return out;
}

export function parseScan(input: string): ScanResult {
  const raw = input.trim();
  if (/^A?\d{9}$/.test(raw)) return { kind: "AIC", aic: raw.replace(/^A/, ""), raw };
  if (/^\d{13}$/.test(raw)) return { kind: "EAN", gtin: raw, raw };
  const isDm = raw.startsWith("(01)") || raw.startsWith("]d2") || (raw.startsWith("01") && raw.length > 16);
  if (isDm) {
    const ais = parseAis(raw);
    if (ais["01"]) {
      return {
        kind: "DATAMATRIX",
        gtin: ais["01"],
        aic: aicFromGtin(ais["01"]),
        lot: ais["10"],
        expiry: ais["17"] ? yymmddToIso(ais["17"]) : undefined,
        serial: ais["21"],
        raw,
      };
    }
  }
  if (/^\d{14}$/.test(raw)) return { kind: "EAN", gtin: raw, aic: aicFromGtin(raw), raw };
  return { kind: "UNKNOWN", raw };
}
