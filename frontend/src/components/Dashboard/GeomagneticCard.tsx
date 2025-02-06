import { Box, Flex, Icon, Text } from "@chakra-ui/react"
import HalfCircularProgress from "../Common/HalfCircularProgress"
import { FaRegQuestionCircle } from "react-icons/fa"
import { FiClock } from "react-icons/fi"

interface GeomagneticCardProps {
  currentK: number
  currentP: number
  measuredTime: Date | string
}

export const GeomagneticCard = ({
  currentK,
  currentP,
  measuredTime,
}: GeomagneticCardProps) => {
  return (
    <Box
      p={4}
      pb={2}
      m={2}
      w={"fit-content"}
      border="1px"
      borderColor="gray.200"
      borderRadius={8}
      shadow="md"
    >
      <Flex justify="space-between" gap={4}>
        <Box>
          <Flex align="center" gap={1}>
            <Text as="h3" textStyle="h3">
              Kp 지수
            </Text>
            <Icon as={FaRegQuestionCircle} boxSize={3} cursor="pointer" />
          </Flex>
          <Text fontSize="xs" color="gray.500">
            미국 관측소 데이터
          </Text>
          <HalfCircularProgress value={currentK * 10} label={currentK} />
        </Box>
        <Box>
          <Flex align="center" gap={1}>
            <Text as="h3" textStyle="h3">
              Kk 지수
            </Text>
            <Icon as={FaRegQuestionCircle} boxSize={3} cursor="pointer" />
          </Flex>
          <Text fontSize="xs" color="gray.500">
            국내 3개 관측소의 데이터
          </Text>
          <HalfCircularProgress value={currentP * 10} label={currentP} />
        </Box>
      </Flex>
      <Flex mt={4} justify={"end"} align={"center"} gap={1}>
        <Icon as={FiClock} boxSize={3} />
        <Text fontSize={"x-small"}>{measuredTime.toLocaleString()}</Text>
      </Flex>
    </Box>
  )
}
