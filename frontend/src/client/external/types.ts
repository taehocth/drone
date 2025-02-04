export interface GeomagnaticDataResponse {
  error: boolean
  errorCode: string
  kindex: KindexData
}

export interface KindexData {
  time: string
  currentP: number
  currentK: number
  max24P: number
  max24K: number
  recent: KindexRecentData[]
}

export interface KindexRecentData {
  time: string
  kp: number
  kk: number
}
