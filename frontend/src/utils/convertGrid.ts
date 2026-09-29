/**
 * 기상청 동네예보 격자(nx, ny) ↔ 위경도 변환 (Lambert Conformal Conic)
 *   convertGRID_GPS("toXY", lat, lon) → { nx, ny, lat, lng }
 *   convertGRID_GPS("toLL", nx, ny)   → { nx, ny, lat, lng }   ← 격자 중심 좌표 (역변환)
 * 기상청 공개 변환 공식과 동일 (RE=6371.00877, GRID=5.0, SLAT1=30, SLAT2=60, OLON=126, OLAT=38, XO=43, YO=136)
 */
export function convertGRID_GPS(mode: "toXY", lat_X: number, lon_Y: number): { nx: number; ny: number; lat: number; lng: number }
export function convertGRID_GPS(mode: "toLL", nx: number, ny: number): { nx: number; ny: number; lat: number; lng: number }
export function convertGRID_GPS(mode: "toXY" | "toLL", v1: number, v2: number) {
  const RE = 6371.00877
  const GRID = 5.0
  const SLAT1 = 30.0
  const SLAT2 = 60.0
  const OLON = 126.0
  const OLAT = 38.0
  const XO = 43
  const YO = 136

  const DEGRAD = Math.PI / 180.0
  const RADDEG = 180.0 / Math.PI

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  if (mode === "toXY") {
    const lat = v1
    const lng = v2
    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
    ra = (re * sf) / Math.pow(ra, sn)
    let theta = lng * DEGRAD - olon
    if (theta > Math.PI) theta -= 2.0 * Math.PI
    if (theta < -Math.PI) theta += 2.0 * Math.PI
    theta *= sn
    const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
    const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
    return { nx, ny, lat, lng }
  }

  // toLL — 격자 → 위경도 (격자 셀 중심)
  const nx = v1
  const ny = v2
  const xn = nx - XO
  const yn = ro - ny + YO
  let ra = Math.sqrt(xn * xn + yn * yn)
  if (sn < 0.0) ra = -ra
  let alat = Math.pow((re * sf) / ra, 1.0 / sn)
  alat = 2.0 * Math.atan(alat) - Math.PI * 0.5

  let theta: number
  if (Math.abs(xn) <= 0.0) {
    theta = 0.0
  } else if (Math.abs(yn) <= 0.0) {
    theta = Math.PI * 0.5
    if (xn < 0.0) theta = -theta
  } else {
    theta = Math.atan2(xn, yn)
  }
  const alon = theta / sn + olon
  return { nx, ny, lat: alat * RADDEG, lng: alon * RADDEG }
}