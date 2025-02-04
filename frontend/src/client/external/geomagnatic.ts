import axios from "axios"
import { GeomagnaticDataResponse } from "./types"

// geomagnatic 전용 axios 인스턴스 생성
const geomagnaticApiClient = axios.create({
  baseURL: import.meta.env.VITE_GEOMAGNETIC_API_URL,
})

export const GeomagnaticApi = {
  async getData(): Promise<GeomagnaticDataResponse> {
    const response = await geomagnaticApiClient.get("/kindex")
    return response.data
  },
}
