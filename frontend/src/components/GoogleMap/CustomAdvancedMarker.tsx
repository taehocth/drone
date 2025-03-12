import { useState } from "react"
import { AdvancedMarker } from "@vis.gl/react-google-maps"

import { RealEstateListingDetails } from "./RealEstateListingDetails"
import { RealEstateGallery } from "./RealEstateGallery"

import { TbDrone } from "react-icons/tb"

import "./advancedMarker.css"

export interface CustomAdvancedMarkerProps {
  position: MarkerDetails
  thumbnails?: string[]
}

interface MarkerDetails {
  lat: number
  lng: number
}

export const CustomAdvancedMarker = ({
  position,
}: CustomAdvancedMarkerProps) => {
  const [clicked, setClicked] = useState(false)
  const [hovered, setHovered] = useState(false)

  const renderCustomPin = () => {
    return (
      <>
        <div className="custom-pin">
          <button className="close-button">
            <span className="material-symbols-outlined"> close </span>
          </button>

          <div className="image-container">
            <RealEstateGallery isExtended={clicked} />
            <span className="icon">
              <TbDrone size={20} />
            </span>
          </div>

          <RealEstateListingDetails
            property_address={"1234 Main St, San Francisco, CA"}
            property_price={"$1,000,000"}
            listing_title={"Beautiful Home in San Francisco"}
            property_bedrooms={3}
            property_bathrooms={2}
            property_square_feet={"1,500 sq ft"}
            listing_description={
              "This is a beautiful home in San Francisco, CA. It has 3 bedrooms, 2 bathrooms, and 1,500 sq ft of living space."
            }
          />
        </div>

        <div className="tip" />
      </>
    )
  }

  return (
    <>
      <AdvancedMarker
        position={position}
        title={"AdvancedMarker with custom html content."}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`real-estate-marker ${clicked ? "clicked" : ""} ${hovered ? "hovered" : ""}`}
        onClick={() => setClicked(!clicked)}
      >
        {renderCustomPin()}
      </AdvancedMarker>
    </>
  )
}
