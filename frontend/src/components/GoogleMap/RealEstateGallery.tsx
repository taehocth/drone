// import { useState, FunctionComponent, MouseEvent } from "react"
import type { FunctionComponent } from "react"

import "./advancedMarker.css"

interface Props {
  isExtended: boolean
}

export const RealEstateGallery: FunctionComponent<Props> = ({
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
    <div
      className={`photo-gallery border-black ${isExtended ? "extended" : ""}`}
    >
      {/* <svg width="100%" height="100%" style={{ position: "absolute" }}>
        <rect width="100%" height="100%" fill="white" />
      </svg> */}
      {/* <img src={images[0]} alt="Real estate listing photo" /> */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 140 140"
        style={{
          width: "100%",
          height: "100%",
          // maxWidth: "140px",
          // backgroundPosition: "50% 50%",
          // backgroundSize: "cover",
          // borderRadius: "inherit",
          // position: "relative",
          // overflow: "hidden",
          // display: "flex",
          // justifyContent: "center",
          // alignItems: "center",
          // transition: "opacity 0.2s ease-in-out",
        }}
        role="img"
        aria-label="부동산 이미지"
      >
        <title>부동산 이미지</title>
        <circle cx="70" cy="70" r="50" fill="#4ADF72" />
      </svg>

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
