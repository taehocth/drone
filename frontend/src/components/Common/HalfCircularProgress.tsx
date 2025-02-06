import { CircularProgress, Box, Text } from "@chakra-ui/react"
import { getStageColor } from "../../utils"

function HalfCircularProgress({
  value,
  label,
}: {
  value: number
  label: string | number
}) {
  const clampedValue = Math.min(Math.max(value, 0), 100) / 2
  const stageColor = getStageColor(clampedValue)

  return (
    <Box width="200px" height="100px" overflow="hidden" position="relative">
      <CircularProgress
        value={clampedValue}
        size="200px"
        thickness="12px"
        color={stageColor}
        transform="rotate(-90deg)"
      />
      <Text
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, 30%)"
        fontSize="2xl"
      >
        {label}
      </Text>
    </Box>
  )
}

export default HalfCircularProgress
