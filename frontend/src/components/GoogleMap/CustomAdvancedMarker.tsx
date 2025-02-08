import { useState } from "react"
import { AdvancedMarker } from "@vis.gl/react-google-maps"

import { RealEstateListingDetails } from "./RealEstateListingDetails"
import { RealEstateGallery } from "./RealEstateGallery"

import { TbDrone } from "react-icons/tb"

import "./advancedMarker.css"

export interface CustomAdvancedMarkerProps {
  uuid: string
  position: MarkerDetails
  thumbnails?: string[]
}

interface MarkerDetails {
  lat: number
  lng: number
}

const IMAGES = [
  "https://images.unsplash.com/photo-1611878583599-5a1ba474063b?w=1200&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fGRyb25lc3xlbnwwfHwwfHx8MA%3D%3D",
  "https://plus.unsplash.com/premium_photo-1664475382326-3dc5510e4ff9?w=1000&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8ZHJvbmVzfGVufDB8fDB8fHww",
]

export const CustomAdvancedMarker = ({
  uuid,
  position,
  thumbnails,
}: CustomAdvancedMarkerProps) => {
  const [clicked, setClicked] = useState(false)
  const [hovered, setHovered] = useState(false)
  console.log("zzuuid", uuid)

  const renderCustomPin = () => {
    return (
      <>
        <div className="custom-pin">
          <button className="close-button">
            <span className="material-symbols-outlined"> close </span>
          </button>

          <div className="image-container">
            <RealEstateGallery
              images={thumbnails ?? IMAGES}
              isExtended={clicked}
            />
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
