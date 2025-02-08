import { FunctionComponent } from "react"

import "./advancedMarker.css"
import { Flex, Progress, Text } from "@chakra-ui/react"

interface Props {
  property_type?: string
  property_address?: string
  property_bedrooms?: number
  property_bathrooms?: number
  property_square_feet?: string
  property_lot_size?: string
  property_price?: string
  property_year_built?: number
  property_adjective?: string
  property_material?: string
  property_garage?: false
  property_features?: string[]
  property_accessibility?: string
  property_eco_features?: string
  property_has_view?: false
  local_amenities?: string
  transport_access?: string
  ambiance?: string
  latitude?: number
  longitude?: number
  img_weather?: string
  listing_title?: string
  listing_description?: string
  img_prompt_front?: string
  img_prompt_back?: string
  img_prompt_bedroom?: string
}

export const RealEstateListingDetails: FunctionComponent<Props> = (
  {
    // property_address,
    // property_price,
    // listing_title,
    // property_bedrooms,
    // property_bathrooms,
    // property_square_feet,
    // listing_description,
  },
) => {
  return (
    <div className="details-container">
      <Flex direction={"column"} gap={1} m={2}>
        <Text as="h3" textStyle="h3">
          테스트 드론 A
        </Text>
        <Text as="h4" textStyle="h4">
          - 위도(latitude): 36.7881
        </Text>
        <Text as="h4" textStyle="h4">
          - 경도(longitude): 126.4664
        </Text>
        <Text as="h4" textStyle="h4">
          - 배터리
        </Text>
        <Progress value={20} size="lg" w="80%" colorScheme="pink" />
      </Flex>
      {/* <div className="listing-content">
        <p>{property_address}</p>
        <div className="details">
          <div className="detail_item">
            <FaPlus /> {property_square_feet.replace("sq ft", "ft²")}
          </div>
          <div className="detail_item">
            <FaAirbnb /> {property_bedrooms}
          </div>
          <div className="detail_item">
            <FaAmazon /> {property_bathrooms}
          </div>
        </div>

        <p className="description">{listing_description}</p>

        <p className="price">{property_price}</p>
      </div> */}
    </div>
  )
}
