// ✅ frontend/src/utils/convertGrid.ts
export function convertGRID_GPS(mode: "toXY", lat_X: number, lon_Y: number) {
  const RE = 6371.00877 // 지구 반경(km)
  const GRID = 5.0 // 격자 간격(km)
  const SLAT1 = 30.0 // 투영 위도1
  const SLAT2 = 60.0 // 투영 위도2
  const OLON = 126.0 // 기준 경도
  const OLAT = 38.0 // 기준 위도
  const XO = 43 // 기준점 X좌표
  const YO = 136 // 기준점 Y좌표

  const DEGRAD = Math.PI / 180.0
  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn =
    Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(
      Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
        Math.tan(Math.PI * 0.25 + slat1 * 0.5),
    )
  const sf =
    (Math.tan(Math.PI * 0.25 + slat1 * 0.5) ** sn * Math.cos(slat1)) / sn
  const ro = (re * sf) / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn

  const rs: any = {}
  if (mode === "toXY") {
    const ra = (re * sf) / Math.tan(Math.PI * 0.25 + lat_X * DEGRAD * 0.5) ** sn
    let theta = lon_Y * DEGRAD - olon
    if (theta > Math.PI) theta -= 2.0 * Math.PI
    if (theta < -Math.PI) theta += 2.0 * Math.PI
    theta *= sn
    rs.nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
    rs.ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  }
  return rs
}
