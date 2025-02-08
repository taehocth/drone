// import { useState, FunctionComponent, MouseEvent } from "react"
import { FunctionComponent } from "react"

import "./advancedMarker.css"

interface Props {
  images: string[]
  isExtended: boolean
}

export const RealEstateGallery: FunctionComponent<Props> = ({
  images,
  isExtended = false,
}) => {
  // const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // const handleBack = (event: MouseEvent<HTMLButtonElement>) => {
  //   event.stopPropagation()
  //   if (currentImageIndex > 0) {
  //     setCurrentImageIndex(currentImageIndex - 1)
  //   }
  // }

  // const handleNext = (event: MouseEvent<HTMLButtonElement>) => {
  //   event.stopPropagation()
  //   if (currentImageIndex < images.length - 1) {
  //     setCurrentImageIndex(currentImageIndex + 1)
  //   }
  // }

  return (
    <div className={`photo-gallery ${isExtended ? "extended" : ""}`}>
      {/* <svg width="100%" height="100%" style={{ position: "absolute" }}>
        <rect width="100%" height="100%" fill="white" />
      </svg> */}
      <img src={images[0]} alt="Real estate listing photo" />

      <div className="gallery-navigation">
        {/* <div className="nav-buttons">
          <button onClick={handleBack} disabled={currentImageIndex === 0}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            onClick={handleNext}
            disabled={currentImageIndex === images.length - 1}
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div className="indicators">
          {images.map((_, index) => (
            <span
              key={index}
              className={`dot ${index === currentImageIndex ? "active" : ""}`}
            ></span>
          ))}
        </div> */}
      </div>
    </div>
  )
}
