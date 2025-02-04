import { useQuery } from "@tanstack/react-query"
import { GeomagnaticApi } from "../client/external/geomagnatic.ts"

export const useGeomagnaticData = () => {
  return useQuery({
    queryKey: ["geomagnaticData"],
    queryFn: () => GeomagnaticApi.getData(),
  })
}
